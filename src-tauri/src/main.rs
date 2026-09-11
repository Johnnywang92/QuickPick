// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use quickpick_lib::engine::delivery::{
    open_airdrop, render_shareable_jpegs, DeliveryPhotoInput, LutTablePayload, RenderedExportResult,
};
use quickpick_lib::engine::{load_photo_preview, scan_directory_fast};
use quickpick_lib::libraw_ffi::get_libraw_version;
use quickpick_lib::models::{AnalysisStatus, DefectTag, ExifMetadata, FaceInfo, PhotoItem};
use quickpick_lib::project::{
    PersistedSelection, PersistenceOutcome, ProjectPhotoInput, ProjectState, ProjectViewStateInput,
    RecentProject, StartupHealth,
};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::Manager;

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
fn get_startup_health(health: tauri::State<'_, StartupHealth>) -> StartupHealth {
    health.inner().clone()
}

#[tauri::command]
fn scan_folder(path: String) -> Result<Vec<PhotoItem>, String> {
    scan_directory_fast(&path)
}

#[derive(Serialize)]
struct PhotoAnalysisResult {
    exif: Option<ExifMetadata>,
    analysis_status: String,
    defect_tags: Vec<DefectTag>,
    faces: Vec<FaceInfo>,
    preview_width: Option<u32>,
    preview_height: Option<u32>,
    phash: Option<String>,
    sharpness: Option<f32>,
}

fn analyze_photo_details_blocking(
    app_data_dir: &std::path::Path,
    photo_id: &str,
    path: &str,
    index: usize,
    scene: Option<&str>,
) -> PhotoAnalysisResult {
    let source_path = std::path::Path::new(path);
    let exif = if quickpick_lib::engine::is_raw_file(source_path) {
        quickpick_lib::libraw_ffi::extract_raw_metadata(source_path).ok()
    } else {
        quickpick_lib::engine::exif::extract_image_file_exif(source_path)
    };
    let workflow_scene = match scene {
        Some("concert") => quickpick_lib::models::WorkflowScene::Concert,
        Some("cosplay") => quickpick_lib::models::WorkflowScene::Cosplay,
        Some("conference") => quickpick_lib::models::WorkflowScene::Conference,
        Some("wedding") => quickpick_lib::models::WorkflowScene::Wedding,
        _ => quickpick_lib::models::WorkflowScene::General,
    };

    let Ok((bytes, _)) =
        quickpick_lib::engine::cache::load_cached_preview(app_data_dir, photo_id, path)
    else {
        return PhotoAnalysisResult {
            exif,
            analysis_status: "failed".to_string(),
            defect_tags: Vec::new(),
            faces: Vec::new(),
            preview_width: None,
            preview_height: None,
            phash: None,
            sharpness: None,
        };
    };
    let (faces, preview_width, preview_height, phash) = image::load_from_memory(&bytes)
        .ok()
        .map(|image| {
            let dimensions = (Some(image.width()), Some(image.height()));
            let hash = quickpick_lib::rules::phash::compute_phash(&image);
            let phash_hex = quickpick_lib::rules::phash::hash_to_hex(hash);
            let detected = quickpick_lib::rules::face::detect_faces_heuristic(&image);
            let faces = quickpick_lib::rules::face::sort_and_truncate_faces(
                detected,
                image.width() as f32,
                image.height() as f32,
                6,
            )
            .0;
            (faces, dimensions.0, dimensions.1, Some(phash_hex))
        })
        .unwrap_or_else(|| (Vec::new(), None, None, None));
    let Ok(metrics) = quickpick_lib::rules::analyze_image_bytes(&bytes) else {
        return PhotoAnalysisResult {
            exif,
            analysis_status: "failed".to_string(),
            defect_tags: Vec::new(),
            faces,
            preview_width,
            preview_height,
            phash,
            sharpness: None,
        };
    };
    let (mut status, mut defect_tags) = quickpick_lib::rules::evaluate_photo_analysis_with_scene(
        &metrics,
        None,
        index,
        workflow_scene,
    );

    // 闭眼缺陷及合影睁闭眼分歧判定
    if let Some(blink_tag) = quickpick_lib::rules::face::evaluate_group_eyes_with_scene(&faces, workflow_scene) {
        defect_tags.push(blink_tag);
        status = AnalysisStatus::NeedsCheck;
    }
    if let Some(conflict_tag) = quickpick_lib::rules::face::evaluate_group_eye_conflict_with_scene(&faces, workflow_scene) {
        defect_tags.push(conflict_tag);
        status = AnalysisStatus::NeedsCheck;
    }

    let analysis_status = match status {
        AnalysisStatus::NoIssues => "no_issues",
        AnalysisStatus::NeedsCheck => "needs_check",
        AnalysisStatus::Pending => "pending",
        AnalysisStatus::Failed => "failed",
    };
    PhotoAnalysisResult {
        exif,
        analysis_status: analysis_status.to_string(),
        defect_tags,
        faces,
        preview_width,
        preview_height,
        phash,
        sharpness: Some(metrics.sharpness),
    }
}

