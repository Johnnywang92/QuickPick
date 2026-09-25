import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAlbumStore } from '../../store/albumStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useCinemaStore } from '../../store/cinemaStore';
import { useLutStore } from '../../store/lutStore';
import { BUILTIN_LUTS } from '../../utils/lutPresets';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  HelpCircle,
  Maximize,
  Minimize,
  Sparkles,
  Film,
} from 'lucide-react';
import clsx from 'clsx';

export const CinemaHud: React.FC = () => {
  const { photos, currentIndex, prevPhoto, nextPhoto } = useAlbumStore();
  const { selections, lastTriageFeedback, toggleSelect, setMaybe, setSkipped } = useSelectionStore();
  const { isCinemaMode, exitCinemaMode, isNativeFullscreen, toggleNativeFullscreen } = useCinemaStore();
  const { activeLutId, isEnabled: isLutEnabled, toggleEnabled: toggleLutEnabled, customLuts } = useLutStore();

  const [isVisible, setIsVisible] = useState<boolean>(true);
  const [showToast, setShowToast] = useState<boolean>(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringHudRef = useRef<boolean>(false);

  const currentPhoto = photos[currentIndex];
  const currentSelection = currentPhoto ? selections[currentPhoto.id] : null;
  const selectionState = currentSelection?.state || 'unreviewed';
  const isRecentlyTriaged = Boolean(
    currentPhoto &&
      lastTriageFeedback &&
      lastTriageFeedback.photoId === currentPhoto.id &&
      Date.now() - lastTriageFeedback.timestamp < 500,
  );

  // 获取当前生效的 LUT 名称
  const currentBuiltinLut = BUILTIN_LUTS.find((l) => l.id === activeLutId);
  const currentCustomLut = customLuts.find((l) => l.id === activeLutId);
  const lutName = currentBuiltinLut?.name || currentCustomLut?.name;

  // 鼠标无活动 2.5 秒后自动淡出控制条与鼠标光标
  const resetHideTimer = useCallback(() => {
    setIsVisible(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => {
      if (!isHoveringHudRef.current) {
        setIsVisible(false);
      }
    }, 2500);
  }, []);

  useEffect(() => {
    if (!isCinemaMode) return;

    // 初次开启时显示 2.2 秒提示 Toast
    setShowToast(true);
    const toastTimer = setTimeout(() => setShowToast(false), 2400);

    const handleMouseMove = () => {
      resetHideTimer();
    };

    window.addEventListener('mousemove', handleMouseMove);
    resetHideTimer();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      clearTimeout(toastTimer);
    };
  }, [isCinemaMode, resetHideTimer]);

  if (!isCinemaMode || !currentPhoto) return null;

  return (
    <>
      {/* 首次进入的优雅浮动提示 Toast */}
      <div
        className={clsx(
          'fixed top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-500 ease-out',
          showToast ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3',
        )}
      >
        <div className="flex items-center space-x-2 px-4 py-2 rounded-full bg-dark-900/90 border border-white/15 backdrop-blur-xl shadow-2xl text-xs text-slate-200 font-sans">
          <Film className="w-3.5 h-3.5 text-brand-400" />
          <span>沉浸看片模式已开启</span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-300">按 <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[10px]">Tab</kbd> 或 <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[10px]">Esc</kbd> 退出</span>
        </div>
      </div>

      {/* 底部悬浮极简磨砂控制胶囊 */}
      <div
        onMouseEnter={() => {
          isHoveringHudRef.current = true;
          setIsVisible(true);
          if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        }}
        onMouseLeave={() => {
          isHoveringHudRef.current = false;
          resetHideTimer();
        }}
        className={clsx(
          'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] select-none',
          isVisible
            ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
            : 'opacity-0 translate-y-4 scale-95 pointer-events-none',
        )}
      >
        <div className="flex items-center gap-3 px-3.5 py-2 rounded-2xl bg-dark-950/80 hover:bg-dark-950/90 border border-white/12 backdrop-blur-2xl shadow-[0_12px_40px_rgba(0,0,0,0.8)] text-white text-xs">
          {/* 左侧：退出按钮 & 当前照片计数与文件 */}
          <div className="flex items-center space-x-2.5 pr-2.5 border-r border-white/10">
            <button
              onClick={exitCinemaMode}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 transition-colors cursor-pointer"
              title="退出沉浸模式 (Esc / Tab)"
              aria-label="退出沉浸模式"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex flex-col">
              <div className="flex items-center space-x-1.5">
                <span className="font-mono font-semibold text-slate-200">
                  {currentIndex + 1}
                </span>
                <span className="text-slate-500 text-[10px]">/</span>
                <span className="font-mono text-slate-400 text-[11px]">
                  {photos.length}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono truncate max-w-[130px]" title={currentPhoto.filename}>
                {currentPhoto.filename}
              </span>
            </div>
          </div>

          {/* 中间：翻页 & 快速选片操作 (空格 / M / N) */}
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => prevPhoto()}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="上一张 (← / K)"
              aria-label="上一张"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* 标记选中 (Pick) */}
            <button
              key={isRecentlyTriaged && selectionState === 'selected' && lastTriageFeedback ? `pick-${lastTriageFeedback.timestamp}` : 'pick'}
              onClick={() => toggleSelect(currentPhoto.id)}
              className={clsx(
                'flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer text-xs',
                selectionState === 'selected'
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 font-semibold'
                  : 'bg-white/5 text-slate-300 hover:bg-emerald-500/20 hover:text-emerald-300',
                isRecentlyTriaged && selectionState === 'selected' && 'animate-triage-pop',
              )}
              title="标记为精选 (空格键)"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>入选</span>
            </button>

            {/* 标记待定 (Maybe) */}
            <button
              key={isRecentlyTriaged && selectionState === 'maybe' && lastTriageFeedback ? `maybe-${lastTriageFeedback.timestamp}` : 'maybe'}
              onClick={() => setMaybe(currentPhoto.id)}
              className={clsx(
                'flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer text-xs',
                selectionState === 'maybe'
                  ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30 font-semibold'
                  : 'bg-white/5 text-slate-300 hover:bg-amber-500/20 hover:text-amber-300',
                isRecentlyTriaged && selectionState === 'maybe' && 'animate-triage-pop',
              )}
              title="标记为待定 (M 键)"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>待定</span>
            </button>

            {/* 标记不选 (Discard) */}
            <button
              key={isRecentlyTriaged && selectionState === 'skipped' && lastTriageFeedback ? `skip-${lastTriageFeedback.timestamp}` : 'skip'}
              onClick={() => setSkipped(currentPhoto.id)}
              className={clsx(
                'flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-medium transition-all cursor-pointer text-xs',
                selectionState === 'skipped'
                  ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30 font-semibold'
                  : 'bg-white/5 text-slate-300 hover:bg-rose-500/20 hover:text-rose-300',
                isRecentlyTriaged && selectionState === 'skipped' && 'animate-triage-pop',
              )}
              title="标记为淘汰 (N 键)"
            >
              <X className="w-3.5 h-3.5" />
              <span>淘汰</span>
            </button>

            <button
              onClick={() => nextPhoto()}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="下一张 (→ / J)"
              aria-label="下一张"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* 右侧：调色状态 & 原生全屏切换 */}
          <div className="flex items-center space-x-1.5 pl-2.5 border-l border-white/10">
            {activeLutId && (
              <button
                onClick={toggleLutEnabled}
                className={clsx(
                  'flex items-center space-x-1 px-2 py-1 rounded-lg text-[11px] font-sans transition-all cursor-pointer',
                  isLutEnabled
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                    : 'bg-white/5 text-slate-400 opacity-60',
                )}
                title={`3D LUT 胶片调色: ${lutName || '已启用'} (按 L 切换)`}
              >
                <Sparkles className="w-3 h-3 text-indigo-400" />
                <span className="hidden sm:inline max-w-[80px] truncate">{lutName || 'LUT'}</span>
              </button>
            )}

            <button
              onClick={() => void toggleNativeFullscreen()}
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title={isNativeFullscreen ? '退出操作系统全屏' : '进入操作系统全屏'}
              aria-label="切换操作系统全屏"
            >
              {isNativeFullscreen ? (
                <Minimize className="w-4 h-4" />
              ) : (
                <Maximize className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
