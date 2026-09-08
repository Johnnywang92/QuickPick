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

export type FilterCategory = 'all' | 'pending' | 'failed' | 'review' | 'clean' | 'fixable' | 'fatal' | 'picked';
export type ScenePreset = 'group' | 'candid' | 'portrait';

export type WorkflowScene = 'general' | 'concert' | 'cosplay' | 'conference' | 'wedding';

export interface PhotoUncertainty {
  isUncertain: boolean;
  score: number;
  reasons: string[];
}

export const getPhotoUncertainty = (
  photo: PhotoItem,
  scene: WorkflowScene = 'general',
): PhotoUncertainty => {
  if (photo.retouch_status === 'pending' || photo.retouch_status === 'failed') {
    return { isUncertain: false, score: 0, reasons: [] };
  }

  const reasons: string[] = [];
  let score = 0;

  // 1. 场景专属定制规则判定
  if (scene === 'concert') {
    // 演唱会模式：舞台爆闪严重死白
    if (photo.defect_tags.some((t) => t.id === 'fatal_blown_highlights' || t.label.includes('舞台爆闪'))) {
      reasons.push('舞台爆闪严重死白');
      score = Math.max(score, 0.92);
    }
  } else if (scene === 'cosplay') {
    // 二次元/Cosplay 模式：极致追求假毛/美瞳与眼部合焦
    if (photo.defect_tags.some((t) => t.id === 'review_borderline_sharpness' || t.label.includes('Cosplay美瞳'))) {
      reasons.push('Cosplay美瞳/眼妆需核验');
      score = Math.max(score, 0.88);
    }
    if (photo.faces && photo.faces.length > 0) {
      const pinned = photo.faces.find((f) => f.is_pinned) || photo.faces[0];
      if (pinned && pinned.sharpness < 58.0 && !reasons.includes('Cosplay美瞳/眼妆需核验')) {
        reasons.push('Cosplay主角眼部微软');
        score = Math.max(score, 0.82);
      }
    }
  } else if (scene === 'conference') {
    // 商业会议模式：大合影全员睁眼严格判定
    if (photo.faces && photo.faces.length >= 3) {
      const closed = photo.faces.filter((f) => f.eye_open_score < 0.35).length;
      if (closed > 0) {
        reasons.push(`商务大合影闭眼 (${closed}人)`);
        score = Math.max(score, 0.96);
      }
    }
  }

  // 2. 明确的争议/复核标签 (来自后端规则)
  if (photo.defect_tags.some((t) => t.id === 'review_group_blink_conflict')) {
    // 演唱会单人特写即便打上分歧也直接豁免，多人乐队演出才提示
    if (scene === 'concert' && (!photo.faces || photo.faces.length <= 2)) {
      // 豁免
    } else {
      reasons.push('合影闭眼分歧');
      score = Math.max(score, 0.88);
    }
  }
  if (photo.defect_tags.some((t) => t.id === 'review_borderline_sharpness') && !reasons.includes('Cosplay美瞳/眼妆需核验')) {
    reasons.push(scene === 'concert' ? '舞台微反差边缘' : '临界合焦边缘');
    score = Math.max(score, 0.75);
  }

  // 3. 连拍换脸可拯救候选
  if (photo.defect_tags.some((t) => t.id === 'fixable_burst_swap')) {
    reasons.push('连拍换脸待裁决');
    score = Math.max(score, 0.85);
  }

  // 4. 人脸特征冲突与睁闭眼检测
  if (photo.faces && photo.faces.length > 0) {
    // 演唱会模式：单人闭眼为深情演唱投入表情，不作为争议
    const isConcertSolo = scene === 'concert' && photo.faces.length <= 2;

    if (!isConcertSolo) {
      const closedCount = photo.faces.filter((f) => f.eye_open_score < 0.35).length;
      const openCount = photo.faces.filter((f) => f.eye_open_score >= 0.70).length;
      if (closedCount > 0 && openCount > 0 && !reasons.includes('合影闭眼分歧')) {
        reasons.push(`合影表情分歧 (${closedCount}闭/${openCount}睁)`);
        score = Math.max(score, 0.85);
      }

      const pinnedFace = photo.faces.find((f) => f.is_pinned);
      if (pinnedFace) {
        if (pinnedFace.eye_open_score < 0.50) {
          reasons.push(scene === 'wedding' ? '新人闭眼' : '主角闭眼');
          score = Math.max(score, 0.90);
        } else if (pinnedFace.sharpness < 50.0 && !reasons.includes('Cosplay主角眼部微软')) {
          reasons.push('主角微脱焦');
          score = Math.max(score, 0.70);
        }
      }
    }
  }

  // 5. 临界置信度标签 (0.60 <= confidence < 0.85 且非 clean)
  const borderlineTags = photo.defect_tags.filter(
    (t) => t.category !== 'clean' && t.confidence >= 0.60 && t.confidence < 0.85 && !t.id.startsWith('review_')
  );
  if (borderlineTags.length > 0) {
    const tagLabels = borderlineTags.map((t) => t.label).join('/');
    reasons.push(`临界置信度 (${tagLabels})`);
    score = Math.max(score, 0.65);
  }

  // 6. 焦点微软
  if (
    photo.defect_tags.some((t) => t.id === 'fixable_slight_blur') &&
    !reasons.includes('临界合焦边缘') &&
    !reasons.includes('Cosplay美瞳/眼妆需核验')
  ) {
    reasons.push('焦点微软');
    score = Math.max(score, 0.60);
  }

  return {
    isUncertain: reasons.length > 0,
    score,
    reasons,
  };
};

