import { create } from 'zustand';
import {
  FilterCategory,
  LocalPhoto,
  PhotoInsight,
  SceneChapter,
  UserSelection,
  WorkflowScene,
} from '../types/photo';
import {
  getStorylinePreset,
  distributeTargetGoalAcrossChapters,
} from '../utils/storylinePresets';
import {
  detectOptimalPreset,
  DetectedPresetResult,
} from '../utils/storylineDetector';
import {
  persistProjectViewState,
  ProjectViewStateInput,
  relocateProjectState,
  scanFolder as tauriScanFolder,
  PhotoItem,
} from '../services/tauriBridge';
import { useSelectionStore } from './selectionStore';
import { useInsightStore } from './insightStore';
import { usePreviewStore } from './previewStore';
import { arePhotosBurstConsecutive } from '../utils/phashUtils';
import { parseAnnotation } from '../utils/annotationUtils';

export const SCENE_COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#6366f1', // indigo
  '#14b8a6', // teal
];

export const DEFAULT_SCENE_NAMES = [
  '第一套造型',
  '第二套造型',
  '室内抓拍',
  '外景特写',
  '亲友合影',
  '重要仪式',
  '欢庆宴会',
  '花絮留念',
];

export function withUpdatedBurstGroups(photos: LocalPhoto[]): LocalPhoto[] {
  const next: LocalPhoto[] = photos.map((photo) => ({ ...photo, burstGroupId: undefined }));
  let groupStart = 0;

  const commitGroup = (endExclusive: number) => {
    if (endExclusive - groupStart < 2) return;
    const groupId = `burst:${next[groupStart].id}`;
    for (let index = groupStart; index < endExclusive; index += 1) {
      next[index] = { ...next[index], burstGroupId: groupId };
    }
  };

  for (let index = 1; index < next.length; index += 1) {
    const previous = next[index - 1];
    const current = next[index];
    const consecutive = arePhotosBurstConsecutive(current, previous);

    if (!consecutive) {
      commitGroup(index);
      groupStart = index;
    }
  }
  commitGroup(next.length);
  return next;
}

export function photoMatchesFilter(
  photo: LocalPhoto,
  index: number,
  filter: FilterCategory,
  selectedSceneId: string | null,
  scenes: SceneChapter[],
  selections: Record<string, UserSelection>,
  viewedPhotoIds: Record<string, boolean>,
  insights: Record<string, PhotoInsight>,
  tagFilter?: string | null,
  currentIndex?: number,
): boolean {
  if (tagFilter) {
    const note = selections[photo.id]?.note;
    const ann = parseAnnotation(note);
    const tags = ann.presetTags || [];
    if (!tags.includes(tagFilter)) return false;
  }

  const selectedScene = selectedSceneId
    ? scenes.find((scene) => scene.id === selectedSceneId)
    : undefined;
  if (selectedScene && (index < selectedScene.startIndex || index > selectedScene.endIndex)) {
    return false;
  }

  const selectionState = selections[photo.id]?.state || 'unreviewed';
  if (filter === 'unreviewed') {
    return !viewedPhotoIds[photo.id] || (currentIndex !== undefined && index === currentIndex);
  }
  if (filter === 'selected') return selectionState === 'selected';
  if (filter === 'maybe') return selectionState === 'maybe';
  if (filter === 'skipped') return selectionState === 'skipped';
  if (filter === 'burst') return Boolean(photo.burstGroupId);
  if (filter === 'needs_check') {
    const insight = insights[photo.id];
    return Boolean(
      insight &&
        (insight.analysisStatus === 'needs_check' ||
          insight.possibleBlur! > 40 ||
          (insight.possibleClosedEyes !== undefined && insight.possibleClosedEyes < 0.4)),
    );
  }
  return true;
}

function isUnfiltered(state: AlbumStore): boolean {
  return state.activeFilter === 'all' && state.selectedSceneId === null && state.activeTagFilter === null;
}

