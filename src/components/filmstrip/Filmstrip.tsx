import React, { useEffect, useRef, useState } from 'react';
import { photoMatchesFilter, useAlbumStore } from '../../store/albumStore';
import { useCompareStore } from '../../store/compareStore';
import { useInsightStore } from '../../store/insightStore';
import { usePreviewStore } from '../../store/previewStore';
import { useSelectionStore } from '../../store/selectionStore';
import { parseAnnotation } from '../../utils/annotationUtils';
import { calculateDockScale } from '../../utils/dockEffect';
import { Check, MessageSquare, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

const ITEM_WIDTH = 112; // w-28 = 7rem = 112px
const ITEM_GAP = 8; // space-x-2 = 0.5rem = 8px
const ITEM_TOTAL = ITEM_WIDTH + ITEM_GAP; // 120px
const CONTAINER_PADDING_X = 16; // px-4 = 16px
const OVERSCAN = 8; // 前后各缓冲 8 个元素，滑动时平滑无白屏提前预加载

export const Filmstrip: React.FC = () => {
  const {
    photos,
    currentIndex,
    activeFilter,
    activeTagFilter,
    selectIndex,
    scenes,
    selectedSceneId,
  } = useAlbumStore();
  const { previewCache, prefetchPhotos } = usePreviewStore();
  const { isCompareMode, compareTargetIndex } = useCompareStore();
  const { insights } = useInsightStore();
  const { selections, viewedPhotoIds } = useSelectionStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [containerWidth, setContainerWidth] = useState(1200);

  // macOS Dock 鱼眼悬停放大光标绝对位置跟踪
  const [hoverContentX, setHoverContentX] = useState<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastClientXRef = useRef<number | null>(null);

  // 组件卸载时清理未完成的帧调度
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const updateHoverX = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const contentX = clientX - rect.left + containerRef.current.scrollLeft;
    setHoverContentX(contentX);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    lastClientXRef.current = e.clientX;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (lastClientXRef.current !== null) {
        updateHoverX(lastClientXRef.current);
      }
    });
  };

  const handleMouseLeave = () => {
    lastClientXRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setHoverContentX(null);
  };

  // 监听容器实际宽度变化 (自适应各类屏幕宽度)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setContainerWidth(el.clientWidth);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft);
    if (lastClientXRef.current !== null) {
      updateHoverX(lastClientXRef.current);
    }
  };

  // 计算当前活动筛选条件下的匹配照片列表（保留其在全局 photos 中的 originalIndex）
  const filteredPhotos = React.useMemo(() => {
    const list: { photo: (typeof photos)[0]; originalIndex: number }[] = [];
    photos.forEach((photo, index) => {
      if (
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
        )
      ) {
        list.push({ photo, originalIndex: index });
      }
    });
    return list;
  }, [
    photos,
    activeFilter,
    selectedSceneId,
    scenes,
    selections,
    viewedPhotoIds,
    insights,
    activeTagFilter,
  ]);

  const isFiltered = activeFilter !== 'all' || selectedSceneId !== null || activeTagFilter !== null;
  const totalItems = filteredPhotos.length;

  // 自动平滑居中当前选中的缩略图卡片
  useEffect(() => {
    if (!containerRef.current || totalItems === 0) return;
    const currentFilteredIdx = filteredPhotos.findIndex(
      (item) => item.originalIndex === currentIndex,
    );
    if (currentFilteredIdx < 0) return;

    const container = containerRef.current;
    const itemLeft = CONTAINER_PADDING_X + currentFilteredIdx * ITEM_TOTAL;
    const itemRight = itemLeft + ITEM_WIDTH;
    const viewLeft = container.scrollLeft;
    const viewRight = viewLeft + container.clientWidth;

    // 若当前高亮卡片超出视野或过于贴近边缘，平滑居中滚动
    if (itemLeft < viewLeft + 100 || itemRight > viewRight - 100) {
      const idealScroll = itemLeft - (container.clientWidth - ITEM_WIDTH) / 2;
      container.scrollTo({
        left: Math.max(0, idealScroll),
        behavior: 'smooth',
      });
    }
  }, [currentIndex, filteredPhotos, totalItems]);

  if (photos.length === 0) return null;

  if (totalItems === 0) {
    return (
      <div className="h-full w-full bg-dark-850 flex items-center justify-center text-xs text-slate-400 gap-2.5 border-t border-dark-700/80 select-none">
        <span>当前选项下暂无照片</span>
        <button
          type="button"
          onClick={() => {
            useAlbumStore.getState().setActiveFilter('all');
            useAlbumStore.getState().setSelectedSceneId(null);
            useAlbumStore.getState().setActiveTagFilter(null);
          }}
          className="px-2.5 py-1 rounded-lg bg-dark-750 hover:bg-dark-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
        >
          返回全部照片
        </button>
      </div>
    );
  }

  // 虚拟轨道总宽度 (撑开横向滚动条)
  const totalWidth = CONTAINER_PADDING_X * 2 + totalItems * ITEM_TOTAL - ITEM_GAP;

  // 动态计算可视窗口索引范围 (只渲染 15~20 个实际 DOM 节点)
  const startIdx = Math.max(
    0,
    Math.floor((scrollLeft - CONTAINER_PADDING_X) / ITEM_TOTAL) - OVERSCAN,
  );
  const visibleCount = Math.ceil(containerWidth / ITEM_TOTAL);
  const endIdx = Math.min(
    totalItems - 1,
    Math.floor((scrollLeft - CONTAINER_PADDING_X) / ITEM_TOTAL) + visibleCount + OVERSCAN,
  );

  const visiblePhotos: { photo: (typeof photos)[0]; originalIndex: number; filteredIndex: number }[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    if (filteredPhotos[i]) {
      visiblePhotos.push({
        photo: filteredPhotos[i].photo,
        originalIndex: filteredPhotos[i].originalIndex,
        filteredIndex: i,
      });
    }
  }

  // 视口动态加载：预加载可视范围内缩略图
  useEffect(() => {
    if (totalItems === 0) return;
    const screenCenterIdx = Math.floor(
      (scrollLeft - CONTAINER_PADDING_X + containerWidth / 2) / ITEM_TOTAL,
    );
    const sorted = [...visiblePhotos]
      .sort(
        (a, b) =>
          Math.abs(a.filteredIndex - screenCenterIdx) - Math.abs(b.filteredIndex - screenCenterIdx),
      )
      .map((item) => item.photo);

    prefetchPhotos(sorted);
  }, [startIdx, endIdx, totalItems, prefetchPhotos]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="h-full w-full bg-dark-850 overflow-x-auto overflow-y-hidden select-none relative scrollbar-thin scrollbar-thumb-dark-600 scrollbar-track-transparent"
    >
      {/* 虚拟占位画布宽度 */}
      <div
        style={{ width: `${totalWidth}px`, height: '100%', position: 'relative' }}
      >
        {visiblePhotos.map(({ photo, originalIndex, filteredIndex }) => {
          const isCurrent = originalIndex === currentIndex;
          const isCompare = isCompareMode && originalIndex === compareTargetIndex;
          const insight = insights[photo.id];
          const uncertaintyReasons = (insight?.reasons || []).filter(
            (reason) =>
              reason.includes('眼睛') || reason.includes('模糊') || reason.includes('相似'),
          );
          const chapterStart = scenes.find((scene) => scene.startIndex === originalIndex);
          const thumbnailUrl = previewCache.get(photo.path);

          const leftPos = CONTAINER_PADDING_X + filteredIndex * ITEM_TOTAL;
          const cardCenterX = leftPos + ITEM_WIDTH / 2;
          const { scale, factor, zIndexBoost } = calculateDockScale(
            hoverContentX,
            cardCenterX,
            { radius: 260, maxScale: 0.30 },
          );

          const isHovered = hoverContentX !== null;
          const baseZIndex = isCurrent ? 15 : isCompare ? 12 : 2;
          const finalZIndex = baseZIndex + zIndexBoost;

          const dynamicShadow = factor > 0.05
            ? isCurrent
              ? '0 12px 28px -4px rgba(0, 0, 0, 0.75), 0 0 16px rgba(59, 130, 246, 0.45)'
              : '0 12px 24px -4px rgba(0, 0, 0, 0.65), 0 4px 10px -2px rgba(0, 0, 0, 0.45)'
            : undefined;

          return (
            <div
              key={photo.id || photo.path}
              onClick={() => selectIndex(originalIndex)}
              style={{
                position: 'absolute',
                left: `${leftPos}px`,
                bottom: '8px',
                width: `${ITEM_WIDTH}px`,
                height: '64px',
                transformOrigin: 'bottom center',
                transform: `scale(${scale.toFixed(3)})`,
                zIndex: finalZIndex,
                boxShadow: dynamicShadow,
                transition: isHovered
                  ? 'transform 75ms cubic-bezier(0.2, 0, 0.2, 1), box-shadow 150ms ease'
                  : 'transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 200ms ease',
                willChange: isHovered ? 'transform' : undefined,
                borderLeftColor: chapterStart ? chapterStart.color : undefined,
                borderLeftWidth: chapterStart ? '3px' : undefined,
              }}
              className={`group cursor-pointer rounded-md border overflow-hidden transition-colors duration-150 bg-neutral-950 ${
                isCurrent
                  ? 'border-brand-500 ring-2 ring-brand-500/50'
                  : isCompare
                  ? 'border-blue-500 ring-2 ring-blue-500/50'
                  : factor > 0.15
                  ? 'border-slate-300 dark:border-slate-500'
                  : 'border-dark-700/80 hover:border-slate-400'
              }`}
            >
              {/* 背景缩略图高清展示：保持纯黑底色杜绝浅色透白，中间主体无遮罩 */}
              {thumbnailUrl ? (
                <>
                  <img
                    src={thumbnailUrl}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover opacity-100 pointer-events-none select-none transition-all duration-200"
                  />
                  {/* 仅在顶底文字区域施加微羽化保护暗区，中心画面 100% 通透纯净 */}
                  <div className="absolute top-0 inset-x-0 h-6 bg-gradient-to-b from-black/80 to-transparent pointer-events-none" />
                  <div className="absolute bottom-0 inset-x-0 h-6 bg-gradient-to-t from-black/85 to-transparent pointer-events-none" />
                </>
              ) : (
                /* 滑动时未加载完成的占位动效 */
                <div className="absolute inset-0 bg-neutral-900 animate-pulse flex items-center justify-center pointer-events-none">
                  <div className="w-4 h-4 rounded-full border border-slate-600/40 border-t-brand-400/80 animate-spin" />
                </div>
              )}

              {/* 胶片卡片内容 */}
              <div className="relative z-10 w-full h-full flex flex-col justify-between p-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1">
                    {isFiltered ? (
                      <>
                        <span
                          className="text-[10px] font-mono text-emerald-400 font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                          title={`当前筛选序号: 第 ${filteredIndex + 1} 张 (共 ${totalItems} 张)`}
                        >
                          [{filteredIndex + 1}]
                        </span>
                        <span
                          className="text-[9px] font-mono text-white/70 font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                          title={`原始全局序号: 第 ${originalIndex + 1} 张`}
                        >
                          #{originalIndex + 1}
                        </span>
                      </>
                    ) : (
                      <span className="text-[9px] font-mono text-white font-semibold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                        #{originalIndex + 1}
                      </span>
                    )}
                    {chapterStart && (
                      <span
                        className="text-[8px] px-1 py-0.2 rounded font-sans font-bold truncate max-w-[50px] shadow-sm"
                        style={{ backgroundColor: `${chapterStart.color}40`, color: '#ffffff', borderColor: chapterStart.color, borderWidth: '1px' }}
                        title={`流程环节起始：${chapterStart.name}`}
                      >
                        {chapterStart.name}
                      </span>
                    )}
                    {/* 本地分析提示状态指示点 */}
                    <span
                      title={`辅助提示: ${
                        insight?.analysisStatus === 'no_issues'
                          ? '未见明显问题'
                          : insight?.analysisStatus === 'needs_check'
                          ? '建议人工检查'
                          : insight?.analysisStatus === 'failed'
                          ? '分析失败，可重试'
                          : '待分析'
                      }`}
                      className={`w-1.5 h-1.5 rounded-full ${
                        insight?.analysisStatus === 'no_issues'
                          ? 'bg-emerald-400'
                          : insight?.analysisStatus === 'needs_check'
                          ? 'bg-rose-400'
                          : insight?.analysisStatus === 'failed'
                          ? 'bg-orange-400'
                          : 'bg-slate-400'
                      }`}
                    />
                    {photo.burstGroupId && (
                      <span
                        className={`text-[8px] px-1 py-0.2 rounded font-mono ${
                          insight?.isBestPick
                            ? 'bg-emerald-500/40 text-emerald-200 font-bold border border-emerald-400/60'
                            : 'bg-indigo-500/30 text-indigo-200'
                        }`}
                        title={insight?.isBestPick ? '连拍组内推荐最佳瞬间' : '相似连拍'}
                      >
                        {insight?.isBestPick ? '★ 优' : '连拍'}
                      </span>
                    )}
                    {uncertaintyReasons.length > 0 && (
                      <span
                        title={`建议检查: ${uncertaintyReasons.join(' · ')}`}
                        className="text-[8px] px-0.5 py-0.2 rounded bg-indigo-500/40 text-indigo-100 font-mono flex items-center"
                      >
                        <AlertCircle className="w-2 h-2 mr-0.5 shrink-0" />
                        检查
                      </span>
                    )}
                    {isCompareMode && isCurrent && (
                      <span className="text-[8px] px-1 py-0.2 rounded bg-emerald-500/40 text-emerald-200 font-mono font-semibold">
                        主
                      </span>
                    )}
                    {isCompareMode && isCompare && (
                      <span className="text-[8px] px-1 py-0.2 rounded bg-blue-500/40 text-blue-200 font-mono font-semibold">
                        候
                      </span>
                    )}
                  </div>

                  {/* 用户选择状态徽标 */}
                  {selections[photo.id]?.state === 'selected' && (
                    <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-emerald-500 text-white font-bold shadow-sm">
                      <Check className="w-2.5 h-2.5 stroke-[3.5]" />
                    </span>
                  )}
                  {selections[photo.id]?.state === 'maybe' && (
                    <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-amber-500 text-amber-950 font-extrabold text-[9px] shadow-sm">
                      ?
                    </span>
                  )}
                  {selections[photo.id]?.state === 'skipped' && (
                    <span
                      className="flex h-3.5 items-center justify-center rounded-full bg-slate-600 px-1 text-[8px] font-bold text-white shadow-sm"
                      title="已明确标记为不选"
                    >
                      不选
                    </span>
                  )}
                </div>

                <div className="truncate text-[10px] text-white font-mono font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                  {photo.filename}
                </div>

                {/* 格式、标签与用户备注底条 */}
                <div className="flex items-center justify-between text-[9px] font-mono text-white/90">
                  <div className="flex items-center space-x-1 overflow-hidden min-w-0 flex-1">
                    <span className="text-[8px] bg-black/70 backdrop-blur-xs px-1 py-0.2 rounded text-white/90 shrink-0 font-medium">
                      {photo.isRaw ? 'RAW' : photo.format.toUpperCase()}
                    </span>
                    {(() => {
                      const tags = parseAnnotation(selections[photo.id]?.note).presetTags || [];
                      if (tags.length === 0) return null;
                      const first = tags[0];
                      const isRetouch = first === '要修图';
                      const isStraight = first === '原图直出';
                      return (
                        <span
                          className={clsx(
                            'text-[8px] px-1 py-0.2 rounded font-sans truncate max-w-[48px] shadow-sm',
                            isRetouch
                              ? 'bg-indigo-600/80 text-indigo-100 font-semibold'
                              : isStraight
                              ? 'bg-teal-600/80 text-teal-100 font-semibold'
                              : 'bg-brand-600/80 text-brand-100 font-semibold',
                          )}
                          title={`标签: ${tags.join(' · ')}`}
                        >
                          {first}
                        </span>
                      );
                    })()}
                  </div>

                  {selections[photo.id]?.note && (
                    <span className="flex items-center text-amber-300 shrink-0 ml-1 drop-shadow-sm" title={`备注: ${selections[photo.id]?.note}`}>
                      <MessageSquare className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
