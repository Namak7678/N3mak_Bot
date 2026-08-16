mod runtime;
mod vault;

use serde_json::Value;
use std::{thread, time::Duration};
use tauri::{AppHandle, Manager, State};
use vault::{GoalRecord, VaultManager, VaultStatus};
use zeroize::Zeroizing;

#[tauri::command]
fn vault_status(app: AppHandle, manager: State<'_, VaultManager>) -> VaultStatus {
    manager.status(&app)
}

#[tauri::command]
fn unlock_vault(
    app: AppHandle,
    manager: State<'_, VaultManager>,
    passphrase: String,
) -> Result<VaultStatus, String> {
    let passphrase = Zeroizing::new(passphrase);
    manager
        .unlock(&app, passphrase.as_str())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn lock_vault(
    app: AppHandle,
    manager: State<'_, VaultManager>,
) -> Result<VaultStatus, String> {
    manager.lock(&app).map_err(|error| error.to_string())
}

#[tauri::command]
fn create_goal(
    manager: State<'_, VaultManager>,
    title: String,
) -> Result<GoalRecord, String> {
    manager
        .create_goal(&title)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_goals(manager: State<'_, VaultManager>) -> Result<Vec<GoalRecord>, String> {
    manager.list_goals().map_err(|error| error.to_string())
}

#[tauri::command]
fn native_state(manager: State<'_, VaultManager>) -> Result<Value, String> {
    runtime::state(&manager).map_err(|error| error.to_string())
}

#[tauri::command]
fn dispatch_command(
    manager: State<'_, VaultManager>,
    command: String,
    autorun: Option<bool>,
) -> Result<Value, String> {
    runtime::dispatch(&manager, &command, autorun.unwrap_or(true))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn run_workflow_task(
    manager: State<'_, VaultManager>,
    task_id: String,
    mode: String,
) -> Result<Value, String> {
    runtime::run_task(&manager, &task_id, &mode).map_err(|error| error.to_string())
}

#[tauri::command]
fn decide_workflow_task(
    manager: State<'_, VaultManager>,
    task_id: String,
    decision: String,
    note: Option<String>,
) -> Result<Value, String> {
    runtime::decide_task(&manager, &task_id, &decision, note.as_deref().unwrap_or(""))
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_task_status(
    manager: State<'_, VaultManager>,
    task_id: String,
    status: String,
) -> Result<Value, String> {
    runtime::update_task_status(&manager, &task_id, &status).map_err(|error| error.to_string())
}

#[tauri::command]
fn configure_provider(
    manager: State<'_, VaultManager>,
    provider_id: String,
    endpoint: String,
    model: String,
    secret: Option<String>,
) -> Result<Value, String> {
    let secret = secret.map(Zeroizing::new);
    runtime::configure_provider(
        &manager,
        &provider_id,
        &endpoint,
        &model,
        secret.as_ref().map(|value| value.as_str()),
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_provider_permission(
    manager: State<'_, VaultManager>,
    provider_id: String,
    granted: bool,
) -> Result<Value, String> {
    runtime::provider_permission(&manager, &provider_id, granted)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_provider_rollback(
    manager: State<'_, VaultManager>,
    provider_id: String,
    ready: bool,
) -> Result<Value, String> {
    runtime::provider_rollback(&manager, &provider_id, ready)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn verify_provider_health(
    manager: State<'_, VaultManager>,
    provider_id: String,
) -> Result<Value, String> {
    runtime::verify_provider(&manager, &provider_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn set_provider_enabled(
    manager: State<'_, VaultManager>,
    provider_id: String,
    enabled: bool,
) -> Result<Value, String> {
    runtime::enable_provider(&manager, &provider_id, enabled)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn erase_provider_credential(
    manager: State<'_, VaultManager>,
    provider_id: String,
) -> Result<Value, String> {
    runtime::erase_provider_credential(&manager, &provider_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn provider_chat(
    manager: State<'_, VaultManager>,
    provider_id: String,
    prompt: String,
) -> Result<Value, String> {
    runtime::provider_chat(&manager, &provider_id, &prompt).map_err(|error| error.to_string())
}

#[tauri::command]
fn install_skill(
    manager: State<'_, VaultManager>,
    content: String,
) -> Result<Value, String> {
    runtime::install_skill(&manager, &content).map_err(|error| error.to_string())
}

#[tauri::command]
fn set_skill_enabled(
    manager: State<'_, VaultManager>,
    skill_id: String,
    enabled: bool,
) -> Result<Value, String> {
    runtime::enable_skill(&manager, &skill_id, enabled).map_err(|error| error.to_string())
}

#[tauri::command]
fn remove_skill(
    manager: State<'_, VaultManager>,
    skill_id: String,
) -> Result<Value, String> {
    runtime::remove_skill(&manager, &skill_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn preview_migration(
    payload: Value,
    source_name: String,
) -> Result<Value, String> {
    runtime::preview_import(&payload, &source_name).map_err(|error| error.to_string())
}

#[tauri::command]
fn apply_migration(
    manager: State<'_, VaultManager>,
    payload: Value,
    source_name: String,
) -> Result<Value, String> {
    runtime::apply_import(&manager, &payload, &source_name).map_err(|error| error.to_string())
}

#[tauri::command]
fn create_team(
    manager: State<'_, VaultManager>,
    name: String,
    mission: String,
) -> Result<Value, String> {
    runtime::create_team(&manager, &name, &mission).map_err(|error| error.to_string())
}

#[tauri::command]
fn add_team_member(
    manager: State<'_, VaultManager>,
    team_id: String,
    member_type: String,
    name: String,
    role: String,
) -> Result<Value, String> {
    runtime::add_team_member(&manager, &team_id, &member_type, &name, &role)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_team_enabled(
    manager: State<'_, VaultManager>,
    team_id: String,
    enabled: bool,
) -> Result<Value, String> {
    runtime::toggle_team(&manager, &team_id, enabled).map_err(|error| error.to_string())
}

#[tauri::command]
fn create_schedule(
    manager: State<'_, VaultManager>,
    name: String,
    goal_template: String,
    frequency: String,
) -> Result<Value, String> {
    runtime::create_schedule(&manager, &name, &goal_template, &frequency)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_schedule_enabled(
    manager: State<'_, VaultManager>,
    schedule_id: String,
    enabled: bool,
) -> Result<Value, String> {
    runtime::toggle_schedule(&manager, &schedule_id, enabled)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_schedule(
    manager: State<'_, VaultManager>,
    schedule_id: String,
) -> Result<Value, String> {
    runtime::delete_schedule(&manager, &schedule_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn run_due_schedules(manager: State<'_, VaultManager>) -> Result<Value, String> {
    runtime::run_due_schedules(&manager).map_err(|error| error.to_string())
}

#[tauri::command]
fn capability_gate_summary(manager: State<'_, VaultManager>) -> Result<Value, String> {
    runtime::capability_gate_summary(&manager).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(VaultManager::default())
        .setup(|app| {
            let app_handle = app.handle().clone();
            thread::spawn(move || loop {
                thread::sleep(Duration::from_secs(30));
                let manager = app_handle.state::<VaultManager>();
                // A locked vault intentionally skips due work. The next active interval catches up.
                let _ = runtime::run_due_schedules(&manager);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vault_status,
            unlock_vault,
            lock_vault,
            create_goal,
            list_goals,
            native_state,
            dispatch_command,
            run_workflow_task,
            decide_workflow_task,
            set_task_status,
            configure_provider,
            set_provider_permission,
            set_provider_rollback,
            verify_provider_health,
            set_provider_enabled,
            erase_provider_credential,
            provider_chat,
            install_skill,
            set_skill_enabled,
            remove_skill,
            preview_migration,
            apply_migration,
            create_team,
            add_team_member,
            set_team_enabled,
            create_schedule,
            set_schedule_enabled,
            delete_schedule,
            run_due_schedules,
            capability_gate_summary
        ])
        .run(tauri::generate_context!())
        .expect("error while running Atlantis-X native application");
}
