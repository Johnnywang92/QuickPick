import { describe, expect, it } from 'vitest';
import helpMarkdown from '../../docs/HELP.md?raw';
import { parseHelpDoc, searchHelp } from './helpDocs';

describe('helpDocs', () => {
  const entries = parseHelpDoc(helpMarkdown);

  it('parses Q&A entries with keywords and skips the table of contents', () => {
    expect(entries.length).toBeGreaterThan(30);
    expect(entries.some((e) => e.section === '目录')).toBe(false);
    const gatekeeper = entries.find((e) => e.title.includes('无法验证开发者'));
    expect(gatekeeper?.keywords).toContain('Gatekeeper');
    expect(gatekeeper?.body).toContain('xattr');
    expect(gatekeeper?.body).not.toContain('关键词');
  });

  it('keeps unstructured sections such as the error table as entries', () => {
    expect(entries.some((e) => e.section === '错误信息速查表')).toBe(true);
  });

  it('ranks title/keyword hits first and ANDs multiple terms', () => {
    const results = searchHelp(entries, 'AirDrop');
    expect(results[0].title).toContain('AirDrop');
    expect(searchHelp(entries, 'inode 硬链接').length).toBeGreaterThan(0);
    expect(searchHelp(entries, 'airdrop 不存在的词语xyz')).toHaveLength(0);
  });

  it('returns everything for an empty query', () => {
    expect(searchHelp(entries, '  ')).toHaveLength(entries.length);
  });
});

