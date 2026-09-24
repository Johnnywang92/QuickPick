import { create } from 'zustand';
import {
  CustomFrameTemplate,
  DEFAULT_ADJUSTMENTS,
  DEFAULT_FRAME_CONFIG,
  DEFAULT_WATERMARK_CONFIG,
  FrameConfig,
  PhotoAdjustments,
  WatermarkConfig,
  WorkbenchTab,
} from '../types/adjust';

export const DEFAULT_CUSTOM_FRAME_TEMPLATES: CustomFrameTemplate[] = [
  {
    id: 'custom_warm_paper',
    name: '暖纸画廊',
    desc: '典雅米黄艺术纸 · 琥珀十字对焦微标 · 宽厚留白',
    baseLayout: 'bottom_bar',
    bgColor: '#F4EDE4',
    isDark: false,
    badgeType: 'amber_lens',
    borderScale: 0.12,
    showCameraModel: true,
    showLens: true,
    showParams: true,
    showDate: true,
    createdAt: 1710000000000,
  },
  {
    id: 'custom_slate_grey',
    name: '石板灰调',
    desc: '哑光石板深灰 · 旁轴取景微标 · 沉稳冷峻',
    baseLayout: 'bottom_bar',
    bgColor: '#1E293B',
    isDark: true,
    badgeType: 'rangefinder',
    borderScale: 0.1,
    showCameraModel: true,
    showLens: true,
    showParams: true,
    showDate: true,
    createdAt: 1710000001000,
  },
  {
    id: 'custom_minimal_pure',
    name: '极简无标',
    desc: '纯白窄边 · 纯文本极简排版 · 突出摄影本体',
    baseLayout: 'bottom_bar',
    bgColor: '#FFFFFF',
    isDark: false,
    badgeType: 'none',
    borderScale: 0.08,
    showCameraModel: true,
    showLens: true,
    showParams: true,
    showDate: true,
    createdAt: 1710000002000,
  },
];

const STORAGE_KEY_CUSTOM_TEMPLATES = 'quickpick_custom_frame_templates';

function loadStoredCustomTemplates(): CustomFrameTemplate[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_CUSTOM_FRAME_TEMPLATES;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_TEMPLATES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to load custom frame templates from localStorage:', err);
  }
  return DEFAULT_CUSTOM_FRAME_TEMPLATES;
}

function persistCustomTemplates(templates: CustomFrameTemplate[]) {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM_TEMPLATES, JSON.stringify(templates));
    } catch (err) {
      console.warn('Failed to persist custom frame templates to localStorage:', err);
    }
  }
}

interface AdjustStoreState {
  // 弹窗工作台状态
  isModalOpen: boolean;
  activeTab: WorkbenchTab;
  setIsModalOpen: (open: boolean) => void;
  toggleModalOpen: () => void;
  openModal: (tab?: WorkbenchTab) => void;
  setActiveTab: (tab: WorkbenchTab) => void;

  // 相框全局偏好配置
  frameConfig: FrameConfig;
  updateFrameConfig: (updates: Partial<FrameConfig>) => void;
  resetFrameConfig: () => void;

  // 用户自定义相框模板
  customTemplates: CustomFrameTemplate[];
  saveCustomTemplate: (
    template: Omit<CustomFrameTemplate, 'id' | 'createdAt'> & { id?: string },
  ) => CustomFrameTemplate;
  saveCurrentAsTemplate: (
    name: string,
    overrides?: Partial<CustomFrameTemplate>,
  ) => CustomFrameTemplate;
  updateCustomTemplate: (id: string, updates: Partial<CustomFrameTemplate>) => void;
  removeCustomTemplate: (id: string) => void;
  applyCustomTemplate: (id: string) => void;

  // 水印与个性化签名配置
  watermarkConfig: WatermarkConfig;
  updateWatermarkConfig: (updates: Partial<WatermarkConfig>) => void;
  resetWatermarkConfig: () => void;

  // 每张照片的微调参数
  photoAdjustments: Record<string, PhotoAdjustments>;
  getPhotoAdjustments: (photoId?: string | null) => PhotoAdjustments;
  setPhotoAdjustments: (photoId: string, updates: Partial<PhotoAdjustments>) => void;
  resetPhotoAdjustments: (photoId: string) => void;

  // 复制/粘贴与批量应用
  copiedAdjustments: PhotoAdjustments | null;
  copyCurrentAdjustments: (photoId: string) => void;
  pasteAdjustments: (photoId: string) => void;
  batchApplyAdjustments: (photoIds: string[], adjustments: PhotoAdjustments) => void;
  clearAllAdjustments: () => void;
}

