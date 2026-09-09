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
      color: 'text-blue-300 bg-blue-500/10 border-blue-500/25',
    },
    {
      filter: 'maybe' as const,
      title: '待考虑',
      description: '重新判断暂时拿不准的照片，完成最终选择。',
      count: stats.maybeCount,
      detail: `${stats.maybeCount} 张`,
      icon: HelpCircle,
      color: 'text-amber-300 bg-amber-500/10 border-amber-500/25',
    },
    {
      filter: 'burst' as const,
      title: '相似连拍',
      description: '按相似连拍筛选，进入双图比较挑选更好的瞬间。',
      count: reviewCounts.burstPhotos,
      detail: `${reviewCounts.burstGroups} 组 · ${reviewCounts.burstPhotos} 张`,
      icon: Layers,
      color: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/25',
    },
    {
      filter: 'needs_check' as const,
      title: '辅助检查',
      description: '复核本地分析提示；提示不会替你选择或排除照片。',
      count: reviewCounts.needsCheck,
      detail: `${reviewCounts.needsCheck} 张`,
      icon: AlertCircle,
      color: 'text-rose-300 bg-rose-500/10 border-rose-500/25',
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
            <ListChecks className="h-5 w-5 text-brand-400" />
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
            className="rounded-lg p-1.5 text-slate-400 hover:bg-dark-700 hover:text-slate-100"
            aria-label="关闭复核中心"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          <div
            className={`mb-4 flex items-start gap-2 rounded-xl border px-3.5 py-3 text-xs ${
              readyToExport
                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                : 'border-amber-500/25 bg-amber-500/10 text-amber-200'
            }`}
          >
            {readyToExport ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>
              {readyToExport
                ? '所有照片都已查看，待考虑队列也已清空。'
                : `还有 ${stats.unreviewedCount} 张未查看、${stats.maybeCount} 张待考虑；导出时需要明确确认后才能继续。`}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {queues.map((queue) => {
              const Icon = queue.icon;
              return (
                <button
                  key={queue.filter}
                  type="button"
                  disabled={queue.count === 0}
                  onClick={() => openReviewQueue(queue.filter)}
                  className={`rounded-xl border p-4 text-left transition-colors hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-40 ${queue.color}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-xs font-semibold">
                      <Icon className="h-4 w-4" />
                      {queue.title}
                    </span>
                    <span className="font-mono text-[11px] font-semibold">{queue.detail}</span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{queue.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
