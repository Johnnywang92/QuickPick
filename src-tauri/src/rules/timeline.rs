use crate::models::{PhotoItem, WorkflowScene};
use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TimelineChapter {
    pub id: String,
    pub name: String,
    pub start_index: usize,
    pub end_index: usize,
    pub start_path: String,
    pub end_path: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub photo_count: usize,
    pub target_quota: usize,
    pub color: String,
}

const CHAPTER_COLORS: &[&str] = &[
    "#3b82f6", // blue
    "#8b5cf6", // purple
    "#ec4899", // pink
    "#f59e0b", // amber
    "#10b981", // emerald
    "#06b6d4", // cyan
    "#6366f1", // indigo
    "#14b8a6", // teal
];

fn get_scene_presets(scene: WorkflowScene) -> Vec<(&'static str, usize)> {
    match scene {
        WorkflowScene::Wedding => vec![
            ("新娘早妆与晨袍", 15),
            ("新郎迎亲与堵门", 15),
            ("敬茶改口与合影", 10),
            ("外景采风与特写", 15),
            ("婚礼主仪式宣誓", 20),
            ("晚宴敬酒与派对", 15),
        ],
        WorkflowScene::Concert => vec![
            ("开场演出与首发", 15),
            ("热力唱跳与主打", 20),
            ("慢歌抒情与特写", 15),
            ("中场互动与嘉宾", 10),
            ("高潮曲目与合唱", 20),
            ("安可返场与谢幕", 15),
        ],
        WorkflowScene::Conference => vec![
            ("嘉宾签到与留念", 10),
            ("领导致辞与主旨演讲", 20),
            ("高峰圆桌与对话", 15),
            ("商务茶歇与交流", 10),
            ("VIP 全体大合影", 10),
            ("闭幕颁奖与成果发布", 15),
        ],
        WorkflowScene::Cosplay => vec![
            ("角色正片第一造型", 15),
            ("角色正片第二造型", 15),
            ("动作抓拍与剧情特写", 20),
            ("场馆巡游与同好互动", 15),
            ("幕后花絮与谢幕", 10),
        ],
        WorkflowScene::General => vec![
            ("环节 1", 15),
            ("环节 2", 15),
            ("环节 3", 15),
            ("环节 4", 15),
            ("环节 5", 15),
        ],
    }
}

fn parse_dt_timestamp(photo: &PhotoItem) -> Option<i64> {
    photo
        .exif
        .as_ref()
        .and_then(|e| e.date_time_original.as_deref())
        .and_then(|dt_str| {
            NaiveDateTime::parse_from_str(dt_str, "%Y-%m-%d %H:%M:%S")
                .or_else(|_| NaiveDateTime::parse_from_str(dt_str, "%Y:%m:%d %H:%M:%S"))
                .ok()
                .map(|dt| dt.and_utc().timestamp())
        })
}

