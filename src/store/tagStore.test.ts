import { describe, it, expect, beforeEach } from 'vitest';
import { useTagStore, DEFAULT_TAGS } from './tagStore';

describe('tagStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useTagStore.getState().resetDefaultTags();
  });

  it('initializes with default tags', () => {
    const tags = useTagStore.getState().availableTags;
    expect(tags).toEqual(expect.arrayContaining([...DEFAULT_TAGS]));
  });

  it('adds a custom tag successfully and prevents duplicates', () => {
    const added = useTagStore.getState().addCustomTag('相册封面');
    expect(added).toBe(true);
    expect(useTagStore.getState().availableTags).toContain('相册封面');

    // Duplicate should return false
    const duplicate = useTagStore.getState().addCustomTag('相册封面');
    expect(duplicate).toBe(false);

    // Empty or whitespace tag should return false
    expect(useTagStore.getState().addCustomTag('   ')).toBe(false);
  });

  it('removes a custom tag', () => {
    useTagStore.getState().addCustomTag('临时测试标签');
    expect(useTagStore.getState().availableTags).toContain('临时测试标签');

    useTagStore.getState().removeTag('临时测试标签');
    expect(useTagStore.getState().availableTags).not.toContain('临时测试标签');
  });

  it('renames any tag while preserving its position', () => {
    const originalIndex = useTagStore.getState().availableTags.indexOf('要修图');
    expect(useTagStore.getState().renameTag('要修图', '精细修图')).toBe(true);
    expect(useTagStore.getState().availableTags[originalIndex]).toBe('精细修图');
    expect(useTagStore.getState().renameTag('精细修图', '原图直出')).toBe(false);
  });

  it('reorders tags and persists the ordered list', () => {
    useTagStore.getState().reorderTag('相册排版', '要修图');
    expect(useTagStore.getState().availableTags.slice(0, 3)).toEqual([
      '相册排版',
      '要修图',
      '原图直出',
    ]);
    expect(JSON.parse(localStorage.getItem('quickpick_custom_tags') || '[]').slice(0, 3)).toEqual([
      '相册排版',
      '要修图',
      '原图直出',
    ]);
  });

  it('allows deleting a default tag', () => {
    useTagStore.getState().removeTag('要修图');
    expect(useTagStore.getState().availableTags).not.toContain('要修图');
    expect(JSON.parse(localStorage.getItem('quickpick_custom_tags') || '[]')).not.toContain('要修图');
  });
});
