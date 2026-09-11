import { create } from 'zustand';
import { parseCubeLut } from '../utils/lutPresets';

export interface CustomLutItem {
  id: string;
  name: string;
  size: number;
  dataBase64: string; // Base64 编码的 Uint8Array 贴图数据，方便序列化
}

export interface PhotoLutConfig {
  lutId: string;
  intensity: number;
}

interface LutState {
  activeLutId: string | null;
  isEnabled: boolean;
  intensity: number; // 0.0 ~ 1.0
  isBypassComparing: boolean;
  isPanelOpen: boolean;
  customLuts: CustomLutItem[];
  photoLuts: Record<string, PhotoLutConfig>;
  hoverLutId: string | null;

  // Actions
  setActiveLutId: (id: string | null) => void;
  setHoverLutId: (id: string | null) => void;
  toggleEnabled: () => void;
  setIntensity: (intensity: number) => void;
  setIsBypassComparing: (comparing: boolean) => void;
  setIsPanelOpen: (open: boolean) => void;
  togglePanelOpen: () => void;
  importCubeContent: (content: string, fileName?: string) => string;
  removeCustomLut: (id: string) => void;
  getCustomLutData: (id: string) => { size: number; data: Uint8Array } | null;
  getEffectiveIntensity: () => number;

  // 单片及批量管理 Actions
  setPhotoLut: (photoId: string, lutId: string | null, intensity?: number) => void;
  getPhotoLut: (photoId: string | null | undefined) => PhotoLutConfig | null;
  batchApplyLut: (photoIds: string[], lutId: string, intensity?: number) => void;
  clearPhotoLut: (photoId: string) => void;
  clearAllPhotoLuts: () => void;
}

const STORAGE_KEY_LUT = 'quickpick_lut_settings_v1';
const STORAGE_KEY_CUSTOM_LUTS = 'quickpick_custom_luts_v1';
const STORAGE_KEY_PHOTO_LUTS = 'quickpick_photo_luts_v1';

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = window.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// 读取持久化设置
function loadInitialSettings(): { activeLutId: string | null; isEnabled: boolean; intensity: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LUT);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        activeLutId: parsed.activeLutId ?? null,
        isEnabled: parsed.isEnabled ?? true,
        intensity: typeof parsed.intensity === 'number' ? parsed.intensity : 0.85,
      };
    }
  } catch {
    // 忽略异常
  }
  return { activeLutId: null, isEnabled: true, intensity: 0.85 };
}

function loadInitialCustomLuts(): CustomLutItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_LUTS);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    }
  } catch {
    // 忽略异常
  }
  return [];
}

function loadInitialPhotoLuts(): Record<string, PhotoLutConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PHOTO_LUTS);
    if (raw) {
      const map = JSON.parse(raw);
      if (typeof map === 'object' && map !== null) return map;
    }
  } catch {
    // 忽略异常
  }
  return {};
}

const initialSettings = loadInitialSettings();

