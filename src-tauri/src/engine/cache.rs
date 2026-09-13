use crate::models::{AnalysisStatus, DefectTag, ExifMetadata, FaceInfo};
use crate::rules::face::{detect_faces_heuristic, sort_and_truncate_faces};
use image::GenericImageView;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

pub const CACHE_DIR_NAME: &str = ".quickpick_cache";
pub const PROXIES_DIR_NAME: &str = "proxies";
pub const CATALOG_FILE_NAME: &str = "catalog.json";
pub const DEFAULT_PROXY_MAX_EDGE: u32 = 2048;
pub const PREVIEW_CACHE_DIR_NAME: &str = "previews";
pub const PREVIEW_CACHE_MAX_BYTES: u64 = 1024 * 1024 * 1024;

static ACTIVE_PREVIEW_REQUESTS: OnceLock<(Mutex<HashSet<String>>, Condvar)> = OnceLock::new();

struct PreviewRequestGuard {
    key: String,
}

impl PreviewRequestGuard {
    fn acquire(key: &str) -> Result<Self, String> {
        let (active, ready) =
            ACTIVE_PREVIEW_REQUESTS.get_or_init(|| (Mutex::new(HashSet::new()), Condvar::new()));
        let mut requests = active
            .lock()
            .map_err(|_| "预览请求去重锁已损坏".to_string())?;
        while requests.contains(key) {
            requests = ready
                .wait(requests)
                .map_err(|_| "等待相同预览请求失败".to_string())?;
        }
        requests.insert(key.to_string());
        Ok(Self {
            key: key.to_string(),
        })
    }
}

impl Drop for PreviewRequestGuard {
    fn drop(&mut self) {
        let Some((active, ready)) = ACTIVE_PREVIEW_REQUESTS.get() else {
            return;
        };
        if let Ok(mut requests) = active.lock() {
            requests.remove(&self.key);
            ready.notify_all();
        }
    }
}

fn preview_cache_extension(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/webp" => "webp",
        "image/x-portable-pixmap" => "ppm",
        _ => "jpg",
    }
}

fn preview_cache_key(photo_id: &str, photo_path: &Path) -> Result<String, String> {
    let metadata =
        fs::metadata(photo_path).map_err(|error| format!("读取预览源文件状态失败: {error}"))?;
    let modified_nanos = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let identity = if photo_id.is_empty() {
        fs::canonicalize(photo_path)
            .unwrap_or_else(|_| photo_path.to_path_buf())
            .to_string_lossy()
            .to_string()
    } else {
        photo_id.to_string()
    };
    let version = format!("preview-v2:{identity}:{}:{modified_nanos}", metadata.len());
    Ok(format!("{:x}", Sha256::digest(version.as_bytes())))
}

fn prune_preview_cache(cache_dir: &Path) -> Result<(), String> {
    let mut entries = fs::read_dir(cache_dir)
        .map_err(|error| format!("读取预览缓存目录失败: {error}"))?
        .flatten()
        .filter_map(|entry| {
            if entry.file_name().to_string_lossy().starts_with('.') {
                return None;
            }
            let metadata = entry.metadata().ok()?;
            metadata.is_file().then(|| {
                (
                    entry.path(),
                    metadata.len(),
                    metadata.modified().unwrap_or(UNIX_EPOCH),
                )
            })
        })
        .collect::<Vec<_>>();
    let mut total_bytes = entries.iter().map(|(_, size, _)| size).sum::<u64>();
    if total_bytes <= PREVIEW_CACHE_MAX_BYTES {
        return Ok(());
    }
    entries.sort_by_key(|(_, _, modified)| *modified);
    for (path, size, _) in entries {
        if total_bytes <= PREVIEW_CACHE_MAX_BYTES {
            break;
        }
        if fs::remove_file(path).is_ok() {
            total_bytes = total_bytes.saturating_sub(size);
        }
    }
    Ok(())
}

