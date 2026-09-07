use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use crate::xmp::get_xmp_path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    pub photo_paths: Vec<String>,
    pub target_dir: String,
    pub is_move: bool,            // false = 复制, true = 移动
    pub include_xmp: bool,        // 是否包含同名 .xmp 伴侣文件
    pub overwrite: bool,          // 是否直接覆盖
    pub open_after_export: bool,  // 导出后在文件管理器中打开
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub total: usize,
    pub success_photos: usize,
    pub success_xmps: usize,
    pub skipped: usize,
    pub failed: usize,
    pub target_directory: String,
    pub errors: Vec<String>,
}

enum ExportItemResult {
    Skipped,
    Success { included_xmp: bool },
}

fn sibling_work_path(path: &Path, token: &str, suffix: &str) -> PathBuf {
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    path.with_file_name(format!(".{name}.{token}.{suffix}"))
}

fn copy_and_verify(source: &Path, staged: &Path) -> Result<(), String> {
    if let Err(error) = fs::copy(source, staged) {
        let _ = fs::remove_file(staged);
        return Err(format!("复制 {} 失败: {error}", source.display()));
    }
    let source_size = fs::metadata(source)
        .map_err(|error| format!("读取源文件大小失败: {error}"))?
        .len();
    let staged_size = fs::metadata(staged)
        .map_err(|error| format!("读取临时文件大小失败: {error}"))?
        .len();
    if source_size != staged_size {
        let _ = fs::remove_file(staged);
        return Err(format!(
            "复制校验失败: {} 字节 != {} 字节",
            source_size, staged_size
        ));
    }
    fs::File::open(staged)
        .and_then(|file| file.sync_all())
        .map_err(|error| format!("同步临时文件失败: {error}"))
}

fn restore_target(destination: &Path, backup: Option<&Path>) {
    let _ = fs::remove_file(destination);
    if let Some(backup_path) = backup {
        if backup_path.exists() {
            let _ = fs::rename(backup_path, destination);
        }
    }
}

