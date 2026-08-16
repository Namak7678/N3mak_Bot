use argon2::Argon2;
use chrono::Utc;
use rand::{rngs::OsRng, RngCore};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager};
use thiserror::Error;
use uuid::Uuid;
use zeroize::Zeroizing;

const SALT_BYTES: usize = 16;
const KEY_BYTES: usize = 32;
const MIN_PASSPHRASE_LENGTH: usize = 12;

#[derive(Debug, Error)]
pub enum VaultError {
    #[error("vault passphrase must contain at least {0} characters")]
    WeakPassphrase(usize),
    #[error("vault is locked")]
    Locked,
    #[error("goal title must contain between 3 and 500 characters")]
    InvalidGoal,
    #[error("unable to access the application data directory: {0}")]
    AppData(String),
    #[error("vault filesystem operation failed: {0}")]
    Filesystem(#[from] std::io::Error),
    #[error("vault key derivation failed")]
    KeyDerivation,
    #[error("SQLCipher is unavailable or the vault passphrase is incorrect")]
    CipherUnavailable,
    #[error("encrypted database operation failed: {0}")]
    Database(#[from] rusqlite::Error),
}

#[derive(Debug)]
struct UnlockedVault {
    database_path: PathBuf,
    key_hex: Zeroizing<String>,
}

#[derive(Default)]
pub struct VaultManager {
    unlocked: Mutex<Option<UnlockedVault>>,
}

#[derive(Serialize)]
pub struct VaultStatus {
    pub backend: &'static str,
    pub encrypted: bool,
    pub unlocked: bool,
    pub initialized: bool,
    pub schema_version: u8,
    pub external_automation_enabled: bool,
}

#[derive(Serialize)]
pub struct GoalRecord {
    pub id: String,
    pub title: String,
    pub status: String,
    pub created_at: String,
}

impl VaultManager {
    pub fn status(&self, app: &AppHandle) -> VaultStatus {
        let initialized = app
            .path()
            .app_data_dir()
            .map(|path| {
                path.join("vault.salt").is_file() && path.join("atlantis-x-vault.db").is_file()
            })
            .unwrap_or(false);
        VaultStatus {
            backend: "sqlcipher",
            encrypted: true,
            unlocked: self.unlocked.lock().map(|state| state.is_some()).unwrap_or(false),
            initialized,
            schema_version: 1,
            external_automation_enabled: false,
        }
    }

    pub fn unlock(&self, app: &AppHandle, passphrase: &str) -> Result<VaultStatus, VaultError> {
        // Never leave a previous vault session usable after a failed re-unlock attempt.
        let mut previous = self.unlocked.lock().map_err(|_| VaultError::Locked)?;
        *previous = None;
        drop(previous);

        if passphrase.chars().count() < MIN_PASSPHRASE_LENGTH {
            return Err(VaultError::WeakPassphrase(MIN_PASSPHRASE_LENGTH));
        }

        let app_data = app
            .path()
            .app_data_dir()
            .map_err(|error| VaultError::AppData(error.to_string()))?;
        fs::create_dir_all(&app_data)?;
        let salt = load_or_create_salt(&app_data.join("vault.salt"))?;
        let key_hex = derive_key(passphrase, &salt)?;
        let database_path = app_data.join("atlantis-x-vault.db");
        let connection = open_encrypted_connection(&database_path, &key_hex)?;
        initialize_schema(&connection)?;

        let mut state = self.unlocked.lock().map_err(|_| VaultError::Locked)?;
        *state = Some(UnlockedVault {
            database_path,
            key_hex: Zeroizing::new(key_hex),
        });
        drop(state);
        Ok(self.status(app))
    }

    pub fn lock(&self, app: &AppHandle) -> Result<VaultStatus, VaultError> {
        let mut state = self.unlocked.lock().map_err(|_| VaultError::Locked)?;
        *state = None;
        drop(state);
        Ok(self.status(app))
    }

    pub fn create_goal(&self, title: &str) -> Result<GoalRecord, VaultError> {
        let clean_title = title.split_whitespace().collect::<Vec<_>>().join(" ");
        if clean_title.chars().count() < 3 || clean_title.chars().count() > 500 {
            return Err(VaultError::InvalidGoal);
        }
        let record = GoalRecord {
            id: Uuid::new_v4().to_string(),
            title: clean_title,
            status: "queued".to_string(),
            created_at: Utc::now().to_rfc3339(),
        };
        self.with_connection(|connection| {
            let transaction = connection.unchecked_transaction()?;
            transaction.execute(
                "INSERT INTO goals(id, title, status, created_at) VALUES(?1, ?2, ?3, ?4)",
                params![record.id, record.title, record.status, record.created_at],
            )?;
            transaction.execute(
                "INSERT INTO audit_events(id, event_type, outcome, payload, created_at) VALUES(?1, 'goal.created', 'queued', ?2, ?3)",
                params![Uuid::new_v4().to_string(), serde_json::to_string(&record).unwrap_or_default(), record.created_at],
            )?;
            transaction.commit()?;
            Ok(())
        })?;
        Ok(record)
    }

    pub fn list_goals(&self) -> Result<Vec<GoalRecord>, VaultError> {
        self.with_connection(|connection| {
            let mut statement = connection.prepare(
                "SELECT id, title, status, created_at FROM goals ORDER BY created_at DESC",
            )?;
            let rows = statement.query_map([], |row| {
                Ok(GoalRecord {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    status: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>().map_err(VaultError::from)
        })
    }

    fn with_connection<T>(
        &self,
        operation: impl FnOnce(&mut Connection) -> Result<T, VaultError>,
    ) -> Result<T, VaultError> {
        let state = self.unlocked.lock().map_err(|_| VaultError::Locked)?;
        let vault = state.as_ref().ok_or(VaultError::Locked)?;
        let mut connection = open_encrypted_connection(&vault.database_path, &vault.key_hex)?;
        operation(&mut connection)
    }
}

fn load_or_create_salt(path: &Path) -> Result<Vec<u8>, VaultError> {
    if path.exists() {
        let salt = fs::read(path)?;
        if salt.len() == SALT_BYTES {
            return Ok(salt);
        }
        return Err(VaultError::KeyDerivation);
    }
    let mut salt = vec![0_u8; SALT_BYTES];
    OsRng.fill_bytes(&mut salt);
    fs::write(path, &salt)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    }
    Ok(salt)
}

fn derive_key(passphrase: &str, salt: &[u8]) -> Result<String, VaultError> {
    let mut output = Zeroizing::new([0_u8; KEY_BYTES]);
    Argon2::default()
        .hash_password_into(passphrase.as_bytes(), salt, &mut output[..])
        .map_err(|_| VaultError::KeyDerivation)?;
    Ok(hex::encode(&output[..]))
}

fn open_encrypted_connection(path: &Path, key_hex: &str) -> Result<Connection, VaultError> {
    let connection = Connection::open(path)?;
    // The formatted PRAGMA contains key material, so zeroize its allocation after use.
    let key_pragma = Zeroizing::new(format!(
        "PRAGMA key = \"x'{}'\";\
         PRAGMA cipher_memory_security = ON;\
         PRAGMA foreign_keys = ON;\
         PRAGMA journal_mode = WAL;\
         PRAGMA synchronous = FULL;\
         PRAGMA busy_timeout = 10000;",
        key_hex
    ));
    connection.execute_batch(key_pragma.as_str())?;
    let cipher_version = connection.query_row("PRAGMA cipher_version", [], |row| row.get::<_, String>(0));
    if cipher_version.is_err() {
        return Err(VaultError::CipherUnavailable);
    }
    Ok(connection)
}

fn initialize_schema(connection: &Connection) -> Result<(), VaultError> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS vault_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS goals (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('queued','running','waiting_approval','completed','blocked')),
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS schedules (
            id TEXT PRIMARY KEY,
            goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
            schedule_expression TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
            next_run_at TEXT
        );
        CREATE TABLE IF NOT EXISTS skills (
            id TEXT PRIMARY KEY,
            version TEXT NOT NULL,
            manifest TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
            installed_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS capability_grants (
            capability_id TEXT PRIMARY KEY,
            permission_granted INTEGER NOT NULL DEFAULT 0 CHECK(permission_granted IN (0,1)),
            health_verified INTEGER NOT NULL DEFAULT 0 CHECK(health_verified IN (0,1)),
            rollback_ready INTEGER NOT NULL DEFAULT 0 CHECK(rollback_ready IN (0,1)),
            enabled INTEGER NOT NULL DEFAULT 0 CHECK(
                enabled = 0 OR (permission_granted = 1 AND health_verified = 1 AND rollback_ready = 1)
            ),
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_events (
            id TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            outcome TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        INSERT OR IGNORE INTO vault_metadata(key, value) VALUES('schema_version', '1');",
    )?;
    connection.query_row("SELECT value FROM vault_metadata WHERE key='schema_version'", [], |_| Ok(()))?;
    Ok(())
}
