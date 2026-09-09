pub mod face;
pub mod phash;
pub mod timeline;
use crate::models::{AnalysisStatus, DefectTag, PhotoItem, WorkflowScene};
pub use phash::{
    compute_phash, distance_to_similarity, hamming_distance, hash_to_hex, hex_to_hash,
};
pub use timeline::{cluster_photos_by_timeline, TimelineChapter};

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

fn parse_photo_timestamp(photo: &PhotoItem) -> Option<i64> {
    photo
        .exif
        .as_ref()
        .and_then(|e| e.date_time_original.as_deref())
        .and_then(|dt_str| {
            chrono::NaiveDateTime::parse_from_str(dt_str, "%Y-%m-%d %H:%M:%S")
                .ok()
                .map(|dt| dt.and_utc().timestamp())
        })
}

pub fn are_photos_burst_consecutive_hybrid(
    p_curr: &PhotoItem,
    p_prev: &PhotoItem,
    seq_curr: Option<i64>,
    seq_prev: Option<i64>,
    phash_curr: Option<u64>,
    phash_prev: Option<u64>,
) -> bool {
    let visual_dist = match (phash_curr, phash_prev) {
        (Some(h1), Some(h2)) => Some(phash::hamming_distance(h1, h2)),
        _ => None,
    };

    // 1. 视觉防误断开: 若两图具有感知哈希且汉明距离 >= 14 (画面主体/构图完全不同)，
    // 即使拍摄时间在 2 秒以内也不属于同一连拍组 (如摄影师迅速转身或转场)
    if let Some(dist) = visual_dist {
        if dist >= 14 {
            return false;
        }
    }

    let t_curr = parse_photo_timestamp(p_curr);
    let t_prev = parse_photo_timestamp(p_prev);

    match (t_curr, t_prev) {
        (Some(tc), Some(tp)) => {
            let dt = (tc - tp).abs();
            if dt <= 2 {
                match (seq_curr, seq_prev) {
                    (Some(sc), Some(sp)) => (sc - sp).abs() <= 5,
                    _ => true,
                }
            } else if dt <= 15 {
                // 时间差在 15 秒内且视觉高度相似 (汉明距离 <= 8) 聚为一组
                visual_dist.is_some_and(|d| d <= 8)
            } else if dt <= 60 {
                // 极度相似或重复画面 (汉明距离 <= 3) 允许放宽至 60 秒内成组
                visual_dist.is_some_and(|d| d <= 3)
            } else {
                false
            }
        }
        // 若任意一方缺少时间戳: 优先依赖感知哈希
        _ => {
            if let Some(dist) = visual_dist {
                dist <= 8
            } else {
                match (seq_curr, seq_prev) {
                    (Some(s), Some(l)) => (s - l).abs() == 1,
                    _ => false,
                }
            }
        }
    }
}

fn are_photos_burst_consecutive(
    p_curr: &PhotoItem,
    p_prev: &PhotoItem,
    seq_curr: Option<i64>,
    seq_prev: Option<i64>,
) -> bool {
    are_photos_burst_consecutive_hybrid(p_curr, p_prev, seq_curr, seq_prev, None, None)
}

