pub mod cache;
pub mod delivery;
pub mod exif;
pub mod export;
use crate::libraw_ffi;
use crate::models::PhotoItem;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

pub const RAW_EXTENSIONS: &[&str] = &[
    "arw", "cr3", "cr2", "nef", "dng", "raf", "orf", "rw2", "pef", "srw",
];

pub const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp"];

/// 判断是否为支持的照片文件
pub fn is_supported_photo(path: &Path) -> bool {
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        let ext_lower = ext.to_lowercase();
        RAW_EXTENSIONS.contains(&ext_lower.as_str())
            || IMAGE_EXTENSIONS.contains(&ext_lower.as_str())
    } else {
        false
    }
}

/// 判断是否为 RAW 文件
pub fn is_raw_file(path: &Path) -> bool {
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        RAW_EXTENSIONS.contains(&ext.to_lowercase().as_str())
    } else {
        false
    }
}

/// 根据相册内相对路径生成可重复的照片身份，不读取或修改照片内容。
/// 整个相册目录移动后，相对路径不变，照片身份也保持不变。
pub fn stable_photo_id(root: &Path, path: &Path) -> String {
    let canonical_root = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let canonical_path = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let normalized = canonical_path
        .strip_prefix(&canonical_root)
        .unwrap_or(&canonical_path);
    let mut hasher = Sha256::new();
    hasher.update(normalized.to_string_lossy().as_bytes());
    format!("photo:{:x}", hasher.finalize())
}

/// 第一阶段只读枚举目录，不解码照片、不读取 EXIF，也不运行辅助分析。
///
/// 用户选择不从相邻 XMP 读取，桌面主流程也不访问源目录缓存。
pub fn scan_directory_fast<P: AsRef<Path>>(dir: P) -> Result<Vec<PhotoItem>, String> {
    scan_directory_fast_impl(dir.as_ref(), || {})
}

fn scan_directory_fast_impl(
    p_dir: &Path,
    on_enumeration_started: impl FnOnce(),
) -> Result<Vec<PhotoItem>, String> {
    let mut items = Vec::new();
    let entries = fs::read_dir(p_dir)
        .map_err(|error| format!("无法读取照片目录 {}: {error}", p_dir.display()))?;
    on_enumeration_started();
    if !p_dir.is_dir() {
        return Err(format!(
            "照片目录在扫描过程中断开或不可用: {}",
            p_dir.display()
        ));
    }

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(error) => {
                if !p_dir.is_dir() {
                    return Err(format!(
                        "照片目录在扫描过程中断开或不可用: {}",
                        p_dir.display()
                    ));
                }
                return Err(format!(
                    "扫描照片目录时读取条目失败，源磁盘可能已断开: {error}"
                ));
            }
        };

        let path = entry.path();
        // 扩展名过滤在内存中进行，非支持照片直接跳过，零网络 RPC 开销
        if !is_supported_photo(&path) {
            continue;
        }

        let is_file = match entry.file_type() {
            Ok(ft) => ft.is_file(),
            Err(_) => path.is_file(),
        };
        if !is_file {
            continue;
        }

        let filename = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let file_size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let is_raw = is_raw_file(&path);

        items.push(PhotoItem {
            id: stable_photo_id(p_dir, &path),
            path: path.to_string_lossy().to_string(),
            filename,
            file_size,
            is_raw,
            thumb_width: None,
            thumb_height: None,
            burst_group_id: None,
            exif: None,
        });
    }

    // 按文件名自然升序排序
    items.sort_by(|a, b| a.filename.cmp(&b.filename));

    Ok(items)
}

/// 完整同步扫描仅供基准、兼容服务与底层测试使用。
/// 桌面主流程使用 `scan_directory_fast`，并在列表可用后逐张后台分析。
pub fn scan_directory<P: AsRef<Path>>(dir: P) -> Result<Vec<PhotoItem>, String> {
    let mut items = scan_directory_fast(dir)?;

    for item in &mut items {
        let path = Path::new(&item.path);
        item.exif = if item.is_raw {
            libraw_ffi::extract_raw_metadata(path).ok()
        } else {
            exif::extract_image_file_exif(path)
        };
    }

    crate::rules::group_bursts(&mut items);

    Ok(items)
}

/// 从原始源文件只读提取预览。
pub fn load_source_photo_preview<P: AsRef<Path>>(path: P) -> Result<(Vec<u8>, String), String> {
    let p = path.as_ref();
    if is_raw_file(p) {
        let thumb = libraw_ffi::extract_embedded_thumbnail(p)
            .map_err(|e| format!("RAW 内嵌图提取失败: {}", e))?;

        let mime = if thumb.is_jpeg {
            "image/jpeg"
        } else {
            "image/x-portable-pixmap"
        };
        Ok((thumb.data, mime.to_string()))
    } else {
        let data = fs::read(p).map_err(|e| format!("读取图像文件失败: {}", e))?;
        let ext = p
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("jpeg")
            .to_lowercase();
        let mime = match ext.as_str() {
            "png" => "image/png",
            "webp" => "image/webp",
            _ => "image/jpeg",
        };
        Ok((data, mime.to_string()))
    }
}

/// 加载单张照片预览。缓存由应用数据目录层负责，源目录不参与缓存。
pub fn load_photo_preview<P: AsRef<Path>>(path: P) -> Result<(Vec<u8>, String), String> {
    load_source_photo_preview(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(unix)]
    #[test]
    fn scan_reports_source_directory_disconnection_without_modifying_photos() {
        let temp_dir =
            std::env::temp_dir().join(format!("qp_scan_disconnect_{}", uuid::Uuid::new_v4()));
        let source = temp_dir.join("source");
        let disconnected = temp_dir.join("disconnected-source");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("photo.jpg"), b"unchanged source bytes").unwrap();

        let error = scan_directory_fast_impl(&source, || {
            fs::rename(&source, &disconnected).unwrap();
        })
        .unwrap_err();

        assert!(error.contains("扫描过程中断开"));
        assert_eq!(
            fs::read(disconnected.join("photo.jpg")).unwrap(),
            b"unchanged source bytes"
        );
        let _ = fs::remove_dir_all(&temp_dir);
    }
}
