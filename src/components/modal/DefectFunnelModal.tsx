import React, { useState, useMemo, useEffect } from 'react';
import { useAlbumStore } from '../../store/albumStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useInsightStore } from '../../store/insightStore';
import { usePreviewStore } from '../../store/previewStore';
import { SelectionState } from '../../types/photo';
import {
  X,
  Flame,
  CheckSquare,
  Square,
  Lock,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import clsx from 'clsx';

interface DefectFunnelModalProps {
  onClose: () => void;
}

export type FunnelCategory = 'all' | 'blinks' | 'blur' | 'burst';

export const DefectFunnelModal: React.FC<DefectFunnelModalProps> = ({ onClose }) => {
  const { photos, selectIndex } = useAlbumStore();
  const { selections, setSelectionStates } = useSelectionStore();
  const { insights } = useInsightStore();
  const { previewCache, prefetchPhotos } = usePreviewStore();

  const [activeTab, setActiveTab] = useState<FunnelCategory>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 1. 废片智能判断与特征分类
  const defectItems = useMemo(() => {
    return photos.map((photo, index) => {
      const insight = insights[photo.id];
      const selection = selections[photo.id];
      const isProtected = selection?.state === 'selected';
      const isAlreadySkipped = selection?.state === 'skipped';

      // 闭眼判定 (eye_open_score < 0.45 或 闭眼标签)
      const hasFaceBlink = !!(photo.faces && photo.faces.some((f) => f.eye_open_score < 0.45));
      const hasInsightBlink = !!(
        insight &&
        ((insight.possibleClosedEyes !== undefined && insight.possibleClosedEyes < 0.45) ||
          insight.reasons.some((r) => r.includes('闭眼') || r.includes('眼睛')))
      );
      const isBlink = hasFaceBlink || hasInsightBlink;

      // 严重脱焦与模糊判定 (possibleBlur > 45 或 sharpness < 25 或 模糊标签)
      const isBlur = !!(
        insight &&
        (insight.possibleBlur! > 45 ||
          (photo.sharpness !== undefined && photo.sharpness < 25) ||
          insight.reasons.some((r) => r.includes('模糊') || r.includes('脱焦')))
      );

      // 连拍冗余劣片判定 (非最佳推荐，且有一定缺陷)
      const isBurstSuboptimal = !!(
        photo.burstGroupId &&
        insight &&
        !insight.isBestPick &&
        (isBlink || isBlur || insight.analysisStatus === 'needs_check')
      );

      const isDefect = isBlink || isBlur || isBurstSuboptimal;

      let defectLabel = '';
      if (isBlink && isBlur) {
        defectLabel = '闭眼 + 严重脱焦';
      } else if (isBlink) {
        defectLabel = '疑似闭眼/微闭';
      } else if (isBlur) {
        defectLabel = '焦点脱靶/模糊';
      } else if (isBurstSuboptimal) {
        defectLabel = '连拍冗余劣选';
      }

      return {
        photo,
        originalIndex: index,
        insight,
        selection,
        isBlink,
        isBlur,
        isBurstSuboptimal,
        isDefect,
        defectLabel,
        isProtected,
        isAlreadySkipped,
      };
    });
  }, [photos, insights, selections]);

  // 统计各分类待处理废片（排除摄影师已选保护的照片）
  const categoryCounts = useMemo(() => {
    let all = 0;
    let blinks = 0;
    let blur = 0;
    let burst = 0;

    defectItems.forEach((item) => {
      if (!item.isDefect) return;
      all += 1;
      if (item.isBlink) blinks += 1;
      if (item.isBlur) blur += 1;
      if (item.isBurstSuboptimal) burst += 1;
    });

    return { all, blinks, blur, burst };
  }, [defectItems]);

  // 当前 Tab 下的照片列表
  const displayedItems = useMemo(() => {
    return defectItems.filter((item) => {
      if (!item.isDefect) return false;
      if (activeTab === 'blinks') return item.isBlink;
      if (activeTab === 'blur') return item.isBlur;
      if (activeTab === 'burst') return item.isBurstSuboptimal;
      return true;
    });
  }, [defectItems, activeTab]);

  // 默认自动勾选当前分类下所有“未受保护且尚未不选”的疑似废片
  useEffect(() => {
    const autoCullIds = new Set<string>();
    displayedItems.forEach((item) => {
      if (!item.isProtected && !item.isAlreadySkipped) {
        autoCullIds.add(item.photo.id);
      }
    });
    setSelectedIds(autoCullIds);

    // 预热预览图
    prefetchPhotos(displayedItems.slice(0, 30).map((i) => i.photo));
  }, [displayedItems, prefetchPhotos]);

  // ESC 快捷键关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 勾选/取消单张照片
  const togglePhoto = (id: string, isProtected: boolean) => {
    if (isProtected) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 全选/反选
  const handleToggleSelectAll = () => {
    const eligible = displayedItems.filter((i) => !i.isProtected && !i.isAlreadySkipped);
    if (selectedIds.size === eligible.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligible.map((i) => i.photo.id)));
    }
  };

  // 核心粉碎动作：将选中的照片批量标记为已不选 (skipped)
  const handleCullSelected = () => {
    if (selectedIds.size === 0) return;

    const updates = Array.from(selectedIds).map((id) => ({
      photoId: id,
      state: 'skipped' as SelectionState,
    }));

    setSelectionStates(updates, `粉碎 ${updates.length} 张闭眼/模糊废片`);
    setToastMessage(`⚡ 已成功粉碎 ${updates.length} 张废片！(可随时按 Cmd+Z 撤销)`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 跳转到照片主界面
  const handleJumpToPhoto = (index: number) => {
    selectIndex(index);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150 select-none">
      <div className="flex h-[90vh] w-full max-w-5xl flex-col rounded-2xl border border-dark-700 bg-dark-900 shadow-2xl overflow-hidden">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between border-b border-dark-750 bg-dark-850 px-5 py-3.5">
          <div className="flex items-center space-x-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-white tracking-wide">
                  废片一键粉碎漏斗 (Blink & Blur Funnel)
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  {categoryCounts.all} 张疑似缺陷
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                自动揪出闭眼、严重脱焦与连拍劣选，一键批量瘦身排除；原片全程只读绝不修改物理文件
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-dark-750 hover:text-slate-200 transition-colors cursor-pointer"
            title="关闭 [Esc]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 分类切换器与控制栏 */}
        <div className="flex items-center justify-between border-b border-dark-750 bg-dark-850/60 px-5 py-2.5">
          {/* Tab 分类切换 */}
          <div className="flex items-center space-x-1.5 rounded-xl bg-dark-800 p-1 border border-dark-700">
            {[
              { id: 'all', label: '全部疑似废片', count: categoryCounts.all },
              { id: 'blinks', label: '👁️ 闭眼/微闭', count: categoryCounts.blinks },
              { id: 'blur', label: '🌫️ 脱焦/手抖模糊', count: categoryCounts.blur },
              { id: 'burst', label: '📸 连拍冗余劣选', count: categoryCounts.burst },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as FunnelCategory)}
                className={clsx(
                  'flex items-center space-x-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer',
                  activeTab === tab.id
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200',
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={clsx(
                    'text-[10px] font-mono px-1.5 rounded-full',
                    activeTab === tab.id
                      ? 'bg-rose-800 text-white'
                      : 'bg-dark-700 text-slate-400',
                  )}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* 全选操作 */}
          <div className="flex items-center space-x-3 text-xs text-slate-300">
            <button
              onClick={handleToggleSelectAll}
              className="flex items-center space-x-1.5 text-xs text-slate-300 hover:text-white cursor-pointer transition-colors"
            >
              {selectedIds.size > 0 &&
              selectedIds.size ===
                displayedItems.filter((i) => !i.isProtected && !i.isAlreadySkipped).length ? (
                <CheckSquare className="h-4 w-4 text-rose-400" />
              ) : (
                <Square className="h-4 w-4 text-slate-500" />
              )}
              <span>全选待粉碎照片</span>
            </button>
            <span className="text-slate-600">|</span>
            <span className="text-[11px] font-mono text-slate-400">
              已选 <span className="font-bold text-rose-400">{selectedIds.size}</span> 张
            </span>
          </div>
        </div>

        {/* 提示 Toast */}
        {toastMessage && (
          <div className="bg-emerald-600/90 text-white text-xs font-semibold px-4 py-2 text-center shadow-lg backdrop-blur flex items-center justify-center space-x-2 animate-in fade-in duration-150">
            <Sparkles className="h-4 w-4" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* 照片画廊网格 */}
        <div className="flex-1 overflow-y-auto p-5">
          {displayedItems.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center p-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-3">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <h3 className="text-sm font-bold text-slate-200">太棒了！当前分类下无明显废片</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                AI 检查未在此分类下发现严重的闭眼或严重脱焦问题，整体拍摄状态良好。
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
              {displayedItems.map((item) => {
                const isChecked = selectedIds.has(item.photo.id);
                const thumb = previewCache.get(item.photo.path);

                return (
                  <div
                    key={item.photo.id}
                    onClick={() => togglePhoto(item.photo.id, item.isProtected)}
                    className={clsx(
                      'group relative flex flex-col rounded-xl border p-2 transition-all cursor-pointer overflow-hidden',
                      item.isProtected
                        ? 'border-emerald-500/40 bg-emerald-500/5'
                        : isChecked
                        ? 'border-rose-500/80 bg-rose-500/10 ring-1 ring-rose-500/40 shadow-md'
                        : 'border-dark-750 bg-dark-800/60 hover:border-dark-600',
                    )}
                  >
                    {/* 缩略图区域 */}
                    <div className="relative aspect-4/3 w-full rounded-lg bg-dark-950 overflow-hidden mb-2">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={item.photo.filename}
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-600 text-xs font-mono">
                          载入中...
                        </div>
                      )}

                      {/* 勾选框 / 保护状态标志 */}
                      <div className="absolute top-1.5 left-1.5 z-10">
                        {item.isProtected ? (
                          <div
                            className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-emerald-600/90 text-white text-[9px] font-bold shadow-md"
                            title="摄影师已选定保留 · 自动免疫粉碎"
                          >
                            <Lock className="h-2.5 w-2.5" />
                            <span>已保护</span>
                          </div>
                        ) : item.isAlreadySkipped ? (
                          <div className="px-1.5 py-0.5 rounded-full bg-dark-800/90 text-slate-400 text-[9px] border border-dark-700">
                            已是不选
                          </div>
                        ) : (
                          <div
                            className={clsx(
                              'flex h-5 w-5 items-center justify-center rounded border transition-colors',
                              isChecked
                                ? 'bg-rose-600 border-rose-500 text-white'
                                : 'bg-dark-900/80 border-dark-600 text-transparent group-hover:border-slate-400',
                            )}
                          >
                            <CheckSquare className="h-3.5 w-3.5 stroke-[3]" />
                          </div>
                        )}
                      </div>

                      {/* 缺陷诊断胶囊 */}
                      <div className="absolute bottom-1.5 inset-x-1.5 z-10">
                        <span className="block truncate rounded bg-black/75 px-1.5 py-0.5 text-center text-[10px] font-semibold text-rose-300 border border-rose-500/30 backdrop-blur-sm">
                          {item.defectLabel}
                        </span>
                      </div>
                    </div>

                    {/* 照片信息与跳转 */}
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="truncate text-slate-300 font-mono text-[10px] max-w-[100px]">
                        {item.photo.filename}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleJumpToPhoto(item.originalIndex);
                        }}
                        className="text-[10px] text-slate-400 hover:text-brand-300 flex items-center space-x-0.5 cursor-pointer"
                        title="跳转并在主工作区查看"
                      >
                        <span>检视</span>
                        <ArrowRight className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部操作与粉碎栏 */}
        <div className="flex items-center justify-between border-t border-dark-750 bg-dark-850 px-5 py-3">
          <div className="flex items-center space-x-2 text-xs text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>
              已自动保护{' '}
              <span className="font-bold text-emerald-400">
                {defectItems.filter((i) => i.isProtected).length}
              </span>{' '}
              张已选照片，粉碎支持随时按 <span className="font-mono text-slate-200">Cmd+Z</span> 撤销。
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="rounded-xl border border-dark-700 bg-dark-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-dark-750 transition-colors cursor-pointer"
            >
              稍后处理
            </button>

            <button
              onClick={handleCullSelected}
              disabled={selectedIds.size === 0}
              className={clsx(
                'flex items-center space-x-2 rounded-xl px-5 py-2 text-xs font-bold transition-all shadow-lg cursor-pointer',
                selectedIds.size > 0
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 active:scale-[0.98]'
                  : 'bg-dark-750 text-slate-500 border border-dark-700 cursor-not-allowed',
              )}
            >
              <Flame className="h-4 w-4" />
              <span>一键粉碎选中的 {selectedIds.size} 张废片 (标记为不选 N)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
