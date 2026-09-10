import React, { useState } from 'react';
import { useAlbumStore } from '../../store/albumStore';
import { useSelectionStore } from '../../store/selectionStore';
import { VisualPin } from '../../types/photo';
import { createPin } from '../../utils/annotationUtils';
import { useTagStore } from '../../store/tagStore';
import {
  X,
  Sparkles,
  MapPin,
  Trash2,
  Tag,
  Plus,
  MessageSquare,
  CheckCircle2,
} from 'lucide-react';
import clsx from 'clsx';

interface RetouchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isAddingPin: boolean;
  setIsAddingPin: (adding: boolean) => void;
  onAddPinManual?: (pin: VisualPin) => void;
}

export const RetouchPanel: React.FC<RetouchPanelProps> = ({
  isOpen,
  onClose,
  isAddingPin,
  setIsAddingPin,
}) => {
  const { photos, currentIndex } = useAlbumStore();
  const { getAnnotation, setAnnotation } = useSelectionStore();
  const { availableTags, addCustomTag } = useTagStore();

  const currentPhoto = photos[currentIndex];
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const [newTagInput, setNewTagInput] = useState('');

  if (!isOpen || !currentPhoto) return null;

  const annotation = getAnnotation(currentPhoto.id);
  const presetTags = annotation.presetTags || [];
  const pins = annotation.pins || [];
  const comment = annotation.comment || '';

  const handleToggleTag = (tag: string) => {
    const nextTags = presetTags.includes(tag)
      ? presetTags.filter((t) => t !== tag)
      : [...presetTags, tag];
    setAnnotation(currentPhoto.id, {
      ...annotation,
      presetTags: nextTags,
    });
  };

  const handleCommentChange = (text: string) => {
    setAnnotation(currentPhoto.id, {
      ...annotation,
      comment: text,
    });
  };

  const handleUpdatePin = (pinId: string, updates: Partial<VisualPin>) => {
    const nextPins = pins.map((pin) => (pin.id === pinId ? { ...pin, ...updates } : pin));
    setAnnotation(currentPhoto.id, {
      ...annotation,
      pins: nextPins,
    });
  };

  const handleDeletePin = (pinId: string) => {
    const remaining = pins.filter((pin) => pin.id !== pinId);
    // 重新编号
    const reindexed = remaining.map((pin, idx) => ({ ...pin, pinIndex: idx + 1 }));
    setAnnotation(currentPhoto.id, {
      ...annotation,
      pins: reindexed,
    });
    if (activePinId === pinId) {
      setActivePinId(null);
    }
  };

  const handleAddCenterPin = () => {
    const nextIndex = pins.length + 1;
    const newPin = createPin(0.5, 0.5, nextIndex, undefined, '');
    setAnnotation(currentPhoto.id, {
      ...annotation,
      pins: [...pins, newPin],
    });
    setActivePinId(newPin.id);
  };

  return (
    <aside
      role="dialog"
      aria-label="修图与批注要求"
      className="relative z-30 flex h-full w-[clamp(17rem,24vw,22rem)] max-w-[40%] shrink-0 flex-col overflow-hidden border-l border-dark-700 bg-dark-900 text-slate-200 shadow-2xl font-sans animate-in slide-in-from-right-4 duration-200"
    >
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-750 bg-dark-850/90 shrink-0">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100">修图与批注要求</h3>
            <p className="text-[10px] text-slate-400 font-mono truncate max-w-[160px]">
              {currentPhoto.filename}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-700 transition-colors cursor-pointer"
          title="关闭面板 (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* 照片标签与需求 */}
        <div>
          <div className="flex items-center justify-between mb-2 text-slate-300 font-semibold">
            <div className="flex items-center space-x-1.5">
              <Tag className="w-3.5 h-3.5 text-indigo-400" />
              <span>照片标签 (点击勾选)</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {availableTags.map((tag) => {
              const isSelected = presetTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => handleToggleTag(tag)}
                  className={clsx(
                    'px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer',
                    isSelected
                      ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300 shadow-sm'
                      : 'bg-dark-800/80 border-dark-700 text-slate-400 hover:text-slate-200 hover:border-dark-600',
                  )}
                >
                  {tag}
                </button>
              );
            })}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = newTagInput.trim();
              if (trimmed) {
                addCustomTag(trimmed);
                handleToggleTag(trimmed);
                setNewTagInput('');
              }
            }}
            className="flex items-center gap-1.5"
          >
            <input
              type="text"
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              placeholder="添加自定义标签..."
              className="flex-1 px-2.5 py-1 bg-dark-900 border border-dark-700 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={!newTagInput.trim()}
              className="p-1 rounded-lg bg-dark-800 hover:bg-dark-750 border border-dark-700 text-slate-300 disabled:opacity-30 text-xs font-medium cursor-pointer"
              title="添加新标签"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>

        {/* 局部图上标注点 */}
        <div className="border-t border-dark-750 pt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-1.5 text-slate-300 font-semibold">
              <MapPin className="w-3.5 h-3.5 text-rose-400" />
              <span>图上标注点 ({pins.length})</span>
            </div>
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setIsAddingPin(!isAddingPin)}
                className={clsx(
                  'px-2 py-0.5 rounded text-[10px] font-medium border transition-all cursor-pointer',
                  isAddingPin
                    ? 'bg-rose-500 text-white border-rose-400 animate-pulse'
                    : 'bg-dark-800 text-slate-300 border-dark-700 hover:border-dark-600',
                )}
                title="开启后直接在画面点击添加"
              >
                {isAddingPin ? '点击画面落点...' : '点图落针'}
              </button>
              <button
                onClick={handleAddCenterPin}
                className="p-1 rounded bg-dark-800 text-slate-400 hover:text-slate-200 border border-dark-700 cursor-pointer"
                title="在画面中心添加标注针"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

          {pins.length === 0 ? (
            <div className="p-3 rounded-xl bg-dark-800/40 border border-dark-750 border-dashed text-center text-[11px] text-slate-500">
              暂未添加图上标记点。
              <br />
              点击“点图落针”后在画面具体部位点一下即可精确指示！
            </div>
          ) : (
            <div className="space-y-2">
              {pins.map((pin) => (
                <div
                  key={pin.id}
                  className={clsx(
                    'p-2.5 rounded-xl border transition-all text-[11px]',
                    activePinId === pin.id
                      ? 'bg-dark-800 border-rose-500/50 shadow-sm'
                      : 'bg-dark-850/80 border-dark-700 hover:border-dark-650',
                  )}
                  onClick={() => setActivePinId(pin.id)}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center space-x-1.5">
                      <span className="w-4 h-4 rounded-full bg-rose-500 text-white font-extrabold text-[9px] flex items-center justify-center shrink-0">
                        {pin.pinIndex}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ({(pin.x * 100).toFixed(0)}%, {(pin.y * 100).toFixed(0)}%)
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePin(pin.id);
                      }}
                      className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors cursor-pointer"
                      title="删除该标注点"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* 针对该点的具体要求 */}
                  <input
                    type="text"
                    value={pin.comment || ''}
                    placeholder="如：擦除背景电线 / 修掉碎发..."
                    onChange={(e) => handleUpdatePin(pin.id, { comment: e.target.value })}
                    className="w-full px-2 py-1 bg-dark-900 border border-dark-700 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-rose-500 text-xs"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 综合文字附注 */}
        <div className="border-t border-dark-750 pt-3">
          <div className="flex items-center space-x-1.5 mb-1.5 text-slate-300 font-semibold">
            <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
            <span>通用附注与说明</span>
          </div>
          <textarea
            value={comment}
            onChange={(e) => handleCommentChange(e.target.value)}
            rows={3}
            placeholder="写给修图师的整体要求（如：喜欢这张色调、整体偏胶片风等）..."
            className="w-full p-2.5 bg-dark-900 border border-dark-700 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-xs resize-none leading-relaxed"
          />
        </div>
      </div>

      {/* 底部说明栏 */}
      <div className="px-4 py-2.5 border-t border-dark-750 bg-dark-850/80 text-[10px] text-slate-400 flex items-center justify-between shrink-0">
        <span className="flex items-center text-emerald-400">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          保存在项目内 · 原片不变
        </span>
        <span className="font-mono text-slate-500">按 R 快捷开关</span>
      </div>
    </aside>
  );
};
