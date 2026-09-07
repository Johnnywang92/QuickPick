import React, { useEffect, useRef } from 'react';
import { usePhotoStore } from '../../store/photoStore';
import { Check, X, Star } from 'lucide-react';

export const Filmstrip: React.FC = () => {
  const { photos, currentIndex, activeFilter, selectIndex } = usePhotoStore();
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 自动居中当前选中的缩略图卡片
    if (stripRef.current) {
      const activeEl = stripRef.current.children[currentIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({
          behavior: 'smooth',
          inline: 'center',
          block: 'nearest',
        });
      }
    }
  }, [currentIndex]);

  if (photos.length === 0) return null;

  return (
    <div
      ref={stripRef}
      className="flex items-center space-x-2 px-4 py-2 w-full overflow-x-auto no-scrollbar"
    >
      {photos.map((photo, idx) => {
        const isCurrent = idx === currentIndex;
        const matchesFilter =
          activeFilter === 'all' ||
          (activeFilter === 'pending' && photo.retouch_status === 'pending') ||
          (activeFilter === 'failed' && photo.retouch_status === 'failed') ||
          (activeFilter === 'clean' && photo.retouch_status === 'clean') ||
          (activeFilter === 'fixable' && photo.retouch_status === 'fixable') ||
          (activeFilter === 'fatal' && photo.retouch_status === 'fatal') ||
          (activeFilter === 'picked' && photo.pick_status === 'Pick');

        return (
          <div
            key={photo.id || photo.path}
            onClick={() => selectIndex(idx)}
            className={`flex-shrink-0 relative group cursor-pointer w-28 h-16 rounded-md border overflow-hidden transition-all duration-150 ${
              isCurrent
                ? 'border-brand-500 ring-2 ring-brand-500/40 bg-dark-700'
                : matchesFilter
                ? 'border-dark-700/80 hover:border-slate-500 bg-dark-800'
                : 'border-dark-800/40 bg-dark-900/50 opacity-40 hover:opacity-80'
            }`}
          >
            {/* 胶片卡片内容 */}
            <div className="w-full h-full flex flex-col justify-between p-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1">
                  <span className="text-[10px] font-mono text-slate-400">
                    #{idx + 1}
                  </span>
                  {/* 智能诊断状态指示点 */}
                  <span
                    title={`AI 诊断: ${
                      photo.retouch_status === 'clean'
                        ? '未见明显问题'
                        : photo.retouch_status === 'fixable'
                        ? '可修解决'
                        : photo.retouch_status === 'fatal'
                        ? '不可修硬伤'
                        : photo.retouch_status === 'failed'
                        ? '分析失败，可重试'
                        : '待分析'
                    }`}
                    className={`w-1.5 h-1.5 rounded-full ${
                      photo.retouch_status === 'clean'
                        ? 'bg-emerald-400'
                        : photo.retouch_status === 'fixable'
                        ? 'bg-amber-400'
                        : photo.retouch_status === 'fatal'
                        ? 'bg-rose-400'
                        : photo.retouch_status === 'failed'
                        ? 'bg-orange-400'
                        : 'bg-slate-400'
                    }`}
                  />
                  {photo.burst_group_id && (
                    <span className="text-[8px] px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                      连拍
                    </span>
                  )}
                </div>

                {/* Pick / Reject 标记 */}
                {photo.pick_status === 'Pick' && (
                  <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-emerald-500/20 text-emerald-400">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                )}
                {photo.pick_status === 'Reject' && (
                  <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-rose-500/20 text-rose-400">
                    <X className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                )}
              </div>

              <div className="truncate text-[10px] text-slate-300 font-mono">
                {photo.filename}
              </div>

              {/* 星级与色标底条 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-0.5">
                  {photo.rating > 0 ? (
                    <span className="flex items-center text-[10px] text-amber-400 font-medium space-x-0.5">
                      <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                      <span>{photo.rating}</span>
                    </span>
                  ) : (
                    <span className="text-[9px] text-slate-600">未评</span>
                  )}
                </div>

                {photo.color_label && (
                  <span
                    className={`w-2 h-2 rounded-full ${
                      photo.color_label === 'Red'
                        ? 'bg-rose-500'
                        : photo.color_label === 'Yellow'
                        ? 'bg-amber-400'
                        : photo.color_label === 'Green'
                        ? 'bg-emerald-500'
                        : 'bg-blue-500'
                    }`}
                  />
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
