import { create } from 'zustand';
import { Assets } from 'pixi.js';
import {
  PhotoItem,
  FaceInfo,
  EngineInfo,
  RetouchStatus,
  fetchEngineInfo,
  scanFolder,
  getPhotoPreview,
  analyzePhoto,
  updatePhotoTriage,
  savePhotoTriageConflictCopy,
  generateFolderCache,
} from '../services/tauriBridge';

export type FilterCategory = 'all' | 'pending' | 'failed' | 'clean' | 'fixable' | 'fatal' | 'picked';
export type ScenePreset = 'group' | 'candid' | 'portrait';

const updateSourceHash = (photos: PhotoItem[], path: string, sourceHash: string) =>
  photos.map((photo) =>
    photo.path === path ? { ...photo, xmp_source_hash: sourceHash } : photo,
  );

const patchPhoto = (photos: PhotoItem[], path: string, patch: Partial<PhotoItem>) =>
  photos.map((photo) => photo.path === path ? { ...photo, ...patch } : photo);

export interface XmpConflict {
  localPhoto: PhotoItem;
  message: string;
}

const isXmpConflictError = (error: unknown) => String(error).includes('XMP_CONFLICT:');

const makeXmpConflict = (
  error: unknown,
  photo: PhotoItem,
  patch: Partial<PhotoItem>,
): XmpConflict | null => isXmpConflictError(error)
  ? {
      localPhoto: { ...photo, ...patch },
      message: String(error).replace(/^.*XMP_CONFLICT:/, ''),
    }
  : null;

interface PhotoStore {
  folderPath: string | null;
  photos: PhotoItem[];
  currentIndex: number;
  activeFilter: FilterCategory;
  autoAdvance: boolean;
  isLoading: boolean;
  currentPreviewUrl: string | null;
  engineInfo: EngineInfo | null;
  writeStatus: 'idle' | 'saving' | 'saved' | 'error';
  writeError: string | null;
  xmpConflict: XmpConflict | null;
  clearWriteError: () => void;
  dismissXmpConflict: () => void;
  resolveXmpConflict: (choice: 'reload' | 'overwrite' | 'copy') => Promise<void>;

  // 环形预加载内存缓存 (path -> base64 data url)
  previewCache: Map<string, string>;

  // 人脸联动特写 (Face Loupe) 状态
  isFaceLoupeOpen: boolean;
  activeScenePreset: ScenePreset;
  focusedFace: FaceInfo | null;
  toggleFaceLoupe: () => void;
  setScenePreset: (preset: ScenePreset) => void;
  focusFace: (face: FaceInfo | null) => void;
  togglePinFace: (faceId: string) => void;

  // 操作
  initEngine: () => Promise<void>;
  openFolder: (path: string) => Promise<void>;
  selectIndex: (index: number) => Promise<void>;
  selectPhotoByFilename: (filename: string) => Promise<void>;
  setActiveFilter: (filter: FilterCategory) => void;
  nextPhoto: () => void;
  prevPhoto: () => void;
  setRating: (rating: number) => Promise<void>;
  setColorLabel: (color: string) => Promise<void>;
  setPickStatus: (status: 'Pick' | 'Reject' | 'None') => Promise<void>;
  overrideRetouchStatus: (status: RetouchStatus) => Promise<void>;
  retryCurrentAnalysis: () => Promise<void>;
  batchPickClean: () => Promise<void>;
  batchRejectFatal: () => Promise<void>;
  applyAiSuggestions: () => Promise<void>;
  // 对比模式状态
  isCompareMode: boolean;
  compareTargetIndex: number | null;
  comparePreviewUrl: string | null;
  syncZoomAndPan: boolean;

  enterCompareMode: (candidateIndex?: number) => void;
  exitCompareMode: () => void;
  toggleCompareMode: () => void;
  setCompareTargetIndex: (index: number) => void;
  nextCompareCandidate: () => void;
  prevCompareCandidate: () => void;
  swapComparePhotos: () => void;
  toggleSyncZoomAndPan: () => void;
  setComparePhotoRating: (rating: number) => Promise<void>;
  setComparePhotoPickStatus: (status: 'Pick' | 'Reject' | 'None') => Promise<void>;

  isExportModalOpen: boolean;
  setExportModalOpen: (open: boolean) => void;
  toggleAutoAdvance: () => void;