#[tauri::command]
async fn analyze_photo_details(
    app: tauri::AppHandle,
    photo_id: Option<String>,
    path: String,
    index: usize,
    scene: Option<String>,
) -> Result<PhotoAnalysisResult, String> {
    let app_data_dir = app_data_directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        analyze_photo_details_blocking(
            &app_data_dir,
            photo_id.as_deref().unwrap_or(""),
            &path,
            index,
            scene.as_deref(),
        )
    })
    .await
    .map_err(|error| format!("后台照片分析任务异常结束: {error}"))
}

#[tauri::command]
fn get_photo_preview(
    app: tauri::AppHandle,
    path: String,
    photo_id: Option<String>,
) -> Result<String, String> {
    let (data, mime) = quickpick_lib::engine::cache::load_cached_preview(
        app_data_directory(&app)?,
        photo_id.as_deref().unwrap_or(""),
        &path,
    )?;
    let encoded = BASE64.encode(&data);
    Ok(format!("data:{};base64,{}", mime, encoded))
}

fn app_data_directory(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("无法定位应用数据目录: {error}"))
}

#[tauri::command]
fn open_project(
    app: tauri::AppHandle,
    folder_path: String,
    photos: Vec<ProjectPhotoInput>,
) -> Result<ProjectState, String> {
    quickpick_lib::project::open_project(&app_data_directory(&app)?, &folder_path, &photos)
}

#[tauri::command]
fn save_selection(
    app: tauri::AppHandle,
    project_id: String,
    selection: PersistedSelection,
) -> Result<PersistenceOutcome, String> {
    quickpick_lib::project::save_selection(&app_data_directory(&app)?, &project_id, &selection)
}

#[tauri::command]
fn save_selections(
    app: tauri::AppHandle,
    project_id: String,
    selections: Vec<PersistedSelection>,
) -> Result<PersistenceOutcome, String> {
    quickpick_lib::project::save_selections(&app_data_directory(&app)?, &project_id, &selections)
}

#[tauri::command]
fn mark_photo_viewed(
    app: tauri::AppHandle,
    project_id: String,
    photo_id: String,
) -> Result<PersistenceOutcome, String> {
    quickpick_lib::project::mark_viewed(&app_data_directory(&app)?, &project_id, &photo_id)
}

#[tauri::command]
fn save_project_view_state(
    app: tauri::AppHandle,
    project_id: String,
    state: ProjectViewStateInput,
) -> Result<PersistenceOutcome, String> {
    quickpick_lib::project::save_project_view_state(&app_data_directory(&app)?, &project_id, &state)
}

#[tauri::command]
fn list_recent_projects(app: tauri::AppHandle) -> Result<Vec<RecentProject>, String> {
    quickpick_lib::project::list_recent_projects(&app_data_directory(&app)?)
}

#[tauri::command]
fn relocate_project(
    app: tauri::AppHandle,
    project_id: String,
    folder_path: String,
    photos: Vec<ProjectPhotoInput>,
) -> Result<ProjectState, String> {
    quickpick_lib::project::relocate_project(
        &app_data_directory(&app)?,
        &project_id,
        &folder_path,
        &photos,
    )
}

use quickpick_lib::engine::export::{
    execute_export_controlled, preflight_export, reveal_in_file_manager,
    save_manifest_file as write_manifest_file, ExportOptions, ExportPreflight, ExportResult,
};

#[derive(Default)]
struct ExportCancellationRegistry(Mutex<HashMap<String, Arc<AtomicBool>>>);

#[tauri::command]
fn preflight_export_photos(options: ExportOptions) -> Result<ExportPreflight, String> {
    preflight_export(&options)
}

#[tauri::command]
async fn export_photos(
    app: tauri::AppHandle,
    registry: tauri::State<'_, ExportCancellationRegistry>,
    job_id: String,
    options: ExportOptions,
) -> Result<ExportResult, String> {
    // IPC 安全边界验证：防越权路径探测与非法入参
    if options.photo_paths.is_empty() {
        return Err("待导出照片列表为空".to_string());
    }
    for p in &options.photo_paths {
        let path = std::path::Path::new(p);
        if !path.exists() {
            return Err(format!("导出源路径不存在: {p}"));
        }
        if !path.is_file() {
            return Err(format!("导出源路径不是普通文件: {p}"));
        }
        if p.contains("..") {
            return Err(format!("非法路径探测，拒绝访问: {p}"));
        }
    }
    uuid::Uuid::parse_str(&job_id).map_err(|_| "导出任务 ID 无效".to_string())?;
    let app_data_dir = app_data_directory(&app)?;
    let mut recorder =
        quickpick_lib::project::ExportJobRecorder::create(&app_data_dir, &job_id, &options)?;
    let cancellation = Arc::new(AtomicBool::new(false));
    {
        let mut active = registry
            .0
            .lock()
            .map_err(|_| "导出取消注册表不可用".to_string())?;
        if active
            .insert(job_id.clone(), Arc::clone(&cancellation))
            .is_some()
        {
            return Err("相同导出任务已在运行".to_string());
        }
    }

    let task_job_id = job_id.clone();
    let joined = tauri::async_runtime::spawn_blocking(move || {
        recorder.mark_running()?;
        let export_result = execute_export_controlled(
            &options,
            &task_job_id,
            &mut |update| recorder.record_progress(update),
            &|| cancellation.load(Ordering::Relaxed),
        );
        match export_result {
            Ok(result) => {
                let status = if result.cancelled {
                    "cancelled"
                } else if result.failed > 0 {
                    "completed_with_errors"
                } else {
                    "completed"
                };
                recorder.finish(status, None)?;
                Ok(result)
            }
            Err(error) => {
                let persistence_error = recorder.finish("failed", Some(&error)).err();
                Err(match persistence_error {
                    Some(db_error) => format!("{error}；同时无法记录任务失败状态: {db_error}"),
                    None => error,
                })
            }
        }
    })
    .await;

    if let Ok(mut active) = registry.0.lock() {
        active.remove(&job_id);
    }
    let outcome = joined.map_err(|error| format!("导出后台任务异常结束: {error}"))?;
    outcome
}

