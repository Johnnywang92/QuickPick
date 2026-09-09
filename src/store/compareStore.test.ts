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
      compareTargetIndex: 1,
      comparePreviewUrl: null,
      comparePreviewStatus: 'idle',
      comparePreviewError: null,
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
});
