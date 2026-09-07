import React, { useState } from 'react';
import { usePhotoStore } from '../../store/photoStore';
import {
  Sparkles,
  Wand2,
  AlertTriangle,
  HelpCircle,
  ArrowRightLeft,
  ShieldCheck,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';
import { RetouchStatus } from '../../services/tauriBridge';

export const DefectBadge: React.FC = () => {
  const {
    photos,
    currentIndex,
    isCompareMode,
    enterCompareMode,
    toggleCompareMode,
    overrideRetouchStatus,
    setPickStatus,
    retryCurrentAnalysis,
  } = usePhotoStore();

  const [showOverrideMenu, setShowOverrideMenu] = useState(false);

  const currentPhoto = photos[currentIndex];
  if (!currentPhoto) return null;

  const { retouch_status, defect_tags } = currentPhoto;

  const getStatusConfig = (status: RetouchStatus) => {
    switch (status) {
      case 'clean':
        return {
          label: '未见明显问题 (仍建议人工确认)',
          badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
          dotClass: 'bg-emerald-400',
          icon: Sparkles,
        };
      case 'fixable':
        return {
          label: '可修解决 (后期成本可控)',
          badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          dotClass: 'bg-amber-400',
          icon: Wand2,
        };
      case 'fatal':
        return {
          label: '不可修硬伤 (建议排除)',
          badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          dotClass: 'bg-rose-400',
          icon: AlertTriangle,
        };
      case 'failed':
        return {
          label: '分析失败（可重试）',
          badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
          dotClass: 'bg-orange-400',
          icon: AlertTriangle,
        };
      default:
        return {
          label: '待分析',
          badgeClass: 'bg-slate-700/50 text-slate-300 border-slate-600',
          dotClass: 'bg-slate-400',
          icon: HelpCircle,
        };
    }
  };

  const config = getStatusConfig(retouch_status);
  const StatusIcon = config.icon;

  return (
    <div className="relative flex flex-col items-center select-none">
      <div className="flex items-center space-x-2 bg-dark-900/90 backdrop-blur-md border border-dark-700/90 px-3 py-1.5 rounded-full shadow-2xl">
        {/* 核心诊断药丸 */}
        <div
          onClick={() => setShowOverrideMenu(!showOverrideMenu)}
          title="点击可人工手动覆写 AI 判定"
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold cursor-pointer transition-transform hover:scale-105 ${config.badgeClass}`}
        >
          <StatusIcon className="w-3.5 h-3.5 animate-pulse" />
          <span>{config.label}</span>
          <span className="text-[10px] opacity-60">▼</span>
        </div>

        {retouch_status === 'failed' && (
          <button
            onClick={() => void retryCurrentAnalysis()}
            className="flex items-center space-x-1 rounded-full border border-orange-500/40 bg-orange-500/10 px-2.5 py-1 text-xs font-semibold text-orange-200 hover:bg-orange-500/20"
            title="重新读取预览并运行分析"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>重试分析</span>
          </button>
        )}

        {/* 细分标签 */}
        <div className="flex items-center space-x-1.5">
          {defect_tags.map((tag) => {
            const matchCandidate = tag.hint?.match(/\[(.*?)\]/);
            const candidateFilename = matchCandidate ? matchCandidate[1] : null;

            return (
              <div
                key={tag.id}
                title={tag.hint || tag.label}
                className="flex items-center space-x-1 px-2 py-0.5 rounded-md bg-dark-800 border border-dark-700 text-slate-200 text-xs shadow-sm font-sans"
              >
                <span className="text-[11px] font-medium">{tag.label}</span>
                {candidateFilename && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const candidateIdx = photos.findIndex((p) => p.filename === candidateFilename);
                      if (candidateIdx !== -1) {
                        enterCompareMode(candidateIdx);
                      }
                    }}
                    title={`开启双图分屏比对: 当前张 vs 替换底片 ${candidateFilename} [C]`}
                    className="ml-1 flex items-center space-x-0.5 text-[10px] bg-brand-600/30 hover:bg-brand-500/40 text-brand-300 px-1.5 py-0.5 rounded border border-brand-500/40 transition-colors font-semibold"
                  >
                    <ArrowRightLeft className="w-2.5 h-2.5" />
                    <span>同屏对比</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* 双图分屏对比切换按钮 */}
        {photos.length >= 2 && (
          <button
            onClick={() => toggleCompareMode()}
            title="开启/退出双图分屏比对 [C]"
            className={`p-1 rounded-md transition-colors ${
              isCompareMode
                ? 'bg-brand-600 text-white'
                : 'hover:bg-dark-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="w-[1px] h-3.5 bg-dark-700" />

        {/* 摄影师主权快速执行 */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setPickStatus('Pick')}
            title="采纳为精修片 [P]"
            className={`p-1 rounded-md transition-colors ${
              currentPhoto.pick_status === 'Pick'
                ? 'bg-emerald-600 text-white'
                : 'hover:bg-dark-800 text-slate-400 hover:text-emerald-400'
            }`}
          >
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>
          <button
            onClick={() => setPickStatus('Reject')}
            title="排除废片 [X]"
            className={`p-1 rounded-md transition-colors ${
              currentPhoto.pick_status === 'Reject'
                ? 'bg-rose-600 text-white'
                : 'hover:bg-dark-800 text-slate-400 hover:text-rose-400'
            }`}
          >
            <X className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* 手动覆写下拉菜单 */}
      {showOverrideMenu && (
        <div className="absolute top-11 z-50 bg-dark-800 border border-dark-700 rounded-xl shadow-2xl p-2 w-56 flex flex-col space-y-1 text-xs animate-in fade-in zoom-in-95">
          <div className="px-2 py-1 text-[10px] text-slate-400 border-b border-dark-700 flex items-center space-x-1">
            <ShieldCheck className="w-3 h-3 text-brand-400" />
            <span>摄影师最终裁量（覆写 AI 判定）</span>
          </div>

          <button
            onClick={() => {
              overrideRetouchStatus('clean');
              setShowOverrideMenu(false);
            }}
            className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg hover:bg-dark-700/80 text-emerald-300 text-left transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>覆写为：完美原片</span>
          </button>

          <button
            onClick={() => {
              overrideRetouchStatus('fixable');
              setShowOverrideMenu(false);
            }}
            className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg hover:bg-dark-700/80 text-amber-300 text-left transition-colors"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>覆写为：可修解决</span>
          </button>

          <button
            onClick={() => {
              overrideRetouchStatus('fatal');
              setShowOverrideMenu(false);
            }}
            className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg hover:bg-dark-700/80 text-rose-300 text-left transition-colors"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>覆写为：不可修硬伤</span>
          </button>
        </div>
      )}
    </div>
  );
};
