use crate::engine::export::{ExportOptions, ExportProgressUpdate};
use rusqlite::{params, Connection, DatabaseName, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const DATABASE_FILE: &str = "quickpick.sqlite3";
const BACKUP_FILE: &str = "quickpick.backup.sqlite3";
const SESSION_FILE: &str = "quickpick.session";
const RECOVERY_DIR: &str = "recovery";
const BACKUP_INTERVAL_SECS: u64 = 10;
const SCHEMA_VERSION: i64 = 5;
const FINGERPRINT_CHUNK_SIZE: u64 = 64 * 1024;

#[derive(Debug, Clone, Deserialize)]
pub struct ProjectPhotoInput {
    pub photo_id: String,
    pub path: String,
    pub filename: String,
    pub file_size: u64,
    pub format: String,
    pub captured_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PersistedSelection {
    pub photo_id: String,
    pub state: String,
    pub note: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ProjectState {
    pub project_id: String,
    pub selections: Vec<PersistedSelection>,
    pub viewed_photo_ids: Vec<String>,
    pub backup_warning: Option<String>,
    pub current_photo_id: Option<String>,
    pub target_count: Option<u32>,
    pub active_filter: String,
    pub selected_scene_id: Option<String>,
    pub active_preset_id: String,
    pub scenes_json: String,
    pub photo_id_remaps: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct PersistenceOutcome {
    pub backup_warning: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProjectViewStateInput {
    pub current_photo_id: Option<String>,
    pub target_count: Option<u32>,
    pub active_filter: String,
    pub selected_scene_id: Option<String>,
    pub active_preset_id: String,
    pub scenes_json: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct RecentProject {
    pub project_id: String,
    pub source_root: String,
    pub display_name: String,
    pub updated_at: String,
    pub photo_count: u32,
    pub viewed_count: u32,
    pub selected_count: u32,
    pub source_available: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct StartupHealth {
    pub previous_session_unclean: bool,
    pub database_recovered: bool,
    pub database_error: Option<String>,
    pub recovered_export_jobs: u32,
    pub cleaned_export_temp_files: u32,
    pub export_recovery_error: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ExportRecoverySummary {
    pub recovered_jobs: u32,
    pub cleaned_temp_files: u32,
}

pub struct ExportJobRecorder {
    connection: Connection,
    app_data_dir: PathBuf,
    job_id: String,
}

fn database_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(DATABASE_FILE)
}

fn backup_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(BACKUP_FILE)
}

fn session_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(SESSION_FILE)
}

fn session_process_id(marker: &Path) -> Option<u32> {
    fs::read_to_string(marker)
        .ok()?
        .lines()
        .next()?
        .parse()
        .ok()
}

#[cfg(unix)]
fn process_is_alive(process_id: u32) -> bool {
    // SAFETY: `kill` with signal 0 performs existence/permission checking and sends no signal.
    let result = unsafe { libc::kill(process_id as libc::pid_t, 0) };
    result == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

#[cfg(windows)]
fn process_is_alive(process_id: u32) -> bool {
    #[link(name = "kernel32")]
    extern "system" {
        fn OpenProcess(desired_access: u32, inherit_handle: i32, process_id: u32) -> *mut u8;
        fn GetExitCodeProcess(process: *mut u8, exit_code: *mut u32) -> i32;
        fn CloseHandle(handle: *mut u8) -> i32;
    }
    const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
    const STILL_ACTIVE: u32 = 259;
    // SAFETY: the process ID is a plain value and the returned handle is validated before use.
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id) };
    if handle.is_null() {
        return false;
    }
    let mut exit_code = 0_u32;
    // SAFETY: `handle` is non-null and `exit_code` is valid writable memory.
    let succeeded = unsafe { GetExitCodeProcess(handle, &mut exit_code) } != 0;
    // SAFETY: `handle` was returned by `OpenProcess` and is closed exactly once.
    unsafe { CloseHandle(handle) };
    succeeded && exit_code == STILL_ACTIVE
}

pub fn begin_app_session(app_data_dir: &Path) -> Result<StartupHealth, String> {
    fs::create_dir_all(app_data_dir).map_err(|error| format!("创建应用数据目录失败: {error}"))?;
    let marker = session_path(app_data_dir);
    let previous_session_unclean = marker.exists();
    if let Some(owner_process_id) = session_process_id(&marker) {
        if owner_process_id != std::process::id() && process_is_alive(owner_process_id) {
            return Err(
                "检测到另一个 QuickPick 实例正在使用项目数据库，已停止启动以保护进行中的导出任务"
                    .to_string(),
            );
        }
    }
    let primary = database_path(app_data_dir);
    let database_was_corrupt = primary.exists() && !database_is_healthy(&primary);
    let database_error = recover_corrupt_database(app_data_dir).err();
    let export_recovery = if database_error.is_none() {
        recover_interrupted_export_jobs(app_data_dir)
    } else {
        Err("项目数据库不可用，无法恢复未完成的导出任务".to_string())
    };

    let marker_contents = format!("{}\n{}\n", std::process::id(), now());
    fs::write(&marker, marker_contents)
        .map_err(|error| format!("创建异常退出检测标记失败: {error}"))?;

    Ok(StartupHealth {
        previous_session_unclean,
        database_recovered: database_was_corrupt && database_error.is_none(),
        database_error,
        recovered_export_jobs: export_recovery
            .as_ref()
            .map_or(0, |summary| summary.recovered_jobs),
        cleaned_export_temp_files: export_recovery
            .as_ref()
            .map_or(0, |summary| summary.cleaned_temp_files),
        export_recovery_error: export_recovery.err(),
    })
}

pub fn end_app_session(app_data_dir: &Path) -> Result<(), String> {
    let marker = session_path(app_data_dir);
    if marker.exists() {
        fs::remove_file(marker).map_err(|error| format!("清理应用会话标记失败: {error}"))?;
    }
    Ok(())
}

fn database_is_healthy(path: &Path) -> bool {
    let Ok(connection) = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY) else {
        return false;
    };
    connection
        .pragma_query_value(None, "quick_check", |row| row.get::<_, String>(0))
        .is_ok_and(|result| result == "ok")
}

fn quarantine_file(path: &Path, recovery_dir: &Path, label: &str) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    let destination = recovery_dir.join(format!(
        "{label}-{}-{}",
        chrono::Utc::now().format("%Y%m%dT%H%M%S%.3fZ"),
        uuid::Uuid::new_v4()
    ));
    fs::rename(path, destination).map_err(|error| format!("隔离损坏数据库文件失败: {error}"))
}

fn recover_corrupt_database(app_data_dir: &Path) -> Result<(), String> {
    let primary = database_path(app_data_dir);
    if !primary.exists() || database_is_healthy(&primary) {
        return Ok(());
    }

    let backup = backup_path(app_data_dir);
    if !backup.exists() || !database_is_healthy(&backup) {
        return Err("项目数据库已损坏且没有可用备份；已停止写入以保护现有数据".to_string());
    }

    let recovery_dir = app_data_dir.join(RECOVERY_DIR);
    fs::create_dir_all(&recovery_dir)
        .map_err(|error| format!("创建数据库恢复目录失败: {error}"))?;
    quarantine_file(&primary, &recovery_dir, "quickpick-corrupt.sqlite3")?;
    quarantine_file(
        &primary.with_extension("sqlite3-wal"),
        &recovery_dir,
        "quickpick-corrupt.wal",
    )?;
    quarantine_file(
        &primary.with_extension("sqlite3-shm"),
        &recovery_dir,
        "quickpick-corrupt.shm",
    )?;
    fs::copy(&backup, &primary)
        .map_err(|error| format!("从安全备份恢复项目数据库失败: {error}"))?;
    if !database_is_healthy(&primary) {
        return Err("备份恢复后的项目数据库仍未通过完整性检查".to_string());
    }
    Ok(())
}

fn backup_database(connection: &Connection, app_data_dir: &Path) -> Result<(), String> {
    let temporary = app_data_dir.join(format!(".quickpick.backup.{}.tmp", uuid::Uuid::new_v4()));
    connection
        .backup(DatabaseName::Main, &temporary, None)
        .map_err(|error| format!("创建项目数据库在线备份失败: {error}"))?;

    let backup = backup_path(app_data_dir);
    let previous = app_data_dir.join("quickpick.backup.previous.sqlite3");
    if previous.exists() {
        fs::remove_file(&previous).map_err(|error| format!("轮换旧数据库备份失败: {error}"))?;
    }
    if backup.exists() {
        fs::rename(&backup, &previous)
            .map_err(|error| format!("保留上一份数据库备份失败: {error}"))?;
    }
    if let Err(error) = fs::rename(&temporary, &backup) {
        if previous.exists() {
            let _ = fs::rename(&previous, &backup);
        }
        let _ = fs::remove_file(&temporary);
        return Err(format!("提交项目数据库备份失败: {error}"));
    }
    Ok(())
}

fn backup_database_if_due(connection: &Connection, app_data_dir: &Path) -> Result<(), String> {
    let backup = backup_path(app_data_dir);
    let is_due = fs::metadata(&backup)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.elapsed().ok())
        .is_none_or(|age| age.as_secs() >= BACKUP_INTERVAL_SECS);
    if is_due {
        backup_database(connection, app_data_dir)?;
    }
    Ok(())
}

fn open_connection(app_data_dir: &Path) -> Result<Connection, String> {
    fs::create_dir_all(app_data_dir).map_err(|error| format!("创建应用数据目录失败: {error}"))?;
    recover_corrupt_database(app_data_dir)?;
    let connection = Connection::open(database_path(app_data_dir))
        .map_err(|error| format!("打开项目数据库失败: {error}"))?;
    connection
        .pragma_update(None, "journal_mode", "WAL")
        .map_err(|error| format!("启用数据库 WAL 失败: {error}"))?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|error| format!("启用数据库外键失败: {error}"))?;
    connection
        .busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|error| format!("配置数据库等待超时失败: {error}"))?;
    let version_before_migration: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|error| format!("读取升级前数据库版本失败: {error}"))?;
    if (1..SCHEMA_VERSION).contains(&version_before_migration) {
        backup_database(&connection, app_data_dir)
            .map_err(|error| format!("数据库升级前备份失败，已停止迁移: {error}"))?;
    }
    migrate(&connection)?;
    Ok(connection)
}

