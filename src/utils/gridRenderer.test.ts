import { describe, it, expect, vi } from 'vitest';
import { renderCompositionGrid, GridRenderOptions } from './gridRenderer';
import { Graphics } from 'pixi.js';

describe('gridRenderer', () => {
  function createMockGraphics(): Graphics {
    const mock = {
      clear: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      circle: vi.fn(),
      rect: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
    } as unknown as Graphics;
    return mock;
  }

  const baseOptions: GridRenderOptions = {
    gridType: 'thirds',
    spiralOrientation: 0,
    gridColor: 'gold',
    opacity: 0.7,
    showPowerPoints: true,
    scale: 1.0,
  };

  it('clears graphics and returns early when gridType is none', () => {
    const g = createMockGraphics();
    renderCompositionGrid(g, 1920, 1080, { ...baseOptions, gridType: 'none' });

    expect(g.clear).toHaveBeenCalled();
    expect(g.moveTo).not.toHaveBeenCalled();
    expect(g.stroke).not.toHaveBeenCalled();
  });

  it('renders rule of thirds grid with power points', () => {
    const g = createMockGraphics();
    renderCompositionGrid(g, 1200, 900, { ...baseOptions, gridType: 'thirds', showPowerPoints: true });

    expect(g.clear).toHaveBeenCalled();
    expect(g.rect).toHaveBeenCalledWith(-600, -450, 1200, 900);
    // 4 lines + outer frame + 4 power points
    expect(g.moveTo).toHaveBeenCalled();
    expect(g.lineTo).toHaveBeenCalled();
    expect(g.circle).toHaveBeenCalledTimes(8); // 4 outer rings + 4 inner dots
    expect(g.stroke).toHaveBeenCalled();
    expect(g.fill).toHaveBeenCalled();
  });

  it('renders golden ratio grid without power points when disabled', () => {
    const g = createMockGraphics();
    renderCompositionGrid(g, 1000, 800, { ...baseOptions, gridType: 'golden_ratio', showPowerPoints: false });

    expect(g.clear).toHaveBeenCalled();
    expect(g.rect).toHaveBeenCalledWith(-500, -400, 1000, 800);
    expect(g.circle).not.toHaveBeenCalled();
    expect(g.stroke).toHaveBeenCalled();
  });

  it('renders golden spiral with 4 different orientations without throwing', () => {
    for (const orientation of [0, 1, 2, 3] as const) {
      const g = createMockGraphics();
      expect(() => {
        renderCompositionGrid(g, 1920, 1080, {
          ...baseOptions,
          gridType: 'golden_spiral',
          spiralOrientation: orientation,
        });
      }).not.toThrow();
      expect(g.clear).toHaveBeenCalled();
      expect(g.rect).toHaveBeenCalled();
      expect(g.stroke).toHaveBeenCalled();
    }
  });

  it('renders diagonal & dynamic symmetry reciprocal lines', () => {
    const g = createMockGraphics();
    renderCompositionGrid(g, 1600, 900, { ...baseOptions, gridType: 'diagonal' });

    expect(g.clear).toHaveBeenCalled();
    expect(g.rect).toHaveBeenCalledWith(-800, -450, 1600, 900);
    expect(g.moveTo).toHaveBeenCalled();
    expect(g.lineTo).toHaveBeenCalled();
    expect(g.stroke).toHaveBeenCalled();
  });

  it('renders center crosshair, horizon level ticks and reticle', () => {
    const g = createMockGraphics();
    renderCompositionGrid(g, 2000, 1000, { ...baseOptions, gridType: 'center' });

    expect(g.clear).toHaveBeenCalled();
    expect(g.rect).toHaveBeenCalledWith(-1000, -500, 2000, 1000);
    expect(g.circle).toHaveBeenCalledTimes(2); // dual reticle rings
    expect(g.stroke).toHaveBeenCalled();
  });
});
