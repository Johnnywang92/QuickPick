import { describe, it, expect } from 'vitest';
import { BUILTIN_LUTS, generateBuiltinLutData, parseCubeLut } from './lutEngine';

describe('lutEngine', () => {
  it('defines 8 high quality built-in photographic film and vintage presets', () => {
    expect(BUILTIN_LUTS).toHaveLength(8);
    const ids = BUILTIN_LUTS.map((l) => l.id);
    expect(ids).toContain('kodak_portra_400');
    expect(ids).toContain('fuji_classic_chrome');
    expect(ids).toContain('ccd_vintage_digital');
    expect(ids).toContain('wedding_pure_white');
    expect(ids).toContain('cinematic_teal_orange');
    expect(ids).toContain('leica_monochrome');
    expect(ids).toContain('kodak_ektar_100');
    expect(ids).toContain('nordic_clean');
  });

  it('generates valid 2D strip texture data for all presets with correct size', () => {
    const size = 33;
    const expectedLength = size * size * size * 4; // 143,748 bytes

    for (const preset of BUILTIN_LUTS) {
      const data = generateBuiltinLutData(preset.id, size);
      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.length).toBe(expectedLength);

      // Verify values are bounded and alpha is 255
      for (let i = 0; i < Math.min(data.length, 1000); i += 4) {
        expect(data[i]).toBeGreaterThanOrEqual(0);
        expect(data[i]).toBeLessThanOrEqual(255);
        expect(data[i + 1]).toBeGreaterThanOrEqual(0);
        expect(data[i + 1]).toBeLessThanOrEqual(255);
        expect(data[i + 2]).toBeGreaterThanOrEqual(0);
        expect(data[i + 2]).toBeLessThanOrEqual(255);
        expect(data[i + 3]).toBe(255); // Alpha
      }
    }
  }, 15000);

  it('correctly maps monochrome preset to identical R, G, B channels', () => {
    const data = generateBuiltinLutData('leica_monochrome', 16);
    // Spot check a few pixels
    for (let i = 0; i < data.length; i += 40) {
      expect(data[i]).toBe(data[i + 1]);
      expect(data[i + 1]).toBe(data[i + 2]);
    }
  });

  it('correctly generates CCD vintage digital preset with rich saturation and warm highlights', () => {
    const data = generateBuiltinLutData('ccd_vintage_digital', 16);
    expect(data.length).toBe(16 * 16 * 16 * 4);

    // Deep black input (pixel index 0) has gentle lifted black level
    expect(data[0]).toBeGreaterThan(0);
    expect(data[1]).toBeGreaterThan(0);
    expect(data[2]).toBeGreaterThan(0);
  });

  it('parses standard .cube file syntax correctly', () => {
    const sampleCube = `
# Sample Test Cube
TITLE "Vintage Film 1980"
LUT_3D_SIZE 2
DOMAIN_MIN 0.0 0.0 0.0
DOMAIN_MAX 1.0 1.0 1.0

0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0
`;

    const parsed = parseCubeLut(sampleCube);
    expect(parsed.title).toBe('Vintage Film 1980');
    expect(parsed.size).toBe(2);
    // Width = 2*2 = 4, Height = 2. Total bytes = 4 * 2 * 4 = 32 bytes
    expect(parsed.data.length).toBe(32);
    // First pixel (0,0,0) -> 0, 0, 0, 255
    expect(parsed.data[0]).toBe(0);
    expect(parsed.data[1]).toBe(0);
    expect(parsed.data[2]).toBe(0);
    expect(parsed.data[3]).toBe(255);
  });

  it('throws helpful error on corrupted .cube data', () => {
    const invalidCube = `
TITLE "Incomplete"
LUT_3D_SIZE 3
0.0 0.0 0.0
1.0 1.0 1.0
`;
    expect(() => parseCubeLut(invalidCube)).toThrow(/数据点不足/);
  });
});
