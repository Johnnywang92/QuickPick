use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::SystemTime;

#[cfg(unix)]
use std::os::unix::fs::MetadataExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExportOptions {
    pub photo_paths: Vec<String>,
    pub target_dir: String,
    pub include_xmp: bool,       // 是否包含同名 .xmp 伴侣文件
    pub open_after_export: bool, // 导出后在文件管理器中打开
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub job_id: String,
    pub total: usize,
    pub success_photos: usize,
    pub success_xmps: usize,
    pub skipped: usize,
    pub failed: usize,
    pub unprocessed: usize,
    pub cancelled: bool,
    pub target_directory: String,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ExportProgressUpdate {
    pub item_index: usize,
    pub status: &'static str,
    pub sha256: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportConflict {
    pub source_path: String,
    pub target_path: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportPreflight {
    pub total_photos: usize,
    pub total_files: usize,
    pub total_bytes: u64,
    pub required_bytes: u64,
    pub available_bytes: u64,
    pub has_enough_space: bool,
    pub conflicts: Vec<ExportConflict>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportManifestItem {
    pub source_path: String,
    pub target_path: String,
    pub sha256: Option<String>,
    pub status: String, // "pending", "copied", "skipped", "failed"
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportManifest {
    pub batch_id: String,
    pub created_at: u64,
    pub target_directory: String,
    pub total_items: usize,
    pub items: Vec<ExportManifestItem>,
}

impl ExportManifest {
    pub fn new(target_dir: &Path, photo_paths: &[String]) -> Self {
        let batch_id = uuid::Uuid::new_v4().to_string();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let items = photo_paths
            .iter()
            .map(|p| {
                let name = Path::new(p)
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy();
                ExportManifestItem {
                    source_path: p.clone(),
                    target_path: target_dir.join(name.as_ref()).to_string_lossy().to_string(),
                    sha256: None,
                    status: "pending".to_string(),
                    error: None,
                }
            })
            .collect();
        Self {
            batch_id,
            created_at: now,
            target_directory: target_dir.to_string_lossy().to_string(),
            total_items: photo_paths.len(),
            items,
        }
    }

    pub fn save(&self, target_dir: &Path) -> Result<PathBuf, String> {
        let manifest_path = target_dir.join(format!(".quickpick_manifest_{}.json", self.batch_id));
        let data =
            serde_json::to_string_pretty(self).map_err(|e| format!("序列化导出清单失败: {e}"))?;
        let tmp_path = target_dir.join(format!(".quickpick_manifest_{}.tmp", self.batch_id));

        let mut file =
            fs::File::create(&tmp_path).map_err(|e| format!("创建清单临时文件失败: {e}"))?;
        file.write_all(data.as_bytes())
            .map_err(|e| format!("写入清单数据失败: {e}"))?;
        file.sync_all()
            .map_err(|e| format!("刷盘清单文件失败: {e}"))?;
        drop(file);

        fs::rename(&tmp_path, &manifest_path).map_err(|e| format!("原子更新清单文件失败: {e}"))?;
        let _ = fsync_dir(target_dir);
        Ok(manifest_path)
    }
}

enum ExportItemResult {
    Skipped,
    Cancelled,
    Success { included_xmp: bool, sha256: String },
}

#[derive(Debug, Clone)]
struct SourceSnapshot {
    size: u64,
    modified: SystemTime,
}

struct VerifiedCopy {
    sha256: String,
    source_snapshot: SourceSnapshot,
}

const MAX_MANIFEST_BYTES: usize = 16 * 1024 * 1024;

/// 获取只读复制使用的同名 XMP 伴侣路径；该函数不读取也不写入源目录。
pub fn companion_xmp_path<P: AsRef<Path>>(photo_path: P) -> PathBuf {
    let mut xmp_path = photo_path.as_ref().to_path_buf();
    xmp_path.set_extension("xmp");
    xmp_path
}

fn sibling_work_path(path: &Path, token: &str, suffix: &str) -> PathBuf {
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    path.with_file_name(format!(".{name}.{token}.{suffix}"))
}

#[cfg(unix)]
fn is_same_file_inode(meta_a: &fs::Metadata, meta_b: &fs::Metadata) -> bool {
    meta_a.dev() == meta_b.dev() && meta_a.ino() == meta_b.ino()
}

#[cfg(not(unix))]
fn is_same_file_inode(_meta_a: &fs::Metadata, _meta_b: &fs::Metadata) -> bool {
    false
}

fn fsync_dir(dir: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        let f = fs::File::open(dir)?;
        f.sync_all()?;
    }
    #[cfg(not(unix))]
    {
        let _ = dir;
    }
    Ok(())
}

#[cfg(unix)]
fn available_space(path: &Path) -> Result<u64, String> {
    use std::ffi::CString;
    use std::os::unix::ffi::OsStrExt;

    let path = CString::new(path.as_os_str().as_bytes())
        .map_err(|_| "目标目录路径包含无效的空字符".to_string())?;
    let mut stats = std::mem::MaybeUninit::<libc::statvfs>::uninit();
    // SAFETY: `path` is NUL-terminated and `stats` points to writable, correctly sized memory.
    let result = unsafe { libc::statvfs(path.as_ptr(), stats.as_mut_ptr()) };
    if result != 0 {
        return Err(format!(
            "无法读取目标磁盘可用空间: {}",
            std::io::Error::last_os_error()
        ));
    }
    // SAFETY: a successful `statvfs` call initialized `stats`.
    let stats = unsafe { stats.assume_init() };
    #[allow(clippy::unnecessary_cast)]
    let available_blocks = stats.f_bavail as u64;
    #[allow(clippy::unnecessary_cast)]
    let fragment_size = stats.f_frsize as u64;
    Ok(available_blocks.saturating_mul(fragment_size))
}

fn ensure_sufficient_space(required_bytes: u64, available_bytes: u64) -> Result<(), String> {
    if available_bytes < required_bytes {
        return Err(format!(
            "目标磁盘可用空间不足：需要至少 {required_bytes} 字节，当前可用 {available_bytes} 字节"
        ));
    }
    Ok(())
}

#[cfg(windows)]
fn available_space(path: &Path) -> Result<u64, String> {
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    extern "system" {
        fn GetDiskFreeSpaceExW(
            directory_name: *const u16,
            free_bytes_available: *mut u64,
            total_bytes: *mut u64,
            total_free_bytes: *mut u64,
        ) -> i32;
    }

    let wide_path = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let mut free_bytes = 0_u64;
    // SAFETY: `wide_path` is NUL-terminated and all output pointers are valid for writes.
    let result = unsafe {
        GetDiskFreeSpaceExW(
            wide_path.as_ptr(),
            &mut free_bytes,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if result == 0 {
        return Err(format!(
            "无法读取目标磁盘可用空间: {}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(free_bytes)
}

fn source_snapshot(path: &Path) -> Result<SourceSnapshot, String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("读取源文件元数据失败: {}: {error}", path.display()))?;
    if !metadata.is_file() {
        return Err(format!("源路径不再是普通文件: {}", path.display()));
    }
    let modified = metadata
        .modified()
        .map_err(|error| format!("读取源文件修改时间失败: {}: {error}", path.display()))?;
    Ok(SourceSnapshot {
        size: metadata.len(),
        modified,
    })
}

fn verify_source_unchanged(path: &Path, expected: &SourceSnapshot) -> Result<(), String> {
    let current = source_snapshot(path)?;
    if current.size != expected.size || current.modified != expected.modified {
        return Err(format!(
            "复制期间源文件发生变化，已终止提交: {}",
            path.display()
        ));
    }
    Ok(())
}

fn cleanup_file(path: &Path) {
    let _ = fs::remove_file(path);
}

/// 将已刷盘的同目录临时文件以“不覆盖”语义原子发布到最终路径。
/// 硬链接创建在目标已存在时会失败，避免 `rename` 在 Unix 上静默覆盖竞争写入。
fn commit_no_replace(staged: &Path, destination: &Path) -> Result<(), String> {
    fs::hard_link(staged, destination).map_err(|error| {
        format!(
            "目标文件已存在或无法安全提交 {}: {error}",
            destination.display()
        )
    })?;
    cleanup_file(staged);
    Ok(())
}

/// 保存用户主动导出的 TXT/CSV/JSON 清单。永不覆盖已有文件。
pub fn save_manifest_file(path: &str, content: &str) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("清单保存路径不能为空".to_string());
    }
    if content.is_empty() {
        return Err("清单内容不能为空".to_string());
    }
    if content.len() > MAX_MANIFEST_BYTES {
        return Err(format!(
            "清单内容超过安全上限（{} MiB）",
            MAX_MANIFEST_BYTES / (1024 * 1024)
        ));
    }

    let destination = PathBuf::from(path);
    if destination.exists() {
        return Err("目标文件已存在。为避免覆盖，请在保存对话框中选择新的文件名".to_string());
    }
    let parent = destination
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| "清单必须保存到明确的已有目录".to_string())?;
    if !parent.exists() || !parent.is_dir() {
        return Err("清单目标目录不存在或不是文件夹".to_string());
    }

    let token = uuid::Uuid::new_v4().to_string();
    let temporary = sibling_work_path(&destination, &token, "quickpick-manifest-tmp");
    let write_result = (|| -> Result<(), String> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| format!("创建清单临时文件失败: {error}"))?;
        file.write_all(content.as_bytes())
            .map_err(|error| format!("写入清单失败: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("清单刷盘失败: {error}"))?;
        drop(file);
        commit_no_replace(&temporary, &destination)?;
        fsync_dir(parent).map_err(|error| format!("同步清单目录失败: {error}"))?;
        Ok(())
    })();

    if write_result.is_err() {
        cleanup_file(&temporary);
    }
    write_result
}

pub fn calculate_file_sha256(path: &Path) -> Result<String, String> {
    let mut file =
        fs::File::open(path).map_err(|e| format!("打开校验文件失败: {}: {e}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let bytes_read = file
            .read(&mut buffer)
            .map_err(|e| format!("读取校验文件失败: {}: {e}", path.display()))?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn copy_and_verify(source: &Path, staged: &Path) -> Result<VerifiedCopy, String> {
    let initial_snapshot = source_snapshot(source)?;
    if let Err(error) = fs::copy(source, staged) {
        cleanup_file(staged);
        return Err(format!("复制 {} 失败: {error}", source.display()));
    }
    let staged_size = match fs::metadata(staged) {
        Ok(metadata) => metadata.len(),
        Err(error) => {
            cleanup_file(staged);
            return Err(format!("读取临时文件大小失败: {error}"));
        }
    };
    if initial_snapshot.size != staged_size {
        cleanup_file(staged);
        return Err(format!(
            "复制大小校验失败: {} 字节 != {} 字节",
            initial_snapshot.size, staged_size
        ));
    }

    // SHA-256 内容完整性校验，杜绝等长损坏与网络传输位翻转
    let source_hash = calculate_file_sha256(source).inspect_err(|_| cleanup_file(staged))?;
    let staged_hash = calculate_file_sha256(staged).inspect_err(|_| cleanup_file(staged))?;
    if source_hash != staged_hash {
        cleanup_file(staged);
        return Err(format!(
            "复制内容 Hash 校验不匹配: 源 {source_hash} != 暂存 {staged_hash}"
        ));
    }

    verify_source_unchanged(source, &initial_snapshot).inspect_err(|_| cleanup_file(staged))?;

    fs::File::open(staged)
        .and_then(|file| file.sync_all())
        .map_err(|error| format!("同步刷盘临时文件失败: {error}"))
        .inspect_err(|_| cleanup_file(staged))?;

    Ok(VerifiedCopy {
        sha256: source_hash,
        source_snapshot: initial_snapshot,
    })
}

fn validate_source_and_target(
    source_photo: &Path,
    target_dir: &Path,
) -> Result<(PathBuf, PathBuf), String> {
    if !source_photo.exists() {
        return Err(format!("源底片不存在: {}", source_photo.display()));
    }
    if !source_photo.is_file() {
        return Err(format!("源路径不是普通文件: {}", source_photo.display()));
    }

    let canonical_src = fs::canonicalize(source_photo)
        .map_err(|e| format!("解析源底片物理路径失败: {}: {e}", source_photo.display()))?;
    let canonical_target_dir = fs::canonicalize(target_dir)
        .map_err(|e| format!("解析目标目录物理路径失败: {}: {e}", target_dir.display()))?;

    // 目标目录不能是源相册目录，也不能位于源相册目录内部。
    if let Some(src_parent) = canonical_src.parent() {
        if canonical_target_dir.starts_with(src_parent) {
            return Err("导出目标目录不能是源相册目录或其子目录（包含符号链接映射）".to_string());
        }
    }

    Ok((canonical_src, canonical_target_dir))
}

fn add_planned_target(
    planned_targets: &mut HashMap<PathBuf, String>,
    conflicts: &mut Vec<ExportConflict>,
    source: &Path,
    target: &Path,
) {
    let source_string = source.to_string_lossy().to_string();
    let target_string = target.to_string_lossy().to_string();
    if target.exists() {
        conflicts.push(ExportConflict {
            source_path: source_string,
            target_path: target_string,
            reason: "目标已存在，将安全跳过".to_string(),
        });
    } else if let Some(previous_source) = planned_targets.get(target) {
        conflicts.push(ExportConflict {
            source_path: source_string,
            target_path: target_string,
            reason: format!("与另一源文件同名，将安全跳过（另一源文件: {previous_source}）"),
        });
    } else {
        planned_targets.insert(target.to_path_buf(), source_string);
    }
}

/// 仅读取源和目标状态，不创建 manifest、目录或临时文件。
pub fn preflight_export(options: &ExportOptions) -> Result<ExportPreflight, String> {
    if options.photo_paths.is_empty() {
        return Err("待导出照片列表为空".to_string());
    }
    let target_path = PathBuf::from(&options.target_dir);
    if !target_path.exists() {
        return Err("导出目标文件夹不存在，请通过系统选择器明确选择一个已有文件夹".to_string());
    }
    if !target_path.is_dir() {
        return Err("导出目标不是文件夹".to_string());
    }
    let canonical_target_dir = fs::canonicalize(&target_path)
        .map_err(|error| format!("解析目标目录物理路径失败: {error}"))?;

    let mut canonical_sources = HashSet::with_capacity(options.photo_paths.len());
    let mut planned_targets = HashMap::new();
    let mut conflicts = Vec::new();
    let mut total_files = 0_usize;
    let mut total_bytes = 0_u64;

    for source in &options.photo_paths {
        let (canonical_source, _) =
            validate_source_and_target(Path::new(source), &canonical_target_dir)?;
        if !canonical_sources.insert(canonical_source.clone()) {
            return Err(format!(
                "选择列表包含重复源文件: {}",
                canonical_source.display()
            ));
        }

        let source_metadata = fs::metadata(&canonical_source)
            .map_err(|error| format!("读取源底片大小失败: {error}"))?;
        total_files = total_files.saturating_add(1);
        total_bytes = total_bytes.saturating_add(source_metadata.len());
        let file_name = canonical_source
            .file_name()
            .ok_or_else(|| format!("无法识别源文件名: {}", canonical_source.display()))?;
        add_planned_target(
            &mut planned_targets,
            &mut conflicts,
            &canonical_source,
            &canonical_target_dir.join(file_name),
        );

        let source_xmp = companion_xmp_path(&canonical_source);
        if options.include_xmp && source_xmp.is_file() {
            let xmp_metadata = fs::metadata(&source_xmp)
                .map_err(|error| format!("读取源 XMP 大小失败: {error}"))?;
            total_files = total_files.saturating_add(1);
            total_bytes = total_bytes.saturating_add(xmp_metadata.len());
            add_planned_target(
                &mut planned_targets,
                &mut conflicts,
                &source_xmp,
                &companion_xmp_path(canonical_target_dir.join(file_name)),
            );
        }
    }

    let available_bytes = available_space(&canonical_target_dir)?;
    // 为事务清单、文件系统元数据和并发空间波动保留至少 1 MiB 余量。
    let required_bytes = total_bytes.saturating_add(1024 * 1024);
    Ok(ExportPreflight {
        total_photos: options.photo_paths.len(),
        total_files,
        total_bytes,
        required_bytes,
        available_bytes,
        has_enough_space: available_bytes >= required_bytes,
        conflicts,
    })
}

fn export_one(
    source_photo: &Path,
    target_dir: &Path,
    options: &ExportOptions,
    job_id: &str,
    item_index: usize,
    report_progress: &mut dyn FnMut(&ExportProgressUpdate) -> Result<(), String>,
    should_cancel: &dyn Fn() -> bool,
) -> Result<ExportItemResult, String> {
    let (canonical_source, canonical_target_dir) =
        validate_source_and_target(source_photo, target_dir)?;
    let file_name = canonical_source
        .file_name()
        .ok_or_else(|| format!("无法识别源文件名: {}", canonical_source.display()))?;
    let destination_photo = canonical_target_dir.join(file_name);

    let source_xmp_path = companion_xmp_path(&canonical_source);
    let source_xmp = (options.include_xmp && source_xmp_path.is_file()).then_some(source_xmp_path);
    let destination_xmp = source_xmp
        .as_ref()
        .map(|_| companion_xmp_path(&destination_photo));

    if destination_photo.exists() {
        // 校验是否为同一物理文件（Inode 或规范化物理路径）
        let src_meta =
            fs::metadata(&canonical_source).map_err(|e| format!("读取源底片元数据失败: {e}"))?;
        let dest_meta =
            fs::metadata(&destination_photo).map_err(|e| format!("读取目标底片元数据失败: {e}"))?;

        if is_same_file_inode(&src_meta, &dest_meta) {
            return Err("检测到目标路径与源底片具有相同 Inode（硬链接或符号链接别名），已阻断导出以防自覆盖损毁".to_string());
        }

        if let Ok(canonical_dest) = fs::canonicalize(&destination_photo) {
            if canonical_source == canonical_dest {
                return Err(
                    "目标文件物理路径与源底片完全一致（符号链接别名），已拒绝操作".to_string(),
                );
            }
        }

        // 非覆盖模式下安全跳过已有底片
        return Ok(ExportItemResult::Skipped);
    }

    // 若 XMP 伴侣已存在且未开启覆盖，整体跳过该组以防覆盖已有调色
    if destination_xmp.as_ref().is_some_and(|p| p.exists()) {
        return Ok(ExportItemResult::Skipped);
    }

    if should_cancel() {
        return Ok(ExportItemResult::Cancelled);
    }

    let token = format!("{job_id}-{}", uuid::Uuid::new_v4());
    let staged_photo = sibling_work_path(&destination_photo, &token, "quickpick-tmp");
    let staged_xmp = destination_xmp
        .as_ref()
        .map(|path| sibling_work_path(path, &token, "quickpick-tmp"));

    let verified_photo = copy_and_verify(&canonical_source, &staged_photo)?;
    let verified_xmp =
        if let (Some(source), Some(staged)) = (source_xmp.as_ref(), staged_xmp.as_ref()) {
            match copy_and_verify(source, staged) {
                Ok(verified) => Some(verified),
                Err(error) => {
                    cleanup_file(&staged_photo);
                    return Err(error);
                }
            }
        } else {
            None
        };

    if let Err(error) = verify_source_unchanged(&canonical_source, &verified_photo.source_snapshot)
    {
        cleanup_file(&staged_photo);
        if let Some(staged) = staged_xmp.as_ref() {
            cleanup_file(staged);
        }
        return Err(error);
    }
    if let (Some(source), Some(staged), Some(verified)) = (
        source_xmp.as_ref(),
        staged_xmp.as_ref(),
        verified_xmp.as_ref(),
    ) {
        if let Err(error) = verify_source_unchanged(source, &verified.source_snapshot) {
            cleanup_file(&staged_photo);
            cleanup_file(staged);
            return Err(error);
        }
    }

    if should_cancel() {
        cleanup_file(&staged_photo);
        if let Some(staged) = staged_xmp.as_ref() {
            cleanup_file(staged);
        }
        return Ok(ExportItemResult::Cancelled);
    }

    if let Err(error) = report_progress(&ExportProgressUpdate {
        item_index,
        status: "verified",
        sha256: Some(verified_photo.sha256.clone()),
        error: None,
    }) {
        cleanup_file(&staged_photo);
        if let Some(staged) = staged_xmp.as_ref() {
            cleanup_file(staged);
        }
        return Err(format!("记录导出校验状态失败: {error}"));
    }
    if should_cancel() {
        cleanup_file(&staged_photo);
        if let Some(staged) = staged_xmp.as_ref() {
            cleanup_file(staged);
        }
        return Ok(ExportItemResult::Cancelled);
    }

    // 状态回调或网络文件系统延迟期间，源文件仍可能被外部程序替换。
    // 在不可逆的目标提交前做最后一次版本检查，发现变化即丢弃暂存副本。
    if let Err(error) = verify_source_unchanged(&canonical_source, &verified_photo.source_snapshot)
    {
        cleanup_file(&staged_photo);
        if let Some(staged) = staged_xmp.as_ref() {
            cleanup_file(staged);
        }
        return Err(error);
    }
    if let (Some(source), Some(staged), Some(verified)) = (
        source_xmp.as_ref(),
        staged_xmp.as_ref(),
        verified_xmp.as_ref(),
    ) {
        if let Err(error) = verify_source_unchanged(source, &verified.source_snapshot) {
            cleanup_file(&staged_photo);
            cleanup_file(staged);
            return Err(error);
        }
    }

    // 以原子、不覆盖语义提交到目标路径。
    if let Err(error) = commit_no_replace(&staged_photo, &destination_photo) {
        cleanup_file(&staged_photo);
        if let Some(staged) = staged_xmp.as_ref() {
            cleanup_file(staged);
        }
        return Err(error);
    }

    if let (Some(staged), Some(destination)) = (staged_xmp.as_ref(), destination_xmp.as_ref()) {
        if let Err(error) = commit_no_replace(staged, destination) {
            // 如果提交 XMP 失败，清理已提交的目标底片（注意：源底片绝对不碰）
            cleanup_file(&destination_photo);
            cleanup_file(staged);
            return Err(format!(
                "提交目标 XMP 伴侣失败，目标底片已安全清理: {error}"
            ));
        }
    }

    let _ = fsync_dir(&canonical_target_dir);

    // 绝对安全红线：原始底片只读，任何导出操作永远不得删除源底片与源 XMP！

    Ok(ExportItemResult::Success {
        included_xmp: source_xmp.is_some(),
        sha256: verified_photo.sha256,
    })
}

/// 执行可持久化、可取消的选片批量导出流水线。
pub fn execute_export_controlled(
    options: &ExportOptions,
    job_id: &str,
    report_progress: &mut dyn FnMut(&ExportProgressUpdate) -> Result<(), String>,
    should_cancel: &dyn Fn() -> bool,
) -> Result<ExportResult, String> {
    uuid::Uuid::parse_str(job_id).map_err(|_| "导出任务 ID 无效".to_string())?;
    let target_path = PathBuf::from(&options.target_dir);
    if !target_path.exists() {
        return Err("导出目标文件夹不存在，请通过系统选择器明确选择一个已有文件夹".to_string());
    }
    if !target_path.is_dir() {
        return Err("导出目标不是文件夹".to_string());
    }

    let canonical_target_dir =
        fs::canonicalize(&target_path).map_err(|e| format!("解析目标目录物理路径失败: {e}"))?;

    let preflight = preflight_export(options)?;
    ensure_sufficient_space(preflight.required_bytes, preflight.available_bytes)?;

    // 在目标目录产生 manifest 或临时文件之前完成全部路径安全检查。
    let mut canonical_sources = HashSet::with_capacity(options.photo_paths.len());
    for source in &options.photo_paths {
        let (canonical_source, _) =
            validate_source_and_target(Path::new(source), &canonical_target_dir)?;
        if !canonical_sources.insert(canonical_source.clone()) {
            return Err(format!(
                "选择列表包含重复源文件，已在写入目标前终止: {}",
                canonical_source.display()
            ));
        }
    }

    // 创建持久化事务清单
    let mut manifest = ExportManifest::new(&canonical_target_dir, &options.photo_paths);
    manifest.batch_id = job_id.to_string();
    let _ = manifest.save(&canonical_target_dir)?;

    let mut result = ExportResult {
        job_id: job_id.to_string(),
        total: options.photo_paths.len(),
        success_photos: 0,
        success_xmps: 0,
        skipped: 0,
        failed: 0,
        unprocessed: 0,
        cancelled: false,
        target_directory: canonical_target_dir.to_string_lossy().to_string(),
        errors: Vec::new(),
    };

    for (idx, path_str) in options.photo_paths.iter().enumerate() {
        if should_cancel() {
            result.cancelled = true;
            for remaining_index in idx..options.photo_paths.len() {
                report_progress(&ExportProgressUpdate {
                    item_index: remaining_index,
                    status: "unprocessed",
                    sha256: None,
                    error: Some("用户取消导出".to_string()),
                })?;
                if let Some(item) = manifest.items.get_mut(remaining_index) {
                    item.status = "unprocessed".to_string();
                    item.error = Some("用户取消导出".to_string());
                }
                result.unprocessed += 1;
            }
            break;
        }
        report_progress(&ExportProgressUpdate {
            item_index: idx,
            status: "copying",
            sha256: None,
            error: None,
        })?;
        let src_photo = Path::new(path_str);
        match export_one(
            src_photo,
            &canonical_target_dir,
            options,
            job_id,
            idx,
            report_progress,
            should_cancel,
        ) {
            Ok(ExportItemResult::Success {
                included_xmp,
                sha256,
            }) => {
                result.success_photos += 1;
                if included_xmp {
                    result.success_xmps += 1;
                }
                if let Some(item) = manifest.items.get_mut(idx) {
                    item.status = "committed".to_string();
                    item.sha256 = Some(sha256);
                }
                report_progress(&ExportProgressUpdate {
                    item_index: idx,
                    status: "committed",
                    sha256: manifest.items.get(idx).and_then(|item| item.sha256.clone()),
                    error: None,
                })?;
            }
            Ok(ExportItemResult::Skipped) => {
                result.skipped += 1;
                if let Some(item) = manifest.items.get_mut(idx) {
                    item.status = "skipped".to_string();
                }
                report_progress(&ExportProgressUpdate {
                    item_index: idx,
                    status: "skipped",
                    sha256: None,
                    error: None,
                })?;
            }
            Ok(ExportItemResult::Cancelled) => {
                result.cancelled = true;
                for remaining_index in idx..options.photo_paths.len() {
                    report_progress(&ExportProgressUpdate {
                        item_index: remaining_index,
                        status: "unprocessed",
                        sha256: None,
                        error: Some("用户取消导出".to_string()),
                    })?;
                    if let Some(item) = manifest.items.get_mut(remaining_index) {
                        item.status = "unprocessed".to_string();
                        item.error = Some("用户取消导出".to_string());
                    }
                    result.unprocessed += 1;
                }
                break;
            }
            Err(error) => {
                result.failed += 1;
                result.errors.push(format!("{}: {}", path_str, error));
                if let Some(item) = manifest.items.get_mut(idx) {
                    item.status = "failed".to_string();
                    item.error = Some(error);
                }
                report_progress(&ExportProgressUpdate {
                    item_index: idx,
                    status: "failed",
                    sha256: None,
                    error: manifest.items.get(idx).and_then(|item| item.error.clone()),
                })?;
            }
        }
    }

    // 更新并保存最终清单
    let _ = manifest.save(&canonical_target_dir);

    // 联动打开系统文件管理器
    if options.open_after_export && result.success_photos > 0 {
        let _ = reveal_in_file_manager(&canonical_target_dir);
    }

    Ok(result)
}

/// 执行选片批量导出流水线（严格遵循原始照片只读安全红线）。
pub fn execute_export(options: &ExportOptions) -> Result<ExportResult, String> {
    let job_id = uuid::Uuid::new_v4().to_string();
    execute_export_controlled(options, &job_id, &mut |_| Ok(()), &|| false)
}

/// 在系统原生文件管理器 (macOS Finder / Windows Explorer) 中打开目标路径
pub fn reveal_in_file_manager<P: AsRef<Path>>(path: P) -> Result<(), String> {
    let p = path.as_ref();
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(p)
            .spawn()
            .map_err(|e| format!("打开 Finder 失败: {}", e))?;
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(p)
            .spawn()
            .map_err(|e| format!("打开资源管理器失败: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(p)
            .spawn()
            .map_err(|e| format!("打开文件管理器失败: {}", e))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    #[test]
    fn test_export_pipeline_copy() {
        let temp_dir =
            std::env::temp_dir().join(format!("qp_export_test_{}", uuid::Uuid::new_v4()));
        let src_dir = temp_dir.join("src");
        let dest_dir = temp_dir.join("dest");
        fs::create_dir_all(&src_dir).unwrap();
        fs::create_dir_all(&dest_dir).unwrap();

        let dummy_raw = src_dir.join("_DSC9999.ARW");
        let dummy_xmp = src_dir.join("_DSC9999.xmp");
        fs::write(&dummy_raw, b"dummy raw content for testing").unwrap();
        fs::write(&dummy_xmp, b"<x:xmpmeta>test xmp</x:xmpmeta>").unwrap();

        let options = ExportOptions {
            photo_paths: vec![dummy_raw.to_string_lossy().to_string()],
            target_dir: dest_dir.to_string_lossy().to_string(),
            include_xmp: true,
            open_after_export: false,
        };

        let res = execute_export(&options).unwrap();
        assert_eq!(res.total, 1);
        assert_eq!(res.success_photos, 1);
        assert_eq!(res.success_xmps, 1);
        assert_eq!(res.failed, 0);

        assert!(dest_dir.join("_DSC9999.ARW").exists());
        assert!(dest_dir.join("_DSC9999.xmp").exists());
        // 原文件绝对完好保留
        assert!(dummy_raw.exists());
        assert!(dummy_xmp.exists());

        // 验证持久化事务清单已落地
        let manifests: Vec<_> = fs::read_dir(&dest_dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with(".quickpick_manifest_")
            })
            .collect();
        assert!(!manifests.is_empty(), "必须持久化导出事务清单");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn controlled_export_cancellation_cleans_staging_and_marks_unprocessed() {
        let temp_dir =
            std::env::temp_dir().join(format!("qp_export_cancel_{}", uuid::Uuid::new_v4()));
        let src_dir = temp_dir.join("src");
        let dest_dir = temp_dir.join("dest");
        fs::create_dir_all(&src_dir).unwrap();
        fs::create_dir_all(&dest_dir).unwrap();
        let source = src_dir.join("frame.ARW");
        fs::write(&source, b"cancel before commit").unwrap();
        let options = ExportOptions {
            photo_paths: vec![source.to_string_lossy().to_string()],
            target_dir: dest_dir.to_string_lossy().to_string(),
            include_xmp: false,
            open_after_export: false,
        };
        let job_id = uuid::Uuid::new_v4().to_string();
        let cancelled = AtomicBool::new(false);
        let mut statuses = Vec::new();

        let result = execute_export_controlled(
            &options,
            &job_id,
            &mut |update| {
                statuses.push(update.status);
                if update.status == "verified" {
                    cancelled.store(true, Ordering::Relaxed);
                }
                Ok(())
            },
            &|| cancelled.load(Ordering::Relaxed),
        )
        .unwrap();

        assert!(result.cancelled);
        assert_eq!(result.success_photos, 0);
        assert_eq!(result.unprocessed, 1);
        assert_eq!(statuses, vec!["copying", "verified", "unprocessed"]);
        assert!(!dest_dir.join("frame.ARW").exists());
        assert_eq!(
            fs::read_dir(&dest_dir)
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| entry
                    .file_name()
                    .to_string_lossy()
                    .ends_with(".quickpick-tmp"))
                .count(),
            0
        );
        assert_eq!(fs::read(&source).unwrap(), b"cancel before commit");
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn unsafe_export_fields_are_rejected_at_the_ipc_boundary() {
        let json = r#"{
          "photo_paths":["photo.jpg"],
          "target_dir":"target",
          "include_xmp":false,
          "open_after_export":false,
          "is_move":true
        }"#;
        assert!(serde_json::from_str::<ExportOptions>(json).is_err());
    }

    #[test]
    fn manifest_save_is_atomic_and_does_not_leave_temporary_files() {
        let temp_dir =
            std::env::temp_dir().join(format!("qp_manifest_save_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();
        let destination = temp_dir.join("selected.csv");
        let content = "\u{feff}\"相对路径\"\r\n\"场景一/照片.jpg\"";

        save_manifest_file(destination.to_str().unwrap(), content).unwrap();

        assert_eq!(fs::read_to_string(&destination).unwrap(), content);
        assert_eq!(
            fs::read_dir(&temp_dir)
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| {
                    entry
                        .file_name()
                        .to_string_lossy()
                        .contains("quickpick-manifest-tmp")
                })
                .count(),
            0
        );
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn manifest_save_never_overwrites_an_existing_file() {
        let temp_dir =
            std::env::temp_dir().join(format!("qp_manifest_conflict_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();
        let destination = temp_dir.join("selected.json");
        fs::write(&destination, b"existing user data").unwrap();

        let error = save_manifest_file(destination.to_str().unwrap(), "replacement").unwrap_err();

        assert!(error.contains("已存在"));
        assert_eq!(fs::read(&destination).unwrap(), b"existing user data");
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn export_rejects_duplicate_sources_before_creating_manifest() {
        let temp_dir =
            std::env::temp_dir().join(format!("qp_export_duplicate_{}", uuid::Uuid::new_v4()));
        let src_dir = temp_dir.join("src");
        let dest_dir = temp_dir.join("dest");
        fs::create_dir_all(&src_dir).unwrap();
        fs::create_dir_all(&dest_dir).unwrap();
        let source = src_dir.join("frame.ARW");
        fs::write(&source, b"raw bytes").unwrap();
        let source_path = source.to_string_lossy().to_string();

        let error = execute_export(&ExportOptions {
            photo_paths: vec![source_path.clone(), source_path],
            target_dir: dest_dir.to_string_lossy().to_string(),
            include_xmp: false,
            open_after_export: false,
        })
        .unwrap_err();

        assert!(error.contains("重复源文件"));
        assert_eq!(fs::read_dir(&dest_dir).unwrap().count(), 0);
        assert_eq!(fs::read(&source).unwrap(), b"raw bytes");
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn preflight_reports_sizes_and_every_same_name_conflict_without_writing() {
        let temp_dir =
            std::env::temp_dir().join(format!("qp_export_preflight_{}", uuid::Uuid::new_v4()));
        let first_dir = temp_dir.join("first");
        let second_dir = temp_dir.join("second");
        let dest_dir = temp_dir.join("dest");
        fs::create_dir_all(&first_dir).unwrap();
        fs::create_dir_all(&second_dir).unwrap();
        fs::create_dir_all(&dest_dir).unwrap();
        let first = first_dir.join("frame.ARW");
        let second = second_dir.join("frame.ARW");
        fs::write(&first, b"first raw").unwrap();
        fs::write(&second, b"second raw content").unwrap();

        let preflight = preflight_export(&ExportOptions {
            photo_paths: vec![
                first.to_string_lossy().to_string(),
                second.to_string_lossy().to_string(),
            ],
            target_dir: dest_dir.to_string_lossy().to_string(),
            include_xmp: false,
            open_after_export: false,
        })
        .unwrap();

        assert_eq!(preflight.total_photos, 2);
        assert_eq!(preflight.total_files, 2);
        assert_eq!(preflight.total_bytes, 27);
        assert_eq!(preflight.conflicts.len(), 1);
        assert!(preflight.conflicts[0].reason.contains("另一源文件同名"));
        assert_eq!(fs::read_dir(&dest_dir).unwrap().count(), 0);
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn insufficient_target_space_is_rejected_before_any_write() {
        let error = ensure_sufficient_space(8 * 1024 * 1024, 1024).unwrap_err();
        assert!(error.contains("可用空间不足"));
        assert!(error.contains("8388608"));
        assert!(error.contains("1024"));
    }

    #[test]
    fn source_snapshot_detects_external_changes() {
        let temp_dir =
            std::env::temp_dir().join(format!("qp_export_source_change_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();
        let source = temp_dir.join("changing.ARW");
        fs::write(&source, b"before").unwrap();
        let snapshot = source_snapshot(&source).unwrap();

        fs::write(&source, b"after with a different size").unwrap();

        let error = verify_source_unchanged(&source, &snapshot).unwrap_err();
        assert!(error.contains("发生变化"));
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn source_modified_after_verification_is_not_committed() {
        let temp_dir =
            std::env::temp_dir().join(format!("qp_export_late_change_{}", uuid::Uuid::new_v4()));
        let src_dir = temp_dir.join("src");
        let dest_dir = temp_dir.join("dest");
        fs::create_dir_all(&src_dir).unwrap();
        fs::create_dir_all(&dest_dir).unwrap();
        let source = src_dir.join("frame.ARW");
        fs::write(&source, b"original raw bytes").unwrap();
        let options = ExportOptions {
            photo_paths: vec![source.to_string_lossy().to_string()],
            target_dir: dest_dir.to_string_lossy().to_string(),
            include_xmp: false,
            open_after_export: false,
        };

        let result = execute_export_controlled(
            &options,
            &uuid::Uuid::new_v4().to_string(),
            &mut |update| {
                if update.status == "verified" {
                    fs::write(&source, b"externally replaced after verification").unwrap();
                }
                Ok(())
            },
            &|| false,
        )
        .unwrap();

        assert_eq!(result.failed, 1);
        assert_eq!(result.success_photos, 0);
        assert!(!dest_dir.join("frame.ARW").exists());
        assert_eq!(
            fs::read(&source).unwrap(),
            b"externally replaced after verification"
        );
        assert_eq!(
            fs::read_dir(&dest_dir)
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| entry
                    .file_name()
                    .to_string_lossy()
                    .ends_with(".quickpick-tmp"))
                .count(),
            0
        );
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn disconnected_target_during_export_fails_without_touching_source() {
        let temp_dir =
            std::env::temp_dir().join(format!("qp_target_disconnect_{}", uuid::Uuid::new_v4()));
        let src_dir = temp_dir.join("src");
        let dest_dir = temp_dir.join("dest");
        let disconnected_dest = temp_dir.join("disconnected-dest");
        fs::create_dir_all(&src_dir).unwrap();
        fs::create_dir_all(&dest_dir).unwrap();
        let source = src_dir.join("frame.ARW");
        fs::write(&source, b"source must survive target loss").unwrap();
        let options = ExportOptions {
            photo_paths: vec![source.to_string_lossy().to_string()],
            target_dir: dest_dir.to_string_lossy().to_string(),
            include_xmp: false,
            open_after_export: false,
        };
        let mut disconnected = false;

        let result = execute_export_controlled(
            &options,
            &uuid::Uuid::new_v4().to_string(),
            &mut |update| {
                if update.status == "copying" && !disconnected {
                    fs::rename(&dest_dir, &disconnected_dest).unwrap();
                    disconnected = true;
                }
                Ok(())
            },
            &|| false,
        )
        .unwrap();

        assert_eq!(result.failed, 1);
        assert_eq!(result.success_photos, 0);
        assert_eq!(
            fs::read(&source).unwrap(),
            b"source must survive target loss"
        );
        assert!(!disconnected_dest.join("frame.ARW").exists());
        assert_eq!(
            fs::read_dir(&disconnected_dest)
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| entry
                    .file_name()
                    .to_string_lossy()
                    .ends_with(".quickpick-tmp"))
                .count(),
            0
        );
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_export_rejects_source_album_subdirectory_before_writing() {
        let temp_dir =
            std::env::temp_dir().join(format!("qp_export_source_child_{}", uuid::Uuid::new_v4()));
        let src_dir = temp_dir.join("src");
        let forbidden_target = src_dir.join("QuickPick_已选照片");
        fs::create_dir_all(&forbidden_target).unwrap();
        let raw = src_dir.join("frame.ARW");
        fs::write(&raw, b"raw bytes").unwrap();

        let result = execute_export(&ExportOptions {
            photo_paths: vec![raw.to_string_lossy().to_string()],
            target_dir: forbidden_target.to_string_lossy().to_string(),
            include_xmp: false,
            open_after_export: false,
        });

        assert!(result.is_err());
        assert!(result.unwrap_err().contains("子目录"));
        assert_eq!(fs::read(&raw).unwrap(), b"raw bytes");
        assert_eq!(fs::read_dir(&forbidden_target).unwrap().count(), 0);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_export_skips_when_dest_exists() {
        let temp_dir =
            std::env::temp_dir().join(format!("qp_export_conflict_{}", uuid::Uuid::new_v4()));
        let src_dir = temp_dir.join("src");
        let dest_dir = temp_dir.join("dest");
        fs::create_dir_all(&src_dir).unwrap();
        fs::create_dir_all(&dest_dir).unwrap();

        let raw = src_dir.join("frame.ARW");
        fs::write(&raw, b"raw bytes").unwrap();
        fs::write(dest_dir.join("frame.ARW"), b"existing dest raw").unwrap();

        let result = execute_export(&ExportOptions {
            photo_paths: vec![raw.to_string_lossy().to_string()],
            target_dir: dest_dir.to_string_lossy().to_string(),
            include_xmp: false,
            open_after_export: false,
        })
        .unwrap();

        assert_eq!(result.skipped, 1);
        assert_eq!(result.success_photos, 0);
        // 原片和已有目标片完好无损
        assert_eq!(
            fs::read(dest_dir.join("frame.ARW")).unwrap(),
            b"existing dest raw"
        );
        assert_eq!(fs::read(&raw).unwrap(), b"raw bytes");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_export_skips_entire_pair_when_only_xmp_conflicts() {
        let temp_dir =
            std::env::temp_dir().join(format!("qp_export_conflict_xmp_{}", uuid::Uuid::new_v4()));
        let src_dir = temp_dir.join("src");
        let dest_dir = temp_dir.join("dest");
        fs::create_dir_all(&src_dir).unwrap();
        fs::create_dir_all(&dest_dir).unwrap();

        let raw = src_dir.join("frame.ARW");
        fs::write(&raw, b"raw bytes").unwrap();
        fs::write(src_dir.join("frame.xmp"), b"new xmp").unwrap();
        fs::write(dest_dir.join("frame.xmp"), b"existing xmp").unwrap();

        let result = execute_export(&ExportOptions {
            photo_paths: vec![raw.to_string_lossy().to_string()],
            target_dir: dest_dir.to_string_lossy().to_string(),
            include_xmp: true,
            open_after_export: false,
        })
        .unwrap();

        assert_eq!(result.skipped, 1);
        assert!(!dest_dir.join("frame.ARW").exists());
        assert_eq!(
            fs::read(dest_dir.join("frame.xmp")).unwrap(),
            b"existing xmp"
        );

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_export_copy_and_verify_hash_integrity() {
        let temp_dir =
            std::env::temp_dir().join(format!("qp_export_hash_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();

        let src = temp_dir.join("source.dat");
        let staged = temp_dir.join("staged.dat");
        fs::write(&src, b"1234567890abcdef").unwrap();

        // 正常校验
        copy_and_verify(&src, &staged).unwrap();
        assert!(staged.exists());

        // 构造等长但内容损坏的文件
        let corrupt_staged = temp_dir.join("corrupt.dat");
        fs::write(&corrupt_staged, b"0987654321fedcba").unwrap();
        let src_hash = calculate_file_sha256(&src).unwrap();
        let corrupt_hash = calculate_file_sha256(&corrupt_staged).unwrap();
        assert_ne!(src_hash, corrupt_hash);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_export_aborts_cleanly_on_read_only_target() {
        let temp_dir = std::env::temp_dir().join(format!("qp_export_ro_{}", uuid::Uuid::new_v4()));
        let src_dir = temp_dir.join("src");
        fs::create_dir_all(&src_dir).unwrap();

        let raw = src_dir.join("sample.ARW");
        let xmp = src_dir.join("sample.xmp");
        fs::write(&raw, b"raw content").unwrap();
        fs::write(&xmp, b"xmp content").unwrap();

        // 目标目录不存在且无法创建的非法路径
        let invalid_dest = temp_dir.join("invalid_file_as_dir/sub");
        fs::write(temp_dir.join("invalid_file_as_dir"), b"not a dir").unwrap();

        let result = execute_export(&ExportOptions {
            photo_paths: vec![raw.to_string_lossy().to_string()],
            target_dir: invalid_dest.to_string_lossy().to_string(),
            include_xmp: true,
            open_after_export: false,
        });

        // 必须优雅失败且原片与 XMP 完好无损
        assert!(result.is_err() || result.unwrap().failed > 0);
        assert!(raw.exists());
        assert!(xmp.exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[cfg(unix)]
    #[test]
    fn test_export_symlink_alias_directory_rejected() {
        let temp_dir =
            std::env::temp_dir().join(format!("qp_export_symlink_{}", uuid::Uuid::new_v4()));
        let src_dir = temp_dir.join("real_source");
        fs::create_dir_all(&src_dir).unwrap();

        let raw = src_dir.join("sym_test.ARW");
        fs::write(&raw, b"symlink test raw").unwrap();

        // 创建指向真实源目录的符号链接
        let symlink_dest = temp_dir.join("alias_target");
        std::os::unix::fs::symlink(&src_dir, &symlink_dest).unwrap();

        let result = execute_export(&ExportOptions {
            photo_paths: vec![raw.to_string_lossy().to_string()],
            target_dir: symlink_dest.to_string_lossy().to_string(),
            include_xmp: false,
            open_after_export: false,
        });

        // 必须被检测出源目录与目标目录相同/别名并拒绝
        assert!(result.is_err() || result.unwrap().failed > 0);
        assert!(raw.exists(), "原片绝不可被删除或破坏");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[cfg(unix)]
    #[test]
    fn test_export_hardlink_alias_rejected() {
        let temp_dir =
            std::env::temp_dir().join(format!("qp_export_hardlink_{}", uuid::Uuid::new_v4()));
        let src_dir = temp_dir.join("src");
        let dest_dir = temp_dir.join("dest");
        fs::create_dir_all(&src_dir).unwrap();
        fs::create_dir_all(&dest_dir).unwrap();

        let raw = src_dir.join("origin.ARW");
        fs::write(&raw, b"hardlink raw content").unwrap();

        // 在目标目录下创建指向源文件的硬链接
        let dest_hardlink = dest_dir.join("origin.ARW");
        fs::hard_link(&raw, &dest_hardlink).unwrap();

        let result = execute_export(&ExportOptions {
            photo_paths: vec![raw.to_string_lossy().to_string()],
            target_dir: dest_dir.to_string_lossy().to_string(),
            include_xmp: false,
            open_after_export: false,
        });

        // 必须检测到同一 Inode 并阻断操作
        assert!(result.is_err() || result.unwrap().failed > 0);
        assert!(raw.exists(), "原片绝对完好");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
