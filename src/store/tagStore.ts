import { create } from 'zustand';

export const DEFAULT_TAGS = [
  '要修图',
  '原图直出',
  '相册排版',
  '发圈预告',
  '面部微调',
  '修除碎发',
  '消除路人/杂物',
] as const;

const STORAGE_KEY = 'quickpick_custom_tags';

function loadSavedTags(): string[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [...DEFAULT_TAGS];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const set = new Set([...parsed]);
        DEFAULT_TAGS.forEach((tag) => set.add(tag));
        return Array.from(set);
      }
    }
  } catch {
    // 忽略无效存储
  }
  return [...DEFAULT_TAGS];
}

function saveTags(tags: string[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
  } catch {
    // 忽略写入异常
  }
}

interface TagStore {
  availableTags: string[];
  addCustomTag: (tag: string) => boolean;
  removeCustomTag: (tag: string) => void;
  resetDefaultTags: () => void;
}

export const useTagStore = create<TagStore>((set, get) => ({
  availableTags: loadSavedTags(),

  addCustomTag: (rawTag: string) => {
    const trimmed = rawTag.trim();
    if (!trimmed || trimmed.length > 20) return false;
    const current = get().availableTags;
    if (current.includes(trimmed)) return false;
    const next = [...current, trimmed];
    saveTags(next);
    set({ availableTags: next });
    return true;
  },

  removeCustomTag: (tagToRemove: string) => {
    const next = get().availableTags.filter((t) => t !== tagToRemove);
    saveTags(next);
    set({ availableTags: next });
  },

  resetDefaultTags: () => {
    const next = [...DEFAULT_TAGS];
    saveTags(next);
    set({ availableTags: next });
  },
}));
