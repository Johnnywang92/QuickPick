import { invoke } from '@tauri-apps/api/core';
import { open, ask, message } from '@tauri-apps/plugin-dialog';

export type RetouchStatus = 'clean' | 'fixable' | 'fatal' | 'pending' | 'failed';

export interface DefectTag {
  id: string;
  category: 'clean' | 'fixable' | 'fatal';
  label: string;
  confidence: number;
  hint?: string;
}

export interface FaceInfo {
  id: string;
  x: number;              // 归一化 0.0 ~ 1.0 (左上角)
  y: number;
  width: number;
  height: number;
  eye_open_score: number; // 0.0 (完全闭眼) ~ 1.0 (完全睁开)
  sharpness: number;      // 0 ~ 100 局部锐度
  is_pinned: boolean;     // 摄影师主角钉选
  priority: number;       // 归一化优先级
  label?: string;
}

export interface PhotoItem {
  id: string;
  path: string;
  filename: string;
  file_size: u64;
  is_raw: boolean;
  rating: number;          // 0~5
  color_label: string;     // "", "Red", "Yellow", "Green", "Blue", "Purple"
  pick_status: string;     // "None", "Pick", "Reject"
  thumb_width?: number;
  thumb_height?: number;
  retouch_status: RetouchStatus;
  defect_tags: DefectTag[];
  burst_group_id?: string;
  faces: FaceInfo[];
  xmp_source_hash?: string;
}

type u64 = number;