export function findNextMatchingIndex(state: AlbumStore): number | undefined {
  const { photos, currentIndex } = state;
  if (photos.length === 0) return undefined;
  if (isUnfiltered(state)) {
    return currentIndex + 1 < photos.length ? currentIndex + 1 : undefined;
  }
  const { selections, viewedPhotoIds } = useSelectionStore.getState();
  const { insights } = useInsightStore.getState();
  for (let i = currentIndex + 1; i < photos.length; i++) {
    if (
      photoMatchesFilter(
        photos[i],
        i,
        state.activeFilter,
        state.selectedSceneId,
        state.scenes,
        selections,
        viewedPhotoIds,
        insights,
        state.activeTagFilter,
      )
    ) {
      return i;
    }
  }
  return undefined;
}

export function findPrevMatchingIndex(state: AlbumStore): number | undefined {
  const { photos, currentIndex } = state;
  if (photos.length === 0) return undefined;
  if (isUnfiltered(state)) {
    return currentIndex - 1 >= 0 ? currentIndex - 1 : undefined;
  }
  const { selections, viewedPhotoIds } = useSelectionStore.getState();
  const { insights } = useInsightStore.getState();
  for (let i = currentIndex - 1; i >= 0; i--) {
    if (
      photoMatchesFilter(
        photos[i],
        i,
        state.activeFilter,
        state.selectedSceneId,
        state.scenes,
        selections,
        viewedPhotoIds,
        insights,
        state.activeTagFilter,
      )
    ) {
      return i;
    }
  }
  return undefined;
}

export function findFirstMatchingIndex(state: AlbumStore): number | undefined {
  const { photos } = state;
  if (photos.length === 0) return undefined;
  if (isUnfiltered(state)) {
    return 0;
  }
  const { selections, viewedPhotoIds } = useSelectionStore.getState();
  const { insights } = useInsightStore.getState();
  for (let i = 0; i < photos.length; i++) {
    if (
      photoMatchesFilter(
        photos[i],
        i,
        state.activeFilter,
        state.selectedSceneId,
        state.scenes,
        selections,
        viewedPhotoIds,
        insights,
        state.activeTagFilter,
      )
    ) {
      return i;
    }
  }
  return undefined;
}

export function findLastMatchingIndex(state: AlbumStore): number | undefined {
  const { photos } = state;
  if (photos.length === 0) return undefined;
  if (isUnfiltered(state)) {
    return photos.length - 1;
  }
  const { selections, viewedPhotoIds } = useSelectionStore.getState();
  const { insights } = useInsightStore.getState();
  for (let i = photos.length - 1; i >= 0; i--) {
    if (
      photoMatchesFilter(
        photos[i],
        i,
        state.activeFilter,
        state.selectedSceneId,
        state.scenes,
        selections,
        viewedPhotoIds,
        insights,
        state.activeTagFilter,
      )
    ) {
      return i;
    }
  }
  return undefined;
}

function matchingPhotoIndexes(state: AlbumStore): number[] {
  const { selections, viewedPhotoIds } = useSelectionStore.getState();
  const { insights } = useInsightStore.getState();
  return state.photos.flatMap((photo, index) =>
    photoMatchesFilter(
      photo,
      index,
      state.activeFilter,
      state.selectedSceneId,
      state.scenes,
      selections,
      viewedPhotoIds,
      insights,
      state.activeTagFilter,
    )
      ? [index]
      : [],
  );
}

const parseTimestamp = (photo: LocalPhoto): number | null => {
  const dtStr = photo.exif?.date_time_original || photo.capturedAt;
  if (!dtStr) return null;
  const normalized = dtStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(/-/g, '/');
  const ts = Date.parse(normalized);
  return isNaN(ts) ? null : ts / 1000;
};

