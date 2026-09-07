pub mod engine;
pub mod libraw_ffi;
pub mod models;
pub mod rules;
pub mod xmp;

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_libraw_version() {
        let version = libraw_ffi::get_libraw_version();
        println!("Loaded LibRaw Version: {}", version);
        assert!(!version.is_empty());
        assert_ne!(version, "Unknown");
    }

    #[test]
    fn test_xmp_atomic_write_and_read() {
        let temp_dir = std::env::temp_dir().join(format!("qp_test_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();

        let dummy_raw = temp_dir.join("_DSC0001.ARW");
        fs::write(&dummy_raw, b"dummy raw content").unwrap();

        // 1. 写入 XMP
        let client_id = "test-client-1";
        xmp::write_xmp_atomic(&dummy_raw, 5, "Red", "Pick", client_id).unwrap();

        // 2. 读取 XMP
        let xmp_p = xmp::get_xmp_path(&dummy_raw);
        assert!(xmp_p.exists());

        let read_back = xmp::read_xmp(&xmp_p).expect("Should successfully parse XMP");
        assert_eq!(read_back.rating, 5);
        assert_eq!(read_back.label, "Red");
        assert_eq!(read_back.pick_status, "Pick");
        assert_eq!(read_back.rev, 1);

        // 3. 递增修改
        xmp::write_xmp_atomic(&dummy_raw, 4, "Yellow", "None", client_id).unwrap();
        let read_back2 = xmp::read_xmp(&xmp_p).expect("Should successfully parse XMP");
        assert_eq!(read_back2.rating, 4);
        assert_eq!(read_back2.label, "Yellow");
        assert_eq!(read_back2.pick_status, "None");
        assert_eq!(read_back2.rev, 2);

        // 清理
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_xmp_merge_preserves_adobe_fields_and_detects_conflict() {
        let temp_dir = std::env::temp_dir().join(format!("qp_xmp_merge_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();

        let raw_path = temp_dir.join("portrait.ARW");
        let xmp_path = temp_dir.join("portrait.xmp");
        fs::write(&raw_path, b"raw").unwrap();
        let original = r#"<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
    xmp:Rating="2" xmp:Label="Blue" crs:Exposure2012="1.25">
   <crs:ToneCurveName2012>Custom</crs:ToneCurveName2012>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>"#;
        fs::write(&xmp_path, original).unwrap();

        let base_hash = xmp::calculate_document_hash(original);
        xmp::write_xmp_atomic_full(&raw_path, xmp::XmpUpdate {
            rating: 5,
            label: "Green",
            pick_status: "Pick",
            client_id: "merge-test",
            retouch_status: Some("clean"),
            defect_tags: Some("clean_prime"),
            burst_group_id: Some("burst-1"),
            expected_source_hash: Some(&base_hash),
            force: false,
        }).unwrap();

        let merged = fs::read_to_string(&xmp_path).unwrap();
        assert!(merged.contains("crs:Exposure2012=\"1.25\""));
        assert!(merged.contains("<crs:ToneCurveName2012>Custom</crs:ToneCurveName2012>"));
        assert!(merged.contains("xmp:Rating=\"5\""));
        assert!(merged.contains("xmp:Label=\"Green\""));
        assert!(merged.contains("<quickpick:pickStatus>Pick</quickpick:pickStatus>"));

        let backup_path = xmp_path.with_extension("xmp.quickpick-backup");
        assert_eq!(fs::read_to_string(backup_path).unwrap(), original);

        let merged_hash = xmp::calculate_document_hash(&merged);
        let externally_changed = merged.replace("crs:Exposure2012=\"1.25\"", "crs:Exposure2012=\"2.00\"");
        fs::write(&xmp_path, &externally_changed).unwrap();
        let conflict = xmp::write_xmp_atomic_full(&raw_path, xmp::XmpUpdate {
            rating: 4,
            label: "Red",
            pick_status: "Reject",
            client_id: "merge-test",
            retouch_status: None,
            defect_tags: None,
            burst_group_id: None,
            expected_source_hash: Some(&merged_hash),
            force: false,
        });
        assert!(conflict.is_err());
        assert_eq!(fs::read_to_string(&xmp_path).unwrap(), externally_changed);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_scan_directory_and_rules() {
        let fixtures_dir = std::path::Path::new("../test_fixtures");
        if fixtures_dir.exists() {
            let items = engine::scan_directory(fixtures_dir).expect("Scan test_fixtures should succeed");
            assert_eq!(items.len(), 5);
            // 验证连拍自动成组
            let burst_count = items.iter().filter(|p| p.burst_group_id.is_some()).count();
            assert!(burst_count >= 2, "Consecutive files should be clustered into a burst group");
            // 验证诊断状态已被分配 (非 pending)
            for item in &items {
                assert_ne!(item.retouch_status, models::RetouchStatus::Pending);
                println!("Photo: {} -> Retouch: {:?}, Tags: {:?}", item.filename, item.retouch_status, item.defect_tags);
            }
        }
    }

    #[test]
    fn test_scan_marks_decode_failure_as_failed() {
        let temp_dir =
            std::env::temp_dir().join(format!("qp_failed_analysis_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();
        fs::write(temp_dir.join("broken.jpg"), b"not a valid image").unwrap();

        let items = engine::scan_directory(&temp_dir).unwrap();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].retouch_status, models::RetouchStatus::Failed);
        let _ = fs::remove_dir_all(temp_dir);
    }
}
