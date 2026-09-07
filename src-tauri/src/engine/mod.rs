pub mod cache;
pub mod exif;
pub mod export;
use std::path::Path;
use std::fs;
use crate::libraw_ffi;
use crate::models::PhotoItem;
use crate::xmp::{get_xmp_path, read_xmp};

pub const RAW_EXTENSIONS: &[&str] = &[
    "arw", "cr3", "cr2", "nef", "dng", "raf", "orf", "rw2", "pef", "srw"
];

pub const IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "webp"
];

/// 判断是否为支持的照片文件
pub fn is_supported_photo(path: &Path) -> bool {
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        let ext_lower = ext.to_lowercase();
        RAW_EXTENSIONS.contains(&ext_lower.as_str()) || IMAGE_EXTENSIONS.contains(&ext_lower.as_str())
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

/// 扫描目录并返回照片列表 (自动检测并挂载 .quickpick_cache/catalog.json)
pub fn scan_directory<P: AsRef<Path>>(dir: P) -> Result<Vec<PhotoItem>, String> {
    let p_dir = dir.as_ref();
    let catalog_opt = cache::load_catalog_cache(p_dir);

    let mut items = Vec::new();
    let entries = fs::read_dir(p_dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && is_supported_photo(&path) {
            let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            let file_size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            let is_raw = is_raw_file(&path);

            // 读取已有的 XMP 元数据伴侣文件 (摄影师评级等黄金源数据)
            let xmp_p = get_xmp_path(&path);
            let xmp_meta = read_xmp(&xmp_p).unwrap_or_default();

            // 检查 catalog.json 缓存中是否存在预计算数据
            let cached_item = catalog_opt
                .as_ref()
                .and_then(|c| c.items.iter().find(|it| it.filename == filename));

            let (retouch_status, defect_tags, burst_group_id, thumb_width, thumb_height, faces, exif) =
                if let Some(cat) = cached_item {
                    let status = if !xmp_meta.retouch_status.is_empty() {
                        match xmp_meta.retouch_status.to_lowercase().as_str() {
                            "clean" => crate::models::RetouchStatus::Clean,
                            "fixable" => crate::models::RetouchStatus::Fixable,
                            "fatal" => crate::models::RetouchStatus::Fatal,
                            "failed" => crate::models::RetouchStatus::Failed,
                            _ => cat.retouch_status.clone(),
                        }
                    } else {
                        cat.retouch_status.clone()
                    };

                    let bg_id = if !xmp_meta.burst_group_id.is_empty() {
                        Some(xmp_meta.burst_group_id)
                    } else {
                        cat.burst_group_id.clone()
                    };

                    let exif = cat.exif.clone().or_else(|| {
                        if is_raw {
                            libraw_ffi::extract_raw_metadata(&path).ok()
                        } else {
                            exif::extract_image_file_exif(&path)
                        }
                    });

                    (
                        status,
                        cat.defect_tags.clone(),
                        bg_id,
                        cat.thumb_width,
                        cat.thumb_height,
                        cat.faces.clone(),
                        exif,
                    )
                } else {
                    let status = match xmp_meta.retouch_status.to_lowercase().as_str() {
                        "clean" => crate::models::RetouchStatus::Clean,
                        "fixable" => crate::models::RetouchStatus::Fixable,
                        "fatal" => crate::models::RetouchStatus::Fatal,
                        "failed" => crate::models::RetouchStatus::Failed,
                        _ => crate::models::RetouchStatus::Pending,
                    };

                    let bg_id = if xmp_meta.burst_group_id.is_empty() {
                        None
                    } else {
                        Some(xmp_meta.burst_group_id)
                    };

                    // 实时提取 EXIF/拍摄参数
                    let parsed_exif = if is_raw {
                        libraw_ffi::extract_raw_metadata(&path).ok()
                    } else {
                        exif::extract_image_file_exif(&path)
                    };

                    (status, Vec::new(), bg_id, None, None, Vec::new(), parsed_exif)
                };

            items.push(PhotoItem {
                id: uuid::Uuid::new_v4().to_string(),
                path: path.to_string_lossy().to_string(),
                filename,
                file_size,
                is_raw,
                rating: xmp_meta.rating,
                color_label: xmp_meta.label,
                pick_status: if xmp_meta.pick_status.is_empty() {
                    "None".to_string()
                } else {
                    xmp_meta.pick_status
                },
                thumb_width,
                thumb_height,
                retouch_status,
                defect_tags,
                burst_group_id,
                faces,
                exif,
                xmp_source_hash: if xmp_meta.source_hash.is_empty() {
                    None
                } else {
                    Some(xmp_meta.source_hash)
                },
            });
        }
    }

    // 按文件名自然升序排序
    items.sort_by(|a, b| a.filename.cmp(&b.filename));

    // 1. 连拍序列成组聚类
    crate::rules::group_bursts(&mut items);

    // 2. 自动诊断与可修/不可修规则初筛 (若无 XMP 覆写且无 catalog 预计算)
    let cloned_items = items.clone();
    for (i, item) in items.iter_mut().enumerate() {
        if item.retouch_status == crate::models::RetouchStatus::Pending {
            let analysis = load_photo_preview(&item.path)
                .and_then(|(bytes, _)| crate::rules::analyze_image_bytes(&bytes));
            match analysis {
                Ok(metrics) => {
                    let (status, tags) = crate::rules::evaluate_photo_retouchability(
                        &metrics,
                        Some(&cloned_items),
                        i,
                    );
                    item.retouch_status = status;
                    item.defect_tags = tags;
                }
                Err(_) => item.retouch_status = crate::models::RetouchStatus::Failed,
            }
        }
    }

    Ok(items)
}

/// 加载单张照片的最佳预览图像字节 (优先命中 2K 代理缓存，避免网络拉取 50MB RAW)
pub fn load_photo_preview<P: AsRef<Path>>(path: P) -> Result<(Vec<u8>, String), String> {
    let p = path.as_ref();

    // 1. 极速通道：优先检查是否存在 .quickpick_cache 代理文件 (2K WebP / 2K JPG)
    if let Some(proxy_path) = cache::find_proxy_file(p) {
        if let Ok(data) = fs::read(&proxy_path) {
            let ext = proxy_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("jpg")
                .to_lowercase();
            let mime = if ext == "webp" {
                "image/webp"
            } else {
                "image/jpeg"
            };
            return Ok((data, mime.to_string()));
        }
    }

    // 2. 退化通道：原生 LibRaw / 本地读取
    if is_raw_file(p) {
        let thumb = libraw_ffi::extract_embedded_thumbnail(p)
            .map_err(|e| format!("RAW 内嵌图提取失败: {}", e))?;

        let mime = if thumb.is_jpeg { "image/jpeg" } else { "image/x-portable-pixmap" };
        Ok((thumb.data, mime.to_string()))
    } else {
        let data = fs::read(p).map_err(|e| format!("读取图像文件失败: {}", e))?;
        let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("jpeg").to_lowercase();
        let mime = match ext.as_str() {
            "png" => "image/png",
            "webp" => "image/webp",
            _ => "image/jpeg",
        };
        Ok((data, mime.to_string()))
    }
}
