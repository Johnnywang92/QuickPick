import React, { useState } from 'react';
import { useAlbumStore } from '../../store/albumStore';
import { useSelectionStore } from '../../store/selectionStore';
import { SceneChapter, WorkflowScene } from '../../types/photo';
import { getAllStorylinePresets } from '../../utils/storylinePresets';
import {
  X,
  Layers,
  Target,
  Edit2,
  Check,
  ChevronRight,
  Scissors,
  Merge,
  Wand2,
  Clock,
  Sparkles,
} from 'lucide-react';

export const TimelineQuotasModal: React.FC = () => {
  const {
    photos,
    scenes,
    currentIndex,
    selectedSceneId,
    activePresetId,
    isScenesModalOpen,
    targetGoal,
    detectedPreset,
    setScenesModalOpen,
    setSelectedSceneId,
    selectIndex,
    updateScene,
    reclusterScenes,
    setTargetGoal,
    applyScenePreset,
    splitSceneAtPhoto,
    mergeScenes,
    distributeTargetGoal,
  } = useAlbumStore();

  const { selections, getStats } = useSelectionStore();

  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  const [tempGoalInput, setTempGoalInput] = useState(targetGoal?.toString() || '');
  const [gapMinutes, setGapMinutes] = useState(10);
  const [editingQuotaId, setEditingQuotaId] = useState<string | null>(null);
  const [tempQuotaInput, setTempQuotaInput] = useState('');

  if (!isScenesModalOpen) return null;

  const stats = getStats(photos.length);
  const selectedCount = stats.selectedCount;
  const presets = getAllStorylinePresets();

  const handleStartRename = (scene: SceneChapter) => {
    setEditingSceneId(scene.id);
    setTempName(scene.name);
  };

  const handleSaveRename = (sceneId: string) => {
    if (tempName.trim()) {
      updateScene(sceneId, { name: tempName.trim() });
    }
    setEditingSceneId(null);
  };

  const handleSaveGoal = () => {
    const val = parseInt(tempGoalInput.trim(), 10);
    if (!isNaN(val) && val > 0) {
      setTargetGoal(val);
    } else {
      setTargetGoal(null);
    }
  };

  const handleAutoDistribute = () => {
    const val = parseInt(tempGoalInput.trim(), 10);
    if (!isNaN(val) && val > 0) {
      distributeTargetGoal(val);
    } else if (targetGoal && targetGoal > 0) {
      distributeTargetGoal(targetGoal);
    }
  };

  const handleStartEditQuota = (scene: SceneChapter) => {
    setEditingQuotaId(scene.id);
    setTempQuotaInput((scene.targetGoal || scene.targetQuota || '').toString());
  };

  const handleSaveQuota = (sceneId: string) => {
    const val = parseInt(tempQuotaInput.trim(), 10);
    if (!isNaN(val) && val >= 0) {
      updateScene(sceneId, { targetGoal: val, targetQuota: val });
    }
    setEditingQuotaId(null);
  };

  const handleJumpToScene = (scene: SceneChapter) => {
    setSelectedSceneId(scene.id);
    selectIndex(scene.startIndex);
    setScenesModalOpen(false);
  };

  const handlePresetSelect = (presetId: WorkflowScene) => {
    applyScenePreset(presetId, true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-dark-850 border border-dark-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-200 font-sans">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-750 bg-dark-800/80 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>故事线工作流与选片配额</span>
                <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  全题材支持
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                按拍摄时间智能聚类，自由定制环节流程、拆分合并与专属配额
              </p>
            </div>
          </div>

          <button
            onClick={() => setScenesModalOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 题材工作流预设切换卡片 */}
        <div className="px-6 py-3.5 bg-dark-800/60 border-b border-dark-750 shrink-0">
          <div className="text-[11px] font-medium text-slate-400 mb-2 flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>选择拍摄题材预设（一键载入行业标准环节流）：</span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            {presets.map((preset) => {
              const isActive = activePresetId === preset.id;
              const isRecommended =
                detectedPreset?.presetId === preset.id && detectedPreset.confidence >= 0.5;

              return (
                <button
                  key={preset.id}
                  onClick={() => handlePresetSelect(preset.id)}
                  className={`relative flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-brand-600/30 border-brand-400 text-brand-200 shadow-sm ring-1 ring-brand-400/30'
                      : isRecommended
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-200 hover:border-amber-400 hover:bg-amber-500/20'
                      : 'bg-dark-800 border-dark-700 text-slate-300 hover:border-dark-600 hover:text-white'
                  }`}
                  title={`${preset.name}: ${preset.description}${
                    isRecommended
                      ? `\n✨ 系统智能推荐 (${Math.round(detectedPreset.confidence * 100)}% 匹配度):\n${detectedPreset.reasons.join('\n')}`
                      : ''
                  }`}
                >
                  <span className="text-sm">{preset.icon}</span>
                  <span>{preset.name}</span>
                  {isRecommended && (
                    <span className="ml-1 text-[9px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-normal border border-amber-500/30">
                      推荐
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 智能推荐依据与一键套用 */}
          {detectedPreset &&
            detectedPreset.confidence >= 0.5 &&
            detectedPreset.presetId !== 'general' && (
              <div className="mt-2.5 pt-2 border-t border-dark-700/60 text-[11px] flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-amber-300 font-medium">推荐依据：</span>
                  <span className="text-slate-300 truncate max-w-[550px]">
                    {detectedPreset.reasons.join(' · ')}
                  </span>
                </div>
                {detectedPreset.presetId !== activePresetId && (
                  <button
                    onClick={() => handlePresetSelect(detectedPreset.presetId)}
                    className="px-2.5 py-1 rounded-lg text-[10px] bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 font-semibold transition-colors cursor-pointer shrink-0"
                  >
                    一键套用推荐模板
                  </button>
                )}
              </div>
            )}
        </div>

        {/* 选片总目标与智能平分卡片 */}
        <div className="p-6 bg-dark-800/40 border-b border-dark-750 shrink-0">
          <div className="bg-dark-800 border border-dark-700 p-4 rounded-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-200">整套选片期望总目标</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  设定最终交付精修期望总张数，可一键按比例平分至各章节
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-400">总目标：</span>
                <input
                  type="number"
                  value={tempGoalInput}
                  onChange={(e) => setTempGoalInput(e.target.value)}
                  onBlur={handleSaveGoal}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveGoal()}
                  placeholder="如 100"
                  className="w-20 bg-dark-900 border border-dark-700 px-2.5 py-1 rounded-lg text-xs font-mono font-bold text-slate-100 text-center focus:outline-none focus:border-brand-500"
                />
                <span className="text-xs text-slate-400">张</span>
              </div>

              <button
                onClick={handleAutoDistribute}
                title="根据各章节原片数量权重，自动平分配额到各章节"
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-brand-600/20 hover:bg-brand-600/30 text-brand-300 border border-brand-500/30 text-xs font-medium transition-all cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>智能分配到章节</span>
              </button>

              {targetGoal && targetGoal > 0 && (
                <div className="flex items-center space-x-3 pl-3 border-l border-dark-700 text-xs">
                  <div>
                    <span className="text-slate-400">已选：</span>
                    <span className="font-bold text-emerald-400 font-mono">{selectedCount}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">尚需：</span>
                    <span
                      className={`font-bold font-mono ${
                        targetGoal - selectedCount > 0 ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {Math.max(0, targetGoal - selectedCount)} 张
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 场景分组列表 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-300">
              各拍摄章节分布 ({scenes.length} 个环节)
            </span>
            <div className="flex items-center space-x-2 text-xs text-slate-400">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>自动分段间隔：</span>
              <select
                value={gapMinutes}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setGapMinutes(val);
                  reclusterScenes(val);
                }}
                className="bg-dark-800 border border-dark-700 px-2 py-1 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-brand-500"
              >
                <option value={3}>拍摄停顿 3 分钟自动分段</option>
                <option value={5}>拍摄停顿 5 分钟自动分段</option>
                <option value={10}>拍摄停顿 10 分钟自动分段 (推荐)</option>
                <option value={15}>拍摄停顿 15 分钟自动分段</option>
                <option value={20}>拍摄停顿 20 分钟自动分段</option>
                <option value={30}>拍摄停顿 30 分钟自动分段</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {scenes.map((scene, idx) => {
              const slice = photos.slice(scene.startIndex, scene.endIndex + 1);
              const sceneSelected = slice.filter(
                (p) => selections[p.id]?.state === 'selected',
              ).length;
              const sceneMaybe = slice.filter(
                (p) => selections[p.id]?.state === 'maybe',
              ).length;
              const isSelected = selectedSceneId === scene.id;
              const target = scene.targetGoal || scene.targetQuota || 0;
              const isReached = target > 0 && sceneSelected >= target;

              // 是否可在当前照片处拆分
              const canSplitAtCurrent =
                currentIndex > scene.startIndex && currentIndex <= scene.endIndex;

              const nextScene = scenes[idx + 1];

              return (
                <div
                  key={scene.id}
                  className={`p-4 rounded-xl border transition-all bg-dark-800/80 flex flex-col justify-between ${
                    isSelected
                      ? 'border-brand-500 shadow-md ring-1 ring-brand-500/20'
                      : 'border-dark-700 hover:border-dark-600'
                  }`}
                >
                  <div>
                    {/* 头部：颜色圆点、名称编辑、配额编辑 */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2 min-w-0">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: scene.color }}
                        />
                        {editingSceneId === scene.id ? (
                          <div className="flex items-center space-x-1.5">
                            <input
                              type="text"
                              value={tempName}
                              onChange={(e) => setTempName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(scene.id)}
                              className="bg-dark-900 border border-dark-600 px-2 py-0.5 rounded text-xs text-slate-100 w-32 focus:outline-none focus:border-brand-500"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveRename(scene.id)}
                              className="p-1 hover:bg-dark-700 text-emerald-400 rounded"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1.5 min-w-0">
                            <span className="font-bold text-xs text-slate-100 truncate">
                              {scene.name}
                            </span>
                            <button
                              onClick={() => handleStartRename(scene)}
                              className="p-0.5 text-slate-500 hover:text-slate-300 rounded cursor-pointer shrink-0"
                              title="重命名章节名称"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* 目标配额设定 */}
                      <div className="flex items-center space-x-1.5 shrink-0">
                        {editingQuotaId === scene.id ? (
                          <div className="flex items-center space-x-1">
                            <input
                              type="number"
                              value={tempQuotaInput}
                              onChange={(e) => setTempQuotaInput(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleSaveQuota(scene.id)}
                              className="w-14 bg-dark-900 border border-dark-600 px-1 py-0.5 rounded text-[11px] text-center text-slate-100 focus:outline-none focus:border-brand-500"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveQuota(scene.id)}
                              className="p-0.5 hover:bg-dark-700 text-emerald-400 rounded"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleStartEditQuota(scene)}
                            title="点击设定本章节期望精选张数"
                            className="flex items-center space-x-1 px-2 py-0.5 rounded bg-dark-900/80 hover:bg-dark-700 border border-dark-700 text-[11px] text-slate-300 transition-colors"
                          >
                            <span className="text-slate-400 text-[10px]">配额:</span>
                            <span className="font-mono font-bold text-amber-300">
                              {target > 0 ? target : '未设'}
                            </span>
                            <span className="text-slate-400 text-[10px]">张</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 进度与分布条 */}
                    <div className="space-y-1.5 mt-3 text-xs">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>素材: {scene.photoCount} 张</span>
                        <span className="space-x-2">
                          <span
                            className={
                              isReached
                                ? 'text-emerald-400 font-bold'
                                : 'text-slate-200 font-semibold'
                            }
                          >
                            已选 {sceneSelected}
                            {target > 0 ? `/${target}` : ''} 张
                          </span>
                          {sceneMaybe > 0 && (
                            <span className="text-amber-400 font-medium">
                              待考虑 {sceneMaybe}
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="w-full h-2 bg-dark-900 rounded-full overflow-hidden flex">
                        <div
                          className={`h-full transition-all ${
                            isReached ? 'bg-emerald-400' : 'bg-brand-500'
                          }`}
                          style={{
                            width: `${
                              (sceneSelected / Math.max(1, target || scene.photoCount)) * 100
                            }%`,
                          }}
                          title={`已选 ${sceneSelected} 张`}
                        />
                        <div
                          className="bg-amber-500 h-full transition-all"
                          style={{
                            width: `${
                              (sceneMaybe / Math.max(1, target || scene.photoCount)) * 100
                            }%`,
                          }}
                          title={`待考虑 ${sceneMaybe} 张`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 底部高级操作区 (进入选片 / 拆分 / 合并) */}
                  <div className="mt-4 pt-2.5 border-t border-dark-750/70 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1.5">
                      {canSplitAtCurrent && (
                        <button
                          onClick={() => splitSceneAtPhoto(currentIndex)}
                          title={`在当前查看照片 (第 ${currentIndex + 1} 张) 处将本章节拆分为二`}
                          className="flex items-center space-x-1 px-2 py-0.5 rounded bg-dark-750 hover:bg-dark-700 text-slate-300 hover:text-amber-300 text-[10px] transition-colors"
                        >
                          <Scissors className="w-3 h-3 text-amber-400" />
                          <span>此处拆分</span>
                        </button>
                      )}

                      {nextScene && (
                        <button
                          onClick={() => mergeScenes(scene.id, nextScene.id)}
                          title={`将本章节与下一章节 (${nextScene.name}) 合并`}
                          className="flex items-center space-x-1 px-2 py-0.5 rounded bg-dark-750 hover:bg-dark-700 text-slate-300 hover:text-purple-300 text-[10px] transition-colors"
                        >
                          <Merge className="w-3 h-3 text-purple-400" />
                          <span>合入下一章</span>
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => handleJumpToScene(scene)}
                      className="text-xs text-brand-400 hover:text-brand-300 flex items-center space-x-0.5 font-medium cursor-pointer ml-auto"
                    >
                      <span>进入本章选片</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 底部控制栏 */}
        <div className="p-4 border-t border-dark-750 bg-dark-800/80 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center space-x-2 text-slate-400">
            <span>当前题材：</span>
            <span className="font-semibold text-slate-200">
              {presets.find((p) => p.id === activePresetId)?.name || '通用模式'}
            </span>
            <span className="text-slate-500">|</span>
            <span>共 {photos.length} 张原片已智能归类为 {scenes.length} 个环节</span>
          </div>

          <button
            onClick={() => setScenesModalOpen(false)}
            className="px-6 py-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-lg shadow-md transition-all cursor-pointer"
          >
            完成并返回选片
          </button>
        </div>
      </div>
    </div>
  );
};
