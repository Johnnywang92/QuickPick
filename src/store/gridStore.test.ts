import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGridStore } from './gridStore';

describe('gridStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useGridStore.setState({
      gridType: 'none',
      spiralOrientation: 0,
      gridColor: 'gold',
      opacity: 0.65,
      showPowerPoints: true,
      hudMessage: null,
    });
    vi.useFakeTimers();
  });

  it('cycles grid types in correct sequence', () => {
    const store = useGridStore.getState();
    expect(store.gridType).toBe('none');

    store.cycleGridType();
    expect(useGridStore.getState().gridType).toBe('thirds');
    expect(useGridStore.getState().hudMessage).toContain('三分法');

    store.cycleGridType();
    expect(useGridStore.getState().gridType).toBe('golden_spiral');
    expect(useGridStore.getState().hudMessage).toContain('黄金螺旋');

    store.cycleGridType();
    expect(useGridStore.getState().gridType).toBe('golden_ratio');

    store.cycleGridType();
    expect(useGridStore.getState().gridType).toBe('diagonal');

    store.cycleGridType();
    expect(useGridStore.getState().gridType).toBe('center');

    store.cycleGridType();
    expect(useGridStore.getState().gridType).toBe('none');
    expect(useGridStore.getState().hudMessage).toContain('已关闭');
  });

  it('rotates spiral orientation and sets grid to golden_spiral if not active', () => {
    const store = useGridStore.getState();
    expect(store.gridType).toBe('none');

    store.cycleSpiralOrientation();
    expect(useGridStore.getState().gridType).toBe('golden_spiral');
    expect(useGridStore.getState().spiralOrientation).toBe(1);

    store.cycleSpiralOrientation();
    expect(useGridStore.getState().spiralOrientation).toBe(2);

    store.cycleSpiralOrientation();
    expect(useGridStore.getState().spiralOrientation).toBe(3);

    store.cycleSpiralOrientation();
    expect(useGridStore.getState().spiralOrientation).toBe(0);
  });

  it('sets opacity and grid color with bounds checking', () => {
    const store = useGridStore.getState();

    store.setOpacity(1.5);
    expect(useGridStore.getState().opacity).toBe(1.0);

    store.setOpacity(-0.5);
    expect(useGridStore.getState().opacity).toBe(0.1);

    store.setGridColor('cyan');
    expect(useGridStore.getState().gridColor).toBe('cyan');
  });

  it('toggles power points and handles HUD timers', () => {
    const store = useGridStore.getState();
    expect(store.showPowerPoints).toBe(true);

    store.togglePowerPoints();
    expect(useGridStore.getState().showPowerPoints).toBe(false);
    expect(useGridStore.getState().hudMessage).toContain('已隐藏');

    vi.advanceTimersByTime(1500);
    expect(useGridStore.getState().hudMessage).toBeNull();
  });
});
