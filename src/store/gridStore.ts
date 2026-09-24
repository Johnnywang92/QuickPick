import { create } from 'zustand';
import { GridType, SpiralOrientation, GridColor, GRID_TYPE_METAS } from '../types/grid';

interface GridState {
  gridType: GridType;
  spiralOrientation: SpiralOrientation;
  gridColor: GridColor;
  opacity: number;
  showPowerPoints: boolean;
  hudMessage: string | null;

  // Actions
  setGridType: (type: GridType) => void;
  cycleGridType: () => void;
  cycleSpiralOrientation: () => void;
  setGridColor: (color: GridColor) => void;
  setOpacity: (opacity: number) => void;
  togglePowerPoints: () => void;
  showHud: (message: string) => void;
  clearHud: () => void;
}

const STORAGE_KEY = 'quickpick_composition_grid';

interface SavedGridPreferences {
  gridType?: GridType;
  spiralOrientation?: SpiralOrientation;
  gridColor?: GridColor;
  opacity?: number;
  showPowerPoints?: boolean;
}

function loadInitialPreferences(): SavedGridPreferences {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function savePreferences(state: Partial<SavedGridPreferences>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const current = loadInitialPreferences();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...state }));
  } catch {
    // Ignore storage errors
  }
}

const initialPrefs = loadInitialPreferences();

const GRID_ORDER: GridType[] = [
  'none',
  'thirds',
  'golden_spiral',
  'golden_ratio',
  'diagonal',
  'center',
];

let hudTimer: ReturnType<typeof setTimeout> | null = null;

export const useGridStore = create<GridState>((set, get) => ({
  gridType: initialPrefs.gridType || 'none',
  spiralOrientation: initialPrefs.spiralOrientation ?? 0,
  gridColor: initialPrefs.gridColor || 'gold',
  opacity: initialPrefs.opacity ?? 0.65,
  showPowerPoints: initialPrefs.showPowerPoints ?? true,
  hudMessage: null,

  setGridType: (type) => {
    set({ gridType: type });
    savePreferences({ gridType: type });
    const meta = GRID_TYPE_METAS.find((m) => m.id === type);
    if (meta && type !== 'none') {
      get().showHud(`📐 构图参考线：${meta.shortName} (按 O 切换)`);
    } else {
      get().showHud(`🚫 已关闭构图参考线`);
    }
  },

  cycleGridType: () => {
    const current = get().gridType;
    const currentIndex = GRID_ORDER.indexOf(current);
    const nextIndex = (currentIndex + 1) % GRID_ORDER.length;
    const nextType = GRID_ORDER[nextIndex];

    set({ gridType: nextType });
    savePreferences({ gridType: nextType });

    const meta = GRID_TYPE_METAS.find((m) => m.id === nextType);
    if (nextType === 'none') {
      get().showHud('🚫 已关闭构图参考线');
    } else if (nextType === 'golden_spiral') {
      get().showHud(`🌀 构图参考线：黄金螺旋 (按 Shift+O 旋转方向)`);
    } else if (meta) {
      get().showHud(`📐 构图参考线：${meta.shortName} (按 O 切换)`);
    }
  },

  cycleSpiralOrientation: () => {
    const state = get();
    // 如果当前未打开黄金螺旋，按 Shift+O 自动切到黄金螺旋并旋转
    const currentType = state.gridType;
    const nextOrientation = ((state.spiralOrientation + 1) % 4) as SpiralOrientation;

    if (currentType !== 'golden_spiral') {
      set({ gridType: 'golden_spiral', spiralOrientation: nextOrientation });
      savePreferences({ gridType: 'golden_spiral', spiralOrientation: nextOrientation });
      get().showHud(`🌀 黄金螺旋：方向 ${nextOrientation + 1}/4 (Shift+O 切换)`);
    } else {
      set({ spiralOrientation: nextOrientation });
      savePreferences({ spiralOrientation: nextOrientation });
      get().showHud(`🌀 黄金螺旋：方向 ${nextOrientation + 1}/4 (Shift+O 切换)`);
    }
  },

  setGridColor: (color) => {
    set({ gridColor: color });
    savePreferences({ gridColor: color });
  },

  setOpacity: (opacity) => {
    const clamped = Math.max(0.1, Math.min(1.0, opacity));
    set({ opacity: clamped });
    savePreferences({ opacity: clamped });
  },

  togglePowerPoints: () => {
    const next = !get().showPowerPoints;
    set({ showPowerPoints: next });
    savePreferences({ showPowerPoints: next });
    get().showHud(next ? '✨ 已显示黄金兴趣焦点 (Power Points)' : '⚪ 已隐藏兴趣焦点');
  },

  showHud: (message: string) => {
    if (hudTimer) {
      clearTimeout(hudTimer);
    }
    set({ hudMessage: message });
    hudTimer = setTimeout(() => {
      set({ hudMessage: null });
      hudTimer = null;
    }, 1400);
  },

  clearHud: () => {
    if (hudTimer) {
      clearTimeout(hudTimer);
      hudTimer = null;
    }
    set({ hudMessage: null });
  },
}));