export const useAdjustStore = create<AdjustStoreState>((set, get) => ({
  isModalOpen: false,
  activeTab: 'adjust',
  setIsModalOpen: (open) => set({ isModalOpen: open }),
  toggleModalOpen: () => set((state) => ({ isModalOpen: !state.isModalOpen })),
  openModal: (tab) => set((state) => ({ isModalOpen: true, activeTab: tab ?? state.activeTab })),
  setActiveTab: (tab) => set({ activeTab: tab }),

  frameConfig: { ...DEFAULT_FRAME_CONFIG },
  updateFrameConfig: (updates) =>
    set((state) => ({
      frameConfig: { ...state.frameConfig, ...updates },
    })),
  resetFrameConfig: () => set({ frameConfig: { ...DEFAULT_FRAME_CONFIG } }),

  customTemplates: loadStoredCustomTemplates(),
  saveCustomTemplate: (template) => {
    const state = get();
    const id = template.id || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newTpl: CustomFrameTemplate = {
      ...template,
      id,
      createdAt: Date.now(),
    };
    const nextTemplates = [newTpl, ...state.customTemplates.filter((t) => t.id !== id)];
    persistCustomTemplates(nextTemplates);
    set({ customTemplates: nextTemplates });
    return newTpl;
  },
  saveCurrentAsTemplate: (name, overrides) => {
    const state = get();
    const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const currentTpl = state.frameConfig.template;
    const isPolaroid = currentTpl === 'retro_polaroid' || currentTpl === 'polaroid';
    const isCinema = currentTpl === 'cinematic_scope';
    const isOverlay = currentTpl === 'overlay_badge';

    const baseLayout = overrides?.baseLayout || (isCinema ? 'cinematic' : isPolaroid ? 'polaroid' : isOverlay ? 'overlay_badge' : 'bottom_bar');
    const bgColor = overrides?.bgColor || (currentTpl === 'obsidian_black' ? '#0F1013' : currentTpl === 'amber_minimal' ? '#FBFBFA' : '#FFFFFF');
    const badgeType = overrides?.badgeType || (currentTpl === 'amber_minimal' ? 'amber_lens' : currentTpl === 'obsidian_black' ? 'rangefinder' : 'aperture');

    const newTpl: CustomFrameTemplate = {
      id,
      name: name.trim() || '未命名相框',
      desc: overrides?.desc || '个性化相框排版模板',
      baseLayout,
      bgColor,
      badgeType,
      borderScale: state.frameConfig.borderScale || 0.1,
      showCameraModel: state.frameConfig.showCameraModel,
      showLens: state.frameConfig.showLens,
      showParams: state.frameConfig.showParams,
      showDate: state.frameConfig.showDate,
      customPhotographer: state.frameConfig.customPhotographer,
      customCameraModel: state.frameConfig.customCameraModel,
      customLens: state.frameConfig.customLens,
      createdAt: Date.now(),
      ...overrides,
    };

    const nextTemplates = [newTpl, ...state.customTemplates];
    persistCustomTemplates(nextTemplates);
    set({
      customTemplates: nextTemplates,
      frameConfig: {
        ...state.frameConfig,
        template: id,
        borderScale: newTpl.borderScale,
        showCameraModel: newTpl.showCameraModel,
        showLens: newTpl.showLens,
        showParams: newTpl.showParams,
        showDate: newTpl.showDate,
      },
    });
    return newTpl;
  },
  updateCustomTemplate: (id, updates) => {
    set((state) => {
      const nextTemplates = state.customTemplates.map((t) =>
        t.id === id ? { ...t, ...updates } : t,
      );
      persistCustomTemplates(nextTemplates);
      return { customTemplates: nextTemplates };
    });
  },
  removeCustomTemplate: (id) => {
    set((state) => {
      const nextTemplates = state.customTemplates.filter((t) => t.id !== id);
      persistCustomTemplates(nextTemplates);
      const isCurrentActive = state.frameConfig.template === id;
      return {
        customTemplates: nextTemplates,
        frameConfig: isCurrentActive
          ? { ...state.frameConfig, template: 'classic_white' }
          : state.frameConfig,
      };
    });
  },
  applyCustomTemplate: (id) => {
    const tpl = get().customTemplates.find((t) => t.id === id);
    if (!tpl) return;
    set((state) => ({
      frameConfig: {
        ...state.frameConfig,
        template: tpl.id,
        borderScale: tpl.borderScale,
        showCameraModel: tpl.showCameraModel,
        showLens: tpl.showLens,
        showParams: tpl.showParams,
        showDate: tpl.showDate,
        customPhotographer: tpl.customPhotographer ?? state.frameConfig.customPhotographer,
        customCameraModel: tpl.customCameraModel ?? state.frameConfig.customCameraModel,
        customLens: tpl.customLens ?? state.frameConfig.customLens,
      },
    }));
  },

  watermarkConfig: { ...DEFAULT_WATERMARK_CONFIG },
  updateWatermarkConfig: (updates) =>
    set((state) => ({
      watermarkConfig: { ...state.watermarkConfig, ...updates },
    })),
  resetWatermarkConfig: () => set({ watermarkConfig: { ...DEFAULT_WATERMARK_CONFIG } }),

  photoAdjustments: {},
  getPhotoAdjustments: (photoId) => {
    if (!photoId) return { ...DEFAULT_ADJUSTMENTS };
    return get().photoAdjustments[photoId] || { ...DEFAULT_ADJUSTMENTS };
  },
  setPhotoAdjustments: (photoId, updates) => {
    set((state) => {
      const current = state.photoAdjustments[photoId] || { ...DEFAULT_ADJUSTMENTS };
      return {
        photoAdjustments: {
          ...state.photoAdjustments,
          [photoId]: { ...current, ...updates },
        },
      };
    });
  },
  resetPhotoAdjustments: (photoId) => {
    set((state) => {
      const next = { ...state.photoAdjustments };
      delete next[photoId];
      return { photoAdjustments: next };
    });
  },

  copiedAdjustments: null,
  copyCurrentAdjustments: (photoId) => {
    const adj = get().getPhotoAdjustments(photoId);
    set({ copiedAdjustments: { ...adj } });
  },
  pasteAdjustments: (photoId) => {
    const copied = get().copiedAdjustments;
    if (copied) {
      get().setPhotoAdjustments(photoId, { ...copied });
    }
  },
  batchApplyAdjustments: (photoIds, adjustments) => {
    set((state) => {
      const next = { ...state.photoAdjustments };
      for (const id of photoIds) {
        next[id] = { ...adjustments };
      }
      return { photoAdjustments: next };
    });
  },
  clearAllAdjustments: () => set({ photoAdjustments: {} }),
}));
