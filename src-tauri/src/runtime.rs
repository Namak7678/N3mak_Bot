use crate::vault::{VaultError, VaultManager};
use chrono::{Duration, Utc};
use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use reqwest::Url;
use rusqlite::{params, OptionalExtension};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::time::Duration as StdDuration;
use uuid::Uuid;
use zeroize::Zeroizing;

const WORKFORCE_JSON: &str = include_str!("../../config/workforce.json");
const CAPABILITIES_JSON: &str = include_str!("../../config/capabilities.json");
const PROVIDERS_JSON: &str = include_str!("../../config/providers.json");
const MAX_SECRET_BYTES: usize = 8_192;
const MAX_SKILL_BYTES: usize = 262_144;
const MAX_PROVIDER_RESPONSE_BYTES: usize = 1_048_576;
const STAGE_IDS: [&str; 7] = [
    "plan", "execute", "review", "security", "approval", "release", "complete",
];

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn text(value: &Value, key: &str, fallback: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or(fallback)
        .to_string()
}

fn clean(value: &str, maximum: usize) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(maximum).collect()
}

fn invalid(message: impl Into<String>) -> VaultError {
    VaultError::InvalidInput(message.into())
}

fn parse_embedded(source: &str, label: &str) -> Result<Value, VaultError> {
    serde_json::from_str(source).map_err(|error| invalid(format!("invalid embedded {label}: {error}")))
}

fn merge_object(target: &mut Value, update: &Value) {
    if let (Some(target), Some(update)) = (target.as_object_mut(), update.as_object()) {
        for (key, value) in update {
            target.insert(key.clone(), value.clone());
        }
    }
}

fn is_static_task(task_id: &str) -> Result<bool, VaultError> {
    let workforce = parse_embedded(WORKFORCE_JSON, "workforce registry")?;
    Ok(workforce["tasks"]
        .as_array()
        .map(|tasks| tasks.iter().any(|task| task["id"] == task_id))
        .unwrap_or(false))
}

fn agent_name(workforce: &Value, agent_id: &str) -> String {
    workforce["agents"]
        .as_array()
        .and_then(|agents| agents.iter().find(|agent| agent["id"] == agent_id))
        .and_then(|agent| agent["name"].as_str())
        .unwrap_or(agent_id)
        .to_string()
}

fn requires_approval(command: &str) -> bool {
    let normalized = command.to_lowercase();
    [
        "احذف",
        "حذف البيانات",
        "delete data",
        "تحويل أموال",
        "حوّل أموال",
        "دفع أموال",
        "انشر مباشرة",
        "نشر عالي الخطورة",
        "نشر إلى الإنتاج",
        "deploy production",
        "production deploy",
        "صلاحيات أمنية حرجة",
        "انشر مفتاح",
        "publish secret",
        "تعاقد",
        "عقد قانوني",
        "بيانات حساسة",
    ]
    .iter()
    .any(|term| normalized.contains(term))
}

fn route_owner(command: &str) -> &'static str {
    let normalized = command.to_lowercase();
    let routes: [(&str, &[&str]); 9] = [
        ("sentinel", &["أمن", "أمني", "ثغرة", "أسرار", "صلاحيات", "security"]),
        ("forge", &["كود", "تطوير", "اختبار", "واجهة", "api", "database", "github", "pipeline"]),
        ("nova", &["تسويق", "حملة", "محتوى", "linkedin", "علاقات عامة", "مستثمر"]),
        ("pulse", &["أداء", "كفاءة", "تكلفة", "إنتاجية", "kpi"]),
        ("aegis", &["مخاطر", "خطر", "risk", "سياسي", "سلسلة الإمداد"]),
        ("nautilus", &["اقتصاد أزرق", "صيد", "ميناء", "موانئ", "تبريد", "استزراع", "بحري"]),
        ("meridian", &["سوق", "موريتانيا", "مصر", "روسيا", "النرويج", "الصين", "اليابان", "usa", "استثمار"]),
        ("athena", &["اجتماع", "موعد", "موجز", "تقرير يومي", "تقرير أسبوعي", "ذكّر"]),
        ("atlas", &["خطة", "الأسبوع", "مهام", "مشروع", "deadline", "أولوية"]),
    ];
    let mut selected = (0_usize, routes.len(), "atlas");
    for (index, (owner, terms)) in routes.iter().enumerate() {
        let score = terms.iter().filter(|term| normalized.contains(**term)).count();
        if score > selected.0 || (score == selected.0 && score > 0 && index < selected.1) {
            selected = (score, index, owner);
        }
    }
    selected.2
}

fn task_priority(command: &str, approval: bool) -> &'static str {
    let normalized = command.to_lowercase();
    if ["عاجل", "فورًا", "فورا", "حرج", "critical", "urgent"]
        .iter()
        .any(|term| normalized.contains(term))
    {
        "critical"
    } else if approval || ["مهم", "مرتفع", "high"].iter().any(|term| normalized.contains(term)) {
        "high"
    } else {
        "medium"
    }
}

fn stage_progress(stage: &str) -> i64 {
    match stage {
        "plan" => 15,
        "execute" => 55,
        "review" => 80,
        "security" | "approval" => 90,
        "release" => 96,
        "complete" => 100,
        _ => 0,
    }
}

fn new_workflow(task: &Value, fresh: bool) -> Value {
    let executor = text(task, "executor", &text(task, "owner", "atlas"));
    let approval = task["requires_approval"].as_bool().unwrap_or(false)
        || task["priority"] == "critical"
        || task["status"] == "approval";
    let review_owner = if executor == "forge" { "atlas" } else { "forge" };
    let owners = [
        ("plan", "atlas"),
        ("execute", executor.as_str()),
        ("review", review_owner),
        ("security", "sentinel"),
        ("approval", "orion"),
        ("release", executor.as_str()),
        ("complete", "athena"),
    ];
    let labels = [
        ("PLAN", "التخطيط"),
        ("EXECUTE", "تنفيذ معزول"),
        ("REVIEW", "مراجعة مستقلة"),
        ("SECURITY", "بوابة الأمن"),
        ("APPROVAL", "سلطة القائد"),
        ("RELEASE", "إصدار مضبوط"),
        ("COMPLETE", "إغلاق وتقرير"),
    ];
    let mut stages: Vec<Value> = STAGE_IDS
        .iter()
        .enumerate()
        .map(|(index, stage)| {
            json!({
                "id": stage,
                "label": labels[index].0,
                "label_ar": labels[index].1,
                "owner": owners[index].1,
                "status": if *stage == "approval" && !approval { "skipped" } else { "pending" },
                "result": ""
            })
        })
        .collect();
    let mut state = "ready";
    let mut cursor = 0_i64;
    if fresh {
        stages[0]["status"] = json!("ready");
    } else {
        match task["status"].as_str().unwrap_or("queued") {
            "completed" => {
                for stage in &mut stages {
                    if stage["status"] != "skipped" {
                        stage["status"] = json!("done");
                    }
                }
                state = "completed";
                cursor = stages.len() as i64;
            }
            "blocked" => {
                state = "blocked";
                stages[0]["status"] = json!("ready");
            }
            "approval" => {
                for stage in stages.iter_mut().take(4) {
                    stage["status"] = json!("done");
                }
                stages[4]["status"] = json!("waiting");
                state = "waiting_approval";
                cursor = 4;
            }
            "review" => {
                stages[0]["status"] = json!("done");
                stages[1]["status"] = json!("done");
                stages[2]["status"] = json!("ready");
                cursor = 2;
            }
            "in_progress" => {
                stages[0]["status"] = json!("done");
                stages[1]["status"] = json!("ready");
                cursor = 1;
            }
            _ => stages[0]["status"] = json!("ready"),
        }
    }
    json!({
        "task_id": task["id"],
        "state": state,
        "cursor": cursor,
        "stages": stages,
        "policy": {
            "requires_approval": approval,
            "external_effects_enabled": false,
            "execution_scope": "native_local_sandbox",
            "reason": if task["requires_approval"].as_bool().unwrap_or(false) {
                "توجيه سيادي"
            } else if task["priority"] == "critical" {
                "أولوية حرجة"
            } else if task["status"] == "approval" {
                "بوابة موافقة يدوية"
            } else {
                "مسار محلي منخفض الأثر"
            }
        },
        "audit": [],
        "created_at": task.get("created_at").cloned().unwrap_or_else(|| json!(now())),
        "updated_at": now()
    })
}

fn load_task_records(manager: &VaultManager) -> Result<Vec<(Option<String>, Value)>, VaultError> {
    manager.with_connection(|connection| {
        let mut statement = connection.prepare(
            "SELECT source_id, metadata FROM task_records ORDER BY created_at DESC",
        )?;
        let rows = statement.query_map([], |row| {
            let source_id: Option<String> = row.get(0)?;
            let metadata: String = row.get(1)?;
            Ok((source_id, metadata))
        })?;
        let mut records = Vec::new();
        for row in rows {
            let (source_id, metadata) = row?;
            let task = serde_json::from_str(&metadata)
                .map_err(|error| invalid(format!("corrupt encrypted task record: {error}")))?;
            records.push((source_id, task));
        }
        Ok(records)
    })
}

