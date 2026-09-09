import { describe, expect, it } from 'vitest';
import { photoFixture } from '../test/photoFixture';
import {
  computeHammingDistance,
  computeVisualSimilarity,
  arePhotosBurstConsecutive,
  calculateBurstPhotoScore,
  findBestPicksByBurstGroup,
} from './phashUtils';

describe('phashUtils', () => {
  describe('computeHammingDistance and computeVisualSimilarity', () => {
    it('returns 0 distance and 100% similarity for identical hashes', () => {
      const h1 = '1234567890abcdef';
      const h2 = '1234567890abcdef';
      expect(computeHammingDistance(h1, h2)).toBe(0);
      expect(computeVisualSimilarity(h1, h2)).toBe(100);
    });

    it('returns accurate distance for small differences', () => {
      const h1 = '0000000000000000';
      const h2 = '000000000000000f'; // 4 bits set in 0xf
      expect(computeHammingDistance(h1, h2)).toBe(4);
      // 64 - 4 = 60; 60 / 64 * 100 = 93.75 -> round to 94
      expect(computeVisualSimilarity(h1, h2)).toBe(94);
    });

    it('returns 64 distance and 0% similarity for completely inverted hashes', () => {
      const h1 = '0000000000000000';
      const h2 = 'ffffffffffffffff';
      expect(computeHammingDistance(h1, h2)).toBe(64);
      expect(computeVisualSimilarity(h1, h2)).toBe(0);
    });

    it('returns null for invalid or missing hashes', () => {
      expect(computeHammingDistance(undefined, '1234567890abcdef')).toBeNull();
      expect(computeHammingDistance('invalid', '1234567890abcdef')).toBeNull();
      expect(computeVisualSimilarity('short', '1234567890abcdef')).toBeNull();
    });
  });

  describe('arePhotosBurstConsecutive', () => {
    it('splits photos taken within 1 second if visual distance is >= 14', () => {
      const p1 = photoFixture('p1', {
        filename: 'DSC_0001.JPG',
        capturedAt: '2026-09-09 10:00:00',
        phash: '0000000000000000',
      });
      const p2 = photoFixture('p2', {
        filename: 'DSC_0002.JPG',
        capturedAt: '2026-09-09 10:00:01', // 1s diff
        phash: '0000ffff0000ffff', // 32 bits diff (>= 14)
      });
      expect(arePhotosBurstConsecutive(p2, p1)).toBe(false);
    });

    it('groups photos taken 8 seconds apart if visually highly similar (dist <= 8)', () => {
      const p1 = photoFixture('p1', {
        filename: 'DSC_0001.JPG',
        capturedAt: '2026-09-09 10:00:00',
        phash: '1111222233334444',
      });
      const p2 = photoFixture('p2', {
        filename: 'DSC_0002.JPG',
        capturedAt: '2026-09-09 10:00:08', // 8s diff (> 2s, <= 15s)
        phash: '1111222233334445', // 1 bit diff
      });
      expect(arePhotosBurstConsecutive(p2, p1)).toBe(true);
    });

    it('groups photos without timestamps if visually similar', () => {
      const p1 = photoFixture('p1', {
        filename: 'photo_a.jpg',
        phash: 'aaaa111122223333',
      });
      const p2 = photoFixture('p2', {
        filename: 'photo_b.jpg',
        phash: 'aaaa111122223337', // 2 bits diff (<= 8)
      });
      expect(arePhotosBurstConsecutive(p2, p1)).toBe(true);
    });
  });

  describe('calculateBurstPhotoScore and findBestPicksByBurstGroup', () => {
    it('penalizes photos with closed eyes and rewards high sharpness', () => {
      const sharpClosed = photoFixture('p1', {
        sharpness: 90,
        faces: [{ id: 'f1', eye_open_score: 0.1 } as any],
      });
      const clearOpen = photoFixture('p2', {
        sharpness: 70,
        faces: [{ id: 'f2', eye_open_score: 0.9 } as any],
      });

      // sharpClosed score: 90 * 0.4 = 36
      // clearOpen score: 70 * 1.2 = 84
      expect(calculateBurstPhotoScore(sharpClosed)).toBeLessThan(calculateBurstPhotoScore(clearOpen));
    });

    it('finds the best photo in each burst group', () => {
      const p1 = photoFixture('p1', {
        burstGroupId: 'burst:1',
        sharpness: 50,
      });
      const p2 = photoFixture('p2', {
        burstGroupId: 'burst:1',
        sharpness: 95,
      });
      const p3 = photoFixture('p3', {
        burstGroupId: 'burst:1',
        sharpness: 60,
      });

      const bestMap = findBestPicksByBurstGroup([p1, p2, p3]);
      expect(bestMap.get('burst:1')).toBe('p2');
    });
  });
});
