import { invoke } from '@tauri-apps/api/core';
import { open, ask, message, save } from '@tauri-apps/plugin-dialog';
import type { ExifMetadata, FaceInfo } from '../types/photo';

export type { ExifMetadata, FaceInfo } from '../types/photo';

export interface DefectTag {
  id: string;
  category: 'info' | 'warning';
  label: string;
  confidence: number;
  hint?: string;
}

export interface PhotoItem {
  id: string;
  path: string;
  filename: string;
  file_size: u64;
  is_raw: boolean;
  thumb_width?: number;
  thumb_height?: number;
  burst_group_id?: string;
  exif?: ExifMetadata;
}

export interface PhotoAnalysisResult {
  exif?: ExifMetadata | null;
  analysis_status: 'pending' | 'no_issues' | 'needs_check' | 'failed';
  defect_tags: DefectTag[];
  faces: FaceInfo[];
  preview_width?: number | null;
  preview_height?: number | null;
  phash?: string | null;
  sharpness?: number | null;
}

type u64 = number;

export interface EngineInfo {
  libraw_version: string;
  status: string;
}

export interface StartupHealth {
  previous_session_unclean: boolean;
  database_recovered: boolean;
  database_error?: string;
  recovered_export_jobs: number;
  cleaned_export_temp_files: number;
  export_recovery_error?: string;
}

export interface PersistedSelection {
  photo_id: string;
  state: 'unreviewed' | 'selected' | 'maybe' | 'skipped';
  note?: string;
  updated_at: string;
}

export interface ProjectState {
  project_id: string;
  selections: PersistedSelection[];
  viewed_photo_ids: string[];
  backup_warning?: string;
  current_photo_id?: string;
  target_count?: number;
  active_filter: string;
  selected_scene_id?: string;
  active_preset_id: string;
  scenes_json: string;
  photo_id_remaps: Record<string, string>;
}

export interface PersistenceOutcome {
  backup_warning?: string;
}

export interface ProjectViewStateInput {
  current_photo_id?: string;
  target_count?: number;
  active_filter: string;
  selected_scene_id?: string;
  active_preset_id: string;
  scenes_json: string;
}

export interface RecentProject {
  project_id: string;
  source_root: string;
  display_name: string;
  updated_at: string;
  photo_count: number;
  viewed_count: number;
  selected_count: number;
  source_available: boolean;
}

// 检查是否在 Tauri 原生桌面环境中运行
export const isTauri = () => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

export async function fetchEngineInfo(): Promise<EngineInfo> {
  if (!isTauri()) {
    return { libraw_version: 'Web Mock 0.22.2', status: 'Web Dev Mode' };
  }
  return await invoke<EngineInfo>('get_engine_info');
}

export async function fetchStartupHealth(): Promise<StartupHealth> {
  if (!isTauri()) {
    return {
      previous_session_unclean: false,
      database_recovered: false,
      recovered_export_jobs: 0,
      cleaned_export_temp_files: 0,
    };
  }
  return await invoke<StartupHealth>('get_startup_health');
}

export async function selectFolder(): Promise<string | null> {
  if (!isTauri()) {
    // 浏览器模拟模式
    return '/Users/mock/Pictures/Wedding_2026';
  }
  const selected = await open({
    directory: true,
    multiple: false,
    title: '选择包含 RAW / JPG 的照片目录',
  });

  if (typeof selected === 'string') {
    return selected;
  }
  return null;
}

export async function detectPhotoFaces(path: string): Promise<FaceInfo[]> {
  if (!isTauri()) {
    return [];
  }
  return await invoke<FaceInfo[]>('detect_photo_faces', { path });
}

