import React, { useEffect, useState } from 'react';
import { useSelectionStore } from '../../store/selectionStore';
import { Check, HelpCircle, CircleSlash2, RotateCcw } from 'lucide-react';
import clsx from 'clsx';

interface TriageFeedbackOverlayProps {
  currentPhotoId?: string;
}

export const TriageFeedbackOverlay: React.FC<TriageFeedbackOverlayProps> = ({ currentPhotoId }) => {
  const lastTriageFeedback = useSelectionStore((state) => state.lastTriageFeedback);
  const [visibleFeedback, setVisibleFeedback] = useState<{
    state: string;
    timestamp: number;
  } | null>(null);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    if (!lastTriageFeedback || lastTriageFeedback.photoId !== currentPhotoId) return;

    setVisibleFeedback({
      state: lastTriageFeedback.state,
      timestamp: lastTriageFeedback.timestamp,
    });
    setIsFading(false);

    const fadeTimer = setTimeout(() => {
      setIsFading(true);
    }, 400);

    const hideTimer = setTimeout(() => {
      setVisibleFeedback(null);
      setIsFading(false);
    }, 650);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [lastTriageFeedback, currentPhotoId]);

  if (!visibleFeedback) return null;

  const config = {
    selected: {
      label: '已选择',
      icon: Check,
      color: 'text-emerald-400',
      bg: 'bg-emerald-950/80 border-emerald-500/40 shadow-emerald-950/50',
    },
    maybe: {
      label: '待考虑',
      icon: HelpCircle,
      color: 'text-amber-400',
      bg: 'bg-amber-950/80 border-amber-500/40 shadow-amber-950/50',
    },
    skipped: {
      label: '已不选',
      icon: CircleSlash2,
      color: 'text-slate-300',
      bg: 'bg-slate-900/80 border-slate-600/50 shadow-black/50',
    },
    unreviewed: {
      label: '已取消',
      icon: RotateCcw,
      color: 'text-slate-400',
      bg: 'bg-slate-900/80 border-slate-700/50 shadow-black/50',
    },
  }[visibleFeedback.state] || {
    label: '已更新',
    icon: Check,
    color: 'text-white',
    bg: 'bg-black/80 border-white/20',
  };

  const Icon = config.icon;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-30 select-none">
      <div
        className={clsx(
          'flex items-center gap-2.5 px-4 py-2.5 rounded-2xl backdrop-blur-md border shadow-2xl transition-all duration-200 transform',
          config.bg,
          isFading ? 'opacity-0 scale-90 translate-y-1' : 'opacity-100 scale-100 translate-y-0',
        )}
      >
        <Icon className={clsx('w-5 h-5 stroke-[3]', config.color)} />
        <span className={clsx('text-sm font-bold tracking-wide font-sans', config.color)}>
          {config.label}
        </span>
      </div>
    </div>
  );
};
