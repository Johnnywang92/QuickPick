import React, { useState } from 'react';
import {
  usePhotoStore,
  TimelineChapter,
  getChapterStats,
  WorkflowScene,
} from '../../store/photoStore';
import {
  X,
  Layers,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Target,
  Edit2,
  Check,
  ChevronRight,
  RefreshCw,
  Merge,
  Eye,
  SlidersHorizontal,
} from 'lucide-react';

export const TimelineQuotasModal: React.FC = () => {
  const {
    photos,
    chapters,
    selectedChapterId,
    isChaptersModalOpen,
    chapterGapMinutes,
    activeWorkflowScene,
    setChaptersModalOpen,
    setSelectedChapter,
    selectIndex,
    updateChapter,
    reclusterChapters,
    mergeChapterWithPrevious,
    applySceneChapterPreset,
  } = usePhotoStore();

  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  const [tempGap, setTempGap] = useState(chapterGapMinutes);
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);

  if (!isChaptersModalOpen) return null;

  // 全局交付配额大盘统计
  const totalTargetQuota = chapters.reduce((acc, c) => acc + c.targetQuota, 0);
  const totalPicked = photos.filter((p) => p.pick_status === 'Pick').length;
  const overallCompletion =
    totalTargetQuota > 0 ? Math.min(100, Math.round((totalPicked / totalTargetQuota) * 100)) : 100;

  // 章节各状态汇总
  const chapterStatsList = chapters.map((c) => ({
    chapter: c,
    stats: getChapterStats(c, photos, activeWorkflowScene),
  }));

  const emptyWarningChapters = chapterStatsList.filter(
    (item) => item.stats.status === 'empty_warning',
  );

  const handleStartRename = (chapter: TimelineChapter) => {
    setEditingChapterId(chapter.id);
    setTempName(chapter.name);
  };

  const handleSaveRename = (chapterId: string) => {
    if (tempName.trim()) {
      updateChapter(chapterId, { name: tempName.trim() });
    }
    setEditingChapterId(null);
  };

  const handleFocusChapter = (chapterId: string, startIndex: number) => {
    setSelectedChapter(chapterId);
    selectIndex(startIndex);
    setChaptersModalOpen(false);
  };

  const handleJumpToChapterFirst = (startIndex: number) => {
    selectIndex(startIndex);
    setChaptersModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[90vh] bg-dark-850 border border-dark-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/80 bg-dark-800/80 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-100">
                  活动/演出流程时间轴分章与交付配额看板
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-dark-700 text-slate-300 border border-dark-600 font-mono">
                  {chapters.length} 个拍摄环节
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                基于 EXIF 拍摄时间密度自动聚类 · 各环节交付配额追踪 · 智能防漏关键镜头
              </p>
            </div>
          </div>

          <button
            onClick={() => setChaptersModalOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-dark-700 rounded-lg transition-colors cursor-pointer"
            title="关闭看板 (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 交付大盘概览与报警条 */}
        <div className="px-6 py-4 bg-dark-800/40 border-b border-dark-700/60 shrink-0 space-y-3">
          {/* 核心指标与总体进度 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-dark-900/60 border border-dark-750 rounded-xl p-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-slate-400">总交付配额进度</div>
                <div className="text-lg font-bold font-mono text-slate-100 flex items-baseline space-x-1 mt-0.5">
                  <span className="text-brand-400">{totalPicked}</span>
                  <span className="text-slate-500 text-sm">/</span>
                  <span>{totalTargetQuota}</span>
                  <span className="text-xs text-slate-400 font-sans ml-1">张</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold font-mono text-slate-200">
                  {overallCompletion}%
                </span>
              </div>
            </div>

            <div className="bg-dark-900/60 border border-dark-750 rounded-xl p-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-slate-400">全相册底片规模</div>
                <div className="text-lg font-bold font-mono text-slate-100 mt-0.5">
                  {photos.length} <span className="text-xs font-sans text-slate-400">张原始底片</span>
                </div>
              </div>
              <div className="text-right text-[11px] text-slate-400">
                已剔除废片: {photos.filter((p) => p.pick_status === 'Reject').length}
              </div>
            </div>

            <div className="bg-dark-900/60 border border-dark-750 rounded-xl p-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] text-slate-400">交付达标率</div>
                <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
                  {chapterStatsList.filter((c) => c.stats.status === 'met').length} / {chapters.length}
                  <span className="text-xs font-sans text-slate-400 ml-1">环节已达标</span>
                </div>
              </div>
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
          </div>

          {/* 空缺预警红标提示卡 */}
          {emptyWarningChapters.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-200 animate-in fade-in">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 animate-pulse" />
                <span>
                  <strong className="font-semibold text-rose-100">
                    关键镜头防漏警报：
                  </strong>
                  存在 {emptyWarningChapters.length} 个环节尚未选出任何精选交付片（
                  {emptyWarningChapters.map((item) => item.chapter.name).join('、')}）
                </span>
              </div>
              <button
                onClick={() =>
                  handleFocusChapter(
                    emptyWarningChapters[0].chapter.id,
                    emptyWarningChapters[0].chapter.startIndex,
                  )
                }
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold shrink-0 transition-colors shadow-sm"
              >
                立即前往首个空缺环节
              </button>
            </div>
          )}

          {/* 聚类与模板控制条 */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center space-x-2 text-xs text-slate-300">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
              <span>聚类时间停顿阈值:</span>
              <select
                value={tempGap}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setTempGap(val);
                  reclusterChapters(val);
                }}
                className="bg-dark-700 border border-dark-600 text-slate-200 text-xs rounded-lg px-2 py-1 outline-none cursor-pointer hover:border-dark-500"
              >
                <option value={5}>5 分钟 (密集分段)</option>
                <option value={8}>8 分钟</option>
                <option value={10}>10 分钟 (标准推荐)</option>
                <option value={15}>15 分钟</option>
                <option value={20}>20 分钟</option>
                <option value={30}>30 分钟 (长篇分段)</option>
                <option value={60}>60 分钟 (极宽跨度)</option>
              </select>
              <button
                onClick={() => reclusterChapters(tempGap)}
                className="flex items-center space-x-1 px-2.5 py-1 bg-dark-700 hover:bg-dark-600 text-slate-300 rounded-lg transition-colors border border-dark-600"
                title="按当前时间阈值重新划分章节"
              >
                <RefreshCw className="w-3 h-3" />
                <span>重新聚类</span>
              </button>
            </div>

            {/* 快速套用场景模板下拉 */}
            <div className="relative">
              <button
                onClick={() => setShowPresetDropdown(!showPresetDropdown)}
                className="flex items-center space-x-1.5 px-3 py-1 bg-brand-600/20 hover:bg-brand-600/30 text-brand-300 border border-brand-500/30 rounded-lg text-xs font-medium transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>套用场景流程预设模板</span>
                <span className="text-[10px] opacity-70">▼</span>
              </button>

              {showPresetDropdown && (
                <div className="absolute right-0 top-8 z-30 w-64 bg-dark-800 border border-dark-700 rounded-xl shadow-2xl p-1.5 text-xs flex flex-col space-y-1 animate-in fade-in zoom-in-95">
                  <div className="px-2 py-1 text-[10px] text-slate-400 border-b border-dark-700">
                    选择对应摄影品类标准流程：
                  </div>
                  {(['wedding', 'concert', 'conference', 'cosplay', 'general'] as WorkflowScene[]).map(
                    (sceneKey) => {
                      const labels: Record<WorkflowScene, string> = {
                        wedding: '💍 婚礼纪实 6 阶段流程',
                        concert: '🎤 演唱会/舞台演出 6 阶段',
                        conference: '🏢 商务会议公关 6 阶段',
                        cosplay: '🎀 二次元/Cosplay 5 阶段',
                        general: '👤 通用活动环节流程',
                      };
                      return (
                        <button
                          key={sceneKey}
                          onClick={() => {
                            applySceneChapterPreset(sceneKey);
                            setShowPresetDropdown(false);
                          }}
                          className={`text-left px-2.5 py-1.5 rounded-lg hover:bg-dark-700 transition-colors flex items-center justify-between ${
                            activeWorkflowScene === sceneKey
                              ? 'text-brand-300 font-semibold'
                              : 'text-slate-200'
                          }`}
                        >
                          <span>{labels[sceneKey]}</span>
                          {activeWorkflowScene === sceneKey && (
                            <span className="text-[10px] text-brand-400 font-mono">当前</span>
                          )}
                        </button>
                      );
                    },
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 章节卡片列表看板 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3.5 scrollbar-thin scrollbar-thumb-dark-600">
          {chapterStatsList.map(({ chapter, stats }, idx) => {
            const isEditing = editingChapterId === chapter.id;
            const isFocused = selectedChapterId === chapter.id;

            return (
              <div
                key={chapter.id}
                className={`p-4 rounded-xl border transition-all duration-150 ${
                  isFocused
                    ? 'bg-dark-800/90 border-brand-500/80 ring-2 ring-brand-500/30'
                    : 'bg-dark-800/50 hover:bg-dark-800/70 border-dark-700/80'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  {/* 左侧：章节序号、名称与时间跨度 */}
                  <div className="flex items-start space-x-3 min-w-0">
                    <div
                      style={{ backgroundColor: chapter.color || '#3b82f6' }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-sm mt-0.5"
                    >
                      {String(idx + 1).padStart(2, '0')}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-2">
                        {isEditing ? (
                          <div className="flex items-center space-x-1">
                            <input
                              type="text"
                              value={tempName}
                              onChange={(e) => setTempName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveRename(chapter.id);
                                if (e.key === 'Escape') setEditingChapterId(null);
                              }}
                              autoFocus
                              className="bg-dark-900 border border-brand-500 rounded px-2 py-0.5 text-xs text-white font-semibold outline-none"
                            />
                            <button
                              onClick={() => handleSaveRename(chapter.id)}
                              className="p-1 hover:bg-dark-700 text-emerald-400 rounded"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1.5 group cursor-pointer">
                            <span
                              onClick={() => handleStartRename(chapter)}
                              className="font-bold text-slate-100 hover:text-brand-300 text-sm truncate"
                              title="点击重命名章节"
                            >
                              {chapter.name}
                            </span>
                            <button
                              onClick={() => handleStartRename(chapter)}
                              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-200 transition-opacity p-0.5"
                              title="重命名"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        {isFocused && (
                          <span className="text-[10px] bg-brand-500/20 text-brand-300 border border-brand-500/30 px-1.5 py-0.2 rounded font-medium">
                            当前聚焦视图
                          </span>
                        )}

                        {stats.status === 'empty_warning' && (
                          <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.2 rounded font-semibold flex items-center space-x-0.5 animate-pulse">
                            <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                            空缺预警
                          </span>
                        )}
                        {stats.status === 'met' && (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded font-semibold flex items-center space-x-0.5">
                            <Check className="w-2.5 h-2.5 mr-0.5" />
                            配额达标
                          </span>
                        )}
                      </div>

                      {/* 时间与照片跨度 */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 mt-1 font-mono">
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>
                            {chapter.startTime || '未记录'} ~{' '}
                            {chapter.endTime ? chapter.endTime.split(' ')[1] : '末尾'}
                          </span>
                        </span>
                        <span className="text-slate-600">|</span>
                        <span>
                          底片 #{chapter.startIndex + 1} - #{chapter.endIndex + 1} (
                          {chapter.photoCount} 张)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 右侧：配额步进、进度条与操作 */}
                  <div className="flex items-center space-x-4 shrink-0">
                    {/* 交付配额目标调节 */}
                    <div className="flex flex-col items-end">
                      <div className="flex items-center space-x-1 text-xs">
                        <Target className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-slate-400">交付目标:</span>
                        <div className="flex items-center space-x-1 bg-dark-900 border border-dark-700 rounded-md px-1.5 py-0.5">
                          <button
                            onClick={() =>
                              updateChapter(chapter.id, {
                                targetQuota: Math.max(1, chapter.targetQuota - 1),
                              })
                            }
                            className="hover:text-brand-400 text-slate-400 px-1 font-mono font-bold"
                          >
                            -
                          </button>
                          <span className="font-mono font-bold text-slate-100 min-w-[20px] text-center">
                            {chapter.targetQuota}
                          </span>
                          <button
                            onClick={() =>
                              updateChapter(chapter.id, {
                                targetQuota: Math.min(chapter.photoCount, chapter.targetQuota + 1),
                              })
                            }
                            className="hover:text-brand-400 text-slate-400 px-1 font-mono font-bold"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-slate-400">张</span>
                      </div>

                      <div className="text-[11px] font-mono text-slate-400 mt-1">
                        已选: <span className="font-bold text-slate-200">{stats.pickedCount}</span> /{' '}
                        {chapter.targetQuota} ({stats.completionPct}%)
                      </div>
                    </div>

                    {/* 操作按钮组 */}
                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => handleJumpToChapterFirst(chapter.startIndex)}
                        className="p-1.5 bg-dark-700 hover:bg-dark-600 text-slate-300 hover:text-slate-100 rounded-lg transition-colors"
                        title="立即在主视口定位到本章第一张照片"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleFocusChapter(chapter.id, chapter.startIndex)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-colors ${
                          isFocused
                            ? 'bg-brand-600 text-white'
                            : 'bg-dark-700 hover:bg-brand-600/30 text-slate-200 hover:text-brand-300 border border-dark-600'
                        }`}
                        title="只看本章节（主界面筛选与胶片条聚焦此环节）"
                      >
                        <span>{isFocused ? '聚焦中' : '只看本章'}</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>

                      {idx > 0 && (
                        <button
                          onClick={() => mergeChapterWithPrevious(chapter.id)}
                          className="p-1.5 bg-dark-700/60 hover:bg-dark-700 text-slate-400 hover:text-amber-300 rounded-lg transition-colors border border-dark-700"
                          title="将本章节与上一章节合并"
                        >
                          <Merge className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 进度条 */}
                <div className="mt-3 w-full bg-dark-950/80 rounded-full h-2 overflow-hidden border border-dark-750">
                  <div
                    style={{ width: `${stats.completionPct}%` }}
                    className={`h-full transition-all duration-300 rounded-full ${
                      stats.status === 'met'
                        ? 'bg-emerald-500'
                        : stats.status === 'empty_warning'
                        ? 'bg-rose-500'
                        : 'bg-amber-500'
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* 底部操作与关闭 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-dark-700/80 bg-dark-800/80 shrink-0">
          <div className="text-xs text-slate-400 flex items-center space-x-2">
            <span>快捷预设交付配额：</span>
            {[10, 15, 20, 25].map((q) => (
              <button
                key={q}
                onClick={() => {
                  chapters.forEach((c) =>
                    updateChapter(c.id, { targetQuota: Math.min(q, c.photoCount) }),
                  );
                }}
                className="px-2 py-0.5 bg-dark-700 hover:bg-dark-600 text-slate-300 rounded text-xs transition-colors"
                title={`将全部章节交付目标统一设置为 ${q} 张`}
              >
                每环节 {q} 张
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-3">
            {selectedChapterId && (
              <button
                onClick={() => setSelectedChapter(null)}
                className="px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-slate-300 rounded-lg text-xs transition-colors"
              >
                取消章节聚焦（查看全部）
              </button>
            )}

            <button
              onClick={() => setChaptersModalOpen(false)}
              className="px-5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              完成并返回选片
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
