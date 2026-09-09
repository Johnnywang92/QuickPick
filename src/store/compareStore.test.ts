import { beforeEach, describe, expect, it, vi } from 'vitest';
import { photoFixture } from '../test/photoFixture';
import { useAlbumStore } from './albumStore';
import { useCompareStore } from './compareStore';
import { usePreviewStore } from './previewStore';
import { useSelectionStore } from './selectionStore';

describe('compareStore', () => {
  const setSelectionStates = vi.fn();
  const photos = [
    photoFixture('left', { burstGroupId: 'burst:left' }),
    photoFixture('right', { burstGroupId: 'burst:left' }),
    photoFixture('same-group-third', { burstGroupId: 'burst:left' }),
  ];

  beforeEach(() => {
    setSelectionStates.mockReset();
    useAlbumStore.setState({ photos, currentIndex: 0 });
    useSelectionStore.setState({
      selections: {
        left: { photoId: 'left', state: 'unreviewed', updatedAt: '' },
        right: { photoId: 'right', state: 'unreviewed', updatedAt: '' },
        'same-group-third': { photoId: 'same-group-third', state: 'maybe', updatedAt: '' },
      },
      setSelectionStates,
    });
    useCompareStore.setState({
      isCompareMode: true,
      isPkMode: false,
      compareTargetIndex: 1,
      comparePreviewUrl: null,
      comparePreviewStatus: 'idle',
      comparePreviewError: null,
    });
    usePreviewStore.setState({
      previewCache: new Map(),
      getPreview: vi.fn().mockResolvedValue('preview:default'),
    });
  });

  it('sends two-photo decisions through one batch without excluding the rest of the group', () => {
    useCompareStore.getState().chooseBoth();

    expect(setSelectionStates).toHaveBeenCalledOnce();
    expect(setSelectionStates.mock.calls[0][0]).toEqual([
      { photoId: 'left', state: 'selected' },
      { photoId: 'right', state: 'selected' },
    ]);
    expect(setSelectionStates.mock.calls[0][0]).not.toContainEqual({
      photoId: 'same-group-third',
      state: 'skipped',
    });
  });

  it('keeps selections unchanged when candidate preview loading fails', async () => {
    usePreviewStore.setState({ getPreview: vi.fn().mockRejectedValue(new Error('moved')) });
    const before = useSelectionStore.getState().selections;

    await useCompareStore.getState().setCompareTargetIndex(1);

    expect(useCompareStore.getState().comparePreviewStatus).toBe('error');
    expect(useSelectionStore.getState().selections).toBe(before);
  });

  it('ignores an older preview request that resolves after the current candidate', async () => {
    let resolveOld!: (url: string) => void;
    let resolveCurrent!: (url: string) => void;
    usePreviewStore.setState({
      getPreview: vi.fn((photo) =>
        new Promise<string>((resolve) => {
          if (photo.id === 'right') resolveOld = resolve;
          else resolveCurrent = resolve;
        }),
      ),
    });

    const oldRequest = useCompareStore.getState().setCompareTargetIndex(1);
    const currentRequest = useCompareStore.getState().setCompareTargetIndex(2);
    resolveCurrent('preview:current');
    await currentRequest;
    resolveOld('preview:old');
    await oldRequest;

    expect(useCompareStore.getState().compareTargetIndex).toBe(2);
    expect(useCompareStore.getState().comparePreviewUrl).toBe('preview:current');
  });

  it('runs burst pk elimination: voting left eliminates challenger and advances to final winner', () => {
    const setSelectionState = vi.fn();
    useSelectionStore.setState({ setSelectionState });

    useCompareStore.getState().startBurstPk('burst:left');

    const state = useCompareStore.getState();
    expect(state.isPkMode).toBe(true);
    expect(state.pkChampionIndex).toBe(0);
    expect(state.pkChallengerIndex).toBe(1);
    expect(state.pkRemainingIndices).toEqual([2]);

    // Vote left -> challenger (index 1 / 'right') is marked skipped
    useCompareStore.getState().pkVoteLeft();
    expect(setSelectionState).toHaveBeenCalledWith('right', 'skipped');

    const afterVote = useCompareStore.getState();
    expect(afterVote.pkChampionIndex).toBe(0);
    expect(afterVote.pkChallengerIndex).toBe(2);
    expect(afterVote.pkRemainingIndices).toEqual([]);

    // Final vote left -> challenger 2 skipped, champion 0 selected, PK exits
    useCompareStore.getState().pkVoteLeft();
    expect(setSelectionState).toHaveBeenCalledWith('same-group-third', 'skipped');
    expect(setSelectionState).toHaveBeenCalledWith('left', 'selected');
    expect(useCompareStore.getState().isPkMode).toBe(false);
  });
});
