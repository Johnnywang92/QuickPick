import { create } from 'zustand';
import { ExportMode, LocalPhoto } from '../types/photo';
import {
  exportPhotos as tauriExportPhotos,
  cancelExport,
  preflightExportPhotos,
  selectDirectory,
  confirmAction,
  ExportPreflight,
  ExportResult,
  saveManifestFile,
} from '../services/tauriBridge';
import { useAlbumStore } from './albumStore';
import { useSelectionStore } from './selectionStore';

export type ManifestFormat = 'txt' | 'csv' | 'json';

function normalizePortablePath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
}

export function relativePhotoPath(photoPath: string, albumPath: string | null): string {
  const normalizedPhoto = normalizePortablePath(photoPath);
  if (!albumPath) return normalizedPhoto.split('/').pop() || normalizedPhoto;

  const normalizedAlbum = normalizePortablePath(albumPath);
  const caseInsensitive = /^[A-Za-z]:\//.test(normalizedAlbum);
  const comparablePhoto = caseInsensitive ? normalizedPhoto.toLocaleLowerCase() : normalizedPhoto;
  const comparableAlbum = caseInsensitive ? normalizedAlbum.toLocaleLowerCase() : normalizedAlbum;
  const prefix = comparableAlbum.endsWith('/') ? comparableAlbum : `${comparableAlbum}/`;
  if (comparablePhoto.startsWith(prefix)) {
    return normalizedPhoto.slice(prefix.length);
  }
  return normalizedPhoto.split('/').pop() || normalizedPhoto;
}

function albumNameFromPath(albumPath: string | null): string {
  if (!albumPath) return '未命名项目';
  const normalized = normalizePortablePath(albumPath);
  return normalized.split('/').filter(Boolean).pop() || normalized;
}

