import { create } from 'zustand';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeStore {
  themeMode: ThemeMode;
  effectiveTheme: 'dark' | 'light';
  isSettingsOpen: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setSettingsOpen: (open: boolean) => void;
  initTheme: () => void;
}

const STORAGE_KEY = 'quickpick_theme_mode';

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function resolveEffectiveTheme(mode: ThemeMode): 'dark' | 'light' {
  if (mode === 'system') return getSystemTheme();
  return mode;
}

function applyThemeToDOM(effectiveTheme: 'dark' | 'light'): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (effectiveTheme === 'light') {
    root.classList.add('theme-light');
    root.classList.remove('dark');
  } else {
    root.classList.remove('theme-light');
    root.classList.add('dark');
  }
}

let mediaQueryListenerAttached = false;

export const useThemeStore = create<ThemeStore>((set, get) => ({
  themeMode: 'dark',
  effectiveTheme: 'dark',
  isSettingsOpen: false,

  setThemeMode: (mode: ThemeMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // 容错处理无 localStorage 权限环境
    }
    const effectiveTheme = resolveEffectiveTheme(mode);
    applyThemeToDOM(effectiveTheme);
    set({ themeMode: mode, effectiveTheme });
  },

  setSettingsOpen: (open: boolean) => {
    set({ isSettingsOpen: open });
  },

  initTheme: () => {
    let savedMode: ThemeMode = 'dark';
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'dark' || stored === 'light' || stored === 'system') {
        savedMode = stored;
      }
    } catch {
      // ignore
    }

    const effective = resolveEffectiveTheme(savedMode);
    applyThemeToDOM(effective);
    set({ themeMode: savedMode, effectiveTheme: effective });

    if (
      !mediaQueryListenerAttached &&
      typeof window !== 'undefined' &&
      window.matchMedia
    ) {
      const mql = window.matchMedia('(prefers-color-scheme: light)');
      const listener = () => {
        if (get().themeMode === 'system') {
          const next = getSystemTheme();
          applyThemeToDOM(next);
          set({ effectiveTheme: next });
        }
      };

      if (mql.addEventListener) {
        mql.addEventListener('change', listener);
      } else if ('addListener' in mql) {
        // 兼容旧版 Safari
        (mql as { addListener: (cb: () => void) => void }).addListener(listener);
      }
      mediaQueryListenerAttached = true;
    }
  },
}));

// 模块加载时立即初始化，避免页面初次载入时主题闪烁
if (typeof window !== 'undefined') {
  useThemeStore.getState().initTheme();
}
