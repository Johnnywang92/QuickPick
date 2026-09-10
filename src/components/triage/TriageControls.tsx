import React, { useState } from 'react';
import { useAlbumStore } from '../../store/albumStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useInsightStore } from '../../store/insightStore';
import { useCompareStore } from '../../store/compareStore';
import { hasRetouchRequirements, parseAnnotation } from '../../utils/annotationUtils';
import {
  Check,
  CircleSlash2,
  HelpCircle,
  Users,
  ArrowRightLeft,
  Undo2,
  Sparkles,
  Zap,
} from 'lucide-react';

interface TriageControlsProps {
  onToggleRetouch?: () => void;
  isRetouchOpen?: boolean;
}

export const TriageControls: React.FC<TriageControlsProps> = ({
  onToggleRetouch,
  isRetouchOpen = false,
}) => {
  const { photos, currentIndex } = useAlbumStore();
  const { selections, toggleSelect, setMaybe, setSkipped, undoStack, undoLast, setNote } =
    useSelectionStore();
  const { isFaceLoupeOpen, toggleFaceLoupe } = useInsightStore();
  const { toggleCompareMode, isCompareMode, startBurstPk } = useCompareStore();

  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');

  const currentPhoto = photos[currentIndex];
  if (!currentPhoto) return null;

  const currentSelection = selections[currentPhoto.id] || { state: 'unreviewed' };
  const isSelected = currentSelection.state === 'selected';
  const isMaybe = currentSelection.state === 'maybe';
  const isSkipped = currentSelection.state === 'skipped';
  const hasFaces = currentPhoto.faces && currentPhoto.faces.length > 0;

  const handleSaveNote = () => {
    setNote(currentPhoto.id, noteText);
    setIsNoteOpen(false);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {/* 备注输入浮层 */}
      {isNoteOpen && (
        <div className="flex items-center gap-2 bg-dark-850/95 backdrop-blur border border-dark-700 p-2 rounded-xl shadow-2xl animate-in fade-in slide-in-from-bottom-2">
          <input
            type="text"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveNote()}
            placeholder="为这张照片写点想法（如：选这张做头像、喜欢表情）..."
            className="bg-dark-900 border border-dark-700 px-3 py-1.5 rounded-lg text-xs text-slate-200 placeholder-slate-500 w-72 focus:outline-none focus:border-brand-500"
            autoFocus
          />
          <button
            onClick={handleSaveNote}
            className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            保存
          </button>
          <button
            onClick={() => setIsNoteOpen(false)}
            className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200"
          >
            取消
          </button>
        </div>
      )}

      {/* 核心选片操作条 */}
      <div className="flex items-center space-x-2 bg-dark-850/90 backdrop-blur-md border border-dark-700/80 px-3 py-1.5 rounded-2xl shadow-2xl">
        {/* 选择 / 取消选择 [Space] */}
        <button
          onClick={() => toggleSelect(currentPhoto.id)}
          title="选择或取消选择该照片 [空格 Space]"
          className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer select-none ${
            isSelected
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 scale-102'
              : 'hover:bg-dark-700/90 text-slate-300 hover:text-emerald-300'
          }`}
        >
          <Check className="w-4 h-4 stroke-[3]" />
          <span>{isSelected ? '已选 (Space)' : '选择 (Space)'}</span>
        </button>

        {/* 待考虑 [M] */}
        <button
          onClick={() => setMaybe(currentPhoto.id)}
          title="拿不准时先放入待考虑 [快捷键 M]"
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer select-none ${
            isMaybe
              ? 'bg-amber-500 text-dark-900 font-bold shadow-md shadow-amber-500/20'
              : 'hover:bg-dark-700/90 text-slate-300 hover:text-amber-300'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>待考虑 (M)</span>
        </button>

        {/* 明确不选 [N] */}
        <button
          onClick={() => setSkipped(currentPhoto.id)}
          title="明确将这张照片标记为不选 [快捷键 N]"
          className={`flex items-center space-x-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer select-none ${
            isSkipped
              ? 'bg-slate-600 text-white shadow-md shadow-slate-700/20'
              : 'text-slate-300 hover:bg-dark-700/90 hover:text-slate-100'
          }`}
        >
          <CircleSlash2 className="h-3.5 w-3.5" />
          <span>{isSkipped ? '已不选 (N)' : '不选 (N)'}</span>
        </button>

        <div className="h-4 w-[1px] bg-dark-700 mx-0.5" />

        {/* 人脸特写 [F] */}
        {hasFaces && (
          <button
            onClick={toggleFaceLoupe}
            title="放大检查人物眼睛与表情 [快捷键 F]"
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer select-none ${
              isFaceLoupeOpen
                ? 'bg-indigo-600 text-white shadow-md'
                : 'hover:bg-dark-700 text-slate-300 hover:text-indigo-300'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>特写 ({currentPhoto.faces?.length || 0})</span>
          </button>
        )}

        {/* 对比相似照片 [C] */}
        <button
          onClick={toggleCompareMode}
          title="与同组连拍或其它照片分屏对比 [快捷键 C]"
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer select-none ${
            isCompareMode
              ? 'bg-blue-600 text-white shadow-md'
              : 'hover:bg-dark-700 text-slate-300 hover:text-blue-300'
          }`}
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          <span>对比 (C)</span>
        </button>

        {/* 连拍极速对决 [P] */}
        {currentPhoto.burstGroupId && (
          <button
            onClick={() => startBurstPk(currentPhoto.burstGroupId)}
            title="两两淘汰对决，快速选出连拍最佳 [快捷键 P]"
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium hover:bg-dark-700 text-slate-300 hover:text-amber-500 dark:hover:text-amber-300 transition-all cursor-pointer select-none"
          >
            <Zap className="w-3.5 h-3.5 text-slate-400" />
            <span>连拍 PK (P)</span>
          </button>
        )}

        {/* 修图与批注要求 [R] */}
        <button
          onClick={onToggleRetouch}
          title="为这张照片标记具体修图需求或图上标注 [快捷键 R]"
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer select-none ${
            isRetouchOpen
              ? 'bg-indigo-600 text-white shadow-md'
              : hasRetouchRequirements(currentSelection.note)
              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
              : 'hover:bg-dark-700 text-slate-300 hover:text-indigo-300'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>
            修图要求 (R)
            {hasRetouchRequirements(currentSelection.note) && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-indigo-500 text-white text-[10px] font-bold font-mono">
                {parseAnnotation(currentSelection.note).pins?.length
                  ? `${parseAnnotation(currentSelection.note).pins?.length}点`
                  : '已填'}
              </span>
            )}
          </span>
        </button>

        {/* 撤销按钮 */}
        {undoStack.length > 0 && (
          <button
            onClick={undoLast}
            title={`撤销上一步操作 (Cmd/Ctrl+Z)`}
            className="p-1.5 hover:bg-dark-700 text-slate-400 hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
