import React, { useState } from 'react';
import { useAlbumStore, DEFAULT_SCENE_NAMES } from '../../store/albumStore';
import { useSelectionStore } from '../../store/selectionStore';
import { SceneChapter } from '../../types/photo';
import {
  X,
  Layers,
  Target,
  Edit2,
  Check,
  ChevronRight,
} from 'lucide-react';

export const TimelineQuotasModal: React.FC = () => {
  const {
    photos,
    scenes,
    selectedSceneId,
    isScenesModalOpen,
    targetGoal,
    setScenesModalOpen,
    setSelectedSceneId,
    selectIndex,
    updateScene,
    reclusterScenes,
    setTargetGoal,
  } = useAlbumStore();

  const { selections, getStats } = useSelectionStore();

  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  const [tempGoalInput, setTempGoalInput] = useState(targetGoal?.toString() || '');
  const [gapMinutes, setGapMinutes] = useState(10);

  if (!isScenesModalOpen) return null;

  const stats = getStats(photos.length);
  const selectedCount = stats.selectedCount;

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

  const handleJumpToScene = (scene: SceneChapter) => {
    setSelectedSceneId(scene.id);
    selectIndex(scene.startIndex);
    setScenesModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-dark-850 border border-dark-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-200 font-sans">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-750 bg-dark-800/80 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">拍摄场景与选片目标</h2>
              <p className="text-xs text-slate-400">
                按拍摄时间自动分段，自由调整造型/场景，查漏补缺不留遗憾
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

        {/* 选片目标卡片 */}
        <div className="p-6 bg-dark-800/40 border-b border-dark-750 shrink-0">
          <div className="bg-dark-800 border border-dark-700 p-4 rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-200">自设选片期望目标</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  仅作为您选片过程中的参考指引，绝不限制您多选或少选
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-400">希望选出：</span>
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

              {targetGoal && targetGoal > 0 && (
                <div className="flex items-center space-x-3 pl-3 border-l border-dark-700 text-xs">
                  <div>
                    <span className="text-slate-400">当前已选：</span>
                    <span className="font-bold text-emerald-400 font-mono">{selectedCount}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">还可以再选：</span>
                    <span className={`font-bold font-mono ${targetGoal - selectedCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
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
            <span className="text-xs font-semibold text-slate-300">各拍摄场景分布 ({scenes.length} 个环节)</span>
            <div className="flex items-center space-x-2 text-xs text-slate-400">
              <span>时间间隔：</span>
              <select
                value={gapMinutes}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setGapMinutes(val);
                  reclusterScenes(val);
                }}
                className="bg-dark-800 border border-dark-700 px-2 py-1 rounded-lg text-xs text-slate-200"
              >
                <option value={5}>拍摄间隔 5 分钟自动分段</option>
                <option value={10}>拍摄间隔 10 分钟自动分段</option>
                <option value={20}>拍摄间隔 20 分钟自动分段</option>
                <option value={30}>拍摄间隔 30 分钟自动分段</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {scenes.map((scene) => {
              const slice = photos.slice(scene.startIndex, scene.endIndex + 1);
              const sceneSelected = slice.filter((p) => selections[p.id]?.state === 'selected').length;
              const sceneMaybe = slice.filter((p) => selections[p.id]?.state === 'maybe').length;
              const isSelected = selectedSceneId === scene.id;

              return (
                <div
                  key={scene.id}
                  className={`p-4 rounded-xl border transition-all bg-dark-800/80 ${
                    isSelected
                      ? 'border-brand-500 shadow-md ring-1 ring-brand-500/20'
                      : 'border-dark-700 hover:border-dark-600'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
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
                        <div className="flex items-center space-x-1.5">
                          <span className="font-bold text-xs text-slate-100">{scene.name}</span>
                          <button
                            onClick={() => handleStartRename(scene)}
                            className="p-0.5 text-slate-500 hover:text-slate-300 rounded cursor-pointer"
                            title="重命名场景名称"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleJumpToScene(scene)}
                      className="text-xs text-brand-400 hover:text-brand-300 flex items-center space-x-0.5 font-medium cursor-pointer"
                    >
                      <span>进入选片</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* 进度与分布条 */}
                  <div className="space-y-1.5 mt-3 text-xs">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>总素材: {scene.photoCount} 张</span>
                      <span className="space-x-2">
                        <span className="text-emerald-400 font-semibold">已选 {sceneSelected} 张</span>
                        {sceneMaybe > 0 && <span className="text-amber-400 font-medium">待考虑 {sceneMaybe} 张</span>}
                      </span>
                    </div>

                    <div className="w-full h-2 bg-dark-900 rounded-full overflow-hidden flex">
                      <div
                        className="bg-emerald-500 h-full transition-all"
                        style={{ width: `${(sceneSelected / Math.max(1, scene.photoCount)) * 100}%` }}
                        title={`已选 ${sceneSelected} 张`}
                      />
                      <div
                        className="bg-amber-500 h-full transition-all"
                        style={{ width: `${(sceneMaybe / Math.max(1, scene.photoCount)) * 100}%` }}
                        title={`待考虑 ${sceneMaybe} 张`}
                      />
                    </div>

                    {sceneSelected === 0 && scene.photoCount > 0 && (
                      <div className="text-[10px] text-amber-400/80 pt-1">
                        提示：该场景尚未挑选任何照片
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 底部快速预设模板 */}
        <div className="p-4 border-t border-dark-750 bg-dark-800/80 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center space-x-2 text-slate-400">
            <span>常见场景名称参考：</span>
            <div className="flex items-center space-x-1.5">
              {DEFAULT_SCENE_NAMES.slice(0, 6).map((name) => (
                <span key={name} className="bg-dark-700 px-2 py-0.5 rounded text-[11px] text-slate-300">
                  {name}
                </span>
              ))}
            </div>
          </div>

          <button
            onClick={() => setScenesModalOpen(false)}
            className="px-5 py-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-lg shadow-md transition-all cursor-pointer"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
