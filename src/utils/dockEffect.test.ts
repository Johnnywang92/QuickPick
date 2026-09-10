import { describe, it, expect } from 'vitest';
import { calculateDockScale } from './dockEffect';

describe('dockEffect utility', () => {
  it('returns identity scale when hoverContentX is null', () => {
    const result = calculateDockScale(null, 200);
    expect(result.scale).toBe(1.0);
    expect(result.factor).toBe(0);
    expect(result.zIndexBoost).toBe(0);
  });

  it('returns maximum scale and z-index boost when cursor is directly over card center', () => {
    const result = calculateDockScale(300, 300, { radius: 260, maxScale: 0.30 });
    expect(result.scale).toBeCloseTo(1.30, 4);
    expect(result.factor).toBeCloseTo(1.0, 4);
    expect(result.zIndexBoost).toBe(30);
  });

  it('returns identity scale when cursor is at or outside the radius', () => {
    const resultExact = calculateDockScale(560, 300, { radius: 260, maxScale: 0.30 });
    expect(resultExact.scale).toBe(1.0);
    expect(resultExact.factor).toBe(0);
    expect(resultExact.zIndexBoost).toBe(0);

    const resultFar = calculateDockScale(800, 300, { radius: 260, maxScale: 0.30 });
    expect(resultFar.scale).toBe(1.0);
    expect(resultFar.factor).toBe(0);
    expect(resultFar.zIndexBoost).toBe(0);
  });

  it('calculates smooth cosine falloff at intermediate distances', () => {
    // Halfway through the radius: dist = 130, radius = 260 -> dist/radius = 0.5
    // cos(0.5 * pi / 2) = cos(pi / 4) = sqrt(2)/2 ≈ 0.7071
    const result = calculateDockScale(430, 300, { radius: 260, maxScale: 0.30 });
    const expectedFactor = Math.cos(Math.PI / 4);
    expect(result.factor).toBeCloseTo(expectedFactor, 4);
    expect(result.scale).toBeCloseTo(1.0 + expectedFactor * 0.30, 4);
    expect(result.zIndexBoost).toBe(Math.round(expectedFactor * 30));
  });

  it('works symmetrically on both left and right sides of the card', () => {
    const leftResult = calculateDockScale(200, 300);
    const rightResult = calculateDockScale(400, 300);
    expect(leftResult.scale).toBeCloseTo(rightResult.scale, 4);
    expect(leftResult.factor).toBeCloseTo(rightResult.factor, 4);
    expect(leftResult.zIndexBoost).toBe(rightResult.zIndexBoost);
  });
});
