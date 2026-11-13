import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronRight, Search, X } from 'lucide-react';
import helpMarkdown from '../../../docs/HELP.md?raw';
import { parseHelpDoc, searchHelp, type HelpEntry } from '../../utils/helpDocs';

interface HelpModalProps {
  onClose: () => void;
}

/** 行内：**粗体** 与 `代码`；链接只保留文字（文档内锚点在应用内无效）。 */
function renderInline(text: string): React.ReactNode[] {
  const cleaned = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  return cleaned.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={index} className="font-semibold text-slate-200">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={index}
          className="rounded bg-dark-700 px-1 py-0.5 font-mono text-[10px] text-brand-300"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function renderBody(body: string): React.ReactNode[] {
  const lines = body.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
    } else if (line.startsWith('```')) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i += 1;
      blocks.push(
        <pre
          key={key++}
          className="select-text overflow-x-auto rounded-lg bg-dark-900 p-2.5 font-mono text-[10px] text-slate-300"
        >
          {code.join('\n')}
        </pre>,
      );
    } else if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        if (!/^\|?\s*:?-{2,}/.test(lines[i].trim().replace(/^\|\s*/, '|'))) {
          rows.push(splitRow(lines[i]));
        }
        i += 1;
      }
      const [head, ...rest] = rows;
      blocks.push(
        <div key={key++} className="overflow-x-auto rounded-lg border border-dark-700">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-dark-800 text-slate-300">
              <tr>
                {head.map((cell, c) => (
                  <th key={c} className="px-2.5 py-1.5 font-semibold">
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-slate-400">
              {rest.map((row, r) => (
                <tr key={r} className="border-t border-dark-700">
                  {row.map((cell, c) => (
                    <td key={c} className="px-2.5 py-1.5 align-top">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (/^\s*(-|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*(-|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*(-|\d+\.)\s+/, ''));
        i += 1;
      }
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag
          key={key++}
          className={`space-y-1 pl-5 ${ordered ? 'list-decimal' : 'list-disc'} marker:text-slate-500`}
        >
          {items.map((item, n) => (
            <li key={n}>{renderInline(item)}</li>
          ))}
        </Tag>,
      );
    } else if (line.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(
        <blockquote key={key++} className="border-l-2 border-brand-500/50 pl-3 text-slate-400">
          {renderInline(quote.join(' '))}
        </blockquote>,
      );
    } else {
      const para: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !lines[i].startsWith('```') &&
        !lines[i].trim().startsWith('|') &&
        !/^\s*(-|\d+\.)\s+/.test(lines[i]) &&
        !lines[i].startsWith('>')
      ) {
        para.push(lines[i++]);
      }
      blocks.push(<p key={key++}>{renderInline(para.join(' '))}</p>);
    }
  }
  return blocks;
}

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  const entries = useMemo(() => parseHelpDoc(helpMarkdown), []);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchHelp(entries, query), [entries, query]);
  const searching = query.trim().length > 0;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (query) setQuery('');
      else onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, query]);

  // 搜索时若只有少量结果，自动展开第一条
  const effectiveOpen = openId ?? (searching && results.length > 0 ? results[0].id : null);

  const grouped = useMemo(() => {
    if (searching) return [['搜索结果', results]] as Array<[string, HelpEntry[]]>;
    const map = new Map<string, HelpEntry[]>();
    for (const entry of results) {
      map.set(entry.section, [...(map.get(entry.section) ?? []), entry]);
    }
    return [...map.entries()];
  }, [results, searching]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-dark-700 bg-dark-850 shadow-2xl animate-modal-sheet">
        <div className="flex items-center justify-between border-b border-dark-700/80 bg-dark-900/60 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <BookOpen className="h-5 w-5 text-brand-400" />
            <div>
              <h2 id="help-title" className="text-sm font-bold text-slate-100">
                帮助中心
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-400">搜索常见问题，如“导出失败”“闭眼”“打不开”</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-dark-700 hover:text-slate-100"
            aria-label="关闭帮助中心"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-dark-700/80 px-5 py-3">
          <label className="flex items-center gap-2 rounded-xl border border-dark-700 bg-dark-900 px-3 py-2 focus-within:border-brand-500/60">
            <Search className="h-4 w-4 shrink-0 text-slate-500" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpenId(null);
              }}
              placeholder="输入关键词，空格分隔多个词"
              aria-label="搜索帮助"
              className="w-full bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600"
            />
          </label>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {results.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              没有找到与“{query}”相关的内容。试试更短的关键词，或到
              GitHub Issues 反馈问题。
            </div>
          ) : (
            grouped.map(([section, items]) => (
              <section key={section}>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {section}
                </h3>
                <div className="space-y-1.5">
                  {items.map((entry) => {
                    const open = effectiveOpen === entry.id;
                    return (
                      <div
                        key={entry.id}
                        className="rounded-xl border border-dark-700 bg-dark-900/55"
                      >
                        <button
                          type="button"
                          onClick={() => setOpenId(open ? '' : entry.id)}
                          aria-expanded={open}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                        >
                          <ChevronRight
                            className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`}
                          />
                          <span className="text-xs font-medium text-slate-200">{entry.title}</span>
                        </button>
                        {open && (
                          <div className="select-text space-y-2.5 border-t border-dark-700 px-4 py-3 text-[11px] leading-relaxed text-slate-400">
                            {renderBody(entry.body)}
                            {entry.keywords.length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-1">
                                {entry.keywords.map((word) => (
                                  <button
                                    key={word}
                                    type="button"
                                    onClick={() => {
                                      setQuery(word);
                                      setOpenId(null);
                                    }}
                                    className="rounded-full bg-dark-700 px-2 py-0.5 text-[10px] text-slate-400 hover:text-brand-300"
                                  >
                                    {word}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