fn migrate(connection: &Connection) -> Result<(), String> {
    let current_version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|error| format!("读取数据库版本失败: {error}"))?;

    if current_version > SCHEMA_VERSION {
        return Err(format!(
            "项目数据库版本 {current_version} 高于当前应用支持的 {SCHEMA_VERSION}"
        ));
    }

    if current_version == 0 {
        connection
            .execute_batch(
                "BEGIN IMMEDIATE;
                 CREATE TABLE projects (
                   id TEXT PRIMARY KEY,
                   source_root TEXT NOT NULL UNIQUE,
                   display_name TEXT NOT NULL,
                   current_photo_id TEXT,
                   target_count INTEGER,
                   active_filter TEXT NOT NULL DEFAULT 'all',
                   selected_scene_id TEXT,
                   active_preset_id TEXT NOT NULL DEFAULT 'general',
                   scenes_json TEXT NOT NULL DEFAULT '[]',
                   created_at TEXT NOT NULL,
                   updated_at TEXT NOT NULL
                 );
                 CREATE TABLE photos (
                   project_id TEXT NOT NULL,
                   photo_id TEXT NOT NULL,
                   relative_path TEXT NOT NULL,
                   filename TEXT NOT NULL,
                   file_size INTEGER NOT NULL,
                   modified_nanos TEXT NOT NULL,
                   format TEXT NOT NULL,
                   captured_at TEXT,
                   content_fingerprint TEXT NOT NULL,
                   missing INTEGER NOT NULL DEFAULT 0,
                   PRIMARY KEY (project_id, photo_id),
                   FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
                 );
                 CREATE TABLE selections (
                   project_id TEXT NOT NULL,
                   photo_id TEXT NOT NULL,
                   state TEXT NOT NULL CHECK(state IN ('unreviewed', 'selected', 'maybe', 'skipped')),
                   note TEXT,
                   updated_at TEXT NOT NULL,
                   PRIMARY KEY (project_id, photo_id),
                   FOREIGN KEY (project_id, photo_id) REFERENCES photos(project_id, photo_id) ON DELETE CASCADE
                 );
                 CREATE TABLE review_progress (
                   project_id TEXT NOT NULL,
                   photo_id TEXT NOT NULL,
                   viewed_at TEXT NOT NULL,
                   PRIMARY KEY (project_id, photo_id),
                   FOREIGN KEY (project_id, photo_id) REFERENCES photos(project_id, photo_id) ON DELETE CASCADE
                 );
                 CREATE TABLE export_jobs (
                   id TEXT PRIMARY KEY,
                   target_directory TEXT NOT NULL,
                   status TEXT NOT NULL CHECK(status IN
                     ('pending', 'running', 'cancelling', 'completed', 'completed_with_errors',
                      'cancelled', 'interrupted', 'failed')),
                   total_items INTEGER NOT NULL,
                   error TEXT,
                   created_at TEXT NOT NULL,
                   updated_at TEXT NOT NULL
                 );
                 CREATE TABLE export_job_items (
                   job_id TEXT NOT NULL,
                   item_index INTEGER NOT NULL,
                   source_path TEXT NOT NULL,
                   target_path TEXT NOT NULL,
                   status TEXT NOT NULL CHECK(status IN
                     ('pending', 'copying', 'verified', 'committed', 'skipped', 'failed', 'unprocessed')),
                   sha256 TEXT,
                   error TEXT,
                   updated_at TEXT NOT NULL,
                   PRIMARY KEY (job_id, item_index),
                   FOREIGN KEY (job_id) REFERENCES export_jobs(id) ON DELETE CASCADE
                 );
                 PRAGMA user_version = 5;
                 COMMIT;",
            )
            .map_err(|error| format!("初始化项目数据库失败: {error}"))?;
    } else if current_version == 1 {
        connection
            .execute_batch(
                "BEGIN IMMEDIATE;
                 ALTER TABLE projects ADD COLUMN current_photo_id TEXT;
                 ALTER TABLE projects ADD COLUMN target_count INTEGER;
                 ALTER TABLE projects ADD COLUMN active_filter TEXT NOT NULL DEFAULT 'all';
                 ALTER TABLE projects ADD COLUMN selected_scene_id TEXT;
                 ALTER TABLE projects ADD COLUMN scenes_json TEXT NOT NULL DEFAULT '[]';
                 ALTER TABLE photos ADD COLUMN format TEXT NOT NULL DEFAULT 'unknown';
                 ALTER TABLE photos ADD COLUMN captured_at TEXT;
                 ALTER TABLE photos ADD COLUMN content_fingerprint TEXT NOT NULL DEFAULT '';
                 ALTER TABLE photos ADD COLUMN missing INTEGER NOT NULL DEFAULT 0;
                 PRAGMA user_version = 3;
                 COMMIT;",
            )
            .map_err(|error| format!("升级项目数据库到版本 3 失败: {error}"))?;
    } else if current_version == 2 {
        connection
            .execute_batch(
                "BEGIN IMMEDIATE;
                 ALTER TABLE photos ADD COLUMN format TEXT NOT NULL DEFAULT 'unknown';
                 ALTER TABLE photos ADD COLUMN captured_at TEXT;
                 ALTER TABLE photos ADD COLUMN content_fingerprint TEXT NOT NULL DEFAULT '';
                 ALTER TABLE photos ADD COLUMN missing INTEGER NOT NULL DEFAULT 0;
                 PRAGMA user_version = 3;
                 COMMIT;",
            )
            .map_err(|error| format!("升级项目数据库到版本 3 失败: {error}"))?;
    }

    if (1..=3).contains(&current_version) {
        connection
            .execute_batch(
                "BEGIN IMMEDIATE;
                 CREATE TABLE export_jobs (
                   id TEXT PRIMARY KEY,
                   target_directory TEXT NOT NULL,
                   status TEXT NOT NULL CHECK(status IN
                     ('pending', 'running', 'cancelling', 'completed', 'completed_with_errors',
                      'cancelled', 'interrupted', 'failed')),
                   total_items INTEGER NOT NULL,
                   error TEXT,
                   created_at TEXT NOT NULL,
                   updated_at TEXT NOT NULL
                 );
                 CREATE TABLE export_job_items (
                   job_id TEXT NOT NULL,
                   item_index INTEGER NOT NULL,
                   source_path TEXT NOT NULL,
                   target_path TEXT NOT NULL,
                   status TEXT NOT NULL CHECK(status IN
                     ('pending', 'copying', 'verified', 'committed', 'skipped', 'failed', 'unprocessed')),
                   sha256 TEXT,
                   error TEXT,
                   updated_at TEXT NOT NULL,
                   PRIMARY KEY (job_id, item_index),
                   FOREIGN KEY (job_id) REFERENCES export_jobs(id) ON DELETE CASCADE
                 );
                 PRAGMA user_version = 4;
                 COMMIT;",
            )
            .map_err(|error| format!("升级项目数据库到版本 4 失败: {error}"))?;
    }

    if (1..=4).contains(&current_version) {
        connection
            .execute_batch(
                "BEGIN IMMEDIATE;
                 ALTER TABLE projects ADD COLUMN active_preset_id TEXT NOT NULL DEFAULT 'general';
                 PRAGMA user_version = 5;
                 COMMIT;",
            )
            .map_err(|error| format!("升级项目数据库到版本 5 失败: {error}"))?;
    }

    Ok(())
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn modified_nanos(path: &Path) -> u128 {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or(0)
}

