use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Deserialize)]
pub struct DeliveryPhotoInput {
    pub id: String,
    pub path: String,
    #[serde(default)]
    pub lut_id: Option<String>,
    #[serde(default)]
    pub lut_intensity: Option<f32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LutTablePayload {
    pub size: usize,
    pub data_base64: String,
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

#[inline(always)]
fn sample_lut_point(data: &[u8], size: usize, r: usize, g: usize, b: usize) -> (f32, f32, f32) {
    let offset = (g * size * size + b * size + r) * 4;
    if offset + 2 < data.len() {
        (
            data[offset] as f32,
            data[offset + 1] as f32,
            data[offset + 2] as f32,
        )
    } else {
        (0.0, 0.0, 0.0)
    }
}

pub fn apply_3d_lut_rgb(
    rgb: &mut [u8],
    lut_data: &[u8],
    size: usize,
    intensity: f32,
) {
    if size < 2 || lut_data.len() < size * size * size * 4 {
        return;
    }
    let max_idx = (size - 1) as f32;

    for pixel in rgb.as_chunks_mut::<3>().0 {
        let r_orig = pixel[0] as f32;
        let g_orig = pixel[1] as f32;
        let b_orig = pixel[2] as f32;

        let x = (r_orig / 255.0) * max_idx;
        let y = (g_orig / 255.0) * max_idx;
        let z = (b_orig / 255.0) * max_idx;

        let r0 = x.floor() as usize;
        let r1 = (r0 + 1).min(size - 1);
        let g0 = y.floor() as usize;
        let g1 = (g0 + 1).min(size - 1);
        let b0 = z.floor() as usize;
        let b1 = (b0 + 1).min(size - 1);

        let fr = x - r0 as f32;
        let fg = y - g0 as f32;
        let fb = z - b0 as f32;

        let (c000_r, c000_g, c000_b) = sample_lut_point(lut_data, size, r0, g0, b0);
        let (c100_r, c100_g, c100_b) = sample_lut_point(lut_data, size, r1, g0, b0);
        let (c010_r, c010_g, c010_b) = sample_lut_point(lut_data, size, r0, g1, b0);
        let (c110_r, c110_g, c110_b) = sample_lut_point(lut_data, size, r1, g1, b0);
        let (c001_r, c001_g, c001_b) = sample_lut_point(lut_data, size, r0, g0, b1);
        let (c101_r, c101_g, c101_b) = sample_lut_point(lut_data, size, r1, g0, b1);
        let (c011_r, c011_g, c011_b) = sample_lut_point(lut_data, size, r0, g1, b1);
        let (c111_r, c111_g, c111_b) = sample_lut_point(lut_data, size, r1, g1, b1);

        // Blend along R
        let c00_r = (1.0 - fr) * c000_r + fr * c100_r;
        let c00_g = (1.0 - fr) * c000_g + fr * c100_g;
        let c00_b = (1.0 - fr) * c000_b + fr * c100_b;

        let c10_r = (1.0 - fr) * c010_r + fr * c110_r;
        let c10_g = (1.0 - fr) * c010_g + fr * c110_g;
        let c10_b = (1.0 - fr) * c010_b + fr * c110_b;

        let c01_r = (1.0 - fr) * c001_r + fr * c101_r;
        let c01_g = (1.0 - fr) * c001_g + fr * c101_g;
        let c01_b = (1.0 - fr) * c001_b + fr * c101_b;

        let c11_r = (1.0 - fr) * c011_r + fr * c111_r;
        let c11_g = (1.0 - fr) * c011_g + fr * c111_g;
        let c11_b = (1.0 - fr) * c011_b + fr * c111_b;

        // Blend along G
        let c0_r = (1.0 - fg) * c00_r + fg * c10_r;
        let c0_g = (1.0 - fg) * c00_g + fg * c10_g;
        let c0_b = (1.0 - fg) * c00_b + fg * c10_b;

        let c1_r = (1.0 - fg) * c01_r + fg * c11_r;
        let c1_g = (1.0 - fg) * c01_g + fg * c11_g;
        let c1_b = (1.0 - fg) * c01_b + fg * c11_b;

        // Blend along B
        let lut_r = (1.0 - fb) * c0_r + fb * c1_r;
        let lut_g = (1.0 - fb) * c0_g + fb * c1_g;
        let lut_b = (1.0 - fb) * c0_b + fb * c1_b;

        // Blend with original using intensity
        pixel[0] = ((1.0 - intensity) * r_orig + intensity * lut_r).clamp(0.0, 255.0) as u8;
        pixel[1] = ((1.0 - intensity) * g_orig + intensity * lut_g).clamp(0.0, 255.0) as u8;
        pixel[2] = ((1.0 - intensity) * b_orig + intensity * lut_b).clamp(0.0, 255.0) as u8;
    }
}

pub fn render_shareable_jpegs(
    cache_root: &Path,
    photos: &[DeliveryPhotoInput],
    target_dir: &Path,
    max_edge: u32,
    quality: u8,
    lut_tables: Option<&HashMap<String, LutTablePayload>>,
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

    let decoded_luts: HashMap<String, (usize, Vec<u8>)> = lut_tables
        .map(|tables| {
            tables
                .iter()
                .filter_map(|(id, payload)| {
                    BASE64
                        .decode(&payload.data_base64)
                        .ok()
                        .map(|data| (id.clone(), (payload.size, data)))
                })
                .collect()
        })
        .unwrap_or_default();

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

            let mut rgb_image = rendered.to_rgb8();
            if let Some(ref lut_id) = photo.lut_id {
                if let Some((size, lut_data)) = decoded_luts.get(lut_id) {
                    let intensity = photo.lut_intensity.unwrap_or(1.0).clamp(0.0, 1.0);
                    if intensity > 0.001 {
                        apply_3d_lut_rgb(rgb_image.as_mut(), lut_data, *size, intensity);
                    }
                }
            }

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
                    .encode_image(&rgb_image)
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
                lut_id: None,
                lut_intensity: None,
            }],
            &target_dir,
            800,
            85,
            None,
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
                lut_id: None,
                lut_intensity: None,
            }],
            &target_dir,
            2048,
            88,
            None,
        )
        .unwrap();

        assert_eq!(result.skipped, 1);
        let expected = fs::canonicalize(target_dir.join("frame.jpg")).unwrap();
        assert_eq!(result.files, vec![expected.to_string_lossy().to_string()]);
        assert_eq!(fs::read(target_dir.join("frame.jpg")).unwrap(), b"existing");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn applies_3d_lut_transformation_correctly() {
        // 创建一个简单的 2x2x2 反转 LUT
        let size = 2;
        let mut lut_bytes = vec![0u8; size * size * size * 4];
        for b in 0..size {
            for g in 0..size {
                for r in 0..size {
                    let offset = (g * size * size + b * size + r) * 4;
                    // 色彩反转: 0 -> 255, 1 -> 0
                    lut_bytes[offset] = if r == 0 { 255 } else { 0 };
                    lut_bytes[offset + 1] = if g == 0 { 255 } else { 0 };
                    lut_bytes[offset + 2] = if b == 0 { 255 } else { 0 };
                    lut_bytes[offset + 3] = 255;
                }
            }
        }

        let mut pixel = [0u8, 0u8, 0u8]; // 纯黑 [0, 0, 0]
        apply_3d_lut_rgb(&mut pixel, &lut_bytes, size, 1.0);
        // 反转后应接近纯白 [255, 255, 255]
        assert_eq!(pixel, [255, 255, 255]);

        let mut pixel_half = [0u8, 0u8, 0u8];
        apply_3d_lut_rgb(&mut pixel_half, &lut_bytes, size, 0.5);
        // 50% 浓度混合后应接近 127/128
        assert!((pixel_half[0] as i32 - 127).abs() <= 2);
    }
}
