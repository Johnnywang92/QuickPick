import { create } from 'zustand';
import { useAlbumStore } from './albumStore';
import { useSelectionStore } from './selectionStore';
import { usePreviewStore } from './previewStore';

interface CompareStore {
  isCompareMode: boolean;
  compareScope: 'all' | 'burst';
  compareTargetIndex: number | null;
  comparePreviewUrl: string | null;
  comparePreviewStatus: 'idle' | 'loading' | 'loaded' | 'error';
  comparePreviewError: string | null;
  syncZoomAndPan: boolean;

  // Actions
  toggleCompareMode: () => void;
  enterCompareMode: (candidateIndex?: number) => void;
  exitCompareMode: () => void;
  setCompareScope: (scope: 'all' | 'burst') => void;
  setCompareTargetIndex: (index: number) => void;
  retryComparePreview: () => Promise<void>;
  nextCompareCandidate: () => void;
  prevCompareCandidate: () => void;
  swapComparePhotos: () => void;
  toggleSyncZoomAndPan: () => void;

  // 面向消费者的对比裁决核心动作
  chooseLeft: () => void;
  chooseRight: () => void;
  chooseBoth: () => void;
  deferBoth: () => void;
  nextSimilarGroup: () => void;
}

export const useCompareStore = create<CompareStore>((set, get) => ({
  isCompareMode: false,
  compareScope: 'burst',
  compareTargetIndex: null,
  comparePreviewUrl: null,
  comparePreviewStatus: 'idle',
  comparePreviewError: null,
  syncZoomAndPan: true,

  toggleCompareMode: () => {
    if (get().isCompareMode) {
      get().exitCompareMode();
    } else {
      get().enterCompareMode();
    }
  },

  enterCompareMode: (candidateIndex?: number) => {
    const { photos, currentIndex } = useAlbumStore.getState();
    if (photos.length < 2) return;

    let targetIdx: number | null = candidateIndex ?? null;

    if (targetIdx === null) {
      const current = photos[currentIndex];
      // 优先从同一连拍组/相似组中找下一张
      if (current?.burstGroupId) {
        const burstMatch = photos.findIndex(
          (p, i) => i !== currentIndex && p.burstGroupId === current.burstGroupId,
        );
        if (burstMatch >= 0) {
          targetIdx = burstMatch;
        }
      }

      // 如果未找到同组，默认取相邻下一张
      if (targetIdx === null) {
        targetIdx = currentIndex + 1 < photos.length ? currentIndex + 1 : currentIndex - 1;
      }
    }

    set({
      isCompareMode: true,
      compareTargetIndex: targetIdx,
    });

    if (targetIdx !== null && photos[targetIdx]) {
      const rightPhoto = photos[targetIdx];
      useSelectionStore.getState().markAsViewed(rightPhoto.id);
      get().setCompareTargetIndex(targetIdx);
    }
  },

  exitCompareMode: () => {
    set({
      isCompareMode: false,
      compareTargetIndex: null,
      comparePreviewUrl: null,
      comparePreviewStatus: 'idle',
    });
  },

  setCompareScope: (scope: 'all' | 'burst') => {
    set({ compareScope: scope });
  },

  setCompareTargetIndex: async (index: number) => {
    const { photos } = useAlbumStore.getState();
    if (index < 0 || index >= photos.length) return;

    const targetPhoto = photos[index];
    set({
      compareTargetIndex: index,
      comparePreviewStatus: 'loading',
      comparePreviewError: null,
    });

    // 尝试先从 previewCache 拿
    const cached = usePreviewStore.getState().previewCache.get(targetPhoto.path);
    if (cached) {
      set({
        comparePreviewUrl: cached,
        comparePreviewStatus: 'loaded',
        comparePreviewError: null,
      });
      return;
    }

    try {
      const url = await usePreviewStore.getState().getPreview(targetPhoto);
      if (get().compareTargetIndex === index) {
        set({
          comparePreviewUrl: url,
          comparePreviewStatus: 'loaded',
          comparePreviewError: null,
        });
      }
    } catch (e: any) {
      if (get().compareTargetIndex === index) {
        set({
          comparePreviewStatus: 'error',
          comparePreviewError: e?.toString() || '加载对比预览失败',
        });
      }
    }
  },

  retryComparePreview: async () => {
    const { compareTargetIndex } = get();
    if (compareTargetIndex !== null) {
      await get().setCompareTargetIndex(compareTargetIndex);
    }
  },

  nextCompareCandidate: () => {
    const { compareTargetIndex, compareScope } = get();
    const { photos, currentIndex } = useAlbumStore.getState();
    if (compareTargetIndex === null || photos.length === 0) return;

    const leftPhoto = photos[currentIndex];

    if (compareScope === 'burst' && leftPhoto?.burstGroupId) {
      const burstList = photos
        .map((p, i) => ({ photo: p, index: i }))
        .filter((item) => item.photo.burstGroupId === leftPhoto.burstGroupId && item.index !== currentIndex);

      if (burstList.length > 0) {
        const currPos = burstList.findIndex((item) => item.index === compareTargetIndex);
        const nextPos = (currPos + 1) % burstList.length;
        get().setCompareTargetIndex(burstList[nextPos].index);
        return;
      }
    }

    // 全局下一张
    let nextIdx = compareTargetIndex + 1;
    if (nextIdx === currentIndex) nextIdx++;
    if (nextIdx < photos.length) {
      get().setCompareTargetIndex(nextIdx);
    }
  },

  prevCompareCandidate: () => {
    const { compareTargetIndex, compareScope } = get();
    const { photos, currentIndex } = useAlbumStore.getState();
    if (compareTargetIndex === null || photos.length === 0) return;

    const leftPhoto = photos[currentIndex];

    if (compareScope === 'burst' && leftPhoto?.burstGroupId) {
      const burstList = photos
        .map((p, i) => ({ photo: p, index: i }))
        .filter((item) => item.photo.burstGroupId === leftPhoto.burstGroupId && item.index !== currentIndex);

      if (burstList.length > 0) {
        const currPos = burstList.findIndex((item) => item.index === compareTargetIndex);
        const prevPos = (currPos - 1 + burstList.length) % burstList.length;
        get().setCompareTargetIndex(burstList[prevPos].index);
        return;
      }
    }

    // 全局上一张
    let prevIdx = compareTargetIndex - 1;
    if (prevIdx === currentIndex) prevIdx--;
    if (prevIdx >= 0) {
      get().setCompareTargetIndex(prevIdx);
    }
  },

  swapComparePhotos: () => {
    const { compareTargetIndex } = get();
    const { currentIndex, selectIndex } = useAlbumStore.getState();
    if (compareTargetIndex === null) return;

    const oldLeft = currentIndex;
    const oldRight = compareTargetIndex;

    selectIndex(oldRight);
    get().setCompareTargetIndex(oldLeft);
  },

  toggleSyncZoomAndPan: () => {
    set((state) => ({ syncZoomAndPan: !state.syncZoomAndPan }));
  },

  chooseLeft: () => {
    const { currentIndex, photos } = useAlbumStore.getState();
    const leftPhoto = photos[currentIndex];
    if (leftPhoto) {
      useSelectionStore.getState().setSelectionState(leftPhoto.id, 'selected');
    }
  },

  chooseRight: () => {
    const { compareTargetIndex } = get();
    const { photos } = useAlbumStore.getState();
    if (compareTargetIndex !== null && photos[compareTargetIndex]) {
      useSelectionStore.getState().setSelectionState(photos[compareTargetIndex].id, 'selected');
    }
  },

  chooseBoth: () => {
    const { currentIndex, photos } = useAlbumStore.getState();
    const { compareTargetIndex } = get();
    const leftPhoto = photos[currentIndex];
    const rightPhoto = compareTargetIndex !== null ? photos[compareTargetIndex] : undefined;
    if (!leftPhoto || !rightPhoto) return;
    useSelectionStore.getState().setSelectionStates(
      [
        { photoId: leftPhoto.id, state: 'selected' },
        { photoId: rightPhoto.id, state: 'selected' },
      ],
      '两张都选',
    );
  },

  deferBoth: () => {
    const { currentIndex, photos } = useAlbumStore.getState();
    const { compareTargetIndex } = get();
    const leftPhoto = photos[currentIndex];
    const rightPhoto = compareTargetIndex !== null ? photos[compareTargetIndex] : undefined;
    if (!leftPhoto || !rightPhoto) return;
    useSelectionStore.getState().setSelectionStates(
      [
        { photoId: leftPhoto.id, state: 'maybe' },
        { photoId: rightPhoto.id, state: 'maybe' },
      ],
      '两张都待考虑',
    );
  },

  nextSimilarGroup: () => {
    const { photos, currentIndex, selectIndex } = useAlbumStore.getState();
    const currentPhoto = photos[currentIndex];
    const currentGroupId = currentPhoto?.burstGroupId;

    // 找到下一个具有 burstGroupId 且不同的照片
    const nextGroupPhotoIdx = photos.findIndex(
      (p, i) => i > currentIndex && p.burstGroupId && p.burstGroupId !== currentGroupId,
    );

    if (nextGroupPhotoIdx >= 0) {
      selectIndex(nextGroupPhotoIdx);
      get().enterCompareMode();
    } else {
      // 循环到开头的另一组
      const firstGroupPhotoIdx = photos.findIndex(
        (p) => p.burstGroupId && p.burstGroupId !== currentGroupId,
      );
      if (firstGroupPhotoIdx >= 0) {
        selectIndex(firstGroupPhotoIdx);
        get().enterCompareMode();
      }
    }
  },
}));