export interface EngineInfo {
  libraw_version: string;
  status: string;
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

export async function generateFolderCache(folderPath: string): Promise<number> {
  if (!isTauri()) {
    // 浏览器模拟模式
    await new Promise((res) => setTimeout(res, 1200));
    return 5;
  }
  return await invoke<number>('generate_folder_cache', { path: folderPath });
}

export async function scanFolder(folderPath: string): Promise<PhotoItem[]> {
  if (!isTauri()) {
    // Mock 数据：覆盖优质主片、连拍可换脸可修片、不可修硬伤片、8人合影闭眼
    return [
      {
        id: 'mock-1',
        path: `${folderPath}/_DSC0001.ARW`,
        filename: '_DSC0001.ARW',
        file_size: 42800000,
        is_raw: true,
        rating: 5,
        color_label: 'Green',
        pick_status: 'Pick',
        retouch_status: 'clean',
        burst_group_id: 'burst-grp-001',
        defect_tags: [
          {
            id: 'clean_prime',
            category: 'clean',
            label: '完美原片',
            confidence: 0.96,
            hint: '眼神锐利、曝光自然平衡，无可见瑕疵，建议直接采纳',
          },
        ],
        faces: [
          {
            id: 'face_1',
            x: 0.38,
            y: 0.26,
            width: 0.16,
            height: 0.22,
            eye_open_score: 0.96,
            sharpness: 96.0,
            is_pinned: true,
            priority: 10.85,
            label: '新娘主角',
          },
          {
            id: 'face_2',
            x: 0.55,
            y: 0.28,
            width: 0.15,
            height: 0.21,
            eye_open_score: 0.92,
            sharpness: 92.0,
            is_pinned: false,
            priority: 0.78,
            label: '新郎主角',
          },
        ],
      },
      {
        id: 'mock-2',
        path: `${folderPath}/_DSC0002.ARW`,
        filename: '_DSC0002.ARW',
        file_size: 43100000,
        is_raw: true,
        rating: 0,
        color_label: '',
        pick_status: 'None',
        retouch_status: 'fixable',
        burst_group_id: 'burst-grp-001',
        defect_tags: [
          {
            id: 'fixable_burst_swap',
            category: 'fixable',
            label: '连拍可换脸/换眼',
            confidence: 0.95,
            hint: '新郎微闭眼，但同组候选底片 [_DSC0001.ARW] 睁眼极佳，推荐使用 Face Loupe 眼神替换',
          },
        ],
        faces: [
          {
            id: 'face_1',
            x: 0.38,
            y: 0.26,
            width: 0.16,
            height: 0.22,
            eye_open_score: 0.95,
            sharpness: 94.0,
            is_pinned: true,
            priority: 10.84,
            label: '新娘主角',
          },
          {
            id: 'face_2',
            x: 0.55,
            y: 0.28,
            width: 0.15,
            height: 0.21,
            eye_open_score: 0.22, // 闭眼
            sharpness: 90.0,
            is_pinned: false,
            priority: 0.77,
            label: '新郎 (闭眼)',
          },
        ],
      },
      {
        id: 'mock-3',
        path: `${folderPath}/_DSC0003.ARW`,
        filename: '_DSC0003.ARW',
        file_size: 41900000,
        is_raw: true,
        rating: 0,
        color_label: '',
        pick_status: 'None',
        retouch_status: 'fatal',
        defect_tags: [
          {
            id: 'fatal_severe_blur',
            category: 'fatal',
            label: '严重脱焦/拖影',
            confidence: 0.94,
            hint: '焦点落在背景，人物面部双向拉丝模糊，商业客照无法真实还原',
          },
        ],
        faces: [
          {
            id: 'face_1',
            x: 0.42,
            y: 0.30,
            width: 0.18,
            height: 0.24,
            eye_open_score: 0.40,
            sharpness: 18.0, // 模糊
            is_pinned: false,
            priority: 0.65,
            label: '脱焦人物',
          },
        ],
      },
      {
        id: 'mock-4',
        path: `${folderPath}/_DSC0004.ARW`,
        filename: '_DSC0004.ARW',
        file_size: 44200000,
        is_raw: true,
        rating: 0,
        color_label: '',
        pick_status: 'None',
        retouch_status: 'fixable',
        defect_tags: [
          {
            id: 'group_photo_blink',
            category: 'fixable',
            label: '大合影闭眼 (1人)',
            confidence: 0.92,
            hint: '伴郎 C 闭眼，其余全员睁眼，可借同组连拍换眼解决',
          },
        ],
        // 8 人大合影场景：测试 Top 6 截断与闭眼一票否决
        faces: [
          {
            id: 'face_1',
            x: 0.42,
            y: 0.35,
            width: 0.10,
            height: 0.14,
            eye_open_score: 0.95,
            sharpness: 96.0,
            is_pinned: true,
            priority: 10.6,
            label: '新娘 (主角)',
          },
          {
            id: 'face_2',
            x: 0.52,
            y: 0.34,
            width: 0.10,
            height: 0.14,
            eye_open_score: 0.94,
            sharpness: 94.0,
            is_pinned: true,
            priority: 10.5,
            label: '新郎 (主角)',
          },
          {
            id: 'face_3',
            x: 0.32,
            y: 0.36,
            width: 0.08,
            height: 0.12,
            eye_open_score: 0.90,
            sharpness: 90.0,
            is_pinned: false,
            priority: 0.52,
            label: '伴娘 A',
          },
          {
            id: 'face_4',
            x: 0.62,
            y: 0.36,
            width: 0.08,
            height: 0.12,
            eye_open_score: 0.91,
            sharpness: 89.0,
            is_pinned: false,
            priority: 0.51,
            label: '伴郎 A',
          },
          {
            id: 'face_5',
            x: 0.22,
            y: 0.37,
            width: 0.07,
            height: 0.11,
            eye_open_score: 0.88,
            sharpness: 88.0,
            is_pinned: false,
            priority: 0.42,
            label: '伴娘 B',
          },
          {
            id: 'face_6',
            x: 0.72,
            y: 0.37,
            width: 0.07,
            height: 0.11,
            eye_open_score: 0.89,
            sharpness: 87.0,
            is_pinned: false,
            priority: 0.41,
            label: '伴郎 B',
          },
          // 第 7, 8 位属于背景人物 (超出 Top 6)
          {
            id: 'face_7',
            x: 0.12,
            y: 0.38,
            width: 0.06,
            height: 0.10,
            eye_open_score: 0.85,
            sharpness: 82.0,
            is_pinned: false,
            priority: 0.30,
            label: '伴娘 C',
          },
          {
            id: 'face_8',
            x: 0.82,
            y: 0.38,
            width: 0.06,
            height: 0.10,
            eye_open_score: 0.18, // 闭眼！触发气泡警告
            sharpness: 81.0,
            is_pinned: false,
            priority: 0.29,
            label: '伴郎 C (闭眼)',
          },
        ],
      },
      {
        id: 'mock-5',
        path: `${folderPath}/_DSC0005.ARW`,
        filename: '_DSC0005.ARW',
        file_size: 43500000,
        is_raw: true,
        rating: 4,
        color_label: '',
        pick_status: 'None',
        retouch_status: 'clean',
        defect_tags: [
          {
            id: 'clean_prime',
            category: 'clean',
            label: '完美原片',
            confidence: 0.93,
            hint: '合焦准确无拖影，自然漫反射光影，人物笑容舒展',
          },
        ],
        faces: [
          {
            id: 'face_1',
            x: 0.45,
            y: 0.32,
            width: 0.14,
            height: 0.18,
            eye_open_score: 0.94,
            sharpness: 95.0,
            is_pinned: false,
            priority: 0.82,
            label: '单人特写',
          },
        ],
      },
    ];
  }
  return await invoke<PhotoItem[]>('scan_folder', { path: folderPath });
}

export async function getPhotoPreview(photoPath: string): Promise<string> {
  if (!isTauri()) {
    // 生成带文件名的动态 SVG 占位图
    const filename = photoPath.split('/').pop() || 'photo';
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1066" viewBox="0 0 1600 1066"><rect width="100%" height="100%" fill="%231e2430"/><circle cx="800" cy="500" r="180" fill="%232b3344"/><text x="800" y="530" font-family="sans-serif" font-size="36" fill="%2394a3b8" text-anchor="middle">${filename}</text><text x="800" y="580" font-family="sans-serif" font-size="20" fill="%2364748b" text-anchor="middle">QuickPick 60fps Native WebGL Preview</text></svg>`;
  }
  return await invoke<string>('get_photo_preview', { path: photoPath });
}

export async function analyzePhoto(
  path: string,
  index: number,
): Promise<[RetouchStatus, DefectTag[]]> {
  if (!isTauri()) {
    return ['clean', []];
  }
  return await invoke<[RetouchStatus, DefectTag[]]>('analyze_photo', { path, index });
}

export async function updatePhotoTriage(
  path: string,
  rating: number,
  colorLabel: string,
  pickStatus: string,
  retouchStatus?: string,
  defectTags?: string,
  burstGroupId?: string,
  expectedSourceHash?: string,
  force = false,
): Promise<string> {
  if (!isTauri()) {
    console.log(`[Mock XMP Write] ${path} -> Rating: ${rating}, Label: ${colorLabel}, Pick: ${pickStatus}`);
    return `mock-${Date.now()}-${Math.random()}`;
  }
  return await invoke<string>('update_triage', {
    path,
    rating,
    colorLabel,
    pickStatus,
    retouchStatus,
    defectTags,
    burstGroupId,
    expectedSourceHash,
    force,
  });
}

export async function savePhotoTriageConflictCopy(
  path: string,
  rating: number,
  colorLabel: string,
  pickStatus: string,
  retouchStatus?: string,
  defectTags?: string,
  burstGroupId?: string,
): Promise<string> {
  if (!isTauri()) {
    return `${path}.quickpick-local-${Date.now()}.xmp`;
  }
  return await invoke<string>('save_triage_conflict_copy', {
    path,
    rating,
    colorLabel,
    pickStatus,
    retouchStatus,
    defectTags,
    burstGroupId,
  });
}

export interface ExportOptions {
  photo_paths: string[];
  target_dir: string;
  is_move: boolean;
  include_xmp: boolean;
  overwrite: boolean;
  open_after_export: boolean;
}

export interface ExportResult {
  total: number;
  success_photos: number;
  success_xmps: number;
  skipped: number;
  failed: number;
  target_directory: string;
  errors: string[];
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

export async function exportPhotos(options: ExportOptions): Promise<ExportResult> {
  if (!isTauri()) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return {
      total: options.photo_paths.length,
      success_photos: options.photo_paths.length,
      success_xmps: options.include_xmp ? options.photo_paths.length : 0,
      skipped: 0,
      failed: 0,
      target_directory: options.target_dir,
      errors: [],
    };
  }
  return await invoke<ExportResult>('export_photos', { options });
}

export async function revealDirectory(path: string): Promise<void> {
  if (!isTauri()) {
    console.log(`[Mock Reveal Directory] ${path}`);
    return;
  }
  await invoke('reveal_directory', { path });
}

export async function confirmAction(msg: string, title = '操作确认'): Promise<boolean> {
  if (!isTauri()) {
    return window.confirm(msg);
  }
  return await ask(msg, { title, kind: 'warning' });
}

export async function showAlert(msg: string, title = '提示'): Promise<void> {
  if (!isTauri()) {
    window.alert(msg);
    return;
  }
  await message(msg, { title, kind: 'info' });
}