export const useLutStore = create<LutState>((set, get) => ({
  activeLutId: initialSettings.activeLutId,
  isEnabled: initialSettings.isEnabled,
  intensity: initialSettings.intensity,
  isBypassComparing: false,
  isPanelOpen: false,
  customLuts: loadInitialCustomLuts(),
  photoLuts: loadInitialPhotoLuts(),
  hoverLutId: null,

  setActiveLutId: (id) => {
    const isEnabled = id !== null ? true : get().isEnabled;
    set({ activeLutId: id, isEnabled, hoverLutId: null });
    const { intensity } = get();
    try {
      localStorage.setItem(
        STORAGE_KEY_LUT,
        JSON.stringify({ activeLutId: id, isEnabled, intensity }),
      );
    } catch {
      // 忽略
    }
  },

  setHoverLutId: (id) => set({ hoverLutId: id }),

  toggleEnabled: () => {
    const next = !get().isEnabled;
    set({ isEnabled: next });
    const { activeLutId, intensity } = get();
    try {
      localStorage.setItem(
        STORAGE_KEY_LUT,
        JSON.stringify({ activeLutId, isEnabled: next, intensity }),
      );
    } catch {
      // 忽略
    }
  },

  setIntensity: (intensity) => {
    const clamped = Math.max(0, Math.min(1, intensity));
    set({ intensity: clamped });
    const { activeLutId, isEnabled } = get();
    try {
      localStorage.setItem(
        STORAGE_KEY_LUT,
        JSON.stringify({ activeLutId, isEnabled, intensity: clamped }),
      );
    } catch {
      // 忽略
    }
  },

  setIsBypassComparing: (comparing) => set({ isBypassComparing: comparing }),
  setIsPanelOpen: (open) => set({ isPanelOpen: open }),
  togglePanelOpen: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),

  importCubeContent: (content, fileName) => {
    const parsed = parseCubeLut(content);
    const cleanName = parsed.title || (fileName ? fileName.replace(/\.cube$/i, '') : '导入 LUT');
    const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const base64 = uint8ToBase64(parsed.data);

    const newItem: CustomLutItem = {
      id,
      name: cleanName,
      size: parsed.size,
      dataBase64: base64,
    };

    const nextList = [...get().customLuts, newItem];
    set({ customLuts: nextList, activeLutId: id, isEnabled: true });

    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM_LUTS, JSON.stringify(nextList));
      const { intensity } = get();
      localStorage.setItem(
        STORAGE_KEY_LUT,
        JSON.stringify({ activeLutId: id, isEnabled: true, intensity }),
      );
    } catch {
      // 忽略
    }

    return id;
  },

  removeCustomLut: (id) => {
    const nextList = get().customLuts.filter((l) => l.id !== id);
    const updates: Partial<LutState> = { customLuts: nextList };
    if (get().activeLutId === id) {
      updates.activeLutId = null;
    }
    set(updates);
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM_LUTS, JSON.stringify(nextList));
    } catch {
      // 忽略
    }
  },

  getCustomLutData: (id) => {
    const item = get().customLuts.find((l) => l.id === id);
    if (!item) return null;
    try {
      const data = base64ToUint8(item.dataBase64);
      return { size: item.size, data };
    } catch {
      return null;
    }
  },

  getEffectiveIntensity: () => {
    const { activeLutId, isEnabled, intensity, isBypassComparing } = get();
    if (!activeLutId || !isEnabled || isBypassComparing) {
      return 0.0;
    }
    return intensity;
  },

  setPhotoLut: (photoId, lutId, intensity) => {
    if (!photoId) return;
    const current = { ...get().photoLuts };
    if (!lutId) {
      delete current[photoId];
    } else {
      const targetIntensity = typeof intensity === 'number' ? intensity : get().intensity;
      current[photoId] = { lutId, intensity: targetIntensity };
    }
    set({ photoLuts: current, hoverLutId: null });
    try {
      localStorage.setItem(STORAGE_KEY_PHOTO_LUTS, JSON.stringify(current));
    } catch {
      // 忽略
    }
  },

  getPhotoLut: (photoId) => {
    if (!photoId) return null;
    return get().photoLuts[photoId] || null;
  },

  batchApplyLut: (photoIds, lutId, intensity) => {
    if (!photoIds || photoIds.length === 0 || !lutId) return;
    const current = { ...get().photoLuts };
    const targetIntensity = typeof intensity === 'number' ? intensity : get().intensity;
    for (const id of photoIds) {
      current[id] = { lutId, intensity: targetIntensity };
    }
    set({ photoLuts: current });
    try {
      localStorage.setItem(STORAGE_KEY_PHOTO_LUTS, JSON.stringify(current));
    } catch {
      // 忽略
    }
  },

  clearPhotoLut: (photoId) => {
    if (!photoId) return;
    const current = { ...get().photoLuts };
    delete current[photoId];
    set({ photoLuts: current });
    try {
      localStorage.setItem(STORAGE_KEY_PHOTO_LUTS, JSON.stringify(current));
    } catch {
      // 忽略
    }
  },

  clearAllPhotoLuts: () => {
    set({ photoLuts: {} });
    try {
      localStorage.removeItem(STORAGE_KEY_PHOTO_LUTS);
    } catch {
      // 忽略
    }
  },
}));
