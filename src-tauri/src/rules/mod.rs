pub mod face;
use crate::models::{DefectTag, PhotoItem, RetouchStatus};

/// 图像指标分析结果
#[derive(Debug, Clone, Default)]
pub struct ImageMetrics {
    pub sharpness: f32,             // 拉普拉斯边缘锐度方差
    pub mean_luminance: f32,        // 平均亮度 (0 ~ 255)
    pub highlight_clipped_pct: f32, // 高光死白比例 (0.0 ~ 1.0)
    pub shadow_clipped_pct: f32,    // 暗部死黑比例 (0.0 ~ 1.0)
    pub dynamic_range: f32,         // 动态范围跨度
}

/// 快速从缩略图/图像字节中计算基本光学指标
pub fn analyze_image_bytes(bytes: &[u8]) -> Result<ImageMetrics, String> {
    if let Ok(img) = image::load_from_memory(bytes) {
        let gray = img.to_luma8();
        let (width, height) = gray.dimensions();
        if width == 0 || height == 0 {
            return Err("图像尺寸为零，无法分析".to_string());
        }

        let mut sum_lum: u64 = 0;
        let mut highlight_count: u64 = 0;
        let mut shadow_count: u64 = 0;

        // 步长抽样计算，保证在数千张规模下极速完成
        let step = ((width.max(height) / 300).max(1)) as usize;
        let mut sampled_count: u64 = 0;

        for y in (0..height).step_by(step) {
            for x in (0..width).step_by(step) {
                let p = gray.get_pixel(x, y)[0];
                sum_lum += p as u64;
                if p >= 250 {
                    highlight_count += 1;
                } else if p <= 5 {
                    shadow_count += 1;
                }
                sampled_count += 1;
            }
        }

        let mean_lum = if sampled_count > 0 {
            sum_lum as f32 / sampled_count as f32
        } else {
            128.0
        };

        let hl_pct = if sampled_count > 0 {
            highlight_count as f32 / sampled_count as f32
        } else {
            0.0
        };

        let sh_pct = if sampled_count > 0 {
            shadow_count as f32 / sampled_count as f32
        } else {
            0.0
        };

        // 计算中心 50% 核心区域拉普拉斯算子方差 (合焦清晰度)
        let cx_start = width / 4;
        let cx_end = (width * 3) / 4;
        let cy_start = height / 4;
        let cy_end = (height * 3) / 4;

        let mut lap_sum: f64 = 0.0;
        let mut lap_sq_sum: f64 = 0.0;
        let mut lap_count: u64 = 0;

        for y in (cy_start + 1..cy_end - 1).step_by(step) {
            for x in (cx_start + 1..cx_end - 1).step_by(step) {
                let c = gray.get_pixel(x, y)[0] as f64;
                let up = gray.get_pixel(x, y - 1)[0] as f64;
                let down = gray.get_pixel(x, y + 1)[0] as f64;
                let left = gray.get_pixel(x - 1, y)[0] as f64;
                let right = gray.get_pixel(x + 1, y)[0] as f64;

                let lap = (4.0 * c - up - down - left - right).abs();
                lap_sum += lap;
                lap_sq_sum += lap * lap;
                lap_count += 1;
            }
        }

        let sharpness = if lap_count > 0 {
            let mean = lap_sum / (lap_count as f64);
            let variance = (lap_sq_sum / (lap_count as f64)) - (mean * mean);
            variance.max(0.0) as f32
        } else {
            100.0
        };

        Ok(ImageMetrics {
            sharpness,
            mean_luminance: mean_lum,
            highlight_clipped_pct: hl_pct,
            shadow_clipped_pct: sh_pct,
            dynamic_range: 255.0,
        })
    } else {
        Err("图像解码失败，无法生成可信诊断".to_string())
    }
}