/// 从应用数据目录读取版本化预览缓存；未命中时只读源文件并原子写入缓存。
pub fn load_cached_preview<C: AsRef<Path>, P: AsRef<Path>>(
    cache_root: C,
    photo_id: &str,
    photo_path: P,
) -> Result<(Vec<u8>, String), String> {
    let photo_path = photo_path.as_ref();
    let cache_dir = cache_root.as_ref().join(PREVIEW_CACHE_DIR_NAME);
    fs::create_dir_all(&cache_dir).map_err(|error| format!("创建预览缓存目录失败: {error}"))?;
    let key = preview_cache_key(photo_id, photo_path)?;
    let _request_guard = PreviewRequestGuard::acquire(&key)?;

    for extension in ["jpg", "png", "webp", "ppm"] {
        let candidate = cache_dir.join(format!("{key}.{extension}"));
        if candidate.is_file() {
            let bytes =
                fs::read(&candidate).map_err(|error| format!("读取预览缓存失败: {error}"))?;
            let mime = match extension {
                "png" => "image/png",
                "webp" => "image/webp",
                "ppm" => "image/x-portable-pixmap",
                _ => "image/jpeg",
            };
            return Ok((bytes, mime.to_string()));
        }
    }

    let (bytes, mime) = crate::engine::load_source_photo_preview(photo_path)?;
    let orientation = crate::engine::exif::extract_orientation(&bytes)
        .or_else(|| crate::engine::exif::extract_orientation_from_file(photo_path))
        .unwrap_or(1);

    // 对高分辨率大图 (如数十兆机内 JPEG) 或具有 EXIF 旋转标记的照片，在写入本地缓存前自动校正方向并等比规范化至 2K (max edge 2048px)。
    // 这消除向前端 IPC 传输数十兆 Base64 的严重卡顿，同时保证相机竖拍照片在 Pixi 视口及分析中方向正确。
    let (bytes_to_cache, mime_to_cache) = if orientation > 1 || bytes.len() > 1_000_000 {
        if let Ok(mut img) = image::load_from_memory(&bytes) {
            if orientation > 1 {
                img = crate::engine::exif::apply_orientation(img, orientation);
            }
            let (w, h) = img.dimensions();
            let should_resize = w.max(h) > DEFAULT_PROXY_MAX_EDGE;
            let final_img = if should_resize {
                let scale = DEFAULT_PROXY_MAX_EDGE as f32 / (w.max(h) as f32);
                let nw = ((w as f32 * scale).round() as u32).max(1);
                let nh = ((h as f32 * scale).round() as u32).max(1);
                img.resize(nw, nh, image::imageops::FilterType::Triangle)
            } else {
                img
            };

            let mut jpeg_buf = Vec::new();
            let mut cursor = std::io::Cursor::new(&mut jpeg_buf);
            if final_img.write_to(&mut cursor, image::ImageFormat::Jpeg).is_ok() {
                (jpeg_buf, "image/jpeg".to_string())
            } else {
                (bytes, mime)
            }
        } else {
            (bytes, mime)
        }
    } else {
        (bytes, mime)
    };

    let destination = cache_dir.join(format!("{key}.{}", preview_cache_extension(&mime_to_cache)));
    let temporary = cache_dir.join(format!(".{key}.{}.tmp", uuid::Uuid::new_v4()));
    let mut file = fs::File::create(&temporary)
        .map_err(|error| format!("创建预览缓存临时文件失败: {error}"))?;
    use std::io::Write;
    file.write_all(&bytes_to_cache)
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("写入预览缓存失败: {error}"))?;
    if let Err(error) = fs::rename(&temporary, &destination) {
        let _ = fs::remove_file(&temporary);
        if !destination.is_file() {
            return Err(format!("提交预览缓存失败: {error}"));
        }
    }
    let _ = prune_preview_cache(&cache_dir);
    Ok((bytes_to_cache, mime_to_cache))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogItem {
    pub filename: String,
    pub file_size: u64,
    pub mtime: u64,
    pub proxy_filename: String,
    pub thumb_width: Option<u32>,
    pub thumb_height: Option<u32>,
    pub analysis_status: String,
    pub defect_tags: Vec<DefectTag>,
    pub burst_group_id: Option<String>,
    pub faces: Vec<FaceInfo>,
    pub exif: Option<ExifMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogIndex {
    pub version: String,
    pub generated_at: u64,
    pub generator: String,
    pub photo_count: usize,
    pub items: Vec<CatalogItem>,
}

fn album_cache_key<P: AsRef<Path>>(photo_dir: P) -> String {
    let path =
        fs::canonicalize(photo_dir.as_ref()).unwrap_or_else(|_| photo_dir.as_ref().to_path_buf());
    format!("{:x}", Sha256::digest(path.to_string_lossy().as_bytes()))
}

/// 获取独立缓存根目录中的相册缓存路径。缓存绝不放入照片源目录。
pub fn get_cache_dir<C: AsRef<Path>, P: AsRef<Path>>(cache_root: C, photo_dir: P) -> PathBuf {
    cache_root
        .as_ref()
        .join(CACHE_DIR_NAME)
        .join(album_cache_key(photo_dir))
}

/// 获取代理图片存放子目录。
pub fn get_proxies_dir<C: AsRef<Path>, P: AsRef<Path>>(cache_root: C, photo_dir: P) -> PathBuf {
    get_cache_dir(cache_root, photo_dir).join(PROXIES_DIR_NAME)
}

/// 获取独立缓存目录中的索引文件路径。
pub fn get_catalog_path<C: AsRef<Path>, P: AsRef<Path>>(cache_root: C, photo_dir: P) -> PathBuf {
    get_cache_dir(cache_root, photo_dir).join(CATALOG_FILE_NAME)
}

/// 快速寻找底片对应的轻量 2K 代理缓存文件 (支持 .webp, .jpg, .jpeg)
pub fn find_proxy_file<C: AsRef<Path>, P: AsRef<Path>>(
    cache_root: C,
    photo_path: P,
) -> Option<PathBuf> {
    let p = photo_path.as_ref();
    let parent = p.parent()?;
    let stem = p.file_stem()?.to_str()?;
    let proxies_dir = get_proxies_dir(cache_root, parent);

    // 优先检查 webp，其次检查 jpg/jpeg
    let webp_candidate = proxies_dir.join(format!("{}.webp", stem));
    if webp_candidate.is_file() {
        return Some(webp_candidate);
    }

    let jpg_candidate = proxies_dir.join(format!("{}.jpg", stem));
    if jpg_candidate.is_file() {
        return Some(jpg_candidate);
    }

    let jpeg_candidate = proxies_dir.join(format!("{}.jpeg", stem));
    if jpeg_candidate.is_file() {
        return Some(jpeg_candidate);
    }

    None
}

/// 读取并反序列化目录下的 catalog.json 索引
pub fn load_catalog_cache<C: AsRef<Path>, P: AsRef<Path>>(
    cache_root: C,
    photo_dir: P,
) -> Option<CatalogIndex> {
    let catalog_path = get_catalog_path(cache_root, photo_dir);
    if !catalog_path.is_file() {
        return None;
    }

    let content = fs::read_to_string(&catalog_path).ok()?;
    serde_json::from_str::<CatalogIndex>(&content).ok()
}

/// 原子安全写入 catalog.json
pub fn save_catalog_cache<C: AsRef<Path>, P: AsRef<Path>>(
    cache_root: C,
    photo_dir: P,
    catalog: &CatalogIndex,
) -> Result<(), String> {
    let cache_dir = get_cache_dir(&cache_root, &photo_dir);
    if !cache_dir.exists() {
        fs::create_dir_all(&cache_dir).map_err(|e| format!("创建缓存目录失败: {}", e))?;
    }

    let catalog_path = get_catalog_path(&cache_root, &photo_dir);
    let tmp_path = cache_dir.join(format!(".catalog.json.tmp.{}", uuid::Uuid::new_v4()));

    let json_bytes = serde_json::to_vec_pretty(catalog)
        .map_err(|e| format!("序列化 catalog 索引失败: {}", e))?;

    fs::write(&tmp_path, json_bytes).map_err(|e| format!("写入临时 catalog 失败: {}", e))?;

    fs::rename(&tmp_path, &catalog_path).map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        format!("原子替换 catalog 索引失败: {}", e)
    })?;

    Ok(())
}

