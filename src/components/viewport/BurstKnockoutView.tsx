import React, { useEffect } from 'react';
import { useAlbumStore } from '../../store/albumStore';
import { useCompareStore } from '../../store/compareStore';
import { usePreviewStore } from '../../store/previewStore';
import {
  Zap,
  X,
  Crown,
  Swords,
  ArrowLeft,
  ArrowRight,
  CheckCheck,
  Loader2,
} from 'lucide-react';

export const BurstKnockoutView: React.FC = () => {
  const { photos } = useAlbumStore();
  const {
    isPkMode,
    pkChampionIndex,
    pkChallengerIndex,
    pkRemainingIndices,
    pkTotalCount,
    pkCompletedCount,
    comparePreviewUrl,
    comparePreviewStatus,
    pkVoteLeft,
    pkVoteRight,
    pkVoteBoth,
    exitPkMode,
  } = useCompareStore();
  const { currentPreviewUrl, previewStatus } = usePreviewStore();

  const championPhoto = pkChampionIndex !== null ? photos[pkChampionIndex] : null;
  const challengerPhoto = pkChallengerIndex !== null ? photos[pkChallengerIndex] : null;

  // 键盘盲打快捷键监听
  useEffect(() => {
    if (!isPkMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        pkVoteLeft();
      } else if (
        e.key === 'ArrowRight' ||
        e.key === 'd' ||
        e.key === 'D' ||
        e.key === 'j' ||
        e.key === 'J'
      ) {
        e.preventDefault();
        pkVoteRight();
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        pkVoteBoth();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        exitPkMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPkMode, pkVoteLeft, pkVoteRight, pkVoteBoth, exitPkMode]);

  if (!isPkMode || !championPhoto || !challengerPhoto) return null;

  const totalRounds = Math.max(1, pkTotalCount - 1);
  const currentRound = Math.min(totalRounds, pkCompletedCount + 1);
  const progressPercent = Math.round((pkCompletedCount / totalRounds) * 100);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="连拍极速对决"
      className="fixed inset-0 z-40 bg-dark-950 flex flex-col select-none animate-in fade-in duration-150"
    >
      {/* 顶部标题与进度条 */}
      <header className="flex items-center justify-between px-6 py-3.5 border-b border-dark-750 bg-dark-900/90 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Zap className="w-5 h-5 fill-amber-400/20" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-slate-100">连拍极速对决 (Burst PK)</h2>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-[10px] font-bold">
                第 {currentRound} / {totalRounds} 轮
              </span>
            </div>
            <p className="text-xs text-slate-400">
              两两对决决出组内最佳瞬间 · 输者自动标记不选 · 胜者晋级
            </p>
          </div>
        </div>

        {/* 进度条 */}
        <div className="hidden sm:flex flex-col items-center w-64">
          <div className="flex justify-between w-full text-[11px] text-slate-400 font-mono mb-1">
            <span>淘汰进度</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="w-full h-1.5 bg-dark-750 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all duration-200 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <button
          onClick={exitPkMode}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-dark-800 transition-colors cursor-pointer"
          title="退出对决 (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* 主对决对战视口 */}
      <main className="flex-1 grid grid-cols-2 gap-4 p-4 min-h-0 relative">
        {/* 左侧：擂主 (Champion) */}
        <div
          onClick={pkVoteLeft}
          className="group relative flex flex-col bg-dark-900 border-2 border-amber-500/40 hover:border-amber-400 rounded-2xl overflow-hidden shadow-2xl transition-all cursor-pointer"
        >
          {/* 擂主角标 */}
          <div className="absolute top-4 left-4 z-10 flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-500/90 text-dark-950 font-extrabold text-xs shadow-lg backdrop-blur">
            <Crown className="w-3.5 h-3.5 fill-dark-950" />
            <span>当前擂主 [按 ← 胜出]</span>
          </div>

          <div className="absolute top-4 right-4 z-10 px-2.5 py-1 rounded-lg bg-dark-950/80 border border-dark-750 font-mono text-[11px] text-slate-300">
            {championPhoto.filename}
          </div>

          <div className="flex-1 flex items-center justify-center p-2 relative overflow-hidden">
            {previewStatus === 'loading' && (
              <div className="flex items-center text-xs text-slate-400">
                <Loader2 className="w-4 h-4 mr-2 animate-spin text-amber-400" />
                正在载入...
              </div>
            )}
            {currentPreviewUrl && (
              <img
                src={currentPreviewUrl}
                alt={championPhoto.filename}
                className="w-full h-full object-contain rounded-xl transition-transform duration-150 group-hover:scale-[1.01]"
              />
            )}
          </div>

          <div className="p-3 bg-dark-850/80 border-t border-dark-750 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-mono">
              {championPhoto.isRaw ? 'RAW 内嵌预览' : 'JPEG'}
            </span>
            <button className="flex items-center space-x-1 px-4 py-1.5 rounded-lg bg-amber-500/20 group-hover:bg-amber-500 text-amber-300 group-hover:text-dark-950 font-bold text-xs transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>选择左图胜出</span>
            </button>
          </div>
        </div>

        {/* 中间对决勋章 */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
          <div className="w-12 h-12 rounded-full bg-dark-850 border-2 border-amber-500/60 shadow-2xl flex items-center justify-center text-amber-400 font-black text-sm italic">
            <Swords className="w-5 h-5" />
          </div>
        </div>

        {/* 右侧：挑战者 (Challenger) */}
        <div
          onClick={pkVoteRight}
          className="group relative flex flex-col bg-dark-900 border-2 border-blue-500/40 hover:border-blue-400 rounded-2xl overflow-hidden shadow-2xl transition-all cursor-pointer"
        >
          {/* 挑战者角标 */}
          <div className="absolute top-4 left-4 z-10 flex items-center space-x-1.5 px-3 py-1 rounded-full bg-blue-500/90 text-white font-extrabold text-xs shadow-lg backdrop-blur">
            <Zap className="w-3.5 h-3.5 fill-white" />
            <span>挑战者 [按 → 胜出]</span>
          </div>

          <div className="absolute top-4 right-4 z-10 px-2.5 py-1 rounded-lg bg-dark-950/80 border border-dark-750 font-mono text-[11px] text-slate-300">
            {challengerPhoto.filename}
          </div>

          <div className="flex-1 flex items-center justify-center p-2 relative overflow-hidden">
            {comparePreviewStatus === 'loading' && (
              <div className="flex items-center text-xs text-slate-400">
                <Loader2 className="w-4 h-4 mr-2 animate-spin text-blue-400" />
                正在载入下一张...
              </div>
            )}
            {comparePreviewUrl && (
              <img
                src={comparePreviewUrl}
                alt={challengerPhoto.filename}
                className="w-full h-full object-contain rounded-xl transition-transform duration-150 group-hover:scale-[1.01]"
              />
            )}
          </div>

          <div className="p-3 bg-dark-850/80 border-t border-dark-750 flex items-center justify-between">
            <span className="text-xs text-slate-400 font-mono">
              {challengerPhoto.isRaw ? 'RAW 内嵌预览' : 'JPEG'}
            </span>
            <button className="flex items-center space-x-1 px-4 py-1.5 rounded-lg bg-blue-500/20 group-hover:bg-blue-500 text-blue-300 group-hover:text-white font-bold text-xs transition-colors">
              <span>选择右图胜出</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </main>

      {/* 底部动作控制台 */}
      <footer className="px-6 py-3 border-t border-dark-750 bg-dark-900 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-4 text-xs text-slate-400">
          <span>剩余候选：{pkRemainingIndices.length} 张</span>
          <span className="hidden sm:inline">快捷键：← 选左 / → 选右 / 空格 双选 / Esc 退出</span>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={pkVoteLeft}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-dark-950 font-bold text-xs shadow-md transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>左图更好 (←)</span>
          </button>

          <button
            onClick={pkVoteBoth}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-dark-750 hover:bg-dark-700 text-slate-200 font-semibold text-xs border border-dark-600 transition-all cursor-pointer"
            title="两张都想保留为已选 (空格 Space)"
          >
            <CheckCheck className="w-4 h-4 text-emerald-400" />
            <span>两张都要 (Space)</span>
          </button>

          <button
            onClick={pkVoteRight}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
          >
            <span>右图更好 (→)</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={exitPkMode}
            className="px-3 py-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-dark-800 text-xs transition-colors cursor-pointer"
          >
            退出对决
          </button>
        </div>
      </footer>
    </div>
  );
};
