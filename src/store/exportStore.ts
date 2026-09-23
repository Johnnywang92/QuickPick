import { create } from 'zustand';
import { ExportMode, ExportPurpose, LocalPhoto, ManifestFormat } from '../types/photo';
export type { ExportPurpose, ManifestFormat };
import {
  exportPhotos as tauriExportPhotos,
  cancelExport,
  preflightExportPhotos,
  selectDirectory,
  confirmAction,
  ExportPreflight,
  ExportResult,
  saveManifestFile,
  exportShareableJpegs,
  sharePhotosViaAirDrop,
  shareCustomImagesViaAirDrop,
  CustomImageSharePayload,
  getPhotoPreview,
  RenderedExportResult,
} from '../services/tauriBridge';
import { useAlbumStore } from './albumStore';
import { useSelectionStore } from './selectionStore';
import { useLutStore } from './lutStore';
import { useAdjustStore } from './adjustStore';
import { renderFramedPhotoCanvas } from '../utils/frameRenderer';
import { generateBuiltinLutData } from '../utils/lutPresets';
import { generateRetouchHtmlReport } from '../utils/reportGenerator';
import { parseAnnotation } from '../utils/annotationUtils';

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

function escapeLuaString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

function buildLutTablesForPhotos(
  photoConfigs: Array<{ lutId?: string | null }>,
): Record<string, { size: number; data_base64: string }> {
  const lutStore = useLutStore.getState();
  const tables: Record<string, { size: number; data_base64: string }> = {};

  for (const item of photoConfigs) {
    if (!item.lutId || tables[item.lutId]) continue;

    if (item.lutId.startsWith('custom_')) {
      const custom = lutStore.customLuts.find((c) => c.id === item.lutId);
      if (custom) {
        tables[item.lutId] = {
          size: custom.size,
          data_base64: custom.dataBase64,
        };
      }
    } else {
      try {
        const rawData = generateBuiltinLutData(item.lutId, 33);
        let binary = '';
        for (let i = 0; i < rawData.byteLength; i++) {
          binary += String.fromCharCode(rawData[i]);
        }
        tables[item.lutId] = {
          size: 33,
          data_base64: window.btoa(binary),
        };
      } catch (e) {
        console.warn('生成内置 LUT 导出数据失败', e);
      }
    }
  }

  return tables;
}

interface ExportStore {
  isExportModalOpen: boolean;
  exportMode: ExportMode;
  exportPurpose: ExportPurpose;
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
  renderedExportResult: RenderedExportResult | null;
  exportTagFilter: string | null;
  bakeLutEffect: boolean;
  bakeFrameEffect: boolean;

  // Actions
  setExportModalOpen: (open: boolean) => void;
  setExportMode: (mode: ExportMode) => void;
  setExportPurpose: (purpose: ExportPurpose) => void;
  setTargetDir: (dir: string) => void;
  setIncludeXmp: (include: boolean) => void;
  setOpenAfterExport: (open: boolean) => void;
  setManifestFormat: (fmt: ManifestFormat) => void;
  setExportTagFilter: (tag: string | null) => void;
  setBakeLutEffect: (bake: boolean) => void;
  setBakeFrameEffect: (bake: boolean) => void;
  browseTargetDir: () => Promise<void>;
  getSelectedPhotos: () => LocalPhoto[];

  // Execution actions
  executeCopyRaw: () => Promise<void>;
  cancelCurrentExport: () => Promise<void>;
  generateManifestContent: () => string;
  downloadManifest: () => Promise<void>;
  copyManifestToClipboard: () => Promise<boolean>;
  executeSocialExport: () => Promise<void>;
  shareToPhone: () => Promise<void>;
  resetExportState: () => void;
}

