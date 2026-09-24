import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isDisplayP3Supported, getOptimalCanvasColorSpace, get2DContextWithOptions } from './colorSpace';

describe('colorSpace utility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('detects Display P3 when matchMedia matches', () => {
    window.matchMedia = vi.fn((query: string) => ({
      matches: query.includes('p3'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as any));

    expect(isDisplayP3Supported()).toBe(true);
    expect(getOptimalCanvasColorSpace()).toBe('display-p3');
  });

  it('falls back to sRGB when display does not support P3', () => {
    window.matchMedia = vi.fn(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as any));

    expect(isDisplayP3Supported()).toBe(false);
    expect(getOptimalCanvasColorSpace()).toBe('srgb');
  });

  it('safely obtains 2D context using get2DContextWithOptions', () => {
    const canvas = document.createElement('canvas');
    const ctx = get2DContextWithOptions(canvas);
    // In jsdom without node-canvas, getContext returns null or mock, which shouldn't throw
    expect(ctx === null || typeof ctx === 'object').toBe(true);
  });
});