#[tauri::command]
fn cancel_export(
    app: tauri::AppHandle,
    registry: tauri::State<'_, ExportCancellationRegistry>,
    job_id: String,
) -> Result<bool, String> {
    let active = registry
        .0
        .lock()
        .map_err(|_| "导出取消注册表不可用".to_string())?;
    let Some(cancellation) = active.get(&job_id) else {
        return Ok(false);
    };
    cancellation.store(true, Ordering::Relaxed);
    quickpick_lib::project::mark_export_job_cancelling(&app_data_directory(&app)?, &job_id)?;
    Ok(true)
}

#[tauri::command]
fn save_manifest_file(path: String, content: String) -> Result<(), String> {
    write_manifest_file(&path, &content)
}

#[tauri::command]
fn reveal_directory(path: String) -> Result<(), String> {
    reveal_in_file_manager(&path)
}

#[tauri::command]
async fn export_shareable_jpegs(
    app: tauri::AppHandle,
    photos: Vec<DeliveryPhotoInput>,
    target_dir: String,
    max_edge: u32,
    quality: u8,
    lut_tables: Option<std::collections::HashMap<String, LutTablePayload>>,
) -> Result<RenderedExportResult, String> {
    let app_data_dir = app_data_directory(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        render_shareable_jpegs(
            &app_data_dir,
            &photos,
            std::path::Path::new(&target_dir),
            max_edge,
            quality,
            lut_tables.as_ref(),
        )
    })
    .await
    .map_err(|error| format!("JPEG 后台导出任务异常结束: {error}"))?
}

#[tauri::command]
async fn share_photos_via_air_drop(
    app: tauri::AppHandle,
    photos: Vec<DeliveryPhotoInput>,
    lut_tables: Option<std::collections::HashMap<String, LutTablePayload>>,
) -> Result<RenderedExportResult, String> {
    let app_data_dir = app_data_directory(&app)?;
    let share_dir = app_data_dir
        .join("share")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&share_dir)
        .map_err(|error| format!("创建 AirDrop 临时目录失败: {error}"))?;
    let cache_root = app_data_dir.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        render_shareable_jpegs(&cache_root, &photos, &share_dir, 2560, 90, lut_tables.as_ref())
    })
    .await
    .map_err(|error| format!("准备 AirDrop 照片异常结束: {error}"))??;
    if result.files.is_empty() {
        return Err("没有成功生成可供 AirDrop 的 JPEG".to_string());
    }
    let files = result.files.clone();
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let _ = sender.send(open_airdrop(&files));
    })
    .map_err(|error| format!("无法打开 macOS AirDrop: {error}"))?;
    receiver
        .recv_timeout(std::time::Duration::from_secs(5))
        .map_err(|_| "等待 macOS AirDrop 服务响应超时".to_string())??;
    Ok(result)
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

fn main() {
    let application = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().map_err(std::io::Error::other)?;
            let health = quickpick_lib::project::begin_app_session(&app_data_dir)
                .map_err(std::io::Error::other)?;
            app.manage(health);
            app.manage(ExportCancellationRegistry::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_engine_info,
            get_startup_health,
            scan_folder,
            get_photo_preview,
            open_project,
            save_selection,
            save_selections,
            mark_photo_viewed,
            save_project_view_state,
            list_recent_projects,
            relocate_project,
            analyze_photo_details,
            detect_photo_faces,
            preflight_export_photos,
            export_photos,
            cancel_export,
            save_manifest_file,
            reveal_directory,
            export_shareable_jpegs,
            share_photos_via_air_drop
        ])
        .build(tauri::generate_context!())
        .expect("error while building QuickPick application");

    application.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            match app_handle.path().app_data_dir() {
                Ok(app_data_dir) => {
                    if let Err(error) = quickpick_lib::project::end_app_session(&app_data_dir) {
                        eprintln!("{error}");
                    }
                }
                Err(error) => eprintln!("无法定位应用数据目录以清理会话标记: {error}"),
            }
        }
    });
}