/// 基于拍摄时间密度间隔进行时间轴分章聚类
pub fn cluster_photos_by_timeline(
    photos: &[PhotoItem],
    min_gap_seconds: i64,
    scene: WorkflowScene,
) -> Vec<TimelineChapter> {
    if photos.is_empty() {
        return Vec::new();
    }

    let presets = get_scene_presets(scene);
    let mut split_indices = vec![0usize];

    let mut last_timestamp = parse_dt_timestamp(&photos[0]);

    for (i, photo) in photos.iter().enumerate().skip(1) {
        let curr_timestamp = parse_dt_timestamp(photo);
        if let (Some(last), Some(curr)) = (last_timestamp, curr_timestamp) {
            let diff = curr - last;
            if diff >= min_gap_seconds {
                split_indices.push(i);
            }
        }
        if curr_timestamp.is_some() {
            last_timestamp = curr_timestamp;
        }
    }

    let mut chapters = Vec::new();
    let num_splits = split_indices.len();

    for (idx, &start_idx) in split_indices.iter().enumerate() {
        let end_idx = if idx + 1 < num_splits {
            split_indices[idx + 1] - 1
        } else {
            photos.len() - 1
        };

        let count = end_idx - start_idx + 1;
        let color = CHAPTER_COLORS[idx % CHAPTER_COLORS.len()].to_string();

        let (name, default_quota) = if idx < presets.len() {
            (presets[idx].0.to_string(), presets[idx].1)
        } else {
            (format!("环节 {}", idx + 1), 15)
        };

        let start_time = photos[start_idx]
            .exif
            .as_ref()
            .and_then(|e| e.date_time_original.clone());
        let end_time = photos[end_idx]
            .exif
            .as_ref()
            .and_then(|e| e.date_time_original.clone());

        chapters.push(TimelineChapter {
            id: format!("chapter-{}", idx + 1),
            name,
            start_index: start_idx,
            end_index: end_idx,
            start_path: photos[start_idx].path.clone(),
            end_path: photos[end_idx].path.clone(),
            start_time,
            end_time,
            photo_count: count,
            target_quota: default_quota.min(count),
            color,
        });
    }

    chapters
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ExifMetadata, PhotoItem, RetouchStatus};

    fn make_test_photo(name: &str, dt: Option<&str>) -> PhotoItem {
        PhotoItem {
            id: format!("id-{}", name),
            path: format!("/path/{}", name),
            filename: name.to_string(),
            file_size: 24_000_000,
            is_raw: true,
            rating: 0,
            color_label: String::new(),
            pick_status: "None".to_string(),
            thumb_width: None,
            thumb_height: None,
            retouch_status: RetouchStatus::Clean,
            defect_tags: vec![],
            burst_group_id: None,
            faces: vec![],
            xmp_source_hash: None,
            exif: dt.map(|time| ExifMetadata {
                camera_make: None,
                camera_model: None,
                lens_make: None,
                lens_model: None,
                focal_length: None,
                focal_length_35mm: None,
                aperture: None,
                shutter_speed: None,
                shutter_speed_value: None,
                iso: None,
                date_time_original: Some(time.to_string()),
            }),
        }
    }

    #[test]
    fn test_cluster_photos_by_timeline_gaps() {
        let photos = vec![
            // 环节 1: 14:00 ~ 14:05 (3 张)
            make_test_photo("DSC0001.ARW", Some("2026-08-15 14:00:00")),
            make_test_photo("DSC0002.ARW", Some("2026-08-15 14:02:00")),
            make_test_photo("DSC0003.ARW", Some("2026-08-15 14:05:00")),
            // 间隔 15 分钟 (900秒 >= 600秒) -> 环节 2
            make_test_photo("DSC0004.ARW", Some("2026-08-15 14:20:00")),
            make_test_photo("DSC0005.ARW", Some("2026-08-15 14:25:00")),
            // 间隔 35 分钟 (2100秒 >= 600秒) -> 环节 3
            make_test_photo("DSC0006.ARW", Some("2026-08-15 15:00:00")),
        ];

        let chapters = cluster_photos_by_timeline(&photos, 600, WorkflowScene::Wedding);
        assert_eq!(chapters.len(), 3);

        // 验证第 1 章节
        assert_eq!(chapters[0].id, "chapter-1");
        assert_eq!(chapters[0].name, "新娘早妆与晨袍");
        assert_eq!(chapters[0].start_index, 0);
        assert_eq!(chapters[0].end_index, 2);
        assert_eq!(chapters[0].photo_count, 3);
        assert_eq!(chapters[0].start_time.as_deref(), Some("2026-08-15 14:00:00"));
        assert_eq!(chapters[0].end_time.as_deref(), Some("2026-08-15 14:05:00"));

        // 验证第 2 章节
        assert_eq!(chapters[1].id, "chapter-2");
        assert_eq!(chapters[1].name, "新郎迎亲与堵门");
        assert_eq!(chapters[1].start_index, 3);
        assert_eq!(chapters[1].end_index, 4);
        assert_eq!(chapters[1].photo_count, 2);

        // 验证第 3 章节
        assert_eq!(chapters[2].id, "chapter-3");
        assert_eq!(chapters[2].name, "敬茶改口与合影");
        assert_eq!(chapters[2].start_index, 5);
        assert_eq!(chapters[2].end_index, 5);
        assert_eq!(chapters[2].photo_count, 1);
    }

    #[test]
    fn test_cluster_photos_without_timestamps_fallback() {
        let photos = vec![
            make_test_photo("DSC0001.ARW", None),
            make_test_photo("DSC0002.ARW", None),
        ];

        let chapters = cluster_photos_by_timeline(&photos, 600, WorkflowScene::Concert);
        assert_eq!(chapters.len(), 1);
        assert_eq!(chapters[0].name, "开场演出与首发");
        assert_eq!(chapters[0].photo_count, 2);
    }
}
