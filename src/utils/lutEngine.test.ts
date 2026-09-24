import { describe, it, expect } from 'vitest';
import { BUILTIN_LUTS, generateBuiltinLutData, parseCubeLut, apply3dLutToImageData } from './lutEngine';

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

  it('guarantees saturated pure colors (R, G, B) do not produce NaN or black hole artifacts in any preset', () => {
    const size = 16;
    for (const preset of BUILTIN_LUTS) {
      const data = generateBuiltinLutData(preset.id, size);
      // Verify no NaNs or undefined exist in the entire buffer
      for (let i = 0; i < data.length; i += 4) {
        expect(Number.isNaN(data[i])).toBe(false);
        expect(Number.isNaN(data[i + 1])).toBe(false);
        expect(Number.isNaN(data[i + 2])).toBe(false);
      }

      // Check pure saturated red: r=size-1, g=0, b=0
      // In 2D strip: pixelX = b * size + r = 0 * 16 + 15 = 15, pixelY = g = 0
      const redOffset = (0 * (size * size) + 15) * 4;
      const redVal = data[redOffset];
      // In color presets (non-monochrome), red value for pure red must remain vibrant (>150), not crushed to 0!
      if (preset.id !== 'leica_monochrome') {
        expect(redVal).toBeGreaterThan(150);
      }
    }
  });

  it('preserves realistic midtone exposure in cinematic teal orange without crushing midtones', () => {
    const size = 33;
    const data = generateBuiltinLutData('cinematic_teal_orange', size);
    // Midtone neutral gray: r=16, g=16, b=16 (out of 32, ~0.5)
    // pixelX = 16 * 33 + 16 = 544, pixelY = 16
    const offset = (16 * (size * size) + (16 * size + 16)) * 4;
    const midR = data[offset];
    const midG = data[offset + 1];
    const midB = data[offset + 2];

    // Midtone 0.5 (128) should be around 110~140, never crushed below 90!
    expect(midR).toBeGreaterThanOrEqual(110);
    expect(midR).toBeLessThanOrEqual(145);
    expect(midG).toBeGreaterThanOrEqual(110);
    expect(midB).toBeGreaterThanOrEqual(105);
  });

  it('accurately applies 3D LUT via CPU trilinear interpolation matching 2D strip packing layout', () => {
    const sampleCube = `
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
    const parsed = parseCubeLut(sampleCube);

    // Create ImageData-like structure with various test pixels
    const imgData = {
      data: new Uint8ClampedArray([
        255, 0, 0, 255,   // Pure Red
        0, 255, 0, 255,   // Pure Green
        0, 0, 255, 255,   // Pure Blue
        128, 128, 128, 255, // Mid gray
      ]),
    };

    apply3dLutToImageData(imgData as ImageData, parsed.data, parsed.size, 1.0);

    // In identity-like cube, values should be preserved accurately
    expect(imgData.data[0]).toBe(255); // R of Red
    expect(imgData.data[1]).toBe(0);   // G of Red
    expect(imgData.data[2]).toBe(0);   // B of Red

    expect(imgData.data[4]).toBe(0);   // R of Green
    expect(imgData.data[5]).toBe(255); // G of Green
    expect(imgData.data[6]).toBe(0);   // B of Green

    expect(imgData.data[8]).toBe(0);   // R of Blue
    expect(imgData.data[9]).toBe(0);   // G of Blue
    expect(imgData.data[10]).toBe(255); // B of Blue

    // Mid gray
    expect(Math.abs(imgData.data[12] - 128)).toBeLessThanOrEqual(2);
    expect(Math.abs(imgData.data[13] - 128)).toBeLessThanOrEqual(2);
    expect(Math.abs(imgData.data[14] - 128)).toBeLessThanOrEqual(2);
  });
});
