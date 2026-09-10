import React, { useRef } from 'react';
import { useAlbumStore } from '../../store/albumStore';
import { useSelectionStore } from '../../store/selectionStore';
import { SceneChapter } from '../../types/photo';
import { getStorylinePreset } from '../../utils/storylinePresets';
import {
  AlertTriangle,
  CheckCircle2,
  SlidersHorizontal,
  Users2,
  GitMerge,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  X,
  Sparkles,
} from 'lucide-react';
import clsx from 'clsx';

interface StorylineBarProps {
  onOpenFamilyRadar?: () => void;
  onOpenMerge?: () => void;
  onOpenAlbumPreview?: () => void;
}

export const StorylineBar: React.FC<StorylineBarProps> = ({
  onOpenFamilyRadar,
  onOpenMerge,
  onOpenAlbumPreview,
}) => {
  const {
    scenes,
    selectedSceneId,
    setSelectedSceneId,
    activePresetId,
    photos,
    currentIndex,
    selectIndex,
    setScenesModalOpen,
    detectedPreset,
  } = useAlbumStore();
  const { selections } = useSelectionStore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  if (scenes.length === 0 || photos.length === 0) return null;

  const currentPreset = getStorylinePreset(activePresetId);
  const activeSceneIndex = scenes.findIndex((s) => s.id === selectedSceneId);
  const activeScene = activeSceneIndex !== -1 ? scenes[activeSceneIndex] : null;

  // 计算每个场景的已选照片数
  const sceneStats = scenes.map((scene) => {
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

    return {
      scene,
      selectedCount,
      target,
      isViewing,
      isFiltered,
      hasWarning,
      isGoalReached,
    };
  });

  const handleSceneClick = (scene: SceneChapter) => {
    // 如果已经过滤该场景，则取消过滤；否则过滤并跳转到场景首张
    if (selectedSceneId === scene.id) {
      setSelectedSceneId(null);
    } else {
      setSelectedSceneId(scene.id);
      selectIndex(scene.startIndex);
    }
  };

  const handlePrevScene = () => {
    if (activeSceneIndex > 0) {
      const prev = scenes[activeSceneIndex - 1];
      setSelectedSceneId(prev.id);
      selectIndex(prev.startIndex);
    }
  };

  const handleNextScene = () => {
    if (activeSceneIndex < scenes.length - 1) {
      const next = scenes[activeSceneIndex + 1];
      setSelectedSceneId(next.id);
      selectIndex(next.startIndex);
    }
  };

  return (
    <div className="h-10 bg-dark-900 border-b border-dark-750/80 px-3 flex items-center justify-between gap-3 text-xs shrink-0 select-none">
      {/* 左侧：章节常驻胶囊横向滚动流 */}
      <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
        {/* 题材图标与故事线标签 */}
        <div
          onClick={() => setScenesModalOpen(true)}
          className="flex items-center space-x-1.5 text-slate-400 hover:text-slate-200 shrink-0 font-medium text-[11px] mr-1 cursor-pointer transition-colors"
          title={`当前题材: ${currentPreset.name}${
            detectedPreset?.presetId === activePresetId && detectedPreset.confidence >= 0.5
              ? `\n✨ 系统根据导入照片智能匹配 (${Math.round(detectedPreset.confidence * 100)}% 置信度):\n${detectedPreset.reasons.join('\n')}`
              : ''
          }\n点击切换预设或配置配额`}
        >
          <span className="text-sm">{currentPreset.icon}</span>
          <span className="hidden sm:inline font-semibold">{currentPreset.name}</span>
          {detectedPreset?.presetId === activePresetId && detectedPreset.confidence >= 0.5 && (
            <span className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-300 bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/25 dark:border-amber-500/30 rounded-full">
              <Sparkles className="w-2.5 h-2.5 text-amber-500 dark:text-amber-400" />
              智能匹配
            </span>
          )}
        </div>

        {/* 建议切换胶囊（若检测到更贴切且用户尚未切换） */}
        {detectedPreset &&
          detectedPreset.presetId !== activePresetId &&
          detectedPreset.confidence >= 0.6 && (
            <button
              onClick={() => setScenesModalOpen(true)}
              className="hidden lg:flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/10 dark:bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/25 dark:border-amber-500/30 text-[10px] hover:bg-amber-500/20 dark:hover:bg-amber-500/25 transition-colors cursor-pointer shrink-0"
              title={`系统推荐更贴切模板: ${getStorylinePreset(detectedPreset.presetId).name}\n依据: ${detectedPreset.reasons.join('; ')}\n点击打开故事线配置一键切换`}
            >
              <Sparkles className="w-2.5 h-2.5 text-amber-500 dark:text-amber-400" />
              <span>建议: {getStorylinePreset(detectedPreset.presetId).name}</span>
            </button>
          )}

        {/* 章节过滤聚焦状态提醒 */}
        {activeScene && (
          <div className="flex items-center space-x-1 shrink-0 px-2 py-0.5 rounded-full bg-dark-750 border border-dark-700 text-slate-200 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />
            <span className="font-medium">聚焦: {activeScene.name}</span>
            <button
              onClick={handlePrevScene}
              disabled={activeSceneIndex === 0}
              className="p-0.5 hover:text-white disabled:opacity-30 cursor-pointer"
              title="切换到上一章"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <button
              onClick={handleNextScene}
              disabled={activeSceneIndex === scenes.length - 1}
              className="p-0.5 hover:text-white disabled:opacity-30 cursor-pointer"
              title="切换到下一章"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
            <button
              onClick={() => setSelectedSceneId(null)}
              className="p-0.5 hover:text-red-400 cursor-pointer ml-0.5"
              title="退出聚焦，查看全部原片"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div
          ref={scrollContainerRef}
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 scroll-smooth"
        >
          {sceneStats.map(
            ({ scene, selectedCount, target, isViewing, isFiltered, hasWarning, isGoalReached }) => (
              <button
                key={scene.id}
                onClick={() => handleSceneClick(scene)}
                title={`场景：${scene.name} (${scene.photoCount} 张原片)\n已选: ${selectedCount} 张${
                  target ? ` / 目标配额: ${target} 张` : ''
                }\n点击进入/退出本章聚焦模式`}
                className={clsx(
                  'flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all shrink-0 cursor-pointer',
                  isFiltered
                    ? 'bg-brand-500/30 border-brand-400 text-brand-100 shadow-sm ring-1 ring-brand-400/40'
                    : isViewing
                    ? 'bg-dark-800 border-dark-600 text-slate-200 ring-1 ring-white/10'
                    : 'bg-dark-850/90 border-dark-750 text-slate-400 hover:text-slate-200 hover:border-dark-650',
                )}
              >
                {/* 场景专属颜色标识圆点 */}
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: scene.color }}
                />

                {/* 场景名称 */}
                <span className="truncate max-w-[90px]">{scene.name}</span>

                {/* 选片进度配额 */}
                <span
                  className={clsx(
                    'font-mono text-[10px]',
                    isGoalReached ? 'text-emerald-300 font-bold' : 'opacity-80',
                  )}
                >
                  {selectedCount}
                  {target > 0 ? `/${target}` : ''}
                </span>

                {/* 状态小徽标 */}
                {isGoalReached ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                ) : hasWarning ? (
                  <AlertTriangle className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                ) : null}
              </button>
            ),
          )}
        </div>
      </div>

      {/* 右侧：功能快捷入口 (配额配置 / 人物出场雷达 / 双人合并) */}
      <div className="flex items-center space-x-1.5 shrink-0 pl-2 border-l border-dark-750">
        {/* 角色出场记分板入口 */}
        {onOpenFamilyRadar && (
          <button
            onClick={onOpenFamilyRadar}
            title="核心人物/主体出场记分板：检查主角、关键人物是否漏选"
            className="group flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-dark-800 hover:bg-dark-750 text-slate-300 hover:text-slate-100 border border-dark-700 text-[11px] font-medium transition-colors cursor-pointer"
          >
            <Users2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-300 dark:group-hover:text-slate-100" />
            <span className="hidden md:inline">角色出场雷达</span>
          </button>
        )}

        {/* 离线双人选片合并入口 */}
        {onOpenMerge && (
          <button
            onClick={onOpenMerge}
            title="合并他人选片文件 (.qppick)，快速找出双方共识照片与待讨论分歧"
            className="group flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-dark-800 hover:bg-dark-750 text-slate-300 hover:text-slate-100 border border-dark-700 text-[11px] font-medium transition-colors cursor-pointer"
          >
            <GitMerge className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-300 dark:group-hover:text-slate-100" />
            <span className="hidden md:inline">双人合并</span>
          </button>
        )}

        {/* 虚拟画册跨页模拟入口 */}
        {onOpenAlbumPreview && (
          <button
            onClick={onOpenAlbumPreview}
            title="虚拟实体画册跨页排版模拟：像翻阅精装画册一样预览入选照片排版"
            className="group flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-dark-800 hover:bg-dark-750 text-slate-300 hover:text-slate-100 border border-dark-700 text-[11px] font-medium transition-colors cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-300 dark:group-hover:text-slate-100" />
            <span className="hidden md:inline">画册排版</span>
          </button>
        )}

        {/* 章节与配额调整弹窗入口 */}
        <button
          onClick={() => setScenesModalOpen(true)}
          title="调整章节划分、更换题材预设与目标配额"
          className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-750 transition-colors cursor-pointer"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