/// 连拍序列成组识别 (根据文件名连续编号聚类)
pub fn group_bursts(photos: &mut [PhotoItem]) {
    let mut group_counter = 1;
    let mut current_indices: Vec<usize> = Vec::new();
    let mut last_seq: Option<i64> = None;

    for i in 0..photos.len() {
        let seq = extract_seq_num(&photos[i].filename);
        let consecutive = match (seq, last_seq) {
            (Some(s), Some(l)) => (s - l).abs() == 1,
            _ => false,
        };

        if consecutive {
            current_indices.push(i);
        } else {
            if current_indices.len() >= 2 {
                let gid = format!("burst-grp-{:03}", group_counter);
                group_counter += 1;
                for &idx in &current_indices {
                    photos[idx].burst_group_id = Some(gid.clone());
                }
            }
            current_indices.clear();
            current_indices.push(i);
        }
        last_seq = seq;
    }

    if current_indices.len() >= 2 {
        let gid = format!("burst-grp-{:03}", group_counter);
        for &idx in &current_indices {
            photos[idx].burst_group_id = Some(gid.clone());
        }
    }
}

fn extract_seq_num(filename: &str) -> Option<i64> {
    let digits: String = filename.chars().filter(|c| c.is_ascii_digit()).collect();
    digits.parse::<i64>().ok()
}