export const useExportStore = create<ExportStore>((set, get) => ({
  isExportModalOpen: false,
  exportMode: 'copy_raw',
  exportPurpose: 'photographer',
  targetDir: '',
  includeXmp: true,
  openAfterExport: true,
  manifestFormat: 'txt',
  bakeLutEffect: true,
  bakeFrameEffect: false,

  isExporting: false,
  isCancelling: false,
  currentJobId: null,
  exportResult: null,
  preflightResult: null,
  errorMessage: null,
  manifestExportSuccess: false,
  renderedExportResult: null,
  exportTagFilter: null,

  setExportModalOpen: (open: boolean) => {
    set({
      isExportModalOpen: open,
      // 必须由用户显式选择源相册之外的已存在目录。
      targetDir: '',
      exportTagFilter: null,
      errorMessage: null,
      exportResult: null,
      preflightResult: null,
      manifestExportSuccess: false,
      renderedExportResult: null,
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

  setExportPurpose: (purpose: ExportPurpose) => {
    const manifestPurpose = purpose === 'photographer' && get().exportMode === 'manifest';
    set({
      exportPurpose: purpose,
      exportMode: manifestPurpose ? 'manifest' : 'copy_raw',
      includeXmp: purpose === 'photographer' || purpose === 'self_edit' || purpose === 'nas',
      errorMessage: null,
      exportResult: null,
      renderedExportResult: null,
      preflightResult: null,
      manifestExportSuccess: false,
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

  setExportTagFilter: (tag: string | null) => {
    set({ exportTagFilter: tag, preflightResult: null });
  },

  setBakeLutEffect: (bake: boolean) => {
    set({ bakeLutEffect: bake });
  },

  setBakeFrameEffect: (bake: boolean) => {
    set({ bakeFrameEffect: bake });
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
    const { exportTagFilter } = get();
    const selected = photos.filter((p) => selections[p.id]?.state === 'selected');
    if (!exportTagFilter) return selected;
    return selected.filter((p) => {
      const note = selections[p.id]?.note;
      const ann = parseAnnotation(note);
      return (ann.presetTags || []).includes(exportTagFilter);
    });
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

    if (manifestFormat === 'html') {
      const { scenes, photos: allPhotos } = useAlbumStore.getState();
      const reportItems = selectedPhotos.map((photo) => {
        const photoIndex = allPhotos.findIndex((p) => p.id === photo.id);
        const selection = selections[photo.id];
        const scene = scenes.find(
          (s) => photoIndex >= s.startIndex && photoIndex <= s.endIndex,
        ) || {
          id: 'default',
          name: '全片场景',
          color: '#3B82F6',
          startIndex: 0,
          endIndex: selectedPhotos.length,
          startPath: photo.path,
          endPath: photo.path,
          photoCount: selectedPhotos.length,
        };
        return {
          photo,
          selection,
          scene,
        };
      });
      return generateRetouchHtmlReport(projectName, reportItems);
    }

    if (manifestFormat === 'lrsmcol') {
      const rules = photos.map((photo) => [
        '\t\t{',
        '\t\t\tcriteria = "filename",',
        '\t\t\toperation = "==",',
        `\t\t\tvalue = "${escapeLuaString(photo.filename)}",`,
        '\t\t},',
      ].join('\n'));
      return [
        's = {',
        '\tid = "' + crypto.randomUUID() + '",',
        '\tinternalName = "QuickPick_' + escapeLuaString(projectName) + '",',
        '\ttitle = "QuickPick · ' + escapeLuaString(projectName) + '",',
        '\ttype = "LibrarySmartCollection",',
        '\tvalue = {',
        '\t\tcombine = "union",',
        ...rules,
        '\t},',
        '\tversion = 0,',
        '}',
      ].join('\n');
    }

    if (manifestFormat === 'pmselection') {
      return photos.map((photo) => {
        const source = selectedPhotos.find((item) => item.filename === photo.filename && relativePhotoPath(item.path, folderPath) === photo.relativePath);
        return source?.path || photo.relativePath;
      }).join('\n');
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

  executeSocialExport: async () => {
    const selectedPhotos = get().getSelectedPhotos();
    const { targetDir, bakeLutEffect } = get();
    if (selectedPhotos.length === 0) {
      set({ errorMessage: '当前没有标记为“已选”的照片' });
      return;
    }
    if (!targetDir.trim()) {
      set({ errorMessage: '请选择社交媒体 JPEG 的保存文件夹' });
      return;
    }
    set({ isExporting: true, errorMessage: null, renderedExportResult: null });
    try {
      const photoLuts = useLutStore.getState().photoLuts;
      const exportItems = selectedPhotos.map((photo) => {
        const config = bakeLutEffect ? photoLuts[photo.id] : undefined;
        return {
          id: photo.id,
          path: photo.path,
          lutId: config?.lutId || null,
          lutIntensity: config?.intensity || null,
        };
      });

      const lutTables = bakeLutEffect ? buildLutTablesForPhotos(exportItems) : undefined;

      const result = await exportShareableJpegs(
        exportItems,
        targetDir,
        2048,
        88,
        lutTables,
      );
      set({ isExporting: false, renderedExportResult: result });
    } catch (error) {
      set({
        isExporting: false,
        errorMessage: `社交媒体 JPEG 导出失败：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },

  shareToPhone: async () => {
    const selectedPhotos = get().getSelectedPhotos();
    const { bakeLutEffect, bakeFrameEffect } = get();
    if (selectedPhotos.length === 0) {
      set({ errorMessage: '当前没有标记为“已选”的照片' });
      return;
    }
    set({ isExporting: true, errorMessage: null, renderedExportResult: null });
    try {
      if (bakeFrameEffect) {
        const adjustStore = useAdjustStore.getState();
        const frameConfig = adjustStore.frameConfig;
        const customItems: CustomImageSharePayload[] = [];

        for (const photo of selectedPhotos) {
          const previewUrl = await getPhotoPreview(photo.path, photo.id);
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = 'anonymous';
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error(`加载照片预览失败: ${photo.filename}`));
            image.src = previewUrl;
          });

          const photoAdjustments = adjustStore.getPhotoAdjustments(photo.id);
          const canvas = await renderFramedPhotoCanvas(
            img,
            img.naturalWidth || 1920,
            img.naturalHeight || 1280,
            photo,
            frameConfig,
            photoAdjustments,
            2560,
          );

          const baseName = photo.filename.replace(/\.[^/.]+$/, '');
          const filename = `${baseName}_framed.jpg`;
          const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
          customItems.push({ filename, data_url_or_base64: dataUrl });
        }

        const result = await shareCustomImagesViaAirDrop(customItems);
        set({ isExporting: false, renderedExportResult: result });
        return;
      }

      const photoLuts = useLutStore.getState().photoLuts;
      const exportItems = selectedPhotos.map((photo) => {
        const config = bakeLutEffect ? photoLuts[photo.id] : undefined;
        return {
          id: photo.id,
          path: photo.path,
          lutId: config?.lutId || null,
          lutIntensity: config?.intensity || null,
        };
      });

      const lutTables = bakeLutEffect ? buildLutTablesForPhotos(exportItems) : undefined;

      const result = await sharePhotosViaAirDrop(exportItems, lutTables);
      set({ isExporting: false, renderedExportResult: result });
    } catch (error) {
      set({
        isExporting: false,
        errorMessage: `AirDrop 准备失败：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },

  resetExportState: () => {
    set({
      exportResult: null,
      preflightResult: null,
      errorMessage: null,
      manifestExportSuccess: false,
      renderedExportResult: null,
      isExporting: false,
      isCancelling: false,
      currentJobId: null,
    });
  },
}));
