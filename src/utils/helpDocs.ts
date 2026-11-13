export interface HelpEntry {
  id: string;
  section: string;
  title: string;
  keywords: string[];
  body: string;
}

const KEYWORD_LINE = /^\*\*关键词\*\*[：:]\s*(.*)$/;

/** 把 HELP.md 解析成可检索的条目：`## ` 为分组，`### ` 为问题；没有 `###` 的分组整体作为一个条目。 */
export function parseHelpDoc(markdown: string): HelpEntry[] {
  const entries: HelpEntry[] = [];
  let section = '';
  let current: { title: string; lines: string[]; keywords: string[] } | null = null;
  let inFence = false;

  const flush = () => {
    if (!current) return;
    const body = current.lines.join('\n').trim();
    if (body) {
      entries.push({
        id: `help-${entries.length}`,
        section,
        title: current.title,
        keywords: current.keywords,
        body,
      });
    }
    current = null;
  };

  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith('```')) inFence = !inFence;
    if (!inFence && line.startsWith('## ')) {
      flush();
      section = line.slice(3).trim().replace(/^\d+\.\s*/, '');
      if (section === '目录') {
        current = null;
        section = '';
        continue;
      }
      current = { title: section, lines: [], keywords: [] };
      continue;
    }
    if (!inFence && line.startsWith('### ')) {
      flush();
      current = { title: line.slice(4).trim().replace(/^Q\d+\.\d+\s*/, ''), lines: [], keywords: [] };
      continue;
    }
    if (!current) continue;
    const match = KEYWORD_LINE.exec(line);
    if (match) {
      current.keywords = match[1].split(/\s+/).filter(Boolean);
      continue;
    }
    if (line.trim() === '---') continue;
    current.lines.push(line);
  }
  flush();
  return entries;
}

/** 多关键词 AND 匹配，标题与关键词权重高于正文；返回按相关度排序的条目。 */
export function searchHelp(entries: HelpEntry[], query: string): HelpEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return entries;
  const scored: Array<{ entry: HelpEntry; score: number }> = [];
  for (const entry of entries) {
    const title = entry.title.toLowerCase();
    const keywords = entry.keywords.join(' ').toLowerCase();
    const body = entry.body.toLowerCase();
    const section = entry.section.toLowerCase();
    let score = 0;
    let ok = true;
    for (const term of terms) {
      let s = 0;
      if (title.includes(term)) s += 6;
      if (keywords.includes(term)) s += 4;
      if (section.includes(term)) s += 2;
      if (body.includes(term)) s += 1;
      if (s === 0) {
        ok = false;
        break;
      }
      score += s;
    }
    if (ok) scored.push({ entry, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((item) => item.entry);
}