/// 综合评估照片的“可修 / 不可修”状态并生成诊断标签
pub fn evaluate_photo_retouchability(
    metrics: &ImageMetrics,
    burst_group_photos: Option<&[PhotoItem]>,
    current_photo_idx: usize,
) -> (RetouchStatus, Vec<DefectTag>) {
    let mut tags = Vec::new();
    let mut fatal_count = 0;
    let mut fixable_count = 0;

    // 1. 致命硬伤检测：严重脱焦 / 剧烈运动模糊
    if metrics.sharpness < 25.0 {
        tags.push(DefectTag {
            id: "fatal_severe_blur".to_string(),
            category: "fatal".to_string(),
            label: "严重脱焦/拖影".to_string(),
            confidence: 0.94,
            hint: Some("主体边缘锐度极低，光学校验失误，商业客照无法真实还原".to_string()),
        });
        fatal_count += 1;
    } else if metrics.sharpness < 75.0 {
        tags.push(DefectTag {
            id: "fixable_slight_blur".to_string(),
            category: "fixable".to_string(),
            label: "焦点微软".to_string(),
            confidence: 0.78,
            hint: Some("可通过高反差保留/智能锐化滤镜增强，适合缩略图或小尺寸输出".to_string()),
        });
        fixable_count += 1;
    }

    // 2. 致命硬伤检测：高光严重死白 (大面积无细节)
    if metrics.highlight_clipped_pct > 0.18 {
        tags.push(DefectTag {
            id: "fatal_blown_highlights".to_string(),
            category: "fatal".to_string(),
            label: "高光严重死白".to_string(),
            confidence: 0.89,
            hint: Some("大面积全通道截断，RAW 像素饱和溢出，肤色/婚纱细节不可恢复".to_string()),
        });
        fatal_count += 1;
    } else if metrics.highlight_clipped_pct > 0.05 {
        tags.push(DefectTag {
            id: "fixable_highlight_recoverable".to_string(),
            category: "fixable".to_string(),
            label: "高光偏亮可拉回".to_string(),
            confidence: 0.82,
            hint: Some("RAW 动态范围充足，在 Lightroom 中降低高光 -35 即可挽回细节".to_string()),
        });
        fixable_count += 1;
    }

    // 3. 可修项：曝光偏暗
    if metrics.mean_luminance < 75.0 && metrics.sharpness >= 75.0 {
        tags.push(DefectTag {
            id: "fixable_underexposed".to_string(),
            category: "fixable".to_string(),
            label: "曝光偏暗".to_string(),
            confidence: 0.86,
            hint: Some("主体合焦清晰但欠曝，暗部噪点可控，后期提亮阴影 +1.5EV 即可还原".to_string()),
        });
        fixable_count += 1;
    }

    // 4. 可修项：连拍换脸/换眼匹配机制
    if let Some(group) = burst_group_photos {
        if group.len() > 1 {
            let mut candidate_name: Option<String> = None;
            for (idx, other) in group.iter().enumerate() {
                if idx != current_photo_idx && other.retouch_status == RetouchStatus::Clean {
                    candidate_name = Some(other.filename.clone());
                    break;
                }
            }

            if let Some(candidate) = candidate_name {
                if fatal_count > 0 || fixable_count > 0 {
                    tags.push(DefectTag {
                        id: "fixable_burst_swap".to_string(),
                        category: "fixable".to_string(),
                        label: "连拍可换脸/换眼".to_string(),
                        confidence: 0.95,
                        hint: Some(format!("同组连拍底片 [{}] 合焦极佳，推荐作为脸部/眼神替换源", candidate)),
                    });
                    // 如果只是因表情或局部原因被标记，连拍素材可挽救该张
                    if fatal_count > 0 && metrics.sharpness >= 25.0 {
                        fatal_count -= 1;
                    }
                    fixable_count += 1;
                }
            }
        }
    }

    // 最终判定
    let status = if fatal_count > 0 {
        RetouchStatus::Fatal
    } else if fixable_count > 0 {
        RetouchStatus::Fixable
    } else {
        tags.push(DefectTag {
            id: "clean_prime".to_string(),
            category: "clean".to_string(),
            label: "完美原片".to_string(),
            confidence: 0.95,
            hint: Some("焦点锐利、曝光平衡，符合商业主片标准，建议直接 4~5 星采纳".to_string()),
        });
        RetouchStatus::Clean
    };

    (status, tags)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_burst_grouping() {
        let mut photos = vec![
            PhotoItem {
                id: "1".into(),
                path: "/p/_DSC0001.jpg".into(),
                filename: "_DSC0001.jpg".into(),
                file_size: 1000,
                is_raw: false,
                rating: 0,
                color_label: "".into(),
                pick_status: "None".into(),
                thumb_width: None,
                thumb_height: None,
                retouch_status: RetouchStatus::Pending,
                defect_tags: vec![],
                burst_group_id: None,
                faces: vec![],
                xmp_source_hash: None,
            },
            PhotoItem {
                id: "2".into(),
                path: "/p/_DSC0002.jpg".into(),
                filename: "_DSC0002.jpg".into(),
                file_size: 1000,
                is_raw: false,
                rating: 0,
                color_label: "".into(),
                pick_status: "None".into(),
                thumb_width: None,
                thumb_height: None,
                retouch_status: RetouchStatus::Pending,
                defect_tags: vec![],
                burst_group_id: None,
                faces: vec![],
                xmp_source_hash: None,
            },
            PhotoItem {
                id: "3".into(),
                path: "/p/_DSC0010.jpg".into(),
                filename: "_DSC0010.jpg".into(),
                file_size: 1000,
                is_raw: false,
                rating: 0,
                color_label: "".into(),
                pick_status: "None".into(),
                thumb_width: None,
                thumb_height: None,
                retouch_status: RetouchStatus::Pending,
                defect_tags: vec![],
                burst_group_id: None,
                faces: vec![],
                xmp_source_hash: None,
            },
        ];

        group_bursts(&mut photos);
        assert!(photos[0].burst_group_id.is_some());
        assert_eq!(photos[0].burst_group_id, photos[1].burst_group_id);
        assert!(photos[2].burst_group_id.is_none());
    }

    #[test]
    fn test_fatal_blur_evaluation() {
        let metrics = ImageMetrics {
            sharpness: 10.0, // 极低锐度
            mean_luminance: 120.0,
            highlight_clipped_pct: 0.0,
            shadow_clipped_pct: 0.0,
            dynamic_range: 200.0,
        };
        let (status, tags) = evaluate_photo_retouchability(&metrics, None, 0);
        assert_eq!(status, RetouchStatus::Fatal);
        assert!(tags.iter().any(|t| t.id == "fatal_severe_blur"));
    }

    #[test]
    fn test_clean_evaluation() {
        let metrics = ImageMetrics {
            sharpness: 180.0, // 高锐度
            mean_luminance: 130.0,
            highlight_clipped_pct: 0.01,
            shadow_clipped_pct: 0.01,
            dynamic_range: 220.0,
        };
        let (status, tags) = evaluate_photo_retouchability(&metrics, None, 0);
        assert_eq!(status, RetouchStatus::Clean);
        assert!(tags.iter().any(|t| t.id == "clean_prime"));
    }
}