fn load_workflows(manager: &VaultManager) -> Result<HashMap<String, Value>, VaultError> {
    manager.with_connection(|connection| {
        let mut statement = connection.prepare("SELECT task_id, history FROM workflow_records")?;
        let rows = statement.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut workflows = HashMap::new();
        for row in rows {
            let (task_id, serialized) = row?;
            let workflow = serde_json::from_str(&serialized)
                .map_err(|error| invalid(format!("corrupt encrypted workflow: {error}")))?;
            workflows.insert(task_id, workflow);
        }
        Ok(workflows)
    })
}

fn load_activities(manager: &VaultManager) -> Result<Vec<Value>, VaultError> {
    manager.with_connection(|connection| {
        let mut statement = connection.prepare(
            "SELECT event_type, actor, detail, created_at FROM activity_records ORDER BY created_at DESC LIMIT 30",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(json!({
                "type": row.get::<_, String>(0)?,
                "agent": row.get::<_, String>(1)?,
                "text": row.get::<_, String>(2)?,
                "time": "الآن",
                "created_at": row.get::<_, String>(3)?
            }))
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(VaultError::from)
    })
}

fn load_providers(manager: &VaultManager) -> Result<Value, VaultError> {
    let mut catalog = parse_embedded(PROVIDERS_JSON, "provider catalog")?;
    let configs = manager.with_connection(|connection| {
        let mut statement = connection.prepare(
            "SELECT provider_id, enabled, permission_granted, health_verified, rollback_ready,
                    endpoint, model, last_health_at, updated_at,
                    EXISTS(SELECT 1 FROM provider_credentials c WHERE c.provider_id = p.provider_id)
             FROM provider_configs p",
        )?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                json!({
                    "enabled": row.get::<_, i64>(1)? == 1,
                    "permission_granted": row.get::<_, i64>(2)? == 1,
                    "health_verified": row.get::<_, i64>(3)? == 1,
                    "rollback_ready": row.get::<_, i64>(4)? == 1,
                    "endpoint": row.get::<_, String>(5)?,
                    "model": row.get::<_, String>(6)?,
                    "last_health_at": row.get::<_, Option<String>>(7)?,
                    "updated_at": row.get::<_, String>(8)?,
                    "credential_stored": row.get::<_, i64>(9)? == 1,
                    "credential_display": if row.get::<_, i64>(9)? == 1 { "•••••••• · SQLCipher" } else { "غير محفوظ" }
                }),
            ))
        })?;
        rows.collect::<Result<HashMap<_, _>, _>>().map_err(VaultError::from)
    })?;
    if let Some(providers) = catalog["providers"].as_array_mut() {
        for provider in providers {
            let provider_id = text(provider, "id", "");
            if let Some(config) = configs.get(&provider_id) {
                merge_object(provider, config);
                if provider["operational"].as_bool() == Some(false) {
                    provider["enabled"] = json!(false);
                    provider["health_verified"] = json!(false);
                    provider["status"] = json!("adapter_required");
                } else {
                    provider["status"] = json!(if config["enabled"].as_bool().unwrap_or(false) {
                        "enabled"
                    } else if config["health_verified"].as_bool().unwrap_or(false) {
                        "verified"
                    } else if config["credential_stored"].as_bool().unwrap_or(false) {
                        "configured"
                    } else {
                        "unconfigured"
                    });
                }
            } else {
                provider["enabled"] = json!(false);
                provider["permission_granted"] = json!(false);
                provider["health_verified"] = json!(false);
                provider["rollback_ready"] = json!(false);
                provider["credential_stored"] = json!(false);
                provider["credential_display"] = json!("غير محفوظ");
            }
        }
    }
    Ok(catalog)
}

fn load_skills(manager: &VaultManager) -> Result<Vec<Value>, VaultError> {
    manager.with_connection(|connection| {
        let mut statement = connection.prepare(
            "SELECT id, name, version, description, enabled, installed_at, updated_at
             FROM installed_skills ORDER BY installed_at DESC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "version": row.get::<_, String>(2)?,
                "description": row.get::<_, String>(3)?,
                "enabled": row.get::<_, i64>(4)? == 1,
                "installed_at": row.get::<_, String>(5)?,
                "updated_at": row.get::<_, String>(6)?
            }))
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(VaultError::from)
    })
}

fn load_teams(manager: &VaultManager) -> Result<Vec<Value>, VaultError> {
    manager.with_connection(|connection| {
        let mut statement = connection.prepare(
            "SELECT id, name, mission, enabled, created_at, updated_at FROM teams ORDER BY created_at DESC",
        )?;
        let rows = statement.query_map([], |row| {
            let team_id: String = row.get(0)?;
            Ok((
                team_id,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)? == 1,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        })?;
        let mut teams = Vec::new();
        for row in rows {
            let (team_id, name, mission, enabled, created_at, updated_at) = row?;
            let mut member_statement = connection.prepare(
                "SELECT id, member_type, name, role, status FROM team_members WHERE team_id = ?1 ORDER BY created_at",
            )?;
            let members = member_statement
                .query_map(params![team_id], |member| {
                    Ok(json!({
                        "id": member.get::<_, String>(0)?,
                        "member_type": member.get::<_, String>(1)?,
                        "name": member.get::<_, String>(2)?,
                        "role": member.get::<_, String>(3)?,
                        "status": member.get::<_, String>(4)?,
                        "authenticated_pairing": false
                    }))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            teams.push(json!({
                "id": team_id,
                "name": name,
                "mission": mission,
                "enabled": enabled,
                "members": members,
                "created_at": created_at,
                "updated_at": updated_at
            }));
        }
        Ok(teams)
    })
}

fn load_schedules(manager: &VaultManager) -> Result<Vec<Value>, VaultError> {
    manager.with_connection(|connection| {
        let mut statement = connection.prepare(
            "SELECT id, name, goal_template, frequency, enabled, next_run_at, last_run_at,
                    created_at, updated_at
             FROM recurring_workflows ORDER BY created_at DESC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "goal_template": row.get::<_, String>(2)?,
                "frequency": row.get::<_, String>(3)?,
                "enabled": row.get::<_, i64>(4)? == 1,
                "next_run_at": row.get::<_, Option<String>>(5)?,
                "last_run_at": row.get::<_, Option<String>>(6)?,
                "created_at": row.get::<_, String>(7)?,
                "updated_at": row.get::<_, String>(8)?
            }))
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(VaultError::from)
    })
}

fn load_imports(manager: &VaultManager) -> Result<Vec<Value>, VaultError> {
    manager.with_connection(|connection| {
        let mut statement = connection.prepare(
            "SELECT id, source_name, source_kind, summary, created_at
             FROM migration_imports ORDER BY created_at DESC LIMIT 20",
        )?;
        let rows = statement.query_map([], |row| {
            let summary: String = row.get(3)?;
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "source_name": row.get::<_, String>(1)?,
                "source_kind": row.get::<_, String>(2)?,
                "summary": serde_json::from_str::<Value>(&summary).unwrap_or_else(|_| json!({})),
                "created_at": row.get::<_, String>(4)?
            }))
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(VaultError::from)
    })
}

