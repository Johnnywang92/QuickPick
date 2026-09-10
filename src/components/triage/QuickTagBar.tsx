import React, { useState, useRef, useEffect } from 'react';
import { useAlbumStore } from '../../store/albumStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useTagStore } from '../../store/tagStore';
import { Tag, Plus, Check, X, Trash2 } from 'lucide-react';
import clsx from 'clsx';

export const QuickTagBar: React.FC = () => {
  const { photos, currentIndex } = useAlbumStore();
  const { getAnnotation, setAnnotation, getSelection, setSelectionState } = useSelectionStore();
  const { availableTags, addCustomTag, removeCustomTag } = useTagStore();

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  const currentPhoto = photos[currentIndex];

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsPopoverOpen(false);
      }
    };
    if (isPopoverOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isPopoverOpen]);

  if (!currentPhoto) return null;

  const currentSelection = getSelection(currentPhoto.id);
  const annotation = getAnnotation(currentPhoto.id);
  const activeTags = annotation.presetTags || [];

  const handleToggleTag = (tag: string) => {
    const nextTags = activeTags.includes(tag)
      ? activeTags.filter((t) => t !== tag)
      : [...activeTags, tag];

    setAnnotation(currentPhoto.id, {
      ...annotation,
      presetTags: nextTags,
    });

    // 若当前照片尚未标记选片决定，打标签时自动联动标记为“已选”
    if (currentSelection.state === 'unreviewed' && nextTags.length > 0) {
      setSelectionState(currentPhoto.id, 'selected');
    }
  };

  const handleAddNewTag = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTagInput.trim();
    if (!trimmed) return;
    addCustomTag(trimmed);
    // 立即为当前照片打上该新标签
    handleToggleTag(trimmed);
    setNewTagInput('');
  };

  // 常用交付高频标签常驻显示，其它标签或额外标签也可点击
  const quickDisplayTags = availableTags.slice(0, 5);
  const hasMoreTags = availableTags.length > 5;

  return (
    <div className="relative flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-dark-850/90 backdrop-blur-md border border-dark-700/80 shadow-lg text-xs select-none">
      <div className="flex items-center space-x-1 text-slate-400 font-medium text-[11px] pr-1 border-r border-dark-750">
        <Tag className="w-3 h-3 text-slate-400" />
        <span>标签</span>
      </div>

      {/* 快捷常驻标签列表 (支持数字键 1~5 盲打) */}
      <div className="flex items-center gap-1">
        {quickDisplayTags.map((tag, idx) => {
          const isActive = activeTags.includes(tag);
          const isRetouch = tag === '要修图';
          const isStraight = tag === '原图直出';

          return (
            <button
              key={tag}
              onClick={() => handleToggleTag(tag)}
              title={
                isActive
                  ? `取消标签: ${tag} [快捷键 ${idx + 1}]`
                  : `打上 [${tag}] 标签 [快捷键 ${idx + 1}]`
              }
              className={clsx(
                'flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all cursor-pointer select-none',
                isActive
                  ? isRetouch
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                    : isStraight
                    ? 'bg-teal-600 text-white border-teal-500 shadow-sm'
                    : 'bg-brand-600 text-white border-brand-500 shadow-sm'
                  : 'bg-dark-800/80 hover:bg-dark-750 text-slate-300 hover:text-slate-100 border-dark-700',
              )}
            >
              <span
                className={clsx(
                  'text-[9px] font-mono font-bold px-1 py-0.2 rounded',
                  isActive ? 'bg-white/25 text-white' : 'bg-dark-750 text-slate-400',
                )}
              >
                {idx + 1}
              </span>
              {isActive && <Check className="w-2.5 h-2.5 stroke-[3]" />}
              <span>{tag}</span>
            </button>
          );
        })}
      </div>

      {/* 自定义与更多标签弹层入口 */}
      <div className="relative" ref={popoverRef}>
        <button
          onClick={() => setIsPopoverOpen(!isPopoverOpen)}
          className={clsx(
            'flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors cursor-pointer',
            isPopoverOpen
              ? 'bg-dark-700 text-slate-100 border-slate-500'
              : 'bg-dark-800/60 hover:bg-dark-750 text-slate-400 hover:text-slate-200 border-dark-700/60',
          )}
          title="新建自定义标签或选择更多标签"
        >
          <Plus className="w-3 h-3" />
          <span>{hasMoreTags ? '更多/新建' : '新建'}</span>
        </button>

        {isPopoverOpen && (
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 bg-dark-850 border border-dark-700 rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-dark-750">
              <span className="text-[11px] font-bold text-slate-200">自定义与管理标签</span>
              <button
                onClick={() => setIsPopoverOpen(false)}
                className="p-0.5 text-slate-400 hover:text-slate-200 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 新建标签表单 */}
            <form onSubmit={handleAddNewTag} className="flex items-center gap-1.5 mb-2.5">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                placeholder="输入新标签名，如: 封面备选"
                maxLength={20}
                className="flex-1 px-2.5 py-1 bg-dark-900 border border-dark-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
                autoFocus
              />
              <button
                type="submit"
                disabled={!newTagInput.trim()}
                className="px-2.5 py-1 bg-brand-600 hover:bg-brand-500 disabled:opacity-30 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                添加
              </button>
            </form>

            {/* 全部标签清单 */}
            <div className="max-h-40 overflow-y-auto space-y-1">
              <div className="text-[10px] text-slate-500 mb-1">点击切换当前照片标签：</div>
              <div className="flex flex-wrap gap-1">
                {availableTags.map((tag) => {
                  const isActive = activeTags.includes(tag);
                  const isSystemDefault = [
                    '要修图',
                    '原图直出',
                    '相册排版',
                    '发圈预告',
                    '面部微调',
                    '修除碎发',
                    '消除路人/杂物',
                  ].includes(tag);

                  return (
                    <div
                      key={tag}
                      className={clsx(
                        'group flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[11px] font-medium border transition-all',
                        isActive
                          ? 'bg-brand-600/30 border-brand-500 text-brand-200'
                          : 'bg-dark-800 border-dark-700 text-slate-300 hover:border-slate-600',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleTag(tag)}
                        className="cursor-pointer"
                      >
                        {tag}
                      </button>
                      {!isSystemDefault && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCustomTag(tag);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-400 rounded cursor-pointer transition-opacity"
                          title="删除该自定义标签"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
