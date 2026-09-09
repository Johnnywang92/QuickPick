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
} from 'lucide-react';
import clsx from 'clsx';

interface AlbumPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SpreadPhotoItem: React.FC<{ photo: LocalPhoto; className?: string }> = ({
  photo,
  className,
}) => {
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

  return (
    <div
      className={clsx(
        'relative bg-dark-900/40 border border-slate-300/40 rounded-sm overflow-hidden shadow-md flex items-center justify-center transition-transform hover:scale-[1.01]',
        className,
      )}
    >
      {url ? (
        <img
          src={url}
          alt={photo.filename}
          className="w-full h-full object-cover select-none pointer-events-none"
        />
      ) : (
        <div className="text-[10px] font-mono text-slate-400 p-2 text-center truncate">
          {photo.filename}
        </div>
      )}
    </div>
  );
};

export const AlbumPreviewModal: React.FC<AlbumPreviewModalProps> = ({ isOpen, onClose }) => {
  const { photos, scenes } = useAlbumStore();
  const { selections } = useSelectionStore();

  const selectedPhotos = useMemo(() => {
    return photos.filter((p) => selections[p.id]?.state === 'selected');
  }, [photos, selections]);

  const plan = useMemo(() => {
    return generateAlbumSpreads(selectedPhotos, scenes, photos);
  }, [selectedPhotos, scenes, photos]);

  const [currentSpreadIndex, setCurrentSpreadIndex] = useState(0);

  // 键盘翻页监听
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        setCurrentSpreadIndex((idx) => Math.max(0, idx - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="album-simulator-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md select-none animate-in fade-in duration-150"
    >
      <div className="w-full max-w-5xl bg-dark-950 border border-dark-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-200">
        {/* 顶部标题栏 */}
        <header className="flex items-center justify-between px-6 py-3.5 border-b border-dark-750 bg-dark-900/90 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 id="album-simulator-title" className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>虚拟实体画册跨页排版模拟器</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-[10px] font-bold">
                  精装相册 12x12
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                根据横竖比例与叙事节奏模拟实体印刷对开效果 · 体验装订成册的记忆沉淀
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono text-slate-400 mr-2">
              跨页 {plan.spreads.length > 0 ? currentSpreadIndex + 1 : 0} / {plan.spreads.length}
            </span>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* 画册模拟展示舞台 */}
        <main className="flex-1 flex items-center justify-center p-6 bg-dark-900/60 overflow-hidden relative">
          {plan.spreads.length === 0 ? (
            <div className="text-center p-8 max-w-md text-slate-400 space-y-2">
              <Bookmark className="w-10 h-10 mx-auto text-amber-500/40 mb-2" />
              <h3 className="font-bold text-slate-200 text-sm">暂未选择入选照片</h3>
              <p className="text-xs">
                在主界面按空格键将喜欢的照片选入，画册模拟器将自动为您设计跨页对开排版！
              </p>
            </div>
          ) : (
            <div className="relative w-full max-w-4xl aspect-[16/10] bg-[#f8f6f0] text-slate-900 rounded-lg shadow-2xl border-8 border-dark-850 flex overflow-hidden ring-1 ring-white/10">
              {/* 中缝装订阴影 */}
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-8 bg-gradient-to-r from-black/15 via-black/25 to-black/15 pointer-events-none z-10 shadow-inner" />

              {/* 左页面 (Left Page) */}
              <div className="flex-1 h-full p-6 flex flex-col justify-between relative border-r border-slate-300/60">
                <div className="flex-1 flex items-center justify-center">
                  {currentSpread && (
                    <div className="w-full h-full flex items-center justify-center p-2">
                      {currentSpread.layoutType === 'hero' ? (
                        <SpreadPhotoItem photo={currentSpread.photos[0]} className="w-full h-full" />
                      ) : currentSpread.layoutType === 'story_left' ? (
                        <SpreadPhotoItem photo={currentSpread.photos[0]} className="w-full h-full" />
                      ) : currentSpread.layoutType === 'grid4' ? (
                        <div className="grid grid-cols-2 gap-2 w-full h-full">
                          {currentSpread.photos.slice(0, 2).map((p) => (
                            <SpreadPhotoItem key={p.id} photo={p} className="w-full h-full" />
                          ))}
                        </div>
                      ) : (
                        <SpreadPhotoItem photo={currentSpread.photos[0]} className="w-full h-full" />
                      )}
                    </div>
                  )}
                </div>
                {/* 左页码 */}
                <div className="text-[10px] font-serif text-slate-400 pl-2">
                  P. {currentSpread?.leftPageNum} {currentSpread?.sceneName && `· ${currentSpread.sceneName}`}
                </div>
              </div>

              {/* 右页面 (Right Page) */}
              <div className="flex-1 h-full p-6 flex flex-col justify-between relative">
                <div className="flex-1 flex items-center justify-center">
                  {currentSpread && (
                    <div className="w-full h-full flex items-center justify-center p-2">
                      {currentSpread.layoutType === 'hero' ? (
                        <div className="flex flex-col items-center justify-center text-center p-6 text-slate-400">
                          <span className="font-serif italic text-lg text-slate-600 mb-1">
                            {currentSpread.sceneName || 'Moments'}
                          </span>
                          <span className="text-[10px] tracking-widest uppercase font-mono">
                            Pure Photographic Memoir
                          </span>
                        </div>
                      ) : currentSpread.layoutType === 'story_left' ? (
                        <div className="flex flex-col gap-2 w-full h-full">
                          {currentSpread.photos.slice(1, 3).map((p) => (
                            <SpreadPhotoItem key={p.id} photo={p} className="w-full flex-1" />
                          ))}
                        </div>
                      ) : currentSpread.layoutType === 'grid4' ? (
                        <div className="grid grid-cols-2 gap-2 w-full h-full">
                          {currentSpread.photos.slice(2, 4).map((p) => (
                            <SpreadPhotoItem key={p.id} photo={p} className="w-full h-full" />
                          ))}
                        </div>
                      ) : (
                        currentSpread.photos[1] && (
                          <SpreadPhotoItem photo={currentSpread.photos[1]} className="w-full h-full" />
                        )
                      )}
                    </div>
                  )}
                </div>
                {/* 右页码 */}
                <div className="text-[10px] font-serif text-slate-400 text-right pr-2">
                  P. {currentSpread?.rightPageNum}
                </div>
              </div>
            </div>
          )}

          {/* 左右翻页浮动按钮 */}
          {plan.spreads.length > 1 && (
            <>
              <button
                disabled={currentSpreadIndex === 0}
                onClick={() => setCurrentSpreadIndex((idx) => Math.max(0, idx - 1))}
                className="absolute left-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-dark-800/80 hover:bg-dark-700 disabled:opacity-20 text-slate-200 shadow-xl border border-dark-600 transition-all cursor-pointer"
                title="上一跨页 (←)"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <button
                disabled={currentSpreadIndex === plan.spreads.length - 1}
                onClick={() => setCurrentSpreadIndex((idx) => Math.min(plan.spreads.length - 1, idx + 1))}
                className="absolute right-6 top-1/2 -translate-y-1/2 p-3 rounded-full bg-dark-800/80 hover:bg-dark-700 disabled:opacity-20 text-slate-200 shadow-xl border border-dark-600 transition-all cursor-pointer"
                title="下一跨页 (→)"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}
        </main>

        {/* 底部正向赋能引导栏 */}
        <footer className="px-6 py-3.5 border-t border-dark-750 bg-dark-900 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2 text-xs text-amber-200/90">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{plan.adviceMessage}</span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer"
            >
              完成预览
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