  // NAS 协同与 2K 代理加速状态
  isProxyAccelerated: boolean;
  isGeneratingCache: boolean;
  generateCurrentFolderCache: () => Promise<void>;
}

export const usePhotoStore = create<PhotoStore>((set, get) => ({
  folderPath: null,
  photos: [],
  currentIndex: 0,
  activeFilter: 'all',
  autoAdvance: true,
  isLoading: false,
  isExportModalOpen: false,
  isCompareMode: false,
  compareTargetIndex: null,
  comparePreviewUrl: null,
  syncZoomAndPan: true,
  currentPreviewUrl: null,
  engineInfo: null,
  writeStatus: 'idle',
  writeError: null,
  xmpConflict: null,
  previewCache: new Map(),

  clearWriteError: () => set({ writeStatus: 'idle', writeError: null }),
  dismissXmpConflict: () => set({ xmpConflict: null }),
  resolveXmpConflict: async (choice) => {
    const conflict = get().xmpConflict;
    if (!conflict) return;
    const local = conflict.localPhoto;
    set({ writeStatus: 'saving', writeError: null });

    try {
      if (choice === 'overwrite') {
        const sourceHash = await updatePhotoTriage(
          local.path,
          local.rating,
          local.color_label,
          local.pick_status,
          local.retouch_status,
          local.defect_tags.map((tag) => tag.id).join(','),
          local.burst_group_id,
          local.xmp_source_hash,
          true,
        );
        set((state) => ({
          photos: patchPhoto(state.photos, local.path, { ...local, xmp_source_hash: sourceHash }),
          xmpConflict: null,
          writeStatus: 'saved',
        }));
        return;
      }

      if (choice === 'copy') {
        await savePhotoTriageConflictCopy(
          local.path,
          local.rating,
          local.color_label,
          local.pick_status,
          local.retouch_status,
          local.defect_tags.map((tag) => tag.id).join(','),
          local.burst_group_id,
        );
      }

      const folderPath = get().folderPath;
      if (!folderPath) throw new Error('当前相册路径不可用，无法重新载入');
      const diskPhotos = await scanFolder(folderPath);
      const diskPhoto = diskPhotos.find((photo) => photo.path === local.path);
      if (!diskPhoto) throw new Error('磁盘版本已不存在，请重新打开相册');
      set((state) => ({
        photos: patchPhoto(state.photos, local.path, diskPhoto),
        xmpConflict: null,
        writeStatus: 'saved',
      }));
    } catch (error) {
      set({
        writeStatus: 'error',
        writeError: `处理 ${local.filename} 的 XMP 冲突失败：${String(error)}`,
      });
    }
  },

  // NAS 协同与 2K 代理加速初始状态
  isProxyAccelerated: false,
  isGeneratingCache: false,

  generateCurrentFolderCache: async () => {
    const { folderPath, openFolder } = get();
    if (!folderPath) return;
    set({ isGeneratingCache: true });
    try {
      await generateFolderCache(folderPath);
      await openFolder(folderPath);
      set({ isProxyAccelerated: true, isGeneratingCache: false });
    } catch (e) {
      console.error('Failed to generate folder cache', e);
      set({ isGeneratingCache: false });
    }
  },

  // 人脸联动特写 (Face Loupe) 初始状态
  isFaceLoupeOpen: false,
  activeScenePreset: 'group',
  focusedFace: null,

  toggleFaceLoupe: () => {
    set((state) => ({ isFaceLoupeOpen: !state.isFaceLoupeOpen }));
  },

  setScenePreset: (preset: ScenePreset) => {
    set({ activeScenePreset: preset });
  },

  focusFace: (face: FaceInfo | null) => {
    set({ focusedFace: face });
  },

  togglePinFace: (faceId: string) => {
    const { currentIndex, photos } = get();
    const photo = photos[currentIndex];
    if (!photo || !photo.faces) return;

    let targetPinnedState = false;
    let targetCoords = { x: 0.5, y: 0.5 };

    const updatedFaces = photo.faces.map((f) => {
      if (f.id === faceId) {
        targetPinnedState = !f.is_pinned;
        targetCoords = { x: f.x + f.width / 2, y: f.y + f.height / 2 };
        return {
          ...f,
          is_pinned: targetPinnedState,
        };
      }
      return f;
    });

    // 重新排序优先级：Priority = 10 * IsPinned + 5 * NormArea - 2 * NormDist
    updatedFaces.sort((a, b) => {
      const pA = (a.is_pinned ? 10 : 0) + 5 * (a.width * a.height) - 2 * Math.hypot(a.x + a.width / 2 - 0.5, a.y + a.height / 2 - 0.5);
      const pB = (b.is_pinned ? 10 : 0) + 5 * (b.width * b.height) - 2 * Math.hypot(b.x + b.width / 2 - 0.5, b.y + b.height / 2 - 0.5);
      return pB - pA;
    });

    const newPhotos = [...photos];
    newPhotos[currentIndex] = { ...photo, faces: updatedFaces };

    // 若当前底片归属连拍组，将钉选/取消钉选主角位置自动双向同步给同组其他底片
    if (photo.burst_group_id) {
      for (let i = 0; i < newPhotos.length; i++) {
        if (i !== currentIndex && newPhotos[i].burst_group_id === photo.burst_group_id) {
          const otherFaces = newPhotos[i].faces;
          if (otherFaces && otherFaces.length > 0) {
            let minD = 999;
            let bestIdx = -1;
            otherFaces.forEach((of, oIdx) => {
              const d = Math.hypot(of.x + of.width / 2 - targetCoords.x, of.y + of.height / 2 - targetCoords.y);
              if (d < 0.18 && d < minD) {
                minD = d;
                bestIdx = oIdx;
              }
            });
            if (bestIdx !== -1) {
              const copy = [...otherFaces];
              copy[bestIdx] = { ...copy[bestIdx], is_pinned: targetPinnedState };
              copy.sort((a, b) => {
                const pA = (a.is_pinned ? 10 : 0) + 5 * (a.width * a.height) - 2 * Math.hypot(a.x + a.width / 2 - 0.5, a.y + a.height / 2 - 0.5);
                const pB = (b.is_pinned ? 10 : 0) + 5 * (b.width * b.height) - 2 * Math.hypot(b.x + b.width / 2 - 0.5, b.y + b.height / 2 - 0.5);
                return pB - pA;
              });
              newPhotos[i] = { ...newPhotos[i], faces: copy };
            }
          }
        }
      }
    }

    set({ photos: newPhotos });
  },

  setExportModalOpen: (open: boolean) => set({ isExportModalOpen: open }),

  enterCompareMode: (candidateIndex?: number) => {
    const { photos, currentIndex, previewCache } = get();
    if (photos.length < 2) return;

    let targetIdx: number;
    if (typeof candidateIndex === 'number' && candidateIndex >= 0 && candidateIndex < photos.length && candidateIndex !== currentIndex) {
      targetIdx = candidateIndex;
    } else if (currentIndex < photos.length - 1) {
      targetIdx = currentIndex + 1;
    } else {
      targetIdx = Math.max(0, currentIndex - 1);
    }

    const candidatePhoto = photos[targetIdx];
    let candidateUrl: string | null = null;
    if (previewCache.has(candidatePhoto.path)) {
      candidateUrl = previewCache.get(candidatePhoto.path)!;
    } else {
      getPhotoPreview(candidatePhoto.path).then((url) => {
        previewCache.set(candidatePhoto.path, url);
        if (get().compareTargetIndex === targetIdx) {
          set({ comparePreviewUrl: url });
        }
      });
    }

    set({
      isCompareMode: true,
      compareTargetIndex: targetIdx,
      comparePreviewUrl: candidateUrl,
    });
  },

  exitCompareMode: () => {
    set({
      isCompareMode: false,
      compareTargetIndex: null,
      comparePreviewUrl: null,
    });
  },

  toggleCompareMode: () => {
    if (get().isCompareMode) {
      get().exitCompareMode();
    } else {
      get().enterCompareMode();
    }
  },

  setCompareTargetIndex: (index: number) => {
    const { photos, previewCache, currentIndex } = get();
    if (index < 0 || index >= photos.length || index === currentIndex) return;

    const candidatePhoto = photos[index];
    set({ compareTargetIndex: index });

    if (previewCache.has(candidatePhoto.path)) {
      set({ comparePreviewUrl: previewCache.get(candidatePhoto.path)! });
    } else {
      getPhotoPreview(candidatePhoto.path).then((url) => {
        previewCache.set(candidatePhoto.path, url);
        if (get().compareTargetIndex === index) {
          set({ comparePreviewUrl: url });
        }
      });
    }
  },

  nextCompareCandidate: () => {
    const { photos, currentIndex, compareTargetIndex, setCompareTargetIndex } = get();
    if (compareTargetIndex === null || photos.length <= 1) return;

    let nextIdx = compareTargetIndex + 1;
    if (nextIdx === currentIndex) {
      nextIdx++;
    }
    if (nextIdx < photos.length) {
      setCompareTargetIndex(nextIdx);
    }
  },

  prevCompareCandidate: () => {
    const { currentIndex, compareTargetIndex, setCompareTargetIndex } = get();
    if (compareTargetIndex === null) return;

    let prevIdx = compareTargetIndex - 1;
    if (prevIdx === currentIndex) {
      prevIdx--;
    }
    if (prevIdx >= 0) {
      setCompareTargetIndex(prevIdx);
    }
  },

  swapComparePhotos: () => {
    const { currentIndex, compareTargetIndex, selectIndex, setCompareTargetIndex } = get();
    if (compareTargetIndex === null || compareTargetIndex === currentIndex) return;

    const oldCurrent = currentIndex;
    const oldCompare = compareTargetIndex;

    selectIndex(oldCompare);
    setCompareTargetIndex(oldCurrent);
  },

  toggleSyncZoomAndPan: () => {
    set((state) => ({ syncZoomAndPan: !state.syncZoomAndPan }));
  },

  setComparePhotoRating: async (rating: number) => {
    const { compareTargetIndex, photos } = get();
    if (compareTargetIndex === null) return;
    const photo = photos[compareTargetIndex];
    if (!photo) return;

    const updated = { ...photo, rating };
    const newPhotos = [...photos];
    newPhotos[compareTargetIndex] = updated;
    set({ photos: newPhotos, writeStatus: 'saving', writeError: null });

    try {
      const sourceHash = await updatePhotoTriage(
        photo.path,
        rating,
        photo.color_label,
        photo.pick_status,
        photo.retouch_status,
        photo.defect_tags.map((t) => t.id).join(','),
        photo.burst_group_id,
        photo.xmp_source_hash,
      );
      set((state) => ({ photos: updateSourceHash(state.photos, photo.path, sourceHash), writeStatus: 'saved' }));
    } catch (e) {
      console.error('Failed to update compare photo rating', e);
      set((state) => ({
        photos: patchPhoto(state.photos, photo.path, { rating: photo.rating }),
        writeStatus: 'error',
        writeError: `保存 ${photo.filename} 评分失败：${String(e)}`,
        xmpConflict: makeXmpConflict(e, photo, { rating }),
      }));
    }
  },

  setComparePhotoPickStatus: async (status: 'Pick' | 'Reject' | 'None') => {
    const { compareTargetIndex, photos } = get();
    if (compareTargetIndex === null) return;
    const photo = photos[compareTargetIndex];
    if (!photo) return;

    const updated = { ...photo, pick_status: status };
    const newPhotos = [...photos];
    newPhotos[compareTargetIndex] = updated;
    set({ photos: newPhotos, writeStatus: 'saving', writeError: null });

    try {
      const sourceHash = await updatePhotoTriage(
        photo.path,
        photo.rating,
        photo.color_label,
        status,
        photo.retouch_status,
        photo.defect_tags.map((t) => t.id).join(','),
        photo.burst_group_id,
        photo.xmp_source_hash,
      );
      set((state) => ({ photos: updateSourceHash(state.photos, photo.path, sourceHash), writeStatus: 'saved' }));
    } catch (e) {
      console.error('Failed to update compare photo pick status', e);
      set((state) => ({
        photos: patchPhoto(state.photos, photo.path, { pick_status: photo.pick_status }),
        writeStatus: 'error',
        writeError: `保存 ${photo.filename} 采纳状态失败：${String(e)}`,
        xmpConflict: makeXmpConflict(e, photo, { pick_status: status }),
      }));
    }
  },

  initEngine: async () => {
    try {
      const info = await fetchEngineInfo();
      set({ engineInfo: info });
    } catch (e) {
      console.error('Failed to init engine info', e);
    }
  },

  openFolder: async (path: string) => {
    set({ isLoading: true, folderPath: path });
    try {
      const photos = await scanFolder(path);
      const isProxyAccelerated = photos.some((p) => p.thumb_width !== undefined && p.thumb_width !== null);
      set({
        photos,
        currentIndex: 0,
        isLoading: false,
        activeFilter: 'all',
        isProxyAccelerated,
      });

      if (photos.length > 0) {
        get().selectIndex(0);
      }
    } catch (e) {
      console.error('Failed to scan folder', e);
      set({ isLoading: false });
    }
  },

  setActiveFilter: (filter: FilterCategory) => {
    set({ activeFilter: filter });
    const { photos } = get();
    // 切换筛选后，如果当前照片不在筛选结果内，跳到筛选结果的第一张
    const isCurrentMatch = (p: PhotoItem) => {
      if (filter === 'all') return true;
      if (filter === 'pending') return p.retouch_status === 'pending';
      if (filter === 'failed') return p.retouch_status === 'failed';
      if (filter === 'clean') return p.retouch_status === 'clean';
      if (filter === 'fixable') return p.retouch_status === 'fixable';
      if (filter === 'fatal') return p.retouch_status === 'fatal';
      if (filter === 'picked') return p.pick_status === 'Pick';
      return true;
    };

    const current = photos[get().currentIndex];
    if (current && !isCurrentMatch(current)) {
      const firstMatchIdx = photos.findIndex(isCurrentMatch);
      if (firstMatchIdx !== -1) {
        get().selectIndex(firstMatchIdx);
      }
    }
  },

  selectIndex: async (index: number) => {
    const { photos, previewCache } = get();
    if (index < 0 || index >= photos.length) return;

    const currentPhoto = photos[index];
    set({ currentIndex: index, focusedFace: null });

    // 1. 如果缓存中已有当前预览图，立刻 0ms 展示
    if (previewCache.has(currentPhoto.path)) {
      set({ currentPreviewUrl: previewCache.get(currentPhoto.path)! });
    } else {
      getPhotoPreview(currentPhoto.path).then((url) => {
        if (get().currentIndex === index) {
          set({ currentPreviewUrl: url });
        }
        previewCache.set(currentPhoto.path, url);
      });
    }

    // 2. 环形预加载：调度预取 Next 1, Next 2, Prev 1
    const preloadIndices = [index + 1, index + 2, index - 1];
    for (const pIdx of preloadIndices) {
      if (pIdx >= 0 && pIdx < photos.length) {
        const item = photos[pIdx];
        if (!previewCache.has(item.path)) {
          getPhotoPreview(item.path).then((url) => {
            previewCache.set(item.path, url);
          });
        }
      }
    }

    // 3. 内存回收保护：缓存超过 35 张时释放较远条目
    if (previewCache.size > 35) {
      const keepKeys = new Set(
        photos
          .slice(Math.max(0, index - 6), Math.min(photos.length, index + 7))
          .map((p) => p.path),
      );
      for (const [key, url] of previewCache.entries()) {
        if (!keepKeys.has(key)) {
          previewCache.delete(key);
          Assets.unload(url).catch(() => {});
        }
      }
    }
  },

  selectPhotoByFilename: async (filename: string) => {
    const { photos, selectIndex } = get();
    const idx = photos.findIndex((p) => p.filename === filename);
    if (idx !== -1) {
      selectIndex(idx);
    }
  },

  nextPhoto: () => {
    const { currentIndex, photos, activeFilter, selectIndex } = get();
    if (photos.length === 0) return;

    if (activeFilter === 'all') {
      if (currentIndex < photos.length - 1) {
        selectIndex(currentIndex + 1);
      }
    } else {
      // 在当前筛选流中寻找下一个匹配项
      for (let i = currentIndex + 1; i < photos.length; i++) {
        const p = photos[i];
        if (
          (activeFilter === 'clean' && p.retouch_status === 'clean') ||
          (activeFilter === 'pending' && p.retouch_status === 'pending') ||
          (activeFilter === 'failed' && p.retouch_status === 'failed') ||
          (activeFilter === 'fixable' && p.retouch_status === 'fixable') ||
          (activeFilter === 'fatal' && p.retouch_status === 'fatal') ||
          (activeFilter === 'picked' && p.pick_status === 'Pick')
        ) {
          selectIndex(i);
          break;
        }
      }
    }
  },

  prevPhoto: () => {
    const { currentIndex, photos, activeFilter, selectIndex } = get();
    if (photos.length === 0) return;

    if (activeFilter === 'all') {
      if (currentIndex > 0) {
        selectIndex(currentIndex - 1);
      }
    } else {
      // 在当前筛选流中寻找上一个匹配项
      for (let i = currentIndex - 1; i >= 0; i--) {
        const p = photos[i];
        if (
          (activeFilter === 'clean' && p.retouch_status === 'clean') ||
          (activeFilter === 'pending' && p.retouch_status === 'pending') ||
          (activeFilter === 'failed' && p.retouch_status === 'failed') ||
          (activeFilter === 'fixable' && p.retouch_status === 'fixable') ||
          (activeFilter === 'fatal' && p.retouch_status === 'fatal') ||
          (activeFilter === 'picked' && p.pick_status === 'Pick')
        ) {
          selectIndex(i);
          break;
        }
      }
    }
  },

  setRating: async (rating: number) => {
    const { currentIndex, photos, autoAdvance, nextPhoto } = get();
    const photo = photos[currentIndex];
    if (!photo) return;

    const updated = { ...photo, rating };
    const newPhotos = [...photos];
    newPhotos[currentIndex] = updated;
    set({ photos: newPhotos, writeStatus: 'saving', writeError: null });

    try {
      const sourceHash = await updatePhotoTriage(
        photo.path,
        rating,
        photo.color_label,
        photo.pick_status,
        photo.retouch_status,
        photo.defect_tags.map((t) => t.id).join(','),
        photo.burst_group_id,
        photo.xmp_source_hash,
      );
      set((state) => ({ photos: updateSourceHash(state.photos, photo.path, sourceHash), writeStatus: 'saved' }));
    } catch (e) {
      console.error('Failed to update rating in XMP', e);
      set((state) => ({
        photos: patchPhoto(state.photos, photo.path, { rating: photo.rating }),
        writeStatus: 'error',
        writeError: `保存 ${photo.filename} 评分失败：${String(e)}`,
        xmpConflict: makeXmpConflict(e, photo, { rating }),
      }));
      return;
    }

    if (autoAdvance) {
      nextPhoto();
    }
  },

  setColorLabel: async (color_label: string) => {
    const { currentIndex, photos } = get();
    const photo = photos[currentIndex];
    if (!photo) return;

    const updated = { ...photo, color_label };
    const newPhotos = [...photos];
    newPhotos[currentIndex] = updated;
    set({ photos: newPhotos, writeStatus: 'saving', writeError: null });

    try {
      const sourceHash = await updatePhotoTriage(
        photo.path,
        photo.rating,
        color_label,
        photo.pick_status,
        photo.retouch_status,
        photo.defect_tags.map((t) => t.id).join(','),
        photo.burst_group_id,
        photo.xmp_source_hash,
      );
      set((state) => ({ photos: updateSourceHash(state.photos, photo.path, sourceHash), writeStatus: 'saved' }));
    } catch (e) {
      console.error('Failed to update color label in XMP', e);
      set((state) => ({
        photos: patchPhoto(state.photos, photo.path, { color_label: photo.color_label }),
        writeStatus: 'error',
        writeError: `保存 ${photo.filename} 色标失败：${String(e)}`,
        xmpConflict: makeXmpConflict(e, photo, { color_label }),
      }));
    }
  },

  setPickStatus: async (pick_status: 'Pick' | 'Reject' | 'None') => {
    const { currentIndex, photos, autoAdvance, nextPhoto } = get();
    const photo = photos[currentIndex];
    if (!photo) return;

    const updated = { ...photo, pick_status };
    const newPhotos = [...photos];
    newPhotos[currentIndex] = updated;
    set({ photos: newPhotos, writeStatus: 'saving', writeError: null });

    try {
      const sourceHash = await updatePhotoTriage(
        photo.path,
        photo.rating,
        photo.color_label,
        pick_status,
        photo.retouch_status,
        photo.defect_tags.map((t) => t.id).join(','),
        photo.burst_group_id,
        photo.xmp_source_hash,
      );
      set((state) => ({ photos: updateSourceHash(state.photos, photo.path, sourceHash), writeStatus: 'saved' }));
    } catch (e) {
      console.error('Failed to update pick status in XMP', e);
      set((state) => ({
        photos: patchPhoto(state.photos, photo.path, { pick_status: photo.pick_status }),
        writeStatus: 'error',
        writeError: `保存 ${photo.filename} 采纳状态失败：${String(e)}`,
        xmpConflict: makeXmpConflict(e, photo, { pick_status }),
      }));
      return;
    }

    if (autoAdvance) {
      nextPhoto();
    }
  },

  overrideRetouchStatus: async (status: RetouchStatus) => {
    const { currentIndex, photos } = get();
    const photo = photos[currentIndex];
    if (!photo) return;

    const updated = { ...photo, retouch_status: status };
    const newPhotos = [...photos];
    newPhotos[currentIndex] = updated;
    set({ photos: newPhotos, writeStatus: 'saving', writeError: null });

    try {
      const sourceHash = await updatePhotoTriage(
        photo.path,
        photo.rating,
        photo.color_label,
        photo.pick_status,
        status,
        photo.defect_tags.map((t) => t.id).join(','),
        photo.burst_group_id,
        photo.xmp_source_hash,
      );
      set((state) => ({ photos: updateSourceHash(state.photos, photo.path, sourceHash), writeStatus: 'saved' }));
    } catch (e) {
      console.error('Failed to override retouch status in XMP', e);
      set((state) => ({
        photos: patchPhoto(state.photos, photo.path, { retouch_status: photo.retouch_status }),
        writeStatus: 'error',
        writeError: `保存 ${photo.filename} 诊断状态失败：${String(e)}`,
        xmpConflict: makeXmpConflict(e, photo, { retouch_status: status }),
      }));
    }
  },

  retryCurrentAnalysis: async () => {
    const { currentIndex, photos } = get();
    const photo = photos[currentIndex];
    if (!photo) return;
    set((state) => ({
      photos: patchPhoto(state.photos, photo.path, { retouch_status: 'pending' }),
      writeStatus: 'saving',
      writeError: null,
    }));

    let analyzedStatus: RetouchStatus;
    let analyzedTags: PhotoItem['defect_tags'];
    try {
      [analyzedStatus, analyzedTags] = await analyzePhoto(photo.path, currentIndex);
    } catch (error) {
      set((state) => ({
        photos: patchPhoto(state.photos, photo.path, { retouch_status: 'failed' }),
        writeStatus: 'error',
        writeError: `重新分析 ${photo.filename} 失败：${String(error)}`,
      }));
      return;
    }

    const analyzedPhoto: PhotoItem = {
      ...photo,
      retouch_status: analyzedStatus,
      defect_tags: analyzedTags,
    };
    try {
      const sourceHash = await updatePhotoTriage(
        photo.path,
        photo.rating,
        photo.color_label,
        photo.pick_status,
        analyzedStatus,
        analyzedTags.map((tag) => tag.id).join(','),
        photo.burst_group_id,
        photo.xmp_source_hash,
      );
      set((state) => ({
        photos: patchPhoto(state.photos, photo.path, {
          ...analyzedPhoto,
          xmp_source_hash: sourceHash,
        }),
        writeStatus: 'saved',
      }));
    } catch (error) {
      set((state) => ({
        photos: patchPhoto(state.photos, photo.path, {
          retouch_status: photo.retouch_status,
          defect_tags: photo.defect_tags,
        }),
        writeStatus: 'error',
        writeError: `保存 ${photo.filename} 分析结果失败：${String(error)}`,
        xmpConflict: makeXmpConflict(error, analyzedPhoto, {}),
      }));
    }
  },

  batchPickClean: async () => {
    const { photos } = get();
    set({ writeStatus: 'saving', writeError: null });
    const updates = new Map<string, { rating: number; pick_status: string; sourceHash: string }>();
    const errors: string[] = [];
    let conflict: XmpConflict | null = null;
    for (const photo of photos.filter((item) => item.retouch_status === 'clean')) {
      const rating = photo.rating > 0 ? photo.rating : 5;
      try {
        const sourceHash = await updatePhotoTriage(
          photo.path,
          rating,
          photo.color_label,
          'Pick',
          photo.retouch_status,
          photo.defect_tags.map((tag) => tag.id).join(','),
          photo.burst_group_id,
          photo.xmp_source_hash,
        );
        updates.set(photo.path, { rating, pick_status: 'Pick', sourceHash });
      } catch (error) {
        errors.push(`${photo.filename}: ${String(error)}`);
        conflict ??= makeXmpConflict(error, photo, { rating, pick_status: 'Pick' });
      }
    }
    set((state) => ({
      photos: state.photos.map((photo) => {
        const update = updates.get(photo.path);
        return update
          ? { ...photo, rating: update.rating, pick_status: update.pick_status, xmp_source_hash: update.sourceHash }
          : photo;
      }),
    }));
    if (errors.length > 0) {
      const message = `${errors.length} 张写入失败\n${errors.slice(0, 3).join('\n')}`;
      set({ writeStatus: 'error', writeError: message, xmpConflict: conflict });
      throw new Error(message);
    }
    set({ writeStatus: 'saved' });
  },

  batchRejectFatal: async () => {
    const { photos } = get();
    set({ writeStatus: 'saving', writeError: null });
    const updates = new Map<string, string>();
    const errors: string[] = [];
    let conflict: XmpConflict | null = null;
    for (const photo of photos.filter((item) => item.retouch_status === 'fatal')) {
      try {
        const sourceHash = await updatePhotoTriage(
          photo.path,
          photo.rating,
          photo.color_label,
          'Reject',
          photo.retouch_status,
          photo.defect_tags.map((tag) => tag.id).join(','),
          photo.burst_group_id,
          photo.xmp_source_hash,
        );
        updates.set(photo.path, sourceHash);
      } catch (error) {
        errors.push(`${photo.filename}: ${String(error)}`);
        conflict ??= makeXmpConflict(error, photo, { pick_status: 'Reject' });
      }
    }
    set((state) => ({
      photos: state.photos.map((photo) => {
        const sourceHash = updates.get(photo.path);
        return sourceHash ? { ...photo, pick_status: 'Reject', xmp_source_hash: sourceHash } : photo;
      }),
    }));
    if (errors.length > 0) {
      const message = `${errors.length} 张写入失败\n${errors.slice(0, 3).join('\n')}`;
      set({ writeStatus: 'error', writeError: message, xmpConflict: conflict });
      throw new Error(message);
    }
    set({ writeStatus: 'saved' });
  },

  applyAiSuggestions: async () => {
    const { photos } = get();
    set({ writeStatus: 'saving', writeError: null });
    const updates = new Map<string, { rating: number; pick_status: string; sourceHash: string }>();
    const errors: string[] = [];
    let conflict: XmpConflict | null = null;
    for (const photo of photos.filter((item) => item.retouch_status === 'clean' || item.retouch_status === 'fatal')) {
      const rating = photo.retouch_status === 'clean' && photo.rating === 0 ? 5 : photo.rating;
      const pickStatus = photo.retouch_status === 'clean' ? 'Pick' : 'Reject';
      try {
        const sourceHash = await updatePhotoTriage(
          photo.path,
          rating,
          photo.color_label,
          pickStatus,
          photo.retouch_status,
          photo.defect_tags.map((tag) => tag.id).join(','),
          photo.burst_group_id,
          photo.xmp_source_hash,
        );
        updates.set(photo.path, { rating, pick_status: pickStatus, sourceHash });
      } catch (error) {
        errors.push(`${photo.filename}: ${String(error)}`);
        conflict ??= makeXmpConflict(error, photo, { rating, pick_status: pickStatus });
      }
    }
    set((state) => ({
      photos: state.photos.map((photo) => {
        const update = updates.get(photo.path);
        return update
          ? { ...photo, rating: update.rating, pick_status: update.pick_status, xmp_source_hash: update.sourceHash }
          : photo;
      }),
    }));
    if (errors.length > 0) {
      const message = `${errors.length} 张写入失败\n${errors.slice(0, 3).join('\n')}`;
      set({ writeStatus: 'error', writeError: message, xmpConflict: conflict });
      throw new Error(message);
    }
    set({ writeStatus: 'saved' });
  },

  toggleAutoAdvance: () => {
    set((state) => ({ autoAdvance: !state.autoAdvance }));
  },
}));