pub fn state(manager: &VaultManager) -> Result<Value, VaultError> {
    let mut state = parse_embedded(WORKFORCE_JSON, "workforce registry")?;
    let capabilities = parse_embedded(CAPABILITIES_JSON, "capability registry")?;
    let task_records = load_task_records(manager)?;
    let workflows = load_workflows(manager)?;

    let mut base_tasks = state["tasks"].as_array().cloned().unwrap_or_default();
    let mut dynamic_tasks = Vec::new();
    for (source_id, task) in task_records {
        if let Some(source_id) = source_id {
            if let Some(base) = base_tasks.iter_mut().find(|base| base["id"] == source_id) {
                merge_object(base, &task);
            }
        } else {
            dynamic_tasks.push(task);
        }
    }
    dynamic_tasks.extend(base_tasks);
    for task in &mut dynamic_tasks {
        let task_id = text(task, "id", "");
        task["workflow"] = workflows
            .get(&task_id)
            .cloned()
            .unwrap_or_else(|| new_workflow(task, false));
    }
    state["tasks"] = json!(dynamic_tasks);

    let mut activities = load_activities(manager)?;
    activities.extend(state["activities"].as_array().cloned().unwrap_or_default());
    activities.truncate(30);
    state["activities"] = json!(activities);

    let tasks = state["tasks"].as_array().cloned().unwrap_or_default();
    if let Some(agents) = state["agents"].as_array_mut() {
        for agent in agents {
            let agent_id = text(agent, "id", "");
            let assigned: Vec<&Value> = tasks
                .iter()
                .filter(|task| task["owner"] == agent_id && task["status"] != "completed")
                .collect();
            let items: Vec<Value> = assigned
                .iter()
                .map(|task| {
                    json!({
                        "id": task["id"],
                        "title": task["title"],
                        "status": task["status"],
                        "priority": task["priority"]
                    })
                })
                .collect();
            let queue = agent["queue"].as_object_mut().get_or_insert_with(Map::new);
            queue.insert("depth".to_string(), json!(assigned.len()));
            queue.insert(
                "active".to_string(),
                json!(assigned
                    .iter()
                    .filter(|task| matches!(task["status"].as_str(), Some("queued" | "in_progress" | "review")))
                    .count()),
            );
            queue.insert(
                "waiting_on_commander".to_string(),
                json!(assigned.iter().filter(|task| task["status"] == "approval").count()),
            );
            queue.insert("items".to_string(), json!(items));
        }
    }

    let mut decisions = Vec::new();
    let mut audit_events = Vec::new();
    for task in &tasks {
        let workflow = &task["workflow"];
        if let Some(audit) = workflow["audit"].as_array() {
            audit_events.extend(audit.clone());
        }
        if workflow["state"] == "waiting_approval" {
            decisions.push(json!({
                "id": format!("DEC-{}", text(task, "id", "AX").trim_start_matches("AX-")),
                "task_id": task["id"],
                "title": task["title"],
                "risk": if workflow["policy"]["requires_approval"].as_bool().unwrap_or(false) { "مرتفع" } else { "متوسط" },
                "requested_by": agent_name(&state, &text(task, "executor", &text(task, "owner", "orion"))),
                "time": "الآن"
            }));
        }
    }
    audit_events.sort_by(|left, right| text(right, "created_at", "").cmp(&text(left, "created_at", "")));
    audit_events.truncate(40);
    state["decisions"] = json!(decisions);
    let capabilities_total = capabilities["capabilities"].as_array().map(Vec::len).unwrap_or(0);
    let capability_enabled = capabilities["capabilities"]
        .as_array()
        .map(|items| items.iter().filter(|item| item["state"] == "enabled").count())
        .unwrap_or(0);
    state["capability_policy"] = capabilities.clone();
    state["provider_registry"] = load_providers(manager)?;
    state["skills"] = json!(load_skills(manager)?);
    state["teams"] = json!(load_teams(manager)?);
    state["schedules"] = json!(load_schedules(manager)?);
    state["imports"] = json!(load_imports(manager)?);
    state["migration_policy"] = json!({
        "mode": "staged_disabled",
        "supported": ["agents", "prompts", "memories", "skills", "settings"],
        "hydration": "normalized_category_records",
        "recursive_credential_stripping": true
    });
    state["runtime"] = json!({
        "command_count": tasks.iter().filter(|task| task["source"] == "CEO Command Center").count(),
        "generated_at": now(),
        "connected": true,
        "engine": "native",
        "version": "2.4.0-native",
        "execution_mode": "auditable_native_local_sandbox",
        "a2a": {
            "protocol": "atlantis-local-a2a-v1",
            "handoffs_audited": true,
            "external_transport_enabled": false
        },
        "storage": {
            "backend": "sqlcipher",
            "schema_version": 2,
            "encrypted": true,
            "boundary": "Native task, workflow, provider, skill, team and schedule records are encrypted at rest."
        },
        "authority": { "mode": "native_vault", "verified": true },
        "automation": {
            "external_enabled": false,
            "enabled_capabilities": capability_enabled,
            "total_capabilities": capabilities_total,
            "required_gates": capabilities["policy"]["required_gates"]
        },
        "queue": tasks.iter().filter(|task| matches!(task["workflow"]["state"].as_str(), Some("ready" | "running"))).count(),
        "waiting_approval": tasks.iter().filter(|task| task["workflow"]["state"] == "waiting_approval").count(),
        "blocked": tasks.iter().filter(|task| matches!(task["workflow"]["state"].as_str(), Some("blocked" | "rejected"))).count(),
        "completed_cycles": tasks.iter().filter(|task| task["workflow"]["state"] == "completed").count(),
        "audit_events": audit_events,
        "stage_order": STAGE_IDS
    });

    let dynamic: Vec<&Value> = tasks.iter().filter(|task| task["source"] == "CEO Command Center").collect();
    if let Some(metrics) = state["metrics"].as_object_mut() {
        let add_metric = |metrics: &mut Map<String, Value>, key: &str, additional: usize| {
            let base = metrics.get(key).and_then(Value::as_i64).unwrap_or(0);
            metrics.insert(key.to_string(), json!(base + additional as i64));
        };
        add_metric(
            metrics,
            "in_progress",
            dynamic.iter().filter(|task| matches!(task["status"].as_str(), Some("queued" | "in_progress" | "review"))).count(),
        );
        add_metric(
            metrics,
            "blocked",
            dynamic.iter().filter(|task| matches!(task["status"].as_str(), Some("blocked" | "approval"))).count(),
        );
        add_metric(metrics, "completed", dynamic.iter().filter(|task| task["status"] == "completed").count());
    }
    Ok(state)
}

fn save_task(manager: &VaultManager, task: &Value) -> Result<(), VaultError> {
    let task_id = text(task, "id", "");
    let source_id = if is_static_task(&task_id)? { Some(task_id.clone()) } else { None };
    let serialized = serde_json::to_string(task).map_err(|error| invalid(error.to_string()))?;
    let timestamp = now();
    manager.with_connection(|connection| {
        connection.execute(
            "INSERT INTO task_records(
                id, source_id, title, project, owner, priority, status, workflow_stage,
                kind, risk, metadata, created_at, updated_at
             ) VALUES(?1, ?2, ?3, 'Atlantis-X', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
             ON CONFLICT(id) DO UPDATE SET
                source_id=excluded.source_id, title=excluded.title, owner=excluded.owner,
                priority=excluded.priority, status=excluded.status,
                workflow_stage=excluded.workflow_stage, kind=excluded.kind, risk=excluded.risk,
                metadata=excluded.metadata, updated_at=excluded.updated_at",
            params![
                task_id,
                source_id,
                text(task, "title", "Untitled task"),
                text(task, "owner", "atlas"),
                text(task, "priority", "medium"),
                text(task, "status", "queued"),
                text(&task["workflow"], "state", "ready"),
                text(task, "type", "توجيه قيادي"),
                if task["requires_approval"].as_bool().unwrap_or(false) { "sovereign" } else { "local" },
                serialized,
                timestamp
            ],
        )?;
        Ok(())
    })
}

fn save_workflow(manager: &VaultManager, workflow: &Value) -> Result<(), VaultError> {
    let serialized = serde_json::to_string(workflow).map_err(|error| invalid(error.to_string()))?;
    manager.with_connection(|connection| {
        connection.execute(
            "INSERT INTO workflow_records(task_id, current_stage, history, updated_at)
             VALUES(?1, ?2, ?3, ?4)
             ON CONFLICT(task_id) DO UPDATE SET
                current_stage=excluded.current_stage, history=excluded.history, updated_at=excluded.updated_at",
            params![
                text(workflow, "task_id", ""),
                text(workflow, "state", "ready"),
                serialized,
                now()
            ],
        )?;
        Ok(())
    })
}

fn record_activity(
    manager: &VaultManager,
    event_type: &str,
    actor: &str,
    detail: &str,
    task_id: Option<&str>,
) -> Result<(), VaultError> {
    manager.with_connection(|connection| {
        connection.execute(
            "INSERT INTO activity_records(id, event_type, actor, title, detail, task_id, created_at)
             VALUES(?1, ?2, ?3, ?4, ?4, ?5, ?6)",
            params![Uuid::new_v4().to_string(), event_type, actor, detail, task_id, now()],
        )?;
        Ok(())
    })
}

fn record_audit(manager: &VaultManager, event_type: &str, outcome: &str, payload: Value) -> Result<(), VaultError> {
    manager.with_connection(|connection| {
        connection.execute(
            "INSERT INTO audit_events(id, event_type, outcome, payload, created_at) VALUES(?1, ?2, ?3, ?4, ?5)",
            params![Uuid::new_v4().to_string(), event_type, outcome, payload.to_string(), now()],
        )?;
        Ok(())
    })
}

fn find_task(manager: &VaultManager, task_id: &str) -> Result<Value, VaultError> {
    state(manager)?["tasks"]
        .as_array()
        .and_then(|tasks| tasks.iter().find(|task| task["id"] == task_id))
        .cloned()
        .ok_or(VaultError::NotFound)
}

fn append_audit(workflow: &mut Value, task: &Value, stage: &Value, message: &str, outcome: &str) {
    let stage_id = text(stage, "id", "");
    let to_agent = text(stage, "owner", "orion");
    let from_agent = workflow["stages"]
        .as_array()
        .and_then(|stages| stages.iter().position(|item| item["id"] == stage_id))
        .and_then(|index| {
            workflow["stages"].as_array().and_then(|stages| {
                stages[..index]
                    .iter()
                    .rev()
                    .find(|item| item["status"] == "done")
                    .map(|item| text(item, "owner", "orion"))
            })
        })
        .unwrap_or_else(|| "orion".to_string());
    let event = json!({
        "id": Uuid::new_v4().to_string(),
        "task_id": task["id"],
        "stage": stage["id"],
        "agent": stage["owner"],
        "handoff": {
            "protocol": "atlantis-local-a2a-v1",
            "from_agent": from_agent,
            "to_agent": to_agent
        },
        "outcome": outcome,
        "message": message,
        "created_at": now()
    });
    if let Some(audit) = workflow["audit"].as_array_mut() {
        audit.push(event);
    }
}

