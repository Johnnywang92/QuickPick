use crate::models::{DefectTag, FaceInfo, WorkflowScene};
use image::{DynamicImage, GenericImageView};

/// 计算人脸的严格归一化优先级
///
/// 公式: Priority = 10 * IsPinned + 5 * NormArea - 2 * NormDist
/// - NormArea = (w * h) / (W * H) ∈ [0, 1]
/// - NormDist = sqrt((cx - W/2)^2 + (cy - H/2)^2) / (0.5 * D) ∈ [0, 1]
pub fn calculate_face_priority(face: &FaceInfo, img_width: f32, img_height: f32) -> f32 {
    let w = if img_width <= 0.0 { 1920.0 } else { img_width };
    let h = if img_height <= 0.0 {
        1080.0
    } else {
        img_height
    };
    let diag = (w * w + h * h).sqrt();

    // 归一化面积 (因为 face.width, face.height 本身已经是 0.0~1.0 归一化值)
    let norm_area = (face.width * face.height).clamp(0.0, 1.0);

    // 中心点像素坐标
    let cx = (face.x + face.width / 2.0) * w;
    let cy = (face.y + face.height / 2.0) * h;

    let center_x = w / 2.0;
    let center_y = h / 2.0;
    let dist_to_center = ((cx - center_x).powi(2) + (cy - center_y).powi(2)).sqrt();
    let max_dist = 0.5 * diag;
    let norm_dist = if max_dist > 0.0 {
        (dist_to_center / max_dist).clamp(0.0, 1.0)
    } else {
        0.0
    };

    let pin_score = if face.is_pinned { 10.0 } else { 0.0 };
    pin_score + 5.0 * norm_area - 2.0 * norm_dist
}

