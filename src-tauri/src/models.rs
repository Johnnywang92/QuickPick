use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RetouchStatus {
    Clean,    // 完美原片
    Fixable,  // 可修解决
    Fatal,    // 不可修硬伤
    Pending,  // 待分析
    Failed,   // 解码或分析失败，可重试
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefectTag {
    pub id: String,           // 如 "burst_face_swap", "severe_blur", "photobomber"
    pub category: String,     // "fixable" | "fatal" | "clean"
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhotoItem {
    pub id: String,
    pub path: String,
    pub filename: String,
    pub file_size: u64,
    pub is_raw: bool,
    pub rating: u8,          // 0~5
    pub color_label: String, // "", "Red", "Yellow", "Green", "Blue", "Purple"
    pub pick_status: String, // "None", "Pick", "Reject"
    pub thumb_width: Option<u32>,
    pub thumb_height: Option<u32>,
    pub retouch_status: RetouchStatus,
    pub defect_tags: Vec<DefectTag>,
    pub burst_group_id: Option<String>,
    pub faces: Vec<FaceInfo>,
    /// 扫描时完整 XMP 的 SHA-256；写入成功后由前端更新。
    pub xmp_source_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriageUpdate {
    pub path: String,
    pub rating: Option<u8>,
    pub color_label: Option<String>,
    pub pick_status: Option<String>,
}
