mod vault;

use tauri::{AppHandle, State};
use vault::{GoalRecord, VaultManager, VaultStatus};
use zeroize::Zeroizing;

#[tauri::command]
fn vault_status(app: AppHandle, vault: State<'_, VaultManager>) -> VaultStatus {
    vault.status(&app)
}

#[tauri::command]
fn unlock_vault(
    app: AppHandle,
    vault: State<'_, VaultManager>,
    passphrase: String,
) -> Result<VaultStatus, String> {
    let passphrase = Zeroizing::new(passphrase);
    vault.unlock(&app, passphrase.as_str()).map_err(|error| error.to_string())
}

#[tauri::command]
fn lock_vault(
    app: AppHandle,
    vault: State<'_, VaultManager>,
) -> Result<VaultStatus, String> {
    vault.lock(&app).map_err(|error| error.to_string())
}

#[tauri::command]
fn create_goal(
    vault: State<'_, VaultManager>,
    title: String,
) -> Result<GoalRecord, String> {
    vault.create_goal(&title).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_goals(vault: State<'_, VaultManager>) -> Result<Vec<GoalRecord>, String> {
    vault.list_goals().map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(VaultManager::default())
        .invoke_handler(tauri::generate_handler![
            vault_status,
            unlock_vault,
            lock_vault,
            create_goal,
            list_goals
        ])
        .run(tauri::generate_context!())
        .expect("error while running Atlantis-X native application");
}