/// 对所有人脸重新计算 Priority，并按优先级降序排序
/// 返回 (Top 6 关键人脸, 剩余背景人脸)
pub fn sort_and_truncate_faces(
    mut faces: Vec<FaceInfo>,
    img_width: f32,
    img_height: f32,
    max_top: usize,
) -> (Vec<FaceInfo>, Vec<FaceInfo>) {
    for face in &mut faces {
        face.priority = calculate_face_priority(face, img_width, img_height);
    }

    // 优先级降序排序
    faces.sort_by(|a, b| {
        b.priority
            .partial_cmp(&a.priority)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    if faces.len() <= max_top {
        (faces, Vec::new())
    } else {
        let background = faces.split_off(max_top);
        (faces, background)
    }
}

/// 连拍组主角钉选状态继承 (Burst Pinning Inheritance)
/// 根据与上一帧已钉选人脸在归一化坐标系下的欧式几何距离进行追踪匹配
pub fn inherit_pinned_faces(current_faces: &mut [FaceInfo], previous_pinned_faces: &[FaceInfo]) {
    if previous_pinned_faces.is_empty() {
        return;
    }

    const MATCH_DISTANCE_THRESHOLD: f32 = 0.18; // 归一化位移容差

    for pinned in previous_pinned_faces {
        let pinned_cx = pinned.x + pinned.width / 2.0;
        let pinned_cy = pinned.y + pinned.height / 2.0;

        let mut best_match_idx: Option<usize> = None;
        let mut min_dist = f32::MAX;

        for (idx, face) in current_faces.iter().enumerate() {
            let fcx = face.x + face.width / 2.0;
            let fcy = face.y + face.height / 2.0;
            let dist = ((fcx - pinned_cx).powi(2) + (fcy - pinned_cy).powi(2)).sqrt();

            if dist < MATCH_DISTANCE_THRESHOLD && dist < min_dist {
                min_dist = dist;
                best_match_idx = Some(idx);
            }
        }

        if let Some(matched) = best_match_idx {
            current_faces[matched].is_pinned = true;
            if current_faces[matched].label.is_none() {
                current_faces[matched].label = pinned.label.clone();
            }
        }
    }
}

/// 大合影全员睁眼一票否决检测（场景感知版本）
/// 若存在任何人（包括 Top 6 或背景未上榜人物）眼睛开合度 < 0.35，生成诊断警告
pub fn evaluate_group_eyes_with_scene(
    all_faces: &[FaceInfo],
    scene: WorkflowScene,
) -> Option<DefectTag> {
    // 演唱会模式下，单人或双人特写允许闭眼深情演唱，不视为大合影闭眼缺陷
    if scene == WorkflowScene::Concert && all_faces.len() <= 2 {
        return None;
    }

    let closed_faces: Vec<&FaceInfo> = all_faces
        .iter()
        .filter(|f| f.eye_open_score < 0.35)
        .collect();

    if closed_faces.is_empty() {
        return None;
    }

    let count = closed_faces.len();
    let first_face = closed_faces[0];
    let label_str = first_face
        .label
        .clone()
        .unwrap_or_else(|| format!("人物 #{}", first_face.id));

    let (label_prefix, confidence) = match scene {
        WorkflowScene::Conference => ("商务大合影闭眼警告", 0.98),
        WorkflowScene::Wedding => ("大合影闭眼待拯救", 0.92),
        _ => ("大合影闭眼", 0.92),
    };

    Some(DefectTag {
        id: "group_photo_blink".to_string(),
        category: "warning".to_string(),
        label: format!("{} ({}人)", label_prefix, count),
        confidence,
        hint: Some(format!(
            "检测到 [{}] 等 {} 位人物闭眼，建议调出同组连拍使用 Face Loupe 进行眼神替换",
            label_str, count
        )),
    })
}

/// 保持向后兼容的标准大合影闭眼判定
pub fn evaluate_group_eyes(all_faces: &[FaceInfo]) -> Option<DefectTag> {
    evaluate_group_eyes_with_scene(all_faces, WorkflowScene::General)
}

/// 评估多人合影或双人合照中的睁闭眼分歧冲突（场景感知版本）
pub fn evaluate_group_eye_conflict_with_scene(
    all_faces: &[FaceInfo],
    scene: WorkflowScene,
) -> Option<DefectTag> {
    // 演唱会模式下，单人或双人特写允许闭眼投入演出，不属于合影分歧
    if scene == WorkflowScene::Concert && all_faces.len() <= 2 {
        return None;
    }

    if all_faces.len() < 2 {
        return None;
    }
    let closed_count = all_faces.iter().filter(|f| f.eye_open_score < 0.35).count();
    let open_count = all_faces
        .iter()
        .filter(|f| f.eye_open_score >= 0.70)
        .count();

    if closed_count > 0 && open_count > 0 {
        let confidence = match scene {
            WorkflowScene::Conference => 0.95,
            WorkflowScene::Concert => 0.65,
            _ => 0.88,
        };

        Some(DefectTag {
            id: "review_group_blink_conflict".to_string(),
            category: "warning".to_string(),
            label: format!("合影闭眼分歧 ({}闭/{}睁)", closed_count, open_count),
            confidence,
            hint: Some(format!(
                "合影中 {} 人闭眼但 {} 人神态极佳，属于典型争议片，建议人工裁决或通过连拍换脸拯救",
                closed_count, open_count
            )),
        })
    } else {
        None
    }
}

/// 保持向后兼容的标准分歧判定
pub fn evaluate_group_eye_conflict(all_faces: &[FaceInfo]) -> Option<DefectTag> {
    evaluate_group_eye_conflict_with_scene(all_faces, WorkflowScene::General)
}

/// 轻量化人脸特征区域提取（基于 YCbCr 肤色聚类与眼部高反差区域）
/// 无需外部庞大网络权重，100% 离线、跨平台且毫秒级响应
pub fn detect_faces_heuristic(img: &DynamicImage) -> Vec<FaceInfo> {
    let (width, height) = img.dimensions();
    if width < 50 || height < 50 {
        return Vec::new();
    }

    let rgb = img.to_rgb8();
    let step = (width.max(height) / 120).max(2);

    // 寻找潜在的人脸中心点
    let mut skin_points: Vec<(u32, u32)> = Vec::new();

    for y in (0..height).step_by(step as usize) {
        for x in (0..width).step_by(step as usize) {
            let p = rgb.get_pixel(x, y);
            let r = p[0] as f32;
            let g = p[1] as f32;
            let b = p[2] as f32;

            // YCbCr 转换
            let y_val = 0.299 * r + 0.587 * g + 0.114 * b;
            let cb = 128.0 - 0.168736 * r - 0.331264 * g + 0.5 * b;
            let cr = 128.0 + 0.5 * r - 0.418688 * g - 0.081312 * b;

            // 亚洲人与常见人像肤色区间标准
            if y_val > 60.0 && (85.0..=135.0).contains(&cb) && (135.0..=180.0).contains(&cr) {
                skin_points.push((x, y));
            }
        }
    }

    if skin_points.is_empty() {
        return Vec::new();
    }

    // 聚类找出人脸中心区域 (简化连通域聚类)
    let cluster_radius = (width.min(height) as f32 * 0.15) as u32;
    let mut clusters: Vec<(u32, u32, u32)> = Vec::new(); // (center_x, center_y, count)

    for (px, py) in skin_points {
        let mut merged = false;
        for c in &mut clusters {
            let dx = (c.0 as i32 - px as i32).unsigned_abs();
            let dy = (c.1 as i32 - py as i32).unsigned_abs();
            if dx < cluster_radius && dy < cluster_radius {
                c.0 = (c.0 * c.2 + px) / (c.2 + 1);
                c.1 = (c.1 * c.2 + py) / (c.2 + 1);
                c.2 += 1;
                merged = true;
                break;
            }
        }
        if !merged && clusters.len() < 12 {
            clusters.push((px, py, 1));
        }
    }

    // 过滤掉杂散像素点过少的伪人脸
    let min_points = (step * step).max(4);
    let valid_clusters: Vec<_> = clusters.into_iter().filter(|c| c.2 >= min_points).collect();

    let mut faces = Vec::new();
    let gray = img.to_luma8();

    for (idx, (cx, cy, _count)) in valid_clusters.iter().enumerate() {
        let face_size = (width.min(height) as f32 * 0.16).clamp(40.0, 300.0) as u32;
        let x0 = cx.saturating_sub(face_size / 2);
        let y0 = cy.saturating_sub(face_size / 2);
        let w = face_size.min(width - x0);
        let h = face_size.min(height - y0);

        if w < 30 || h < 30 {
            continue;
        }

        // 计算该人脸区域内的眼睛睁闭度近似 (上半部 1/4 ~ 1/2 区域的瞳孔反差)
        let eye_y_start = y0 + h / 5;
        let eye_y_end = y0 + (h * 3) / 5;
        let eye_x_start = x0 + w / 5;
        let eye_x_end = x0 + (w * 4) / 5;

        let mut dark_pixels = 0;
        let mut total_eye_pixels = 0;
        let mut lap_sum = 0.0f32;

        for ey in eye_y_start..eye_y_end.min(height - 1) {
            for ex in eye_x_start..eye_x_end.min(width - 1) {
                let p = gray.get_pixel(ex, ey)[0];
                if p < 65 {
                    dark_pixels += 1;
                }
                total_eye_pixels += 1;

                // 局部锐度
                let c = p as f32;
                let up = gray.get_pixel(ex, ey.saturating_sub(1))[0] as f32;
                let dn = gray.get_pixel(ex, (ey + 1).min(height - 1))[0] as f32;
                let lf = gray.get_pixel(ex.saturating_sub(1), ey)[0] as f32;
                let rt = gray.get_pixel((ex + 1).min(width - 1), ey)[0] as f32;
                lap_sum += (4.0 * c - up - dn - lf - rt).abs();
            }
        }

        let eye_open_score = if total_eye_pixels > 0 {
            let dark_ratio = dark_pixels as f32 / total_eye_pixels as f32;
            // 瞳孔与睫毛黑色像素占比在 4%~15% 为正常睁眼；低于 2% 或过暗为闭眼/阴影
            if dark_ratio > 0.03 && dark_ratio < 0.20 {
                (0.65 + (dark_ratio - 0.03) * 3.0).clamp(0.65, 0.98)
            } else if dark_ratio <= 0.02 {
                0.20 // 闭眼
            } else {
                0.70
            }
        } else {
            0.85
        };

        let face_sharpness = if total_eye_pixels > 0 {
            (lap_sum / total_eye_pixels as f32 * 5.0).clamp(10.0, 100.0)
        } else {
            80.0
        };

        let norm_x = x0 as f32 / width as f32;
        let norm_y = y0 as f32 / height as f32;
        let norm_w = w as f32 / width as f32;
        let norm_h = h as f32 / height as f32;

        let face = FaceInfo {
            id: format!("face_{}", idx + 1),
            x: norm_x,
            y: norm_y,
            width: norm_w,
            height: norm_h,
            eye_open_score,
            sharpness: face_sharpness,
            is_pinned: false,
            priority: 0.0,
            label: Some(format!("人物 #{}", idx + 1)),
        };

        faces.push(face);
    }

    faces
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_face_priority_normalization() {
        let img_w = 6000.0;
        let img_h = 4000.0;

        // 中心大脸 (未钉选)
        let center_large_face = FaceInfo {
            id: "f1".to_string(),
            x: 0.4,
            y: 0.4,
            width: 0.2,
            height: 0.2,
            eye_open_score: 0.95,
            sharpness: 90.0,
            is_pinned: false,
            priority: 0.0,
            label: None,
        };

        // 边缘小脸 (未钉选)
        let edge_small_face = FaceInfo {
            id: "f2".to_string(),
            x: 0.05,
            y: 0.05,
            width: 0.05,
            height: 0.05,
            eye_open_score: 0.90,
            sharpness: 80.0,
            is_pinned: false,
            priority: 0.0,
            label: None,
        };

        let p1 = calculate_face_priority(&center_large_face, img_w, img_h);
        let p2 = calculate_face_priority(&edge_small_face, img_w, img_h);

        // 中心大脸的优先级必须显著高于边缘小脸
        assert!(
            p1 > p2,
            "Center large face should have higher priority than edge small face"
        );

        // 若边缘小脸被摄影师手动钉选 (IsPinned = true)，其优先级应由于 +10 权重反超中心脸
        let mut pinned_small_face = edge_small_face.clone();
        pinned_small_face.is_pinned = true;
        let p_pinned = calculate_face_priority(&pinned_small_face, img_w, img_h);
        assert!(p_pinned > p1, "Pinned face should have dominant priority");
    }

    #[test]
    fn test_face_top6_truncation() {
        let img_w = 4000.0;
        let img_h = 3000.0;

        // 模拟大合影 10 个人脸
        let mut faces = Vec::new();
        for i in 0..10 {
            faces.push(FaceInfo {
                id: format!("face_{}", i + 1),
                x: 0.1 * (i as f32),
                y: 0.3,
                width: 0.08,
                height: 0.08,
                eye_open_score: if i == 7 { 0.15 } else { 0.92 }, // 第 8 个人闭眼
                sharpness: 85.0,
                is_pinned: i == 0, // 第 1 个人钉选
                priority: 0.0,
                label: None,
            });
        }

        let (top6, background) = sort_and_truncate_faces(faces.clone(), img_w, img_h, 6);
        assert_eq!(top6.len(), 6, "Top 6 faces should strictly have 6 items");
        assert_eq!(
            background.len(),
            4,
            "Remaining background faces should have 4 items"
        );

        // 钉选主角必须在 Top 1
        assert!(top6[0].is_pinned, "Pinned face must be ranked #1");

        // 闭眼检测
        let blink_tag = evaluate_group_eyes(&faces);
        assert!(blink_tag.is_some(), "Should detect closed eye in group");
        assert_eq!(blink_tag.unwrap().id, "group_photo_blink");
    }

    #[test]
    fn test_burst_pinned_inheritance() {
        // 第一张底片：摄影师钉选了新娘 (在坐标 x: 0.3, y: 0.4)
        let prev_pinned = vec![FaceInfo {
            id: "bride_f1".to_string(),
            x: 0.30,
            y: 0.40,
            width: 0.15,
            height: 0.15,
            eye_open_score: 0.95,
            sharpness: 95.0,
            is_pinned: true,
            priority: 10.0,
            label: Some("新娘主角".to_string()),
        }];

        // 连拍第二张底片：人物因微动位于 (x: 0.31, y: 0.41)
        let mut next_faces = vec![
            FaceInfo {
                id: "f_other".to_string(),
                x: 0.70,
                y: 0.40,
                width: 0.15,
                height: 0.15,
                eye_open_score: 0.90,
                sharpness: 85.0,
                is_pinned: false,
                priority: 0.0,
                label: None,
            },
            FaceInfo {
                id: "f_bride_next".to_string(),
                x: 0.31,
                y: 0.41,
                width: 0.15,
                height: 0.15,
                eye_open_score: 0.96,
                sharpness: 94.0,
                is_pinned: false,
                priority: 0.0,
                label: None,
            },
        ];

        inherit_pinned_faces(&mut next_faces, &prev_pinned);

        assert!(
            next_faces[1].is_pinned,
            "Closest face in next burst frame should inherit pinned state"
        );
        assert_eq!(next_faces[1].label.as_deref(), Some("新娘主角"));
        assert!(
            !next_faces[0].is_pinned,
            "Unrelated face should remain unpinned"
        );
    }

    #[test]
    fn test_group_eye_conflict_evaluation() {
        let faces = vec![
            FaceInfo {
                id: "f1".to_string(),
                x: 0.2,
                y: 0.3,
                width: 0.1,
                height: 0.1,
                eye_open_score: 0.95, // 极佳睁眼
                sharpness: 90.0,
                is_pinned: false,
                priority: 1.0,
                label: None,
            },
            FaceInfo {
                id: "f2".to_string(),
                x: 0.5,
                y: 0.3,
                width: 0.1,
                height: 0.1,
                eye_open_score: 0.15, // 闭眼
                sharpness: 88.0,
                is_pinned: false,
                priority: 1.0,
                label: None,
            },
        ];

        let tag = evaluate_group_eye_conflict(&faces);
        assert!(tag.is_some());
        let t = tag.unwrap();
        assert_eq!(t.id, "review_group_blink_conflict");
        assert!(t.label.contains("合影闭眼分歧"));
    }

    #[test]
    fn test_scene_aware_eye_evaluations() {
        let solo_singer = vec![FaceInfo {
            id: "singer".to_string(),
            x: 0.4,
            y: 0.3,
            width: 0.2,
            height: 0.2,
            eye_open_score: 0.10, // 深情闭眼
            sharpness: 90.0,
            is_pinned: true,
            priority: 10.0,
            label: Some("主唱".to_string()),
        }];

        // 演唱会模式：单人闭眼应被放行，不报警大合影闭眼
        let concert_tag = evaluate_group_eyes_with_scene(&solo_singer, WorkflowScene::Concert);
        assert!(
            concert_tag.is_none(),
            "Concert solo singer closed eyes should be allowed"
        );

        // 商业会议模式：大合影闭眼应有极高置信度警告
        let conf_faces = vec![
            FaceInfo {
                id: "vip1".to_string(),
                x: 0.2,
                y: 0.3,
                width: 0.1,
                height: 0.1,
                eye_open_score: 0.95,
                sharpness: 90.0,
                is_pinned: false,
                priority: 1.0,
                label: None,
            },
            FaceInfo {
                id: "vip2".to_string(),
                x: 0.5,
                y: 0.3,
                width: 0.1,
                height: 0.1,
                eye_open_score: 0.20,
                sharpness: 88.0,
                is_pinned: false,
                priority: 1.0,
                label: None,
            },
            FaceInfo {
                id: "vip3".to_string(),
                x: 0.8,
                y: 0.3,
                width: 0.1,
                height: 0.1,
                eye_open_score: 0.90,
                sharpness: 91.0,
                is_pinned: false,
                priority: 1.0,
                label: None,
            },
        ];
        let conf_tag = evaluate_group_eyes_with_scene(&conf_faces, WorkflowScene::Conference);
        assert!(conf_tag.is_some());
        let t = conf_tag.unwrap();
        assert!(t.label.contains("商务大合影"));
        assert_eq!(t.confidence, 0.98);
    }
}
