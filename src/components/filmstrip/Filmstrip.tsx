import React, { useEffect, useRef, useState } from 'react';
import { usePhotoStore, isPhotoMatchingFilter } from '../../store/photoStore';
import { Check, X, Star } from 'lucide-react';

const ITEM_WIDTH = 112; // w-28 = 7rem = 112px
const ITEM_GAP = 8; // space-x-2 = 0.5rem = 8px
const ITEM_TOTAL = ITEM_WIDTH + ITEM_GAP; // 120px
const CONTAINER_PADDING_X = 16; // px-4 = 16px
const OVERSCAN = 5; // 前后各缓冲 5 个元素，滑动时平滑无白屏

export const Filmstrip: React.FC = () => {
  const {
    photos,
    currentIndex,
    activeFilter,
    selectedCamera,
    selectedLens,
    selectIndex,
    previewCache,
    isCompareMode,
    compareTargetIndex,
  } = usePhotoStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [containerWidth, setContainerWidth] = useState(1200);

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
  };

  // 预计算筛选匹配项的相对序号映射表（仅当存在活动筛选时计算）
  const filteredIndexMap = React.useMemo(() => {
    const isFiltered = activeFilter !== 'all' || selectedCamera !== null || selectedLens !== null;
    if (!isFiltered) return null;
    const map = new Map<string, number>();
    let count = 0;
    photos.forEach((p) => {
      if (isPhotoMatchingFilter(p, activeFilter, selectedCamera, selectedLens)) {
        count++;
        map.set(p.path, count);
      }
    });
    return map;
  }, [photos, activeFilter, selectedCamera, selectedLens]);

  // 自动平滑居中当前选中的缩略图卡片
  useEffect(() => {
    if (!containerRef.current || photos.length === 0) return;
    const container = containerRef.current;
    const itemLeft = CONTAINER_PADDING_X + currentIndex * ITEM_TOTAL;
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
  }, [currentIndex, photos.length]);

  if (photos.length === 0) return null;

  // 虚拟轨道总宽度 (撑开横向滚动条)
  const totalWidth = CONTAINER_PADDING_X * 2 + photos.length * ITEM_TOTAL - ITEM_GAP;

  // 动态计算可视窗口索引范围 (只渲染 15~20 个实际 DOM 节点)
  const startIdx = Math.max(
    0,
    Math.floor((scrollLeft - CONTAINER_PADDING_X) / ITEM_TOTAL) - OVERSCAN,
  );
  const visibleCount = Math.ceil(containerWidth / ITEM_TOTAL);
  const endIdx = Math.min(
    photos.length - 1,
    Math.floor((scrollLeft - CONTAINER_PADDING_X) / ITEM_TOTAL) + visibleCount + OVERSCAN,
  );

  const visiblePhotos: { photo: (typeof photos)[0]; idx: number }[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    visiblePhotos.push({ photo: photos[i], idx: i });
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="h-20 border-t border-dark-700/80 bg-dark-850 overflow-x-auto overflow-y-hidden select-none relative scrollbar-thin scrollbar-thumb-dark-600 scrollbar-track-transparent"
    >
      {/* 虚拟占位画布宽度 */}
      <div
        style={{ width: `${totalWidth}px`, height: '100%', position: 'relative' }}
      >
        {visiblePhotos.map(({ photo, idx }) => {
          const isCurrent = idx === currentIndex;
          const isCompare = isCompareMode && idx === compareTargetIndex;
          const matchesFilter = isPhotoMatchingFilter(photo, activeFilter, selectedCamera, selectedLens);

          const leftPos = CONTAINER_PADDING_X + idx * ITEM_TOTAL;

          return (
            <div
              key={photo.id || photo.path}
              onClick={() => selectIndex(idx)}
              style={{
                position: 'absolute',
                left: `${leftPos}px`,
                top: '8px',
                width: `${ITEM_WIDTH}px`,
                height: '64px',
              }}
              className={`group cursor-pointer rounded-md border overflow-hidden transition-all duration-150 ${
                isCurrent
                  ? 'border-brand-500 ring-2 ring-brand-500/40 bg-dark-700 z-10'
                  : isCompare
                  ? 'border-blue-500 ring-2 ring-blue-500/40 bg-dark-700 z-10'
                  : matchesFilter
                  ? 'border-dark-700/80 hover:border-slate-500 bg-dark-800'
                  : 'border-dark-800/40 bg-dark-900/50 opacity-40 hover:opacity-80'
              }`}
            >
              {/* 背景轻量缩略图 (若在当前缓存中则显示，提升专业质感) */}
              {previewCache.has(photo.path) && (
                <img
                  src={previewCache.get(photo.path)}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-35 pointer-events-none transition-opacity duration-150"
                />
              )}

              {/* 胶片卡片内容 */}
              <div className="relative z-10 w-full h-full flex flex-col justify-between p-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1">
                    {filteredIndexMap?.has(photo.path) && (
                      <span
                        className="text-[10px] font-mono text-amber-300 font-semibold"
                        title={`当前筛选序号: 第 ${filteredIndexMap.get(photo.path)} 张`}
                      >
                        [{filteredIndexMap.get(photo.path)}]
                      </span>
                    )}
                    <span className="text-[9px] font-mono text-slate-400">
                      #{idx + 1}
                    </span>
                    {/* 智能诊断状态指示点 */}
                    <span
                      title={`AI 诊断: ${
                        photo.retouch_status === 'clean'
                          ? '未见明显问题'
                          : photo.retouch_status === 'fixable'
                          ? '可修解决'
                          : photo.retouch_status === 'fatal'
                          ? '不可修硬伤'
                          : photo.retouch_status === 'failed'
                          ? '分析失败，可重试'
                          : '待分析'
                      }`}
                      className={`w-1.5 h-1.5 rounded-full ${
                        photo.retouch_status === 'clean'
                          ? 'bg-emerald-400'
                          : photo.retouch_status === 'fixable'
                          ? 'bg-amber-400'
                          : photo.retouch_status === 'fatal'
                          ? 'bg-rose-400'
                          : photo.retouch_status === 'failed'
                          ? 'bg-orange-400'
                          : 'bg-slate-400'
                      }`}
                    />
                    {photo.burst_group_id && (
                      <span className="text-[8px] px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                        连拍
                      </span>
                    )}
                    {isCompareMode && isCurrent && (
                      <span className="text-[8px] px-1 py-0.2 rounded bg-emerald-500/30 text-emerald-300 font-mono font-semibold">
                        主
                      </span>
                    )}
                    {isCompareMode && isCompare && (
                      <span className="text-[8px] px-1 py-0.2 rounded bg-blue-500/30 text-blue-300 font-mono font-semibold">
                        候
                      </span>
                    )}
                  </div>

                  {/* Pick / Reject 标记 */}
                  {photo.pick_status === 'Pick' && (
                    <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-emerald-500/20 text-emerald-400">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                  )}
                  {photo.pick_status === 'Reject' && (
                    <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-rose-500/20 text-rose-400">
                      <X className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                  )}
                </div>

                <div className="truncate text-[10px] text-slate-300 font-mono">
                  {photo.filename}
                </div>

                {/* 星级与色标底条 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-0.5">
                    {photo.rating > 0 ? (
                      <span className="flex items-center text-[10px] text-amber-400 font-medium space-x-0.5">
                        <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                        <span>{photo.rating}</span>
                      </span>
                    ) : (
                      <span className="text-[9px] text-slate-600">未评</span>
                    )}
                  </div>

                  {photo.color_label && (
                    <span
                      className={`w-2 h-2 rounded-full ${
                        photo.color_label === 'Red'
                          ? 'bg-rose-500'
                          : photo.color_label === 'Yellow'
                          ? 'bg-amber-400'
                          : photo.color_label === 'Green'
                          ? 'bg-emerald-500'
                          : 'bg-blue-500'
                      }`}
                    />
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