fn sampled_content_fingerprint(path: &Path) -> Result<String, String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("读取照片指纹元数据失败 {}: {error}", path.display()))?;
    let file_size = metadata.len();
    let mut file = fs::File::open(path)
        .map_err(|error| format!("打开照片以计算轻量指纹失败 {}: {error}", path.display()))?;
    let mut offsets = vec![
        0,
        file_size
            .saturating_div(2)
            .saturating_sub(FINGERPRINT_CHUNK_SIZE / 2),
        file_size.saturating_sub(FINGERPRINT_CHUNK_SIZE),
    ];
    offsets.sort_unstable();
    offsets.dedup();

    let mut hasher = Sha256::new();
    hasher.update(file_size.to_le_bytes());
    for offset in offsets {
        file.seek(SeekFrom::Start(offset))
            .map_err(|error| format!("定位照片指纹采样失败 {}: {error}", path.display()))?;
        let remaining = file_size.saturating_sub(offset).min(FINGERPRINT_CHUNK_SIZE) as usize;
        let mut buffer = vec![0_u8; remaining];
        file.read_exact(&mut buffer)
            .map_err(|error| format!("读取照片指纹采样失败 {}: {error}", path.display()))?;
        hasher.update(offset.to_le_bytes());
        hasher.update(buffer);
    }
    Ok(format!("sample-v1:{:x}", hasher.finalize()))
}

#[derive(Debug)]
struct ExistingPhotoIdentity {
    photo_id: String,
    relative_path: String,
    file_size: u64,
    modified_nanos: String,
    content_fingerprint: String,
}

struct AssociationResult {
    photo_id_remaps: HashMap<String, String>,
    matched_existing: usize,
}