export async function scanFolder(folderPath: string): Promise<PhotoItem[]> {
  if (!isTauri()) {
    // 浏览器模拟扫描仅返回只读文件元数据；分析结果由后台分析接口单独返回。
    return [
      {
        id: 'mock-1',
        path: `${folderPath}/_DSC0001.ARW`,
        filename: '_DSC0001.ARW',
        file_size: 42800000,
        is_raw: true,
        burst_group_id: 'burst-grp-001',
        exif: {
          camera_make: 'SONY',
          camera_model: 'ILCE-7RM5',
          lens_model: 'FE 24-70mm F2.8 GM II',
          lens_make: 'Sony',
          focal_length: 50.0,
          focal_length_35mm: 50,
          aperture: 2.8,
          shutter_speed: '1/500s',
          shutter_speed_value: 0.002,
          iso: 100,
          date_time_original: '2026-08-15 14:30:12',
        },
      },
      {
        id: 'mock-2',
        path: `${folderPath}/_DSC0002.ARW`,
        filename: '_DSC0002.ARW',
        file_size: 43100000,
        is_raw: true,
        burst_group_id: 'burst-grp-001',
        exif: {
          camera_make: 'SONY',
          camera_model: 'ILCE-7RM5',
          lens_model: 'FE 24-70mm F2.8 GM II',
          lens_make: 'Sony',
          focal_length: 50.0,
          focal_length_35mm: 50,
          aperture: 2.8,
          shutter_speed: '1/500s',
          shutter_speed_value: 0.002,
          iso: 100,
          date_time_original: '2026-08-15 14:30:13',
        },
      },
      {
        id: 'mock-3',
        path: `${folderPath}/_DSC0003.ARW`,
        filename: '_DSC0003.ARW',
        file_size: 41900000,
        is_raw: true,
        exif: {
          camera_make: 'SONY',
          camera_model: 'ILCE-7RM5',
          lens_model: 'FE 85mm F1.4 GM',
          lens_make: 'Sony',
          focal_length: 85.0,
          focal_length_35mm: 85,
          aperture: 1.4,
          shutter_speed: '1/160s',
          shutter_speed_value: 0.00625,
          iso: 800,
          date_time_original: '2026-08-15 15:10:05',
        },
      },
      {
        id: 'mock-4',
        path: `${folderPath}/_DSC0004.ARW`,
        filename: '_DSC0004.ARW',
        file_size: 44200000,
        is_raw: true,
        exif: {
          camera_make: 'Canon',
          camera_model: 'EOS R5',
          lens_model: 'RF 24-70mm F2.8 L IS USM',
          lens_make: 'Canon',
          focal_length: 35.0,
          focal_length_35mm: 35,
          aperture: 4.0,
          shutter_speed: '1/250s',
          shutter_speed_value: 0.004,
          iso: 200,
          date_time_original: '2026-08-15 16:05:40',
        },
      },
      {
        id: 'mock-5',
        path: `${folderPath}/_DSC0005.ARW`,
        filename: '_DSC0005.ARW',
        file_size: 43500000,
        is_raw: true,
        exif: {
          camera_make: 'Nikon',
          camera_model: 'Z 8',
          lens_model: 'NIKKOR Z 50mm f/1.2 S',
          lens_make: 'Nikon',
          focal_length: 50.0,
          focal_length_35mm: 50,
          aperture: 1.2,
          shutter_speed: '1/1000s',
          shutter_speed_value: 0.001,
          iso: 64,
          date_time_original: '2026-08-15 16:45:22',
        },
      },
    ];
  }
  return await invoke<PhotoItem[]>('scan_folder', { path: folderPath });
}

export async function openProjectState(
  folderPath: string,
  photos: PhotoItem[],
): Promise<ProjectState> {
  if (!isTauri()) {
    return {
      project_id: `web:${folderPath}`,
      selections: [],
      viewed_photo_ids: [],
      backup_warning: undefined,
      current_photo_id: undefined,
      target_count: undefined,
      active_filter: 'all',
      selected_scene_id: undefined,
      active_preset_id: 'general',
      scenes_json: '[]',
      photo_id_remaps: Object.fromEntries(photos.map((photo) => [photo.id, photo.id])),
    };
  }
  return await invoke<ProjectState>('open_project', {
    folderPath,
    photos: photos.map((photo) => ({
      photo_id: photo.id,
      path: photo.path,
      filename: photo.filename,
      file_size: photo.file_size,
      format: photo.is_raw
        ? 'raw'
        : photo.filename.split('.').pop()?.toLowerCase() || 'unknown',
      captured_at: photo.exif?.date_time_original,
    })),
  });
}

export async function relocateProjectState(
  projectId: string,
  folderPath: string,
  photos: PhotoItem[],
): Promise<ProjectState> {
  if (!isTauri()) return await openProjectState(folderPath, photos);
  return await invoke<ProjectState>('relocate_project', {
    projectId,
    folderPath,
    photos: photos.map((photo) => ({
      photo_id: photo.id,
      path: photo.path,
      filename: photo.filename,
      file_size: photo.file_size,
      format: photo.is_raw
        ? 'raw'
        : photo.filename.split('.').pop()?.toLowerCase() || 'unknown',
      captured_at: photo.exif?.date_time_original,
    })),
  });
}

export async function persistSelection(
  projectId: string,
  selection: PersistedSelection,
): Promise<PersistenceOutcome> {
  if (!isTauri()) return {};
  return await invoke<PersistenceOutcome>('save_selection', { projectId, selection });
}