function safeCsvCell(value: string | number): string {
  const raw = String(value);
  const formulaSafe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

interface ExportStore {
  isExportModalOpen: boolean;
  exportMode: ExportMode;
  targetDir: string;
  includeXmp: boolean;
  openAfterExport: boolean;
  manifestFormat: ManifestFormat;

  isExporting: boolean;
  isCancelling: boolean;
  currentJobId: string | null;
  exportResult: ExportResult | null;
  preflightResult: ExportPreflight | null;
  errorMessage: string | null;
  manifestExportSuccess: boolean;

  // Actions
  setExportModalOpen: (open: boolean) => void;
  setExportMode: (mode: ExportMode) => void;
  setTargetDir: (dir: string) => void;
  setIncludeXmp: (include: boolean) => void;
  setOpenAfterExport: (open: boolean) => void;
  setManifestFormat: (fmt: ManifestFormat) => void;
  browseTargetDir: () => Promise<void>;
  getSelectedPhotos: () => LocalPhoto[];

  // Execution actions
  executeCopyRaw: () => Promise<void>;
  cancelCurrentExport: () => Promise<void>;
  generateManifestContent: () => string;
  downloadManifest: () => Promise<void>;
  copyManifestToClipboard: () => Promise<boolean>;
  resetExportState: () => void;
}

export const useExportStore = create<ExportStore>((set, get) => ({
  isExportModalOpen: false,
  exportMode: 'copy_raw',
  targetDir: '',
  includeXmp: false,
  openAfterExport: true,
  manifestFormat: 'txt',

  isExporting: false,
  isCancelling: false,
  currentJobId: null,
  exportResult: null,
  preflightResult: null,
  errorMessage: null,
  manifestExportSuccess: false,

  setExportModalOpen: (open: boolean) => {
    set({
      isExportModalOpen: open,
      // 必须由用户显式选择源相册之外的已存在目录。
      targetDir: '',
      errorMessage: null,
      exportResult: null,
      preflightResult: null,
      manifestExportSuccess: false,
      isCancelling: false,
      currentJobId: null,
    });
  },

  setExportMode: (mode: ExportMode) => {
    set({
      exportMode: mode,
      errorMessage: null,
      manifestExportSuccess: false,
      preflightResult: null,
    });
  },

  setTargetDir: (dir: string) => {
    set({ targetDir: dir, preflightResult: null });
  },

  setIncludeXmp: (include: boolean) => {
    set({ includeXmp: include, preflightResult: null });
  },

  setOpenAfterExport: (open: boolean) => {
    set({ openAfterExport: open });
  },

  setManifestFormat: (fmt: ManifestFormat) => {
    set({ manifestFormat: fmt });
  },

  browseTargetDir: async () => {
    const chosen = await selectDirectory('选择导出目标文件夹');
    if (chosen) {
      set({ targetDir: chosen, preflightResult: null });
    }
  },

  getSelectedPhotos: () => {
    const { photos } = useAlbumStore.getState();
    const { selections } = useSelectionStore.getState();
    return photos.filter((p) => selections[p.id]?.state === 'selected');
  },

  // 模式 A：复制所选原片 (安全红线：不移动、不覆盖、只复制、哈希校验)
  executeCopyRaw: async () => {
    const selectedPhotos = get().getSelectedPhotos();
    const { targetDir, includeXmp, openAfterExport } = get();

    if (selectedPhotos.length === 0) {
      set({ errorMessage: '当前没有标记为“已选”的照片' });
      return;
    }
    if (!targetDir.trim()) {
      set({ errorMessage: '请选择有效的导出目标文件夹' });
      return;
    }

    set({ isExporting: true, errorMessage: null, exportResult: null });

    try {
      const options = {
        photo_paths: selectedPhotos.map((p) => p.path),
        target_dir: targetDir,
        include_xmp: includeXmp,
        open_after_export: openAfterExport,
      };
      const preflight = await preflightExportPhotos(options);
      set({ preflightResult: preflight, isExporting: false });
      if (!preflight.has_enough_space) {
        const neededGb = (preflight.required_bytes / (1024 ** 3)).toFixed(2);
        const availableGb = (preflight.available_bytes / (1024 ** 3)).toFixed(2);
        set({ errorMessage: `目标空间不足：至少需要 ${neededGb} GB，当前可用 ${availableGb} GB` });
        return;
      }

      const conflictDetails = preflight.conflicts.length > 0
        ? `\n\n以下 ${preflight.conflicts.length} 个冲突将安全跳过：\n${preflight.conflicts
            .map((conflict) => `• ${conflict.target_path}\n  ${conflict.reason}`)
            .join('\n')}`
        : '\n\n未发现目标同名冲突。';
      const confirmed = await confirmAction(
        `即将复制 ${preflight.total_photos} 张照片（共 ${preflight.total_files} 个文件，${(
          preflight.total_bytes / (1024 ** 3)
        ).toFixed(2)} GB）。${conflictDetails}\n\n确认后才会创建导出任务，已有目标文件绝不会被覆盖。`,
        '确认安全导出',
      );
      if (!confirmed) return;

      const jobId = crypto.randomUUID();
      set({ isExporting: true, isCancelling: false, currentJobId: jobId, errorMessage: null });
      const result = await tauriExportPhotos(options, jobId);

      set({
        exportResult: result,
        isExporting: false,
        isCancelling: false,
        currentJobId: null,
      });
    } catch (e: any) {
      set({
        errorMessage: e?.toString() || '导出原片过程中发生异常',
        isExporting: false,
        isCancelling: false,
        currentJobId: null,
      });
    }
  },

  cancelCurrentExport: async () => {
    const { currentJobId, isExporting, isCancelling } = get();
    if (!currentJobId || !isExporting || isCancelling) return;
    set({ isCancelling: true, errorMessage: null });
    try {
      const accepted = await cancelExport(currentJobId);
      if (!accepted) {
        set({ isCancelling: false, errorMessage: '导出任务已结束，无法再取消' });
      }
    } catch (error) {
      set({
        isCancelling: false,
        errorMessage: `取消导出失败：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },

  // 模式 B：导出选片清单
  generateManifestContent: () => {
    const selectedPhotos = get().getSelectedPhotos();
    const { selections } = useSelectionStore.getState();
    const { folderPath } = useAlbumStore.getState();
    const { manifestFormat } = get();
    const projectName = albumNameFromPath(folderPath);
    const generatedAt = new Date().toISOString();
    const photos = selectedPhotos.map((photo) => ({
      relativePath: relativePhotoPath(photo.path, folderPath),
      filename: photo.filename,
      fileSizeBytes: photo.fileSize,
      capturedAt: photo.capturedAt || '',
      state: 'selected' as const,
      note: selections[photo.id]?.note || '',
    }));

    if (manifestFormat === 'txt') {
      return [
        'QuickPick 选片清单',
        `项目名称：${projectName}`,
        `生成时间：${generatedAt}`,
        `选中数量：${photos.length}`,
        '',
        ...photos.map((photo) => photo.relativePath),
      ].join('\n');
    }

    if (manifestFormat === 'csv') {
      const header = [
        '项目名称',
        '生成时间',
        '选中数量',
        '相对路径',
        '文件名',
        '文件大小(MB)',
        '拍摄时间',
        '状态',
        '用户备注',
      ].map(safeCsvCell).join(',');
      const rows = photos.map((photo) =>
        [
          projectName,
          generatedAt,
          photos.length,
          photo.relativePath,
          photo.filename,
          (photo.fileSizeBytes / (1024 * 1024)).toFixed(2),
          photo.capturedAt,
          '已选',
          photo.note,
        ].map(safeCsvCell).join(','),
      );
      return `\uFEFF${[header, ...rows].join('\r\n')}`;
    }

    // JSON 格式
    return JSON.stringify(
      {
        projectName,
        generatedAt,
        selectedCount: photos.length,
        photos,
      },
      null,
      2,
    );
  },

  downloadManifest: async () => {
    const content = get().generateManifestContent();
    const { manifestFormat } = get();
    set({ isExporting: true, errorMessage: null });
    try {
      const savedPath = await saveManifestFile(content, manifestFormat);
      set({ isExporting: false, manifestExportSuccess: Boolean(savedPath) });
    } catch (error) {
      set({
        isExporting: false,
        errorMessage: `清单保存失败：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },

  copyManifestToClipboard: async () => {
    const content = get().generateManifestContent();
    try {
      await navigator.clipboard.writeText(content);
      set({ manifestExportSuccess: true });
      return true;
    } catch {
      return false;
    }
  },

  resetExportState: () => {
    set({
      exportResult: null,
      preflightResult: null,
      errorMessage: null,
      manifestExportSuccess: false,
      isExporting: false,
      isCancelling: false,
      currentJobId: null,
    });
  },
}));
