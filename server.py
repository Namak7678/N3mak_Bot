"""Atlantis-X Command Center local server.

This module deliberately uses only Python's standard library. It serves the web
interface and exposes a small, auditable API for routing CEO directives. It does
not claim that any external service is connected unless its adapter is actually
configured and healthy.
"""

import argparse
import copy
import hmac
import json
import os
import re
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from cto_agent import CtoAgent, CtoAgentError


ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config" / "workforce.json"
CAPABILITIES_PATH = ROOT / "config" / "capabilities.json"
PROVIDERS_PATH = ROOT / "config" / "providers.json"
RUNTIME_PATH = ROOT / ".atlantisx" / "atlantisx.db"
LEGACY_RUNTIME_PATH = ROOT / ".atlantisx" / "runtime.json"
WEB_PATH = ROOT / "web"


class WorkforceEngine:
    """Combine the versioned workforce registry with local runtime state."""

    ALLOWED_STATUSES = {"queued", "in_progress", "review", "blocked", "completed", "approval"}
    SOVEREIGN_TERMS = (
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
    )
    ROUTES: Tuple[Tuple[str, Tuple[str, ...]], ...] = (
        ("sentinel", ("أمن", "أمني", "ثغرة", "ثغرات", "أسرار", "صلاحيات", "vulnerability", "security")),
        ("forge", ("كود", "تطوير", "اختبار", "واجهة", "api", "database", "بيانات", "github", "pipeline")),
        ("nova", ("تسويق", "حملة", "محتوى", "linkedin", "علاقات عامة", "مستثمر")),
        ("pulse", ("أداء", "كفاءة", "تكلفة", "انتاجية", "إنتاجية", "kpi")),
        ("aegis", ("مخاطر", "خطر", "risk", "سياسي", "سلسلة الإمداد")),
        ("nautilus", ("اقتصاد أزرق", "صيد", "ميناء", "موانئ", "تبريد", "استزراع", "بحري")),
        ("meridian", ("سوق", "موريتانيا", "مصر", "روسيا", "النرويج", "الصين", "اليابان", "usa", "استثمار")),
        ("athena", ("اجتماع", "موعد", "موجز", "تقرير يومي", "تقرير أسبوعي", "ذكّر")),
        ("atlas", ("خطة", "الأسبوع", "مهام", "مشروع", "deadline", "أولوية")),
    )
    WORKFLOW_STAGES: Tuple[Tuple[str, str, str], ...] = (
        ("plan", "PLAN", "التخطيط"),
        ("execute", "EXECUTE", "تنفيذ معزول"),
        ("review", "REVIEW", "مراجعة مستقلة"),
        ("security", "SECURITY", "بوابة الأمن"),
        ("approval", "APPROVAL", "سلطة القائد"),
        ("release", "RELEASE", "إصدار مضبوط"),
        ("complete", "COMPLETE", "إغلاق وتقرير"),
    )
    STAGE_PROGRESS = {
        "plan": 15,
        "execute": 55,
        "review": 80,
        "security": 90,
        "approval": 90,
        "release": 96,
        "complete": 100,
    }

    def __init__(
        self,
        config_path: Path = CONFIG_PATH,
        runtime_path: Path = RUNTIME_PATH,
        capabilities_path: Path = CAPABILITIES_PATH,
        cto_agent: Optional[CtoAgent] = None,
    ) -> None:
        self.config_path = Path(config_path)
        self.capabilities_path = Path(capabilities_path)
        self.runtime_path = Path(runtime_path)
        self.legacy_runtime_path = (
            LEGACY_RUNTIME_PATH
            if self.runtime_path == RUNTIME_PATH
            else self.runtime_path.with_name("runtime.json")
        )
        self._lock = threading.RLock()
        self._base = self._read_json(self.config_path)
        self._capabilities = self._read_json(self.capabilities_path)
        self._providers = self._read_json(PROVIDERS_PATH)
        self._cto = cto_agent or CtoAgent(self._providers)

    @staticmethod
    def _read_json(path: Path) -> Dict[str, Any]:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    @staticmethod
    def _empty_runtime() -> Dict[str, Any]:
        return {"tasks": [], "activities": [], "overrides": {}, "workflows": {}}

    def _connect_runtime(self) -> sqlite3.Connection:
        """Open the local SQLite store and apply the current transactional schema."""
        self.runtime_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(str(self.runtime_path), timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("PRAGMA synchronous = FULL")
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 10000")
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS runtime_metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS runtime_tasks (
                id TEXT PRIMARY KEY,
                position INTEGER NOT NULL,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS runtime_workflows (
                task_id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS runtime_activities (
                position INTEGER PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS runtime_overrides (
                task_id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            """
        )
        connection.execute(
            "INSERT OR IGNORE INTO runtime_metadata(key, value) VALUES('schema_version', '1')"
        )
        connection.commit()
        return connection

    def _migrate_legacy_runtime(self) -> None:
        """Import the previous JSON state once without deleting the source backup."""
        if self.runtime_path.exists() or not self.legacy_runtime_path.exists():
            return
        try:
            runtime = self._read_json(self.legacy_runtime_path)
        except (OSError, json.JSONDecodeError):
            return
        for key, default in self._empty_runtime().items():
            runtime.setdefault(key, copy.deepcopy(default))
        self._save_runtime(runtime)
        with self._connect_runtime() as connection:
            connection.execute(
                "INSERT OR REPLACE INTO runtime_metadata(key, value) VALUES('legacy_json_imported', ?)",
                (self._now_iso(),),
            )

    def _load_runtime(self) -> Dict[str, Any]:
        self._migrate_legacy_runtime()
        runtime = self._empty_runtime()
        try:
            with self._connect_runtime() as connection:
                runtime["tasks"] = [
                    json.loads(row["payload"])
                    for row in connection.execute(
                        "SELECT payload FROM runtime_tasks ORDER BY position ASC"
                    )
                ]
                runtime["activities"] = [
                    json.loads(row["payload"])
                    for row in connection.execute(
                        "SELECT payload FROM runtime_activities ORDER BY position ASC"
                    )
                ]
                runtime["workflows"] = {
                    row["task_id"]: json.loads(row["payload"])
                    for row in connection.execute("SELECT task_id, payload FROM runtime_workflows")
                }
                runtime["overrides"] = {
                    row["task_id"]: json.loads(row["payload"])
                    for row in connection.execute("SELECT task_id, payload FROM runtime_overrides")
                }
        except (sqlite3.DatabaseError, json.JSONDecodeError) as exc:
            raise RuntimeError("Atlantis-X runtime database failed its integrity read") from exc
        return runtime

    def _save_runtime(self, runtime: Dict[str, Any]) -> None:
        """Persist a complete runtime snapshot in one SQLite transaction."""
        with self._connect_runtime() as connection:
            connection.execute("DELETE FROM runtime_tasks")
            connection.execute("DELETE FROM runtime_workflows")
            connection.execute("DELETE FROM runtime_activities")
            connection.execute("DELETE FROM runtime_overrides")
            connection.executemany(
                "INSERT INTO runtime_tasks(id, position, payload) VALUES(?, ?, ?)",
                [
                    (task["id"], position, json.dumps(task, ensure_ascii=False))
                    for position, task in enumerate(runtime.get("tasks", []))
                ],
            )
            connection.executemany(
                "INSERT INTO runtime_workflows(task_id, payload) VALUES(?, ?)",
                [
                    (task_id, json.dumps(workflow, ensure_ascii=False))
                    for task_id, workflow in runtime.get("workflows", {}).items()
                ],
            )
            connection.executemany(
                "INSERT INTO runtime_activities(position, payload) VALUES(?, ?)",
                [
                    (position, json.dumps(activity, ensure_ascii=False))
                    for position, activity in enumerate(runtime.get("activities", []))
                ],
            )
            connection.executemany(
                "INSERT INTO runtime_overrides(task_id, payload) VALUES(?, ?)",
                [
                    (task_id, json.dumps(fields, ensure_ascii=False))
                    for task_id, fields in runtime.get("overrides", {}).items()
                ],
            )
            connection.execute(
                "INSERT OR REPLACE INTO runtime_metadata(key, value) VALUES('updated_at', ?)",
                (self._now_iso(),),
            )

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    @staticmethod
    def _relative_time() -> str:
        return "الآن"

    def get_state(self) -> Dict[str, Any]:
        with self._lock:
            state = copy.deepcopy(self._base)
            state["capability_policy"] = copy.deepcopy(self._capabilities)
            state["provider_registry"] = copy.deepcopy(self._providers)
            state["skills"] = []
            state["teams"] = []
            state["schedules"] = []
            state["imports"] = []
            state["cto"] = self._cto.status()
            runtime = self._load_runtime()

            for task in state.get("tasks", []):
                override = runtime["overrides"].get(task["id"])
                if override:
                    task.update(override)

            state["tasks"] = runtime["tasks"] + state.get("tasks", [])
            for task in state["tasks"]:
                workflow = runtime["workflows"].get(task["id"])
                task["workflow"] = copy.deepcopy(workflow or self._new_workflow(task))

            state["activities"] = runtime["activities"] + state.get("activities", [])
            state["activities"] = state["activities"][:30]

            workflows = [task["workflow"] for task in state["tasks"]]
            workflow_by_task = {workflow["task_id"]: workflow for workflow in workflows}
            task_by_id = {task["id"]: task for task in state["tasks"]}

            for agent in state.get("agents", []):
                assigned = [
                    task for task in state["tasks"]
                    if (
                        task.get("owner") == agent["id"]
                        or agent["id"] in task.get("delegated_agents", [])
                    ) and task.get("status") != "completed"
                ]
                queue = agent.setdefault("queue", {})
                queue["depth"] = len(assigned)
                queue["active"] = sum(
                    task.get("status") in {"queued", "in_progress", "review"} for task in assigned
                )
                queue["waiting_on_commander"] = sum(
                    task.get("status") == "approval" for task in assigned
                )
                queue["items"] = [
                    {
                        "id": task["id"],
                        "title": task["title"],
                        "status": task["status"],
                        "priority": task["priority"],
                    }
                    for task in assigned
                ]

            decisions = []
            decision_task_ids = set()
            for decision in state.get("decisions", []):
                task_id = decision.get("task_id")
                if task_id and workflow_by_task.get(task_id, {}).get("state") == "waiting_approval":
                    decisions.append(decision)
                    decision_task_ids.add(task_id)
            for task_id, workflow in workflow_by_task.items():
                if workflow["state"] != "waiting_approval" or task_id in decision_task_ids:
                    continue
                task = task_by_id[task_id]
                decisions.append({
                    "id": "DEC-{}".format(task_id.removeprefix("AX-")),
                    "task_id": task_id,
                    "title": task["title"],
                    "risk": "مرتفع" if workflow["policy"]["requires_approval"] else "متوسط",
                    "requested_by": self._agent_name(task.get("executor", task.get("owner", "orion"))),
                    "time": "الآن",
                })
            state["decisions"] = decisions

            audit_events = []
            for workflow in workflows:
                audit_events.extend(workflow.get("audit", []))
            audit_events.sort(key=lambda event: event.get("created_at", ""), reverse=True)
            state["runtime"] = {
                "command_count": len(runtime["tasks"]),
                "generated_at": self._now_iso(),
                "connected": True,
                "engine": "online",
                "version": "2.3-local",
                "execution_mode": "auditable_local_sandbox",
                "storage": {
                    "backend": "sqlite",
                    "schema_version": 1,
                    "encrypted": False,
                    "boundary": "Local web runtime; native builds require SQLCipher vault encryption.",
                },
                "automation": {
                    "external_enabled": self._capabilities["policy"]["external_automation_enabled"],
                    "enabled_capabilities": sum(
                        capability["state"] == "enabled"
                        for capability in self._capabilities["capabilities"]
                    ),
                    "total_capabilities": len(self._capabilities["capabilities"]),
                    "required_gates": self._capabilities["policy"]["required_gates"],
                },
                "queue": sum(workflow["state"] in {"ready", "running"} for workflow in workflows),
                "waiting_approval": sum(workflow["state"] == "waiting_approval" for workflow in workflows),
                "blocked": sum(workflow["state"] in {"blocked", "rejected"} for workflow in workflows),
                "completed_cycles": sum(workflow["state"] == "completed" for workflow in workflows),
                "audit_events": audit_events[:40],
                "stage_order": [stage[0] for stage in self.WORKFLOW_STAGES],
            }

            metrics = state.setdefault("metrics", {})
            runtime_tasks = runtime["tasks"]
            metrics["in_progress"] = int(metrics.get("in_progress", 0)) + sum(
                task["status"] in {"queued", "in_progress", "review"} for task in runtime_tasks
            )
            metrics["blocked"] = int(metrics.get("blocked", 0)) + sum(
                task["status"] in {"blocked", "approval"} for task in runtime_tasks
            )
            metrics["completed"] = int(metrics.get("completed", 0)) + sum(
                task["status"] == "completed" for task in runtime_tasks
            )
            return state

    def _new_workflow(self, task: Dict[str, Any], fresh: bool = False) -> Dict[str, Any]:
        executor = task.get("executor", task.get("owner", "atlas"))
        requires_approval = bool(
            task.get("requires_approval")
            or task.get("priority") == "critical"
            or task.get("status") == "approval"
        )
        review_owner = "atlas" if executor == "forge" else "forge"
        owners = {
            "plan": "atlas",
            "execute": executor,
            "review": review_owner,
            "security": "sentinel",
            "approval": "orion",
            "release": executor,
            "complete": "athena",
        }
        stages = [
            {
                "id": stage_id,
                "label": label,
                "label_ar": label_ar,
                "owner": owners[stage_id],
                "status": "skipped" if stage_id == "approval" and not requires_approval else "pending",
                "result": "",
            }
            for stage_id, label, label_ar in self.WORKFLOW_STAGES
        ]
        workflow = {
            "task_id": task["id"],
            "state": "ready",
            "cursor": 0,
            "stages": stages,
            "policy": {
                "requires_approval": requires_approval,
                "external_effects_enabled": False,
                "execution_scope": "local_sandbox",
                "reason": (
                    "توجيه سيادي" if task.get("requires_approval")
                    else "أولوية حرجة" if task.get("priority") == "critical"
                    else "بوابة موافقة يدوية" if task.get("status") == "approval"
                    else "مسار محلي منخفض الأثر"
                ),
            },
            "audit": [],
            "created_at": task.get("created_at", self._now_iso()),
            "updated_at": self._now_iso(),
        }
        if fresh:
            workflow["stages"][0]["status"] = "ready"
            return workflow

        status = task.get("status", "queued")
        if status == "completed":
            for stage in workflow["stages"]:
                if stage["status"] != "skipped":
                    stage["status"] = "done"
            workflow["state"] = "completed"
            workflow["cursor"] = len(stages)
        elif status == "blocked":
            workflow["state"] = "blocked"
            workflow["stages"][0]["status"] = "ready"
        elif status == "approval":
            for stage in workflow["stages"][:4]:
                stage["status"] = "done"
            workflow["stages"][4]["status"] = "waiting"
            workflow["state"] = "waiting_approval"
            workflow["cursor"] = 4
        elif status == "review":
            workflow["stages"][0]["status"] = "done"
            workflow["stages"][1]["status"] = "done"
            workflow["stages"][2]["status"] = "ready"
            workflow["cursor"] = 2
        elif status == "in_progress":
            workflow["stages"][0]["status"] = "done"
            workflow["stages"][1]["status"] = "ready"
            workflow["cursor"] = 1
        else:
            workflow["stages"][0]["status"] = "ready"
        return workflow

    def _find_task(self, runtime: Dict[str, Any], task_id: str) -> Tuple[Dict[str, Any], bool]:
        for task in runtime["tasks"]:
            if task["id"] == task_id:
                return task, True
        for base_task in self._base.get("tasks", []):
            if base_task["id"] == task_id:
                task = copy.deepcopy(base_task)
                task.update(runtime["overrides"].get(task_id, {}))
                return task, False
        raise KeyError("المهمة غير موجودة")

    @staticmethod
    def _persist_task_fields(
        runtime: Dict[str, Any], task: Dict[str, Any], is_runtime_task: bool, **fields: Any
    ) -> None:
        task.update(fields)
        if not is_runtime_task:
            runtime["overrides"].setdefault(task["id"], {}).update(fields)

    def _record_workflow_event(
        self,
        runtime: Dict[str, Any],
        workflow: Dict[str, Any],
        task: Dict[str, Any],
        stage: Dict[str, Any],
        message: str,
        outcome: str = "done",
    ) -> None:
        event = {
            "id": "AUD-{}-{:02d}".format(datetime.now(timezone.utc).strftime("%H%M%S"), len(workflow["audit"]) + 1),
            "task_id": task["id"],
            "stage": stage["id"],
            "agent": stage["owner"],
            "outcome": outcome,
            "message": message,
            "created_at": self._now_iso(),
        }
        workflow["audit"].insert(0, event)
        runtime["activities"].insert(0, {
            "agent": stage["owner"],
            "type": "runtime",
            "text": "{} · {} · {}".format(task["id"], stage["label"], message),
            "time": self._relative_time(),
            "created_at": event["created_at"],
        })

    def _stage_result(self, stage_id: str, task: Dict[str, Any], owner: str) -> str:
        owner_name = self._agent_name(owner)
        results = {
            "plan": "أنشأ Atlas نطاقًا ومعايير قبول وخطة رجوع قابلة للتدقيق.",
            "execute": "أنشأ {} حزمة مخرجات داخل sandbox دون أثر خارجي.".format(owner_name),
            "review": "أكمل {} بوابة مراجعة مستقلة وفصل الصلاحيات.".format(owner_name),
            "security": "طبّق Sentinel فحص السياسة؛ لم يُسمح بأي أثر خارجي.",
            "release": "سُجّل إصدار محلي مضبوط؛ موصلات التنفيذ الخارجي غير مفعّلة.",
            "complete": "أغلقت Athena الدورة وأدرجت النتيجة في الموجز التنفيذي.",
        }
        return results.get(stage_id, "اكتملت المرحلة بنجاح.")

    def _advance_stage(
        self,
        runtime: Dict[str, Any],
        workflow: Dict[str, Any],
        task: Dict[str, Any],
        is_runtime_task: bool,
    ) -> Optional[Dict[str, Any]]:
        while workflow["cursor"] < len(workflow["stages"]):
            stage = workflow["stages"][workflow["cursor"]]
            if stage["status"] in {"done", "skipped"}:
                workflow["cursor"] += 1
                continue
            break

        if workflow["cursor"] >= len(workflow["stages"]):
            workflow["state"] = "completed"
            self._persist_task_fields(runtime, task, is_runtime_task, status="completed", progress=100)
            return None

        stage = workflow["stages"][workflow["cursor"]]
        if stage["id"] == "approval":
            stage["status"] = "waiting"
            workflow["state"] = "waiting_approval"
            workflow["updated_at"] = self._now_iso()
            self._persist_task_fields(runtime, task, is_runtime_task, status="approval", progress=90)
            self._record_workflow_event(
                runtime,
                workflow,
                task,
                stage,
                "توقفت الدورة عند بوابة القرار السيادي.",
                "waiting",
            )
            return stage

        stage["status"] = "running"
        workflow["state"] = "running"
        stage["started_at"] = self._now_iso()
        result = self._stage_result(stage["id"], task, stage["owner"])
        stage["status"] = "done"
        stage["result"] = result
        stage["completed_at"] = self._now_iso()
        workflow["cursor"] += 1
        workflow["updated_at"] = stage["completed_at"]

        task_status = "review" if stage["id"] in {"review", "security"} else "in_progress"
        if stage["id"] == "complete":
            task_status = "completed"
            workflow["state"] = "completed"
        else:
            workflow["state"] = "ready"
        self._persist_task_fields(
            runtime,
            task,
            is_runtime_task,
            status=task_status,
            progress=self.STAGE_PROGRESS[stage["id"]],
        )
        self._record_workflow_event(runtime, workflow, task, stage, result)

        if workflow["cursor"] < len(workflow["stages"]):
            next_stage = workflow["stages"][workflow["cursor"]]
            if next_stage["status"] == "pending":
                next_stage["status"] = "ready"
        return stage

    def run_task(self, task_id: str, mode: str = "until_gate") -> Dict[str, Any]:
        if mode not in {"next", "until_gate"}:
            raise ValueError("وضع التشغيل غير صالح")
        with self._lock:
            runtime = self._load_runtime()
            task, is_runtime_task = self._find_task(runtime, task_id)
            workflow = runtime["workflows"].setdefault(task_id, self._new_workflow(task))
            if workflow["state"] in {"blocked", "rejected"}:
                raise ValueError("المهمة محظورة ويجب فك الحظر قبل تشغيلها")
            if workflow["state"] == "completed":
                return {"task": task, "workflow": workflow, "executed": []}

            executed = []
            limit = 1 if mode == "next" else len(self.WORKFLOW_STAGES) + 1
            for _ in range(limit):
                if workflow["state"] == "waiting_approval":
                    break
                stage = self._advance_stage(runtime, workflow, task, is_runtime_task)
                if stage is None:
                    break
                executed.append(stage["id"])
                if stage["id"] == "approval" or mode == "next":
                    break

            self._save_runtime(runtime)
            return {"task": task, "workflow": workflow, "executed": executed}

    def decide_task(self, task_id: str, decision: str, note: str = "") -> Dict[str, Any]:
        if decision not in {"approve", "reject"}:
            raise ValueError("قرار الموافقة غير صالح")
        note = " ".join(str(note).split())[:300]
        with self._lock:
            runtime = self._load_runtime()
            task, is_runtime_task = self._find_task(runtime, task_id)
            workflow = runtime["workflows"].setdefault(task_id, self._new_workflow(task))
            if workflow["state"] != "waiting_approval":
                raise ValueError("المهمة ليست عند بوابة الموافقة")

            stage = next(item for item in workflow["stages"] if item["id"] == "approval")
            if decision == "approve":
                stage["status"] = "done"
                stage["result"] = "اعتمد القائد الاستمرار ضمن النطاق المحدد."
                workflow["cursor"] = workflow["stages"].index(stage) + 1
                workflow["state"] = "ready"
                if workflow["cursor"] < len(workflow["stages"]):
                    workflow["stages"][workflow["cursor"]]["status"] = "ready"
                self._persist_task_fields(runtime, task, is_runtime_task, status="in_progress", progress=91)
                message = stage["result"]
                outcome = "approved"
            else:
                stage["status"] = "failed"
                stage["result"] = "رفض القائد الاستمرار وأوقف أي إصدار."
                workflow["state"] = "rejected"
                self._persist_task_fields(runtime, task, is_runtime_task, status="blocked", progress=90)
                message = stage["result"]
                outcome = "rejected"
            if note:
                message = "{} ملاحظة: {}".format(message, note)
            workflow["updated_at"] = self._now_iso()
            self._record_workflow_event(runtime, workflow, task, stage, message, outcome)
            self._save_runtime(runtime)
            return {"task": task, "workflow": workflow, "decision": decision}

    def _requires_approval(self, command: str) -> bool:
        normalized = command.casefold()
        return any(term.casefold() in normalized for term in self.SOVEREIGN_TERMS)

    def _route_owner(self, command: str) -> str:
        normalized = command.casefold()
        scores = []
        for index, (owner, terms) in enumerate(self.ROUTES):
            score = sum(1 for term in terms if term.casefold() in normalized)
            if score:
                scores.append((score, -index, owner))
        return max(scores)[2] if scores else "atlas"

    @staticmethod
    def _priority(command: str, requires_approval: bool) -> str:
        normalized = command.casefold()
        if any(term in normalized for term in ("عاجل", "فورًا", "فورا", "حرج", "critical", "urgent")):
            return "critical"
        if requires_approval or any(term in normalized for term in ("مهم", "مرتفع", "high")):
            return "high"
        return "medium"

    def _next_id(self, runtime: Dict[str, Any]) -> str:
        ids: List[str] = [task.get("id", "") for task in self._base.get("tasks", [])]
        ids.extend(task.get("id", "") for task in runtime.get("tasks", []))
        numbers = [int(match.group(1)) for value in ids if (match := re.fullmatch(r"AX-(\d+)", value))]
        return "AX-{:03d}".format(max(numbers, default=240) + 1)

    def create_command(self, command: str) -> Dict[str, Any]:
        command = " ".join(str(command).split())
        if len(command) < 3:
            raise ValueError("اكتب توجيهًا واضحًا من ثلاثة أحرف على الأقل")
        if len(command) > 500:
            raise ValueError("التوجيه أطول من الحد المسموح (500 حرف)")

        with self._lock:
            runtime = self._load_runtime()
            needs_approval = self._requires_approval(command)
            executor = self._route_owner(command)
            owner = "orion" if needs_approval else executor
            status = "approval" if needs_approval else "in_progress"
            priority = self._priority(command, needs_approval)
            task_id = self._next_id(runtime)
            due_date = datetime.now(timezone.utc) + timedelta(days=1 if priority == "critical" else 3)

            task = {
                "id": task_id,
                "title": command,
                "owner": owner,
                "executor": executor,
                "status": status,
                "priority": priority,
                "due": due_date.strftime("%d %b"),
                "progress": 0 if needs_approval else 8,
                "type": "توجيه قيادي",
                "created_at": self._now_iso(),
                "source": "CEO Command Center",
                "requires_approval": needs_approval,
            }
            runtime["tasks"].insert(0, task)
            runtime["workflows"][task_id] = self._new_workflow(task, fresh=True)

            owner_name = self._agent_name(owner)
            if needs_approval:
                activity_text = "صنّف Orion التوجيه {} كمسار سيادي وبدأ التحضير المعزول".format(task_id)
            else:
                activity_text = "حوّل Orion التوجيه {} إلى {} وعيّنه إلى {}".format(task_id, "مهمة", owner_name)
            activity = {
                "agent": "orion",
                "type": "approval" if needs_approval else "command",
                "text": activity_text,
                "time": self._relative_time(),
                "created_at": self._now_iso(),
            }
            runtime["activities"].insert(0, activity)
            self._save_runtime(runtime)

            plan = self._build_plan(task, owner_name, needs_approval)
            return {
                "accepted": not needs_approval,
                "requires_approval": needs_approval,
                "task": task,
                "owner_name": owner_name,
                "executor_name": self._agent_name(executor),
                "workflow": runtime["workflows"][task_id],
                "plan": plan,
                "message": (
                    "يحتاج هذا التوجيه إلى موافقة سيادية محددة قبل التنفيذ."
                    if needs_approval
                    else "تم استلام التوجيه وتوزيعه ضمن حدود الصلاحيات."
                ),
            }

    def dispatch_command(self, command: str, autorun: bool = True) -> Dict[str, Any]:
        """Create a directive and autonomously advance its safe local stages."""
        result = self.create_command(command)
        result["autorun"] = bool(autorun)
        result["executed"] = []
        if not autorun:
            return result

        execution = self.run_task(result["task"]["id"], "until_gate")
        result["task"] = execution["task"]
        result["workflow"] = execution["workflow"]
        result["executed"] = execution["executed"]
        if execution["workflow"]["state"] == "waiting_approval":
            result["accepted"] = False
            result["message"] = "أكمل الفريق التحضير والمراجعة والأمن، وتوقفت الدورة عند بوابة سلطتك."
        elif execution["workflow"]["state"] == "completed":
            result["accepted"] = True
            result["message"] = "أكمل الفريق الدورة المحلية الآمنة وسجّل جميع مراحلها."
        return result

    def connect_cto(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Activate one session-only model after all three inference gates pass."""
        return self._cto.connect(
            provider_id=payload.get("provider_id", ""),
            endpoint=payload.get("endpoint", ""),
            model=payload.get("model", ""),
            secret=payload.get("secret", ""),
            permission_granted=payload.get("permission_granted") is True,
            rollback_ready=payload.get("rollback_ready") is True,
        )

    def disconnect_cto(self) -> Dict[str, Any]:
        """Forget the web CTO credential and return to offline orchestration."""
        return self._cto.disconnect()

    def run_cto_goal(self, command: str) -> Dict[str, Any]:
        """Ask the live model to plan a goal, then stage that plan without fake side effects."""
        context_state = self.get_state()
        context = {
            "project": context_state.get("project", {}).get("name", "Atlantis-X"),
            "open_tasks": sum(
                task.get("status") != "completed" for task in context_state.get("tasks", [])
            ),
            "waiting_for_commander": context_state.get("runtime", {}).get("waiting_approval", 0),
            "external_automation_enabled": False,
            "available_internal_roles": [agent.get("id") for agent in context_state.get("agents", [])],
        }
        cto_plan = self._cto.run_goal(command, context)
        result = self.create_command(command)

        with self._lock:
            runtime = self._load_runtime()
            task, _ = self._find_task(runtime, result["task"]["id"])
            needs_approval = bool(
                result["requires_approval"]
                or result["task"].get("priority") == "critical"
                or cto_plan["requires_approval"]
                or cto_plan["risk_level"] in {"high", "critical"}
            )
            delegated_agents = list(dict.fromkeys(
                delegation["owner"] for delegation in cto_plan["delegations"]
            ))
            lead_executor = next(
                (agent_id for agent_id in delegated_agents if agent_id != "orion"),
                "orion",
            )
            task.update({
                "source": "ORION AI CTO",
                "owner": "orion",
                "executor": lead_executor,
                "delegated_agents": delegated_agents,
                "requires_approval": needs_approval,
                "cto_plan": cto_plan,
                "status": "in_progress",
                "progress": self.STAGE_PROGRESS["plan"],
            })
            workflow = self._new_workflow(task, fresh=True)
            workflow["policy"]["execution_scope"] = "ai_planning_only"
            plan_stage = workflow["stages"][0]
            plan_stage.update({
                "owner": "orion",
                "status": "done",
                "result": "ORION produced a provider-backed CTO plan; no external action was executed.",
                "completed_at": self._now_iso(),
            })
            workflow["cursor"] = 1
            workflow["state"] = "ready"
            workflow["stages"][1]["status"] = "ready"
            self._record_workflow_event(
                runtime,
                workflow,
                task,
                plan_stage,
                "ORION generated a model-backed CTO plan inside the no-side-effect boundary.",
                "planned",
            )
            runtime["workflows"][task["id"]] = workflow
            self._save_runtime(runtime)

        result.update({
            "accepted": not needs_approval,
            "requires_approval": needs_approval,
            "task": task,
            "owner_name": self._agent_name("orion"),
            "executor_name": self._agent_name(lead_executor),
            "workflow": workflow,
            "cto_plan": cto_plan,
            "plan": [item["action"] for item in cto_plan["delegations"]],
            "executed": ["provider_inference", "plan_staged"],
            "message": (
                "ORION prepared the CTO plan. Commander approval is required before its sovereign steps."
                if needs_approval
                else "ORION prepared and staged the CTO plan. No external action was executed."
            ),
        })
        return result

    @staticmethod
    def _build_plan(task: Dict[str, Any], owner_name: str, needs_approval: bool) -> List[str]:
        if needs_approval:
            return [
                "منع أي أثر خارجي مع السماح بالتحضير المعزول",
                "تفكيك التوجيه إلى نطاق ومخاطر وخطة رجوع",
                "عرض طلب موافقة محدد على القائد",
                "التنفيذ فقط بعد الموافقة والتدقيق الأمني",
            ]
        return [
            "تسجيل {} في سجل العمل".format(task["id"]),
            "تعيين التنفيذ إلى {}".format(owner_name),
            "التحقق من المخرجات ومؤشرات القبول",
            "مراجعة أمنية ثم إدراج النتيجة في الموجز التنفيذي",
        ]

    def _agent_name(self, agent_id: str) -> str:
        for agent in self._base.get("agents", []):
            if agent["id"] == agent_id:
                return agent["name"]
        return agent_id.upper()

    def update_task_status(self, task_id: str, status: str) -> Dict[str, Any]:
        if status not in self.ALLOWED_STATUSES:
            raise ValueError("حالة المهمة غير صالحة")

        with self._lock:
            runtime = self._load_runtime()
            selected: Optional[Dict[str, Any]] = None
            for task in runtime["tasks"]:
                if task["id"] == task_id:
                    task["status"] = status
                    task["progress"] = self._progress_for_status(status, task.get("progress", 0))
                    selected = task
                    break

            if selected is None:
                for base_task in self._base.get("tasks", []):
                    if base_task["id"] == task_id:
                        override = {
                            "status": status,
                            "progress": self._progress_for_status(status, base_task.get("progress", 0)),
                        }
                        runtime["overrides"][task_id] = override
                        selected = copy.deepcopy(base_task)
                        selected.update(override)
                        break

            if selected is None:
                raise KeyError("المهمة غير موجودة")

            workflow = runtime["workflows"].get(task_id)
            if workflow and status == "completed":
                for stage in workflow["stages"]:
                    if stage["status"] != "skipped":
                        stage["status"] = "done"
                workflow["cursor"] = len(workflow["stages"])
                workflow["state"] = "completed"
            elif workflow and status == "blocked":
                workflow["state"] = "blocked"
            elif workflow and status in {"queued", "in_progress", "review", "approval"}:
                rebuilt = self._new_workflow(selected)
                rebuilt["audit"] = workflow.get("audit", [])
                rebuilt["created_at"] = workflow.get("created_at", rebuilt["created_at"])
                runtime["workflows"][task_id] = workflow = rebuilt

            if workflow:
                workflow["updated_at"] = self._now_iso()
                active_stage = next(
                    (stage for stage in workflow["stages"] if stage["status"] in {"ready", "running", "waiting"}),
                    workflow["stages"][-1],
                )
                workflow["audit"].insert(0, {
                    "id": "AUD-{}-{:02d}".format(
                        datetime.now(timezone.utc).strftime("%H%M%S"), len(workflow["audit"]) + 1
                    ),
                    "task_id": task_id,
                    "stage": active_stage["id"],
                    "agent": "orion",
                    "outcome": "override",
                    "message": "تغيير يدوي لحالة المهمة إلى {} من مركز القيادة.".format(status),
                    "created_at": workflow["updated_at"],
                })

            runtime["activities"].insert(0, {
                "agent": selected.get("owner", "atlas"),
                "type": "task",
                "text": "تم تحديث {} إلى {}".format(task_id, status),
                "time": self._relative_time(),
                "created_at": self._now_iso(),
            })
            self._save_runtime(runtime)
            return selected

    @staticmethod
    def _progress_for_status(status: str, current: int) -> int:
        if status == "completed":
            return 100
        if status == "review":
            return max(current, 85)
        if status == "in_progress":
            return max(current, 10)
        if status in {"queued", "approval"}:
            return 0
        return current


class CommandCenterHandler(SimpleHTTPRequestHandler):
    """Serve the dashboard and the local workforce API."""

    server_version = "AtlantisX/2.3"
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json",
    }

    def __init__(
        self,
        *args: Any,
        engine: WorkforceEngine,
        commander_key: str = "",
        **kwargs: Any,
    ) -> None:
        self.engine = engine
        self.commander_key = commander_key
        super().__init__(*args, directory=str(WEB_PATH), **kwargs)

    def log_message(self, format_string: str, *args: Any) -> None:
        print("[command-center] {} - {}".format(self.address_string(), format_string % args))

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; style-src 'self' 'unsafe-inline'; "
            "script-src 'self'; font-src 'self' data:; img-src 'self' data:; connect-src 'self'; "
            "worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; "
            "frame-ancestors 'self' https://*.e2b.app https://arena.ai https://*.arena.ai",
        )
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _is_authorized(self) -> bool:
        if not self.commander_key:
            return True
        authorization = self.headers.get("Authorization", "")
        scheme, _, provided = authorization.partition(" ")
        return scheme.casefold() == "bearer" and hmac.compare_digest(provided, self.commander_key)

    def _require_commander(self) -> bool:
        if self._is_authorized():
            return True
        self._send_json(
            {"error": "يلزم مفتاح القائد للوصول إلى مركز التحكم", "code": "AUTH_REQUIRED"},
            HTTPStatus.UNAUTHORIZED,
            extra_headers={"WWW-Authenticate": 'Bearer realm="Atlantis-X Commander"'},
        )
        return False

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/health":
            self._send_json({
                "status": "ok",
                "service": "atlantis-x-command-center",
                "version": "2.3",
                "commander_auth_required": bool(self.commander_key),
            })
            return
        if path == "/api/state":
            if not self._require_commander():
                return
            state = self.engine.get_state()
            state["runtime"]["authority"] = {
                "mode": "commander_key" if self.commander_key else "local_single_user",
                "verified": bool(self.commander_key),
            }
            self._send_json(state)
            return
        if path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if not self._require_commander():
            return
        try:
            payload = self._read_payload()
            if path == "/api/cto/connect":
                status = self.engine.connect_cto(payload)
                self._send_json({"cto": status})
                return

            if path == "/api/cto/disconnect":
                status = self.engine.disconnect_cto()
                self._send_json({"cto": status})
                return

            if path == "/api/cto/run":
                result = self.engine.run_cto_goal(payload.get("command", ""))
                self._send_json(result, HTTPStatus.CREATED)
                return

            if path == "/api/commands":
                autorun = payload.get("autorun", True)
                if not isinstance(autorun, bool):
                    raise ValueError("autorun يجب أن يكون قيمة منطقية")
                result = self.engine.dispatch_command(payload.get("command", ""), autorun)
                self._send_json(result, HTTPStatus.CREATED)
                return

            match = re.fullmatch(r"/api/tasks/(AX-\d+)/run", path)
            if match:
                result = self.engine.run_task(match.group(1), payload.get("mode", "until_gate"))
                self._send_json(result)
                return

            match = re.fullmatch(r"/api/tasks/(AX-\d+)/decision", path)
            if match:
                result = self.engine.decide_task(
                    match.group(1),
                    payload.get("decision", ""),
                    payload.get("note", ""),
                )
                self._send_json(result)
                return

            match = re.fullmatch(r"/api/tasks/(AX-\d+)/status", path)
            if match:
                result = self.engine.update_task_status(match.group(1), payload.get("status", ""))
                self._send_json({"task": result})
                return

            self._send_json({"error": "المسار غير موجود"}, HTTPStatus.NOT_FOUND)
        except CtoAgentError as exc:
            self._send_json({"error": str(exc), "code": "CTO_PROVIDER_ERROR"}, HTTPStatus.BAD_GATEWAY)
        except ValueError as exc:
            self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except KeyError as exc:
            self._send_json({"error": str(exc).strip("'")}, HTTPStatus.NOT_FOUND)
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send_json({"error": "صيغة JSON غير صالحة"}, HTTPStatus.BAD_REQUEST)

    def _read_payload(self) -> Dict[str, Any]:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise ValueError("Content-Length غير صالح") from exc
        if length < 0:
            raise ValueError("Content-Length غير صالح")
        if length > 16_384:
            raise ValueError("حجم الطلب أكبر من الحد المسموح")
        body = self.rfile.read(length)
        if not body:
            return {}
        payload = json.loads(body.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("يجب أن يكون الطلب كائن JSON")
        return payload

    def _send_json(
        self,
        payload: Dict[str, Any],
        status: HTTPStatus = HTTPStatus.OK,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status.value)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for name, value in (extra_headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def make_server(
    host: str = "0.0.0.0",
    port: int = 4173,
    commander_key: Optional[str] = None,
    engine: Optional[WorkforceEngine] = None,
) -> ReusableThreadingHTTPServer:
    engine = engine or WorkforceEngine()
    key = os.environ.get("ATLANTISX_COMMANDER_KEY", "") if commander_key is None else commander_key
    if key and len(key) < 16:
        raise ValueError("ATLANTISX_COMMANDER_KEY must contain at least 16 characters")
    handler = partial(CommandCenterHandler, engine=engine, commander_key=key)
    server = ReusableThreadingHTTPServer((host, port), handler)
    server.commander_auth_required = bool(key)  # type: ignore[attr-defined]
    return server


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Atlantis-X AI Command Center")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", default=4173, type=int)
    args = parser.parse_args()

    server = make_server(args.host, args.port)
    auth_mode = "commander key required" if server.commander_auth_required else "local single-user mode"
    print("Atlantis-X Command Center: http://{}:{} ({})".format(args.host, args.port, auth_mode))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
