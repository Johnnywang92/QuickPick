import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clusterPhotosIntoScenes,
  photoMatchesFilter,
  useAlbumStore,
  withUpdatedBurstGroups,
} from './albumStore';
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
      activePresetId: 'general',
      targetGoal: null,
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

  describe('storyline chapter operations', () => {
    it('splits scene at given photo index', () => {
      useAlbumStore.setState({
        photos,
        scenes: [
          {
            id: 's1',
            name: '全流程',
            startIndex: 0,
            endIndex: 3,
            photoCount: 4,
            startPath: photos[0].path,
            endPath: photos[3].path,
            color: '#3b82f6',
            targetGoal: 5,
          },
        ],
        selectedSceneId: 's1',
      });

      useAlbumStore.getState().splitSceneAtPhoto(2);
      const scenes = useAlbumStore.getState().scenes;
      expect(scenes).toHaveLength(2);
      expect(scenes[0].startIndex).toBe(0);
      expect(scenes[0].endIndex).toBe(1);
      expect(scenes[0].photoCount).toBe(2);
      expect(scenes[1].startIndex).toBe(2);
      expect(scenes[1].endIndex).toBe(3);
      expect(scenes[1].photoCount).toBe(2);
      expect(scenes.reduce((sum, scene) => sum + (scene.targetGoal || 0), 0)).toBe(5);
      expect(useAlbumStore.getState().selectedSceneId).toBe(scenes[1].id);
    });

    it('merges two adjacent scenes', () => {
      useAlbumStore.setState({
        photos,
        scenes: [
          {
            id: 's1',
            name: '前半',
            startIndex: 0,
            endIndex: 1,
            photoCount: 2,
            startPath: photos[0].path,
            endPath: photos[1].path,
            color: '#3b82f6',
            targetGoal: 10,
          },
          {
            id: 's2',
            name: '后半',
            startIndex: 2,
            endIndex: 3,
            photoCount: 2,
            startPath: photos[2].path,
            endPath: photos[3].path,
            color: '#8b5cf6',
            targetGoal: 10,
          },
        ],
      });

      useAlbumStore.getState().mergeScenes('s1', 's2');
      const scenes = useAlbumStore.getState().scenes;
      expect(scenes).toHaveLength(1);
      expect(scenes[0].startIndex).toBe(0);
      expect(scenes[0].endIndex).toBe(3);
      expect(scenes[0].photoCount).toBe(4);
      expect(scenes[0].targetGoal).toBe(20);
    });

    it('distributes total target goal across chapters', () => {
      useAlbumStore.setState({
        photos,
        scenes: [
          {
            id: 's1',
            name: 'A',
            startIndex: 0,
            endIndex: 1,
            photoCount: 2,
            startPath: photos[0].path,
            endPath: photos[1].path,
            color: '#3b82f6',
          },
          {
            id: 's2',
            name: 'B',
            startIndex: 2,
            endIndex: 3,
            photoCount: 2,
            startPath: photos[2].path,
            endPath: photos[3].path,
            color: '#8b5cf6',
          },
        ],
      });

      useAlbumStore.getState().distributeTargetGoal(30);
      const state = useAlbumStore.getState();
      expect(state.targetGoal).toBe(30);
      const total = state.scenes.reduce((sum, s) => sum + (s.targetGoal || 0), 0);
      expect(total).toBe(30);
    });

    it('applies photography scene preset to chapters', () => {
      useAlbumStore.setState({
        photos,
        scenes: [
          {
            id: 's1',
            name: '旧环节1',
            startIndex: 0,
            endIndex: 1,
            photoCount: 2,
            startPath: photos[0].path,
            endPath: photos[1].path,
            color: '#3b82f6',
          },
          {
            id: 's2',
            name: '旧环节2',
            startIndex: 2,
            endIndex: 3,
            photoCount: 2,
            startPath: photos[2].path,
            endPath: photos[3].path,
            color: '#8b5cf6',
          },
        ],
      });

      useAlbumStore.getState().applyScenePreset('family');
      const state = useAlbumStore.getState();
      expect(state.activePresetId).toBe('family');
      expect(state.scenes[0].name).toBe('睡颜萌态与静物');
      expect(state.scenes[1].name).toBe('室内亲子互动');
      expect(state.scenes[0].targetGoal).toBeUndefined();
      expect(state.scenes[1].targetQuota).toBeUndefined();
    });

    it('only converts preset weights into quotas when a total target exists', () => {
      const timedPhotos = photos.map((photo, index) =>
        photoFixture(photo.id, {
          ...photo,
          capturedAt: `2026-09-09 12:${String(index * 11).padStart(2, '0')}:00`,
        }),
      );

      const withoutGoal = clusterPhotosIntoScenes(timedPhotos, 10, 'family');
      expect(withoutGoal.every((scene) => scene.targetGoal === undefined)).toBe(true);

      const withGoal = clusterPhotosIntoScenes(timedPhotos, 10, 'family', 100);
      expect(withGoal.map((scene) => scene.targetGoal)).toEqual([21, 29, 29, 21]);
      expect(withGoal.reduce((sum, scene) => sum + (scene.targetGoal || 0), 0)).toBe(100);
    });
  });

  describe('withUpdatedBurstGroups hybrid clustering', () => {
    it('splits photos taken close in time if phash visual distance is high', () => {
      const p1 = photoFixture('p1', {
        filename: 'IMG_0001.JPG',
        capturedAt: '2026-09-09 12:00:00',
        phash: '0000000000000000',
      });
      const p2 = photoFixture('p2', {
        filename: 'IMG_0002.JPG',
        capturedAt: '2026-09-09 12:00:01', // 1s
        phash: 'ffff0000ffff0000', // 32 bits diff
      });
      const grouped = withUpdatedBurstGroups([p1, p2]);
      expect(grouped[0].burstGroupId).toBeUndefined();
      expect(grouped[1].burstGroupId).toBeUndefined();
    });

    it('groups photos across 10 seconds if phash visual distance is small', () => {
      const p1 = photoFixture('p1', {
        filename: 'IMG_0001.JPG',
        capturedAt: '2026-09-09 12:00:00',
        phash: '1111222233334444',
      });
      const p2 = photoFixture('p2', {
        filename: 'IMG_0002.JPG',
        capturedAt: '2026-09-09 12:00:10', // 10s (> 2s, <= 15s)
        phash: '1111222233334446', // 1 bit diff
      });
      const grouped = withUpdatedBurstGroups([p1, p2]);
      expect(grouped[0].burstGroupId).toBe('burst:p1');
      expect(grouped[1].burstGroupId).toBe('burst:p1');
    });
  });
});