pub fn dispatch(manager: &VaultManager, command: &str, autorun: bool) -> Result<Value, VaultError> {
    let command = clean(command, 501);
    if command.chars().count() < 3 || command.chars().count() > 500 {
        return Err(VaultError::InvalidGoal);
    }
    let workforce = parse_embedded(WORKFORCE_JSON, "workforce registry")?;
    let approval = requires_approval(&command);
    let executor = route_owner(&command);
    let owner = if approval { "orion" } else { executor };
    let priority = task_priority(&command, approval);
    let task_number = manager.with_connection(|connection| {
        let current: Option<String> = connection
            .query_row(
                "SELECT value FROM vault_metadata WHERE key='next_task_number'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        let number = current.and_then(|value| value.parse::<i64>().ok()).unwrap_or(242);
        connection.execute(
            "INSERT OR REPLACE INTO vault_metadata(key, value) VALUES('next_task_number', ?1)",
            params![(number + 1).to_string()],
        )?;
        Ok(number)
    })?;
    let task_id = format!("AX-{task_number:03}");
    let due = (Utc::now() + Duration::days(if priority == "critical" { 1 } else { 3 }))
        .format("%d %b")
        .to_string();
    let mut task = json!({
        "id": task_id,
        "title": command,
        "owner": owner,
        "executor": executor,
        "status": if approval { "approval" } else { "in_progress" },
        "priority": priority,
        "due": due,
        "progress": if approval { 0 } else { 8 },
        "type": "توجيه قيادي",
        "created_at": now(),
        "source": "CEO Command Center",
        "requires_approval": approval
    });
    let workflow = new_workflow(&task, true);
    task["workflow"] = workflow.clone();
    save_task(manager, &task)?;
    save_workflow(manager, &workflow)?;
    manager.with_connection(|connection| {
        connection.execute(
            "INSERT OR REPLACE INTO goals(id, title, status, created_at) VALUES(?1, ?2, 'queued', ?3)",
            params![task_id, task["title"].as_str().unwrap_or_default(), now()],
        )?;
        Ok(())
    })?;
    record_activity(
        manager,
        if approval { "approval" } else { "command" },
        "orion",
        if approval {
            &format!("صنّف Orion التوجيه {task_id} كمسار سيادي وبدأ التحضير المعزول")
        } else {
            &format!("حوّل Orion التوجيه {task_id} إلى مهمة وعيّنه إلى {}", agent_name(&workforce, owner))
        },
        Some(&task_id),
    )?;
    let plan = if approval {
        json!([
            "منع أي أثر خارجي مع السماح بالتحضير المعزول",
            "تفكيك التوجيه إلى نطاق ومخاطر وخطة رجوع",
            "عرض طلب موافقة محدد على القائد",
            "التنفيذ فقط بعد الموافقة والتدقيق الأمني"
        ])
    } else {
        json!([
            format!("تسجيل {task_id} في سجل العمل"),
            format!("تعيين التنفيذ إلى {}", agent_name(&workforce, owner)),
            "التحقق من المخرجات ومؤشرات القبول",
            "مراجعة أمنية ثم إدراج النتيجة في الموجز التنفيذي"
        ])
    };
    let mut result = json!({
        "accepted": !approval,
        "requires_approval": approval,
        "task": task,
        "owner_name": agent_name(&workforce, owner),
        "executor_name": agent_name(&workforce, executor),
        "workflow": workflow,
        "plan": plan,
        "message": if approval {
            "يحتاج هذا التوجيه إلى موافقة سيادية محددة قبل التنفيذ."
        } else {
            "تم استلام التوجيه وتوزيعه ضمن حدود الصلاحيات."
        },
        "autorun": autorun,
        "executed": []
    });
    if autorun {
        let execution = run_task(manager, &task_id, "until_gate")?;
        result["task"] = execution["task"].clone();
        result["workflow"] = execution["workflow"].clone();
        result["executed"] = execution["executed"].clone();
        if execution["workflow"]["state"] == "waiting_approval" {
            result["accepted"] = json!(false);
            result["message"] = json!("أكمل الفريق التحضير والمراجعة والأمن، وتوقفت الدورة عند بوابة سلطتك.");
        } else if execution["workflow"]["state"] == "completed" {
            result["accepted"] = json!(true);
            result["message"] = json!("أكمل الفريق الدورة المحلية الآمنة وسجّل جميع مراحلها.");
        }
    }
    Ok(result)
}

pub fn run_task(manager: &VaultManager, task_id: &str, mode: &str) -> Result<Value, VaultError> {
    if !matches!(mode, "next" | "until_gate") {
        return Err(invalid("invalid workflow run mode"));
    }
    let mut task = find_task(manager, task_id)?;
    let mut workflow = task["workflow"].clone();
    if matches!(workflow["state"].as_str(), Some("completed" | "blocked" | "rejected" | "waiting_approval")) {
        return Ok(json!({ "task": task, "workflow": workflow, "executed": [] }));
    }
    let limit = if mode == "next" { 1 } else { STAGE_IDS.len() + 1 };
    let mut executed = Vec::new();
    for _ in 0..limit {
        let next_index = workflow["stages"]
            .as_array()
            .and_then(|stages| {
                stages.iter().position(|stage| {
                    matches!(stage["status"].as_str(), Some("ready" | "pending"))
                })
            });
        let Some(index) = next_index else { break };
        let mut stage = workflow["stages"][index].clone();
        if stage["id"] == "approval" {
            stage["status"] = json!("waiting");
            stage["result"] = json!("بانتظار قرار CEO / Commander الصريح.");
            workflow["stages"][index] = stage.clone();
            workflow["state"] = json!("waiting_approval");
            workflow["cursor"] = json!(index);
            task["status"] = json!("approval");
            task["progress"] = json!(90);
            append_audit(&mut workflow, &task, &stage, "توقفت الدورة عند بوابة سلطة القائد.", "waiting");
            executed.push(json!("approval"));
            break;
        }
        stage["status"] = json!("done");
        stage["result"] = json!(match stage["id"].as_str().unwrap_or_default() {
            "plan" => "حوّل Atlas الهدف إلى نطاق ومعايير قبول واعتماديات.",
            "execute" => "اكتمل العمل داخل النطاق المحلي المعزول دون أثر خارجي.",
            "review" => "اكتملت مراجعة مستقلة للمخرجات ومعايير القبول.",
            "security" => "اجتازت النتيجة بوابة الأمن ولم تُمنح صلاحية خارجية.",
            "release" => "سُجل إصدار محلي قابل للرجوع دون نشر خارجي.",
            "complete" => "أغلقت Athena الدورة وأدرجت النتيجة في الموجز.",
            _ => "اكتملت المرحلة."
        });
        workflow["stages"][index] = stage.clone();
        workflow["cursor"] = json!(index + 1);
        task["progress"] = json!(stage_progress(stage["id"].as_str().unwrap_or_default()));
        append_audit(&mut workflow, &task, &stage, stage["result"].as_str().unwrap_or_default(), "done");
        executed.push(stage["id"].clone());
        if stage["id"] == "complete" {
            workflow["state"] = json!("completed");
            task["status"] = json!("completed");
            manager.with_connection(|connection| {
                connection.execute("UPDATE goals SET status='completed' WHERE id=?1", params![task_id])?;
                Ok(())
            })?;
            break;
        }
        if let Some(stages) = workflow["stages"].as_array_mut() {
            if let Some(next) = stages.iter_mut().skip(index + 1).find(|candidate| candidate["status"] == "pending") {
                next["status"] = json!("ready");
            }
        }
        workflow["state"] = json!("running");
        task["status"] = json!(if stage["id"] == "review" { "review" } else { "in_progress" });
        if mode == "next" {
            break;
        }
    }
    workflow["updated_at"] = json!(now());
    task["workflow"] = workflow.clone();
    save_task(manager, &task)?;
    save_workflow(manager, &workflow)?;
    Ok(json!({ "task": task, "workflow": workflow, "executed": executed }))
}

pub fn decide_task(manager: &VaultManager, task_id: &str, decision: &str, note: &str) -> Result<Value, VaultError> {
    if !matches!(decision, "approve" | "reject") {
        return Err(invalid("invalid sovereign decision"));
    }
    let mut task = find_task(manager, task_id)?;
    let mut workflow = task["workflow"].clone();
    if workflow["state"] != "waiting_approval" {
        return Err(invalid("task is not waiting at the approval gate"));
    }
    let index = workflow["stages"]
        .as_array()
        .and_then(|stages| stages.iter().position(|stage| stage["id"] == "approval"))
        .ok_or_else(|| invalid("approval stage is missing"))?;
    let mut stage = workflow["stages"][index].clone();
    let note = clean(note, 300);
    if decision == "approve" {
        stage["status"] = json!("done");
        stage["result"] = json!("اعتمد القائد الاستمرار ضمن النطاق المحدد.");
        workflow["stages"][index] = stage.clone();
        if let Some(next) = workflow["stages"].as_array_mut().and_then(|stages| stages.get_mut(index + 1)) {
            next["status"] = json!("ready");
        }
        workflow["cursor"] = json!(index + 1);
        workflow["state"] = json!("ready");
        task["status"] = json!("in_progress");
        task["progress"] = json!(91);
    } else {
        stage["status"] = json!("failed");
        stage["result"] = json!("رفض القائد الاستمرار وأوقف أي إصدار.");
        workflow["stages"][index] = stage.clone();
        workflow["state"] = json!("rejected");
        task["status"] = json!("blocked");
        task["progress"] = json!(90);
        manager.with_connection(|connection| {
            connection.execute("UPDATE goals SET status='blocked' WHERE id=?1", params![task_id])?;
            Ok(())
        })?;
    }
    let message = if note.is_empty() {
        text(&stage, "result", "")
    } else {
        format!("{} ملاحظة: {note}", text(&stage, "result", ""))
    };
    append_audit(&mut workflow, &task, &stage, &message, if decision == "approve" { "approved" } else { "rejected" });
    workflow["updated_at"] = json!(now());
    task["workflow"] = workflow.clone();
    save_task(manager, &task)?;
    save_workflow(manager, &workflow)?;
    record_activity(manager, "decision", "orion", &message, Some(task_id))?;
    Ok(json!({ "task": task, "workflow": workflow, "decision": decision }))
}

pub fn update_task_status(manager: &VaultManager, task_id: &str, status: &str) -> Result<Value, VaultError> {
    if !matches!(status, "queued" | "in_progress" | "review" | "blocked" | "completed" | "approval") {
        return Err(invalid("invalid task status"));
    }
    let mut task = find_task(manager, task_id)?;
    task["status"] = json!(status);
    task["progress"] = json!(match status {
        "queued" => 0,
        "in_progress" => task["progress"].as_i64().unwrap_or(10).clamp(10, 89),
        "review" => task["progress"].as_i64().unwrap_or(80).clamp(70, 95),
        "approval" => 90,
        "blocked" => task["progress"].as_i64().unwrap_or(0),
        "completed" => 100,
        _ => 0
    });
    let workflow = new_workflow(&task, false);
    task["workflow"] = workflow.clone();
    save_task(manager, &task)?;
    save_workflow(manager, &workflow)?;
    record_activity(manager, "task", "atlas", &format!("حدّث Atlas حالة {task_id} إلى {status}"), Some(task_id))?;
    Ok(task)
}

fn provider_definition(provider_id: &str) -> Result<Value, VaultError> {
    parse_embedded(PROVIDERS_JSON, "provider catalog")?["providers"]
        .as_array()
        .and_then(|providers| providers.iter().find(|provider| provider["id"] == provider_id))
        .cloned()
        .ok_or_else(|| invalid("unknown provider"))
}

fn ensure_operational_provider(definition: &Value) -> Result<(), VaultError> {
    if definition["operational"].as_bool() == Some(false) {
        return Err(invalid("this catalog entry requires a protocol-specific adapter before it can be configured"));
    }
    Ok(())
}

fn validate_provider_endpoint(definition: &Value, endpoint: &str) -> Result<(), VaultError> {
    let parsed = Url::parse(endpoint).map_err(|_| invalid("provider endpoint is not a valid URL"))?;
    if !parsed.username().is_empty() || parsed.password().is_some() || parsed.query().is_some() || parsed.fragment().is_some() {
        return Err(invalid("provider endpoint cannot contain credentials, a query, or a fragment"));
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| invalid("provider endpoint requires a host"))?;
    if definition["local"].as_bool().unwrap_or(false) {
        if parsed.scheme() != "http" || !matches!(host, "localhost" | "127.0.0.1" | "::1") {
            return Err(invalid("local provider endpoints must use HTTP on an exact loopback host"));
        }
        return Ok(());
    }
    if parsed.scheme() != "https" || !matches!(parsed.port(), None | Some(443)) {
        return Err(invalid("hosted provider endpoints must use HTTPS on port 443"));
    }
    if text(definition, "adapter", "") == "azure_openai" {
        if host == "openai.azure.com" || !host.ends_with(".openai.azure.com") {
            return Err(invalid("Azure OpenAI endpoints must use a resource subdomain of openai.azure.com"));
        }
    } else {
        let catalog_endpoint = text(definition, "base_url", "");
        let catalog_host = Url::parse(&catalog_endpoint)
            .ok()
            .and_then(|url| url.host_str().map(str::to_string))
            .ok_or_else(|| invalid("provider catalog endpoint is invalid"))?;
        if !host.eq_ignore_ascii_case(&catalog_host) {
            return Err(invalid("provider endpoint host does not match the selected provider"));
        }
    }
    Ok(())
}

pub fn configure_provider(
    manager: &VaultManager,
    provider_id: &str,
    endpoint: &str,
    model: &str,
    secret: Option<&str>,
) -> Result<Value, VaultError> {
    let definition = provider_definition(provider_id)?;
    ensure_operational_provider(&definition)?;
    let endpoint = clean(endpoint, 1_024);
    let endpoint = if endpoint.is_empty() { text(&definition, "base_url", "") } else { endpoint };
    let model = clean(model, 300);
    let model = if model.is_empty() { text(&definition, "default_model", "") } else { model };
    if definition["custom_endpoint_required"].as_bool().unwrap_or(false) && endpoint.is_empty() {
        return Err(invalid("this provider requires a custom endpoint"));
    }
    if model.is_empty() {
        return Err(invalid("provider model or deployment name is required"));
    }
    validate_provider_endpoint(&definition, &endpoint)?;
    if let Some(secret) = secret {
        if secret.as_bytes().len() > MAX_SECRET_BYTES {
            return Err(invalid("provider credential is too large"));
        }
    }
    let timestamp = now();
    manager.with_connection(|connection| {
        let transaction = connection.unchecked_transaction()?;
        transaction.execute(
            "INSERT INTO provider_configs(
                provider_id, enabled, permission_granted, health_verified, rollback_ready,
                endpoint, model, updated_at
             ) VALUES(?1, 0, 0, 0, 0, ?2, ?3, ?4)
             ON CONFLICT(provider_id) DO UPDATE SET
                enabled=0, health_verified=0, endpoint=excluded.endpoint,
                model=excluded.model, last_health_at=NULL, updated_at=excluded.updated_at",
            params![provider_id, endpoint, model, timestamp],
        )?;
        if let Some(secret) = secret.filter(|value| !value.is_empty()) {
            transaction.execute(
                "INSERT INTO provider_credentials(provider_id, secret, updated_at)
                 VALUES(?1, ?2, ?3)
                 ON CONFLICT(provider_id) DO UPDATE SET secret=excluded.secret, updated_at=excluded.updated_at",
                params![provider_id, secret, timestamp],
            )?;
        }
        transaction.execute(
            "INSERT INTO audit_events(id, event_type, outcome, payload, created_at)
             VALUES(?1, 'provider.configured', 'disabled', ?2, ?3)",
            params![Uuid::new_v4().to_string(), json!({ "provider_id": provider_id }).to_string(), timestamp],
        )?;
        transaction.commit()?;
        Ok(())
    })?;
    Ok(json!({ "provider_id": provider_id, "configured": true, "enabled": false }))
}

