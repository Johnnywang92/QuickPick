import { describe, it, expect } from 'vitest';
import {
  getStorylinePreset,
  getAllStorylinePresets,
  distributeTargetGoalAcrossChapters,
} from './storylinePresets';

describe('storylinePresets', () => {
  it('should provide all 7 photography workflow presets', () => {
    const presets = getAllStorylinePresets();
    expect(presets).toHaveLength(7);
    const ids = presets.map((p) => p.id);
    expect(ids).toContain('wedding');
    expect(ids).toContain('family');
    expect(ids).toContain('conference');
    expect(ids).toContain('concert');
    expect(ids).toContain('cosplay');
    expect(ids).toContain('travel');
    expect(ids).toContain('general');
  });

  it('should retrieve preset by id or fallback to general', () => {
    const wedding = getStorylinePreset('wedding');
    expect(wedding.name).toBe('婚礼纪实');
    expect(wedding.chapters.length).toBeGreaterThan(0);
    expect(wedding.roles.length).toBeGreaterThan(0);

    const fallback = getStorylinePreset('unknown_preset_id');
    expect(fallback.id).toBe('general');
  });

  it('should accurately distribute total target goal across chapters', () => {
    // 5 chapters, totalGoal = 100
    const quotas = distributeTargetGoalAcrossChapters(5, 100);
    expect(quotas).toHaveLength(5);
    const sum = quotas.reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);

    // With custom weights
    const weightedQuotas = distributeTargetGoalAcrossChapters(3, 50, [10, 20, 20]);
    expect(weightedQuotas).toHaveLength(3);
    const weightedSum = weightedQuotas.reduce((a, b) => a + b, 0);
    expect(weightedSum).toBe(50);
    expect(weightedQuotas[0]).toBeLessThan(weightedQuotas[1]);

    // Edge cases
    expect(distributeTargetGoalAcrossChapters(0, 50)).toEqual([]);
    expect(distributeTargetGoalAcrossChapters(1, 42)).toEqual([42]);

    const skewedQuotas = distributeTargetGoalAcrossChapters(3, 10, [100, 1, 1]);
    expect(skewedQuotas.reduce((a, b) => a + b, 0)).toBe(10);
    expect(skewedQuotas.every((quota) => quota >= 0)).toBe(true);

    const goalBelowChapterCount = distributeTargetGoalAcrossChapters(5, 2);
    expect(goalBelowChapterCount.reduce((a, b) => a + b, 0)).toBe(2);
  });
});
