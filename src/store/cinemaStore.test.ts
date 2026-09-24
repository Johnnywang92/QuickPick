import { describe, it, expect, beforeEach } from 'vitest';
import { useCinemaStore } from './cinemaStore';

describe('cinemaStore', () => {
  beforeEach(() => {
    useCinemaStore.setState({
      isCinemaMode: false,
      isNativeFullscreen: false,
      isControlsVisible: true,
    });
  });

  it('initializes with cinema mode turned off', () => {
    const state = useCinemaStore.getState();
    expect(state.isCinemaMode).toBe(false);
    expect(state.isControlsVisible).toBe(true);
  });

  it('enters and exits cinema mode properly', () => {
    useCinemaStore.getState().enterCinemaMode();
    expect(useCinemaStore.getState().isCinemaMode).toBe(true);

    useCinemaStore.getState().exitCinemaMode();
    expect(useCinemaStore.getState().isCinemaMode).toBe(false);
  });

  it('toggles cinema mode back and forth', () => {
    useCinemaStore.getState().toggleCinemaMode();
    expect(useCinemaStore.getState().isCinemaMode).toBe(true);

    useCinemaStore.getState().toggleCinemaMode();
    expect(useCinemaStore.getState().isCinemaMode).toBe(false);
  });

  it('updates floating controls visibility', () => {
    useCinemaStore.getState().setControlsVisible(false);
    expect(useCinemaStore.getState().isControlsVisible).toBe(false);

    useCinemaStore.getState().setControlsVisible(true);
    expect(useCinemaStore.getState().isControlsVisible).toBe(true);
  });
});
