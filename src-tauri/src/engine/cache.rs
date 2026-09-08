use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};
use image::GenericImageView;
use crate::models::{DefectTag, ExifMetadata, FaceInfo, RetouchStatus};
use crate::rules::face::{detect_faces_heuristic, sort_and_truncate_faces};

pub const CACHE_DIR_NAME: &str = ".quickpick_cache";
pub const PROXIES_DIR_NAME: &str = "proxies";
pub const CATALOG_FILE_NAME: &str = "catalog.json";
pub const DEFAULT_PROXY_MAX_EDGE: u32 = 2048;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogItem {
    pub filename: String,
    pub file_size: u64,
    pub mtime: u64,
    pub proxy_filename: String,
    pub thumb_width: Option<u32>,
    pub thumb_height: Option<u32>,
    pub retouch_status: RetouchStatus,
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

/// 获取照片目录下的 .quickpick_cache 路径
pub fn get_cache_dir<P: AsRef<Path>>(photo_dir: P) -> PathBuf {
    photo_dir.as_ref().join(CACHE_DIR_NAME)
}

/// 获取代理图片存放子目录 .quickpick_cache/proxies
pub fn get_proxies_dir<P: AsRef<Path>>(photo_dir: P) -> PathBuf {
    get_cache_dir(photo_dir).join(PROXIES_DIR_NAME)
}

/// 获取索引文件路径 .quickpick_cache/catalog.json
pub fn get_catalog_path<P: AsRef<Path>>(photo_dir: P) -> PathBuf {
    get_cache_dir(photo_dir).join(CATALOG_FILE_NAME)
}

/// 快速寻找底片对应的轻量 2K 代理缓存文件 (支持 .webp, .jpg, .jpeg)
pub fn find_proxy_file<P: AsRef<Path>>(photo_path: P) -> Option<PathBuf> {
    let p = photo_path.as_ref();
    let parent = p.parent()?;
    let stem = p.file_stem()?.to_str()?;
    let proxies_dir = get_proxies_dir(parent);

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
pub fn load_catalog_cache<P: AsRef<Path>>(photo_dir: P) -> Option<CatalogIndex> {
    let catalog_path = get_catalog_path(photo_dir);
    if !catalog_path.is_file() {
        return None;
    }

    let content = fs::read_to_string(&catalog_path).ok()?;
    serde_json::from_str::<CatalogIndex>(&content).ok()
}

/// 原子安全写入 catalog.json
pub fn save_catalog_cache<P: AsRef<Path>>(
    photo_dir: P,
    catalog: &CatalogIndex,
) -> Result<(), String> {
    let cache_dir = get_cache_dir(&photo_dir);
    if !cache_dir.exists() {
        fs::create_dir_all(&cache_dir).map_err(|e| format!("创建缓存目录失败: {}", e))?;
    }

    let catalog_path = get_catalog_path(&photo_dir);
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
pub fn generate_proxy_for_photo<P: AsRef<Path>>(
    photo_path: P,
    max_edge: u32,
) -> Result<(PathBuf, u32, u32), String> {
    let p = photo_path.as_ref();
    let parent = p.parent().ok_or_else(|| "无法获取父目录".to_string())?;
    let stem = p.file_stem().and_then(|s| s.to_str()).ok_or_else(|| "无法获取文件名".to_string())?;

    let proxies_dir = get_proxies_dir(parent);
    if !proxies_dir.exists() {
        fs::create_dir_all(&proxies_dir).map_err(|e| format!("创建代理目录失败: {}", e))?;
    }

    // 1. 抽取原图内嵌高画质图像
    let (img_bytes, _) = crate::engine::load_photo_preview(p)?;
    let img = image::load_from_memory(&img_bytes)
        .map_err(|e| format!("解码图片失败: {}", e))?;

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

    let mut out_file = fs::File::create(&tmp_dest)
        .map_err(|e| format!("创建代理临时文件失败: {}", e))?;

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
pub fn build_folder_cache<P: AsRef<Path>>(
    photo_dir: P,
    max_edge: u32,
) -> Result<CatalogIndex, String> {
    let dir = photo_dir.as_ref();
    let mut photos = crate::engine::scan_directory(dir)?;
    if photos.is_empty() {
        return Err("目录下无支持的照片文件".to_string());
    }

    let mut catalog_items = Vec::new();
    let edge = if max_edge == 0 { DEFAULT_PROXY_MAX_EDGE } else { max_edge };

    for photo in &mut photos {
        let p = Path::new(&photo.path);
        let mtime = get_file_mtime(p);
        let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or_default();

        // 检查已有代理是否仍新鲜有效
        let mut need_rebuild = true;
        let mut final_w = photo.thumb_width;
        let mut final_h = photo.thumb_height;

        if let Some(existing_proxy) = find_proxy_file(p) {
            let proxy_mtime = get_file_mtime(&existing_proxy);
            if proxy_mtime >= mtime {
                need_rebuild = false;
            }
        }

        if need_rebuild {
            if let Ok((_proxy_p, pw, ph)) = generate_proxy_for_photo(p, edge) {
                final_w = Some(pw);
                final_h = Some(ph);
            }
        }

        // 提前预计算人脸与指标
        let faces = if let Ok((bytes, _)) = crate::engine::load_photo_preview(p) {
            if let Ok(img) = image::load_from_memory(&bytes) {
                let raw_faces = detect_faces_heuristic(&img);
                let (top6, _) = sort_and_truncate_faces(raw_faces, img.width() as f32, img.height() as f32, 6);
                top6
            } else {
                Vec::new()
            }
        } else {
            Vec::new()
        };

        let mut defect_tags = photo.defect_tags.clone();
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
            retouch_status: photo.retouch_status.clone(),
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

    save_catalog_cache(dir, &catalog)?;

    Ok(catalog)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_catalog_cache_read_write() {
        let temp_dir = std::env::temp_dir().join(format!("qp_cache_test_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();

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
                retouch_status: RetouchStatus::Clean,
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
        save_catalog_cache(&temp_dir, &catalog).expect("Save catalog should succeed");

        // 2. 检查文件路径
        let cat_p = get_catalog_path(&temp_dir);
        assert!(cat_p.is_file());

        // 3. 读取并验证
        let loaded = load_catalog_cache(&temp_dir).expect("Load catalog should succeed");
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
        fs::create_dir_all(&temp_dir).unwrap();

        let dummy_photo = temp_dir.join("_DSC0009.ARW");
        fs::write(&dummy_photo, b"raw content").unwrap();

        // 此时无代理，应返回 None
        assert!(find_proxy_file(&dummy_photo).is_none());

        // 创建 .quickpick_cache/proxies/_DSC0009.jpg
        let proxies_dir = get_proxies_dir(&temp_dir);
        fs::create_dir_all(&proxies_dir).unwrap();
        let proxy_p = proxies_dir.join("_DSC0009.jpg");
        fs::write(&proxy_p, b"jpeg 2k proxy content").unwrap();

        // 再次查找，应能命中代理路径
        let found = find_proxy_file(&dummy_photo);
        assert!(found.is_some());
        assert_eq!(found.unwrap(), proxy_p);

        // 清理
        let _ = fs::remove_dir_all(&temp_dir);
    }
}
