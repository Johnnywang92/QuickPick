use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Deserialize)]
pub struct DeliveryPhotoInput {
    pub id: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RenderedExportResult {
    pub total: usize,
    pub success: usize,
    pub skipped: usize,
    pub failed: usize,
    pub target_directory: String,
    pub files: Vec<String>,
    pub errors: Vec<String>,
}

fn safe_stem(path: &Path, index: usize) -> String {
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .filter(|stem| !stem.trim().is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| format!("QuickPick_{:04}", index + 1))
}

pub fn render_shareable_jpegs(
    cache_root: &Path,
    photos: &[DeliveryPhotoInput],
    target_dir: &Path,
    max_edge: u32,
    quality: u8,
) -> Result<RenderedExportResult, String> {
    if photos.is_empty() {
        return Err("没有可导出的照片".to_string());
    }
    if !(640..=8192).contains(&max_edge) {
        return Err("JPEG 长边必须在 640 到 8192 像素之间".to_string());
    }
    if !(40..=100).contains(&quality) {
        return Err("JPEG 品质必须在 40 到 100 之间".to_string());
    }
    if !target_dir.is_dir() {
        return Err("JPEG 导出目标不是有效文件夹".to_string());
    }
    let target_dir =
        fs::canonicalize(target_dir).map_err(|error| format!("解析 JPEG 导出目录失败: {error}"))?;
    let mut result = RenderedExportResult {
        total: photos.len(),
        success: 0,
        skipped: 0,
        failed: 0,
        target_directory: target_dir.to_string_lossy().to_string(),
        files: Vec::new(),
        errors: Vec::new(),
    };

    for (index, photo) in photos.iter().enumerate() {
        let source = Path::new(&photo.path);
        let destination = target_dir.join(format!("{}.jpg", safe_stem(source, index)));
        if destination.exists() {
            result.skipped += 1;
            // 已存在的输出仍可用于后续 AirDrop 分享；跳过仅表示不覆盖它。
            result.files.push(destination.to_string_lossy().to_string());
            continue;
        }
        let render_result = (|| -> Result<PathBuf, String> {
            let canonical_source =
                fs::canonicalize(source).map_err(|error| format!("读取源照片失败: {error}"))?;
            if canonical_source.starts_with(&target_dir) {
                return Err("导出目录不能包含源照片".to_string());
            }
            let (bytes, _) = crate::engine::cache::load_cached_preview(
                cache_root,
                &photo.id,
                &canonical_source,
            )?;
            let image = image::load_from_memory(&bytes)
                .map_err(|error| format!("解码照片预览失败: {error}"))?;
            let rendered = if image.width().max(image.height()) > max_edge {
                image.resize(max_edge, max_edge, FilterType::Lanczos3)
            } else {
                image
            };
            let temporary = target_dir.join(format!(
                ".{}.{}.quickpick-jpeg-tmp",
                safe_stem(source, index),
                uuid::Uuid::new_v4()
            ));
            let write_result = (|| -> Result<(), String> {
                let mut file = fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&temporary)
                    .map_err(|error| format!("创建 JPEG 临时文件失败: {error}"))?;
                JpegEncoder::new_with_quality(&mut file, quality)
                    .encode_image(&rendered)
                    .map_err(|error| format!("编码 JPEG 失败: {error}"))?;
                file.sync_all()
                    .map_err(|error| format!("JPEG 刷盘失败: {error}"))?;
                fs::hard_link(&temporary, &destination)
                    .map_err(|error| format!("目标文件已存在或无法安全写入: {error}"))?;
                Ok(())
            })();
            let _ = fs::remove_file(&temporary);
            write_result?;
            Ok(destination)
        })();

        match render_result {
            Ok(path) => {
                result.success += 1;
                result.files.push(path.to_string_lossy().to_string());
            }
            Err(error) => {
                result.failed += 1;
                result.errors.push(format!("{}: {error}", photo.path));
            }
        }
    }
    Ok(result)
}

#[cfg(target_os = "macos")]
pub fn open_airdrop(files: &[String]) -> Result<(), String> {
    use objc2::runtime::AnyObject;
    use objc2_app_kit::{NSSharingService, NSSharingServiceNameSendViaAirDrop};
    use objc2_foundation::{NSArray, NSString, NSURL};

    let urls = files
        .iter()
        .map(|path| {
            let url = NSURL::fileURLWithPath(&NSString::from_str(path));
            let object: objc2::rc::Retained<AnyObject> = url.into_super().into_super();
            object
        })
        .collect::<Vec<_>>();
    let items = NSArray::from_retained_slice(&urls);
    let service =
        NSSharingService::sharingServiceNamed(unsafe { NSSharingServiceNameSendViaAirDrop })
            .ok_or_else(|| "当前 macOS 无法使用 AirDrop 服务".to_string())?;
    if !unsafe { service.canPerformWithItems(Some(&items)) } {
        return Err("AirDrop 无法分享生成的 JPEG 文件".to_string());
    }
    unsafe { service.performWithItems(&items) };
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn open_airdrop(_files: &[String]) -> Result<(), String> {
    Err("AirDrop 仅在 macOS 上可用".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage};

    #[test]
    fn renders_bounded_jpeg_without_touching_source() {
        let root = std::env::temp_dir().join(format!("qp_delivery_{}", uuid::Uuid::new_v4()));
        let cache = root.join("cache");
        let source_dir = root.join("source");
        let target_dir = root.join("target");
        fs::create_dir_all(&cache).unwrap();
        fs::create_dir_all(&source_dir).unwrap();
        fs::create_dir_all(&target_dir).unwrap();
        let source = source_dir.join("large.png");
        RgbImage::from_pixel(1600, 800, Rgb([40, 100, 180]))
            .save(&source)
            .unwrap();

        let result = render_shareable_jpegs(
            &cache,
            &[DeliveryPhotoInput {
                id: "large".to_string(),
                path: source.to_string_lossy().to_string(),
            }],
            &target_dir,
            800,
            85,
        )
        .unwrap();

        assert_eq!(result.success, 1);
        assert!(source.is_file());
        let output = image::open(&result.files[0]).unwrap();
        assert_eq!((output.width(), output.height()), (800, 400));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn skips_existing_jpeg_instead_of_overwriting() {
        let root = std::env::temp_dir().join(format!("qp_delivery_skip_{}", uuid::Uuid::new_v4()));
        let cache = root.join("cache");
        let source_dir = root.join("source");
        let target_dir = root.join("target");
        fs::create_dir_all(&cache).unwrap();
        fs::create_dir_all(&source_dir).unwrap();
        fs::create_dir_all(&target_dir).unwrap();
        let source = source_dir.join("frame.png");
        RgbImage::from_pixel(8, 8, Rgb([1, 2, 3]))
            .save(&source)
            .unwrap();
        fs::write(target_dir.join("frame.jpg"), b"existing").unwrap();

        let result = render_shareable_jpegs(
            &cache,
            &[DeliveryPhotoInput {
                id: "frame".to_string(),
                path: source.to_string_lossy().to_string(),
            }],
            &target_dir,
            2048,
            88,
        )
        .unwrap();

        assert_eq!(result.skipped, 1);
        let expected = fs::canonicalize(target_dir.join("frame.jpg")).unwrap();
        assert_eq!(result.files, vec![expected.to_string_lossy().to_string()]);
        assert_eq!(fs::read(target_dir.join("frame.jpg")).unwrap(), b"existing");
        let _ = fs::remove_dir_all(root);
    }
}
