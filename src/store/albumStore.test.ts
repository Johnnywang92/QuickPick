import { beforeEach, describe, expect, it, vi } from 'vitest';
import { photoMatchesFilter, useAlbumStore } from './albumStore';
import { useInsightStore } from './insightStore';
import { usePreviewStore } from './previewStore';
import { useSelectionStore } from './selectionStore';
import { photoFixture } from '../test/photoFixture';

describe('albumStore filter navigation', () => {
  const photos = ['one', 'two', 'three', 'four'].map((id) => photoFixture(id));

  beforeEach(() => {
    useSelectionStore.setState({
      currentProjectId: null,
      selections: {
        one: { photoId: 'one', state: 'unreviewed', updatedAt: '' },
        two: { photoId: 'two', state: 'selected', updatedAt: '' },
        three: { photoId: 'three', state: 'maybe', updatedAt: '' },
        four: { photoId: 'four', state: 'selected', updatedAt: '' },
      },
      viewedPhotoIds: { one: true, two: true },
      undoStack: [],
    });
    useInsightStore.setState({ insights: {} });
    usePreviewStore.setState({ loadPreviewForCurrent: vi.fn() });
    useAlbumStore.setState({
      photos,
      currentIndex: 0,
      activeFilter: 'all',
      selectedSceneId: null,
      scenes: [],
    });
  });

  it('navigates only within the active filtered result', () => {
    useAlbumStore.getState().setActiveFilter('selected');
    expect(useAlbumStore.getState().currentIndex).toBe(1);

    useAlbumStore.getState().nextPhoto();
    expect(useAlbumStore.getState().currentIndex).toBe(3);

    useAlbumStore.getState().prevPhoto();
    expect(useAlbumStore.getState().currentIndex).toBe(1);
  });

  it('uses review progress rather than selection state for unreviewed filtering', () => {
    const selections = useSelectionStore.getState().selections;
    const viewed = useSelectionStore.getState().viewedPhotoIds;
    const insights = useInsightStore.getState().insights;

    expect(photoMatchesFilter(photos[1], 1, 'unreviewed', null, [], selections, viewed, insights)).toBe(false);
    expect(photoMatchesFilter(photos[2], 2, 'unreviewed', null, [], selections, viewed, insights)).toBe(true);
    expect(photoMatchesFilter(photos[3], 3, 'unreviewed', null, [], selections, viewed, insights)).toBe(true);
  });
});
