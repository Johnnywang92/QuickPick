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
      color: 'text-emerald-300',
      glow: 'bg-emerald-500/35',
      bg: 'bg-emerald-950/85 border-emerald-400/50 shadow-emerald-900/60',
    },
    maybe: {
      label: '待考虑',
      icon: HelpCircle,
      color: 'text-amber-300',
      glow: 'bg-amber-500/35',
      bg: 'bg-amber-950/85 border-amber-400/50 shadow-amber-900/60',
    },
    skipped: {
      label: '已不选',
      icon: CircleSlash2,
      color: 'text-slate-200',
      glow: 'bg-slate-500/25',
      bg: 'bg-slate-900/90 border-slate-500/60 shadow-black/70',
    },
    unreviewed: {
      label: '已取消',
      icon: RotateCcw,
      color: 'text-slate-300',
      glow: 'bg-slate-600/25',
      bg: 'bg-slate-900/90 border-slate-600/60 shadow-black/70',
    },
  }[visibleFeedback.state] || {
    label: '已更新',
    icon: Check,
    color: 'text-white',
    glow: 'bg-white/20',
    bg: 'bg-black/85 border-white/30',
  };

  const Icon = config.icon;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-30 select-none">
      <div
        key={visibleFeedback.timestamp}
        className={clsx(
          'relative flex items-center gap-3 px-5 py-3 rounded-2xl backdrop-blur-xl border shadow-2xl transition-all duration-200 transform',
          config.bg,
          isFading
            ? 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
            : 'animate-triage-stamp',
        )}
      >
        {/* 背景柔光辉光脉冲 (Ambient Glow Bloom) */}
        <div
          className={clsx(
            'absolute inset-0 rounded-2xl filter blur-xl -z-10 pointer-events-none opacity-80',
            config.glow,
            !isFading && 'animate-triage-bloom',
          )}
        />

        <div className="flex items-center justify-center">
          <Icon className={clsx('w-5 h-5 stroke-[3] drop-shadow-sm', config.color, !isFading && 'animate-triage-icon')} />
        </div>
        <span className={clsx('text-sm font-extrabold tracking-wider font-sans drop-shadow-sm', config.color)}>
          {config.label}
        </span>
      </div>
    </div>
  );
};