/// 为单张照片生成 2K 代理图像并存入 .quickpick_cache/proxies/
pub fn generate_proxy_for_photo<C: AsRef<Path>, P: AsRef<Path>>(
    cache_root: C,
    photo_path: P,
    max_edge: u32,
) -> Result<(PathBuf, u32, u32), String> {
    let p = photo_path.as_ref();
    let parent = p.parent().ok_or_else(|| "无法获取父目录".to_string())?;
    let stem = p
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "无法获取文件名".to_string())?;

    let proxies_dir = get_proxies_dir(cache_root, parent);
    if !proxies_dir.exists() {
        fs::create_dir_all(&proxies_dir).map_err(|e| format!("创建代理目录失败: {}", e))?;
    }

    // 1. 抽取原图内嵌高画质图像 (绕过已有代理，直读源底片避免读旧写旧)
    let (img_bytes, _) = crate::engine::load_source_photo_preview(p)?;
    let mut img = image::load_from_memory(&img_bytes).map_err(|e| format!("解码图片失败: {}", e))?;

    let orientation = crate::engine::exif::extract_orientation(&img_bytes)
        .or_else(|| crate::engine::exif::extract_orientation_from_file(p))
        .unwrap_or(1);
    if orientation > 1 {
        img = crate::engine::exif::apply_orientation(img, orientation);
    }

    let (w, h) = img.dimensions();
    let (target_w, target_h, resized_img) = if w.max(h) > max_edge {
        let scale = max_edge as f32 / (w.max(h) as f32);
        let nw = ((w as f32 * scale).round() as u32).max(1);
        let nh = ((h as f32 * scale).round() as u32).max(1);
        let resized = img.resize(nw, nh, image::imageops::FilterType::Triangle);
        (nw, nh, resized)
    } else {
        (w, h, img)
    };

    // 2. 导出为高画质 2K JPG (兼容性最佳，单张 ~180KB)
    let dest_proxy_path = proxies_dir.join(format!("{}.jpg", stem));
    let tmp_dest = proxies_dir.join(format!(".{}.jpg.tmp.{}", stem, uuid::Uuid::new_v4()));

    let mut out_file =
        fs::File::create(&tmp_dest).map_err(|e| format!("创建代理临时文件失败: {}", e))?;

    resized_img
        .write_to(&mut out_file, image::ImageFormat::Jpeg)
        .map_err(|e| format!("写入 2K 代理 JPG 失败: {}", e))?;

    fs::rename(&tmp_dest, &dest_proxy_path).map_err(|e| {
        let _ = fs::remove_file(&tmp_dest);
        format!("原子替换代理文件失败: {}", e)
    })?;

    Ok((dest_proxy_path, target_w, target_h))
}