pub fn provider_permission(manager: &VaultManager, provider_id: &str, granted: bool) -> Result<Value, VaultError> {
    provider_definition(provider_id)?;
    manager.with_connection(|connection| {
        let changed = connection.execute(
            "UPDATE provider_configs SET permission_granted=?2, enabled=0, updated_at=?3 WHERE provider_id=?1",
            params![provider_id, i64::from(granted), now()],
        )?;
        if changed == 0 { return Err(VaultError::NotFound); }
        Ok(())
    })?;
    record_audit(
        manager,
        "provider.permission_changed",
        if granted { "granted_disabled" } else { "revoked_disabled" },
        json!({ "provider_id": provider_id, "permission_granted": granted }),
    )?;
    Ok(json!({ "provider_id": provider_id, "permission_granted": granted, "enabled": false }))
}

pub fn provider_rollback(manager: &VaultManager, provider_id: &str, ready: bool) -> Result<Value, VaultError> {
    provider_definition(provider_id)?;
    manager.with_connection(|connection| {
        let changed = connection.execute(
            "UPDATE provider_configs SET rollback_ready=?2, enabled=0, updated_at=?3 WHERE provider_id=?1",
            params![provider_id, i64::from(ready), now()],
        )?;
        if changed == 0 { return Err(VaultError::NotFound); }
        Ok(())
    })?;
    record_audit(
        manager,
        "provider.rollback_changed",
        if ready { "ready_disabled" } else { "missing_disabled" },
        json!({ "provider_id": provider_id, "rollback_ready": ready }),
    )?;
    Ok(json!({ "provider_id": provider_id, "rollback_ready": ready, "enabled": false }))
}