export const isPhotoMatchingFilter = (
  photo: PhotoItem,
  filter: FilterCategory,
  camera: string | null = null,
  lens: string | null = null,
  reviewOnlyUnadjudicated: boolean = false,
  scene: WorkflowScene = 'general',
): boolean => {
  const uncertainty = getPhotoUncertainty(photo, scene);
  const matchesCategory =
    filter === 'all' ||
    (filter === 'clean' && photo.retouch_status === 'clean') ||
    (filter === 'pending' && photo.retouch_status === 'pending') ||
    (filter === 'failed' && photo.retouch_status === 'failed') ||
    (filter === 'fixable' && photo.retouch_status === 'fixable') ||
    (filter === 'fatal' && photo.retouch_status === 'fatal') ||
    (filter === 'picked' && photo.pick_status === 'Pick') ||
    (filter === 'review' &&
      uncertainty.isUncertain &&
      (!reviewOnlyUnadjudicated || photo.pick_status === 'None'));

  if (!matchesCategory) return false;

  if (camera) {
    const camDisplay = [photo.exif?.camera_make, photo.exif?.camera_model].filter(Boolean).join(' ');
    if (camDisplay !== camera && photo.exif?.camera_model !== camera) {
      return false;
    }
  }

  if (lens) {
    if (photo.exif?.lens_model !== lens && photo.exif?.lens_make !== lens) {
      return false;
    }
  }

  return true;
};

export const getFilteredPhotos = (
  photos: PhotoItem[],
  filter: FilterCategory,
  camera: string | null = null,
  lens: string | null = null,
  reviewOnlyUnadjudicated: boolean = false,
  scene: WorkflowScene = 'general',
): PhotoItem[] => {
  return photos.filter((p) => isPhotoMatchingFilter(p, filter, camera, lens, reviewOnlyUnadjudicated, scene));
};

export const getFilteredProgress = (
  photos: PhotoItem[],
  currentIndex: number,
  filter: FilterCategory,
  camera: string | null = null,
  lens: string | null = null,
  reviewOnlyUnadjudicated: boolean = false,
  scene: WorkflowScene = 'general',
): { filteredIndex: number; filteredTotal: number; isFiltered: boolean } => {
  const isFiltered = filter !== 'all' || camera !== null || lens !== null;
  if (!isFiltered) {
    return { filteredIndex: currentIndex, filteredTotal: photos.length, isFiltered: false };
  }
  let filteredIndex = -1;
  let filteredTotal = 0;
  const current = photos[currentIndex];
  for (let i = 0; i < photos.length; i++) {
    if (isPhotoMatchingFilter(photos[i], filter, camera, lens, reviewOnlyUnadjudicated, scene)) {
      if (current && photos[i].path === current.path) {
        filteredIndex = filteredTotal;
      }
      filteredTotal++;
    }
  }
  return { filteredIndex, filteredTotal, isFiltered: true };
};

const updateSourceHash = (photos: PhotoItem[], path: string, sourceHash: string) =>
  photos.map((photo) =>
    photo.path === path ? { ...photo, xmp_source_hash: sourceHash } : photo,
  );

const patchPhoto = (photos: PhotoItem[], path: string, patch: Partial<PhotoItem>) =>
  photos.map((photo) => photo.path === path ? { ...photo, ...patch } : photo);

export interface XmpConflict {
  localPhoto: PhotoItem;
  originalPhoto: PhotoItem;
  message: string;
  origin: 'write' | 'undo';
}

type TriageSnapshot = Pick<
  PhotoItem,
  'path' | 'filename' | 'rating' | 'color_label' | 'pick_status' | 'retouch_status' | 'defect_tags' | 'burst_group_id'
>;

export interface UndoEntry {
  label: string;
  snapshots: TriageSnapshot[];
}

const MAX_UNDO_ENTRIES = 100;

const snapshotTriage = (photo: PhotoItem): TriageSnapshot => ({
  path: photo.path,
  filename: photo.filename,
  rating: photo.rating,
  color_label: photo.color_label,
  pick_status: photo.pick_status,
  retouch_status: photo.retouch_status,
  defect_tags: photo.defect_tags.map((tag) => ({ ...tag })),
  burst_group_id: photo.burst_group_id,
});

const appendUndoEntry = (stack: UndoEntry[], entry: UndoEntry) =>
  [...stack, entry].slice(-MAX_UNDO_ENTRIES);

