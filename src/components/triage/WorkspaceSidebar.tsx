import React, { useMemo } from 'react';
import { photoMatchesFilter, useAlbumStore } from '../../store/albumStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useInsightStore } from '../../store/insightStore';
import { useTagStore } from '../../store/tagStore';
import { parseAnnotation } from '../../utils/annotationUtils';
import { getStorylinePreset } from '../../utils/storylinePresets';
import { FilterCategory, SceneChapter } from '../../types/photo';
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleSlash2,
  EyeOff,
  Flame,
  GitMerge,
  HelpCircle,
  Image,
  Layers,
  ListChecks,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Target,
  Users2,
  X,
} from 'lucide-react';
import clsx from 'clsx';

interface WorkspaceSidebarProps {
  onOpenReviewCenter: () => void;
  onOpenDefectFunnel: () => void;
  onOpenFamilyRadar: () => void;
  onOpenMerge: () => void;
  onOpenAlbumPreview: () => void;
}

export const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  onOpenReviewCenter,
  onOpenDefectFunnel,
  onOpenFamilyRadar,
  onOpenMerge,
  onOpenAlbumPreview,
}) => {
  const {
    photos,
    activeFilter,
    setActiveFilter,
    activeTagFilter,
    setActiveTagFilter,
    scenes,
    selectedSceneId,
    setSelectedSceneId,
    activePresetId,
    detectedPreset,
    targetGoal,
    setScenesModalOpen,
    currentIndex,
    selectIndex,
  } = useAlbumStore();

  const insights = useInsightStore((s) => s.insights);
  const selections = useSelectionStore((s) => s.selections);
  const viewedPhotoIds = useSelectionStore((s) => s.viewedPhotoIds);
  const getStats = useSelectionStore((s) => s.getStats);
  const { availableTags } = useTagStore();

  const stats = getStats(photos.length);

  const needsCheckCount = useMemo(() => {
    return photos.filter((p) => {
      const ins = insights[p.id];
      return !!(
        ins &&
        (ins.possibleBlur! > 40 ||
          (ins.possibleClosedEyes !== undefined && ins.possibleClosedEyes < 0.4) ||
          ins.reasons.some((r) => r.includes('眼睛') || r.includes('模糊')))
      );
    }).length;
  }, [photos, insights]);

  const burstCount = useMemo(() => photos.filter((p) => !!p.burstGroupId).length, [photos]);

  const defectCount = useMemo(() => {
    return photos.filter((p) => {
      if (selections[p.id]?.state === 'selected') return false;
      const ins = insights[p.id];
      const hasFaceBlink = !!(p.faces && p.faces.some((f) => f.eye_open_score < 0.45));
      const hasInsightBlink = !!(
        ins &&
        ((ins.possibleClosedEyes !== undefined && ins.possibleClosedEyes < 0.45) ||
          ins.reasons.some((r) => r.includes('闭眼') || r.includes('眼睛')))
      );
      const isBlur = !!(
        ins &&
        (ins.possibleBlur! > 45 ||
          (p.sharpness !== undefined && p.sharpness < 25) ||
          ins.reasons.some((r) => r.includes('模糊') || r.includes('脱焦')))
      );
      const isBurstLoser = !!p.burstGroupId && ins?.isBestPick === false;
      return hasFaceBlink || hasInsightBlink || isBlur || isBurstLoser;
    }).length;
  }, [photos, insights, selections]);

  const filterCurrentIndex = activeFilter === 'unreviewed' ? currentIndex : undefined;
  const matchingIndexes = useMemo(() => {
    return photos.flatMap((photo, index) =>
      photoMatchesFilter(
        photo,
        index,
        activeFilter,
        selectedSceneId,
        scenes,
        selections,
        viewedPhotoIds,
        insights,
        activeTagFilter,
        filterCurrentIndex,
      )
        ? [index]
        : [],
    );
  }, [
    photos,
    activeFilter,
    selectedSceneId,
    scenes,
    selections,
    viewedPhotoIds,
    insights,
    activeTagFilter,
    filterCurrentIndex,
  ]);

  const positionInResults = matchingIndexes.indexOf(currentIndex);
  const filteredCurrent = positionInResults >= 0 ? positionInResults + 1 : null;

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    photos.forEach((p) => {
      const ann = parseAnnotation(selections[p.id]?.note);
      (ann.presetTags || []).forEach((t) => {
        counts[t] = (counts[t] || 0) + 1;
      });
    });
    return counts;
  }, [photos, selections]);

  const currentPreset = getStorylinePreset(activePresetId);
  const activeSceneIndex = scenes.findIndex((s) => s.id === selectedSceneId);
  const activeScene = activeSceneIndex !== -1 ? scenes[activeSceneIndex] : null;

  const sceneStats = useMemo(() => {
    return scenes.map((scene) => {
      let selectedCount = 0;
      for (let i = scene.startIndex; i <= scene.endIndex && i < photos.length; i++) {
        const p = photos[i];
        if (p && selections[p.id]?.state === 'selected') {
          selectedCount++;
        }
      }
      const target = scene.targetGoal || scene.targetQuota || 0;
      const isViewing = scene.startIndex <= currentIndex && currentIndex <= scene.endIndex;
      const isFiltered = selectedSceneId === scene.id;
      const hasWarning = target > 0 ? selectedCount < Math.ceil(target * 0.5) : selectedCount === 0;
      const isGoalReached = target > 0 && selectedCount >= target;
      return { scene, selectedCount, target, isViewing, isFiltered, hasWarning, isGoalReached };
    });
  }, [scenes, photos, selections, currentIndex, selectedSceneId]);

  if (photos.length === 0) return null;

  const filterTabs: {
    id: FilterCategory;
    label: string;
    icon: React.FC<{ className?: string }>;
    count: number;
    iconColor: string;
  }[] = [
    { id: 'all', label: '全部照片', icon: Image, count: photos.length, iconColor: 'text-slate-400' },
    { id: 'unreviewed', label: '未查看', icon: EyeOff, count: stats.unreviewedCount, iconColor: 'text-slate-400' },
    { id: 'selected', label: '已选择', icon: CheckCircle2, count: stats.selectedCount, iconColor: 'text-emerald-500 dark:text-emerald-400' },
    { id: 'maybe', label: '待考虑', icon: HelpCircle, count: stats.maybeCount, iconColor: 'text-amber-500 dark:text-amber-400' },
    { id: 'skipped', label: '已不选', icon: CircleSlash2, count: stats.skippedCount, iconColor: 'text-slate-400' },
    { id: 'needs_check', label: '建议检查', icon: AlertCircle, count: needsCheckCount, iconColor: 'text-rose-500 dark:text-rose-400' },
    { id: 'burst', label: '相似连拍', icon: Layers, count: burstCount, iconColor: 'text-indigo-500 dark:text-indigo-400' },
  ];

  const handleSceneClick = (scene: SceneChapter) => {
    if (selectedSceneId === scene.id) {
      setSelectedSceneId(null);
    } else {
      setSelectedSceneId(scene.id);
      selectIndex(scene.startIndex);
    }
  };

  const handleStepScene = (delta: number) => {
    const nextIdx = activeSceneIndex + delta;
    if (nextIdx >= 0 && nextIdx < scenes.length) {
      const next = scenes[nextIdx];
      setSelectedSceneId(next.id);
      selectIndex(next.startIndex);
    }
  };

  return (
    <aside
      aria-label="筛选与工具侧边栏"
      className="w-60 shrink-0 h-full bg-dark-850 border-r border-dark-700 flex flex-col overflow-y-auto no-scrollbar select-none text-xs"
    >
      {/* 1. 状态筛选 */}
      <section className="p-3 space-y-1">
        <div className="flex items-center justify-between px-1.5 pb-1">
          <span className="text-[11px] font-bold tracking-wide text-slate-400">筛选状态</span>
          <span
            className="font-mono text-[10px] text-slate-500"
            title="当前照片在筛选队列中的位置"
          >
            {filteredCurrent ?? '—'} / {matchingIndexes.length}
          </span>
        </div>

        {filterTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id)}
              className={clsx(
                'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer',
                isActive
                  ? 'bg-brand-600/15 text-slate-100 border border-brand-500/40 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-dark-800 border border-transparent',
              )}
            >
              <span className="flex items-center gap-2 min-w-0">
                <Icon className={clsx('w-3.5 h-3.5 shrink-0', tab.iconColor)} />
                <span className="truncate">{tab.label}</span>
              </span>
              <span
                className={clsx(
                  'font-mono text-[11px] px-1.5 py-0.2 rounded-full',
                  isActive ? 'bg-brand-500/20 text-brand-300 font-semibold' : 'text-slate-500',
                )}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </section>

      <div className="mx-3 border-t border-dark-750" />

      {/* 2. 故事线场景 & 目标配额 */}
      <section className="p-3 space-y-2">
        <div className="flex items-center justify-between px-1.5">
          <button
            type="button"
            onClick={() => setScenesModalOpen(true)}
            className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-slate-200 cursor-pointer transition-colors min-w-0"
            title={`当前题材: ${currentPreset.name}\n点击切换预设或配置配额`}
          >
            <span>{currentPreset.icon}</span>
            <span className="truncate">{scenes.length > 0 ? currentPreset.name : '故事线与目标'}</span>
          </button>
          <button
            type="button"
            onClick={() => setScenesModalOpen(true)}
            title="配置场景划分与选片目标"
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-dark-800 cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>

        {detectedPreset &&
          detectedPreset.presetId !== activePresetId &&
          detectedPreset.confidence >= 0.6 && (
            <button
              type="button"
              onClick={() => setScenesModalOpen(true)}
              className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[11px] hover:bg-amber-500/15 cursor-pointer text-left"
              title={`系统推荐更贴切模板: ${getStorylinePreset(detectedPreset.presetId).name}`}
            >
              <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="truncate">建议切换: {getStorylinePreset(detectedPreset.presetId).name}</span>
            </button>
          )}

        {activeScene && (
          <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-brand-500/10 border border-brand-500/30 text-[11px] text-slate-200">
            <span className="truncate font-medium">聚焦: {activeScene.name}</span>
            <span className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => handleStepScene(-1)}
                disabled={activeSceneIndex === 0}
                className="p-0.5 hover:text-white disabled:opacity-30 cursor-pointer"
                title="上一场景"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => handleStepScene(1)}
                disabled={activeSceneIndex === scenes.length - 1}
                className="p-0.5 hover:text-white disabled:opacity-30 cursor-pointer"
                title="下一场景"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setSelectedSceneId(null)}
                className="p-0.5 hover:text-rose-400 cursor-pointer"
                title="退出场景聚焦"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          </div>
        )}

        {scenes.length > 0 && (
          <div className="space-y-1 max-h-40 overflow-y-auto no-scrollbar">
            {sceneStats.map(
              ({ scene, selectedCount, target, isViewing, isFiltered, hasWarning, isGoalReached }) => (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => handleSceneClick(scene)}
                  title={`场景：${scene.name} (${scene.photoCount} 张)\n已选: ${selectedCount}${target ? ` / ${target}` : ''}`}
                  className={clsx(
                    'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs border transition-colors cursor-pointer',
                    isFiltered
                      ? 'bg-brand-500/20 border-brand-500/50 text-slate-100 font-semibold'
                      : isViewing
                      ? 'bg-dark-800 border-dark-650 text-slate-200'
                      : 'bg-transparent border-transparent text-slate-400 hover:bg-dark-800 hover:text-slate-200',
                  )}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: scene.color }} />
                    <span className="truncate">{scene.name}</span>
                  </span>
                  <span className="flex items-center gap-1 shrink-0 font-mono text-[11px]">
                    <span className={isGoalReached ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                      {selectedCount}
                      {target > 0 ? `/${target}` : ''}
                    </span>
                    {isGoalReached ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    ) : hasWarning ? (
                      <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
                    ) : null}
                  </span>
                </button>
              ),
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setScenesModalOpen(true)}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-dark-800/70 hover:bg-dark-800 border border-dark-700 text-[11px] text-slate-300 cursor-pointer transition-colors"
          title="设定或修改总选片目标张数"
        >
          <span className="flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-brand-400" />
            <span>{targetGoal && targetGoal > 0 ? `目标 ${targetGoal} 张` : '设定选片目标'}</span>
          </span>
          {targetGoal && targetGoal > 0 && (
            <span className={clsx('font-mono text-[10px]', stats.selectedCount >= targetGoal ? 'text-emerald-400 font-bold' : 'text-slate-400')}>
              {stats.selectedCount >= targetGoal ? '已达标' : `差 ${targetGoal - stats.selectedCount}`}
            </span>
          )}
        </button>
      </section>

      <div className="mx-3 border-t border-dark-750" />

      {/* 3. 标签筛选 */}
      <section className="p-3 space-y-2">
        <div className="flex items-center justify-between px-1.5">
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
            <Tag className="w-3 h-3" />
            <span>标签筛选</span>
          </span>
          {activeTagFilter && (
            <button
              type="button"
              onClick={() => setActiveTagFilter(null)}
              className="text-[10px] text-brand-400 hover:underline cursor-pointer"
            >
              重置
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto no-scrollbar">
          {availableTags.map((tag) => {
            const count = tagCounts[tag] || 0;
            const isSelected = activeTagFilter === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setActiveTagFilter(isSelected ? null : tag)}
                className={clsx(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition-colors cursor-pointer',
                  isSelected
                    ? 'bg-brand-600/25 border-brand-500/60 text-brand-200 font-semibold'
                    : 'bg-dark-800 border-dark-700 text-slate-400 hover:text-slate-200 hover:border-dark-600',
                )}
              >
                <span className="truncate max-w-[100px]">{tag}</span>
                {count > 0 && <span className="font-mono text-[10px] opacity-75">{count}</span>}
              </button>
            );
          })}
        </div>
      </section>

      <div className="mx-3 border-t border-dark-750" />

      {/* 4. 智能与交付工具 */}
      <section className="p-3 space-y-1.5 mt-auto">
        <div className="px-1.5 pb-0.5 text-[11px] font-bold text-slate-400">智能与交付</div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={onOpenReviewCenter}
            title="集中检查未查看、待考虑、相似连拍和辅助提示"
            className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-dark-800 hover:bg-dark-750 border border-dark-700 text-[11px] font-medium text-slate-300 hover:text-slate-100 cursor-pointer transition-colors"
          >
            <ListChecks className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>复核中心</span>
          </button>

          <button
            type="button"
            onClick={onOpenDefectFunnel}
            title="一键粉碎漏斗：集中批量筛除闭眼、脱焦及连拍劣选废片"
            className="flex items-center justify-center gap-1 px-2 py-2 rounded-lg border border-red-900/40 bg-red-950/20 hover:bg-red-950/40 text-[11px] font-medium text-red-300 hover:text-red-100 cursor-pointer transition-colors"
          >
            <Flame className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span>废片漏斗</span>
            {defectCount > 0 && (
              <span className="rounded-full bg-red-500/20 px-1 text-[10px] font-bold text-red-300">
                {defectCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenFamilyRadar}
            title="核心人物/主体出场记分板：检查主角、关键人物是否漏选"
            className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-dark-800 hover:bg-dark-750 border border-dark-700 text-[11px] font-medium text-slate-300 hover:text-slate-100 cursor-pointer transition-colors"
          >
            <Users2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>角色雷达</span>
          </button>

          <button
            type="button"
            onClick={onOpenAlbumPreview}
            title="虚拟实体画册跨页排版模拟"
            className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-dark-800 hover:bg-dark-750 border border-dark-700 text-[11px] font-medium text-slate-300 hover:text-slate-100 cursor-pointer transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>画册排版</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenMerge}
          title="合并他人选片文件 (.qppick)，快速找出双方共识照片与待讨论分歧"
          className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-750 border border-dark-700 text-[11px] font-medium text-slate-300 hover:text-slate-100 cursor-pointer transition-colors"
        >
          <GitMerge className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>双人协同合并</span>
        </button>
      </section>
    </aside>
  );
};