fn provider_connection(manager: &VaultManager, provider_id: &str) -> Result<(Value, String, String, Zeroizing<String>), VaultError> {
    let definition = provider_definition(provider_id)?;
    ensure_operational_provider(&definition)?;
    manager.with_connection(|connection| {
        let config = connection
            .query_row(
                "SELECT endpoint, model FROM provider_configs WHERE provider_id=?1",
                params![provider_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?
            .ok_or(VaultError::NotFound)?;
        let secret: Option<Zeroizing<String>> = connection
            .query_row(
                "SELECT secret FROM provider_credentials WHERE provider_id=?1",
                params![provider_id],
                |row| Ok(Zeroizing::new(row.get::<_, String>(0)?)),
            )
            .optional()?;
        validate_provider_endpoint(&definition, &config.0)?;
        let auth = text(&definition, "auth", "bearer");
        if secret.is_none() && !matches!(auth.as_str(), "none" | "optional-bearer") {
            return Err(invalid("provider credential is not stored"));
        }
        Ok((definition, config.0, config.1, secret.unwrap_or_else(|| Zeroizing::new(String::new()))))
    })
}

fn request_headers(definition: &Value, secret: &str) -> Result<HeaderMap, VaultError> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    match text(definition, "auth", "bearer").as_str() {
        "x-api-key" => {
            headers.insert(
                HeaderName::from_static("x-api-key"),
                HeaderValue::from_str(secret).map_err(|_| invalid("credential contains invalid header characters"))?,
            );
            headers.insert(HeaderName::from_static("anthropic-version"), HeaderValue::from_static("2023-06-01"));
        }
        "api-key" => {
            headers.insert(
                HeaderName::from_static("api-key"),
                HeaderValue::from_str(secret).map_err(|_| invalid("credential contains invalid header characters"))?,
            );
        }
        "query-key" => {
            // Gemini accepts x-goog-api-key. Keeping it out of the URL prevents leakage via logs/errors.
            headers.insert(
                HeaderName::from_static("x-goog-api-key"),
                HeaderValue::from_str(secret).map_err(|_| invalid("credential contains invalid header characters"))?,
            );
        }
        "bearer" | "optional-bearer" if !secret.is_empty() => {
            let authorization = Zeroizing::new(format!("Bearer {secret}"));
            headers.insert(
                AUTHORIZATION,
                HeaderValue::from_str(authorization.as_str())
                    .map_err(|_| invalid("credential contains invalid header characters"))?,
            );
        }
        _ => {}
    }
    Ok(headers)
}

fn http_client() -> Result<Client, VaultError> {
    Client::builder()
        .connect_timeout(StdDuration::from_secs(8))
        .timeout(StdDuration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("Atlantis-X/2.4.0")
        .build()
        .map_err(|_| invalid("unable to create the provider HTTP client"))
}

fn bounded_provider_json(response: reqwest::blocking::Response) -> Result<Value, VaultError> {
    let status = response.status();
    if !status.is_success() {
        return Err(invalid(format!("provider request returned HTTP {status}")));
    }
    if let Some(length) = response.content_length() {
        if length > MAX_PROVIDER_RESPONSE_BYTES as u64 {
            return Err(invalid("provider response exceeded the 1 MiB safety limit"));
        }
    }
    let mut bytes = Vec::new();
    response
        .take((MAX_PROVIDER_RESPONSE_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| invalid("provider response could not be read"))?;
    if bytes.len() > MAX_PROVIDER_RESPONSE_BYTES {
        return Err(invalid("provider response exceeded the 1 MiB safety limit"));
    }
    serde_json::from_slice(&bytes).map_err(|_| invalid("provider returned invalid JSON"))
}

pub fn verify_provider(manager: &VaultManager, provider_id: &str) -> Result<Value, VaultError> {
    let (definition, endpoint, _model, secret) = provider_connection(manager, provider_id)?;
    // A new health attempt invalidates the previous result before any network I/O.
    // Failure therefore leaves the provider safely disabled instead of retaining a stale gate.
    manager.with_connection(|connection| {
        connection.execute(
            "UPDATE provider_configs SET health_verified=0, enabled=0, last_health_at=NULL, updated_at=?2 WHERE provider_id=?1",
            params![provider_id, now()],
        )?;
        Ok(())
    })?;
    record_audit(
        manager,
        "provider.health_started",
        "disabled_pending_verification",
        json!({ "provider_id": provider_id }),
    )?;
    let adapter = text(&definition, "adapter", "openai_compatible");
    let headers = request_headers(&definition, &secret)?;
    let url = match adapter.as_str() {
        "ollama" => format!("{}/api/tags", endpoint.trim_end_matches('/')),
        "gemini" => format!("{}/models", endpoint.trim_end_matches('/')),
        "azure_openai" => format!("{}/openai/models?api-version=2024-10-21", endpoint.trim_end_matches('/')),
        _ => format!("{}/models", endpoint.trim_end_matches('/')),
    };
    let response = match http_client()?.get(url).headers(headers).send() {
        Ok(response) => response,
        Err(_) => {
            record_audit(
                manager,
                "provider.health_failed",
                "disabled",
                json!({ "provider_id": provider_id, "failure": "network_tls_or_redirect" }),
            )?;
            return Err(invalid("provider health check failed, timed out, or attempted a redirect"));
        }
    };
    if !response.status().is_success() {
        let status = response.status().as_u16();
        record_audit(
            manager,
            "provider.health_failed",
            "disabled",
            json!({ "provider_id": provider_id, "failure": "http_status", "status": status }),
        )?;
        return Err(invalid(format!("provider health check returned HTTP {status}")));
    }
    let timestamp = now();
    manager.with_connection(|connection| {
        connection.execute(
            "UPDATE provider_configs SET health_verified=1, enabled=0, last_health_at=?2, updated_at=?2 WHERE provider_id=?1",
            params![provider_id, timestamp],
        )?;
        Ok(())
    })?;
    record_audit(
        manager,
        "provider.health_verified",
        "disabled",
        json!({ "provider_id": provider_id, "checked_at": timestamp }),
    )?;
    Ok(json!({ "provider_id": provider_id, "health_verified": true, "enabled": false, "checked_at": timestamp }))
}

pub fn enable_provider(manager: &VaultManager, provider_id: &str, enabled: bool) -> Result<Value, VaultError> {
    let definition = provider_definition(provider_id)?;
    ensure_operational_provider(&definition)?;
    manager.with_connection(|connection| {
        let gates = connection
            .query_row(
                "SELECT permission_granted, health_verified, rollback_ready FROM provider_configs WHERE provider_id=?1",
                params![provider_id],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?)),
            )
            .optional()?
            .ok_or(VaultError::NotFound)?;
        if enabled && gates != (1, 1, 1) {
            return Err(invalid("permission, health verification, and rollback readiness are all required"));
        }
        connection.execute(
            "UPDATE provider_configs SET enabled=?2, updated_at=?3 WHERE provider_id=?1",
            params![provider_id, i64::from(enabled), now()],
        )?;
        Ok(())
    })?;
    record_audit(
        manager,
        "provider.enabled_changed",
        if enabled { "enabled" } else { "disabled" },
        json!({ "provider_id": provider_id, "enabled": enabled }),
    )?;
    Ok(json!({ "provider_id": provider_id, "enabled": enabled }))
}

pub fn erase_provider_credential(manager: &VaultManager, provider_id: &str) -> Result<Value, VaultError> {
    provider_definition(provider_id)?;
    manager.with_connection(|connection| {
        let transaction = connection.unchecked_transaction()?;
        transaction.execute("DELETE FROM provider_credentials WHERE provider_id=?1", params![provider_id])?;
        transaction.execute(
            "UPDATE provider_configs SET enabled=0, health_verified=0, updated_at=?2 WHERE provider_id=?1",
            params![provider_id, now()],
        )?;
        transaction.commit()?;
        Ok(())
    })?;
    record_audit(
        manager,
        "provider.credential_erased",
        "disabled",
        json!({ "provider_id": provider_id }),
    )?;
    Ok(json!({ "provider_id": provider_id, "credential_stored": false, "enabled": false }))
}

pub fn provider_chat(manager: &VaultManager, provider_id: &str, prompt: &str) -> Result<Value, VaultError> {
    let prompt = clean(prompt, 16_000);
    if prompt.is_empty() {
        return Err(invalid("provider prompt cannot be empty"));
    }
    let enabled = manager.with_connection(|connection| {
        connection
            .query_row(
                "SELECT enabled FROM provider_configs WHERE provider_id=?1",
                params![provider_id],
                |row| Ok(row.get::<_, i64>(0)? == 1),
            )
            .optional()?
            .ok_or(VaultError::NotFound)
    })?;
    if !enabled {
        return Err(invalid("provider is disabled"));
    }
    let (definition, endpoint, model, secret) = provider_connection(manager, provider_id)?;
    let adapter = text(&definition, "adapter", "openai_compatible");
    let headers = request_headers(&definition, &secret)?;
    let (url, body) = match adapter.as_str() {
        "anthropic" => (
            format!("{}/messages", endpoint.trim_end_matches('/')),
            json!({ "model": model, "max_tokens": 2048, "messages": [{ "role": "user", "content": prompt }] }),
        ),
        "gemini" => (
            format!("{}/models/{}:generateContent", endpoint.trim_end_matches('/'), urlencoding::encode(&model)),
            json!({ "contents": [{ "parts": [{ "text": prompt }] }] }),
        ),
        "cohere" => (
            format!("{}/chat", endpoint.trim_end_matches('/')),
            json!({ "model": model, "messages": [{ "role": "user", "content": prompt }] }),
        ),
        "ollama" => (
            format!("{}/api/chat", endpoint.trim_end_matches('/')),
            json!({ "model": model, "stream": false, "messages": [{ "role": "user", "content": prompt }] }),
        ),
        "azure_openai" => (
            format!("{}/openai/deployments/{}/chat/completions?api-version=2024-10-21", endpoint.trim_end_matches('/'), urlencoding::encode(&model)),
            json!({ "messages": [{ "role": "user", "content": prompt }] }),
        ),
        _ => (
            format!("{}/chat/completions", endpoint.trim_end_matches('/')),
            json!({ "model": model, "messages": [{ "role": "user", "content": prompt }] }),
        ),
    };
    let response = http_client()?
        .post(url)
        .headers(headers)
        .json(&body)
        .send()
        .map_err(|_| invalid("provider request failed or timed out"))?;
    let payload = bounded_provider_json(response)?;
    let output = match adapter.as_str() {
        "anthropic" => payload["content"][0]["text"].as_str(),
        "gemini" => payload["candidates"][0]["content"]["parts"][0]["text"].as_str(),
        "cohere" => payload["message"]["content"][0]["text"].as_str(),
        "ollama" => payload["message"]["content"].as_str(),
        _ => payload["choices"][0]["message"]["content"].as_str(),
    }
    .ok_or_else(|| invalid("provider response did not contain assistant text"))?;
    record_activity(manager, "provider", "orion", &format!("اكتملت استجابة مشفرة عبر {provider_id}"), None)?;
    Ok(json!({ "provider_id": provider_id, "model": model, "output": output }))
}

fn skill_field(content: &str, name: &str) -> Option<String> {
    let prefix = format!("{name}:");
    content
        .lines()
        .find_map(|line| line.trim().strip_prefix(&prefix).map(|value| value.trim().trim_matches(['\'', '"']).to_string()))
        .filter(|value| !value.is_empty())
}

pub fn install_skill(manager: &VaultManager, content: &str) -> Result<Value, VaultError> {
    if content.as_bytes().len() > MAX_SKILL_BYTES {
        return Err(invalid("SKILL.md exceeds the 256 KiB limit"));
    }
    if !content.contains("#") || content.trim().is_empty() {
        return Err(invalid("SKILL.md must contain a Markdown heading"));
    }
    let heading = content
        .lines()
        .find_map(|line| line.trim().strip_prefix("# "))
        .unwrap_or("Imported skill");
    let name = clean(&skill_field(content, "name").unwrap_or_else(|| heading.to_string()), 120);
    let version = clean(&skill_field(content, "version").unwrap_or_else(|| "1.0.0".to_string()), 40);
    let description = clean(&skill_field(content, "description").unwrap_or_else(|| "Imported SKILL.md instructions".to_string()), 500);
    let raw_id = skill_field(content, "id").unwrap_or_else(|| name.to_lowercase().replace(' ', "-"));
    let id: String = raw_id
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
        .take(80)
        .collect();
    if id.len() < 2 || name.len() < 2 {
        return Err(invalid("SKILL.md requires a valid id and name"));
    }
    let timestamp = now();
    manager.with_connection(|connection| {
        connection.execute(
            "INSERT INTO installed_skills(id, name, version, description, manifest, enabled, installed_at, updated_at)
             VALUES(?1, ?2, ?3, ?4, ?5, 0, ?6, ?6)
             ON CONFLICT(id) DO UPDATE SET
                name=excluded.name, version=excluded.version, description=excluded.description,
                manifest=excluded.manifest, enabled=0, updated_at=excluded.updated_at",
            params![id, name, version, description, content, timestamp],
        )?;
        Ok(())
    })?;
    Ok(json!({ "id": id, "name": name, "version": version, "description": description, "enabled": false }))
}

pub fn enable_skill(manager: &VaultManager, skill_id: &str, enabled: bool) -> Result<Value, VaultError> {
    manager.with_connection(|connection| {
        let changed = connection.execute(
            "UPDATE installed_skills SET enabled=?2, updated_at=?3 WHERE id=?1",
            params![skill_id, i64::from(enabled), now()],
        )?;
        if changed == 0 { return Err(VaultError::NotFound); }
        Ok(())
    })?;
    Ok(json!({ "id": skill_id, "enabled": enabled }))
}

pub fn remove_skill(manager: &VaultManager, skill_id: &str) -> Result<Value, VaultError> {
    manager.with_connection(|connection| {
        let changed = connection.execute("DELETE FROM installed_skills WHERE id=?1", params![skill_id])?;
        if changed == 0 { return Err(VaultError::NotFound); }
        Ok(())
    })?;
    Ok(json!({ "id": skill_id, "removed": true }))
}

fn sensitive_import_key(key: &str) -> bool {
    let normalized = key.to_ascii_lowercase().replace('-', "_").replace(' ', "_");
    matches!(
        normalized.as_str(),
        "key" | "api_key" | "apikey" | "token" | "access_token" | "refresh_token" |
        "id_token" | "secret" | "client_secret" | "password" | "passphrase" |
        "credential" | "credentials" | "private_key" | "privatekey" | "access_key" |
        "secret_access_key" | "authorization" | "bearer" | "cookie" | "session_token" |
        "signing_key" | "ssh_key"
    ) || normalized.ends_with("_api_key")
        || normalized.ends_with("_token")
        || normalized.ends_with("_secret")
        || normalized.ends_with("_password")
        || normalized.ends_with("_credential")
        || normalized.ends_with("_private_key")
        || normalized.ends_with("_access_key")
        || normalized.ends_with("_signing_key")
}

fn sanitize_import_value(value: &Value) -> Value {
    match value {
        Value::Object(items) => Value::Object(
            items
                .iter()
                .filter(|(key, _)| !sensitive_import_key(key))
                .map(|(key, value)| (key.clone(), sanitize_import_value(value)))
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.iter().map(sanitize_import_value).collect()),
        _ => value.clone(),
    }
}

fn sanitize_import_payload(payload: &Value) -> Value {
    let allowed = ["agents", "prompts", "memories", "skills", "settings"];
    let mut sanitized = Map::new();
    for category in allowed {
        if let Some(value) = payload.get(category) {
            sanitized.insert(category.to_string(), sanitize_import_value(value));
        }
    }
    Value::Object(sanitized)
}

fn normalized_import_assets(payload: &Value) -> Result<Vec<(String, String, String, String)>, VaultError> {
    let mut assets = Vec::new();
    for category in ["agents", "prompts", "memories", "skills", "settings"] {
        let Some(value) = payload.get(category) else { continue };
        match value {
            Value::Array(items) => {
                for (index, item) in items.iter().enumerate() {
                    let source_key = item.get("id").and_then(Value::as_str)
                        .or_else(|| item.get("name").and_then(Value::as_str))
                        .map(|value| clean(value, 160))
                        .filter(|value| !value.is_empty())
                        .unwrap_or_else(|| index.to_string());
                    assets.push((
                        Uuid::new_v4().to_string(),
                        category.to_string(),
                        source_key,
                        serde_json::to_string(item).map_err(|error| invalid(error.to_string()))?,
                    ));
                }
            }
            Value::Object(items) => {
                for (source_key, item) in items {
                    assets.push((
                        Uuid::new_v4().to_string(),
                        category.to_string(),
                        clean(source_key, 160),
                        serde_json::to_string(item).map_err(|error| invalid(error.to_string()))?,
                    ));
                }
            }
            Value::Null => {}
            item => assets.push((
                Uuid::new_v4().to_string(),
                category.to_string(),
                "value".to_string(),
                serde_json::to_string(item).map_err(|error| invalid(error.to_string()))?,
            )),
        }
    }
    Ok(assets)
}

pub fn preview_import(payload: &Value, source_name: &str) -> Result<Value, VaultError> {
    if !payload.is_object() {
        return Err(invalid("migration bundle must be a JSON object"));
    }
    let raw = Zeroizing::new(serde_json::to_vec(payload).map_err(|error| invalid(error.to_string()))?);
    if raw.len() > 5_242_880 {
        return Err(invalid("migration bundle exceeds the 5 MiB limit"));
    }
    drop(raw);
    let allowed = ["agents", "prompts", "memories", "skills", "settings"];
    let mut counts = Map::new();
    let mut total = 0_usize;
    for category in allowed {
        let count = match &payload[category] {
            Value::Array(items) => items.len(),
            Value::Object(items) => items.len(),
            Value::Null => 0,
            _ => 1,
        };
        counts.insert(category.to_string(), json!(count));
        total += count;
    }
    if total == 0 {
        return Err(invalid("migration bundle has no supported agents, prompts, memories, skills, or settings"));
    }
    Ok(json!({
        "source_name": clean(source_name, 160),
        "source_kind": "atlantisx-json-bundle",
        "counts": counts,
        "total": total,
        "warnings": [
            "Imported records are staged inside SQLCipher and remain disabled.",
            "Credential, token, password, secret, and private-key fields are stripped recursively."
        ],
        "ready": true
    }))
}

pub fn apply_import(manager: &VaultManager, payload: &Value, source_name: &str) -> Result<Value, VaultError> {
    let raw = Zeroizing::new(serde_json::to_vec(payload).map_err(|error| invalid(error.to_string()))?);
    if raw.len() > 5_242_880 {
        return Err(invalid("migration bundle exceeds the 5 MiB limit"));
    }
    drop(raw);
    let sanitized = sanitize_import_payload(payload);
    let preview = preview_import(&sanitized, source_name)?;
    let serialized = serde_json::to_string(&sanitized).map_err(|error| invalid(error.to_string()))?;
    let assets = normalized_import_assets(&sanitized)?;
    let staged_records = assets.len();
    let id = Uuid::new_v4().to_string();
    manager.with_connection(|connection| {
        let transaction = connection.unchecked_transaction()?;
        let timestamp = now();
        transaction.execute(
            "INSERT INTO migration_imports(id, source_name, source_kind, summary, payload, created_at)
             VALUES(?1, ?2, 'atlantisx-json-bundle', ?3, ?4, ?5)",
            params![id, clean(source_name, 160), preview.to_string(), serialized, timestamp],
        )?;
        for (asset_id, category, source_key, asset_payload) in &assets {
            transaction.execute(
                "INSERT INTO imported_assets(id, import_id, category, source_key, payload, enabled, created_at)
                 VALUES(?1, ?2, ?3, ?4, ?5, 0, ?6)",
                params![asset_id, id, category, source_key, asset_payload, timestamp],
            )?;
        }
        transaction.commit()?;
        Ok(())
    })?;
    record_audit(
        manager,
        "migration.staged",
        "disabled",
        json!({
            "import_id": id,
            "source_name": clean(source_name, 160),
            "total": preview["total"].clone(),
            "normalized_records": staged_records
        }),
    )?;
    Ok(json!({
        "id": id,
        "imported": true,
        "mode": "staged_disabled",
        "credentials_stripped": true,
        "normalized_records": staged_records,
        "summary": preview
    }))
}

pub fn create_team(manager: &VaultManager, name: &str, mission: &str) -> Result<Value, VaultError> {
    let name = clean(name, 120);
    let mission = clean(mission, 500);
    if name.len() < 2 || mission.len() < 3 {
        return Err(invalid("team name and mission are required"));
    }
    let id = Uuid::new_v4().to_string();
    let timestamp = now();
    manager.with_connection(|connection| {
        connection.execute(
            "INSERT INTO teams(id, name, mission, enabled, created_at, updated_at) VALUES(?1, ?2, ?3, 1, ?4, ?4)",
            params![id, name, mission, timestamp],
        )?;
        Ok(())
    })?;
    Ok(json!({ "id": id, "name": name, "mission": mission, "enabled": true, "members": [] }))
}

pub fn add_team_member(
    manager: &VaultManager,
    team_id: &str,
    member_type: &str,
    name: &str,
    role: &str,
) -> Result<Value, VaultError> {
    if !matches!(member_type, "agent" | "human" | "device") {
        return Err(invalid("team member type must be agent, human, or device"));
    }
    let name = clean(name, 120);
    let role = clean(role, 160);
    if name.len() < 2 || role.len() < 2 {
        return Err(invalid("team member name and role are required"));
    }
    let id = Uuid::new_v4().to_string();
    manager.with_connection(|connection| {
        let exists: bool = connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM teams WHERE id=?1)",
            params![team_id],
            |row| Ok(row.get::<_, i64>(0)? == 1),
        )?;
        if !exists { return Err(VaultError::NotFound); }
        connection.execute(
            "INSERT INTO team_members(id, team_id, member_type, name, role, status, created_at)
             VALUES(?1, ?2, ?3, ?4, ?5, 'registered_identity', ?6)",
            params![id, team_id, member_type, name, role, now()],
        )?;
        Ok(())
    })?;
    Ok(json!({
        "id": id,
        "team_id": team_id,
        "member_type": member_type,
        "name": name,
        "role": role,
        "status": "registered_identity",
        "authenticated_pairing": false
    }))
}

