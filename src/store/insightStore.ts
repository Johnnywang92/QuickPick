import { create } from 'zustand';
import { FaceInfo, LocalPhoto, PhotoInsight } from '../types/photo';
import {
  analyzePhotoDetails,
  PhotoAnalysisResult,
  PhotoItem,
  detectPhotoFaces,
} from '../services/tauriBridge';
import { useAlbumStore, withUpdatedBurstGroups } from './albumStore';
import { findBestPicksByBurstGroup } from '../utils/phashUtils';

export type FaceReviewPreset = 'group' | 'candid' | 'portrait';

const ANALYSIS_CONCURRENCY = 3;
let analysisGeneration = 0;

function insightFromAnalysis(
  photoId: string,
  result: PhotoAnalysisResult,
  similarityGroupId?: string,
): PhotoInsight {
  const reasons: string[] = [];
  let possibleBlur: number | undefined;
  for (const tag of result.defect_tags) {
    if (tag.id.includes('blink') || tag.id.includes('eye')) {
      reasons.push('建议检查眼睛');
    }
    if (tag.id.includes('blur') || tag.id.includes('focus')) {
      possibleBlur = Math.max(possibleBlur || 0, Math.round(tag.confidence * 100));
      reasons.push('可能模糊');
    }
  }
  const possibleClosedEyes = result.faces.length
    ? Math.min(...result.faces.map((face) => face.eye_open_score))
    : undefined;
  if (possibleClosedEyes !== undefined && possibleClosedEyes < 0.35) {
    reasons.push('建议检查眼睛');
  }
  if (similarityGroupId) reasons.push('与其他照片相似');
  if (result.analysis_status === 'failed') reasons.push('无法分析');
  if (reasons.length === 0 && result.analysis_status === 'no_issues') {
    reasons.push('未见明显问题');
  }
  const needsCheck = reasons.some(
    (reason) => reason.includes('眼睛') || reason.includes('模糊'),
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

function applyAnalysisResult(photoId: string, result: PhotoAnalysisResult): void {
  useInsightStore.setState((state) => ({
    insights: {
      ...state.insights,
      [photoId]: insightFromAnalysis(photoId, result, state.insights[photoId]?.similarityGroupId),
    },
  }));
  useAlbumStore.setState((state) => ({
    photos: state.photos.map((photo) =>
      photo.id === photoId
        ? {
            ...photo,
            exif: result.exif || undefined,
            capturedAt: result.exif?.date_time_original || undefined,
            faces: result.faces,
            previewWidth: result.preview_width || undefined,
            previewHeight: result.preview_height || undefined,
            phash: result.phash || undefined,
            sharpness: result.sharpness ?? undefined,
          }
        : photo,
    ),
  }));
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
  getInsight: (photoId: string) => PhotoInsight | null;
  toggleFaceLoupe: () => void;
  setFaceLoupeOpen: (open: boolean) => void;
  focusFace: (face: FaceInfo | null) => void;
  setFaceReviewPreset: (preset: FaceReviewPreset) => void;
  togglePinFace: (photoId: string, faceId: string) => void;
  startBackgroundAnalysis: (photos: LocalPhoto[]) => void;
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

  startBackgroundAnalysis: (photos) => {
    const generation = ++analysisGeneration;
    const seen = new Set<string>();
    const jobs = photos
      .map((photo, index) => ({ photo, index }))
      .filter(({ photo }) => {
        if (seen.has(photo.id)) return false;
        seen.add(photo.id);
        return true;
      });
    set({
      isAnalyzing: jobs.length > 0,
      analysisTotal: jobs.length,
      analysisCompleted: 0,
      analysisFailed: 0,
    });
    if (jobs.length === 0) return;

    let cursor = 0;
    const worker = async () => {
      while (generation === analysisGeneration) {
        const jobIndex = cursor;
        cursor += 1;
        const job = jobs[jobIndex];
        if (!job) return;
        try {
          const result = await analyzePhotoDetails(job.photo.path, job.index, job.photo.id);
          if (generation !== analysisGeneration) return;
          applyAnalysisResult(job.photo.id, result);
          set((state) => ({
            analysisCompleted: state.analysisCompleted + 1,
            analysisFailed:
              state.analysisFailed + (result.analysis_status === 'failed' ? 1 : 0),
          }));
        } catch (error) {
          if (generation !== analysisGeneration) return;
          console.warn('Background analysis failed for photo:', error);
          applyAnalysisResult(job.photo.id, {
            analysis_status: 'failed',
            defect_tags: [],
            faces: [],
          });
          set((state) => ({
            analysisCompleted: state.analysisCompleted + 1,
            analysisFailed: state.analysisFailed + 1,
          }));
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(ANALYSIS_CONCURRENCY, jobs.length) },
      () => worker(),
    );
    void Promise.all(workers).then(() => finalizeBurstGroups(generation));
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
