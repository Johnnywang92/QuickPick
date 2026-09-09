import { create } from 'zustand';
import { useAlbumStore } from './albumStore';
import { useSelectionStore } from './selectionStore';
import { usePreviewStore } from './previewStore';

let comparePreviewRequestId = 0;

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

  // 连拍极速对决模式 (Burst PK)
  isPkMode: boolean;
  pkBurstId: string | null;
  pkChampionIndex: number | null;
  pkChallengerIndex: number | null;
  pkRemainingIndices: number[];
  pkTotalCount: number;
  pkCompletedCount: number;
  startBurstPk: (burstGroupId?: string) => void;
  pkVoteLeft: () => void;
  pkVoteRight: () => void;
  pkVoteBoth: () => void;
  exitPkMode: () => void;
}

export const useCompareStore = create<CompareStore>((set, get) => ({
  isCompareMode: false,
  compareScope: 'burst',
  compareTargetIndex: null,
  comparePreviewUrl: null,
  comparePreviewStatus: 'idle',
  comparePreviewError: null,
  syncZoomAndPan: true,

  // 连拍 PK 初始状态
  isPkMode: false,
  pkBurstId: null,
  pkChampionIndex: null,
  pkChallengerIndex: null,
  pkRemainingIndices: [],
  pkTotalCount: 0,
  pkCompletedCount: 0,

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
    comparePreviewRequestId += 1;
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
    const requestId = ++comparePreviewRequestId;
    set({
      compareTargetIndex: index,
      comparePreviewUrl: null,
      comparePreviewStatus: 'loading',
      comparePreviewError: null,
    });

    // 尝试先从 previewCache 拿
    const cached = usePreviewStore.getState().previewCache.get(targetPhoto.path);
    if (cached) {
      if (requestId !== comparePreviewRequestId) return;
      set({
        comparePreviewUrl: cached,
        comparePreviewStatus: 'loaded',
        comparePreviewError: null,
      });
      return;
    }

    try {
      const url = await usePreviewStore.getState().getPreview(targetPhoto);
      if (requestId === comparePreviewRequestId && get().compareTargetIndex === index) {
        set({
          comparePreviewUrl: url,
          comparePreviewStatus: 'loaded',
          comparePreviewError: null,
        });
      }
    } catch (e: any) {
      if (requestId === comparePreviewRequestId && get().compareTargetIndex === index) {
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

  startBurstPk: (burstGroupId) => {
    const { photos, currentIndex } = useAlbumStore.getState();
    const current = photos[currentIndex];
    const targetBurstId = burstGroupId || current?.burstGroupId;
    if (!targetBurstId) return;

    const burstPhotoIndices = photos
      .map((p, idx) => ({ p, idx }))
      .filter((item) => item.p.burstGroupId === targetBurstId)
      .map((item) => item.idx);

    if (burstPhotoIndices.length < 2) return;

    const championIdx = burstPhotoIndices[0];
    const challengerIdx = burstPhotoIndices[1];
    const remaining = burstPhotoIndices.slice(2);

    // 默认让擂主作为当前主图
    useAlbumStore.getState().selectIndex(championIdx);

    set({
      isPkMode: true,
      pkBurstId: targetBurstId,
      pkChampionIndex: championIdx,
      pkChallengerIndex: challengerIdx,
      pkRemainingIndices: remaining,
      pkTotalCount: burstPhotoIndices.length,
      pkCompletedCount: 0,
    });
    void get().setCompareTargetIndex(challengerIdx);
  },

  pkVoteLeft: () => {
    const { pkChampionIndex, pkChallengerIndex, pkRemainingIndices, pkCompletedCount } = get();
    const { photos } = useAlbumStore.getState();
    if (pkChampionIndex === null || pkChallengerIndex === null) return;

    // 挑战者被淘汰，标记为 skipped
    const challengerPhoto = photos[pkChallengerIndex];
    if (challengerPhoto) {
      useSelectionStore.getState().setSelectionState(challengerPhoto.id, 'skipped');
    }

    if (pkRemainingIndices.length === 0) {
      // PK 结束！最终胜者标记为已选
      const champPhoto = photos[pkChampionIndex];
      if (champPhoto) {
        useSelectionStore.getState().setSelectionState(champPhoto.id, 'selected');
      }
      get().exitPkMode();
      return;
    }

    const nextChallenger = pkRemainingIndices[0];
    const nextRemaining = pkRemainingIndices.slice(1);
    set({
      pkChallengerIndex: nextChallenger,
      pkRemainingIndices: nextRemaining,
      pkCompletedCount: pkCompletedCount + 1,
    });
    void get().setCompareTargetIndex(nextChallenger);
  },

  pkVoteRight: () => {
    const { pkChampionIndex, pkChallengerIndex, pkRemainingIndices, pkCompletedCount } = get();
    const { photos } = useAlbumStore.getState();
    if (pkChampionIndex === null || pkChallengerIndex === null) return;

    // 旧擂主被淘汰，标记为 skipped
    const oldChamp = photos[pkChampionIndex];
    if (oldChamp) {
      useSelectionStore.getState().setSelectionState(oldChamp.id, 'skipped');
    }

    // 挑战者晋级为新擂主
    const newChampion = pkChallengerIndex;
    useAlbumStore.getState().selectIndex(newChampion);

    if (pkRemainingIndices.length === 0) {
      // PK 结束！新擂主标记为已选
      const champPhoto = photos[newChampion];
      if (champPhoto) {
        useSelectionStore.getState().setSelectionState(champPhoto.id, 'selected');
      }
      get().exitPkMode();
      return;
    }

    const nextChallenger = pkRemainingIndices[0];
    const nextRemaining = pkRemainingIndices.slice(1);
    set({
      pkChampionIndex: newChampion,
      pkChallengerIndex: nextChallenger,
      pkRemainingIndices: nextRemaining,
      pkCompletedCount: pkCompletedCount + 1,
    });
    void get().setCompareTargetIndex(nextChallenger);
  },

  pkVoteBoth: () => {
    const { pkChampionIndex, pkChallengerIndex, pkRemainingIndices, pkCompletedCount } = get();
    const { photos } = useAlbumStore.getState();
    if (pkChampionIndex === null || pkChallengerIndex === null) return;

    const champPhoto = photos[pkChampionIndex];
    const challPhoto = photos[pkChallengerIndex];
    if (champPhoto && challPhoto) {
      useSelectionStore.getState().setSelectionStates(
        [
          { photoId: champPhoto.id, state: 'selected' },
          { photoId: challPhoto.id, state: 'selected' },
        ],
        '连拍PK双选',
      );
    }

    if (pkRemainingIndices.length === 0) {
      get().exitPkMode();
      return;
    }

    const nextChampion = pkRemainingIndices[0];
    const nextChallenger = pkRemainingIndices[1] ?? null;
    const nextRemaining = pkRemainingIndices.slice(nextChallenger !== null ? 2 : 1);

    useAlbumStore.getState().selectIndex(nextChampion);

    if (nextChallenger === null) {
      const lastPhoto = photos[nextChampion];
      if (lastPhoto) {
        useSelectionStore.getState().setSelectionState(lastPhoto.id, 'selected');
      }
      get().exitPkMode();
      return;
    }

    set({
      pkChampionIndex: nextChampion,
      pkChallengerIndex: nextChallenger,
      pkRemainingIndices: nextRemaining,
      pkCompletedCount: pkCompletedCount + 1,
    });
    void get().setCompareTargetIndex(nextChallenger);
  },

  exitPkMode: () => {
    comparePreviewRequestId += 1;
    set({
      isPkMode: false,
      pkBurstId: null,
      pkChampionIndex: null,
      pkChallengerIndex: null,
      pkRemainingIndices: [],
      pkTotalCount: 0,
      pkCompletedCount: 0,
      compareTargetIndex: null,
      comparePreviewUrl: null,
      comparePreviewStatus: 'idle',
      comparePreviewError: null,
    });
  },
}));
