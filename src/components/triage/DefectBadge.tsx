import React from 'react';
import { useAlbumStore } from '../../store/albumStore';
import { useInsightStore } from '../../store/insightStore';
import { Sparkles, AlertCircle, Layers, Loader2, RefreshCw } from 'lucide-react';

export const DefectBadge: React.FC = () => {
  const { photos, currentIndex } = useAlbumStore();
  const { getInsight, analyzeSinglePhoto } = useInsightStore();

  const currentPhoto = photos[currentIndex];
  if (!currentPhoto) return null;

  const insight = getInsight(currentPhoto.id);
  const reasons = insight?.reasons || [];

  const hasBlink = reasons.some((r) => r.includes('眼睛'));
  const hasBlur = reasons.some((r) => r.includes('模糊'));
  const hasBurst = !!currentPhoto.burstGroupId;
  const isBestPick = !!insight?.isBestPick;

  if (insight?.analysisStatus === 'pending') {
    return (
      <div className="flex items-center gap-2 rounded-full border border-dark-700/80 bg-dark-900/90 px-3 py-1 text-xs text-slate-400 shadow-lg backdrop-blur-md">
        <Loader2 className="h-3 w-3 animate-spin text-brand-400" />
        <span>正在后台检查这张照片</span>
      </div>
    );
  }

  if (insight?.analysisStatus === 'failed') {
    return (
      <div className="flex items-center gap-2 rounded-full border border-orange-500/30 bg-dark-900/90 px-3 py-1 text-xs text-orange-200 shadow-lg backdrop-blur-md">
        <AlertCircle className="h-3 w-3" />
        <span>无法分析，不影响手动选片</span>
        <button
          type="button"
          onClick={() => void analyzeSinglePhoto(currentPhoto.id, currentPhoto.path, currentIndex)}
          className="flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 hover:bg-orange-500/25"
        >
          <RefreshCw className="h-3 w-3" />
          重试
        </button>
      </div>
    );
  }

  if (!hasBlink && !hasBlur && !hasBurst && reasons.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center space-x-2 bg-dark-900/90 backdrop-blur-md border border-dark-700/80 px-3 py-1 rounded-full shadow-lg select-none text-xs">
      {hasBlink && (
        <span className="flex items-center space-x-1 text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 rounded-full font-medium">
          <AlertCircle className="w-3 h-3 text-amber-400" />
          <span>建议检查眼睛</span>
        </span>
      )}

      {hasBlur && (
        <span className="flex items-center space-x-1 text-rose-300 bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 rounded-full font-medium">
          <AlertCircle className="w-3 h-3 text-rose-400" />
          <span>可能轻微脱焦</span>
        </span>
      )}

      {hasBurst && (
        <span
          className={
            isBestPick
              ? 'flex items-center space-x-1 text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-0.5 rounded-full font-medium shadow-[0_0_8px_rgba(16,185,129,0.25)]'
              : 'flex items-center space-x-1 text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 px-2.5 py-0.5 rounded-full font-medium'
          }
        >
          {isBestPick ? (
            <>
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>★ 连拍推荐最佳 (按 C 比对)</span>
            </>
          ) : (
            <>
              <Layers className="w-3 h-3 text-indigo-400" />
              <span>相似连拍 (按 C 比对)</span>
            </>
          )}
        </span>
      )}

      {!hasBlink && !hasBlur && !hasBurst && (
        <span className="flex items-center space-x-1 text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-medium">
          <Sparkles className="w-3 h-3 text-emerald-400" />
          <span>清晰度良好</span>
        </span>
      )}

      <span className="text-[11px] text-slate-500 pl-1 border-l border-dark-700">
        本地辅助提示 · 最终由你决定
      </span>
    </div>
  );
};
