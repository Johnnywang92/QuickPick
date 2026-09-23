import { describe, it, expect } from 'vitest';
import {
  extractLuminanceStatsFromPixels,
  calculateAutoTone,
  PixelDataSource,
} from './autoTone';

// 辅助函数：创建指定尺寸和 RGBA 填充的像素源
function createMockPixels(
  width: number,
  height: number,
  pixelFn: (x: number, y: number) => [number, number, number, number],
): PixelDataSource {
  const data = new Uint8ClampedArray(width * height * 4);
  let idx = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = a;
      idx += 4;
    }
  }
  return { data, width, height };
}

describe('autoTone - Luminance extraction & Auto lighting calculation', () => {
  it('correctly calculates statistics for a balanced midtone image', () => {
    // 纯中性 118 灰度画面
    const mock = createMockPixels(50, 50, () => [118, 118, 118, 255]);
    const stats = extractLuminanceStatsFromPixels(mock.data, 50, 50);

    expect(stats.median).toBe(118);
    expect(Math.round(stats.mean)).toBe(118);
    expect(stats.highlightClipPct).toBe(0);
    expect(stats.shadowClipPct).toBe(0);

    const result = calculateAutoTone(mock);
    expect(result.exposure).toBeCloseTo(0, 1);
  });

  it('correctly detects underexposure and applies positive exposure compensation & shadow lift', () => {
    // 欠曝画面（大部分像素亮度在 30 ~ 50 之间，暗部死黑严重）
    const mock = createMockPixels(60, 60, (x) => {
      if (x < 10) return [5, 5, 5, 255]; // 死黑部分
      return [42, 42, 42, 255];          // 普遍偏暗
    });

    const stats = extractLuminanceStatsFromPixels(mock.data, 60, 60);
    expect(stats.median).toBeLessThan(60);
    expect(stats.shadowClipPct).toBeGreaterThan(0.05);

    const result = calculateAutoTone(mock, { preserveRotation: 90 });
    // 应当提升曝光
    expect(result.exposure).toBeGreaterThanOrEqual(0.6);
    expect(result.exposure).toBeLessThanOrEqual(1.5);
    // 应当提亮阴影暗部细节
    expect(result.shadows).toBeGreaterThanOrEqual(15);
    // 应当保持旋转角
    expect(result.rotation).toBe(90);
  });

  it('correctly detects overexposure & highlights clipping, and pulls down highlights', () => {
    // 过曝大光比画面（中位亮度偏高 190，且存在死白天空）
    const mock = createMockPixels(60, 60, (x) => {
      if (x < 20) return [255, 255, 255, 255]; // 死白高光
      return [180, 180, 180, 255];
    });

    const stats = extractLuminanceStatsFromPixels(mock.data, 60, 60);
    expect(stats.median).toBeGreaterThan(160);
    expect(stats.p98).toBe(255);
    expect(stats.highlightClipPct).toBeGreaterThan(0.1);

    const result = calculateAutoTone(mock);
    // 应当压暗曝光
    expect(result.exposure).toBeLessThan(0);
    // 应当拉回高光
    expect(result.highlights).toBeLessThanOrEqual(-20);
  });

  it('enhances contrast for flat hazy low-contrast images', () => {
    // 灰雾低对比画面（所有像素均挤在 110 ~ 125 之间，标准差很小）
    const mock = createMockPixels(50, 50, (x, y) => {
      const v = 110 + ((x + y) % 15);
      return [v, v, v, 255];
    });

    const stats = extractLuminanceStatsFromPixels(mock.data, 50, 50);
    expect(stats.stdDev).toBeLessThan(35);

    const result = calculateAutoTone(mock);
    // 应当增加对比度消除灰雾
    expect(result.contrast).toBeGreaterThanOrEqual(10);
  });

  it('corrects warm color cast via Auto White Balance', () => {
    // 明显偏暖色调（R = 170, G = 130, B = 90）
    const mock = createMockPixels(50, 50, () => [170, 130, 90, 255]);

    const stats = extractLuminanceStatsFromPixels(mock.data, 50, 50);
    expect(stats.avgR).toBeGreaterThan(stats.avgB + 40);

    const result = calculateAutoTone(mock);
    // 应当降低色温（调冷色）以纠正暖偏色
    expect(result.temperature).toBeLessThanOrEqual(-10);
  });

  it('corrects cool blue cast via Auto White Balance', () => {
    // 明显偏冷色调（R = 90, G = 120, B = 160）
    const mock = createMockPixels(50, 50, () => [90, 120, 160, 255]);

    const stats = extractLuminanceStatsFromPixels(mock.data, 50, 50);
    expect(stats.avgB).toBeGreaterThan(stats.avgR + 40);

    const result = calculateAutoTone(mock);
    // 应当增加色温（调暖色）以纠正冷偏色
    expect(result.temperature).toBeGreaterThanOrEqual(10);
  });

  it('protects Low-Key scenes (dark backdrop / night portrait) from aggressive over-brightening', () => {
    // 65% 的纯黑背景 (5, 5, 5)，35% 的明亮人像主体 (135, 135, 135)
    const mock = createMockPixels(60, 60, (x) => {
      if (x < 39) return [5, 5, 5, 255];
      return [135, 135, 135, 255];
    });

    const stats = extractLuminanceStatsFromPixels(mock.data, 60, 60);
    expect(stats.median).toBeLessThan(40);
    expect(stats.p75).toBeGreaterThanOrEqual(100);

    const result = calculateAutoTone(mock);
    // 普通欠曝会暴力提曝 +1.2 ~ +1.5 EV 导致噪点泛滥；低调保护机制应将提曝收敛在安全区间 (<= 0.5 EV)
    expect(result.exposure).toBeLessThanOrEqual(0.5);
    // 阴影温和提亮而不洗白纯黑背景
    expect(result.shadows).toBeLessThanOrEqual(28);
  });

  it('protects High-Key scenes (snow/white studio) from being aggressively dimmed into gray', () => {
    // 纯白高调场景（中位数在 175 左右，未过曝）
    const mock = createMockPixels(50, 50, () => [175, 175, 175, 255]);

    const stats = extractLuminanceStatsFromPixels(mock.data, 50, 50);
    expect(stats.median).toBeGreaterThan(150);
    expect(stats.highlightClipPct).toBe(0);

    const result = calculateAutoTone(mock);
    // 朴素对齐 118 灰度会暴力压暗 -0.6 EV；高调保护机制应限制压暗幅度 (>= -0.3 EV)
    expect(result.exposure).toBeGreaterThanOrEqual(-0.3);
  });

  it('automatically applies adaptive sampling step for large pixel data sources', () => {
    // 300 x 300 = 90,000 像素，自动使用采样步长以保证毫秒级计算
    const mock = createMockPixels(300, 300, () => [120, 120, 120, 255]);

    const stats = extractLuminanceStatsFromPixels(mock.data, 300, 300);
    expect(stats.totalPixels).toBeGreaterThan(0);
    expect(stats.median).toBe(120);
  });
});
