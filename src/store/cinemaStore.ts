import { create } from 'zustand';
import { isTauri } from '../services/tauriBridge';

interface CinemaState {
  isCinemaMode: boolean;
  isNativeFullscreen: boolean;
  isControlsVisible: boolean;

  // Actions
  enterCinemaMode: () => void;
  exitCinemaMode: () => void;
  toggleCinemaMode: () => void;
  setControlsVisible: (visible: boolean) => void;
  toggleNativeFullscreen: () => Promise<void>;
}

export const useCinemaStore = create<CinemaState>((set) => ({
  isCinemaMode: false,
  isNativeFullscreen: false,
  isControlsVisible: true,

  enterCinemaMode: () => set({ isCinemaMode: true, isControlsVisible: true }),
  exitCinemaMode: () => set({ isCinemaMode: false }),
  toggleCinemaMode: () =>
    set((state) => ({
      isCinemaMode: !state.isCinemaMode,
      isControlsVisible: true,
    })),
  setControlsVisible: (visible: boolean) => set({ isControlsVisible: visible }),

  toggleNativeFullscreen: async () => {
    if (isTauri()) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        const current = await win.isFullscreen();
        await win.setFullscreen(!current);
        set({ isNativeFullscreen: !current });
      } catch (err) {
        console.warn('切换原生全屏失败:', err);
      }
    } else if (typeof document !== 'undefined') {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
          set({ isNativeFullscreen: true });
        } else {
          await document.exitFullscreen();
          set({ isNativeFullscreen: false });
        }
      } catch (err) {
        console.warn('Web Fullscreen API 切换失败:', err);
      }
    }
  },
}));