fn associate_and_upsert_photos(
    transaction: &rusqlite::Transaction<'_>,
    project_id: &str,
    canonical_root: &Path,
    photos: &[ProjectPhotoInput],
) -> Result<AssociationResult, String> {
    let existing = {
        let mut statement = transaction
            .prepare(
                "SELECT photo_id, relative_path, file_size, modified_nanos, content_fingerprint
                 FROM photos WHERE project_id = ?1",
            )
            .map_err(|error| format!("准备读取照片身份失败: {error}"))?;
        let rows = statement
            .query_map([project_id], |row| {
                Ok(ExistingPhotoIdentity {
                    photo_id: row.get(0)?,
                    relative_path: row.get(1)?,
                    file_size: row.get(2)?,
                    modified_nanos: row.get(3)?,
                    content_fingerprint: row.get(4)?,
                })
            })
            .map_err(|error| format!("读取照片身份失败: {error}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("解析照片身份失败: {error}"))?
    };

    transaction
        .execute(
            "UPDATE photos SET missing = 1 WHERE project_id = ?1",
            [project_id],
        )
        .map_err(|error| format!("标记缺失照片失败: {error}"))?;

    let mut used_existing = std::collections::HashSet::new();
    let mut photo_id_remaps = HashMap::new();
    let mut matched_existing = 0;

    for photo in photos {
        let photo_path = Path::new(&photo.path);
        let relative_path = photo_path
            .strip_prefix(canonical_root)
            .unwrap_or(photo_path)
            .to_string_lossy()
            .to_string();
        let current_modified_nanos = modified_nanos(photo_path).to_string();
        let metadata_matches = |candidate: &&ExistingPhotoIdentity| {
            candidate.file_size == photo.file_size
                && candidate.modified_nanos == current_modified_nanos
                && !used_existing.contains(&candidate.photo_id)
        };
        let same_path_metadata_matches = existing
            .iter()
            .filter(|candidate| candidate.relative_path == relative_path)
            .filter(metadata_matches)
            .collect::<Vec<_>>();
        let metadata_match = if same_path_metadata_matches.len() == 1 {
            Some(same_path_metadata_matches[0])
        } else {
            let all_metadata_matches = existing.iter().filter(metadata_matches).collect::<Vec<_>>();
            if all_metadata_matches.len() == 1 {
                Some(all_metadata_matches[0])
            } else {
                None
            }
        };

        let (matched, current_fingerprint) = if let Some(candidate) = metadata_match {
            (Some(candidate), candidate.content_fingerprint.clone())
        } else {
            let has_comparable_fingerprint = existing.iter().any(|candidate| {
                candidate.file_size == photo.file_size
                    && !candidate.content_fingerprint.is_empty()
                    && !used_existing.contains(&candidate.photo_id)
            });
            let fingerprint = if has_comparable_fingerprint {
                sampled_content_fingerprint(photo_path)?
            } else {
                String::new()
            };
            let fingerprint_matches = |candidate: &&ExistingPhotoIdentity| {
                candidate.file_size == photo.file_size
                    && !candidate.content_fingerprint.is_empty()
                    && candidate.content_fingerprint == fingerprint
                    && !used_existing.contains(&candidate.photo_id)
            };
            let same_path_matches = existing
                .iter()
                .filter(|candidate| candidate.relative_path == relative_path)
                .filter(fingerprint_matches)
                .collect::<Vec<_>>();
            let content_match = if same_path_matches.len() == 1 {
                Some(same_path_matches[0])
            } else {
                let all_matches = existing
                    .iter()
                    .filter(fingerprint_matches)
                    .collect::<Vec<_>>();
                if all_matches.len() == 1 {
                    Some(all_matches[0])
                } else {
                    None
                }
            };
            (content_match, fingerprint)
        };
        let stable_photo_id = if let Some(candidate) = matched {
            used_existing.insert(candidate.photo_id.clone());
            matched_existing += 1;
            candidate.photo_id.clone()
        } else {
            format!("photo:{}", uuid::Uuid::new_v4())
        };

        transaction
            .execute(
                "INSERT INTO photos
                   (project_id, photo_id, relative_path, filename, file_size, modified_nanos,
                    format, captured_at, content_fingerprint, missing)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0)
                 ON CONFLICT(project_id, photo_id) DO UPDATE SET
                   relative_path = excluded.relative_path,
                   filename = excluded.filename,
                   file_size = excluded.file_size,
                   modified_nanos = excluded.modified_nanos,
                   format = excluded.format,
                   captured_at = excluded.captured_at,
                   content_fingerprint = excluded.content_fingerprint,
                   missing = 0",
                params![
                    project_id,
                    stable_photo_id,
                    relative_path,
                    photo.filename,
                    photo.file_size,
                    current_modified_nanos,
                    photo.format,
                    photo.captured_at,
                    current_fingerprint
                ],
            )
            .map_err(|error| format!("保存照片索引失败: {error}"))?;
        photo_id_remaps.insert(photo.photo_id.clone(), stable_photo_id);
    }

    Ok(AssociationResult {
        photo_id_remaps,
        matched_existing,
    })
}

fn validate_selection_state(state: &str) -> Result<(), String> {
    match state {
        "unreviewed" | "selected" | "maybe" | "skipped" => Ok(()),
        _ => Err(format!("无效的选片状态: {state}")),
    }
}

fn validate_filter(filter: &str) -> Result<(), String> {
    match filter {
        "all" | "unreviewed" | "selected" | "maybe" | "needs_check" | "burst" => Ok(()),
        _ => Err(format!("无效的照片筛选状态: {filter}")),
    }
}

fn validate_active_preset(preset: &str) -> Result<(), String> {
    match preset {
        "general" | "concert" | "cosplay" | "conference" | "wedding" | "family" | "travel" => {
            Ok(())
        }
        _ => Err(format!("无效的故事线题材预设: {preset}")),
    }
}

fn validate_scenes_json(scenes_json: &str) -> Result<(), String> {
    if scenes_json.len() > 1_000_000 {
        return Err("场景数据超过 1 MB 安全限制".to_string());
    }
    let value: serde_json::Value = serde_json::from_str(scenes_json)
        .map_err(|error| format!("场景数据不是有效 JSON: {error}"))?;
    if !value.is_array() {
        return Err("场景数据必须是 JSON 数组".to_string());
    }
    Ok(())
}

fn validate_export_item_status(status: &str) -> Result<(), String> {
    match status {
        "pending" | "copying" | "verified" | "committed" | "skipped" | "failed" | "unprocessed" => {
            Ok(())
        }
        _ => Err(format!("无效的导出文件状态: {status}")),
    }
}

impl ExportJobRecorder {
    pub fn create(
        app_data_dir: &Path,
        job_id: &str,
        options: &ExportOptions,
    ) -> Result<Self, String> {
        uuid::Uuid::parse_str(job_id).map_err(|_| "导出任务 ID 无效".to_string())?;
        let target_directory = fs::canonicalize(&options.target_dir)
            .map_err(|error| format!("解析导出目标目录失败: {error}"))?;
        let mut connection = open_connection(app_data_dir)?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("开始导出任务事务失败: {error}"))?;
        let timestamp = now();
        transaction
            .execute(
                "INSERT INTO export_jobs
                   (id, target_directory, status, total_items, created_at, updated_at)
                 VALUES (?1, ?2, 'pending', ?3, ?4, ?4)",
                params![
                    job_id,
                    target_directory.to_string_lossy(),
                    options.photo_paths.len(),
                    timestamp
                ],
            )
            .map_err(|error| format!("创建导出任务记录失败: {error}"))?;
        for (item_index, source_path) in options.photo_paths.iter().enumerate() {
            let file_name = Path::new(source_path)
                .file_name()
                .ok_or_else(|| format!("无法识别导出源文件名: {source_path}"))?;
            let target_path = target_directory.join(file_name);
            transaction
                .execute(
                    "INSERT INTO export_job_items
                       (job_id, item_index, source_path, target_path, status, updated_at)
                     VALUES (?1, ?2, ?3, ?4, 'pending', ?5)",
                    params![
                        job_id,
                        item_index,
                        source_path,
                        target_path.to_string_lossy(),
                        timestamp
                    ],
                )
                .map_err(|error| format!("创建导出文件记录失败: {error}"))?;
        }
        transaction
            .commit()
            .map_err(|error| format!("提交导出任务记录失败: {error}"))?;
        Ok(Self {
            connection,
            app_data_dir: app_data_dir.to_path_buf(),
            job_id: job_id.to_string(),
        })
    }

    pub fn mark_running(&mut self) -> Result<(), String> {
        self.update_job_status("running", None)
    }

    pub fn record_progress(&mut self, update: &ExportProgressUpdate) -> Result<(), String> {
        validate_export_item_status(update.status)?;
        let changed = self
            .connection
            .execute(
                "UPDATE export_job_items SET status = ?3, sha256 = COALESCE(?4, sha256),
                   error = ?5, updated_at = ?6
                 WHERE job_id = ?1 AND item_index = ?2",
                params![
                    self.job_id,
                    update.item_index,
                    update.status,
                    update.sha256,
                    update.error,
                    now()
                ],
            )
            .map_err(|error| format!("记录导出文件状态失败: {error}"))?;
        if changed != 1 {
            return Err(format!("导出文件记录不存在: {}", update.item_index));
        }
        Ok(())
    }

    pub fn finish(&mut self, status: &str, error: Option<&str>) -> Result<(), String> {
        match status {
            "completed" | "completed_with_errors" | "cancelled" | "failed" => {}
            _ => return Err(format!("无效的导出任务终态: {status}")),
        }
        if matches!(status, "cancelled" | "failed") {
            self.connection
                .execute(
                    "UPDATE export_job_items
                     SET status = 'unprocessed', error = COALESCE(error, ?2), updated_at = ?3
                     WHERE job_id = ?1 AND status IN ('pending', 'copying', 'verified')",
                    params![self.job_id, error.unwrap_or("导出任务未完成"), now()],
                )
                .map_err(|db_error| format!("收口未处理导出文件失败: {db_error}"))?;
        }
        self.update_job_status(status, error)?;
        let _ = backup_database_if_due(&self.connection, &self.app_data_dir);
        Ok(())
    }

    fn update_job_status(&mut self, status: &str, error: Option<&str>) -> Result<(), String> {
        let changed = self
            .connection
            .execute(
                "UPDATE export_jobs SET status = ?2, error = ?3, updated_at = ?4 WHERE id = ?1",
                params![self.job_id, status, error, now()],
            )
            .map_err(|db_error| format!("更新导出任务状态失败: {db_error}"))?;
        if changed != 1 {
            return Err("导出任务记录不存在".to_string());
        }
        Ok(())
    }
}

pub fn mark_export_job_cancelling(app_data_dir: &Path, job_id: &str) -> Result<(), String> {
    uuid::Uuid::parse_str(job_id).map_err(|_| "导出任务 ID 无效".to_string())?;
    let connection = open_connection(app_data_dir)?;
    connection
        .execute(
            "UPDATE export_jobs SET status = 'cancelling', updated_at = ?2
             WHERE id = ?1 AND status IN ('pending', 'running')",
            params![job_id, now()],
        )
        .map_err(|error| format!("记录导出取消请求失败: {error}"))?;
    Ok(())
}

fn remove_owned_export_temps(
    target_directory: &Path,
    job_id: &str,
    target_paths: &[String],
) -> u32 {
    let expected_prefixes = target_paths
        .iter()
        .flat_map(|target| {
            let photo_target = Path::new(target);
            [
                photo_target.to_path_buf(),
                crate::engine::export::companion_xmp_path(photo_target),
            ]
        })
        .filter_map(|target| {
            target
                .file_name()
                .map(|name| format!(".{}.{job_id}-", name.to_string_lossy()))
        })
        .collect::<Vec<_>>();
    let manifest_temp = format!(".quickpick_manifest_{job_id}.tmp");
    let Ok(entries) = fs::read_dir(target_directory) else {
        return 0;
    };
    let mut cleaned = 0_u32;
    for entry in entries.filter_map(Result::ok) {
        let name = entry.file_name().to_string_lossy().to_string();
        let owned_copy_temp = name.ends_with(".quickpick-tmp")
            && expected_prefixes
                .iter()
                .any(|prefix| name.starts_with(prefix));
        if !owned_copy_temp && name != manifest_temp {
            continue;
        }
        let path = entry.path();
        let removable = fs::symlink_metadata(&path).is_ok_and(|metadata| {
            metadata.file_type().is_file() || metadata.file_type().is_symlink()
        });
        if removable && fs::remove_file(path).is_ok() {
            cleaned = cleaned.saturating_add(1);
        }
    }
    cleaned
}

