import { describe, it, expect, beforeEach } from 'vitest';
import { useLutStore } from './lutStore';

describe('lutStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useLutStore.setState({
      activeLutId: null,
      isEnabled: true,
      intensity: 0.85,
      isBypassComparing: false,
      isPanelOpen: false,
      customLuts: [],
    });
  });

  it('initializes with default state and effective intensity 0 when no LUT selected', () => {
    const state = useLutStore.getState();
    expect(state.activeLutId).toBeNull();
    expect(state.isEnabled).toBe(true);
    expect(state.getEffectiveIntensity()).toBe(0.0);
  });

  it('updates active LUT and calculates effective intensity', () => {
    const { setActiveLutId, setIntensity } = useLutStore.getState();
    setActiveLutId('kodak_portra_400');
    setIntensity(0.75);

    expect(useLutStore.getState().activeLutId).toBe('kodak_portra_400');
    expect(useLutStore.getState().getEffectiveIntensity()).toBe(0.75);
  });

  it('returns 0 effective intensity when bypassed or disabled', () => {
    const { setActiveLutId, toggleEnabled, setIsBypassComparing } = useLutStore.getState();
    setActiveLutId('kodak_portra_400');

    // Bypass compare
    setIsBypassComparing(true);
    expect(useLutStore.getState().getEffectiveIntensity()).toBe(0.0);
    setIsBypassComparing(false);
    expect(useLutStore.getState().getEffectiveIntensity()).toBe(0.85);

    // Disable
    toggleEnabled();
    expect(useLutStore.getState().isEnabled).toBe(false);
    expect(useLutStore.getState().getEffectiveIntensity()).toBe(0.0);
  });

  it('clamps intensity between 0 and 1', () => {
    const { setIntensity } = useLutStore.getState();
    setIntensity(1.5);
    expect(useLutStore.getState().intensity).toBe(1.0);
    setIntensity(-0.2);
    expect(useLutStore.getState().intensity).toBe(0.0);
  });

  it('imports custom .cube content and allows retrieval', () => {
    const mockCube = `
TITLE "Studio Glow"
LUT_3D_SIZE 2
0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0
`;
    const id = useLutStore.getState().importCubeContent(mockCube, 'my_lut.cube');
    expect(id).toContain('custom_');

    const state = useLutStore.getState();
    expect(state.activeLutId).toBe(id);
    expect(state.customLuts).toHaveLength(1);
    expect(state.customLuts[0].name).toBe('Studio Glow');

    const recovered = state.getCustomLutData(id);
    expect(recovered).not.toBeNull();
    expect(recovered?.size).toBe(2);
    expect(recovered?.data.length).toBe(32);

    // Remove
    state.removeCustomLut(id);
    expect(useLutStore.getState().customLuts).toHaveLength(0);
    expect(useLutStore.getState().activeLutId).toBeNull();
  });
});
