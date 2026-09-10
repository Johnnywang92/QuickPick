import React, { useEffect, useMemo } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  EyeOff,
  HelpCircle,
  Layers,
  ListChecks,
  X,
} from 'lucide-react';
import { photoMatchesFilter, useAlbumStore } from '../../store/albumStore';
import { useInsightStore } from '../../store/insightStore';
import { useSelectionStore } from '../../store/selectionStore';
import { FilterCategory } from '../../types/photo';

interface ReviewCenterModalProps {
  onClose: () => void;
}

export const ReviewCenterModal: React.FC<ReviewCenterModalProps> = ({ onClose }) => {
  const { photos, scenes, setActiveFilter, setSelectedSceneId } = useAlbumStore();
  const { selections, viewedPhotoIds, getStats } = useSelectionStore();
  const { insights } = useInsightStore();
  const stats = getStats(photos.length);

  const reviewCounts = useMemo(() => {
    const burstGroupIds = new Set<string>();
    let burstPhotos = 0;
    let needsCheck = 0;

    photos.forEach((photo, index) => {
      if (photo.burstGroupId) {
        burstGroupIds.add(photo.burstGroupId);
        burstPhotos += 1;
      }
      if (
        photoMatchesFilter(
          photo,
          index,
          'needs_check',
          null,
          scenes,
          selections,
          viewedPhotoIds,
          insights,
        )
      ) {
        needsCheck += 1;
      }
    });

    return {
      burstGroups: burstGroupIds.size,
      burstPhotos,
      needsCheck,
    };
  }, [insights, photos, scenes, selections, viewedPhotoIds]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const openReviewQueue = (filter: FilterCategory) => {
    setSelectedSceneId(null);
    setActiveFilter(filter);
    onClose();
  };

  const queues = [
    {
      filter: 'unreviewed' as const,
      title: '尚未查看',
      description: '逐张检查还没有打开过的照片，避免遗漏场景。',
      count: stats.unreviewedCount,
      detail: `${stats.unreviewedCount} 张`,
      icon: EyeOff,
      cardClasses:
        'border-blue-200/90 bg-blue-50/60 hover:bg-blue-100/70 hover:border-blue-300 dark:border-blue-500/25 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 dark:hover:border-blue-500/40',
      titleColor: 'text-blue-900 dark:text-blue-100',
      iconColor: 'text-blue-600 dark:text-blue-400',
      badgeClasses:
        'bg-blue-100/90 text-blue-800 border border-blue-200/80 dark:bg-blue-500/20 dark:text-blue-200 dark:border-blue-500/30',
    },
    {
      filter: 'maybe' as const,
      title: '待考虑',
      description: '重新判断暂时拿不准的照片，完成最终选择。',
      count: stats.maybeCount,
      detail: `${stats.maybeCount} 张`,
      icon: HelpCircle,
      cardClasses:
        'border-amber-200/90 bg-amber-50/60 hover:bg-amber-100/70 hover:border-amber-300 dark:border-amber-500/25 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 dark:hover:border-amber-500/40',
      titleColor: 'text-amber-900 dark:text-amber-100',
      iconColor: 'text-amber-600 dark:text-amber-400',
      badgeClasses:
        'bg-amber-100/90 text-amber-800 border border-amber-200/80 dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-500/30',
    },
    {
      filter: 'burst' as const,
      title: '相似连拍',
      description: '按相似连拍筛选，进入双图比较挑选更好的瞬间。',
      count: reviewCounts.burstPhotos,
      detail: `${reviewCounts.burstGroups} 组 · ${reviewCounts.burstPhotos} 张`,
      icon: Layers,
      cardClasses:
        'border-indigo-200/90 bg-indigo-50/60 hover:bg-indigo-100/70 hover:border-indigo-300 dark:border-indigo-500/25 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 dark:hover:border-indigo-500/40',
      titleColor: 'text-indigo-900 dark:text-indigo-100',
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      badgeClasses:
        'bg-indigo-100/90 text-indigo-800 border border-indigo-200/80 dark:bg-indigo-500/20 dark:text-indigo-200 dark:border-indigo-500/30',
    },
    {
      filter: 'needs_check' as const,
      title: '辅助检查',
      description: '复核本地分析提示；提示不会替你选择或排除照片。',
      count: reviewCounts.needsCheck,
      detail: `${reviewCounts.needsCheck} 张`,
      icon: AlertCircle,
      cardClasses:
        'border-rose-200/90 bg-rose-50/60 hover:bg-rose-100/70 hover:border-rose-300 dark:border-rose-500/25 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 dark:hover:border-rose-500/40',
      titleColor: 'text-rose-900 dark:text-rose-100',
      iconColor: 'text-rose-600 dark:text-rose-400',
      badgeClasses:
        'bg-rose-100/90 text-rose-800 border border-rose-200/80 dark:bg-rose-500/20 dark:text-rose-200 dark:border-rose-500/30',
    },
  ];

  const readyToExport = stats.unreviewedCount === 0 && stats.maybeCount === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-center-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-dark-700 bg-dark-850 shadow-2xl">
        <div className="flex items-center justify-between border-b border-dark-700/80 bg-dark-900/60 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <ListChecks className="h-5 w-5" />
            </div>
            <div>
              <h2 id="review-center-title" className="text-sm font-bold text-slate-100">
                复核中心
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-400">集中检查遗漏、犹豫项和需要对比的照片</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-dark-750 hover:text-slate-100 transition-colors cursor-pointer"
            aria-label="关闭复核中心"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          <div
            className={`mb-4 flex items-start gap-3 rounded-xl border px-3.5 py-3 text-xs font-medium transition-colors ${
              readyToExport
                ? 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-200'
                : 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200'
            }`}
          >
            {readyToExport ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            )}
            <div className="flex-1 leading-relaxed">
              {readyToExport ? (
                <span>所有照片都已查看，待考虑队列也已清空。</span>
              ) : (
                <span>
                  还有 <strong className="font-bold underline decoration-amber-400/60 decoration-2">{stats.unreviewedCount}</strong> 张未查看、
                  <strong className="font-bold underline decoration-amber-400/60 decoration-2">{stats.maybeCount}</strong> 张待考虑；导出时需要明确确认后才能继续。
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {queues.map((queue) => {
              const Icon = queue.icon;
              const isEmpty = queue.count === 0;

              return (
                <button
                  key={queue.filter}
                  type="button"
                  disabled={isEmpty}
                  onClick={() => openReviewQueue(queue.filter)}
                  className={`group relative rounded-xl border p-4 text-left transition-all duration-150 ${
                    isEmpty
                      ? 'cursor-not-allowed opacity-60 grayscale-[30%] border-dark-700/50 bg-dark-800/30 dark:border-dark-700/60 dark:bg-dark-900/30'
                      : `cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 ${queue.cardClasses}`
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`flex items-center gap-2 text-xs font-bold ${
                        isEmpty ? 'text-slate-400' : queue.titleColor
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          isEmpty ? 'text-slate-400' : queue.iconColor
                        }`}
                      />
                      {queue.title}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold ${
                        isEmpty
                          ? 'bg-slate-200/70 text-slate-500 border border-slate-300/50 dark:bg-dark-800 dark:text-slate-400 dark:border-dark-700'
                          : queue.badgeClasses
                      }`}
                    >
                      {queue.detail}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
                    {queue.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
