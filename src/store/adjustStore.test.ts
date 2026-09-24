import { describe, it, expect, beforeEach } from 'vitest';
import { useAdjustStore } from './adjustStore';
import { DEFAULT_ADJUSTMENTS } from '../types/adjust';

describe('adjustStore', () => {
  beforeEach(() => {
    useAdjustStore.getState().clearAllAdjustments();
    useAdjustStore.getState().resetFrameConfig();
    useAdjustStore.getState().setIsModalOpen(false);
  });

  it('updates modal open state and active tab', () => {
    expect(useAdjustStore.getState().isModalOpen).toBe(false);
    useAdjustStore.getState().setIsModalOpen(true);
    expect(useAdjustStore.getState().isModalOpen).toBe(true);
    useAdjustStore.getState().toggleModalOpen();
    expect(useAdjustStore.getState().isModalOpen).toBe(false);

    useAdjustStore.getState().setActiveTab('adjust');
    expect(useAdjustStore.getState().activeTab).toBe('adjust');
  });

  it('updates frame configuration and resets cleanly', () => {
    useAdjustStore.getState().updateFrameConfig({
      template: 'obsidian_black',
      customPhotographer: 'Johnny Studio',
    });

    expect(useAdjustStore.getState().frameConfig.template).toBe('obsidian_black');
    expect(useAdjustStore.getState().frameConfig.customPhotographer).toBe('Johnny Studio');

    useAdjustStore.getState().resetFrameConfig();
    expect(useAdjustStore.getState().frameConfig.template).toBe('classic_white');
    expect(useAdjustStore.getState().frameConfig.customPhotographer).toBe('');
  });

  it('manages individual photo adjustments and defaults', () => {
    const defaultVal = useAdjustStore.getState().getPhotoAdjustments('non-existent');
    expect(defaultVal).toEqual(DEFAULT_ADJUSTMENTS);

    useAdjustStore.getState().setPhotoAdjustments('photo-1', {
      exposure: 1.5,
      isBlackAndWhite: true,
    });

    const current = useAdjustStore.getState().getPhotoAdjustments('photo-1');
    expect(current.exposure).toBe(1.5);
    expect(current.isBlackAndWhite).toBe(true);
    expect(current.contrast).toBe(0);

    useAdjustStore.getState().resetPhotoAdjustments('photo-1');
    expect(useAdjustStore.getState().getPhotoAdjustments('photo-1')).toEqual(DEFAULT_ADJUSTMENTS);
  });

  it('supports copying, pasting, and batch applying adjustments', () => {
    useAdjustStore.getState().setPhotoAdjustments('photo-src', {
      exposure: 0.8,
      highlights: -20,
    });

    useAdjustStore.getState().copyCurrentAdjustments('photo-src');
    expect(useAdjustStore.getState().copiedAdjustments?.exposure).toBe(0.8);

    useAdjustStore.getState().pasteAdjustments('photo-dest');
    expect(useAdjustStore.getState().getPhotoAdjustments('photo-dest').exposure).toBe(0.8);
    expect(useAdjustStore.getState().getPhotoAdjustments('photo-dest').highlights).toBe(-20);

    useAdjustStore.getState().batchApplyAdjustments(['p1', 'p2'], {
      ...DEFAULT_ADJUSTMENTS,
      exposure: -0.5,
    });

    expect(useAdjustStore.getState().getPhotoAdjustments('p1').exposure).toBe(-0.5);
    expect(useAdjustStore.getState().getPhotoAdjustments('p2').exposure).toBe(-0.5);
  });

  it('manages custom frame templates lifecycle (save, apply, update, remove)', () => {
    const initialCount = useAdjustStore.getState().customTemplates.length;
    expect(initialCount).toBeGreaterThanOrEqual(1);

    // 1. 创建自定义模板
    const created = useAdjustStore.getState().saveCustomTemplate({
      name: '哈苏米黄纸',
      baseLayout: 'bottom_bar',
      bgColor: '#F4EDE4',
      badgeType: 'amber_lens',
      borderScale: 0.14,
      showCameraModel: true,
      showLens: true,
      showParams: true,
      showDate: false,
    });

    expect(created.id).toContain('custom_');
    expect(useAdjustStore.getState().customTemplates.length).toBe(initialCount + 1);

    // 2. 应用模板
    useAdjustStore.getState().applyCustomTemplate(created.id);
    expect(useAdjustStore.getState().frameConfig.template).toBe(created.id);
    expect(useAdjustStore.getState().frameConfig.borderScale).toBe(0.14);
    expect(useAdjustStore.getState().frameConfig.showDate).toBe(false);

    // 3. 更新模板
    useAdjustStore.getState().updateCustomTemplate(created.id, {
      name: '哈苏米黄纸 (改)',
      borderScale: 0.16,
    });
    const updated = useAdjustStore.getState().customTemplates.find((t) => t.id === created.id);
    expect(updated?.name).toBe('哈苏米黄纸 (改)');
    expect(updated?.borderScale).toBe(0.16);

    // 4. 保存当前配置为模板
    const fromCurrent = useAdjustStore.getState().saveCurrentAsTemplate('从当前生成');
    expect(fromCurrent.name).toBe('从当前生成');
    expect(useAdjustStore.getState().frameConfig.template).toBe(fromCurrent.id);

    // 5. 删除模板并验证重置
    useAdjustStore.getState().removeCustomTemplate(fromCurrent.id);
    expect(useAdjustStore.getState().customTemplates.find((t) => t.id === fromCurrent.id)).toBeUndefined();
    expect(useAdjustStore.getState().frameConfig.template).toBe('classic_white');
  });
});
