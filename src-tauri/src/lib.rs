pub mod engine;
pub mod libraw_ffi;
pub mod models;
pub mod project;
pub mod rules;

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::collections::BTreeMap;
    use std::fs;
    use std::time::UNIX_EPOCH;

    #[derive(Debug, PartialEq, Eq)]
    struct SourceSnapshot {
        size: u64,
        modified_nanos: u128,
        sha256: String,
        readonly: bool,
        unix_mode: Option<u32>,
    }

    fn snapshot_directory(path: &std::path::Path) -> BTreeMap<String, SourceSnapshot> {
        fs::read_dir(path)
            .unwrap()
            .map(|entry| {
                let entry = entry.unwrap();
                let metadata = entry.metadata().unwrap();
                let name = entry.file_name().to_string_lossy().to_string();
                let bytes = fs::read(entry.path()).unwrap();
                let modified_nanos = metadata
                    .modified()
                    .unwrap()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos();
                #[cfg(unix)]
                let unix_mode = {
                    use std::os::unix::fs::PermissionsExt;
                    Some(metadata.permissions().mode())
                };
                #[cfg(not(unix))]
                let unix_mode = None;
                (
                    name,
                    SourceSnapshot {
                        size: metadata.len(),
                        modified_nanos,
                        sha256: format!("{:x}", Sha256::digest(bytes)),
                        readonly: metadata.permissions().readonly(),
                        unix_mode,
                    },
                )
            })
            .collect()
    }

    #[test]
    fn test_libraw_version() {
        let version = libraw_ffi::get_libraw_version();
        println!("Loaded LibRaw Version: {}", version);
        assert!(!version.is_empty());
        assert_ne!(version, "Unknown");
    }

    #[test]
    fn test_compatibility_scan_groups_bursts_without_requiring_exif() {
        let fixtures_dir = std::path::Path::new("../test_fixtures");
        if fixtures_dir.exists() {
            let items =
                engine::scan_directory(fixtures_dir).expect("Scan test_fixtures should succeed");
            assert_eq!(items.len(), 5);
            // 验证连拍自动成组
            let burst_count = items.iter().filter(|p| p.burst_group_id.is_some()).count();
            assert!(
                burst_count >= 2,
                "Consecutive files should be clustered into a burst group"
            );
            // 缺少或无效 EXIF 不能让扫描失败；桌面首阶段更不会依赖 EXIF。
            assert!(items.iter().all(|item| !item.id.is_empty()));
        }
    }

    #[test]
    fn test_scan_keeps_broken_file_in_list_for_background_analysis() {
        let temp_dir =
            std::env::temp_dir().join(format!("qp_failed_analysis_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();
        fs::write(temp_dir.join("broken.jpg"), b"not a valid image").unwrap();

        let items = engine::scan_directory(&temp_dir).unwrap();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].filename, "broken.jpg");
        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn test_fast_scan_does_not_decode_or_extract_metadata() {
        let temp_dir = std::env::temp_dir().join(format!("qp_fast_scan_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();
        fs::write(temp_dir.join("broken.jpg"), b"not a valid image").unwrap();

        let items = engine::scan_directory_fast(&temp_dir).unwrap();

        assert_eq!(items.len(), 1);
        assert!(items[0].exif.is_none());
        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn test_scan_is_read_only_and_photo_ids_are_stable() {
        let temp_dir =
            std::env::temp_dir().join(format!("qp_read_only_scan_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();
        let first_path = temp_dir.join("first.png");
        let second_path = temp_dir.join("second.png");
        image::RgbImage::from_pixel(4, 4, image::Rgb([80, 120, 160]))
            .save(&first_path)
            .unwrap();
        image::RgbImage::from_pixel(4, 4, image::Rgb([160, 120, 80]))
            .save(&second_path)
            .unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&first_path, fs::Permissions::from_mode(0o444)).unwrap();
            fs::set_permissions(&second_path, fs::Permissions::from_mode(0o444)).unwrap();
            fs::set_permissions(&temp_dir, fs::Permissions::from_mode(0o555)).unwrap();
        }

        let before = snapshot_directory(&temp_dir);
        let first_scan = engine::scan_directory(&temp_dir).unwrap();
        let second_scan = engine::scan_directory(&temp_dir).unwrap();
        let app_data =
            std::env::temp_dir().join(format!("qp_read_only_project_{}", uuid::Uuid::new_v4()));
        let project_photos = first_scan
            .iter()
            .map(|photo| project::ProjectPhotoInput {
                photo_id: photo.id.clone(),
                path: photo.path.clone(),
                filename: photo.filename.clone(),
                file_size: photo.file_size,
                format: if photo.is_raw { "raw" } else { "jpeg" }.to_string(),
                captured_at: photo
                    .exif
                    .as_ref()
                    .and_then(|exif| exif.date_time_original.clone()),
            })
            .collect::<Vec<_>>();
        let project_state =
            project::open_project(&app_data, temp_dir.to_str().unwrap(), &project_photos).unwrap();
        let first_photo_id = project_state.photo_id_remaps[&first_scan[0].id].clone();
        project::save_selection(
            &app_data,
            &project_state.project_id,
            &project::PersistedSelection {
                photo_id: first_photo_id.clone(),
                state: "selected".to_string(),
                note: Some("只写应用数据库".to_string()),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
        )
        .unwrap();
        project::mark_viewed(&app_data, &project_state.project_id, &first_photo_id).unwrap();
        let (preview_bytes, _) =
            engine::cache::load_cached_preview(&app_data, &first_photo_id, &first_scan[0].path)
                .unwrap();
        rules::analyze_image_bytes(&preview_bytes).unwrap();
        let reopened =
            project::open_project(&app_data, temp_dir.to_str().unwrap(), &project_photos).unwrap();
        assert_eq!(reopened.selections.len(), 1);
        assert!(app_data
            .join(engine::cache::PREVIEW_CACHE_DIR_NAME)
            .is_dir());
        let after = snapshot_directory(&temp_dir);

        assert_eq!(before, after, "扫描不得改变或新增源目录中的任何文件");
        assert_eq!(first_scan.len(), second_scan.len());
        assert_eq!(
            first_scan.iter().map(|photo| &photo.id).collect::<Vec<_>>(),
            second_scan
                .iter()
                .map(|photo| &photo.id)
                .collect::<Vec<_>>(),
            "同一目录重复扫描必须产生稳定照片 ID"
        );

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&temp_dir, fs::Permissions::from_mode(0o755)).unwrap();
        }
        let _ = fs::remove_dir_all(temp_dir);
        let _ = fs::remove_dir_all(app_data);
    }
}
