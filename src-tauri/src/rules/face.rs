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
        .filter(|f| f.eye_open_score < 0.40)
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

    if all_faces.len() == 1 {
        Some(DefectTag {
            id: "portrait_photo_blink".to_string(),
            category: "warning".to_string(),
            label: "可能闭眼".to_string(),
            confidence: 0.90,
            hint: Some(format!(
                "检测到核心人物 [{}] 疑似闭眼或微闭，建议复核或从连拍中挑选最佳瞬间",
                label_str
            )),
        })
    } else {
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

#[derive(Debug, Clone, Copy, Default)]
struct RegionStats {
    mean: f32,
    std_dev: f32,
    min_val: u8,
    contrast: f32,
    horiz_grad: f32,
    vert_grad: f32,
    count: usize,
}

fn compute_gray_region_stats(
    gray: &image::GrayImage,
    x0: u32,
    x1: u32,
    y0: u32,
    y1: u32,
) -> RegionStats {
    let w = gray.width();
    let h = gray.height();
    let x_start = x0.min(w.saturating_sub(1));
    let x_end = x1.min(w);
    let y_start = y0.min(h.saturating_sub(1));
    let y_end = y1.min(h);

    if x_end <= x_start || y_end <= y_start {
        return RegionStats::default();
    }

    let mut sum: f64 = 0.0;
    let mut sum_sq: f64 = 0.0;
    let mut min_val: u8 = 255;
    let mut max_val: u8 = 0;
    let mut h_grad_sum: f64 = 0.0;
    let mut v_grad_sum: f64 = 0.0;
    let mut count: usize = 0;

    for y in y_start..y_end {
        for x in x_start..x_end {
            let p = gray.get_pixel(x, y)[0];
            let pf = p as f64;
            sum += pf;
            sum_sq += pf * pf;
            if p < min_val {
                min_val = p;
            }
            if p > max_val {
                max_val = p;
            }
            let up = gray.get_pixel(x, y.saturating_sub(1))[0] as f64;
            let dn = gray.get_pixel(x, (y + 1).min(h - 1))[0] as f64;
            let lf = gray.get_pixel(x.saturating_sub(1), y)[0] as f64;
            let rt = gray.get_pixel((x + 1).min(w - 1), y)[0] as f64;
            // 水平边缘能量（横向眼线/眉线带来垂直方向差分 |dn - up|）
            h_grad_sum += (dn - up).abs();
            // 垂直边缘能量（瞳孔左右边界带来水平方向差分 |rt - lf|）
            v_grad_sum += (rt - lf).abs();
            count += 1;
        }
    }

    if count == 0 {
        return RegionStats::default();
    }

    let mean = (sum / count as f64) as f32;
    let variance = (sum_sq / count as f64) - (mean as f64 * mean as f64);
    let std_dev = variance.max(0.0).sqrt() as f32;
    let contrast = max_val.saturating_sub(min_val) as f32;

    RegionStats {
        mean,
        std_dev,
        min_val,
        contrast,
        horiz_grad: (h_grad_sum / count as f64) as f32,
        vert_grad: (v_grad_sum / count as f64) as f32,
        count,
    }
}

/// 判断单个 RGB 像素是否符合真实人类肤色色度与饱和度约束
#[inline]
fn is_human_skin_pixel(r: f32, g: f32, b: f32) -> bool {
    let y_val = 0.299 * r + 0.587 * g + 0.114 * b;
    let cb = 128.0 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    let cr = 128.0 + 0.5 * r - 0.418688 * g - 0.081312 * b;

    // 排除过暗阴影、过曝高光、灰白墙面、暖黄木地板与过饱和红橙色物体
    (72.0..=235.0).contains(&y_val)
        && (96.0..=124.0).contains(&cb)
        && (138.0..=168.0).contains(&cr)
        && r > g
        && g >= b * 0.85
        && (10.0..=75.0).contains(&(r - g))
        && (22.0..=115.0).contains(&(r - b))
}

/// 轻量化人脸特征区域提取（基于肤色聚类、五官几何对称验证与眼部反差）
/// 仅在通过真实五官解剖结构验证的人脸上计算眼部开合度 (0.0 完全闭眼 ~ 1.0 充分睁眼)
fn analyze_eye_region(
    gray: &image::GrayImage,
    x0: u32,
    x1: u32,
    y0: u32,
    y1: u32,
    cheek_mean: f32,
) -> f32 {
    let stats = compute_gray_region_stats(gray, x0, x1, y0, y1);
    if stats.count < 9 {
        return 0.85;
    }

    // 若眼部区域几乎无反差（平滑色块），不应误判为闭眼
    if stats.contrast < 22.0 || stats.std_dev < 6.5 {
        return 0.85;
    }

    // 睁眼：同时具备深色瞳孔、浅色巩膜（眼白）以及明显的水平+垂直梯度
    // 闭眼：仅有横向睫毛/眼线折痕（水平边缘占主导，垂直方向梯度弱、局部标准差较低）
    let dark_drop = (cheek_mean - stats.min_val as f32).max(0.0);
    let vert_to_horiz = if stats.horiz_grad > 1.0 {
        stats.vert_grad / stats.horiz_grad
    } else {
        1.0
    };

    if stats.contrast >= 45.0 && stats.std_dev >= 13.0 && vert_to_horiz >= 0.55 {
        let factor = ((stats.contrast - 45.0) / 45.0).clamp(0.0, 1.0);
        (0.75 + factor * 0.22).clamp(0.75, 0.98)
    } else if stats.contrast < 36.0 && stats.std_dev < 11.5 && dark_drop >= 20.0 {
        // 存在睫毛暗线但缺少睁眼眼白高反差与瞳孔垂直边缘 -> 闭眼
        let factor = ((stats.contrast - 22.0) / 14.0).clamp(0.0, 1.0);
        (0.15 + factor * 0.18).clamp(0.15, 0.34)
    } else if stats.std_dev < 13.0 || vert_to_horiz < 0.45 {
        // 半睁或微闭
        0.52
    } else {
        0.82
    }
}

pub fn detect_faces_heuristic(img: &DynamicImage) -> Vec<FaceInfo> {
    let (width, height) = img.dimensions();
    if width < 64 || height < 64 {
        return Vec::new();
    }

    // 优先零拷贝借用底层 Rgb8 缓冲区（JPEG 解码默认即为 Rgb8，避免每次克隆数兆字节内存）
    let rgb: std::borrow::Cow<'_, image::RgbImage> = match img.as_rgb8() {
        Some(buf) => std::borrow::Cow::Borrowed(buf),
        None => std::borrow::Cow::Owned(img.to_rgb8()),
    };
    let step = (width.max(height) / 120).max(2);

    // 1. 寻找潜在的肤色采样点并统计全局肤色占比
    let mut skin_points: Vec<(u32, u32)> = Vec::new();
    let mut total_sampled: usize = 0;

    for y in (0..height).step_by(step as usize) {
        for x in (0..width).step_by(step as usize) {
            total_sampled += 1;
            let p = rgb.get_pixel(x, y);
            if is_human_skin_pixel(p[0] as f32, p[1] as f32, p[2] as f32) {
                skin_points.push((x, y));
            }
        }
    }

    if skin_points.is_empty() || total_sampled == 0 {
        return Vec::new();
    }

    // 若整张照片超过 42% 都是同一暖色调（如暖黄墙壁、木桌面、日落、沙漠），说明是环境色温而非人脸
    if (skin_points.len() as f32 / total_sampled as f32) > 0.42 {
        return Vec::new();
    }

    // 2. 连通聚类并记录每个簇的真实边界框 (cx, cy, count, min_x, max_x, min_y, max_y)
    let cluster_radius = (width.min(height) as f32 * 0.09).max((step * 3) as f32) as u32;
    let mut clusters: Vec<(u32, u32, u32, u32, u32, u32, u32)> = Vec::new();

    for (px, py) in skin_points {
        let mut merged = false;
        for c in &mut clusters {
            let near_x = px >= c.3.saturating_sub(cluster_radius) && px <= c.4 + cluster_radius;
            let near_y = py >= c.5.saturating_sub(cluster_radius) && py <= c.6 + cluster_radius;
            if near_x && near_y {
                c.0 = (c.0 * c.2 + px) / (c.2 + 1);
                c.1 = (c.1 * c.2 + py) / (c.2 + 1);
                c.2 += 1;
                c.3 = c.3.min(px);
                c.4 = c.4.max(px);
                c.5 = c.5.min(py);
                c.6 = c.6.max(py);
                merged = true;
                break;
            }
        }
        if !merged && clusters.len() < 16 {
            clusters.push((px, py, 1, px, px, py, py));
        }
    }

    let min_face_dim = (width.min(height) / 16).max(36);
    // 延迟按需生成灰度图：仅当存在通过几何与边界隔离检验的候选人脸簇时才转换灰度，非人像照片零灰度转换开销
    let mut gray_opt: Option<image::GrayImage> = None;
    let mut faces = Vec::new();

    for (_cx, _cy, count, min_x, max_x, min_y, max_y) in clusters {
        let bw = max_x.saturating_sub(min_x);
        let bh = max_y.saturating_sub(min_y);

        // 过滤尺寸过小或过大（背景墙/柜子/地面）的色块
        if bw < min_face_dim || bh < min_face_dim {
            continue;
        }
        if bw > (width * 48) / 100 || bh > (height * 58) / 100 {
            continue;
        }

        // 人脸高宽比校验：排除细长木条、桌沿、帽檐等非人脸几何形状
        let aspect = bw as f32 / bh as f32;
        if !(0.58..=1.28).contains(&aspect) {
            continue;
        }

        // 簇内肤色填充密度校验
        let grid_w = (bw / step) + 1;
        let grid_h = (bh / step) + 1;
        let expected_cells = (grid_w * grid_h).max(1);
        let fill_ratio = count as f32 / expected_cells as f32;
        if !(0.40..=0.92).contains(&fill_ratio) {
            continue;
        }

        let x0 = min_x;
        let y0 = min_y;
        let w = bw.min(width - x0);
        let h = bh.min(height - y0);
        if w < 36 || h < 36 {
            continue;
        }

        // 3. 头部边界隔离校验：真实人脸顶部（发际线/背景）与左右外侧不应也是连续同色背景墙
        let border_margin_x = (w / 5).max(step * 2);
        let border_margin_y = (h / 5).max(step * 2);
        let outer_x0 = x0.saturating_sub(border_margin_x);
        let outer_x1 = (x0 + w + border_margin_x).min(width);
        let outer_y0 = y0.saturating_sub(border_margin_y);
        let outer_y1 = (y0 + h).min(height);

        let mut outer_total = 0usize;
        let mut outer_skin = 0usize;
        for sy in (outer_y0..outer_y1).step_by(step as usize) {
            for sx in (outer_x0..outer_x1).step_by(step as usize) {
                let inside = sx >= x0 && sx <= x0 + w && sy >= y0 && sy <= y0 + h;
                if !inside {
                    outer_total += 1;
                    let p = rgb.get_pixel(sx, sy);
                    if is_human_skin_pixel(p[0] as f32, p[1] as f32, p[2] as f32) {
                        outer_skin += 1;
                    }
                }
            }
        }
        if outer_total >= 6 && (outer_skin as f32 / outer_total as f32) > 0.40 {
            continue;
        }

        let gray = gray_opt.get_or_insert_with(|| img.to_luma8());

        // 4. 五官解剖结构验证（双眼对称暗区 + 鼻梁亮区 + 双颊平滑肤色 + 嘴部横向纹理）
        let eye_y_start = y0 + (h * 26) / 100;
        let eye_y_end = y0 + (h * 48) / 100;
        let left_eye_x0 = x0 + (w * 16) / 100;
        let left_eye_x1 = x0 + (w * 43) / 100;
        let right_eye_x0 = x0 + (w * 57) / 100;
        let right_eye_x1 = x0 + (w * 84) / 100;

        let nose_x0 = x0 + (w * 43) / 100;
        let nose_x1 = x0 + (w * 57) / 100;

        let cheek_y_start = y0 + (h * 52) / 100;
        let cheek_y_end = y0 + (h * 70) / 100;
        let mouth_y_start = y0 + (h * 72) / 100;
        let mouth_y_end = y0 + (h * 88) / 100;
        let mouth_x0 = x0 + (w * 30) / 100;
        let mouth_x1 = x0 + (w * 70) / 100;

        let left_eye =
            compute_gray_region_stats(gray, left_eye_x0, left_eye_x1, eye_y_start, eye_y_end);
        let right_eye =
            compute_gray_region_stats(gray, right_eye_x0, right_eye_x1, eye_y_start, eye_y_end);
        let nose_bridge =
            compute_gray_region_stats(gray, nose_x0, nose_x1, eye_y_start, eye_y_end);
        let left_cheek =
            compute_gray_region_stats(gray, left_eye_x0, left_eye_x1, cheek_y_start, cheek_y_end);
        let right_cheek = compute_gray_region_stats(
            gray,
            right_eye_x0,
            right_eye_x1,
            cheek_y_start,
            cheek_y_end,
        );
        let mouth =
            compute_gray_region_stats(gray, mouth_x0, mouth_x1, mouth_y_start, mouth_y_end);

        if left_eye.count < 9
            || right_eye.count < 9
            || left_cheek.count < 9
            || right_cheek.count < 9
            || mouth.count < 9
        {
            continue;
        }

        let cheek_mean = (left_cheek.mean + right_cheek.mean) * 0.5;
        let cheek_horiz_grad = (left_cheek.horiz_grad + right_cheek.horiz_grad) * 0.5;
        let eye_horiz_grad = (left_eye.horiz_grad + right_eye.horiz_grad) * 0.5;

        // (a) 双眼/眉区必须具备明显的暗部特征（瞳孔/睫毛/眉毛），显著暗于脸颊与鼻梁
        let left_dark_drop = left_cheek.mean - left_eye.min_val as f32;
        let right_dark_drop = right_cheek.mean - right_eye.min_val as f32;
        let nose_left_drop = nose_bridge.mean - left_eye.min_val as f32;
        let nose_right_drop = nose_bridge.mean - right_eye.min_val as f32;
        if left_dark_drop < 24.0
            || right_dark_drop < 24.0
            || nose_left_drop < 16.0
            || nose_right_drop < 16.0
        {
            continue;
        }

        // (b) 眼窝整体平均亮度应低于脸颊平均亮度，且具备真实的边缘反差
        if left_eye.mean + 4.0 >= left_cheek.mean || right_eye.mean + 4.0 >= right_cheek.mean {
            continue;
        }
        if left_eye.contrast < 24.0
            || right_eye.contrast < 24.0
            || left_eye.std_dev < 7.0
            || right_eye.std_dev < 7.0
        {
            continue;
        }

        // (c) 左右眼与左右脸颊必须满足双侧对称性
        if (left_eye.mean - right_eye.mean).abs() > 22.0
            || (left_cheek.mean - right_cheek.mean).abs() > 22.0
            || (left_eye.contrast - right_eye.contrast).abs() > 35.0
        {
            continue;
        }

        // (d) 眼部横向边缘梯度应显著高于平滑脸颊，且嘴部同样存在暗部唇线反差
        if eye_horiz_grad < cheek_horiz_grad * 1.25
            || (cheek_mean - mouth.min_val as f32) < 14.0
        {
            continue;
        }

        let left_score = analyze_eye_region(
            gray,
            left_eye_x0,
            left_eye_x1,
            eye_y_start,
            eye_y_end,
            left_cheek.mean,
        );
        let right_score = analyze_eye_region(
            gray,
            right_eye_x0,
            right_eye_x1,
            eye_y_start,
            eye_y_end,
            right_cheek.mean,
        );
        let eye_open_score = left_score.min(right_score);

        // 局部眼部锐度检测
        let mut lap_sum = 0.0f32;
        let mut total_eye_pixels = 0usize;

        for ey in eye_y_start..eye_y_end.min(height - 1) {
            for ex in left_eye_x0..right_eye_x1.min(width - 1) {
                let c = gray.get_pixel(ex, ey)[0] as f32;
                let up = gray.get_pixel(ex, ey.saturating_sub(1))[0] as f32;
                let dn = gray.get_pixel(ex, (ey + 1).min(height - 1))[0] as f32;
                let lf = gray.get_pixel(ex.saturating_sub(1), ey)[0] as f32;
                let rt = gray.get_pixel((ex + 1).min(width - 1), ey)[0] as f32;
                lap_sum += (4.0 * c - up - dn - lf - rt).abs();
                total_eye_pixels += 1;
            }
        }

        let face_sharpness = if total_eye_pixels > 0 {
            (lap_sum / total_eye_pixels as f32 * 5.0).clamp(10.0, 100.0)
        } else {
            80.0
        };

        let idx = faces.len();
        faces.push(FaceInfo {
            id: format!("face_{}", idx + 1),
            x: x0 as f32 / width as f32,
            y: y0 as f32 / height as f32,
            width: w as f32 / width as f32,
            height: h as f32 / height as f32,
            eye_open_score,
            sharpness: face_sharpness,
            is_pinned: false,
            priority: 0.0,
            label: Some(format!("人物 #{}", idx + 1)),
        });
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

    #[test]
    fn test_non_human_images_do_not_trigger_false_face_or_blink() {
        use image::{DynamicImage, Rgb, RgbImage};

        // 1. 暖色调墙面/木板纹理图（无五官结构），绝不应误检出人脸或闭眼
        let mut warm_surface = RgbImage::from_pixel(240, 180, Rgb([210, 170, 140]));
        for y in 40..140 {
            for x in 60..180 {
                warm_surface.put_pixel(x, y, Rgb([218, 176, 145]));
            }
        }
        let detected = detect_faces_heuristic(&DynamicImage::ImageRgb8(warm_surface));
        assert!(
            detected.is_empty(),
            "Warm non-human surface should not be misdetected as a face"
        );

        // 2. 带有局部暖色色块（如纸筒/木桌/猫耳）的灰白背景图，无对称双眼与嘴部结构，绝不应误检为人脸
        let mut object_scene = RgbImage::from_pixel(300, 220, Rgb([195, 195, 195]));
        for y in 60..150 {
            for x in 100..180 {
                object_scene.put_pixel(x, y, Rgb([212, 168, 136]));
            }
        }
        let detected_obj = detect_faces_heuristic(&DynamicImage::ImageRgb8(object_scene));
        assert!(
            detected_obj.is_empty(),
            "Warm object patch without facial anatomy should not be misdetected as a face"
        );

        // 3. 真实猫咪/静物测试样张校验（若存在于仓库 website 目录）
        for rel_path in [
            "../website/sample1.jpg",
            "../website/sample2.jpg",
            "../website/sample3.jpg",
        ] {
            if let Ok(img) = image::open(rel_path) {
                let faces = detect_faces_heuristic(&img);
                assert!(
                    faces.is_empty(),
                    "Non-human sample photo {} should detect 0 human faces, got {}",
                    rel_path,
                    faces.len()
                );
            }
        }
    }
}
