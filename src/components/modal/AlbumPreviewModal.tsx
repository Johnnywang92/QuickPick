import React, { useState, useMemo, useEffect } from 'react';
import { useAlbumStore } from '../../store/albumStore';
import { useSelectionStore } from '../../store/selectionStore';
import { usePreviewStore } from '../../store/previewStore';
import { generateAlbumSpreads, AlbumSpread } from '../../utils/albumLayout';
import { LocalPhoto } from '../../types/photo';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  X,
  Sparkles,
  Bookmark,
  Camera,
  Maximize2,
  Scan,
} from 'lucide-react';
import clsx from 'clsx';

interface AlbumPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AlbumTheme = 'ivory' | 'obsidian' | 'linen';
type PhotoFitMode = 'contain' | 'cover';

const SpreadPhotoItem: React.FC<{
  photo: LocalPhoto;
  className?: string;
  fitMode: PhotoFitMode;
  theme: AlbumTheme;
}> = ({ photo, className, fitMode, theme }) => {
  const [url, setUrl] = useState<string | null>(null);
  const getPreview = usePreviewStore((state) => state.getPreview);

  useEffect(() => {
    let mounted = true;
    getPreview(photo).then((res) => {
      if (mounted) setUrl(res);
    });
    return () => {
      mounted = false;
    };
  }, [photo, getPreview]);

  const isDarkTheme = theme === 'obsidian';

  return (
    <div
      className={clsx(
        'relative w-full h-full min-h-0 min-w-0 flex items-center justify-center overflow-hidden transition-all duration-300',
        fitMode === 'contain'
          ? 'p-2 md:p-3'
          : 'p-0.5',
        className,
      )}
    >
      {url ? (
        <div
          className={clsx(
            'relative flex items-center justify-center transition-transform hover:scale-[1.01] duration-200',
            fitMode === 'contain'
              ? clsx(
                  'max-w-full max-h-full p-1.5 md:p-2 rounded-xs shadow-[0_6px_20px_rgba(0,0,0,0.18)]',
                  isDarkTheme
                    ? 'bg-[#222226] ring-1 ring-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.5)]'
                    : 'bg-white ring-1 ring-black/5 shadow-[0_6px_20px_rgba(0,0,0,0.12)]',
                )
              : 'w-full h-full shadow-md rounded-xs overflow-hidden',
          )}
        >
          <img
            src={url}
            alt={photo.filename}
            className={clsx(
              'select-none pointer-events-none transition-all',
              fitMode === 'contain'
                ? 'max-w-full max-h-full object-contain rounded-xs'
                : 'w-full h-full object-cover',
            )}
          />
        </div>
      ) : (
        <div
          className={clsx(
            'w-full h-full flex flex-col items-center justify-center p-4 rounded-xs border border-dashed animate-pulse',
            isDarkTheme
              ? 'bg-dark-900/60 border-dark-700 text-slate-500'
              : 'bg-stone-200/40 border-stone-300 text-stone-500',
          )}
        >
          <div className="w-6 h-6 rounded-full border-2 border-amber-500/40 border-t-amber-500 animate-spin mb-2" />
          <span className="text-[10px] font-mono truncate max-w-[140px]">{photo.filename}</span>
        </div>
      )}
    </div>
  );
};

