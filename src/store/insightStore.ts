import { create } from 'zustand';
import { FaceInfo, LocalPhoto, PhotoInsight } from '../types/photo';
import {
  analyzePhotoDetails,
  PhotoAnalysisResult,
  PhotoItem,
  detectPhotoFaces,
} from '../services/tauriBridge';
import { useAlbumStore, withUpdatedBurstGroups } from './albumStore';
import { usePreviewStore } from './previewStore';
import { findBestPicksByBurstGroup } from '../utils/phashUtils';

export type FaceReviewPreset = 'group' | 'candid' | 'portrait';

const ANALYSIS_CONCURRENCY = 2;
let analysisGeneration = 0;
let lastUserInteractionTime = 0;

/** 标记用户正在交互（切图/滚轮/滑动胶片栏），后台图片质量分析将主动挂起让路 */
export function notifyUserActive(): void {
  lastUserInteractionTime = Date.now();
}

/** 检查当前是否应让路给用户交互与主视口大图预览 */
const waitForInteractiveIdle = async (generation: number): Promise<void> => {
  while (generation === analysisGeneration) {
    const previewLoading = usePreviewStore.getState().previewStatus === 'loading';
    const isInteracting = Date.now() - lastUserInteractionTime < 900;
    if (!previewLoading && !isInteracting) {
      break;
    }
    // 当视口正在载入预览或用户正在滑动翻页时，深度分析让出 100% 网络带宽与 CPU 周期
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
};

function insightFromAnalysis(
  photoId: string,
  result: PhotoAnalysisResult,
  similarityGroupId?: string,
): PhotoInsight {
  const reasons: string[] = [];
  let possibleBlur: number | undefined;
  const hasDetectedFaces = Array.isArray(result.faces) && result.faces.length > 0;
  for (const tag of result.defect_tags) {
    if ((tag.id.includes('blink') || tag.id.includes('eye')) && hasDetectedFaces) {
      reasons.push('可能闭眼');
    }
    if (tag.id === 'possible_severe_blur') {
      possibleBlur = Math.max(possibleBlur || 0, Math.round(tag.confidence * 100));
      reasons.push('可能模糊');
    } else if (tag.id === 'review_borderline_sharpness') {
      possibleBlur = Math.max(possibleBlur || 0, 42);
      reasons.push('临界合焦');
    } else if (tag.id === 'possible_slight_blur') {
      possibleBlur = Math.max(possibleBlur || 0, 25);
      reasons.push('焦点微软');
    } else if (tag.id.includes('blur') || tag.id.includes('focus')) {
      possibleBlur = Math.max(possibleBlur || 0, Math.round(tag.confidence * 100));
      reasons.push('可能模糊');
    }
  }
  const possibleClosedEyes = hasDetectedFaces
    ? Math.min(...result.faces.map((face) => face.eye_open_score))
    : undefined;
  if (possibleClosedEyes !== undefined && possibleClosedEyes < 0.40) {
    reasons.push('可能闭眼');
  }
  if (similarityGroupId) reasons.push('与其他照片相似');
  if (result.analysis_status === 'failed') reasons.push('无法分析');
  if (reasons.length === 0 && result.analysis_status === 'no_issues') {
    reasons.push('未见明显问题');
  }
  const needsCheck = reasons.some(
    (reason) =>
      reason.includes('闭眼') ||
      reason.includes('眼睛') ||
      reason.includes('模糊') ||
      reason.includes('临界合焦'),
  );
  return {
    photoId,
    analysisStatus: needsCheck ? 'needs_check' : result.analysis_status,
    possibleBlur,
    possibleClosedEyes,
    similarityGroupId,
    reasons: Array.from(new Set(reasons)),
  };
}

function applyAnalysisBatch(
  items: { photoId: string; result: PhotoAnalysisResult }[],
): void {
  if (items.length === 0) return;
  const resultMap = new Map(items.map((i) => [i.photoId, i.result]));

  useInsightStore.setState((state) => {
    const nextInsights = { ...state.insights };
    for (const { photoId, result } of items) {
      nextInsights[photoId] = insightFromAnalysis(
        photoId,
        result,
        state.insights[photoId]?.similarityGroupId,
      );
    }
    return { insights: nextInsights };
  });

  useAlbumStore.setState((state) => ({
    photos: state.photos.map((photo) => {
      const res = resultMap.get(photo.id);
      if (!res) return photo;
      return {
        ...photo,
        exif: res.exif || undefined,
        capturedAt: res.exif?.date_time_original || undefined,
        faces: res.faces,
        previewWidth: res.preview_width || undefined,
        previewHeight: res.preview_height || undefined,
        phash: res.phash || undefined,
        sharpness: res.sharpness ?? undefined,
      };
    }),
  }));
}

function applyAnalysisResult(photoId: string, result: PhotoAnalysisResult): void {
  applyAnalysisBatch([{ photoId, result }]);
}

function refreshBurstGroups(): void {
  const groupedPhotos = withUpdatedBurstGroups(useAlbumStore.getState().photos);
  useAlbumStore.setState({ photos: groupedPhotos });

  const bestPicks = findBestPicksByBurstGroup(groupedPhotos);

  useInsightStore.setState((state) => {
    const insights = { ...state.insights };
    for (const photo of groupedPhotos) {
      const existing = insights[photo.id];
      if (!existing) continue;
      const reasons = existing.reasons.filter(
        (reason) => reason !== '与其他照片相似' && reason !== '组内推荐最佳',
      );
      const isBest = !!photo.burstGroupId && bestPicks.get(photo.burstGroupId) === photo.id;
      if (photo.burstGroupId) {
        reasons.push('与其他照片相似');
        if (isBest) {
          reasons.push('组内推荐最佳');
        }
      }
      insights[photo.id] = {
        ...existing,
        similarityGroupId: photo.burstGroupId,
        isBestPick: isBest,
        reasons,
      };
    }
    return { insights };
  });
}

function finalizeBurstGroups(generation: number): void {
  if (generation !== analysisGeneration) return;
  refreshBurstGroups();
  useInsightStore.setState({ isAnalyzing: false });
}

interface InsightStore {
  insights: Record<string, PhotoInsight>;
  isFaceLoupeOpen: boolean;
  focusedFace: FaceInfo | null;
  faceReviewPreset: FaceReviewPreset;
  isAnalyzing: boolean;
  analysisTotal: number;
  analysisCompleted: number;
  analysisFailed: number;

  // Actions
  initInsightsFromItems: (items: PhotoItem[]) => void;
  initInsightsWithCachedAnalyses: (
    items: PhotoItem[],
    cachedAnalyses: Record<string, PhotoAnalysisResult>,
  ) => void;
  getInsight: (photoId: string) => PhotoInsight | null;
  toggleFaceLoupe: () => void;
  setFaceLoupeOpen: (open: boolean) => void;
  focusFace: (face: FaceInfo | null) => void;
  setFaceReviewPreset: (preset: FaceReviewPreset) => void;
  togglePinFace: (photoId: string, faceId: string) => void;
  setFaceLabel: (photoId: string, faceId: string, label: string) => void;
  startBackgroundAnalysis: (photos: LocalPhoto[], onlyUnanalyzed?: boolean) => void;
  cancelBackgroundAnalysis: () => void;
  analyzeSinglePhoto: (photoId: string, photoPath: string, index: number) => Promise<void>;
  detectFacesForPhoto: (photoId: string, photoPath: string) => Promise<void>;
}

export const useInsightStore = create<InsightStore>((set, get) => ({
  insights: {},
  isFaceLoupeOpen: false,
  focusedFace: null,
  faceReviewPreset: 'portrait',
  isAnalyzing: false,
  analysisTotal: 0,
  analysisCompleted: 0,
  analysisFailed: 0,

  initInsightsFromItems: (items: PhotoItem[]) => {
    const map: Record<string, PhotoInsight> = {};

    items.forEach((it) => {
      map[it.id] = {
        photoId: it.id,
        analysisStatus: 'pending',
        similarityGroupId: it.burst_group_id,
        reasons: it.burst_group_id ? ['与其他照片相似'] : [],
      };
    });

    set({ insights: map });
  },

  initInsightsWithCachedAnalyses: (
    items: PhotoItem[],
    cachedAnalyses: Record<string, PhotoAnalysisResult>,
  ) => {
    const map: Record<string, PhotoInsight> = {};

    items.forEach((it) => {
      const cached = cachedAnalyses[it.id];
      if (cached) {
        map[it.id] = insightFromAnalysis(it.id, cached, it.burst_group_id);
      } else {
        map[it.id] = {
          photoId: it.id,
          analysisStatus: 'pending',
          similarityGroupId: it.burst_group_id,
          reasons: it.burst_group_id ? ['与其他照片相似'] : [],
        };
      }
    });

    set({ insights: map });
    refreshBurstGroups();
  },

  getInsight: (photoId: string) => {
    return get().insights[photoId] || null;
  },

  toggleFaceLoupe: () => {
    set((state) => ({ isFaceLoupeOpen: !state.isFaceLoupeOpen }));
  },

  setFaceLoupeOpen: (open: boolean) => {
    set({ isFaceLoupeOpen: open });
  },

  focusFace: (face: FaceInfo | null) => {
    set({ focusedFace: face });
  },

  setFaceReviewPreset: (preset) => {
    set({ faceReviewPreset: preset });
  },

  togglePinFace: (photoId, faceId) => {
    useAlbumStore.setState((state) => ({
      photos: state.photos.map((photo) =>
        photo.id !== photoId
          ? photo
          : {
              ...photo,
              faces: photo.faces?.map((face) =>
                face.id === faceId ? { ...face, is_pinned: !face.is_pinned } : face,
              ),
            },
      ),
    }));

    const focusedFace = get().focusedFace;
    if (focusedFace?.id === faceId) {
      set({ focusedFace: { ...focusedFace, is_pinned: !focusedFace.is_pinned } });
    }
  },

  setFaceLabel: (photoId, faceId, label) => {
    const trimmed = label.trim();
    useAlbumStore.setState((state) => ({
      photos: state.photos.map((photo) =>
        photo.id !== photoId
          ? photo
          : {
              ...photo,
              faces: photo.faces?.map((face) =>
                face.id === faceId ? { ...face, label: trimmed || undefined } : face,
              ),
            },
      ),
    }));

    const focusedFace = get().focusedFace;
    if (focusedFace?.id === faceId) {
      set({ focusedFace: { ...focusedFace, label: trimmed || undefined } });
    }
  },

  startBackgroundAnalysis: (photos, onlyUnanalyzed = false) => {
    const generation = ++analysisGeneration;
    const seen = new Set<string>();
    const activeIndex = useAlbumStore.getState().currentIndex || 0;
    const currentInsights = get().insights;
    const jobs = photos
      .map((photo, index) => ({ photo, index }))
      .filter(({ photo }) => {
        if (seen.has(photo.id)) return false;
        seen.add(photo.id);
        if (onlyUnanalyzed) {
          const status = currentInsights[photo.id]?.analysisStatus;
          if (status && status !== 'pending') return false;
        }
        return true;
      })
      .sort((a, b) => Math.abs(a.index - activeIndex) - Math.abs(b.index - activeIndex));
    set({
      isAnalyzing: jobs.length > 0,
      analysisTotal: jobs.length,
      analysisCompleted: 0,
      analysisFailed: 0,
    });
    if (jobs.length === 0) return;

    let cursor = 0;
    let sinceLastBurstRefresh = 0;
    let pendingBatch: { photoId: string; result: PhotoAnalysisResult; isFailed: boolean }[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushBatch = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (pendingBatch.length === 0 || generation !== analysisGeneration) return;
      const batch = pendingBatch;
      pendingBatch = [];

      applyAnalysisBatch(batch);
      sinceLastBurstRefresh += batch.length;
      if (sinceLastBurstRefresh >= 64) {
        sinceLastBurstRefresh = 0;
        refreshBurstGroups();
      }
      const failedCount = batch.filter((b) => b.isFailed).length;
      set((state) => ({
        analysisCompleted: state.analysisCompleted + batch.length,
        analysisFailed: state.analysisFailed + failedCount,
      }));
    };

    const scheduleFlush = () => {
      if (pendingBatch.length >= 24) {
        flushBatch();
      } else if (!flushTimer) {
        flushTimer = setTimeout(flushBatch, 350);
      }
    };

    const worker = async () => {
      while (generation === analysisGeneration) {
        // 1. 用户交互与预览优先：若用户正在切图或大图正在载入，分析彻底挂起避让
        await waitForInteractiveIdle(generation);
        if (generation !== analysisGeneration) return;

        const jobIndex = cursor;
        cursor += 1;
        const job = jobs[jobIndex];
        if (!job) return;

        // 再次检查交互状态
        await waitForInteractiveIdle(generation);
        if (generation !== analysisGeneration) return;

        try {
          const result = await analyzePhotoDetails(job.photo.path, job.index, job.photo.id);
          if (generation !== analysisGeneration) return;
          pendingBatch.push({
            photoId: job.photo.id,
            result,
            isFailed: result.analysis_status === 'failed',
          });
          scheduleFlush();
        } catch (error) {
          if (generation !== analysisGeneration) return;
          console.warn('Background analysis failed for photo:', error);
          pendingBatch.push({
            photoId: job.photo.id,
            result: {
              analysis_status: 'failed',
              defect_tags: [],
              faces: [],
            },
            isFailed: true,
          });
          scheduleFlush();
        }

        // 2. 两次分析之间微休止 50ms，避免并发暴击 SMB 网络盘，保持系统与视口零抖动
        await new Promise((r) => setTimeout(r, 50));
      }
    };

    // 延迟 1200ms 启动后台分析，确保刚进入工作台或切换相册时，首张大图与首屏缩略图享有 100% 网络带宽与线程独占
    setTimeout(() => {
      if (generation !== analysisGeneration) return;
      const workers = Array.from(
        { length: Math.min(ANALYSIS_CONCURRENCY, jobs.length) },
        () => worker(),
      );
      void Promise.all(workers).then(() => {
        flushBatch();
        finalizeBurstGroups(generation);
      });
    }, 1200);
  },

  cancelBackgroundAnalysis: () => {
    analysisGeneration += 1;
    set({ isAnalyzing: false, analysisTotal: 0, analysisCompleted: 0, analysisFailed: 0 });
  },

  analyzeSinglePhoto: async (photoId: string, photoPath: string, index: number) => {
    set({ isAnalyzing: true });
    try {
      const result = await analyzePhotoDetails(photoPath, index, photoId);
      applyAnalysisResult(photoId, result);
    } catch (e) {
      console.warn('Analysis failed for photo:', e);
      applyAnalysisResult(photoId, {
        analysis_status: 'failed',
        defect_tags: [],
        faces: [],
      });
    } finally {
      refreshBurstGroups();
      set({ isAnalyzing: false });
    }
  },

  detectFacesForPhoto: async (photoId: string, photoPath: string) => {
    try {
      const faces = await detectFacesForPhotoApi(photoPath);
      if (faces && faces.length > 0) {
        // 更新 photo 对象的人脸信息
        useAlbumStore.setState((state) => ({
          photos: state.photos.map((p) => (p.id === photoId ? { ...p, faces } : p)),
        }));

        // 更新 insight 闭眼判断
        const minEye = Math.min(...faces.map((f) => f.eye_open_score));
        const existing = get().insights[photoId] || {
          photoId,
          analysisStatus: 'pending' as const,
          reasons: [],
        };
        const reasons = [...existing.reasons];
        if (minEye < 0.35 && !reasons.includes('建议检查眼睛')) {
          reasons.push('建议检查眼睛');
        }

        set((state) => ({
          insights: {
            ...state.insights,
            [photoId]: {
              ...existing,
              possibleClosedEyes: minEye,
              reasons,
            },
          },
        }));
      }
    } catch (e) {
      console.warn('Face detection failed:', e);
    }
  },
}));

async function detectFacesForPhotoApi(path: string): Promise<FaceInfo[]> {
  try {
    return await detectPhotoFaces(path);
  } catch {
    return [];
  }
}