/// 获取文件修改时间戳 (秒)
pub fn get_file_mtime(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// 为相册全量构建/增量更新 .quickpick_cache
pub fn build_folder_cache<C: AsRef<Path>, P: AsRef<Path>>(
    cache_root: C,
    photo_dir: P,
    max_edge: u32,
) -> Result<CatalogIndex, String> {
    let dir = photo_dir.as_ref();
    let mut photos = crate::engine::scan_directory(dir)?;
    if photos.is_empty() {
        return Err("目录下无支持的照片文件".to_string());
    }

    let mut catalog_items = Vec::new();
    let edge = if max_edge == 0 {
        DEFAULT_PROXY_MAX_EDGE
    } else {
        max_edge
    };

    for photo in &mut photos {
        let p = Path::new(&photo.path);
        let mtime = get_file_mtime(p);
        let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or_default();

        // 检查已有代理是否仍新鲜有效
        let mut need_rebuild = true;
        let mut final_w = photo.thumb_width;
        let mut final_h = photo.thumb_height;

        if let Some(existing_proxy) = find_proxy_file(&cache_root, p) {
            let proxy_mtime = get_file_mtime(&existing_proxy);
            if proxy_mtime >= mtime {
                need_rebuild = false;
            }
        }

        if need_rebuild {
            if let Ok((_proxy_p, pw, ph)) = generate_proxy_for_photo(&cache_root, p, edge) {
                final_w = Some(pw);
                final_h = Some(ph);
            }
        }

        // 提前预计算人脸与指标（首部 6 个为 Top 6 关键特写，后续为背景人脸）
        let faces = if let Ok((bytes, _)) = crate::engine::load_source_photo_preview(p) {
            if let Ok(mut img) = image::load_from_memory(&bytes) {
                let orientation = crate::engine::exif::extract_orientation(&bytes)
                    .or_else(|| crate::engine::exif::extract_orientation_from_file(p))
                    .unwrap_or(1);
                if orientation > 1 {
                    img = crate::engine::exif::apply_orientation(img, orientation);
                }
                let raw_faces = detect_faces_heuristic(&img);
                let (mut top6, mut background) =
                    sort_and_truncate_faces(raw_faces, img.width() as f32, img.height() as f32, 6);
                top6.append(&mut background);
                top6
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        };

        let (analysis_status, mut defect_tags) = crate::engine::load_source_photo_preview(p)
            .and_then(|(bytes, _)| crate::rules::analyze_image_bytes(&bytes))
            .map(|metrics| crate::rules::evaluate_photo_analysis(&metrics, None, 0))
            .map(|(status, tags)| {
                let status = match status {
                    AnalysisStatus::NoIssues => "no_issues",
                    AnalysisStatus::NeedsCheck => "needs_check",
                    AnalysisStatus::Pending => "pending",
                    AnalysisStatus::Failed => "failed",
                };
                (status.to_string(), tags)
            })
            .unwrap_or_else(|_| ("failed".to_string(), Vec::new()));
        if let Some(conflict_tag) = crate::rules::face::evaluate_group_eye_conflict(&faces) {
            defect_tags.push(conflict_tag);
        }

        catalog_items.push(CatalogItem {
            filename: photo.filename.clone(),
            file_size: photo.file_size,
            mtime,
            proxy_filename: format!("{}.jpg", stem),
            thumb_width: final_w,
            thumb_height: final_h,
            analysis_status,
            defect_tags,
            burst_group_id: photo.burst_group_id.clone(),
            faces,
            exif: photo.exif.clone(),
        });
    }

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let catalog = CatalogIndex {
        version: "1.0".to_string(),
        generated_at: now,
        generator: "QuickPick NAS Engine v0.1.0".to_string(),
        photo_count: catalog_items.len(),
        items: catalog_items,
    };

    save_catalog_cache(cache_root, dir, &catalog)?;

    Ok(catalog)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preview_cache_is_versioned_and_stays_outside_source_directory() {
        let temp_dir = std::env::temp_dir().join(format!("qp_preview_{}", uuid::Uuid::new_v4()));
        let source_dir = temp_dir.join("source");
        let cache_root = temp_dir.join("app-data");
        fs::create_dir_all(&source_dir).unwrap();
        let photo = source_dir.join("photo.jpg");
        fs::write(&photo, b"first-version").unwrap();

        let first = load_cached_preview(&cache_root, "stable-photo", &photo).unwrap();
        assert_eq!(first.0, b"first-version");
        assert_eq!(fs::read_dir(&source_dir).unwrap().count(), 1);

        fs::write(&photo, b"second-version-with-new-size").unwrap();
        let second = load_cached_preview(&cache_root, "stable-photo", &photo).unwrap();
        assert_eq!(second.0, b"second-version-with-new-size");
        assert!(cache_root.join(PREVIEW_CACHE_DIR_NAME).is_dir());
        assert_eq!(fs::read_dir(&source_dir).unwrap().count(), 1);

        fs::remove_dir_all(temp_dir).unwrap();
    }

    #[test]
    fn concurrent_preview_requests_share_one_cache_entry() {
        let temp_dir = std::env::temp_dir().join(format!("qp_preview_{}", uuid::Uuid::new_v4()));
        let source_dir = temp_dir.join("source");
        let cache_root = temp_dir.join("app-data");
        fs::create_dir_all(&source_dir).unwrap();
        let photo = source_dir.join("photo.jpg");
        fs::write(&photo, b"shared-preview").unwrap();

        let workers = (0..8)
            .map(|_| {
                let cache_root = cache_root.clone();
                let photo = photo.clone();
                std::thread::spawn(move || {
                    load_cached_preview(cache_root, "stable-photo", photo)
                        .unwrap()
                        .0
                })
            })
            .collect::<Vec<_>>();
        for worker in workers {
            assert_eq!(worker.join().unwrap(), b"shared-preview");
        }
        let cache_files = fs::read_dir(cache_root.join(PREVIEW_CACHE_DIR_NAME))
            .unwrap()
            .flatten()
            .filter(|entry| !entry.file_name().to_string_lossy().starts_with('.'))
            .count();
        assert_eq!(cache_files, 1);

        fs::remove_dir_all(temp_dir).unwrap();
    }

    #[test]
    fn test_catalog_cache_read_write() {
        let temp_dir = std::env::temp_dir().join(format!("qp_cache_test_{}", uuid::Uuid::new_v4()));
        let source_dir = temp_dir.join("source");
        let cache_root = temp_dir.join("app-cache");
        fs::create_dir_all(&source_dir).unwrap();

        let catalog = CatalogIndex {
            version: "1.0".to_string(),
            generated_at: 1757230000,
            generator: "QuickPick Test Suite".to_string(),
            photo_count: 1,
            items: vec![CatalogItem {
                filename: "_DSC0001.ARW".to_string(),
                file_size: 42000000,
                mtime: 1757220000,
                proxy_filename: "_DSC0001.jpg".to_string(),
                thumb_width: Some(2048),
                thumb_height: Some(1365),
                analysis_status: "no_issues".to_string(),
                defect_tags: vec![],
                burst_group_id: Some("grp-1".to_string()),
                faces: vec![],
                exif: Some(ExifMetadata {
                    camera_make: Some("SONY".to_string()),
                    camera_model: Some("ILCE-7RM5".to_string()),
                    lens_model: Some("FE 24-70mm F2.8 GM II".to_string()),
                    lens_make: Some("Sony".to_string()),
                    focal_length: Some(50.0),
                    focal_length_35mm: Some(50),
                    aperture: Some(2.8),
                    shutter_speed: Some("1/500s".to_string()),
                    shutter_speed_value: Some(0.002),
                    iso: Some(100),
                    date_time_original: Some("2026-08-15 14:30:00".to_string()),
                }),
            }],
        };

        // 1. 保存
        save_catalog_cache(&cache_root, &source_dir, &catalog)
            .expect("Save catalog should succeed");

        // 2. 检查文件路径
        let cat_p = get_catalog_path(&cache_root, &source_dir);
        assert!(cat_p.is_file());
        assert!(!source_dir.join(CACHE_DIR_NAME).exists());

        // 3. 读取并验证
        let loaded =
            load_catalog_cache(&cache_root, &source_dir).expect("Load catalog should succeed");
        assert_eq!(loaded.photo_count, 1);
        assert_eq!(loaded.items[0].filename, "_DSC0001.ARW");
        assert_eq!(loaded.items[0].burst_group_id.as_deref(), Some("grp-1"));
        let exif = loaded.items[0].exif.as_ref().unwrap();
        assert_eq!(exif.camera_model.as_deref(), Some("ILCE-7RM5"));
        assert_eq!(exif.lens_model.as_deref(), Some("FE 24-70mm F2.8 GM II"));
        assert_eq!(exif.shutter_speed.as_deref(), Some("1/500s"));
        assert_eq!(exif.aperture, Some(2.8));

        // 清理
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_proxy_preview_priority() {
        let temp_dir = std::env::temp_dir().join(format!("qp_proxy_test_{}", uuid::Uuid::new_v4()));
        let source_dir = temp_dir.join("source");
        let cache_root = temp_dir.join("app-cache");
        fs::create_dir_all(&source_dir).unwrap();

        let dummy_photo = source_dir.join("_DSC0009.ARW");
        fs::write(&dummy_photo, b"raw content").unwrap();

        // 此时无代理，应返回 None
        assert!(find_proxy_file(&cache_root, &dummy_photo).is_none());

        // 代理只创建在独立应用缓存目录。
        let proxies_dir = get_proxies_dir(&cache_root, &source_dir);
        fs::create_dir_all(&proxies_dir).unwrap();
        let proxy_p = proxies_dir.join("_DSC0009.jpg");
        fs::write(&proxy_p, b"jpeg 2k proxy content").unwrap();

        // 再次查找，应能命中代理路径
        let found = find_proxy_file(&cache_root, &dummy_photo);
        assert!(found.is_some());
        assert_eq!(found.unwrap(), proxy_p);
        assert!(!source_dir.join(CACHE_DIR_NAME).exists());

        // 清理
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_load_cached_preview_rotates_orientation() {
        let temp_dir =
            std::env::temp_dir().join(format!("qp_orient_test_{}", uuid::Uuid::new_v4()));
        let source_dir = temp_dir.join("source");
        let cache_root = temp_dir.join("app-cache");
        fs::create_dir_all(&source_dir).unwrap();

        // 1. 生成 120x80 (横向) 原生像素的 JPEG
        let img = image::DynamicImage::ImageRgb8(image::RgbImage::new(120, 80));
        let mut raw_jpeg = Vec::new();
        img.write_to(
            &mut std::io::Cursor::new(&mut raw_jpeg),
            image::ImageFormat::Jpeg,
        )
        .unwrap();

        // 2. 注入 EXIF APP1 (Orientation = 6, 90° CW 竖拍)
        let mut tiff = Vec::new();
        tiff.extend_from_slice(b"II\x2a\x00");
        tiff.extend_from_slice(&8u32.to_le_bytes()); // IFD0 offset
        tiff.extend_from_slice(&1u16.to_le_bytes()); // 1 entry
        tiff.extend_from_slice(&0x0112u16.to_le_bytes()); // Tag 0x0112 (Orientation)
        tiff.extend_from_slice(&3u16.to_le_bytes()); // SHORT
        tiff.extend_from_slice(&1u32.to_le_bytes()); // Count 1
        tiff.extend_from_slice(&6u32.to_le_bytes()); // Value 6
        tiff.extend_from_slice(&0u32.to_le_bytes()); // next IFD pointer

        let mut oriented_jpeg = Vec::new();
        oriented_jpeg.extend_from_slice(&raw_jpeg[0..2]); // SOI (0xFFD8)
        oriented_jpeg.extend_from_slice(&[0xFF, 0xE1]); // APP1
        let app1_len = (tiff.len() + 6 + 2) as u16;
        oriented_jpeg.extend_from_slice(&app1_len.to_be_bytes());
        oriented_jpeg.extend_from_slice(b"Exif\0\0");
        oriented_jpeg.extend_from_slice(&tiff);
        oriented_jpeg.extend_from_slice(&raw_jpeg[2..]);

        let photo_path = source_dir.join("portrait.jpg");
        fs::write(&photo_path, &oriented_jpeg).unwrap();

        // 3. 加载预览缓存
        let (cached_bytes, mime) =
            load_cached_preview(&cache_root, "photo-portrait-1", &photo_path).unwrap();
        assert_eq!(mime, "image/jpeg");

        // 4. 验证缓存图像已经物理旋转为 80x120 (竖向正立)
        let decoded =
            image::load_from_memory(&cached_bytes).expect("Cached preview should be valid image");
        assert_eq!(decoded.width(), 80);
        assert_eq!(decoded.height(), 120);

        // 清理
        let _ = fs::remove_dir_all(&temp_dir);
    }
}