fn export_one(
    source_photo: &Path,
    target_dir: &Path,
    options: &ExportOptions,
) -> Result<ExportItemResult, String> {
    let file_name = source_photo
        .file_name()
        .ok_or_else(|| format!("无法识别源文件名: {}", source_photo.display()))?;
    let destination_photo = target_dir.join(file_name);
    if source_photo == destination_photo {
        return Err("源目录与导出目录相同，已拒绝覆盖原片".to_string());
    }

    let source_xmp_path = get_xmp_path(source_photo);
    let source_xmp = (options.include_xmp && source_xmp_path.is_file()).then_some(source_xmp_path);
    let destination_xmp = source_xmp.as_ref().map(|_| get_xmp_path(&destination_photo));

    let destination_conflicts = destination_photo.exists()
        || destination_xmp.as_ref().is_some_and(|path| path.exists());
    if destination_conflicts && !options.overwrite {
        return Ok(ExportItemResult::Skipped);
    }

    let token = uuid::Uuid::new_v4().to_string();
    let staged_photo = sibling_work_path(&destination_photo, &token, "quickpick-tmp");
    let staged_xmp = destination_xmp
        .as_ref()
        .map(|path| sibling_work_path(path, &token, "quickpick-tmp"));

    copy_and_verify(source_photo, &staged_photo)?;
    if let (Some(source), Some(staged)) = (source_xmp.as_ref(), staged_xmp.as_ref()) {
        if let Err(error) = copy_and_verify(source, staged) {
            let _ = fs::remove_file(&staged_photo);
            return Err(error);
        }
    }

    let backup_photo = destination_photo
        .exists()
        .then(|| sibling_work_path(&destination_photo, &token, "quickpick-backup"));
    let backup_xmp = destination_xmp.as_ref().and_then(|path| {
        path.exists()
            .then(|| sibling_work_path(path, &token, "quickpick-backup"))
    });

    if let Some(backup) = backup_photo.as_ref() {
        if let Err(error) = fs::rename(&destination_photo, backup) {
            let _ = fs::remove_file(&staged_photo);
            if let Some(staged) = staged_xmp.as_ref() {
                let _ = fs::remove_file(staged);
            }
            return Err(format!("备份目标底片失败: {error}"));
        }
    }
    if let (Some(destination), Some(backup)) = (destination_xmp.as_ref(), backup_xmp.as_ref()) {
        if let Err(error) = fs::rename(destination, backup) {
            restore_target(&destination_photo, backup_photo.as_deref());
            let _ = fs::remove_file(&staged_photo);
            if let Some(staged) = staged_xmp.as_ref() {
                let _ = fs::remove_file(staged);
            }
            return Err(format!("备份目标 XMP 失败: {error}"));
        }
    }

    if let Err(error) = fs::rename(&staged_photo, &destination_photo) {
        restore_target(&destination_photo, backup_photo.as_deref());
        if let (Some(destination), Some(backup)) = (destination_xmp.as_ref(), backup_xmp.as_deref()) {
            restore_target(destination, Some(backup));
        }
        if let Some(staged) = staged_xmp.as_ref() {
            let _ = fs::remove_file(staged);
        }
        return Err(format!("提交目标底片失败: {error}"));
    }

    if let (Some(staged), Some(destination)) = (staged_xmp.as_ref(), destination_xmp.as_ref()) {
        if let Err(error) = fs::rename(staged, destination) {
            restore_target(&destination_photo, backup_photo.as_deref());
            restore_target(destination, backup_xmp.as_deref());
            let _ = fs::remove_file(staged);
            return Err(format!("提交目标 XMP 失败，底片已回滚: {error}"));
        }
    }

    if options.is_move {
        if let Some(source) = source_xmp.as_ref() {
            if let Err(error) = fs::remove_file(source) {
                restore_target(&destination_photo, backup_photo.as_deref());
                if let Some(destination) = destination_xmp.as_ref() {
                    restore_target(destination, backup_xmp.as_deref());
                }
                return Err(format!("删除源 XMP 失败，导出已回滚: {error}"));
            }
        }
        if let Err(error) = fs::remove_file(source_photo) {
            if let (Some(source), Some(destination)) = (source_xmp.as_ref(), destination_xmp.as_ref()) {
                let _ = fs::copy(destination, source);
            }
            restore_target(&destination_photo, backup_photo.as_deref());
            if let Some(destination) = destination_xmp.as_ref() {
                restore_target(destination, backup_xmp.as_deref());
            }
            return Err(format!("删除源底片失败，导出已回滚: {error}"));
        }
    }

    if let Some(backup) = backup_photo {
        let _ = fs::remove_file(backup);
    }
    if let Some(backup) = backup_xmp {
        let _ = fs::remove_file(backup);
    }

    Ok(ExportItemResult::Success {
        included_xmp: source_xmp.is_some(),
    })
}

