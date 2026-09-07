// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use quickpick_lib::engine::{load_photo_preview, scan_directory};
use quickpick_lib::libraw_ffi::get_libraw_version;
use quickpick_lib::models::PhotoItem;
use quickpick_lib::xmp::{write_xmp_atomic_full, write_xmp_conflict_copy_full, XmpUpdate};
use serde::Serialize;
use std::sync::OnceLock;

static CLIENT_INSTANCE_ID: OnceLock<String> = OnceLock::new();

fn client_instance_id() -> &'static str {
    CLIENT_INSTANCE_ID
        .get_or_init(|| format!("desktop-{}", uuid::Uuid::new_v4()))
        .as_str()
}

#[derive(Serialize)]
pub struct EngineInfo {
    pub libraw_version: String,
    pub status: String,
}

#[tauri::command]
fn get_engine_info() -> EngineInfo {
    EngineInfo {
        libraw_version: get_libraw_version(),
        status: "Ready (Dynamic Link)".to_string(),
    }
}

#[tauri::command]
fn scan_folder(path: String) -> Result<Vec<PhotoItem>, String> {
    scan_directory(&path)
}

#[tauri::command]
fn get_photo_preview(path: String) -> Result<String, String> {
    let (data, mime) = load_photo_preview(&path)?;
    let encoded = BASE64.encode(&data);
    Ok(format!("data:{};base64,{}", mime, encoded))
}

#[tauri::command]
fn analyze_photo(
    path: String,
    index: usize,
) -> Result<(String, Vec<quickpick_lib::models::DefectTag>), String> {
    let (bytes, _) = load_photo_preview(&path)?;
    let metrics = quickpick_lib::rules::analyze_image_bytes(&bytes)?;
    let (status, tags) = quickpick_lib::rules::evaluate_photo_retouchability(&metrics, None, index);
    let status_str = match status {
        quickpick_lib::models::RetouchStatus::Clean => "clean",
        quickpick_lib::models::RetouchStatus::Fixable => "fixable",
        quickpick_lib::models::RetouchStatus::Fatal => "fatal",
        quickpick_lib::models::RetouchStatus::Pending => "pending",
        quickpick_lib::models::RetouchStatus::Failed => "failed",
    };
    Ok((status_str.to_string(), tags))
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn update_triage(
    path: String,
    rating: u8,
    color_label: String,
    pick_status: String,
    retouch_status: Option<String>,
    defect_tags: Option<String>,
    burst_group_id: Option<String>,
    expected_source_hash: Option<String>,
    force: Option<bool>,
) -> Result<String, String> {
    write_xmp_atomic_full(&path, XmpUpdate {
        rating,
        label: &color_label,
        pick_status: &pick_status,
        client_id: client_instance_id(),
        retouch_status: retouch_status.as_deref(),
        defect_tags: defect_tags.as_deref(),
        burst_group_id: burst_group_id.as_deref(),
        expected_source_hash: expected_source_hash.as_deref(),
        force: force.unwrap_or(false),
    })
}

#[tauri::command]
fn save_triage_conflict_copy(
    path: String,
    rating: u8,
    color_label: String,
    pick_status: String,
    retouch_status: Option<String>,
    defect_tags: Option<String>,
    burst_group_id: Option<String>,
) -> Result<String, String> {
    write_xmp_conflict_copy_full(&path, XmpUpdate {
        rating,
        label: &color_label,
        pick_status: &pick_status,
        client_id: client_instance_id(),
        retouch_status: retouch_status.as_deref(),
        defect_tags: defect_tags.as_deref(),
        burst_group_id: burst_group_id.as_deref(),
        expected_source_hash: None,
        force: false,
    })
}

use quickpick_lib::engine::export::{execute_export, reveal_in_file_manager, ExportOptions, ExportResult};

#[tauri::command]
fn export_photos(options: ExportOptions) -> Result<ExportResult, String> {
    execute_export(&options)
}

#[tauri::command]
fn reveal_directory(path: String) -> Result<(), String> {
    reveal_in_file_manager(&path)
}

#[tauri::command]
fn detect_photo_faces(path: String) -> Result<Vec<quickpick_lib::models::FaceInfo>, String> {
    if let Ok((bytes, _)) = load_photo_preview(&path) {
        if let Ok(img) = image::load_from_memory(&bytes) {
            let faces = quickpick_lib::rules::face::detect_faces_heuristic(&img);
            let (top6, _) = quickpick_lib::rules::face::sort_and_truncate_faces(
                faces,
                img.width() as f32,
                img.height() as f32,
                6,
            );
            return Ok(top6);
        }
    }
    Ok(Vec::new())
}

#[tauri::command]
fn generate_folder_cache(path: String) -> Result<usize, String> {
    let catalog = quickpick_lib::engine::cache::build_folder_cache(&path, 2048)?;
    Ok(catalog.photo_count)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_engine_info,
            scan_folder,
            get_photo_preview,
            update_triage,
            save_triage_conflict_copy,
            analyze_photo,
            detect_photo_faces,
            export_photos,
            reveal_directory,
            generate_folder_cache
        ])
        .run(tauri::generate_context!())
        .expect("error while running QuickPick application");
}
