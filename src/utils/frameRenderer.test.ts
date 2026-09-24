import { describe, it, expect } from 'vitest';
import {
  detectCameraBrand,
  formatExifStrings,
  applyAdjustmentsToImageData,
  isColorDark,
  drawPhotographicBadge,
} from './frameRenderer';
import { DEFAULT_FRAME_CONFIG, DEFAULT_ADJUSTMENTS } from '../types/adjust';
import { LocalPhoto } from '../types/photo';

describe('frameRenderer - EXIF formatting & detection', () => {
  it('detects SONY brand and formats clean model', () => {
    const { brand, cleanModel } = detectCameraBrand('Sony Corporation', 'ILCE-7RM5');
    expect(brand).toBe('SONY');
    expect(cleanModel).toBe('α7RM5');
  });

  it('detects Canon brand and clean model', () => {
    const { brand, cleanModel } = detectCameraBrand('Canon', 'Canon EOS R5');
    expect(brand).toBe('Canon');
    expect(cleanModel).toBe('EOS R5');
  });

  it('detects Nikon brand and clean model', () => {
    const { brand, cleanModel } = detectCameraBrand('NIKON CORPORATION', 'NIKON Z 8');
    expect(brand).toBe('NIKON');
    expect(cleanModel).toBe('Z 8');
  });

  it('detects Leica brand and Apple iPhone', () => {
    const leica = detectCameraBrand('Leica Camera AG', 'LEICA M11');
    expect(leica.brand).toBe('Leica');
    expect(leica.cleanModel).toBe('M11');

    const apple = detectCameraBrand('Apple', 'iPhone 15 Pro');
    expect(apple.brand).toBe('Apple');
    expect(apple.cleanModel).toBe('iPhone 15 Pro');
  });

  it('formats EXIF strings correctly for shooting parameters', () => {
    const photo: LocalPhoto = {
      id: 'test-1',
      path: '/path/test.jpg',
      filename: 'test.jpg',
      fileSize: 1024,
      format: 'jpeg',
      isRaw: false,
      exif: {
        camera_make: 'SONY',
        camera_model: 'ILCE-7RM5',
        lens_model: 'FE 24-70mm F2.8 GM II',
        focal_length: 50.0,
        aperture: 2.8,
        shutter_speed: '1/500s',
        iso: 100,
        date_time_original: '2026-09-22 14:30:00',
      },
    };

    const config = {
      ...DEFAULT_FRAME_CONFIG,
      customPhotographer: 'Photo by Johnny',
    };

    const formatted = formatExifStrings(photo, config);
    expect(formatted.cameraTitle).toContain('SONY');
    expect(formatted.lensTitle).toBe('FE 24-70mm F2.8 GM II');
    expect(formatted.paramsString).toBe('50mm   │   f/2.8   │   1/500s   │   ISO 100');
    expect(formatted.dateString).toBe('2026.09.22 14:30');
    expect(formatted.photographerText).toBe('Photo by Johnny');
  });

  it('handles missing EXIF parameters gracefully without throwing', () => {
    const photo: LocalPhoto = {
      id: 'test-2',
      path: '/path/no_exif.jpg',
      filename: 'no_exif.jpg',
      fileSize: 1024,
      format: 'jpeg',
      isRaw: false,
      exif: undefined,
    };

    const formatted = formatExifStrings(photo, DEFAULT_FRAME_CONFIG);
    expect(formatted.cameraTitle).toBe('CAMERA Camera');
    expect(formatted.lensTitle).toBe('');
    expect(formatted.paramsString).toBe('');
    expect(formatted.dateString).toBe('');
  });

  it('applies adjustments to ImageData accurately', () => {
    // 模拟 1x1 像素 RGBA (128, 128, 128, 255)
    const mockImageData = {
      data: new Uint8ClampedArray([128, 128, 128, 255]),
      width: 1,
      height: 1,
      colorSpace: 'srgb',
    } as unknown as ImageData;

    // 曝光加 1 挡 (+1.0 EV -> 翻倍为 255)
    applyAdjustmentsToImageData(mockImageData, {
      ...DEFAULT_ADJUSTMENTS,
      exposure: 1.0,
    });

    expect(mockImageData.data[0]).toBe(255);
    expect(mockImageData.data[1]).toBe(255);
    expect(mockImageData.data[2]).toBe(255);

    // 一键黑白测试
    const colorPixel = {
      data: new Uint8ClampedArray([200, 100, 50, 255]),
      width: 1,
      height: 1,
      colorSpace: 'srgb',
    } as unknown as ImageData;

    applyAdjustmentsToImageData(colorPixel, {
      ...DEFAULT_ADJUSTMENTS,
      isBlackAndWhite: true,
    });

    // 灰度下 R == G == B
    expect(colorPixel.data[0]).toBe(colorPixel.data[1]);
    expect(colorPixel.data[1]).toBe(colorPixel.data[2]);
  });

  it('short-circuits and leaves data untouched when adjustments are noop', () => {
    const original = [12, 34, 56, 255];
    const mockImageData = {
      data: new Uint8ClampedArray(original),
      width: 1,
      height: 1,
      colorSpace: 'srgb',
    } as unknown as ImageData;

    applyAdjustmentsToImageData(mockImageData, DEFAULT_ADJUSTMENTS);

    expect(mockImageData.data[0]).toBe(original[0]);
    expect(mockImageData.data[1]).toBe(original[1]);
    expect(mockImageData.data[2]).toBe(original[2]);
  });

  it('correctly uses 1D LUT fast path for exposure and contrast adjustments', () => {
    const mockImageData = {
      data: new Uint8ClampedArray([100, 150, 200, 255]),
      width: 1,
      height: 1,
      colorSpace: 'srgb',
    } as unknown as ImageData;

    applyAdjustmentsToImageData(mockImageData, {
      ...DEFAULT_ADJUSTMENTS,
      exposure: 0.5,
      contrast: 10,
    });

    // 曝光 +0.5 EV 且加对比度，数值应有合理的正向提升
    expect(mockImageData.data[0]).toBeGreaterThan(100);
    expect(mockImageData.data[1]).toBeGreaterThan(150);
    expect(mockImageData.data[2]).toBeGreaterThan(200);
  });

  it('correctly assesses dark vs light colors via isColorDark', () => {
    // 浅色 / 白色
    expect(isColorDark('#FFFFFF')).toBe(false);
    expect(isColorDark('#FFF')).toBe(false);
    expect(isColorDark('#FBFBFA')).toBe(false);
    expect(isColorDark('#F4EDE4')).toBe(false);
    expect(isColorDark('#E2E8F0')).toBe(false);

    // 深色 / 黑色
    expect(isColorDark('#000000')).toBe(true);
    expect(isColorDark('#000')).toBe(true);
    expect(isColorDark('#0F1013')).toBe(true);
    expect(isColorDark('#1E293B')).toBe(true);
    expect(isColorDark('#08080A')).toBe(true);
  });

  it('drawPhotographicBadge safely handles none without throwing', () => {
    const mockCtx = {
      save: () => {},
      restore: () => {},
      translate: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
    } as unknown as CanvasRenderingContext2D;

    expect(() => {
      drawPhotographicBadge(mockCtx, 'none', 0, 0, 24, false);
    }).not.toThrow();
  });
});
