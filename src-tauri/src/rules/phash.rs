use image::DynamicImage;
use std::f64::consts::PI;

/// 图像感知哈希 (pHash)
///
/// 算法原理:
/// 1. 缩放至 32x32 灰度矩阵 (降噪并统一尺寸)
/// 2. 离散余弦变换 (2D DCT)，提取左上角 8x8 低频系数
/// 3. 计算 64 个低频系数的中位数 (排除 DC 均值偏置)
/// 4. 生成 64-bit 整数指纹 (每个比特代表系数相对中位数的分布)
#[allow(clippy::needless_range_loop)]
pub fn compute_phash(img: &DynamicImage) -> u64 {
    // 缩放到 32x32 灰度
    let gray = img
        .resize_exact(32, 32, image::imageops::FilterType::Triangle)
        .to_luma8();

    // 构建 32x32 灰度矩阵
    let mut matrix = [[0.0f64; 32]; 32];
    for y in 0..32 {
        for x in 0..32 {
            matrix[y][x] = gray.get_pixel(x as u32, y as u32)[0] as f64;
        }
    }

    // 行变换: 32x32 -> 32x8
    let mut row_dct = [[0.0f64; 8]; 32];
    for y in 0..32 {
        for u in 0..8 {
            let mut sum = 0.0;
            for x in 0..32 {
                let cos_val = ((2.0 * (x as f64) + 1.0) * (u as f64) * PI / 64.0).cos();
                sum += matrix[y][x] * cos_val;
            }
            row_dct[y][u] = sum;
        }
    }

    // 列变换: 32x8 -> 8x8
    let mut dct = [[0.0f64; 8]; 8];
    for v in 0..8 {
        for u in 0..8 {
            let mut sum = 0.0;
            for y in 0..32 {
                let cos_val = ((2.0 * (y as f64) + 1.0) * (v as f64) * PI / 64.0).cos();
                sum += row_dct[y][u] * cos_val;
            }
            dct[v][u] = sum;
        }
    }

    // 提取 64 个低频系数并计算中位数 (忽略 dct[0][0] DC 偏置以抵抗整体曝光变化)
    let mut ac_values = Vec::with_capacity(63);
    for v in 0..8 {
        for u in 0..8 {
            if v == 0 && u == 0 {
                continue;
            }
            ac_values.push(dct[v][u]);
        }
    }
    ac_values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let median = ac_values[31];

    // 生成 64-bit 指纹
    let mut hash: u64 = 0;
    for v in 0..8 {
        for u in 0..8 {
            hash <<= 1;
            let val = if v == 0 && u == 0 {
                dct[0][0]
            } else {
                dct[v][u]
            };
            if val > median {
                hash |= 1;
            }
        }
    }

    hash
}

/// 计算两个 64-bit pHash 之间的汉明距离 (0 ~ 64)
#[inline]
pub fn hamming_distance(h1: u64, h2: u64) -> u32 {
    (h1 ^ h2).count_ones()
}

/// 将 64-bit 哈希格式化为 16 位小写十六进制字符串
pub fn hash_to_hex(hash: u64) -> String {
    format!("{:016x}", hash)
}

/// 解析 16 位十六进制字符串为 64-bit 哈希
pub fn hex_to_hash(hex: &str) -> Option<u64> {
    u64::from_str_radix(hex, 16).ok()
}

/// 将汉明距离转换为视觉相似度百分比 (0.0 ~ 100.0)
pub fn distance_to_similarity(dist: u32) -> f32 {
    let d = dist.min(64);
    ((64 - d) as f32 / 64.0) * 100.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    fn make_test_image(width: u32, height: u32, fill: [u8; 4]) -> DynamicImage {
        let mut img = RgbaImage::new(width, height);
        for pixel in img.pixels_mut() {
            *pixel = Rgba(fill);
        }
        DynamicImage::ImageRgba8(img)
    }

    fn make_pattern_image(width: u32, height: u32, shift: u32) -> DynamicImage {
        let mut img = RgbaImage::new(width, height);
        for (x, y, pixel) in img.enumerate_pixels_mut() {
            let v = (((x + shift) * 10) ^ (y * 10)) as u8;
            *pixel = Rgba([v, v, v, 255]);
        }
        DynamicImage::ImageRgba8(img)
    }

    #[test]
    fn test_identical_images_have_zero_distance() {
        let img1 = make_pattern_image(100, 100, 0);
        let img2 = make_pattern_image(100, 100, 0);

        let h1 = compute_phash(&img1);
        let h2 = compute_phash(&img2);

        assert_eq!(h1, h2);
        assert_eq!(hamming_distance(h1, h2), 0);
        assert_eq!(distance_to_similarity(0), 100.0);
    }

    #[test]
    fn test_slight_variation_has_low_distance() {
        let img1 = make_pattern_image(120, 120, 0);
        // 轻微偏移 1 像素，模拟连拍微小位移
        let img2 = make_pattern_image(120, 120, 1);

        let h1 = compute_phash(&img1);
        let h2 = compute_phash(&img2);

        let dist = hamming_distance(h1, h2);
        assert!(
            dist <= 6,
            "微小位移图像的汉明距离应小于等于 6，实际为: {}",
            dist
        );
    }

    #[test]
    fn test_completely_different_images_have_high_distance() {
        // 图 1: 水平渐变黑白
        let mut img1 = RgbaImage::new(100, 100);
        for (x, _y, p) in img1.enumerate_pixels_mut() {
            let v = (x * 2) as u8;
            *p = Rgba([v, v, v, 255]);
        }
        // 图 2: 纯平色
        let img2 = make_test_image(100, 100, [255, 0, 0, 255]);

        let h1 = compute_phash(&DynamicImage::ImageRgba8(img1));
        let h2 = compute_phash(&img2);

        let dist = hamming_distance(h1, h2);
        assert!(
            dist >= 10,
            "完全不同的图像汉明距离应显著大于 10，实际为: {}",
            dist
        );
    }

    #[test]
    fn test_hex_conversion_roundtrip() {
        let original: u64 = 0x1a2b3c4d5e6f7081;
        let hex = hash_to_hex(original);
        assert_eq!(hex, "1a2b3c4d5e6f7081");
        let parsed = hex_to_hash(&hex).expect("应成功解析十六进制哈希");
        assert_eq!(parsed, original);
    }
}