const removePathFromLatestUndo = (stack: UndoEntry[], path: string) => {
  if (stack.length === 0) return stack;
  const latest = stack[stack.length - 1];
  const remaining = latest.snapshots.filter((snapshot) => snapshot.path !== path);
  return remaining.length > 0
    ? [...stack.slice(0, -1), { ...latest, snapshots: remaining }]
    : stack.slice(0, -1);
};

const isXmpConflictError = (error: unknown) => String(error).includes('XMP_CONFLICT:');

const makeXmpConflict = (
  error: unknown,
  photo: PhotoItem,
  patch: Partial<PhotoItem>,
  origin: XmpConflict['origin'] = 'write',
): XmpConflict | null => isXmpConflictError(error)
  ? {
      localPhoto: { ...photo, ...patch },
      originalPhoto: photo,
      message: String(error).replace(/^.*XMP_CONFLICT:/, ''),
      origin,
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
  previewStatus: 'idle' | 'loading' | 'loaded' | 'error';
  previewError: string | null;
  engineInfo: EngineInfo | null;
  writeStatus: 'idle' | 'saving' | 'saved' | 'error';
  writeError: string | null;
  xmpConflict: XmpConflict | null;
  undoStack: UndoEntry[];
  isUndoing: boolean;
  clearWriteError: () => void;
  dismissXmpConflict: () => void;
  resolveXmpConflict: (choice: 'reload' | 'overwrite' | 'copy') => Promise<void>;
  undoLast: () => Promise<void>;

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
  retryCurrentPreview: () => Promise<void>;
  selectPhotoByFilename: (filename: string) => Promise<void>;
  setActiveFilter: (filter: FilterCategory) => void;
  selectedCamera: string | null;
  selectedLens: string | null;
  reviewOnlyUnadjudicated: boolean;
  setSelectedCamera: (camera: string | null) => void;
  setSelectedLens: (lens: string | null) => void;
  setReviewOnlyUnadjudicated: (val: boolean) => void;
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
  compareScope: 'all' | 'burst';
  compareTargetIndex: number | null;
  comparePreviewUrl: string | null;
  comparePreviewStatus: 'idle' | 'loading' | 'loaded' | 'error';
  comparePreviewError: string | null;
  syncZoomAndPan: boolean;

  setCompareScope: (scope: 'all' | 'burst') => void;
  enterCompareMode: (candidateIndex?: number) => void;
  exitCompareMode: () => void;
  toggleCompareMode: () => void;
  setCompareTargetIndex: (index: number) => void;
  retryComparePreview: () => Promise<void>;
  nextCompareCandidate: () => void;
  prevCompareCandidate: () => void;
  swapComparePhotos: () => void;
  toggleSyncZoomAndPan: () => void;
  setComparePhotoRating: (rating: number) => Promise<void>;
  setComparePhotoPickStatus: (status: 'Pick' | 'Reject' | 'None') => Promise<void>;
  pickBurstWinner: (winnerIndex?: number) => Promise<void>;
  resetFilter: () => void;
  jumpToFirstMatching: () => void;
  jumpToLastMatching: () => void;

  isExportModalOpen: boolean;
  setExportModalOpen: (open: boolean) => void;
  toggleAutoAdvance: () => void;

  // 场景工作流预设模式 (演唱会/舞台、二次元Cos、商业会议、婚礼纪实、通用人像)
  activeWorkflowScene: WorkflowScene;
  setWorkflowScene: (scene: WorkflowScene) => void;

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
  selectedCamera: null,
  selectedLens: null,
  reviewOnlyUnadjudicated: false,
  activeWorkflowScene:
    (typeof window !== 'undefined' &&
      (localStorage.getItem('quickpick_workflow_scene') as WorkflowScene)) ||
    'general',
  setWorkflowScene: (scene: WorkflowScene) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('quickpick_workflow_scene', scene);
    }
    set({ activeWorkflowScene: scene });
  },
  autoAdvance: true,
  isLoading: false,
  isExportModalOpen: false,
  isCompareMode: false,
  compareScope: 'burst',
  compareTargetIndex: null,
  comparePreviewUrl: null,
  comparePreviewStatus: 'idle',
  comparePreviewError: null,
  syncZoomAndPan: true,
  currentPreviewUrl: null,
  previewStatus: 'idle',
  previewError: null,
  engineInfo: null,
  writeStatus: 'idle',
  writeError: null,
  xmpConflict: null,
  undoStack: [],
  isUndoing: false,
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
          undoStack: conflict.origin === 'undo'
            ? removePathFromLatestUndo(state.undoStack, local.path)
            : appendUndoEntry(state.undoStack, {
                label: `撤销 ${local.filename} 的冲突覆盖`,
                snapshots: [snapshotTriage(conflict.originalPhoto)],
              }),
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
        undoStack: conflict.origin === 'undo'
          ? removePathFromLatestUndo(state.undoStack, local.path)
          : state.undoStack,
      }));
    } catch (error) {
      set({
        writeStatus: 'error',
        writeError: `处理 ${local.filename} 的 XMP 冲突失败：${String(error)}`,
      });
    }
  },

  undoLast: async () => {
    const { undoStack, writeStatus, isUndoing, photos } = get();
    if (undoStack.length === 0 || writeStatus === 'saving' || isUndoing) return;

    const entry = undoStack[undoStack.length - 1];
    const restored = new Map<string, TriageSnapshot & { sourceHash: string }>();
    const failures: TriageSnapshot[] = [];
    const errors: string[] = [];
    let conflict: XmpConflict | null = null;

    set({ isUndoing: true, writeStatus: 'saving', writeError: null, xmpConflict: null });

    for (const snapshot of entry.snapshots) {
      const current = photos.find((photo) => photo.path === snapshot.path);
      if (!current) {
        failures.push(snapshot);
        errors.push(`${snapshot.filename}: 当前相册中已不存在`);
        continue;
      }

      try {
        const sourceHash = await updatePhotoTriage(
          snapshot.path,
          snapshot.rating,
          snapshot.color_label,
          snapshot.pick_status,
          snapshot.retouch_status,
          snapshot.defect_tags.map((tag) => tag.id).join(','),
          snapshot.burst_group_id,
          current.xmp_source_hash,
        );
        restored.set(snapshot.path, { ...snapshot, sourceHash });
      } catch (error) {
        failures.push(snapshot);
        errors.push(`${snapshot.filename}: ${String(error)}`);
        conflict ??= makeXmpConflict(error, current, snapshot, 'undo');
      }
    }

    set((state) => {
      const baseStack = state.undoStack.slice(0, -1);
      const nextStack = failures.length > 0
        ? [...baseStack, { ...entry, snapshots: failures }]
        : baseStack;
      return {
        photos: state.photos.map((photo) => {
          const snapshot = restored.get(photo.path);
          return snapshot
            ? {
                ...photo,
                rating: snapshot.rating,
                color_label: snapshot.color_label,
                pick_status: snapshot.pick_status,
                retouch_status: snapshot.retouch_status,
                defect_tags: snapshot.defect_tags,
                burst_group_id: snapshot.burst_group_id,
                xmp_source_hash: snapshot.sourceHash,
              }
            : photo;
        }),
        undoStack: nextStack,
        isUndoing: false,
        writeStatus: errors.length > 0 ? 'error' : 'saved',
        writeError: errors.length > 0
          ? `撤销“${entry.label}”时有 ${errors.length} 张写入失败\n${errors.slice(0, 3).join('\n')}`
          : null,
        xmpConflict: conflict,
      };
    });
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

  setCompareScope: (scope: 'all' | 'burst') => set({ compareScope: scope }),

  setReviewOnlyUnadjudicated: (val: boolean) => set({ reviewOnlyUnadjudicated: val }),

  resetFilter: () => {
    set({
      activeFilter: 'all',
      selectedCamera: null,
      selectedLens: null,
      reviewOnlyUnadjudicated: false,
    });
  },

  enterCompareMode: (candidateIndex?: number) => {
    const { photos, currentIndex, previewCache } = get();
    if (photos.length < 2) return;

    const currentPhoto = photos[currentIndex];
    const burstId = currentPhoto?.burst_group_id;

    let targetIdx: number;
    let initialScope: 'all' | 'burst' = 'all';

    if (
      typeof candidateIndex === 'number' &&
      candidateIndex >= 0 &&
      candidateIndex < photos.length &&
      candidateIndex !== currentIndex
    ) {
      targetIdx = candidateIndex;
      if (burstId && photos[targetIdx]?.burst_group_id === burstId) {
        initialScope = 'burst';
      }
    } else if (burstId) {
      // 优先在当前连拍组中寻找候选片
      const burstIndices = photos
        .map((p, idx) => ({ p, idx }))
        .filter(({ p, idx }) => p.burst_group_id === burstId && idx !== currentIndex)
        .map(({ idx }) => idx);

      if (burstIndices.length > 0) {
        targetIdx = burstIndices[0];
        initialScope = 'burst';
      } else if (currentIndex < photos.length - 1) {
        targetIdx = currentIndex + 1;
      } else {
        targetIdx = Math.max(0, currentIndex - 1);
      }
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
      getPhotoPreview(candidatePhoto.path)
        .then((url) => {
          previewCache.set(candidatePhoto.path, url);
          if (get().compareTargetIndex === targetIdx) {
            set({ comparePreviewUrl: url, comparePreviewStatus: 'loaded', comparePreviewError: null });
          }
        })
        .catch((error) => {
          if (get().compareTargetIndex === targetIdx) {
            set({
              comparePreviewUrl: null,
              comparePreviewStatus: 'error',
              comparePreviewError: `提取 ${candidatePhoto.filename} 对比预览失败：${String(error)}`,
            });
          }
        });
    }

    set({
      isCompareMode: true,
      compareScope: initialScope,
      compareTargetIndex: targetIdx,
      comparePreviewUrl: candidateUrl,
      comparePreviewStatus: candidateUrl ? 'loaded' : 'loading',
      comparePreviewError: null,
    });
  },

  exitCompareMode: () => {
    set({
      isCompareMode: false,
      compareTargetIndex: null,
      comparePreviewUrl: null,
      comparePreviewStatus: 'idle',
      comparePreviewError: null,
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
    set({
      compareTargetIndex: index,
      comparePreviewUrl: null,
      comparePreviewStatus: 'loading',
      comparePreviewError: null,
    });

    if (previewCache.has(candidatePhoto.path)) {
      set({
        comparePreviewUrl: previewCache.get(candidatePhoto.path)!,
        comparePreviewStatus: 'loaded',
      });
    } else {
      getPhotoPreview(candidatePhoto.path)
        .then((url) => {
          previewCache.set(candidatePhoto.path, url);
          if (get().compareTargetIndex === index) {
            set({ comparePreviewUrl: url, comparePreviewStatus: 'loaded', comparePreviewError: null });
          }
        })
        .catch((error) => {
          if (get().compareTargetIndex === index) {
            set({
              comparePreviewUrl: null,
              comparePreviewStatus: 'error',
              comparePreviewError: `提取 ${candidatePhoto.filename} 对比预览失败：${String(error)}`,
            });
          }
        });
    }
  },

  retryComparePreview: async () => {
    const { photos, compareTargetIndex, previewCache } = get();
    if (compareTargetIndex === null) return;
    const photo = photos[compareTargetIndex];
    if (!photo) return;

    previewCache.delete(photo.path);
    set({ comparePreviewUrl: null, comparePreviewStatus: 'loading', comparePreviewError: null });
    try {
      const url = await getPhotoPreview(photo.path);
      previewCache.set(photo.path, url);
      if (get().photos[get().compareTargetIndex ?? -1]?.path === photo.path) {
        set({ comparePreviewUrl: url, comparePreviewStatus: 'loaded', comparePreviewError: null });
      }
    } catch (error) {
      if (get().photos[get().compareTargetIndex ?? -1]?.path === photo.path) {
        set({
          comparePreviewUrl: null,
          comparePreviewStatus: 'error',
          comparePreviewError: `提取 ${photo.filename} 对比预览失败：${String(error)}`,
        });
      }
    }
  },

  nextCompareCandidate: () => {
    const { photos, currentIndex, compareTargetIndex, compareScope, setCompareTargetIndex } = get();
    if (compareTargetIndex === null || photos.length <= 1) return;

    const currentPhoto = photos[currentIndex];
    if (compareScope === 'burst' && currentPhoto?.burst_group_id) {
      const burstId = currentPhoto.burst_group_id;
      const candidates = photos
        .map((p, idx) => ({ p, idx }))
        .filter(({ p, idx }) => p.burst_group_id === burstId && idx !== currentIndex)
        .map(({ idx }) => idx);

      if (candidates.length > 0) {
        const curPos = candidates.indexOf(compareTargetIndex);
        const nextPos = curPos === -1 ? 0 : (curPos + 1) % candidates.length;
        setCompareTargetIndex(candidates[nextPos]);
        return;
      }
    }

    let nextIdx = compareTargetIndex + 1;
    if (nextIdx === currentIndex) {
      nextIdx++;
    }
    if (nextIdx < photos.length) {
      setCompareTargetIndex(nextIdx);
    }
  },

  prevCompareCandidate: () => {
    const { photos, currentIndex, compareTargetIndex, compareScope, setCompareTargetIndex } = get();
    if (compareTargetIndex === null) return;

    const currentPhoto = photos[currentIndex];
    if (compareScope === 'burst' && currentPhoto?.burst_group_id) {
      const burstId = currentPhoto.burst_group_id;
      const candidates = photos
        .map((p, idx) => ({ p, idx }))
        .filter(({ p, idx }) => p.burst_group_id === burstId && idx !== currentIndex)
        .map(({ idx }) => idx);

      if (candidates.length > 0) {
        const curPos = candidates.indexOf(compareTargetIndex);
        const prevPos = curPos <= 0 ? candidates.length - 1 : curPos - 1;
        setCompareTargetIndex(candidates[prevPos]);
        return;
      }
    }

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

  pickBurstWinner: async (targetWinnerIndex?: number) => {
    const { photos, currentIndex, undoStack } = get();
    const winnerIdx = typeof targetWinnerIndex === 'number' ? targetWinnerIndex : currentIndex;
    if (winnerIdx < 0 || winnerIdx >= photos.length) return;

    const winnerPhoto = photos[winnerIdx];
    const burstId = winnerPhoto.burst_group_id;

    if (!burstId) {
      // 非连拍照片：直接标记为 Pick (若无星级设为 5 星)
      await get().setPickStatus('Pick');
      if (winnerPhoto.rating === 0) {
        await get().setRating(5);
      }
      return;
    }

    // 属于连拍组：找出同组所有照片
    const burstIndices: number[] = [];
    photos.forEach((p, i) => {
      if (p.burst_group_id === burstId) {
        burstIndices.push(i);
      }
    });

    if (burstIndices.length === 0) return;

    // 记录整组撤销快照
    const snapshots = burstIndices.map((i) => snapshotTriage(photos[i]));
    const nextUndo = appendUndoEntry(undoStack, {
      label: `连拍定优 #${winnerIdx + 1} (${winnerPhoto.filename})`,
      snapshots,
    });

    // 构造乐观更新
    const newPhotos = [...photos];
    const updatesToPersist: { photo: PhotoItem; rating: number; pick_status: 'Pick' | 'Reject' }[] = [];

    burstIndices.forEach((i) => {
      const orig = photos[i];
      const isWinner = i === winnerIdx;
      const nextRating = isWinner && orig.rating === 0 ? 5 : orig.rating;
      const nextPick = isWinner ? ('Pick' as const) : ('Reject' as const);

      const updated = {
        ...orig,
        rating: nextRating,
        pick_status: nextPick,
      };
      newPhotos[i] = updated;
      updatesToPersist.push({ photo: orig, rating: nextRating, pick_status: nextPick });
    });

    set({
      photos: newPhotos,
      undoStack: nextUndo,
      writeStatus: 'saving',
      writeError: null,
      xmpConflict: null,
    });

    // 逐张落盘 XMP 并更新 Hash
    const errors: string[] = [];
    let conflict: XmpConflict | null = null;
    const latestPhotos = [...get().photos];

    for (const item of updatesToPersist) {
      try {
        const sourceHash = await updatePhotoTriage(
          item.photo.path,
          item.rating,
          item.photo.color_label,
          item.pick_status,
          item.photo.retouch_status,
          item.photo.defect_tags.map((t) => t.id).join(','),
          item.photo.burst_group_id,
          item.photo.xmp_source_hash,
        );
        const idx = latestPhotos.findIndex((p) => p.path === item.photo.path);
        if (idx !== -1) {
          latestPhotos[idx] = { ...latestPhotos[idx], xmp_source_hash: sourceHash };
        }
      } catch (err) {
        errors.push(`${item.photo.filename}: ${String(err)}`);
        conflict ??= makeXmpConflict(err, item.photo, { pick_status: item.pick_status, rating: item.rating }, 'write');
      }
    }

    set({
      photos: latestPhotos,
      writeStatus: errors.length > 0 ? 'error' : 'saved',
      writeError: errors.length > 0 ? `连拍定优落盘部分失败：${errors.slice(0, 3).join('; ')}` : null,
      xmpConflict: conflict,
    });
  },

  toggleSyncZoomAndPan: () => {
    set((state) => ({ syncZoomAndPan: !state.syncZoomAndPan }));
  },

  setComparePhotoRating: async (rating: number) => {
    const { compareTargetIndex, photos } = get();
    if (compareTargetIndex === null) return;
    const photo = photos[compareTargetIndex];
    if (!photo) return;
    if (photo.rating === rating) return;

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
      set((state) => ({
        photos: updateSourceHash(state.photos, photo.path, sourceHash),
        writeStatus: 'saved',
        undoStack: appendUndoEntry(state.undoStack, {
          label: `撤销 ${photo.filename} 的评分`,
          snapshots: [snapshotTriage(photo)],
        }),
      }));
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
    if (photo.pick_status === status) return;

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
      set((state) => ({
        photos: updateSourceHash(state.photos, photo.path, sourceHash),
        writeStatus: 'saved',
        undoStack: appendUndoEntry(state.undoStack, {
          label: `撤销 ${photo.filename} 的采纳状态`,
          snapshots: [snapshotTriage(photo)],
        }),
      }));
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
        currentPreviewUrl: null,
        previewStatus: photos.length > 0 ? 'loading' : 'idle',
        previewError: null,
        isCompareMode: false,
        compareTargetIndex: null,
        comparePreviewUrl: null,
        comparePreviewStatus: 'idle',
        comparePreviewError: null,
        undoStack: [],
        isUndoing: false,
        writeStatus: 'idle',
        writeError: null,
        xmpConflict: null,
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
    const { photos, selectedCamera, selectedLens, reviewOnlyUnadjudicated, activeWorkflowScene } = get();
    const current = photos[get().currentIndex];
    if (current && !isPhotoMatchingFilter(current, filter, selectedCamera, selectedLens, reviewOnlyUnadjudicated, activeWorkflowScene)) {
      const firstMatchIdx = photos.findIndex((p) =>
        isPhotoMatchingFilter(p, filter, selectedCamera, selectedLens, reviewOnlyUnadjudicated, activeWorkflowScene),
      );
      if (firstMatchIdx !== -1) {
        get().selectIndex(firstMatchIdx);
      }
    }
  },

  setSelectedCamera: (camera: string | null) => {
    set({ selectedCamera: camera });
    const { photos, activeFilter, selectedLens, reviewOnlyUnadjudicated, activeWorkflowScene } = get();
    const current = photos[get().currentIndex];
    if (current && !isPhotoMatchingFilter(current, activeFilter, camera, selectedLens, reviewOnlyUnadjudicated, activeWorkflowScene)) {
      const firstMatchIdx = photos.findIndex((p) =>
        isPhotoMatchingFilter(p, activeFilter, camera, selectedLens, reviewOnlyUnadjudicated, activeWorkflowScene),
      );
      if (firstMatchIdx !== -1) {
        get().selectIndex(firstMatchIdx);
      }
    }
  },

  setSelectedLens: (lens: string | null) => {
    set({ selectedLens: lens });
    const { photos, activeFilter, selectedCamera, reviewOnlyUnadjudicated, activeWorkflowScene } = get();
    const current = photos[get().currentIndex];
    if (current && !isPhotoMatchingFilter(current, activeFilter, selectedCamera, lens, reviewOnlyUnadjudicated, activeWorkflowScene)) {
      const firstMatchIdx = photos.findIndex((p) =>
        isPhotoMatchingFilter(p, activeFilter, selectedCamera, lens, reviewOnlyUnadjudicated, activeWorkflowScene),
      );
      if (firstMatchIdx !== -1) {
        get().selectIndex(firstMatchIdx);
      }
    }
  },

  selectIndex: async (index: number) => {
    const { photos, previewCache } = get();
    if (index < 0 || index >= photos.length) return;

    const currentPhoto = photos[index];
    set({ currentIndex: index, focusedFace: null, previewError: null });

    // 1. 如果缓存中已有当前预览图，立刻 0ms 展示
    if (previewCache.has(currentPhoto.path)) {
      set({ currentPreviewUrl: previewCache.get(currentPhoto.path)!, previewStatus: 'loaded' });
    } else {
      set({ currentPreviewUrl: null, previewStatus: 'loading' });
      getPhotoPreview(currentPhoto.path).then((url) => {
        if (get().photos[get().currentIndex]?.path === currentPhoto.path) {
          set({ currentPreviewUrl: url, previewStatus: 'loaded', previewError: null });
        }
        previewCache.set(currentPhoto.path, url);
      }).catch((error) => {
        if (get().photos[get().currentIndex]?.path === currentPhoto.path) {
          set({
            currentPreviewUrl: null,
            previewStatus: 'error',
            previewError: `提取 ${currentPhoto.filename} 预览失败：${String(error)}`,
          });
        }
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
          }).catch(() => {});
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

  retryCurrentPreview: async () => {
    const { photos, currentIndex, previewCache } = get();
    const photo = photos[currentIndex];
    if (!photo) return;

    previewCache.delete(photo.path);
    set({ currentPreviewUrl: null, previewStatus: 'loading', previewError: null });
    try {
      const url = await getPhotoPreview(photo.path);
      previewCache.set(photo.path, url);
      if (get().photos[get().currentIndex]?.path === photo.path) {
        set({ currentPreviewUrl: url, previewStatus: 'loaded', previewError: null });
      }
    } catch (error) {
      if (get().photos[get().currentIndex]?.path === photo.path) {
        set({
          currentPreviewUrl: null,
          previewStatus: 'error',
          previewError: `提取 ${photo.filename} 预览失败：${String(error)}`,
        });
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
    const { currentIndex, photos, activeFilter, selectedCamera, selectedLens, reviewOnlyUnadjudicated, activeWorkflowScene, selectIndex } = get();
    if (photos.length === 0) return;

    for (let i = currentIndex + 1; i < photos.length; i++) {
      if (isPhotoMatchingFilter(photos[i], activeFilter, selectedCamera, selectedLens, reviewOnlyUnadjudicated, activeWorkflowScene)) {
        selectIndex(i);
        break;
      }
    }
  },

  prevPhoto: () => {
    const { currentIndex, photos, activeFilter, selectedCamera, selectedLens, reviewOnlyUnadjudicated, activeWorkflowScene, selectIndex } = get();
    if (photos.length === 0) return;

    for (let i = currentIndex - 1; i >= 0; i--) {
      if (isPhotoMatchingFilter(photos[i], activeFilter, selectedCamera, selectedLens, reviewOnlyUnadjudicated, activeWorkflowScene)) {
        selectIndex(i);
        break;
      }
    }
  },

  jumpToFirstMatching: () => {
    const { photos, activeFilter, selectedCamera, selectedLens, reviewOnlyUnadjudicated, activeWorkflowScene, selectIndex } = get();
    for (let i = 0; i < photos.length; i++) {
      if (isPhotoMatchingFilter(photos[i], activeFilter, selectedCamera, selectedLens, reviewOnlyUnadjudicated, activeWorkflowScene)) {
        selectIndex(i);
        break;
      }
    }
  },

  jumpToLastMatching: () => {
    const { photos, activeFilter, selectedCamera, selectedLens, reviewOnlyUnadjudicated, activeWorkflowScene, selectIndex } = get();
    for (let i = photos.length - 1; i >= 0; i--) {
      if (isPhotoMatchingFilter(photos[i], activeFilter, selectedCamera, selectedLens, reviewOnlyUnadjudicated, activeWorkflowScene)) {
        selectIndex(i);
        break;
      }
    }
  },

  setRating: async (rating: number) => {
    const { currentIndex, photos, autoAdvance, nextPhoto } = get();
    const photo = photos[currentIndex];
    if (!photo) return;
    if (photo.rating === rating) return;

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
      set((state) => ({
        photos: updateSourceHash(state.photos, photo.path, sourceHash),
        writeStatus: 'saved',
        undoStack: appendUndoEntry(state.undoStack, {
          label: `撤销 ${photo.filename} 的评分`,
          snapshots: [snapshotTriage(photo)],
        }),
      }));
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
    if (photo.color_label === color_label) return;

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
      set((state) => ({
        photos: updateSourceHash(state.photos, photo.path, sourceHash),
        writeStatus: 'saved',
        undoStack: appendUndoEntry(state.undoStack, {
          label: `撤销 ${photo.filename} 的色标`,
          snapshots: [snapshotTriage(photo)],
        }),
      }));
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
    if (photo.pick_status === pick_status) return;

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
      set((state) => ({
        photos: updateSourceHash(state.photos, photo.path, sourceHash),
        writeStatus: 'saved',
        undoStack: appendUndoEntry(state.undoStack, {
          label: `撤销 ${photo.filename} 的采纳状态`,
          snapshots: [snapshotTriage(photo)],
        }),
      }));
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
    if (photo.retouch_status === status) return;

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
      set((state) => ({
        photos: updateSourceHash(state.photos, photo.path, sourceHash),
        writeStatus: 'saved',
        undoStack: appendUndoEntry(state.undoStack, {
          label: `撤销 ${photo.filename} 的诊断覆写`,
          snapshots: [snapshotTriage(photo)],
        }),
      }));
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
        undoStack: appendUndoEntry(state.undoStack, {
          label: `撤销 ${photo.filename} 的重新分析结果`,
          snapshots: [snapshotTriage(photo)],
        }),
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
    const { photos, activeWorkflowScene } = get();
    set({ writeStatus: 'saving', writeError: null });
    const updates = new Map<string, { rating: number; pick_status: string; sourceHash: string }>();
    const errors: string[] = [];
    let conflict: XmpConflict | null = null;
    for (const photo of photos.filter((item) => item.retouch_status === 'clean' && !getPhotoUncertainty(item, activeWorkflowScene).isUncertain)) {
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
      undoStack: updates.size > 0
        ? appendUndoEntry(state.undoStack, {
            label: `撤销批量采纳 ${updates.size} 张照片`,
            snapshots: photos.filter((photo) => updates.has(photo.path)).map(snapshotTriage),
          })
        : state.undoStack,
    }));
    if (errors.length > 0) {
      const message = `${errors.length} 张写入失败\n${errors.slice(0, 3).join('\n')}`;
      set({ writeStatus: 'error', writeError: message, xmpConflict: conflict });
      throw new Error(message);
    }
    set({ writeStatus: 'saved' });
  },

  batchRejectFatal: async () => {
    const { photos, activeWorkflowScene } = get();
    set({ writeStatus: 'saving', writeError: null });
    const updates = new Map<string, string>();
    const errors: string[] = [];
    let conflict: XmpConflict | null = null;
    for (const photo of photos.filter((item) => item.retouch_status === 'fatal' && !getPhotoUncertainty(item, activeWorkflowScene).isUncertain)) {
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
      undoStack: updates.size > 0
        ? appendUndoEntry(state.undoStack, {
            label: `撤销批量排除 ${updates.size} 张照片`,
            snapshots: photos.filter((photo) => updates.has(photo.path)).map(snapshotTriage),
          })
        : state.undoStack,
    }));
    if (errors.length > 0) {
      const message = `${errors.length} 张写入失败\n${errors.slice(0, 3).join('\n')}`;
      set({ writeStatus: 'error', writeError: message, xmpConflict: conflict });
      throw new Error(message);
    }
    set({ writeStatus: 'saved' });
  },

  applyAiSuggestions: async () => {
    const { photos, activeWorkflowScene } = get();
    set({ writeStatus: 'saving', writeError: null });
    const updates = new Map<string, { rating: number; pick_status: string; sourceHash: string }>();
    const errors: string[] = [];
    let conflict: XmpConflict | null = null;
    for (const photo of photos.filter((item) => (item.retouch_status === 'clean' || item.retouch_status === 'fatal') && !getPhotoUncertainty(item, activeWorkflowScene).isUncertain)) {
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
      undoStack: updates.size > 0
        ? appendUndoEntry(state.undoStack, {
            label: `撤销 AI 批量建议 ${updates.size} 张照片`,
            snapshots: photos.filter((photo) => updates.has(photo.path)).map(snapshotTriage),
          })
        : state.undoStack,
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