export const AlbumPreviewModal: React.FC<AlbumPreviewModalProps> = ({ isOpen, onClose }) => {
  const { photos, scenes } = useAlbumStore();
  const { selections } = useSelectionStore();

  const [theme, setTheme] = useState<AlbumTheme>('ivory');
  const [fitMode, setFitMode] = useState<PhotoFitMode>('contain');

  const selectedPhotos = useMemo(() => {
    return photos.filter((p) => selections[p.id]?.state === 'selected');
  }, [photos, selections]);

  const plan = useMemo(() => {
    return generateAlbumSpreads(selectedPhotos, scenes, photos);
  }, [selectedPhotos, scenes, photos]);

  const [currentSpreadIndex, setCurrentSpreadIndex] = useState(0);

  // 键盘翻页与快捷键
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        setCurrentSpreadIndex((idx) => Math.max(0, idx - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        setCurrentSpreadIndex((idx) => Math.min(plan.spreads.length - 1, idx + 1));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, plan.spreads.length, onClose]);

  if (!isOpen) return null;

  const currentSpread: AlbumSpread | undefined = plan.spreads[currentSpreadIndex];

  // 风格配置映射
  const themeStyles = {
    ivory: {
      bookBg: 'bg-[#faf8f4]',
      leftGradient: 'from-black/[0.04] via-transparent to-black/[0.08]',
      rightGradient: 'from-black/[0.08] via-transparent to-black/[0.04]',
      gutter: 'from-black/15 via-black/35 to-black/15',
      spineLine: 'bg-black/20',
      textPrimary: 'text-stone-800',
      textSecondary: 'text-stone-500',
      border: 'border-[#e4dfd5]',
      goldAccent: 'text-amber-700',
      pageStack: 'border-b-[#ded8ce] border-r-[#ded8ce]',
    },
    obsidian: {
      bookBg: 'bg-[#151518]',
      leftGradient: 'from-white/[0.02] via-transparent to-black/40',
      rightGradient: 'from-black/40 via-transparent to-white/[0.02]',
      gutter: 'from-black/60 via-black/90 to-black/60',
      spineLine: 'bg-black/80',
      textPrimary: 'text-stone-100',
      textSecondary: 'text-stone-400',
      border: 'border-dark-750',
      goldAccent: 'text-amber-400',
      pageStack: 'border-b-dark-800 border-r-dark-800',
    },
    linen: {
      bookBg: 'bg-[#f4efe4]',
      leftGradient: 'from-stone-900/[0.05] via-transparent to-stone-900/[0.09]',
      rightGradient: 'from-stone-900/[0.09] via-transparent to-stone-900/[0.05]',
      gutter: 'from-stone-900/20 via-stone-900/40 to-stone-900/20',
      spineLine: 'bg-stone-900/30',
      textPrimary: 'text-stone-900',
      textSecondary: 'text-stone-600',
      border: 'border-[#dcd4c6]',
      goldAccent: 'text-amber-800',
      pageStack: 'border-b-[#d5cbbd] border-r-[#d5cbbd]',
    },
  }[theme];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="album-simulator-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 md:p-6 backdrop-blur-md select-none animate-in fade-in duration-150"
    >
      <div className="w-full max-w-6xl bg-dark-950 border border-dark-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] text-slate-200">
        {/* 顶部标题与控制栏 */}
        <header className="flex flex-wrap items-center justify-between px-6 py-3 border-b border-dark-750 bg-dark-900/95 shrink-0 gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shadow-xs">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 id="album-simulator-title" className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>虚拟实体画册跨页排版模拟器</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-[10px] font-bold">
                  方正精装 12×12
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                真实模拟顶级精装相册装订质感、中缝立体光影与无裁切艺术装裱
              </p>
            </div>
          </div>

          {/* 中间调色与装帧控制项 */}
          <div className="flex items-center gap-2">
            {/* 纸张材质切换 */}
            <div className="flex items-center bg-dark-800 rounded-lg p-0.5 border border-dark-700 text-xs">
              <button
                onClick={() => setTheme('ivory')}
                className={clsx(
                  'px-2.5 py-1 rounded-md transition-all font-medium flex items-center gap-1 cursor-pointer',
                  theme === 'ivory'
                    ? 'bg-amber-500/20 text-amber-300 shadow-xs border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200',
                )}
                title="经典雅白：象牙艺术微喷纸质感"
              >
                <span className="w-2 h-2 rounded-full bg-[#faf8f4] inline-block border border-slate-400" />
                象牙雅白
              </button>
              <button
                onClick={() => setTheme('obsidian')}
                className={clsx(
                  'px-2.5 py-1 rounded-md transition-all font-medium flex items-center gap-1 cursor-pointer',
                  theme === 'obsidian'
                    ? 'bg-amber-500/20 text-amber-300 shadow-xs border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200',
                )}
                title="黑曜典藏：沉稳黑卡高反差艺术画册"
              >
                <span className="w-2 h-2 rounded-full bg-[#151518] inline-block border border-amber-500/40" />
                黑曜典藏
              </button>
              <button
                onClick={() => setTheme('linen')}
                className={clsx(
                  'px-2.5 py-1 rounded-md transition-all font-medium flex items-center gap-1 cursor-pointer',
                  theme === 'linen'
                    ? 'bg-amber-500/20 text-amber-300 shadow-xs border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200',
                )}
                title="燕麦亚麻：温润织物布纹质感"
              >
                <span className="w-2 h-2 rounded-full bg-[#f4efe4] inline-block border border-stone-400" />
                燕麦亚麻
              </button>
            </div>

            {/* 完整呈现 vs 满版裁切切换 */}
            <div className="flex items-center bg-dark-800 rounded-lg p-0.5 border border-dark-700 text-xs">
              <button
                onClick={() => setFitMode('contain')}
                className={clsx(
                  'px-2.5 py-1 rounded-md transition-all font-medium flex items-center gap-1.5 cursor-pointer',
                  fitMode === 'contain'
                    ? 'bg-brand-600/30 text-brand-300 border border-brand-500/40'
                    : 'text-slate-400 hover:text-slate-200',
                )}
                title="原片全貌（推荐）：保留全部构图与人物细节，绝不切头切脚"
              >
                <Scan className="w-3 h-3" />
                <span>原片全貌</span>
              </button>
              <button
                onClick={() => setFitMode('cover')}
                className={clsx(
                  'px-2.5 py-1 rounded-md transition-all font-medium flex items-center gap-1.5 cursor-pointer',
                  fitMode === 'cover'
                    ? 'bg-brand-600/30 text-brand-300 border border-brand-500/40'
                    : 'text-slate-400 hover:text-slate-200',
                )}
                title="满版出血：填满画册页面，视觉冲击力更强"
              >
                <Maximize2 className="w-3 h-3" />
                <span>满版铺满</span>
              </button>
            </div>

            {/* 跨页页码指示 */}
            <div className="px-3 py-1 bg-dark-800 border border-dark-700 rounded-lg text-xs font-mono text-slate-300">
              跨页 {plan.spreads.length > 0 ? currentSpreadIndex + 1 : 0} / {plan.spreads.length}
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* 画册立体舞台 */}
        <main className="flex-1 flex items-center justify-center p-4 md:p-8 bg-gradient-to-b from-dark-900 via-dark-950 to-dark-900 overflow-hidden relative">
          {plan.spreads.length === 0 ? (
            <div className="text-center p-8 max-w-md text-slate-400 space-y-3">
              <Bookmark className="w-12 h-12 mx-auto text-amber-500/40 mb-2" />
              <h3 className="font-bold text-slate-200 text-base">暂未选择入选照片</h3>
              <p className="text-xs leading-relaxed text-slate-400">
                在主工作台中按 <kbd className="px-1.5 py-0.5 bg-dark-800 border border-dark-600 rounded text-amber-300">空格键</kbd> 标记精选照片，画册模拟器将自动为您生成高定跨页排版！
              </p>
            </div>
          ) : (
            <div
              className={clsx(
                'relative w-full max-w-5xl aspect-[16/10] rounded-lg flex overflow-hidden transition-all duration-300',
                themeStyles.bookBg,
                themeStyles.pageStack,
                'border-b-[5px] border-r-[5px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.08)] ring-1 ring-black/20',
              )}
            >
              {/* 中缝装订立体真实凹陷折痕与高光 */}
              <div
                className={clsx(
                  'absolute inset-y-0 left-1/2 -translate-x-1/2 w-8 md:w-12 pointer-events-none z-20 shadow-inner bg-gradient-to-r',
                  themeStyles.gutter,
                )}
              >
                {/* 脊线压痕细线 */}
                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] bg-black/40 shadow-xs" />
              </div>

              {/* 跨页全景大片布局 (Panoramic Full-Spread) */}
              {currentSpread?.layoutType === 'panoramic' ? (
                <div className="w-full h-full relative flex items-center justify-center p-4 md:p-8">
                  <SpreadPhotoItem
                    photo={currentSpread.photos[0]}
                    fitMode={fitMode}
                    theme={theme}
                    className="w-full h-full"
                  />
                  {/* 全景页码 */}
                  <div
                    className={clsx(
                      'absolute bottom-3 left-6 text-[10px] font-serif font-medium tracking-wider z-20',
                      themeStyles.textSecondary,
                    )}
                  >
                    P. {currentSpread.leftPageNum} {currentSpread.sceneName && `· ${currentSpread.sceneName}`}
                  </div>
                  <div
                    className={clsx(
                      'absolute bottom-3 right-6 text-[10px] font-serif font-medium tracking-wider z-20',
                      themeStyles.textSecondary,
                    )}
                  >
                    P. {currentSpread.rightPageNum} · 双页全景大跨页
                  </div>
                </div>
              ) : (
                <>
                  {/* 左页面 (Left Page) */}
                  <div
                    className={clsx(
                      'flex-1 h-full p-4 md:p-6 flex flex-col justify-between relative border-r overflow-hidden min-h-0 min-w-0',
                      themeStyles.border,
                    )}
                  >
                    {/* 左页光影渐变 */}
                    <div
                      className={clsx(
                        'absolute inset-0 pointer-events-none bg-gradient-to-r',
                        themeStyles.leftGradient,
                      )}
                    />

                    {/* 左页内容区 */}
                    <div className="flex-1 flex items-center justify-center min-h-0 min-w-0 w-full relative z-10">
                      {currentSpread && (
                        <div className="w-full h-full min-h-0 min-w-0 flex items-center justify-center">
                          {currentSpread.layoutType === 'story_right' ? (
                            /* 左 2 图纵向并列网格，确保 100% 容纳无溢出 */
                            <div className="grid grid-rows-2 gap-2.5 md:gap-3.5 w-full h-full min-h-0">
                              {currentSpread.photos.slice(0, 2).map((p) => (
                                <SpreadPhotoItem
                                  key={p.id}
                                  photo={p}
                                  fitMode={fitMode}
                                  theme={theme}
                                  className="w-full h-full min-h-0"
                                />
                              ))}
                            </div>
                          ) : currentSpread.layoutType === 'grid4' ? (
                            /* 四图布局左侧 2 图网格 */
                            <div className="grid grid-cols-2 gap-2 w-full h-full min-h-0">
                              {currentSpread.photos.slice(0, 2).map((p) => (
                                <SpreadPhotoItem
                                  key={p.id}
                                  photo={p}
                                  fitMode={fitMode}
                                  theme={theme}
                                  className="w-full h-full min-h-0"
                                />
                              ))}
                            </div>
                          ) : (
                            /* 单图主图 */
                            <SpreadPhotoItem
                              photo={currentSpread.photos[0]}
                              fitMode={fitMode}
                              theme={theme}
                              className="w-full h-full min-h-0"
                            />
                          )}
                        </div>
                      )}
                    </div>

                    {/* 左页底标 */}
                    <div
                      className={clsx(
                        'text-[10px] font-serif tracking-widest pl-2 pt-2 relative z-10 flex items-center justify-between',
                        themeStyles.textSecondary,
                      )}
                    >
                      <span>P. {currentSpread?.leftPageNum}</span>
                      <span className="font-mono text-[9px] uppercase tracking-wider">
                        {currentSpread?.sceneName || 'Curated Portfolio'}
                      </span>
                    </div>
                  </div>

                  {/* 右页面 (Right Page) */}
                  <div className="flex-1 h-full p-4 md:p-6 flex flex-col justify-between relative overflow-hidden min-h-0 min-w-0">
                    {/* 右页光影渐变 */}
                    <div
                      className={clsx(
                        'absolute inset-0 pointer-events-none bg-gradient-to-r',
                        themeStyles.rightGradient,
                      )}
                    />

                    {/* 右页内容区 */}
                    <div className="flex-1 flex items-center justify-center min-h-0 min-w-0 w-full relative z-10">
                      {currentSpread && (
                        <div className="w-full h-full min-h-0 min-w-0 flex items-center justify-center">
                          {currentSpread.layoutType === 'hero' ? (
                            /* 单图精装艺术扉页：告别惨白背景，呈现专属高定版画排版 */
                            <div className="flex flex-col items-center justify-center text-center p-6 md:p-8 max-w-sm w-full space-y-4">
                              {/* 烫金奢华勋章 */}
                              <div className="flex flex-col items-center">
                                <div className={clsx('text-xl tracking-widest mb-1', themeStyles.goldAccent)}>
                                  ❖ ❖ ❖
                                </div>
                                <span className={clsx('text-[10px] tracking-[0.25em] uppercase font-mono font-bold', themeStyles.goldAccent)}>
                                  Master Collection
                                </span>
                              </div>

                              {/* 篇章大标题 */}
                              <div className="space-y-1">
                                <h3 className={clsx('font-serif italic text-2xl md:text-3xl font-bold tracking-wide', themeStyles.textPrimary)}>
                                  {currentSpread.sceneName || 'Moments of Eternity'}
                                </h3>
                                <p className={clsx('text-[10px] uppercase tracking-widest font-mono', themeStyles.textSecondary)}>
                                  Pure Photographic Memoir
                                </p>
                              </div>

                              {/* 优雅分隔修饰线 */}
                              <div className="flex items-center w-36 gap-2 opacity-50 my-1">
                                <div className="h-[1px] bg-current flex-1" />
                                <span className="text-[9px]">✦</span>
                                <div className="h-[1px] bg-current flex-1" />
                              </div>

                              {/* 摄影创作参数卡片 */}
                              {currentSpread.photos[0] && (
                                <div
                                  className={clsx(
                                    'px-4 py-2.5 rounded-lg text-left text-[10px] font-mono space-y-1 border',
                                    theme === 'obsidian'
                                      ? 'bg-dark-900/60 border-dark-750 text-slate-400'
                                      : 'bg-white/60 border-stone-300/80 text-stone-600 shadow-2xs',
                                  )}
                                >
                                  <div className="flex items-center gap-1.5 font-bold truncate">
                                    <Camera className="w-3 h-3 text-amber-500 shrink-0" />
                                    <span className="truncate">{currentSpread.photos[0].filename}</span>
                                  </div>
                                  <div className="flex items-center justify-between text-[9px] opacity-80 pt-0.5">
                                    <span>格式: {currentSpread.photos[0].format.toUpperCase()}</span>
                                    <span>{currentSpread.photos[0].isRaw ? 'RAW 原片' : '高精直出'}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : currentSpread.layoutType === 'story_left' ? (
                            /* 左 1 右 2 布局：使用 CSS Grid 严格按两行排列，保证第 2、3 张照片全部完整渲染 */
                            <div className="grid grid-rows-2 gap-2.5 md:gap-3.5 w-full h-full min-h-0">
                              {currentSpread.photos.slice(1, 3).map((p) => (
                                <SpreadPhotoItem
                                  key={p.id}
                                  photo={p}
                                  fitMode={fitMode}
                                  theme={theme}
                                  className="w-full h-full min-h-0"
                                />
                              ))}
                            </div>
                          ) : currentSpread.layoutType === 'grid4' ? (
                            /* 四图情绪画板右侧 2 图网格 */
                            <div className="grid grid-cols-2 gap-2 w-full h-full min-h-0">
                              {currentSpread.photos.slice(2, 4).map((p) => (
                                <SpreadPhotoItem
                                  key={p.id}
                                  photo={p}
                                  fitMode={fitMode}
                                  theme={theme}
                                  className="w-full h-full min-h-0"
                                />
                              ))}
                            </div>
                          ) : (
                            /* 经典双图对开右页 */
                            currentSpread.photos[1] && (
                              <SpreadPhotoItem
                                photo={currentSpread.photos[1]}
                                fitMode={fitMode}
                                theme={theme}
                                className="w-full h-full min-h-0"
                              />
                            )
                          )}
                        </div>
                      )}
                    </div>

                    {/* 右页底标 */}
                    <div
                      className={clsx(
                        'text-[10px] font-serif tracking-widest pr-2 pt-2 relative z-10 flex items-center justify-between',
                        themeStyles.textSecondary,
                      )}
                    >
                      <span className="font-mono text-[9px] uppercase tracking-wider">
                        Fine Art Binding
                      </span>
                      <span>P. {currentSpread?.rightPageNum}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 左右翻页浮动按钮 */}
          {plan.spreads.length > 1 && (
            <>
              <button
                disabled={currentSpreadIndex === 0}
                onClick={() => setCurrentSpreadIndex((idx) => Math.max(0, idx - 1))}
                className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-dark-800/85 hover:bg-dark-700 disabled:opacity-20 text-slate-100 shadow-2xl border border-dark-600 transition-all cursor-pointer hover:scale-105 active:scale-95 z-30"
                title="上一跨页 (← 或 A)"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <button
                disabled={currentSpreadIndex === plan.spreads.length - 1}
                onClick={() => setCurrentSpreadIndex((idx) => Math.min(plan.spreads.length - 1, idx + 1))}
                className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-dark-800/85 hover:bg-dark-700 disabled:opacity-20 text-slate-100 shadow-2xl border border-dark-600 transition-all cursor-pointer hover:scale-105 active:scale-95 z-30"
                title="下一跨页 (→ 或 D)"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}
        </main>

        {/* 底部功能栏 */}
        <footer className="px-6 py-3 border-t border-dark-750 bg-dark-900/95 flex flex-wrap items-center justify-between shrink-0 gap-3">
          <div className="flex items-center space-x-2 text-xs text-amber-200/90">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{plan.adviceMessage}</span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer active:scale-95"
            >
              完成预览
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