export async function persistSelections(
  projectId: string,
  selections: PersistedSelection[],
): Promise<PersistenceOutcome> {
  if (!isTauri()) return {};
  return await invoke<PersistenceOutcome>('save_selections', { projectId, selections });
}

export async function persistViewedPhoto(
  projectId: string,
  photoId: string,
): Promise<PersistenceOutcome> {
  if (!isTauri()) return {};
  return await invoke<PersistenceOutcome>('mark_photo_viewed', { projectId, photoId });
}

export async function persistProjectViewState(
  projectId: string,
  state: ProjectViewStateInput,
): Promise<PersistenceOutcome> {
  if (!isTauri()) return {};
  return await invoke<PersistenceOutcome>('save_project_view_state', { projectId, state });
}

export async function listRecentProjects(): Promise<RecentProject[]> {
  if (!isTauri()) return [];
  return await invoke<RecentProject[]>('list_recent_projects');
}

export async function getPhotoPreview(photoPath: string, photoId?: string): Promise<string> {
  if (!isTauri()) {
    // 生成带文件名的动态 SVG 占位图
    const filename = photoPath.split('/').pop() || 'photo';
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1066" viewBox="0 0 1600 1066"><rect width="100%" height="100%" fill="%231e2430"/><circle cx="800" cy="500" r="180" fill="%232b3344"/><text x="800" y="530" font-family="sans-serif" font-size="36" fill="%2394a3b8" text-anchor="middle">${filename}</text><text x="800" y="580" font-family="sans-serif" font-size="20" fill="%2364748b" text-anchor="middle">QuickPick 60fps Native WebGL Preview</text></svg>`;
  }
  return await invoke<string>('get_photo_preview', { path: photoPath, photoId });
}

export async function analyzePhotoDetails(
  path: string,
  index: number,
  photoId?: string,
  scene?: string,
): Promise<PhotoAnalysisResult> {
  if (!isTauri()) {
    return {
      analysis_status: 'no_issues',
      defect_tags: [],
      faces: [],
      preview_width: 1600,
      preview_height: 1066,
      phash: '0000000000000000',
      sharpness: 80,
    };
  }
  return await invoke<PhotoAnalysisResult>('analyze_photo_details', {
    path,
    index,
    photoId,
    scene,
  });
}

export interface ExportOptions {
  photo_paths: string[];
  target_dir: string;
  include_xmp: boolean;
  open_after_export: boolean;
}

export interface ExportResult {
  job_id: string;
  total: number;
  success_photos: number;
  success_xmps: number;
  skipped: number;
  failed: number;
  unprocessed: number;
  cancelled: boolean;
  target_directory: string;
  errors: string[];
}

export interface ExportConflict {
  source_path: string;
  target_path: string;
  reason: string;
}

export interface ExportPreflight {
  total_photos: number;
  total_files: number;
  total_bytes: number;
  required_bytes: number;
  available_bytes: number;
  has_enough_space: boolean;
  conflicts: ExportConflict[];
}

export async function selectDirectory(title = '选择导出目标文件夹'): Promise<string | null> {
  if (!isTauri()) {
    return '/Users/mock/Pictures/QuickPick_Export';
  }
  const selected = await open({
    directory: true,
    multiple: false,
    title,
  });

  if (typeof selected === 'string') {
    return selected;
  }
  return null;
}

export async function saveManifestFile(
  content: string,
  extension: 'txt' | 'csv' | 'json' | 'html',
): Promise<string | null> {
  const defaultFilename =
    extension === 'html' ? 'QuickPick_修图指示书.html' : `QuickPick_Selected_List.${extension}`;
  if (!isTauri()) {
    const mimeType = extension === 'html' ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8';
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return link.download;
  }
  const selected = await save({
    title: extension === 'html' ? '保存精修指示书' : '保存选片清单',
    defaultPath: defaultFilename,
    filters: [
      {
        name: extension === 'html' ? 'HTML 网页指示单' : `${extension.toUpperCase()} 清单`,
        extensions: [extension],
      },
    ],
  });
  if (!selected) return null;
  await invoke('save_manifest_file', { path: selected, content });
  return selected;
}

export async function exportPhotos(options: ExportOptions, jobId: string): Promise<ExportResult> {
  if (!isTauri()) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return {
      job_id: jobId,
      total: options.photo_paths.length,
      success_photos: options.photo_paths.length,
      success_xmps: options.include_xmp ? options.photo_paths.length : 0,
      skipped: 0,
      failed: 0,
      unprocessed: 0,
      cancelled: false,
      target_directory: options.target_dir,
      errors: [],
    };
  }
  return await invoke<ExportResult>('export_photos', { options, jobId });
}

