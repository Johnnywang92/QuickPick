import { create } from 'zustand';
import {
  DEFAULT_ADJUSTMENTS,
  DEFAULT_FRAME_CONFIG,
  DEFAULT_WATERMARK_CONFIG,
  FrameConfig,
  PhotoAdjustments,
  WatermarkConfig,
} from '../types/adjust';

interface AdjustStoreState {
  // 弹窗工作台状态
  isModalOpen: boolean;
  activeTab: 'frame' | 'adjust' | 'watermark';
  setIsModalOpen: (open: boolean) => void;
  toggleModalOpen: () => void;
  setActiveTab: (tab: 'frame' | 'adjust' | 'watermark') => void;

  // 相框全局偏好配置
  frameConfig: FrameConfig;
  updateFrameConfig: (updates: Partial<FrameConfig>) => void;
  resetFrameConfig: () => void;

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
  activeTab: 'frame',
  setIsModalOpen: (open) => set({ isModalOpen: open }),
  toggleModalOpen: () => set((state) => ({ isModalOpen: !state.isModalOpen })),
  setActiveTab: (tab) => set({ activeTab: tab }),

  frameConfig: { ...DEFAULT_FRAME_CONFIG },
  updateFrameConfig: (updates) =>
    set((state) => ({
      frameConfig: { ...state.frameConfig, ...updates },
    })),
  resetFrameConfig: () => set({ frameConfig: { ...DEFAULT_FRAME_CONFIG } }),

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
