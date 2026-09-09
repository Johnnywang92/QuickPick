use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnalysisStatus {
    NoIssues,
    NeedsCheck,
    Pending,
    Failed,
}

/// 专业摄影工作流场景预设模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowScene {
    #[default]
    General, // 通用人像 / 旅拍客照
    Concert,    // 演唱会 / 舞台演出 / 音乐节
    Cosplay,    // 二次元 / 漫展 / Cosplay / JK / 汉服
    Conference, // 商业活动 / 会议公关 / 图片直播
    Wedding,    // 婚礼纪实 / 情感抓拍
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefectTag {
    pub id: String,           // 如 "burst_face_swap", "severe_blur", "photobomber"
    pub category: String,     // "info" | "warning"
    pub label: String,        // 中文展示标签
    pub confidence: f32,      // 0.0 ~ 1.0
    pub hint: Option<String>, // 操作/替换建议
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FaceInfo {
    pub id: String,
    pub x: f32,              // 归一化横坐标 0.0 ~ 1.0 (左上角)
    pub y: f32,              // 归一化纵坐标 0.0 ~ 1.0 (左上角)
    pub width: f32,          // 归一化宽度 0.0 ~ 1.0
    pub height: f32,         // 归一化高度 0.0 ~ 1.0
    pub eye_open_score: f32, // 0.0 (完全闭眼) ~ 1.0 (完全睁眼)
    pub sharpness: f32,      // 局部合焦锐度 (0 ~ 100)
    pub is_pinned: bool,     // 是否主角钉选
    pub priority: f32,       // 归一化优先级打分
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct ExifMetadata {
    pub camera_make: Option<String>,        // 如 "SONY", "Canon", "NIKON"
    pub camera_model: Option<String>,       // 如 "ILCE-7RM5", "EOS R5"
    pub lens_model: Option<String>,         // 如 "FE 24-70mm F2.8 GM II"
    pub lens_make: Option<String>,          // 如 "Sony", "Sigma"
    pub focal_length: Option<f32>,          // 物理焦距 (mm)，如 50.0
    pub focal_length_35mm: Option<u32>,     // 35mm 等效焦距 (mm)，如 50
    pub aperture: Option<f32>,              // 光圈数值，如 2.8 代表 f/2.8
    pub shutter_speed: Option<String>,      // 格式化快门，如 "1/500s", "0.5s", "2s"
    pub shutter_speed_value: Option<f32>,   // 快门秒数，如 0.002
    pub iso: Option<u32>,                   // 感光度，如 100, 3200
    pub date_time_original: Option<String>, // 拍摄时间，如 "2026-08-15 14:30:00"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhotoItem {
    pub id: String,
    pub path: String,
    pub filename: String,
    pub file_size: u64,
    pub is_raw: bool,
    pub thumb_width: Option<u32>,
    pub thumb_height: Option<u32>,
    pub burst_group_id: Option<String>,
    pub exif: Option<ExifMetadata>,
}

pub use crate::rules::timeline::TimelineChapter;
