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

    useTagStore.getState().removeCustomTag('临时测试标签');
    expect(useTagStore.getState().availableTags).not.toContain('临时测试标签');
  });
});
