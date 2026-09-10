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
      if (Array.isArray(parsed)) {
        return Array.from(new Set(
          parsed.filter((tag): tag is string => typeof tag === 'string')
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0 && tag.length <= 20),
        ));
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
  renameTag: (currentTag: string, nextTag: string) => boolean;
  removeTag: (tag: string) => void;
  removeCustomTag: (tag: string) => void;
  reorderTag: (draggedTag: string, targetTag: string) => void;
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

  renameTag: (currentTag: string, rawNextTag: string) => {
    const nextTag = rawNextTag.trim();
    const current = get().availableTags;
    if (
      !nextTag ||
      nextTag.length > 20 ||
      !current.includes(currentTag) ||
      (nextTag !== currentTag && current.includes(nextTag))
    ) return false;
    if (nextTag === currentTag) return true;
    const next = current.map((tag) => (tag === currentTag ? nextTag : tag));
    saveTags(next);
    set({ availableTags: next });
    return true;
  },

  removeTag: (tagToRemove: string) => {
    const next = get().availableTags.filter((t) => t !== tagToRemove);
    saveTags(next);
    set({ availableTags: next });
  },

  removeCustomTag: (tagToRemove: string) => {
    get().removeTag(tagToRemove);
  },

  reorderTag: (draggedTag: string, targetTag: string) => {
    const current = get().availableTags;
    const fromIndex = current.indexOf(draggedTag);
    const toIndex = current.indexOf(targetTag);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const next = [...current];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    saveTags(next);
    set({ availableTags: next });
  },

  resetDefaultTags: () => {
    const next = [...DEFAULT_TAGS];
    saveTags(next);
    set({ availableTags: next });
  },
}));