/// 执行选片批量导出流水线
pub fn execute_export(options: &ExportOptions) -> Result<ExportResult, String> {
    let target_path = PathBuf::from(&options.target_dir);
    if !target_path.exists() {
        fs::create_dir_all(&target_path)
            .map_err(|e| format!("创建目标目录失败: {}", e))?;
    }
    if !target_path.is_dir() {
        return Err("导出目标不是文件夹".to_string());
    }

    let mut result = ExportResult {
        total: options.photo_paths.len(),
        success_photos: 0,
        success_xmps: 0,
        skipped: 0,
        failed: 0,
        target_directory: options.target_dir.clone(),
        errors: Vec::new(),
    };

    for path_str in &options.photo_paths {
        let src_photo = Path::new(path_str);
        if !src_photo.exists() {
            result.failed += 1;
            result.errors.push(format!("源底片不存在: {}", path_str));
            continue;
        }

        match export_one(src_photo, &target_path, options) {
            Ok(ExportItemResult::Success { included_xmp }) => {
                result.success_photos += 1;
                if included_xmp {
                    result.success_xmps += 1;
                }
            }
            Ok(ExportItemResult::Skipped) => result.skipped += 1,
            Err(error) => {
                result.failed += 1;
                result.errors.push(format!("{}: {}", path_str, error));
            }
        }
    }

    // 3. 联动打开系统文件管理器
    if options.open_after_export && result.success_photos > 0 {
        let _ = reveal_in_file_manager(&options.target_dir);
    }

    Ok(result)
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

    #[test]
    fn test_export_pipeline_copy() {
        let temp_dir = std::env::temp_dir().join(format!("qp_export_test_{}", uuid::Uuid::new_v4()));
        let src_dir = temp_dir.join("src");
        let dest_dir = temp_dir.join("dest");
        fs::create_dir_all(&src_dir).unwrap();
        fs::create_dir_all(&dest_dir).unwrap();

        let dummy_raw = src_dir.join("_DSC9999.ARW");
        let dummy_xmp = src_dir.join("_DSC9999.xmp");
        fs::write(&dummy_raw, b"raw test bytes").unwrap();
        fs::write(&dummy_xmp, b"<x:xmpmeta>test</x:xmpmeta>").unwrap();

        let options = ExportOptions {
            photo_paths: vec![dummy_raw.to_string_lossy().to_string()],
            target_dir: dest_dir.to_string_lossy().to_string(),
            is_move: false,
            include_xmp: true,
            overwrite: false,
            open_after_export: false,
        };

        let res = execute_export(&options).expect("Export should succeed");
        assert_eq!(res.total, 1);
        assert_eq!(res.success_photos, 1);
        assert_eq!(res.success_xmps, 1);
        assert_eq!(res.failed, 0);

        assert!(dest_dir.join("_DSC9999.ARW").exists());
        assert!(dest_dir.join("_DSC9999.xmp").exists());
        // 原文件应保留
        assert!(dummy_raw.exists());
        assert!(dummy_xmp.exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_export_pipeline_move_keeps_photo_and_xmp_consistent() {
        let temp_dir = std::env::temp_dir().join(format!("qp_export_move_{}", uuid::Uuid::new_v4()));
        let src_dir = temp_dir.join("src");
        let dest_dir = temp_dir.join("dest");
        fs::create_dir_all(&src_dir).unwrap();

        let raw = src_dir.join("frame.ARW");
        let xmp = src_dir.join("frame.xmp");
        fs::write(&raw, b"raw bytes").unwrap();
        fs::write(&xmp, b"xmp bytes").unwrap();

        let result = execute_export(&ExportOptions {
            photo_paths: vec![raw.to_string_lossy().to_string()],
            target_dir: dest_dir.to_string_lossy().to_string(),
            is_move: true,
            include_xmp: true,
            overwrite: false,
            open_after_export: false,
        }).unwrap();

        assert_eq!(result.success_photos, 1);
        assert_eq!(result.success_xmps, 1);
        assert!(!raw.exists());
        assert!(!xmp.exists());
        assert_eq!(fs::read(dest_dir.join("frame.ARW")).unwrap(), b"raw bytes");
        assert_eq!(fs::read(dest_dir.join("frame.xmp")).unwrap(), b"xmp bytes");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_export_skips_entire_pair_when_only_xmp_conflicts() {
        let temp_dir = std::env::temp_dir().join(format!("qp_export_conflict_{}", uuid::Uuid::new_v4()));
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
            is_move: false,
            include_xmp: true,
            overwrite: false,
            open_after_export: false,
        }).unwrap();

        assert_eq!(result.skipped, 1);
        assert!(!dest_dir.join("frame.ARW").exists());
        assert_eq!(fs::read(dest_dir.join("frame.xmp")).unwrap(), b"existing xmp");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
