import { describe, it, expect } from 'vitest';
import { generateAlbumSpreads } from './albumLayout';
import { LocalPhoto, SceneChapter } from '../types/photo';

describe('albumLayout', () => {
  it('returns empty plan when no photos are provided', () => {
    const plan = generateAlbumSpreads([]);
    expect(plan.totalPhotos).toBe(0);
    expect(plan.totalSpreads).toBe(0);
    expect(plan.spreads.length).toBe(0);
  });

  it('generates spreads for selected photos with diverse layouts', () => {
    const photos: LocalPhoto[] = Array.from({ length: 9 }, (_, i) => ({
      id: `p_${i}`,
      filename: `IMG_${i}.jpg`,
      path: `/photos/IMG_${i}.jpg`,
      fileSize: 1024,
      format: 'jpeg',
      isRaw: false,
    }));

    const plan = generateAlbumSpreads(photos);
    expect(plan.totalPhotos).toBe(9);
    expect(plan.totalSpreads).toBeGreaterThan(0);
    expect(plan.totalPages).toBe(plan.totalSpreads * 2);

    // Sum of all photos across spreads should match input count exactly
    const totalPlaced = plan.spreads.reduce((sum, s) => sum + s.photos.length, 0);
    expect(totalPlaced).toBe(9);
  });

  it('uses full-album indexes when assigning selected photos to scenes', () => {
    const allPhotos = Array.from({ length: 6 }, (_, i) => ({
      id: `p_${i}`,
      filename: `IMG_${i}.jpg`,
      path: `/photos/IMG_${i}.jpg`,
      fileSize: 1024,
      format: 'jpeg' as const,
      isRaw: false,
    }));
    const scenes: SceneChapter[] = [
      {
        id: 'early', name: '前段', startIndex: 0, endIndex: 2,
        startPath: allPhotos[0].path, endPath: allPhotos[2].path,
        photoCount: 3, color: '#000000',
      },
      {
        id: 'late', name: '后段', startIndex: 3, endIndex: 5,
        startPath: allPhotos[3].path, endPath: allPhotos[5].path,
        photoCount: 3, color: '#ffffff',
      },
    ];

    const plan = generateAlbumSpreads([allPhotos[4]], scenes, allPhotos);

    expect(plan.spreads[0].sceneName).toBe('后段');
  });
});