export async function cancelExport(jobId: string): Promise<boolean> {
  if (!isTauri()) return true;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const accepted = await invoke<boolean>('cancel_export', { jobId });
    if (accepted) return true;
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  return false;
}

export async function preflightExportPhotos(options: ExportOptions): Promise<ExportPreflight> {
  if (!isTauri()) {
    return {
      total_photos: options.photo_paths.length,
      total_files: options.photo_paths.length,
      total_bytes: 0,
      required_bytes: 1024 * 1024,
      available_bytes: 1024 * 1024 * 1024 * 100,
      has_enough_space: true,
      conflicts: [],
    };
  }
  return await invoke<ExportPreflight>('preflight_export_photos', { options });
}

export async function revealDirectory(path: string): Promise<void> {
  if (!isTauri()) {
    console.log(`[Mock Reveal Directory] ${path}`);
    return;
  }
  await invoke('reveal_directory', { path });
}

function renderWebDialog(
  msg: string,
  title: string,
  isConfirm: boolean,
): Promise<boolean> {
  if (typeof document === 'undefined') {
    return Promise.resolve(true);
  }
  return new Promise<boolean>((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '999999';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.65)';
    overlay.style.backdropFilter = 'blur(4px)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.fontFamily = 'system-ui, -apple-system, sans-serif';

    const box = document.createElement('div');
    box.style.backgroundColor = '#1e293b';
    box.style.color = '#f8fafc';
    box.style.borderRadius = '12px';
    box.style.border = '1px solid #334155';
    box.style.padding = '20px 24px';
    box.style.maxWidth = '420px';
    box.style.width = '90%';
    box.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.5)';

    const titleEl = document.createElement('div');
    titleEl.innerText = title;
    titleEl.style.fontSize = '16px';
    titleEl.style.fontWeight = '600';
    titleEl.style.marginBottom = '10px';
    titleEl.style.color = '#38bdf8';

    const msgEl = document.createElement('div');
    msgEl.innerText = msg;
    msgEl.style.fontSize = '14px';
    msgEl.style.color = '#cbd5e1';
    msgEl.style.lineHeight = '1.5';
    msgEl.style.marginBottom = '20px';
    msgEl.style.wordBreak = 'break-word';

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.justifyContent = 'flex-end';
    btnRow.style.gap = '10px';

    const cleanup = (res: boolean) => {
      document.removeEventListener('keydown', keyHandler);
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
      resolve(res);
    };

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cleanup(false);
      if (e.key === 'Enter') cleanup(true);
    };
    document.addEventListener('keydown', keyHandler);

    if (isConfirm) {
      const cancelBtn = document.createElement('button');
      cancelBtn.innerText = '取消';
      cancelBtn.style.padding = '6px 14px';
      cancelBtn.style.borderRadius = '6px';
      cancelBtn.style.border = '1px solid #475569';
      cancelBtn.style.backgroundColor = '#334155';
      cancelBtn.style.color = '#e2e8f0';
      cancelBtn.style.cursor = 'pointer';
      cancelBtn.style.fontSize = '13px';
      cancelBtn.onclick = () => cleanup(false);
      btnRow.appendChild(cancelBtn);
    }

    const okBtn = document.createElement('button');
    okBtn.innerText = '确定';
    okBtn.style.padding = '6px 16px';
    okBtn.style.borderRadius = '6px';
    okBtn.style.border = 'none';
    okBtn.style.backgroundColor = '#0284c7';
    okBtn.style.color = '#ffffff';
    okBtn.style.cursor = 'pointer';
    okBtn.style.fontSize = '13px';
    okBtn.style.fontWeight = '500';
    okBtn.onclick = () => cleanup(true);
    btnRow.appendChild(okBtn);

    box.appendChild(titleEl);
    box.appendChild(msgEl);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    okBtn.focus();
  });
}

export async function confirmAction(msg: string, title = '操作确认'): Promise<boolean> {
  if (!isTauri()) {
    return renderWebDialog(msg, title, true);
  }
  return await ask(msg, { title, kind: 'warning' });
}

export async function showAlert(msg: string, title = '提示'): Promise<void> {
  if (!isTauri()) {
    await renderWebDialog(msg, title, false);
    return;
  }
  await message(msg, { title, kind: 'info' });
}