pub fn toggle_team(manager: &VaultManager, team_id: &str, enabled: bool) -> Result<Value, VaultError> {
    manager.with_connection(|connection| {
        let changed = connection.execute(
            "UPDATE teams SET enabled=?2, updated_at=?3 WHERE id=?1",
            params![team_id, i64::from(enabled), now()],
        )?;
        if changed == 0 { return Err(VaultError::NotFound); }
        Ok(())
    })?;
    Ok(json!({ "id": team_id, "enabled": enabled }))
}

fn next_schedule_time(frequency: &str) -> Result<String, VaultError> {
    let duration = match frequency {
        "hourly" => Duration::hours(1),
        "daily" => Duration::days(1),
        "weekly" => Duration::weeks(1),
        _ => return Err(invalid("frequency must be hourly, daily, or weekly")),
    };
    Ok((Utc::now() + duration).to_rfc3339())
}

pub fn create_schedule(
    manager: &VaultManager,
    name: &str,
    goal_template: &str,
    frequency: &str,
) -> Result<Value, VaultError> {
    let name = clean(name, 120);
    let goal_template = clean(goal_template, 500);
    if name.len() < 2 || goal_template.len() < 3 {
        return Err(invalid("schedule name and goal are required"));
    }
    let id = Uuid::new_v4().to_string();
    let timestamp = now();
    manager.with_connection(|connection| {
        connection.execute(
            "INSERT INTO recurring_workflows(
                id, name, goal_template, frequency, enabled, next_run_at, created_at, updated_at
             ) VALUES(?1, ?2, ?3, ?4, 0, NULL, ?5, ?5)",
            params![id, name, goal_template, frequency, timestamp],
        )?;
        Ok(())
    })?;
    Ok(json!({ "id": id, "name": name, "goal_template": goal_template, "frequency": frequency, "enabled": false }))
}

