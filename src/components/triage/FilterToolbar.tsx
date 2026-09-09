import React, { useState, useRef, useEffect } from 'react';
import { photoMatchesFilter, useAlbumStore } from '../../store/albumStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useInsightStore } from '../../store/insightStore';
import { FilterCategory } from '../../types/photo';
import {
  Image,
  EyeOff,
  CheckCircle2,
  HelpCircle,
  AlertCircle,
  Layers,
  Sparkles,
  ChevronDown,
  Target,
  ListChecks,
} from 'lucide-react';

interface FilterToolbarProps {
  onOpenReviewCenter: () => void;
}

export const FilterToolbar: React.FC<FilterToolbarProps> = ({ onOpenReviewCenter }) => {
  const {
    photos,
    activeFilter,
    setActiveFilter,
    scenes,
    selectedSceneId,
    setSelectedSceneId,
    targetGoal,
    setScenesModalOpen,
    currentIndex,
  } = useAlbumStore();

  const { getStats, selections, viewedPhotoIds } = useSelectionStore();
  const { insights } = useInsightStore();

  const [showSceneDropdown, setShowSceneDropdown] = useState(false);
  const [showAiHelperDropdown, setShowAiHelperDropdown] = useState(false);
  const sceneDropdownRef = useRef<HTMLDivElement>(null);
  const aiHelperDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (sceneDropdownRef.current && !sceneDropdownRef.current.contains(e.target as Node)) {
        setShowSceneDropdown(false);
      }
      if (aiHelperDropdownRef.current && !aiHelperDropdownRef.current.contains(e.target as Node)) {
        setShowAiHelperDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  if (photos.length === 0) return null;

  const stats = getStats(photos.length);

  // 统计可能需要检查的照片 (闭眼、轻微脱焦)
  const needsCheckCount = photos.filter((p) => {
    const ins = insights[p.id];
    return !!(
      ins &&
      (ins.possibleBlur! > 40 ||
        (ins.possibleClosedEyes !== undefined && ins.possibleClosedEyes < 0.4) ||
        ins.reasons.some((r) => r.includes('眼睛') || r.includes('模糊')))
    );
  }).length;

  const burstCount = photos.filter((p) => !!p.burstGroupId).length;

  const matchingIndexes = photos.flatMap((photo, index) =>
    photoMatchesFilter(
      photo,
      index,
      activeFilter,
      selectedSceneId,
      scenes,
      selections,
      viewedPhotoIds,
      insights,
    )
      ? [index]
      : [],
  );
  const positionInResults = matchingIndexes.indexOf(currentIndex);
  const filteredPosition = {
    current: positionInResults >= 0 ? positionInResults + 1 : null,
    total: matchingIndexes.length,
  };

  const filterTabs: {
    id: FilterCategory;
    label: string;
    icon: React.FC<any>;
    count: number;
    activeClass: string;
  }[] = [
    {
      id: 'all',
      label: '全部照片',
      icon: Image,
      count: photos.length,
      activeClass: 'bg-dark-700 text-slate-100 border-slate-600',
    },
    {
      id: 'unreviewed',
      label: '未查看',
      icon: EyeOff,
      count: stats.unreviewedCount,
      activeClass: 'bg-slate-700/60 text-slate-200 border-slate-500',
    },
    {
      id: 'selected',
      label: '已选择',
      icon: CheckCircle2,
      count: stats.selectedCount,
      activeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50',
    },
    {
      id: 'maybe',
      label: '待考虑',
      icon: HelpCircle,
      count: stats.maybeCount,
      activeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/50',
    },
    {
      id: 'needs_check',
      label: '建议检查',
      icon: AlertCircle,
      count: needsCheckCount,
      activeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/50',
    },
    {
      id: 'burst',
      label: '相似连拍',
      icon: Layers,
      count: burstCount,
      activeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50',
    },
  ];

  const currentScene = scenes.find((s) => s.id === selectedSceneId);

  return (
    <div className="h-11 bg-dark-850 border-b border-dark-700 px-4 flex items-center justify-between z-20 shrink-0 text-xs">
      {/* 左侧：面向普通用户的核心分类过滤卡片 */}
      <div className="flex items-center space-x-1.5 overflow-x-auto scrollbar-none">
        {filterTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg border font-medium transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? `${tab.activeClass} shadow-sm font-semibold`
                  : 'bg-dark-800/80 hover:bg-dark-750 text-slate-400 hover:text-slate-200 border-dark-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
              <span
                className={`text-[11px] font-mono px-1.5 py-0.2 rounded-full ${
                  isActive ? 'bg-black/30' : 'bg-dark-700 text-slate-400'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 右侧：拍摄场景切换与选片目标 */}
      <div className="flex items-center space-x-3 shrink-0">
        <span
          className="rounded-lg border border-dark-700 bg-dark-800 px-2.5 py-1 font-mono text-[11px] text-slate-400"
          title="当前照片在筛选结果中的位置"
          aria-label={`筛选结果当前位置 ${filteredPosition.current || 0}，共 ${filteredPosition.total} 张`}
        >
          {filteredPosition.current ?? '—'} / {filteredPosition.total}
        </span>

        <button
          type="button"
          onClick={onOpenReviewCenter}
          className="flex items-center space-x-1.5 rounded-lg border border-brand-500/30 bg-brand-500/10 px-2.5 py-1 font-semibold text-brand-300 transition-colors hover:bg-brand-500/20"
          title="集中检查未查看、待考虑、相似连拍和辅助提示"
        >
          <ListChecks className="h-3.5 w-3.5" />
          <span>复核中心</span>
        </button>

        {/* 选片目标提示 */}
        {targetGoal && targetGoal > 0 ? (
          <div
            onClick={() => setScenesModalOpen(true)}
            title="点击修改选片目标"
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-dark-800 border border-dark-700 text-slate-300 cursor-pointer hover:border-dark-600 transition-colors"
          >
            <Target className="w-3.5 h-3.5 text-brand-400" />
            <span>目标 {targetGoal} 张</span>
            <span className="text-slate-500">·</span>
            <span className="text-emerald-400 font-semibold">{stats.selectedCount}</span>
            {targetGoal - stats.selectedCount > 0 ? (
              <span className="text-[11px] text-slate-400">(还差 {targetGoal - stats.selectedCount} 张)</span>
            ) : (
              <span className="text-[11px] text-emerald-400 font-bold">(已达标)</span>
            )}
          </div>
        ) : (
          <button
            onClick={() => setScenesModalOpen(true)}
            className="flex items-center space-x-1 px-2 py-1 rounded-lg hover:bg-dark-750 text-slate-400 hover:text-slate-200 border border-transparent hover:border-dark-700 transition-colors cursor-pointer"
            title="设定希望选出的总张数，如 100 张"
          >
            <Target className="w-3.5 h-3.5" />
            <span>设定选片目标</span>
          </button>
        )}

        {/* 拍摄场景下拉筛选器 */}
        {scenes.length > 0 && (
          <div className="relative" ref={sceneDropdownRef}>
            <button
              onClick={() => setShowSceneDropdown(!showSceneDropdown)}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-dark-800 hover:bg-dark-750 border border-dark-700 text-slate-300 transition-colors cursor-pointer"
            >
              <span className="text-slate-400">场景:</span>
              <span className="font-semibold text-slate-100 max-w-[100px] truncate">
                {currentScene ? currentScene.name : '全部场景'}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-500" />
            </button>

            {showSceneDropdown && (
              <div className="absolute right-0 top-full mt-1.5 w-48 bg-dark-850 border border-dark-700 rounded-xl shadow-2xl py-1.5 z-40">
                <button
                  onClick={() => {
                    setSelectedSceneId(null);
                    setShowSceneDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between ${
                    selectedSceneId === null ? 'bg-brand-600/20 text-brand-300 font-semibold' : 'text-slate-300 hover:bg-dark-750'
                  }`}
                >
                  <span>全部拍摄场景</span>
                  <span className="text-[10px] font-mono text-slate-500">{photos.length}</span>
                </button>
                <div className="h-[1px] bg-dark-750 my-1" />
                {scenes.map((scene) => (
                  <button
                    key={scene.id}
                    onClick={() => {
                      setSelectedSceneId(scene.id);
                      setShowSceneDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between ${
                      selectedSceneId === scene.id ? 'bg-brand-600/20 text-brand-300 font-semibold' : 'text-slate-300 hover:bg-dark-750'
                    }`}
                  >
                    <span className="truncate max-w-[120px]">{scene.name}</span>
                    <span className="text-[10px] font-mono text-slate-500">{scene.photoCount} 张</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 辅助提示筛选下拉按钮 */}
        <div className="relative" ref={aiHelperDropdownRef}>
          <button
            onClick={() => setShowAiHelperDropdown(!showAiHelperDropdown)}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-dark-800 hover:bg-dark-750 border border-dark-700 text-indigo-300 transition-colors cursor-pointer"
            title="按本地辅助提示筛选照片"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>辅助提示</span>
            <ChevronDown className="w-3 h-3 text-indigo-400/60" />
          </button>

          {showAiHelperDropdown && (
            <div className="absolute right-0 top-full mt-1.5 w-56 bg-dark-850 border border-dark-700 rounded-xl shadow-2xl py-1.5 z-40 text-xs">
              <div className="px-3 py-1 text-[11px] text-slate-400 font-medium border-b border-dark-750">
                辅助浏览（不改变已有选择）
              </div>
              <button
                onClick={() => {
                  setActiveFilter('needs_check');
                  setShowAiHelperDropdown(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-dark-750 text-slate-200 flex items-center space-x-2"
              >
                <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <div>
                  <div className="font-medium">查找可能闭眼/模糊的照片</div>
                  <div className="text-[10px] text-slate-500">快速排查抓拍失误</div>
                </div>
              </button>
              <button
                onClick={() => {
                  setActiveFilter('burst');
                  setShowAiHelperDropdown(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-dark-750 text-slate-200 flex items-center space-x-2"
              >
                <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <div>
                  <div className="font-medium">浏览相似连拍组</div>
                  <div className="text-[10px] text-slate-500">对比挑出最佳微表情</div>
                </div>
              </button>
              <button
                onClick={() => {
                  setActiveFilter('unreviewed');
                  setShowAiHelperDropdown(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-dark-750 text-slate-200 flex items-center space-x-2"
              >
                <EyeOff className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <div>
                  <div className="font-medium">查看尚未检查的照片</div>
                  <div className="text-[10px] text-slate-500">查漏补缺，不遗漏任何场景</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