export const clusterPhotosIntoScenes = (
  photos: LocalPhoto[],
  minGapMinutes = 10,
  presetId: WorkflowScene = 'general',
  targetGoal?: number | null,
): SceneChapter[] => {
  if (photos.length === 0) return [];
  const minGapSeconds = Math.max(60, minGapMinutes * 60);
  const splitIndices: number[] = [0];

  let lastTs = parseTimestamp(photos[0]);

  for (let i = 1; i < photos.length; i++) {
    const currTs = parseTimestamp(photos[i]);
    if (lastTs !== null && currTs !== null) {
      const diff = currTs - lastTs;
      if (diff >= minGapSeconds) {
        splitIndices.push(i);
      }
    }
    if (currTs !== null) {
      lastTs = currTs;
    }
  }

  const scenes: SceneChapter[] = [];
  const numSplits = splitIndices.length;
  const preset = getStorylinePreset(presetId);
  const quotas =
    targetGoal && targetGoal > 0
      ? distributeTargetGoalAcrossChapters(
          numSplits,
          targetGoal,
          Array.from(
            { length: numSplits },
            (_, index) => preset.chapters[index]?.weight ?? 1,
          ),
        )
      : [];

  for (let idx = 0; idx < numSplits; idx++) {
    const startIdx = splitIndices[idx];
    const endIdx = idx + 1 < numSplits ? splitIndices[idx + 1] - 1 : photos.length - 1;
    const count = endIdx - startIdx + 1;
    const color = SCENE_COLORS[idx % SCENE_COLORS.length];
    const presetChapter = preset.chapters[idx];
    const name = presetChapter ? presetChapter.name : `环节 ${idx + 1}`;
    const initialQuota = quotas[idx];

    scenes.push({
      id: `scene-${idx + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      startIndex: startIdx,
      endIndex: endIdx,
      startPath: photos[startIdx].path,
      endPath: photos[endIdx].path,
      photoCount: count,
      color,
      targetGoal: initialQuota,
      targetQuota: initialQuota,
    });
  }

  return scenes;
};

interface AlbumStore {
  folderPath: string | null;
  photos: LocalPhoto[];
  currentIndex: number;
  isLoading: boolean;
  scanError: string | null;
  failedFolderPath: string | null;
  scenes: SceneChapter[];
  activePresetId: WorkflowScene;
  selectedSceneId: string | null;
  targetGoal: number | null; // 用户自设选片目标 (如 100 张)
  activeFilter: FilterCategory;
  activeTagFilter: string | null;
  isScenesModalOpen: boolean;
  detectedPreset: DetectedPresetResult | null;

  // Actions
  openFolder: (path: string, relocateProjectId?: string) => Promise<void>;
  retryOpenFolder: () => Promise<void>;
  selectIndex: (index: number) => void;
  nextPhoto: () => void;
  prevPhoto: () => void;
  selectPhotoByFilename: (filename: string) => void;
  setActiveFilter: (filter: FilterCategory) => void;
  setActiveTagFilter: (tag: string | null) => void;
  setSelectedSceneId: (id: string | null) => void;
  setActivePresetId: (presetId: WorkflowScene) => void;
  applyScenePreset: (presetId: WorkflowScene, overwriteNames?: boolean) => void;
  splitSceneAtPhoto: (photoIndex: number) => void;
  mergeScenes: (sourceSceneId: string, targetSceneId: string) => void;
  distributeTargetGoal: (totalGoal: number) => void;
  setTargetGoal: (goal: number | null) => void;
  setScenesModalOpen: (open: boolean) => void;
  updateScene: (sceneId: string, patch: Partial<SceneChapter>) => void;
  reclusterScenes: (minGapMinutes?: number, presetId?: WorkflowScene) => void;
  resetFilter: () => void;
  jumpToFirstMatching: () => void;
  jumpToLastMatching: () => void;
}

const VALID_FILTERS = new Set<FilterCategory>([
  'all',
  'unreviewed',
  'selected',
  'maybe',
  'skipped',
  'needs_check',
  'burst',
]);

let pendingViewState: { projectId: string; state: ProjectViewStateInput } | null = null;
let viewStateTimer: ReturnType<typeof setTimeout> | null = null;
let viewStateQueue: Promise<void> = Promise.resolve();

function projectViewState(state: AlbumStore): ProjectViewStateInput {
  return {
    current_photo_id: state.photos[state.currentIndex]?.id,
    target_count: state.targetGoal ?? undefined,
    active_filter: state.activeFilter,
    selected_scene_id: state.selectedSceneId ?? undefined,
    active_preset_id: state.activePresetId,
    scenes_json: JSON.stringify(state.scenes),
  };
}

function drainPendingViewState(): Promise<void> {
  if (viewStateTimer) {
    clearTimeout(viewStateTimer);
    viewStateTimer = null;
  }
  const pending = pendingViewState;
  pendingViewState = null;
  if (!pending) return viewStateQueue;

  const save = async () => {
    try {
      const outcome = await persistProjectViewState(pending.projectId, pending.state);
      if (outcome.backup_warning) {
        useSelectionStore
          .getState()
          .reportPersistenceWarning(`项目状态已保存，但安全备份暂时失败：${outcome.backup_warning}`);
      }
    } catch (error) {
      useSelectionStore
        .getState()
        .reportPersistenceError(
          `浏览位置和筛选状态未能保存：${error instanceof Error ? error.message : String(error)}`,
        );
    }
  };
  viewStateQueue = viewStateQueue.then(save, save);
  return viewStateQueue;
}

function scheduleViewState(state: AlbumStore): void {
  const projectId = useSelectionStore.getState().currentProjectId;
  if (!projectId) return;
  pendingViewState = { projectId, state: projectViewState(state) };
  if (viewStateTimer) clearTimeout(viewStateTimer);
  viewStateTimer = setTimeout(() => void drainPendingViewState(), 350);
}

function restoredScenes(
  scenesJson: string,
  photos: LocalPhoto[],
  presetId: WorkflowScene,
  targetGoal?: number | null,
  minGapMinutes?: number,
): SceneChapter[] {
  const gap = minGapMinutes ?? getStorylinePreset(presetId).defaultGapMinutes ?? 10;
  try {
    const value: unknown = JSON.parse(scenesJson);
    if (!Array.isArray(value) || value.length === 0) {
      return clusterPhotosIntoScenes(photos, gap, presetId, targetGoal);
    }
    const scenes = value.filter((scene): scene is SceneChapter => {
      if (!scene || typeof scene !== 'object') return false;
      const candidate = scene as Partial<SceneChapter>;
      return (
        typeof candidate.id === 'string' &&
        typeof candidate.name === 'string' &&
        Number.isInteger(candidate.startIndex) &&
        Number.isInteger(candidate.endIndex) &&
        candidate.startIndex! >= 0 &&
        candidate.endIndex! >= candidate.startIndex! &&
        candidate.endIndex! < photos.length
      );
    });
    if (scenes.length === 0) return clusterPhotosIntoScenes(photos, gap, presetId, targetGoal);
    return scenes.map((scene) => ({
      ...scene,
      startPath: photos[scene.startIndex].path,
      endPath: photos[scene.endIndex].path,
      photoCount: scene.endIndex - scene.startIndex + 1,
    }));
  } catch {
    return clusterPhotosIntoScenes(photos, gap, presetId, targetGoal);
  }
}

export const useAlbumStore = create<AlbumStore>((set, get) => ({
  folderPath: null,
  photos: [],
  currentIndex: 0,
  isLoading: false,
  scanError: null,
  failedFolderPath: null,
  scenes: [],
  activePresetId: 'general',
  selectedSceneId: null,
  targetGoal: null,
  activeFilter: 'all',
  activeTagFilter: null,
  isScenesModalOpen: false,
  detectedPreset: null,

  openFolder: async (path: string, relocateProjectId?: string) => {
    await drainPendingViewState();
    useInsightStore.getState().cancelBackgroundAnalysis();
    usePreviewStore.getState().clearCache();
    set({
      isLoading: true,
      scanError: null,
      failedFolderPath: null,
      folderPath: path,
      photos: [],
      currentIndex: 0,
      scenes: [],
      activePresetId: 'general',
      selectedSceneId: null,
      targetGoal: null,
      activeFilter: 'all',
      detectedPreset: null,
    });
    try {
      const items: PhotoItem[] = await tauriScanFolder(path);

      // 数据库将本次扫描的临时路径 ID 关联到跨重命名稳定的 photo_key。
      const project = relocateProjectId
        ? await relocateProjectState(relocateProjectId, path, items)
        : await useSelectionStore.getState().openProject(path, items);
      const mappedItems = items.map((item) => ({
        ...item,
        id: project.photo_id_remaps[item.id] || item.id,
      }));

      // 转换为面向普通用户的 LocalPhoto 实体与 PhotoInsight 实体
      const localPhotos: LocalPhoto[] = withUpdatedBurstGroups(mappedItems.map((it) => ({
        id: it.id,
        path: it.path,
        filename: it.filename,
        fileSize: it.file_size,
        format: it.is_raw ? 'raw' : it.filename.toLowerCase().endsWith('.png') ? 'png' : 'jpeg',
        isRaw: it.is_raw,
        previewWidth: it.thumb_width,
        previewHeight: it.thumb_height,
        capturedAt: it.exif?.date_time_original,
        burstGroupId: it.burst_group_id,
        faces: [],
        exif: it.exif,
      })));

      const photoIds = localPhotos.map((p) => p.id);
      useSelectionStore.getState().initSelections(project, photoIds);

      // 初始化与用户选择相互独立的本地分析提示
      useInsightStore.getState().initInsightsFromItems(
        mappedItems.map((item, index) => ({
          ...item,
          burst_group_id: localPhotos[index].burstGroupId,
        })),
      );

      // 自动推断最贴切的故事线模板
      const detected = detectOptimalPreset(path, localPhotos);
      const isNewScenes =
        !project.scenes_json ||
        project.scenes_json.trim() === '' ||
        project.scenes_json === '[]';
      const shouldAutoAdopt =
        isNewScenes &&
        (!project.active_preset_id || project.active_preset_id === 'general') &&
        detected.confidence >= 0.55 &&
        detected.presetId !== 'general';

      const activePresetId = shouldAutoAdopt
        ? detected.presetId
        : getStorylinePreset(project.active_preset_id).id;
      const activePreset = getStorylinePreset(activePresetId);

      const scenes = restoredScenes(
        project.scenes_json,
        localPhotos,
        activePresetId,
        project.target_count,
        activePreset.defaultGapMinutes,
      );
      const restoredIndex = project.current_photo_id
        ? localPhotos.findIndex((photo) => photo.id === project.current_photo_id)
        : -1;
      const currentIndex = restoredIndex >= 0 ? restoredIndex : 0;
      const activeFilter = VALID_FILTERS.has(project.active_filter as FilterCategory)
        ? (project.active_filter as FilterCategory)
        : 'all';
      const selectedSceneId = scenes.some((scene) => scene.id === project.selected_scene_id)
        ? project.selected_scene_id || null
        : null;

      set({
        photos: localPhotos,
        currentIndex,
        scenes,
        activeFilter,
        selectedSceneId,
        activePresetId,
        detectedPreset: detected,
        targetGoal: project.target_count ?? null,
        isLoading: false,
        scanError: null,
        failedFolderPath: null,
      });
      scheduleViewState(get());

      // 恢复上次位置；首次打开时从首张开始。
      if (localPhotos.length > 0) {
        const currentPhoto = localPhotos[currentIndex];
        useSelectionStore.getState().markAsViewed(currentPhoto.id);
        usePreviewStore.getState().loadPreviewForCurrent(currentPhoto, localPhotos);
        useInsightStore.getState().startBackgroundAnalysis(localPhotos);
      }
    } catch (e) {
      console.error('Failed to scan folder:', e);
      useInsightStore.getState().cancelBackgroundAnalysis();
      useSelectionStore
        .getState()
        .reportPersistenceError(e instanceof Error ? e.message : String(e));
      set({
        isLoading: false,
        folderPath: null,
        photos: [],
        scenes: [],
        failedFolderPath: path,
        scanError: `无法打开照片文件夹：${e instanceof Error ? e.message : String(e)}`,
      });
    }
  },

  retryOpenFolder: async () => {
    const failedFolderPath = get().failedFolderPath;
    if (failedFolderPath) await get().openFolder(failedFolderPath);
  },

  selectIndex: (index: number) => {
    const { photos, currentIndex } = get();
    if (index < 0 || index >= photos.length || index === currentIndex) return;

    set({ currentIndex: index });
    scheduleViewState(get());
    const target = photos[index];
    if (target) {
      useSelectionStore.getState().markAsViewed(target.id);
      usePreviewStore.getState().loadPreviewForCurrent(target, photos, index);
    }
  },

  nextPhoto: () => {
    const state = get();
    const nextIndex = findNextMatchingIndex(state);
    if (nextIndex !== undefined) state.selectIndex(nextIndex);
  },

  prevPhoto: () => {
    const state = get();
    const previousIndex = findPrevMatchingIndex(state);
    if (previousIndex !== undefined) state.selectIndex(previousIndex);
  },

  selectPhotoByFilename: (filename: string) => {
    const { photos, selectIndex } = get();
    const idx = photos.findIndex((p) => p.filename === filename);
    if (idx >= 0) {
      selectIndex(idx);
    }
  },

  setActiveFilter: (filter: FilterCategory) => {
    set({ activeFilter: filter });
    scheduleViewState(get());
    const state = get();
    const matches = matchingPhotoIndexes(state);
    if (!matches.includes(state.currentIndex) && matches[0] !== undefined) {
      state.selectIndex(matches[0]);
    }
  },

  setActiveTagFilter: (tag: string | null) => {
    set({ activeTagFilter: tag });
    const state = get();
    const matches = matchingPhotoIndexes(state);
    if (!matches.includes(state.currentIndex) && matches[0] !== undefined) {
      state.selectIndex(matches[0]);
    }
  },

  setSelectedSceneId: (id: string | null) => {
    set({ selectedSceneId: id });
    scheduleViewState(get());
    const state = get();
    const matches = matchingPhotoIndexes(state);
    if (!matches.includes(state.currentIndex) && matches[0] !== undefined) {
      state.selectIndex(matches[0]);
    }
  },

  setActivePresetId: (presetId: WorkflowScene) => {
    set({ activePresetId: presetId });
    scheduleViewState(get());
  },

  applyScenePreset: (presetId: WorkflowScene, overwriteNames = true) => {
    const { scenes, photos, targetGoal } = get();
    const preset = getStorylinePreset(presetId);

    if (scenes.length === 0) {
      const newScenes = clusterPhotosIntoScenes(
        photos,
        preset.defaultGapMinutes,
        presetId,
        targetGoal,
      );
      set({ activePresetId: presetId, scenes: newScenes });
      scheduleViewState(get());
      return;
    }

    const quotas =
      targetGoal && targetGoal > 0
        ? distributeTargetGoalAcrossChapters(
            scenes.length,
            targetGoal,
            scenes.map((_, index) => preset.chapters[index]?.weight ?? 1),
          )
        : [];
    const updatedScenes = scenes.map((scene, idx) => {
      const presetChapter = preset.chapters[idx];
      const newName = overwriteNames && presetChapter ? presetChapter.name : scene.name;
      return {
        ...scene,
        name: newName,
        targetGoal: quotas[idx],
        targetQuota: quotas[idx],
      };
    });

    set({ activePresetId: presetId, scenes: updatedScenes });
    scheduleViewState(get());
  },

  splitSceneAtPhoto: (photoIndex: number) => {
    const { scenes, photos, selectedSceneId } = get();
    if (photoIndex < 0 || photoIndex >= photos.length) return;

    const sceneIdx = scenes.findIndex(
      (s) => s.startIndex <= photoIndex && photoIndex <= s.endIndex,
    );
    if (sceneIdx === -1) return;

    const targetScene = scenes[sceneIdx];
    if (photoIndex === targetScene.startIndex) return;

    const part1Count = photoIndex - targetScene.startIndex;
    const part2Count = targetScene.endIndex - photoIndex + 1;

    const sceneGoal = targetScene.targetGoal ?? targetScene.targetQuota;
    const firstGoal =
      sceneGoal === undefined
        ? undefined
        : Math.round((sceneGoal * part1Count) / (part1Count + part2Count));
    const secondGoal = sceneGoal === undefined ? undefined : sceneGoal - (firstGoal || 0);

    const scenePart1: SceneChapter = {
      ...targetScene,
      id: `scene-${Date.now()}-a`,
      name: `${targetScene.name} (前段)`,
      endIndex: photoIndex - 1,
      endPath: photos[photoIndex - 1].path,
      photoCount: part1Count,
      targetGoal: firstGoal,
      targetQuota: firstGoal,
    };

    const scenePart2: SceneChapter = {
      id: `scene-${Date.now()}-b`,
      name: `${targetScene.name} (后段)`,
      startIndex: photoIndex,
      endIndex: targetScene.endIndex,
      startPath: photos[photoIndex].path,
      endPath: targetScene.endPath,
      photoCount: part2Count,
      color: SCENE_COLORS[(sceneIdx + 1) % SCENE_COLORS.length],
      targetGoal: secondGoal,
      targetQuota: secondGoal,
    };

    const newScenes = [
      ...scenes.slice(0, sceneIdx),
      scenePart1,
      scenePart2,
      ...scenes.slice(sceneIdx + 1),
    ];

    set({
      scenes: newScenes,
      selectedSceneId: selectedSceneId === targetScene.id ? scenePart2.id : selectedSceneId,
    });
    scheduleViewState(get());
  },

  mergeScenes: (sourceSceneId: string, targetSceneId: string) => {
    const { scenes, photos, selectedSceneId } = get();
    const idx1 = scenes.findIndex((s) => s.id === sourceSceneId);
    const idx2 = scenes.findIndex((s) => s.id === targetSceneId);
    if (idx1 === -1 || idx2 === -1 || idx1 === idx2) return;

    const s1 = scenes[idx1];
    const s2 = scenes[idx2];

    const newStartIndex = Math.min(s1.startIndex, s2.startIndex);
    const newEndIndex = Math.max(s1.endIndex, s2.endIndex);
    const mergedGoal = (s1.targetGoal || 0) + (s2.targetGoal || 0) || undefined;

    const mergedScene: SceneChapter = {
      id: `scene-merged-${Date.now()}`,
      name: `${s1.name} & ${s2.name}`,
      startIndex: newStartIndex,
      endIndex: newEndIndex,
      startPath: photos[newStartIndex]?.path || s1.startPath,
      endPath: photos[newEndIndex]?.path || s2.endPath,
      photoCount: newEndIndex - newStartIndex + 1,
      color: s1.color,
      targetGoal: mergedGoal,
      targetQuota: mergedGoal,
    };

    const remainingScenes = scenes.filter((s) => s.id !== sourceSceneId && s.id !== targetSceneId);
    const newScenes = [...remainingScenes, mergedScene].sort(
      (a, b) => a.startIndex - b.startIndex,
    );

    const nextSelectedId =
      selectedSceneId === sourceSceneId || selectedSceneId === targetSceneId
        ? mergedScene.id
        : selectedSceneId;

    set({ scenes: newScenes, selectedSceneId: nextSelectedId });
    scheduleViewState(get());
  },

  distributeTargetGoal: (totalGoal: number) => {
    const { scenes, activePresetId } = get();
    if (scenes.length === 0 || totalGoal <= 0) {
      set({ targetGoal: totalGoal > 0 ? totalGoal : null });
      scheduleViewState(get());
      return;
    }

    const preset = getStorylinePreset(activePresetId);
    const weights = scenes.map((scene, index) => preset.chapters[index]?.weight ?? scene.photoCount);
    const distributed = distributeTargetGoalAcrossChapters(scenes.length, totalGoal, weights);

    const updatedScenes = scenes.map((scene, i) => ({
      ...scene,
      targetGoal: distributed[i],
      targetQuota: distributed[i],
    }));

    set({ targetGoal: totalGoal, scenes: updatedScenes });
    scheduleViewState(get());
  },

  setTargetGoal: (goal: number | null) => {
    set((state) => ({
      targetGoal: goal,
      scenes:
        goal === null
          ? state.scenes.map((scene) => ({
              ...scene,
              targetGoal: undefined,
              targetQuota: undefined,
            }))
          : state.scenes,
    }));
    scheduleViewState(get());
  },

  setScenesModalOpen: (open: boolean) => {
    set({ isScenesModalOpen: open });
  },

  updateScene: (sceneId: string, patch: Partial<SceneChapter>) => {
    const { scenes } = get();
    set({
      scenes: scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)),
    });
    scheduleViewState(get());
  },

  reclusterScenes: (minGapMinutes = 10, presetId?: WorkflowScene) => {
    const { photos, activePresetId, targetGoal } = get();
    const pid = presetId || activePresetId;
    const newScenes = clusterPhotosIntoScenes(photos, minGapMinutes, pid, targetGoal);
    set({ scenes: newScenes, activePresetId: pid });
    scheduleViewState(get());
  },

  resetFilter: () => {
    set({ activeFilter: 'all', selectedSceneId: null, activeTagFilter: null });
    scheduleViewState(get());
  },

  jumpToFirstMatching: () => {
    const state = get();
    const firstIndex = findFirstMatchingIndex(state);
    if (firstIndex !== undefined) state.selectIndex(firstIndex);
  },

  jumpToLastMatching: () => {
    const state = get();
    const lastIndex = findLastMatchingIndex(state);
    if (lastIndex !== undefined) state.selectIndex(lastIndex);
  },
}));