pub fn recover_interrupted_export_jobs(
    app_data_dir: &Path,
) -> Result<ExportRecoverySummary, String> {
    let mut connection = open_connection(app_data_dir)?;
    let jobs = {
        let mut statement = connection
            .prepare(
                "SELECT id, target_directory FROM export_jobs
                 WHERE status IN ('pending', 'running', 'cancelling')",
            )
            .map_err(|error| format!("准备恢复导出任务失败: {error}"))?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|error| format!("读取待恢复导出任务失败: {error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("解析待恢复导出任务失败: {error}"))?;
        rows
    };
    let mut summary = ExportRecoverySummary::default();
    for (job_id, target_directory) in jobs {
        let target_paths = {
            let mut statement = connection
                .prepare("SELECT target_path FROM export_job_items WHERE job_id = ?1")
                .map_err(|error| format!("准备读取导出临时路径失败: {error}"))?;
            let paths = statement
                .query_map([&job_id], |row| row.get::<_, String>(0))
                .map_err(|error| format!("读取导出临时路径失败: {error}"))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| format!("解析导出临时路径失败: {error}"))?;
            paths
        };
        summary.cleaned_temp_files =
            summary
                .cleaned_temp_files
                .saturating_add(remove_owned_export_temps(
                    Path::new(&target_directory),
                    &job_id,
                    &target_paths,
                ));
        let transaction = connection
            .transaction()
            .map_err(|error| format!("开始导出恢复事务失败: {error}"))?;
        transaction
            .execute(
                "UPDATE export_job_items
                 SET status = CASE WHEN status = 'pending' THEN 'unprocessed' ELSE 'failed' END,
                     error = '应用异常退出，任务已安全终止', updated_at = ?2
                 WHERE job_id = ?1 AND status IN ('pending', 'copying', 'verified')",
                params![job_id, now()],
            )
            .map_err(|error| format!("恢复导出文件状态失败: {error}"))?;
        transaction
            .execute(
                "UPDATE export_jobs SET status = 'interrupted',
                   error = '应用异常退出，已清理任务临时文件', updated_at = ?2
                 WHERE id = ?1",
                params![job_id, now()],
            )
            .map_err(|error| format!("恢复导出任务状态失败: {error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("提交导出恢复事务失败: {error}"))?;
        summary.recovered_jobs = summary.recovered_jobs.saturating_add(1);
    }
    Ok(summary)
}

pub fn open_project(
    app_data_dir: &Path,
    source_root: &str,
    photos: &[ProjectPhotoInput],
) -> Result<ProjectState, String> {
    let canonical_root =
        fs::canonicalize(source_root).map_err(|error| format!("无法定位照片目录: {error}"))?;
    let canonical_root_string = canonical_root.to_string_lossy().to_string();
    let display_name = canonical_root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("照片项目")
        .to_string();
    let timestamp = now();

    let mut connection = open_connection(app_data_dir)?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("开始项目事务失败: {error}"))?;

    let existing_id: Option<String> = transaction
        .query_row(
            "SELECT id FROM projects WHERE source_root = ?1",
            [&canonical_root_string],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("读取已有项目失败: {error}"))?;
    let project_id = existing_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    transaction
        .execute(
            "INSERT INTO projects (id, source_root, display_name, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?4)
             ON CONFLICT(source_root) DO UPDATE SET
               display_name = excluded.display_name,
               updated_at = excluded.updated_at",
            params![project_id, canonical_root_string, display_name, timestamp],
        )
        .map_err(|error| format!("保存项目失败: {error}"))?;

    let association =
        associate_and_upsert_photos(&transaction, &project_id, &canonical_root, photos)?;

    transaction
        .commit()
        .map_err(|error| format!("提交项目事务失败: {error}"))?;

    let mut state = load_project_state(&connection, &project_id)?;
    state.photo_id_remaps = association.photo_id_remaps;
    state.backup_warning = backup_database(&connection, app_data_dir).err();
    Ok(state)
}

fn load_project_state(connection: &Connection, project_id: &str) -> Result<ProjectState, String> {
    let (
        current_photo_id,
        target_count,
        active_filter,
        selected_scene_id,
        active_preset_id,
        scenes_json,
    ) = connection
        .query_row(
            "SELECT current_photo_id, target_count, active_filter, selected_scene_id,
                    active_preset_id, scenes_json
             FROM projects WHERE id = ?1",
            [project_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            },
        )
        .map_err(|error| format!("读取项目浏览状态失败: {error}"))?;

    let mut selection_statement = connection
        .prepare(
            "SELECT s.photo_id, s.state, s.note, s.updated_at
             FROM selections s
             INNER JOIN photos p
               ON p.project_id = s.project_id AND p.photo_id = s.photo_id
             WHERE s.project_id = ?1 AND p.missing = 0",
        )
        .map_err(|error| format!("准备读取选择记录失败: {error}"))?;
    let selections = selection_statement
        .query_map([project_id], |row| {
            Ok(PersistedSelection {
                photo_id: row.get(0)?,
                state: row.get(1)?,
                note: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .map_err(|error| format!("读取选择记录失败: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("解析选择记录失败: {error}"))?;

    let mut viewed_statement = connection
        .prepare(
            "SELECT r.photo_id
             FROM review_progress r
             INNER JOIN photos p
               ON p.project_id = r.project_id AND p.photo_id = r.photo_id
             WHERE r.project_id = ?1 AND p.missing = 0",
        )
        .map_err(|error| format!("准备读取查看进度失败: {error}"))?;
    let viewed_photo_ids = viewed_statement
        .query_map([project_id], |row| row.get(0))
        .map_err(|error| format!("读取查看进度失败: {error}"))?
        .collect::<Result<Vec<String>, _>>()
        .map_err(|error| format!("解析查看进度失败: {error}"))?;

    Ok(ProjectState {
        project_id: project_id.to_string(),
        selections,
        viewed_photo_ids,
        backup_warning: None,
        current_photo_id,
        target_count,
        active_filter,
        selected_scene_id,
        active_preset_id,
        scenes_json,
        photo_id_remaps: HashMap::new(),
    })
}

pub fn save_project_view_state(
    app_data_dir: &Path,
    project_id: &str,
    state: &ProjectViewStateInput,
) -> Result<PersistenceOutcome, String> {
    validate_filter(&state.active_filter)?;
    validate_active_preset(&state.active_preset_id)?;
    validate_scenes_json(&state.scenes_json)?;
    let connection = open_connection(app_data_dir)?;
    let changed = connection
        .execute(
            "UPDATE projects SET
               current_photo_id = ?2,
               target_count = ?3,
               active_filter = ?4,
               selected_scene_id = ?5,
               active_preset_id = ?6,
               scenes_json = ?7,
               updated_at = ?8
             WHERE id = ?1",
            params![
                project_id,
                state.current_photo_id,
                state.target_count,
                state.active_filter,
                state.selected_scene_id,
                state.active_preset_id,
                state.scenes_json,
                now()
            ],
        )
        .map_err(|error| format!("保存项目浏览状态失败: {error}"))?;
    if changed != 1 {
        return Err("项目不存在，无法保存浏览状态".to_string());
    }
    Ok(PersistenceOutcome {
        backup_warning: backup_database_if_due(&connection, app_data_dir).err(),
    })
}

pub fn list_recent_projects(app_data_dir: &Path) -> Result<Vec<RecentProject>, String> {
    let connection = open_connection(app_data_dir)?;
    let mut statement = connection
        .prepare(
            "SELECT p.id, p.source_root, p.display_name, p.updated_at,
                    (SELECT COUNT(*) FROM photos ph
                     WHERE ph.project_id = p.id AND ph.missing = 0) AS photo_count,
                    (SELECT COUNT(*) FROM review_progress r
                     JOIN photos ph ON ph.project_id = r.project_id AND ph.photo_id = r.photo_id
                     WHERE r.project_id = p.id AND ph.missing = 0) AS viewed_count,
                    (SELECT COUNT(*) FROM selections s
                     JOIN photos ph ON ph.project_id = s.project_id AND ph.photo_id = s.photo_id
                     WHERE s.project_id = p.id AND s.state = 'selected' AND ph.missing = 0)
                     AS selected_count
             FROM projects p
             ORDER BY p.updated_at DESC
             LIMIT 10",
        )
        .map_err(|error| format!("准备读取最近项目失败: {error}"))?;
    let projects = statement
        .query_map([], |row| {
            let source_root: String = row.get(1)?;
            Ok(RecentProject {
                project_id: row.get(0)?,
                source_available: Path::new(&source_root).is_dir(),
                source_root,
                display_name: row.get(2)?,
                updated_at: row.get(3)?,
                photo_count: row.get(4)?,
                viewed_count: row.get(5)?,
                selected_count: row.get(6)?,
            })
        })
        .map_err(|error| format!("读取最近项目失败: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("解析最近项目失败: {error}"))?;
    Ok(projects)
}

pub fn relocate_project(
    app_data_dir: &Path,
    project_id: &str,
    new_source_root: &str,
    photos: &[ProjectPhotoInput],
) -> Result<ProjectState, String> {
    let canonical_root = fs::canonicalize(new_source_root)
        .map_err(|error| format!("无法定位新的照片目录: {error}"))?;
    if !canonical_root.is_dir() {
        return Err("重新定位目标不是文件夹".to_string());
    }
    let canonical_root_string = canonical_root.to_string_lossy().to_string();
    let display_name = canonical_root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("照片项目")
        .to_string();

    let mut connection = open_connection(app_data_dir)?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("开始项目重新定位事务失败: {error}"))?;
    let existing_photo_count: usize = transaction
        .query_row(
            "SELECT COUNT(*) FROM photos WHERE project_id = ?1 AND missing = 0",
            [project_id],
            |row| row.get(0),
        )
        .map_err(|error| format!("读取原项目照片数量失败: {error}"))?;
    if existing_photo_count == 0 {
        return Err("项目没有已索引照片，无法安全确认新的源目录".to_string());
    }
    let association =
        associate_and_upsert_photos(&transaction, project_id, &canonical_root, photos)?;
    let required_matches = existing_photo_count.div_ceil(2);
    if association.matched_existing < required_matches {
        return Err(format!(
            "新目录仅匹配 {matched}/{} 张原项目照片，未达到安全重新定位门槛 {required_matches}；请选择移动后的同一照片文件夹",
            existing_photo_count,
            matched = association.matched_existing
        ));
    }

    transaction
        .execute(
            "UPDATE projects SET source_root = ?2, display_name = ?3, updated_at = ?4
             WHERE id = ?1",
            params![project_id, canonical_root_string, display_name, now()],
        )
        .map_err(|error| format!("更新项目照片目录失败: {error}"))?;
    transaction
        .commit()
        .map_err(|error| format!("提交项目重新定位失败: {error}"))?;

    let mut state = load_project_state(&connection, project_id)?;
    state.photo_id_remaps = association.photo_id_remaps;
    state.backup_warning = backup_database(&connection, app_data_dir).err();
    Ok(state)
}

pub fn save_selection(
    app_data_dir: &Path,
    project_id: &str,
    selection: &PersistedSelection,
) -> Result<PersistenceOutcome, String> {
    save_selections(app_data_dir, project_id, std::slice::from_ref(selection))
}

pub fn save_selections(
    app_data_dir: &Path,
    project_id: &str,
    selections: &[PersistedSelection],
) -> Result<PersistenceOutcome, String> {
    if selections.is_empty() {
        return Err("批量选片事务不能为空".to_string());
    }
    let mut photo_ids = std::collections::HashSet::new();
    for selection in selections {
        validate_selection_state(&selection.state)?;
        if !photo_ids.insert(selection.photo_id.as_str()) {
            return Err(format!("批量选片事务包含重复照片: {}", selection.photo_id));
        }
    }

    let mut connection = open_connection(app_data_dir)?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("开始选片保存事务失败: {error}"))?;
    for selection in selections {
        transaction
            .execute(
                "INSERT INTO selections (project_id, photo_id, state, note, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(project_id, photo_id) DO UPDATE SET
                   state = excluded.state,
                   note = excluded.note,
                   updated_at = excluded.updated_at",
                params![
                    project_id,
                    selection.photo_id,
                    selection.state,
                    selection.note,
                    selection.updated_at
                ],
            )
            .map_err(|error| format!("写入选片结果失败: {error}"))?;
    }
    transaction
        .commit()
        .map_err(|error| format!("提交选片保存事务失败: {error}"))?;
    Ok(PersistenceOutcome {
        backup_warning: backup_database_if_due(&connection, app_data_dir).err(),
    })
}

pub fn mark_viewed(
    app_data_dir: &Path,
    project_id: &str,
    photo_id: &str,
) -> Result<PersistenceOutcome, String> {
    let connection = open_connection(app_data_dir)?;
    connection
        .execute(
            "INSERT INTO review_progress (project_id, photo_id, viewed_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(project_id, photo_id) DO NOTHING",
            params![project_id, photo_id, now()],
        )
        .map_err(|error| format!("保存查看进度失败: {error}"))?;
    Ok(PersistenceOutcome {
        backup_warning: backup_database_if_due(&connection, app_data_dir).err(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_job_records_each_transaction_state() {
        let temp_dir =
            std::env::temp_dir().join(format!("qp_export_job_db_{}", uuid::Uuid::new_v4()));
        let source_dir = temp_dir.join("source");
        let target_dir = temp_dir.join("target");
        let app_data_dir = temp_dir.join("app-data");
        fs::create_dir_all(&source_dir).unwrap();
        fs::create_dir_all(&target_dir).unwrap();
        let source = source_dir.join("frame.ARW");
        fs::write(&source, b"raw").unwrap();
        let job_id = uuid::Uuid::new_v4().to_string();
        let options = ExportOptions {
            photo_paths: vec![source.to_string_lossy().to_string()],
            target_dir: target_dir.to_string_lossy().to_string(),
            include_xmp: false,
            open_after_export: false,
        };

        let mut recorder = ExportJobRecorder::create(&app_data_dir, &job_id, &options).unwrap();
        recorder.mark_running().unwrap();
        for status in ["copying", "verified", "committed"] {
            recorder
                .record_progress(&ExportProgressUpdate {
                    item_index: 0,
                    status,
                    sha256: (status == "verified").then(|| "abc123".to_string()),
                    error: None,
                })
                .unwrap();
        }
        recorder.finish("completed", None).unwrap();
        drop(recorder);

        let connection = open_connection(&app_data_dir).unwrap();
        let job_status: String = connection
            .query_row(
                "SELECT status FROM export_jobs WHERE id = ?1",
                [&job_id],
                |row| row.get(0),
            )
            .unwrap();
        let item_status: String = connection
            .query_row(
                "SELECT status FROM export_job_items WHERE job_id = ?1 AND item_index = 0",
                [&job_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(job_status, "completed");
        assert_eq!(item_status, "committed");
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn interrupted_export_recovery_removes_only_owned_temps() {
        let temp_dir =
            std::env::temp_dir().join(format!("qp_export_recovery_{}", uuid::Uuid::new_v4()));
        let source_dir = temp_dir.join("source");
        let target_dir = temp_dir.join("target");
        let app_data_dir = temp_dir.join("app-data");
        fs::create_dir_all(&source_dir).unwrap();
        fs::create_dir_all(&target_dir).unwrap();
        let source = source_dir.join("frame.ARW");
        fs::write(&source, b"raw").unwrap();
        let job_id = uuid::Uuid::new_v4().to_string();
        let options = ExportOptions {
            photo_paths: vec![source.to_string_lossy().to_string()],
            target_dir: target_dir.to_string_lossy().to_string(),
            include_xmp: false,
            open_after_export: false,
        };
        let mut recorder = ExportJobRecorder::create(&app_data_dir, &job_id, &options).unwrap();
        recorder.mark_running().unwrap();
        recorder
            .record_progress(&ExportProgressUpdate {
                item_index: 0,
                status: "copying",
                sha256: None,
                error: None,
            })
            .unwrap();
        drop(recorder);

        let owned_temp = target_dir.join(format!(
            ".frame.ARW.{job_id}-{}.quickpick-tmp",
            uuid::Uuid::new_v4()
        ));
        let owned_manifest_temp = target_dir.join(format!(".quickpick_manifest_{job_id}.tmp"));
        let owned_xmp_temp = target_dir.join(format!(
            ".frame.xmp.{job_id}-{}.quickpick-tmp",
            uuid::Uuid::new_v4()
        ));
        let unrelated_temp = target_dir.join(".frame.ARW.someone-else.quickpick-tmp");
        fs::write(&owned_temp, b"partial copy").unwrap();
        fs::write(&owned_manifest_temp, b"partial manifest").unwrap();
        fs::write(&owned_xmp_temp, b"partial xmp").unwrap();
        fs::write(&unrelated_temp, b"must survive").unwrap();

        let summary = recover_interrupted_export_jobs(&app_data_dir).unwrap();

        assert_eq!(summary.recovered_jobs, 1);
        assert_eq!(summary.cleaned_temp_files, 3);
        assert!(!owned_temp.exists());
        assert!(!owned_manifest_temp.exists());
        assert!(!owned_xmp_temp.exists());
        assert_eq!(fs::read(&unrelated_temp).unwrap(), b"must survive");
        let connection = open_connection(&app_data_dir).unwrap();
        let (job_status, item_status): (String, String) = connection
            .query_row(
                "SELECT j.status, i.status FROM export_jobs j
                 JOIN export_job_items i ON i.job_id = j.id
                 WHERE j.id = ?1 AND i.item_index = 0",
                [&job_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(job_status, "interrupted");
        assert_eq!(item_status, "failed");
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn unclean_session_is_detected_and_clean_exit_clears_marker() {
        let data = std::env::temp_dir().join(format!("qp_session_data_{}", uuid::Uuid::new_v4()));

        let first = begin_app_session(&data).unwrap();
        assert!(!first.previous_session_unclean);

        let simulated_restart = begin_app_session(&data).unwrap();
        assert!(simulated_restart.previous_session_unclean);

        end_app_session(&data).unwrap();
        let after_clean_exit = begin_app_session(&data).unwrap();
        assert!(!after_clean_exit.previous_session_unclean);

        end_app_session(&data).unwrap();
        fs::remove_dir_all(data).unwrap();
    }

    #[test]
    fn project_selection_survives_reopen() {
        let root = std::env::temp_dir().join(format!("qp_project_source_{}", uuid::Uuid::new_v4()));
        let data = std::env::temp_dir().join(format!("qp_project_data_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("photo.jpg"), b"photo").unwrap();
        let photo = ProjectPhotoInput {
            photo_id: "stable-photo".to_string(),
            path: root.join("photo.jpg").to_string_lossy().to_string(),
            filename: "photo.jpg".to_string(),
            file_size: 5,
            format: "jpeg".to_string(),
            captured_at: None,
        };

        let initial =
            open_project(&data, root.to_str().unwrap(), std::slice::from_ref(&photo)).unwrap();
        let stable_photo_id = initial.photo_id_remaps[&photo.photo_id].clone();
        save_selection(
            &data,
            &initial.project_id,
            &PersistedSelection {
                photo_id: stable_photo_id.clone(),
                state: "selected".to_string(),
                note: Some("最喜欢".to_string()),
                updated_at: now(),
            },
        )
        .unwrap();
        mark_viewed(&data, &initial.project_id, &stable_photo_id).unwrap();
        save_project_view_state(
            &data,
            &initial.project_id,
            &ProjectViewStateInput {
                current_photo_id: Some(stable_photo_id.clone()),
                target_count: Some(80),
                active_filter: "maybe".to_string(),
                selected_scene_id: Some("scene-1".to_string()),
                active_preset_id: "wedding".to_string(),
                scenes_json: r#"[{"id":"scene-1","name":"室内"}]"#.to_string(),
            },
        )
        .unwrap();

        let reopened = open_project(&data, root.to_str().unwrap(), &[photo]).unwrap();
        assert_eq!(reopened.project_id, initial.project_id);
        assert_eq!(reopened.selections.len(), 1);
        assert_eq!(reopened.selections[0].state, "selected");
        assert_eq!(reopened.selections[0].note.as_deref(), Some("最喜欢"));
        assert_eq!(reopened.viewed_photo_ids, vec![stable_photo_id.as_str()]);
        assert_eq!(
            reopened.current_photo_id.as_deref(),
            Some(stable_photo_id.as_str())
        );
        assert_eq!(reopened.photo_id_remaps["stable-photo"], stable_photo_id);
        assert_eq!(reopened.target_count, Some(80));
        assert_eq!(reopened.active_filter, "maybe");
        assert_eq!(reopened.selected_scene_id.as_deref(), Some("scene-1"));
        assert_eq!(reopened.active_preset_id, "wedding");
        assert_eq!(reopened.scenes_json, r#"[{"id":"scene-1","name":"室内"}]"#);
        let recent = list_recent_projects(&data).unwrap();
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].project_id, initial.project_id);
        assert_eq!(recent[0].photo_count, 1);
        assert_eq!(recent[0].viewed_count, 1);
        assert_eq!(recent[0].selected_count, 1);
        assert_eq!(recent[0].photo_count, 1);
        assert!(recent[0].source_available);

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(data);
    }

    #[test]
    fn batch_selections_commit_and_reject_invalid_input_atomically() {
        let root = std::env::temp_dir().join(format!("qp_batch_source_{}", uuid::Uuid::new_v4()));
        let data = std::env::temp_dir().join(format!("qp_batch_data_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("left.jpg"), b"left").unwrap();
        fs::write(root.join("right.jpg"), b"right").unwrap();
        let photos = [
            ProjectPhotoInput {
                photo_id: "scan-left".to_string(),
                path: root.join("left.jpg").to_string_lossy().to_string(),
                filename: "left.jpg".to_string(),
                file_size: 4,
                format: "jpeg".to_string(),
                captured_at: None,
            },
            ProjectPhotoInput {
                photo_id: "scan-right".to_string(),
                path: root.join("right.jpg").to_string_lossy().to_string(),
                filename: "right.jpg".to_string(),
                file_size: 5,
                format: "jpeg".to_string(),
                captured_at: None,
            },
        ];
        let project = open_project(&data, root.to_str().unwrap(), &photos).unwrap();
        let left_id = project.photo_id_remaps["scan-left"].clone();
        let right_id = project.photo_id_remaps["scan-right"].clone();

        save_selections(
            &data,
            &project.project_id,
            &[
                PersistedSelection {
                    photo_id: left_id.clone(),
                    state: "selected".to_string(),
                    note: None,
                    updated_at: now(),
                },
                PersistedSelection {
                    photo_id: right_id.clone(),
                    state: "maybe".to_string(),
                    note: None,
                    updated_at: now(),
                },
            ],
        )
        .unwrap();
        let saved = load_project_state(&open_connection(&data).unwrap(), &project.project_id)
            .unwrap()
            .selections;
        assert!(saved
            .iter()
            .any(|item| item.photo_id == left_id && item.state == "selected"));
        assert!(saved
            .iter()
            .any(|item| item.photo_id == right_id && item.state == "maybe"));

        let rejected = save_selections(
            &data,
            &project.project_id,
            &[
                PersistedSelection {
                    photo_id: left_id.clone(),
                    state: "skipped".to_string(),
                    note: None,
                    updated_at: now(),
                },
                PersistedSelection {
                    photo_id: "photo-that-is-not-in-project".to_string(),
                    state: "selected".to_string(),
                    note: None,
                    updated_at: now(),
                },
            ],
        );
        assert!(rejected.is_err());
        let after_rejection =
            load_project_state(&open_connection(&data).unwrap(), &project.project_id)
                .unwrap()
                .selections;
        assert!(after_rejection
            .iter()
            .any(|item| item.photo_id == left_id && item.state == "selected"));

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(data);
    }

    #[test]
    fn interrupted_selection_transaction_rolls_back_without_partial_state() {
        let root = std::env::temp_dir().join(format!("qp_tx_source_{}", uuid::Uuid::new_v4()));
        let data = std::env::temp_dir().join(format!("qp_tx_data_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("photo.jpg"), b"photo").unwrap();
        let photo = ProjectPhotoInput {
            photo_id: "scan-photo".to_string(),
            path: root.join("photo.jpg").to_string_lossy().to_string(),
            filename: "photo.jpg".to_string(),
            file_size: 5,
            format: "jpeg".to_string(),
            captured_at: None,
        };
        let project = open_project(&data, root.to_str().unwrap(), &[photo]).unwrap();
        let photo_id = project.photo_id_remaps["scan-photo"].clone();
        save_selection(
            &data,
            &project.project_id,
            &PersistedSelection {
                photo_id: photo_id.clone(),
                state: "selected".to_string(),
                note: None,
                updated_at: now(),
            },
        )
        .unwrap();

        let mut connection = open_connection(&data).unwrap();
        let transaction = connection.transaction().unwrap();
        transaction
            .execute(
                "UPDATE selections SET state = 'skipped' WHERE project_id = ?1 AND photo_id = ?2",
                params![project.project_id, photo_id],
            )
            .unwrap();
        // 模拟进程在 commit 前终止：连接/事务直接丢弃，SQLite 必须回滚未提交写入。
        drop(transaction);
        drop(connection);

        let recovered =
            load_project_state(&open_connection(&data).unwrap(), &project.project_id).unwrap();
        assert_eq!(recovered.selections.len(), 1);
        assert_eq!(recovered.selections[0].state, "selected");

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(data);
    }

    #[test]
    fn invalid_selection_state_is_rejected() {
        assert!(validate_selection_state("picked-by-ai").is_err());
        assert!(validate_filter("five-stars").is_err());
        assert!(validate_active_preset("sports").is_err());
        assert!(validate_scenes_json("{}").is_err());
    }

    #[test]
    fn schema_v2_is_migrated_without_losing_photo_rows() {
        let data = std::env::temp_dir().join(format!("qp_migration_data_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&data).unwrap();
        let connection = Connection::open(database_path(&data)).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE projects (
                   id TEXT PRIMARY KEY
                 );
                 CREATE TABLE photos (
                   project_id TEXT NOT NULL,
                   photo_id TEXT NOT NULL,
                   relative_path TEXT NOT NULL,
                   filename TEXT NOT NULL,
                   file_size INTEGER NOT NULL,
                   modified_nanos TEXT NOT NULL,
                   PRIMARY KEY (project_id, photo_id)
                 );
                 INSERT INTO photos VALUES ('project', 'legacy-photo', 'a.jpg', 'a.jpg', 5, '1');
                 PRAGMA user_version = 2;",
            )
            .unwrap();
        drop(connection);

        let migrated = open_connection(&data).unwrap();
        let version: i64 = migrated
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 5);
        let (format, fingerprint, missing): (String, String, bool) = migrated
            .query_row(
                "SELECT format, content_fingerprint, missing
                 FROM photos WHERE photo_id = 'legacy-photo'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(format, "unknown");
        assert!(fingerprint.is_empty());
        assert!(!missing);

        let upgrade_backup = Connection::open(backup_path(&data)).unwrap();
        let backed_up_version: i64 = upgrade_backup
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(backed_up_version, 2);

        let _ = fs::remove_dir_all(data);
    }

    #[test]
    fn rename_keeps_identity_but_same_name_replacement_does_not() {
        let root =
            std::env::temp_dir().join(format!("qp_identity_source_{}", uuid::Uuid::new_v4()));
        let data = std::env::temp_dir().join(format!("qp_identity_data_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("before.jpg"), b"photo").unwrap();
        let original = ProjectPhotoInput {
            photo_id: "scan-before".to_string(),
            path: root.join("before.jpg").to_string_lossy().to_string(),
            filename: "before.jpg".to_string(),
            file_size: 5,
            format: "jpeg".to_string(),
            captured_at: Some("2026-08-15 16:45:22".to_string()),
        };
        let initial = open_project(
            &data,
            root.to_str().unwrap(),
            std::slice::from_ref(&original),
        )
        .unwrap();
        let stable_photo_id = initial.photo_id_remaps["scan-before"].clone();
        save_selection(
            &data,
            &initial.project_id,
            &PersistedSelection {
                photo_id: stable_photo_id.clone(),
                state: "selected".to_string(),
                note: Some("保留这个决定".to_string()),
                updated_at: now(),
            },
        )
        .unwrap();

        fs::rename(root.join("before.jpg"), root.join("after.jpg")).unwrap();
        let renamed = ProjectPhotoInput {
            photo_id: "scan-after".to_string(),
            path: root.join("after.jpg").to_string_lossy().to_string(),
            filename: "after.jpg".to_string(),
            file_size: 5,
            format: "jpeg".to_string(),
            captured_at: original.captured_at,
        };
        let after_rename = open_project(
            &data,
            root.to_str().unwrap(),
            std::slice::from_ref(&renamed),
        )
        .unwrap();
        assert_eq!(after_rename.photo_id_remaps["scan-after"], stable_photo_id);
        assert_eq!(after_rename.selections[0].state, "selected");

        std::thread::sleep(std::time::Duration::from_millis(5));
        fs::write(root.join("after.jpg"), b"other").unwrap();
        let after_replacement = open_project(&data, root.to_str().unwrap(), &[renamed]).unwrap();
        let replacement_id = &after_replacement.photo_id_remaps["scan-after"];
        assert_ne!(replacement_id, &stable_photo_id);
        assert!(
            after_replacement.selections.is_empty(),
            "同名替换文件不得继承原照片的选择"
        );

        let connection = open_connection(&data).unwrap();
        let preserved_decisions: usize = connection
            .query_row("SELECT COUNT(*) FROM selections", [], |row| row.get(0))
            .unwrap();
        assert_eq!(preserved_decisions, 1, "缺失照片的旧决定仍应保留以便恢复");

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(data);
    }

    #[test]
    fn moved_source_folder_can_be_safely_relocated() {
        let root = std::env::temp_dir().join(format!("qp_move_source_{}", uuid::Uuid::new_v4()));
        let moved = std::env::temp_dir().join(format!("qp_move_target_{}", uuid::Uuid::new_v4()));
        let data = std::env::temp_dir().join(format!("qp_move_data_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("photo.jpg"), b"photo").unwrap();
        let original = ProjectPhotoInput {
            photo_id: "stable-photo".to_string(),
            path: root.join("photo.jpg").to_string_lossy().to_string(),
            filename: "photo.jpg".to_string(),
            file_size: 5,
            format: "jpeg".to_string(),
            captured_at: None,
        };
        let initial = open_project(
            &data,
            root.to_str().unwrap(),
            std::slice::from_ref(&original),
        )
        .unwrap();
        let stable_photo_id = initial.photo_id_remaps[&original.photo_id].clone();
        save_selection(
            &data,
            &initial.project_id,
            &PersistedSelection {
                photo_id: stable_photo_id.clone(),
                state: "selected".to_string(),
                note: None,
                updated_at: now(),
            },
        )
        .unwrap();

        fs::rename(&root, &moved).unwrap();
        let relocated_photo = ProjectPhotoInput {
            photo_id: "stable-photo".to_string(),
            path: moved.join("photo.jpg").to_string_lossy().to_string(),
            filename: "photo.jpg".to_string(),
            file_size: 5,
            format: "jpeg".to_string(),
            captured_at: None,
        };
        let relocated = relocate_project(
            &data,
            &initial.project_id,
            moved.to_str().unwrap(),
            &[relocated_photo],
        )
        .unwrap();
        assert_eq!(relocated.project_id, initial.project_id);
        assert_eq!(relocated.selections[0].state, "selected");
        assert_eq!(relocated.photo_id_remaps["stable-photo"], stable_photo_id);
        let recent = list_recent_projects(&data).unwrap();
        assert_eq!(
            PathBuf::from(&recent[0].source_root),
            fs::canonicalize(&moved).unwrap()
        );
        assert!(recent[0].source_available);

        let _ = fs::remove_dir_all(moved);
        let _ = fs::remove_dir_all(data);
    }

    #[test]
    fn corrupt_primary_database_is_quarantined_and_restored() {
        let root =
            std::env::temp_dir().join(format!("qp_recovery_source_{}", uuid::Uuid::new_v4()));
        let data = std::env::temp_dir().join(format!("qp_recovery_data_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("photo.jpg"), b"photo").unwrap();
        let photo = ProjectPhotoInput {
            photo_id: "stable-photo".to_string(),
            path: root.join("photo.jpg").to_string_lossy().to_string(),
            filename: "photo.jpg".to_string(),
            file_size: 5,
            format: "jpeg".to_string(),
            captured_at: None,
        };

        let initial =
            open_project(&data, root.to_str().unwrap(), std::slice::from_ref(&photo)).unwrap();
        let stable_photo_id = initial.photo_id_remaps[&photo.photo_id].clone();
        save_selection(
            &data,
            &initial.project_id,
            &PersistedSelection {
                photo_id: stable_photo_id,
                state: "selected".to_string(),
                note: None,
                updated_at: now(),
            },
        )
        .unwrap();
        let connection = open_connection(&data).unwrap();
        backup_database(&connection, &data).unwrap();
        drop(connection);

        fs::write(database_path(&data), b"not a sqlite database").unwrap();
        let restored = open_project(&data, root.to_str().unwrap(), &[photo]).unwrap();

        assert_eq!(restored.project_id, initial.project_id);
        assert_eq!(restored.selections[0].state, "selected");
        assert!(data.join(RECOVERY_DIR).read_dir().unwrap().next().is_some());
        assert!(database_is_healthy(&database_path(&data)));

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(data);
    }
}