/// 连拍序列成组识别 (基于 EXIF 毫秒时间窗口与文件名编号混合聚类)
pub fn group_bursts(photos: &mut [PhotoItem]) {
    let mut current_indices: Vec<usize> = Vec::new();
    let mut last_seq: Option<i64> = None;

    for i in 0..photos.len() {
        let seq = extract_seq_num(&photos[i].filename);
        let consecutive = if i > 0 {
            are_photos_burst_consecutive(&photos[i], &photos[i - 1], seq, last_seq)
        } else {
            false
        };

        if consecutive {
            current_indices.push(i);
        } else {
            if current_indices.len() >= 2 {
                let gid = format!("burst:{}", photos[current_indices[0]].id);
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
        let gid = format!("burst:{}", photos[current_indices[0]].id);
        for &idx in &current_indices {
            photos[idx].burst_group_id = Some(gid.clone());
        }
    }
}

fn extract_seq_num(filename: &str) -> Option<i64> {
    let digits: String = filename.chars().filter(|c| c.is_ascii_digit()).collect();
    digits.parse::<i64>().ok()
}

/// 生成仅供人工复核参考的本地分析提示（支持场景工作流模式定制）。
pub fn evaluate_photo_analysis_with_scene(
    metrics: &ImageMetrics,
    _burst_group_photos: Option<&[PhotoItem]>,
    _current_photo_idx: usize,
    scene: WorkflowScene,
) -> (AnalysisStatus, Vec<DefectTag>) {
    let mut tags = Vec::new();
    let mut needs_check = false;

    // 确定各场景的锐度阈值
    let (severe_blur_thresh, borderline_blur_thresh, slight_blur_thresh) = match scene {
        WorkflowScene::Concert => (18.0, 38.0, 65.0), // 舞台暗光与烟雾动态，适度宽容
        WorkflowScene::Cosplay => (35.0, 55.0, 80.0), // 二次元/Cosplay 极致看重美瞳与睫毛锐度，阈值加严
        WorkflowScene::Conference => (25.0, 45.0, 75.0),
        WorkflowScene::Wedding => (22.0, 45.0, 75.0), // 婚礼大笑大哭抓拍适度容差
        WorkflowScene::General => (25.0, 45.0, 75.0),
    };

    // 1. 锐度异常提示：严重脱焦 / 剧烈运动模糊
    if metrics.sharpness < severe_blur_thresh {
        tags.push(DefectTag {
            id: "possible_severe_blur".to_string(),
            category: "warning".to_string(),
            label: "可能严重脱焦/拖影".to_string(),
            confidence: 0.85,
            hint: Some(
                "主体边缘梯度反差极低，可能存在较严重脱焦或运动拖影，建议放大复核焦点".to_string(),
            ),
        });
        needs_check = true;
    } else if metrics.sharpness < borderline_blur_thresh {
        let (label, hint) = match scene {
            WorkflowScene::Cosplay => (
                "Cosplay美瞳/眼部微软待审".to_string(),
                "二次元正片对眼部美瞳与假睫毛锐度要求较高，当前边缘反差处于临界区，建议100%放大确认".to_string(),
            ),
            WorkflowScene::Concert => (
                "舞台边缘合焦/烟雾光晕".to_string(),
                "舞台光效或烟雾可能削弱了局部反差，建议核实歌手眼部焦点".to_string(),
            ),
            _ => (
                "临界合焦".to_string(),
                "锐度处于清晰与脱焦边缘，建议100%放大确认眼部焦点或归入争议复核".to_string(),
            ),
        };
        tags.push(DefectTag {
            id: "review_borderline_sharpness".to_string(),
            category: "warning".to_string(),
            label,
            confidence: 0.75,
            hint: Some(hint),
        });
        needs_check = true;
    } else if metrics.sharpness < slight_blur_thresh {
        tags.push(DefectTag {
            id: "possible_slight_blur".to_string(),
            category: "warning".to_string(),
            label: "焦点可能微软".to_string(),
            confidence: 0.75,
            hint: Some(
                "边缘反差轻微不足，可通过后期智能锐化滤镜适度增强，建议结合输出画幅评估"
                    .to_string(),
            ),
        });
        needs_check = true;
    }

    // 2. 高光异常提示
    let severe_highlight_thresh = match scene {
        WorkflowScene::Concert => 0.14, // 演唱会舞台爆闪导致面部过曝是常见硬伤
        WorkflowScene::Cosplay => 0.16,
        _ => 0.18,
    };

    if metrics.highlight_clipped_pct > severe_highlight_thresh {
        let label = if scene == WorkflowScene::Concert {
            "舞台爆闪严重死白".to_string()
        } else {
            "高光严重死白".to_string()
        };
        tags.push(DefectTag {
            id: "possible_blown_highlights".to_string(),
            category: "warning".to_string(),
            label,
            confidence: 0.85,
            hint: Some(
                "预览图高光大面积截断，可能存在过曝溢出风险，建议复核 RAW 动态范围".to_string(),
            ),
        });
        needs_check = true;
    } else if metrics.highlight_clipped_pct > 0.05 {
        tags.push(DefectTag {
            id: "possible_bright_highlights".to_string(),
            category: "warning".to_string(),
            label: "高光可能偏亮".to_string(),
            confidence: 0.80,
            hint: Some("局部高光偏亮但未大面积截断，通常可在后期适度压暗高光挽回细节".to_string()),
        });
        needs_check = true;
    }

    // 3. 曝光偏暗提示
    if metrics.mean_luminance < 75.0 && metrics.sharpness >= severe_blur_thresh {
        let label = if scene == WorkflowScene::Concert {
            "舞台暗部氛围可提亮".to_string()
        } else {
            "曝光偏暗".to_string()
        };
        tags.push(DefectTag {
            id: "possible_underexposed".to_string(),
            category: "warning".to_string(),
            label,
            confidence: 0.82,
            hint: Some(
                "整体直方图偏暗，若传感器动态范围充足，可在后期提亮暗部并配合降噪".to_string(),
            ),
        });
        needs_check = true;
    }

    // 分析结果仅决定是否显示人工复核提示，不代表用户选片决定。
    let status = if needs_check {
        AnalysisStatus::NeedsCheck
    } else {
        tags.push(DefectTag {
            id: "no_obvious_issue".to_string(),
            category: "info".to_string(),
            label: "未见明显问题".to_string(),
            confidence: 0.88,
            hint: Some("当前预览分析未发现明显锐度或曝光异常，仍建议结合原图人工确认".to_string()),
        });
        AnalysisStatus::NoIssues
    };

    (status, tags)
}

/// 使用通用场景生成本地分析提示。
pub fn evaluate_photo_analysis(
    metrics: &ImageMetrics,
    burst_group_photos: Option<&[PhotoItem]>,
    current_photo_idx: usize,
) -> (AnalysisStatus, Vec<DefectTag>) {
    evaluate_photo_analysis_with_scene(
        metrics,
        burst_group_photos,
        current_photo_idx,
        WorkflowScene::General,
    )
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
                thumb_width: None,
                thumb_height: None,
                burst_group_id: None,
                exif: None,
            },
            PhotoItem {
                id: "2".into(),
                path: "/p/_DSC0002.jpg".into(),
                filename: "_DSC0002.jpg".into(),
                file_size: 1000,
                is_raw: false,
                thumb_width: None,
                thumb_height: None,
                burst_group_id: None,
                exif: None,
            },
            PhotoItem {
                id: "3".into(),
                path: "/p/_DSC0010.jpg".into(),
                filename: "_DSC0010.jpg".into(),
                file_size: 1000,
                is_raw: false,
                thumb_width: None,
                thumb_height: None,
                burst_group_id: None,
                exif: None,
            },
        ];

        group_bursts(&mut photos);
        assert_eq!(photos[0].burst_group_id.as_deref(), Some("burst:1"));
        assert_eq!(photos[0].burst_group_id, photos[1].burst_group_id);
        assert!(photos[2].burst_group_id.is_none());
    }

    #[test]
    fn test_burst_grouping_with_timestamps() {
        use crate::models::ExifMetadata;

        let mut photos = vec![
            PhotoItem {
                id: "1".into(),
                path: "/p/_DSC0001.ARW".into(),
                filename: "_DSC0001.ARW".into(),
                file_size: 1000,
                is_raw: true,
                thumb_width: None,
                thumb_height: None,
                burst_group_id: None,
                exif: Some(ExifMetadata {
                    date_time_original: Some("2026-08-15 14:30:00".into()),
                    ..Default::default()
                }),
            },
            PhotoItem {
                id: "2".into(),
                path: "/p/_DSC0002.ARW".into(),
                filename: "_DSC0002.ARW".into(),
                file_size: 1000,
                is_raw: true,
                thumb_width: None,
                thumb_height: None,
                burst_group_id: None,
                exif: Some(ExifMetadata {
                    date_time_original: Some("2026-08-15 14:30:01".into()),
                    ..Default::default()
                }),
            },
            PhotoItem {
                id: "3".into(),
                path: "/p/_DSC0003.ARW".into(),
                filename: "_DSC0003.ARW".into(),
                file_size: 1000,
                is_raw: true,
                thumb_width: None,
                thumb_height: None,
                burst_group_id: None,
                exif: Some(ExifMetadata {
                    date_time_original: Some("2026-08-15 15:30:00".into()), // 1 小时后
                    ..Default::default()
                }),
            },
        ];

        group_bursts(&mut photos);
        // Photo 1 与 Photo 2 仅差 1 秒，属于同一连拍组
        assert_eq!(photos[0].burst_group_id.as_deref(), Some("burst:1"));
        assert_eq!(photos[0].burst_group_id, photos[1].burst_group_id);
        // Photo 3 虽编号连续但间隔 1 小时，绝不误成组
        assert!(photos[2].burst_group_id.is_none());
    }

    #[test]
    fn test_severe_blur_is_flagged_for_review() {
        let metrics = ImageMetrics {
            sharpness: 10.0, // 极低锐度
            mean_luminance: 120.0,
            highlight_clipped_pct: 0.0,
            shadow_clipped_pct: 0.0,
            dynamic_range: 200.0,
        };
        let (status, tags) = evaluate_photo_analysis(&metrics, None, 0);
        assert_eq!(status, AnalysisStatus::NeedsCheck);
        assert!(tags.iter().any(|t| t.id == "possible_severe_blur"));
        assert!(tags.iter().all(|tag| tag.category == "warning"));
    }

    #[test]
    fn test_no_obvious_issue_evaluation() {
        let metrics = ImageMetrics {
            sharpness: 180.0, // 高锐度
            mean_luminance: 130.0,
            highlight_clipped_pct: 0.01,
            shadow_clipped_pct: 0.01,
            dynamic_range: 220.0,
        };
        let (status, tags) = evaluate_photo_analysis(&metrics, None, 0);
        assert_eq!(status, AnalysisStatus::NoIssues);
        assert!(tags.iter().any(|t| t.id == "no_obvious_issue"));
        assert!(tags.iter().all(|tag| tag.category == "info"));
    }

    #[test]
    fn test_borderline_sharpness_review_tag() {
        let metrics = ImageMetrics {
            sharpness: 35.0, // 处于 25.0 ~ 45.0 临界合焦过渡带
            mean_luminance: 120.0,
            highlight_clipped_pct: 0.01,
            shadow_clipped_pct: 0.01,
            dynamic_range: 200.0,
        };
        let (status, tags) = evaluate_photo_analysis(&metrics, None, 0);
        assert_eq!(status, AnalysisStatus::NeedsCheck);
        assert!(tags.iter().any(|t| t.id == "review_borderline_sharpness"));
    }

    #[test]
    fn test_scene_aware_photo_analysis() {
        // 1. 测试演唱会模式对舞台暗光微动模糊的适度容差
        let stage_metrics = ImageMetrics {
            sharpness: 20.0, // 在通用模式下应提示人工复核
            mean_luminance: 90.0,
            highlight_clipped_pct: 0.02,
            shadow_clipped_pct: 0.05,
            dynamic_range: 200.0,
        };
        let (general_status, _) =
            evaluate_photo_analysis_with_scene(&stage_metrics, None, 0, WorkflowScene::General);
        assert_eq!(
            general_status,
            AnalysisStatus::NeedsCheck,
            "General mode should flag sharpness 20 for review"
        );

        let (concert_status, concert_tags) =
            evaluate_photo_analysis_with_scene(&stage_metrics, None, 0, WorkflowScene::Concert);
        assert_eq!(
            concert_status,
            AnalysisStatus::NeedsCheck,
            "Concert mode should be lenient with sharpness 20"
        );
        assert!(concert_tags
            .iter()
            .any(|t| t.id == "review_borderline_sharpness"));

        // 2. 测试演唱会对舞台爆闪高光过曝的严格拦截
        let stage_flash_metrics = ImageMetrics {
            sharpness: 90.0,
            mean_luminance: 150.0,
            highlight_clipped_pct: 0.15, // 0.15 > 0.14
            shadow_clipped_pct: 0.0,
            dynamic_range: 255.0,
        };
        let (flash_status, flash_tags) = evaluate_photo_analysis_with_scene(
            &stage_flash_metrics,
            None,
            0,
            WorkflowScene::Concert,
        );
        assert_eq!(flash_status, AnalysisStatus::NeedsCheck);
        assert!(flash_tags
            .iter()
            .any(|t| t.label.contains("舞台爆闪严重死白")));

        // 3. 测试 Cosplay 模式对美瞳眼妆锐度的严格审核
        let cosplay_metrics = ImageMetrics {
            sharpness: 48.0, // < 55.0
            mean_luminance: 120.0,
            highlight_clipped_pct: 0.01,
            shadow_clipped_pct: 0.01,
            dynamic_range: 200.0,
        };
        let (_, cosplay_tags) =
            evaluate_photo_analysis_with_scene(&cosplay_metrics, None, 0, WorkflowScene::Cosplay);
        assert!(cosplay_tags
            .iter()
            .any(|t| t.label.contains("Cosplay美瞳/眼部微软")));
    }

    #[test]
    fn test_burst_grouping_hybrid_with_phash() {
        let p1 = PhotoItem {
            id: "p1".to_string(),
            path: "/path/DSC_0001.JPG".to_string(),
            filename: "DSC_0001.JPG".to_string(),
            file_size: 1000,
            is_raw: false,
            thumb_width: None,
            thumb_height: None,
            burst_group_id: None,
            exif: Some(crate::models::ExifMetadata {
                date_time_original: Some("2026-09-09 10:00:00".to_string()),
                ..Default::default()
            }),
        };
        // p2: 拍摄时间在 1 秒后，但在视觉上与 p1 完全不同 (汉明距离 20)
        let p2 = PhotoItem {
            id: "p2".to_string(),
            path: "/path/DSC_0002.JPG".to_string(),
            filename: "DSC_0002.JPG".to_string(),
            file_size: 1000,
            is_raw: false,
            thumb_width: None,
            thumb_height: None,
            burst_group_id: None,
            exif: Some(crate::models::ExifMetadata {
                date_time_original: Some("2026-09-09 10:00:01".to_string()),
                ..Default::default()
            }),
        };
        // p3: 拍摄时间在 8 秒后 (超过默认 2 秒)，但与 p1 视觉高度相似 (汉明距离 4)
        let p3 = PhotoItem {
            id: "p3".to_string(),
            path: "/path/DSC_0003.JPG".to_string(),
            filename: "DSC_0003.JPG".to_string(),
            file_size: 1000,
            is_raw: false,
            thumb_width: None,
            thumb_height: None,
            burst_group_id: None,
            exif: Some(crate::models::ExifMetadata {
                date_time_original: Some("2026-09-09 10:00:08".to_string()),
                ..Default::default()
            }),
        };

        let hash_a: u64 =
            0b1111_0000_1111_0000_1111_0000_1111_0000_1111_0000_1111_0000_1111_0000_1111_0000;
        let hash_diff: u64 =
            0b0000_1111_0000_1111_0000_1111_0000_1111_0000_1111_0000_1111_0000_1111_0000_1111; // 汉明距离 64
        let hash_similar: u64 = hash_a ^ 0b0011; // 汉明距离 2

        // 1. 即使拍摄间隔仅 1 秒，若汉明距离 >= 14，应防误判拆分，不视作连拍
        let split_by_visual = are_photos_burst_consecutive_hybrid(
            &p2,
            &p1,
            Some(2),
            Some(1),
            Some(hash_diff),
            Some(hash_a),
        );
        assert!(
            !split_by_visual,
            "视觉截然不同的两张图即使相差 1 秒也不应合并"
        );

        // 2. 拍摄间隔 8 秒 (大于默认 2 秒)，但汉明距离很低 (2 <= 8)，应成功识别并成组
        let grouped_by_visual = are_photos_burst_consecutive_hybrid(
            &p3,
            &p1,
            Some(3),
            Some(1),
            Some(hash_similar),
            Some(hash_a),
        );
        assert!(
            grouped_by_visual,
            "视觉高度相似的照片在 15 秒窗口内应成功成组"
        );
    }
}
