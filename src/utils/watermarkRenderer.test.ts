import { describe, it, expect, vi } from 'vitest';
import {
  calculateAnchorCoordinates,
  applyWatermarkToCanvas,
} from './watermarkRenderer';
import { DEFAULT_WATERMARK_CONFIG, WatermarkConfig } from '../types/adjust';

describe('watermarkRenderer - Coordinates & Anchor calculations', () => {
  it('correctly calculates top-left anchor coordinates', () => {
    const anchor = calculateAnchorCoordinates(1000, 800, 40, 'top-left');
    expect(anchor.x).toBe(40);
    expect(anchor.y).toBe(40);
    expect(anchor.align).toBe('left');
    expect(anchor.baseline).toBe('top');
  });

  it('correctly calculates center anchor coordinates', () => {
    const anchor = calculateAnchorCoordinates(1000, 800, 40, 'center');
    expect(anchor.x).toBe(500);
    expect(anchor.y).toBe(400);
    expect(anchor.align).toBe('center');
    expect(anchor.baseline).toBe('middle');
  });

  it('correctly calculates bottom-right anchor coordinates', () => {
    const anchor = calculateAnchorCoordinates(1000, 800, 40, 'bottom-right');
    expect(anchor.x).toBe(960);
    expect(anchor.y).toBe(760);
    expect(anchor.align).toBe('right');
    expect(anchor.baseline).toBe('bottom');
  });

  it('correctly calculates top-right and bottom-left coordinates', () => {
    const tr = calculateAnchorCoordinates(1000, 800, 30, 'top-right');
    expect(tr.x).toBe(970);
    expect(tr.y).toBe(30);

    const bl = calculateAnchorCoordinates(1000, 800, 30, 'bottom-left');
    expect(bl.x).toBe(30);
    expect(bl.y).toBe(770);
  });
});

describe('watermarkRenderer - Canvas Application', () => {
  it('does not draw when enabled is false', async () => {
    const fillTextMock = vi.fn();
    const mockCanvas = {
      width: 800,
      height: 600,
      getContext: vi.fn().mockReturnValue({
        save: vi.fn(),
        restore: vi.fn(),
        fillText: fillTextMock,
      }),
    } as unknown as HTMLCanvasElement;

    await applyWatermarkToCanvas(mockCanvas, {
      ...DEFAULT_WATERMARK_CONFIG,
      enabled: false,
    });

    expect(fillTextMock).not.toHaveBeenCalled();
  });

  it('draws single text watermark with 9-grid alignment', async () => {
    const fillTextMock = vi.fn();
    const mockCanvas = {
      width: 1000,
      height: 800,
      getContext: vi.fn().mockReturnValue({
        save: vi.fn(),
        restore: vi.fn(),
        fillText: fillTextMock,
      }),
    } as unknown as HTMLCanvasElement;

    const config: WatermarkConfig = {
      ...DEFAULT_WATERMARK_CONFIG,
      enabled: true,
      type: 'text',
      text: 'Photo by Johnny',
      position: 'bottom-right',
      color: '#FFD700',
    };

    await applyWatermarkToCanvas(mockCanvas, config);
    expect(fillTextMock).toHaveBeenCalledWith('Photo by Johnny', expect.any(Number), expect.any(Number));
  });

  it('renders tiled proof watermark across canvas when position is tiled', async () => {
    const fillTextMock = vi.fn();
    const rotateMock = vi.fn();
    const translateMock = vi.fn();

    const mockCanvas = {
      width: 1000,
      height: 800,
      getContext: vi.fn().mockReturnValue({
        save: vi.fn(),
        restore: vi.fn(),
        translate: translateMock,
        rotate: rotateMock,
        fillText: fillTextMock,
      }),
    } as unknown as HTMLCanvasElement;

    const config: WatermarkConfig = {
      ...DEFAULT_WATERMARK_CONFIG,
      enabled: true,
      type: 'text',
      text: 'PROOF 选片专用',
      position: 'tiled',
    };

    await applyWatermarkToCanvas(mockCanvas, config);
    expect(rotateMock).toHaveBeenCalled();
    expect(translateMock).toHaveBeenCalled();
    // 平铺模式下会在多个网格坐标循环调用 fillText
    expect(fillTextMock.mock.calls.length).toBeGreaterThan(10);
  });
});