pub fn toggle_schedule(manager: &VaultManager, schedule_id: &str, enabled: bool) -> Result<Value, VaultError> {
    let frequency = manager.with_connection(|connection| {
        connection
            .query_row(
                "SELECT frequency FROM recurring_workflows WHERE id=?1",
                params![schedule_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .ok_or(VaultError::NotFound)
    })?;
    let next_run = if enabled { Some(next_schedule_time(&frequency)?) } else { None };
    manager.with_connection(|connection| {
        connection.execute(
            "UPDATE recurring_workflows SET enabled=?2, next_run_at=?3, updated_at=?4 WHERE id=?1",
            params![schedule_id, i64::from(enabled), next_run, now()],
        )?;
        Ok(())
    })?;
    Ok(json!({ "id": schedule_id, "enabled": enabled, "next_run_at": next_run }))
}

pub fn delete_schedule(manager: &VaultManager, schedule_id: &str) -> Result<Value, VaultError> {
    manager.with_connection(|connection| {
        let changed = connection.execute("DELETE FROM recurring_workflows WHERE id=?1", params![schedule_id])?;
        if changed == 0 { return Err(VaultError::NotFound); }
        Ok(())
    })?;
    Ok(json!({ "id": schedule_id, "deleted": true }))
}

pub fn run_due_schedules(manager: &VaultManager) -> Result<Value, VaultError> {
    let due = manager.with_connection(|connection| {
        let mut statement = connection.prepare(
            "SELECT id, goal_template, frequency FROM recurring_workflows
             WHERE enabled=1 AND next_run_at IS NOT NULL AND next_run_at <= ?1",
        )?;
        let rows = statement.query_map(params![now()], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(VaultError::from)
    })?;
    let mut results = Vec::new();
    for (schedule_id, goal, frequency) in due {
        let result = dispatch(manager, &goal, true)?;
        let timestamp = now();
        let next_run = next_schedule_time(&frequency)?;
        manager.with_connection(|connection| {
            connection.execute(
                "UPDATE recurring_workflows SET last_run_at=?2, next_run_at=?3, updated_at=?2 WHERE id=?1",
                params![schedule_id, timestamp, next_run],
            )?;
            Ok(())
        })?;
        results.push(json!({ "schedule_id": schedule_id, "task_id": result["task"]["id"] }));
    }
    Ok(json!({ "ran": results.len(), "results": results }))
}

pub fn capability_gate_summary(manager: &VaultManager) -> Result<Value, VaultError> {
    let state = state(manager)?;
    let enabled_provider_ids: HashSet<String> = state["provider_registry"]["providers"]
        .as_array()
        .map(|providers| {
            providers
                .iter()
                .filter(|provider| provider["enabled"].as_bool().unwrap_or(false))
                .map(|provider| text(provider, "id", ""))
                .collect()
        })
        .unwrap_or_default();
    Ok(json!({
        "external_automation_enabled": false,
        "enabled_providers": enabled_provider_ids,
        "note": "Model inference is separate from external automation capabilities; every automation capability remains default-deny."
    }))
}
