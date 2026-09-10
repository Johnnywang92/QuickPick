import { describe, it, expect } from 'vitest';
import { detectOptimalPreset } from './storylineDetector';
import { LocalPhoto } from '../types/photo';

function createMockPhoto(id: string, overrides: Partial<LocalPhoto> = {}): LocalPhoto {
  return {
    id,
    path: `/photos/${id}.jpg`,
    filename: `${id}.jpg`,
    fileSize: 1024000,
    format: 'jpeg',
    isRaw: false,
    ...overrides,
  };
}

describe('storylineDetector', () => {
  it('should return general preset for empty photos', () => {
    const result = detectOptimalPreset('/some/random/path', []);
    expect(result.presetId).toBe('general');
    expect(result.confidence).toBe(0);
  });

  it('should detect wedding preset based on path keywords and full-day span', () => {
    const photos: LocalPhoto[] = [
      createMockPhoto('p1', {
        filename: '01_早妆.jpg',
        exif: { date_time_original: '2026:05:20 07:00:00', iso: 400, aperture: 1.4 },
      }),
      createMockPhoto('p2', {
        filename: '02_接亲.jpg',
        exif: { date_time_original: '2026:05:20 10:30:00', iso: 400, aperture: 1.8 },
      }),
      createMockPhoto('p3', {
        filename: '03_主仪式.jpg',
        exif: { date_time_original: '2026:05:20 14:00:00', iso: 800, aperture: 2.8 },
      }),
      createMockPhoto('p4', {
        filename: '04_晚宴敬酒.jpg',
        exif: { date_time_original: '2026:05:20 20:30:00', iso: 1600, aperture: 2.0 },
      }),
    ];

    const result = detectOptimalPreset('/Users/photographer/20260520_张府婚礼纪实', photos);
    expect(result.presetId).toBe('wedding');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.reasons.some((r) => r.includes('婚礼'))).toBe(true);
  });

  it('should detect family preset for baby keywords and short duration', () => {
    const photos: LocalPhoto[] = [
      createMockPhoto('p1', {
        exif: { date_time_original: '2026:06:01 10:00:00', iso: 200, aperture: 1.8 },
      }),
      createMockPhoto('p2', {
        exif: { date_time_original: '2026:06:01 11:30:00', iso: 200, aperture: 1.4 },
      }),
    ];

    const result = detectOptimalPreset('/Volumes/SSD/宝宝一岁抓周与亲子记录', photos);
    expect(result.presetId).toBe('family');
    expect(result.confidence).toBeGreaterThanOrEqual(0.65);
    expect(result.reasons.some((r) => r.includes('亲子与家庭'))).toBe(true);
  });

  it('should detect conference preset for summit keywords', () => {
    const photos: LocalPhoto[] = [
      createMockPhoto('p1', {
        exif: { date_time_original: '2026:09:09 09:00:00', iso: 800, aperture: 4.0 },
      }),
      createMockPhoto('p2', {
        exif: { date_time_original: '2026:09:09 17:30:00', iso: 800, aperture: 4.0 },
      }),
    ];

    const result = detectOptimalPreset('/Users/work/2026全球科技创新峰会与年会', photos);
    expect(result.presetId).toBe('conference');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('should detect concert preset for evening time and high ISO', () => {
    const photos: LocalPhoto[] = [
      createMockPhoto('p1', {
        exif: { date_time_original: '2026:07:15 19:30:00', iso: 6400, aperture: 2.8 },
      }),
      createMockPhoto('p2', {
        exif: { date_time_original: '2026:07:15 20:15:00', iso: 6400, aperture: 2.8 },
      }),
      createMockPhoto('p3', {
        exif: { date_time_original: '2026:07:15 21:00:00', iso: 3200, aperture: 2.8 },
      }),
      createMockPhoto('p4', {
        exif: { date_time_original: '2026:07:15 21:45:00', iso: 6400, aperture: 2.8 },
      }),
      createMockPhoto('p5', {
        exif: { date_time_original: '2026:07:15 22:30:00', iso: 8000, aperture: 2.8 },
      }),
    ];

    const result = detectOptimalPreset('/Volumes/Photos/Livehouse音乐节演出', photos);
    expect(result.presetId).toBe('concert');
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
    expect(result.reasons.some((r) => r.includes('高感光度') || r.includes('演出'))).toBe(true);
  });

  it('should detect travel preset when spanning multiple calendar days', () => {
    const photos: LocalPhoto[] = [
      createMockPhoto('p1', {
        exif: { date_time_original: '2026:08:01 09:00:00', iso: 100, aperture: 8.0 },
      }),
      createMockPhoto('p2', {
        exif: { date_time_original: '2026:08:02 14:00:00', iso: 100, aperture: 8.0 },
      }),
      createMockPhoto('p3', {
        exif: { date_time_original: '2026:08:03 18:00:00', iso: 100, aperture: 8.0 },
      }),
    ];

    const result = detectOptimalPreset('/Volumes/Photos/云南大理风光', photos);
    expect(result.presetId).toBe('travel');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    expect(result.reasons.some((r) => r.includes('自然日') || r.includes('旅拍'))).toBe(true);
  });

  it('should fallback to general when path and EXIF have no distinctive patterns', () => {
    const photos: LocalPhoto[] = [
      createMockPhoto('p1'),
      createMockPhoto('p2'),
    ];

    const result = detectOptimalPreset('/Users/test/misc_dcim_001', photos);
    expect(result.presetId).toBe('general');
  });
});
