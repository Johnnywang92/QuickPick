import { describe, it, expect, beforeEach } from 'vitest';
import { useThemeStore } from './themeStore';

describe('themeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    useThemeStore.setState({
      themeMode: 'dark',
      effectiveTheme: 'dark',
      isSettingsOpen: false,
    });
  });

  it('defaults to dark mode and sets dark on html element', () => {
    useThemeStore.getState().setThemeMode('dark');
    expect(useThemeStore.getState().themeMode).toBe('dark');
    expect(useThemeStore.getState().effectiveTheme).toBe('dark');
    expect(document.documentElement.classList.contains('theme-light')).toBe(false);
    expect(localStorage.getItem('quickpick_theme_mode')).toBe('dark');
  });

  it('switches to light mode and sets theme-light on html element', () => {
    useThemeStore.getState().setThemeMode('light');
    expect(useThemeStore.getState().themeMode).toBe('light');
    expect(useThemeStore.getState().effectiveTheme).toBe('light');
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);
    expect(localStorage.getItem('quickpick_theme_mode')).toBe('light');
  });

  it('switches to system mode cleanly', () => {
    useThemeStore.getState().setThemeMode('system');
    expect(useThemeStore.getState().themeMode).toBe('system');
    expect(localStorage.getItem('quickpick_theme_mode')).toBe('system');
  });

  it('toggles settings modal open state', () => {
    expect(useThemeStore.getState().isSettingsOpen).toBe(false);
    useThemeStore.getState().setSettingsOpen(true);
    expect(useThemeStore.getState().isSettingsOpen).toBe(true);
    useThemeStore.getState().setSettingsOpen(false);
    expect(useThemeStore.getState().isSettingsOpen).toBe(false);
  });
});
