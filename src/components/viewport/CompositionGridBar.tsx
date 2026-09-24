import React, { useState, useRef, useEffect } from 'react';
import { useGridStore } from '../../store/gridStore';
import { GRID_COLORS, GRID_TYPE_METAS, GridType, GridColor } from '../../types/grid';
import {
  Grid3X3,
  RotateCw,
  EyeOff,
  Disc,
  LayoutGrid,
  Maximize2,
  Crosshair,
  Sliders,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import clsx from 'clsx';

export const CompositionGridBar: React.FC = () => {
  const {
    gridType,
    spiralOrientation,
    gridColor,
    opacity,
    showPowerPoints,
    setGridType,
    cycleGridType,
    cycleSpiralOrientation,
    setGridColor,
    setOpacity,
    togglePowerPoints,
  } = useGridStore();

  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // 点击外部自动收起面板
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const currentMeta = GRID_TYPE_METAS.find((m) => m.id === gridType);
  const isEnabled = gridType !== 'none';

  const renderIcon = (type: GridType, className = 'w-3.5 h-3.5') => {
    switch (type) {
      case 'thirds':
        return <Grid3X3 className={className} />;
      case 'golden_spiral':
        return <Disc className={className} />;
      case 'golden_ratio':
        return <LayoutGrid className={className} />;
      case 'diagonal':
        return <Maximize2 className={className} />;
      case 'center':
        return <Crosshair className={className} />;
      default:
        return <EyeOff className={className} />;
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* 触发胶囊按钮 */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title="经典构图参考线 [快捷键 O 循环切换，Shift+O 翻转黄金螺旋]"
        className={clsx(
          'flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg shadow-lg text-xs font-medium transition-all cursor-pointer select-none border',
          isEnabled
            ? 'bg-amber-950/40 border-amber-500/50 text-amber-200 hover:bg-amber-900/50'
            : 'bg-dark-800/85 hover:bg-dark-700 text-slate-300 border-dark-700/80',
        )}
      >
        <Grid3X3 className={clsx('w-3.5 h-3.5', isEnabled ? 'text-amber-400' : 'text-slate-400')} />
        <span className="font-sans">
          {isEnabled ? `构图: ${currentMeta?.shortName || '开'}` : '构图线 (O)'}
        </span>
        <ChevronDown
          className={clsx(
            'w-3 h-3 text-slate-400 transition-transform duration-150',
            isOpen && 'rotate-180 text-amber-400',
          )}
        />
      </button>

      {/* 展开的悬浮参数调控面板 */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-dark-700/90 bg-dark-900/95 p-3.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 z-30 select-none text-xs text-slate-200">
          {/* 标题栏 */}
          <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-dark-750">
            <div className="flex items-center space-x-1.5 font-bold text-slate-100">
              <Grid3X3 className="w-4 h-4 text-amber-400" />
              <span>经典摄影构图线</span>
            </div>
            <button
              type="button"
              onClick={cycleGridType}
              title="按快捷键 O 循环切换构图线"
              className="text-[10px] font-mono text-slate-400 hover:text-amber-300 bg-dark-800 hover:bg-dark-750 px-1.5 py-0.5 rounded border border-dark-700 hover:border-amber-500/40 transition-colors cursor-pointer"
            >
              O 循环
            </button>
          </div>

          {/* 构图线模式选择卡片列表 */}
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {GRID_TYPE_METAS.map((meta) => {
              const active = gridType === meta.id;
              return (
                <button
                  key={meta.id}
                  type="button"
                  onClick={() => {
                    setGridType(meta.id);
                  }}
                  className={clsx(
                    'flex items-center space-x-2 px-2.5 py-2 rounded-xl text-left transition-all border cursor-pointer',
                    active
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-100 shadow-sm'
                      : 'bg-dark-800/60 hover:bg-dark-750 border-dark-700/70 text-slate-300',
                  )}
                >
                  <span className={clsx(active ? 'text-amber-400' : 'text-slate-400')}>
                    {renderIcon(meta.id, 'w-3.5 h-3.5')}
                  </span>
                  <span className="font-medium truncate">{meta.shortName}</span>
                </button>
              );
            })}
          </div>

          {/* 黄金螺旋专项微调 */}
          {gridType === 'golden_spiral' && (
            <div className="mb-3 p-2 rounded-xl bg-amber-950/20 border border-amber-500/30 flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-amber-200">
                <Disc className="w-3.5 h-3.5 text-amber-400" />
                <span>螺旋朝向：象限 {(spiralOrientation + 1)}/4</span>
              </div>
              <button
                type="button"
                onClick={cycleSpiralOrientation}
                title="旋转黄金螺旋朝向 [快捷键 Shift + O]"
                className="flex items-center space-x-1 bg-amber-500/25 hover:bg-amber-500/40 text-amber-200 border border-amber-500/40 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer"
              >
                <RotateCw className="w-3 h-3" />
                <span>旋转 (Shift+O)</span>
              </button>
            </div>
          )}

          {/* 颜色搭配 */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
              <span>参考线颜色</span>
              <span className="font-medium text-slate-300">{GRID_COLORS[gridColor].label}</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {(Object.keys(GRID_COLORS) as GridColor[]).map((c) => {
                const cfg = GRID_COLORS[c];
                const isSelected = gridColor === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setGridColor(c)}
                    className={clsx(
                      'flex items-center justify-center space-x-1 py-1.5 rounded-lg border text-[11px] font-medium transition-all cursor-pointer',
                      isSelected
                        ? 'border-brand-400 bg-brand-500/20 text-white shadow-sm'
                        : 'border-dark-700 bg-dark-800 text-slate-300 hover:bg-dark-750',
                    )}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-black/40"
                      style={{ backgroundColor: cfg.cssColor }}
                    />
                    <span>{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 不透明度滑杆 */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
              <span className="flex items-center gap-1">
                <Sliders className="w-3 h-3 text-slate-400" />
                <span>线条透明度</span>
              </span>
              <span className="font-mono text-slate-300">{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="1.0"
              step="0.05"
              value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-brand-400"
            />
          </div>

          {/* 黄金交点 (Power Points) 开关 */}
          {(gridType === 'thirds' || gridType === 'golden_ratio') && (
            <div className="pt-2 border-t border-dark-750 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] text-slate-300">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>显示黄金兴趣交点</span>
              </span>
              <button
                type="button"
                onClick={togglePowerPoints}
                className={clsx(
                  'relative inline-flex h-4 w-8 items-center rounded-full transition-colors cursor-pointer',
                  showPowerPoints ? 'bg-amber-500' : 'bg-dark-700',
                )}
              >
                <span
                  className={clsx(
                    'inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-150',
                    showPowerPoints ? 'translate-x-4' : 'translate-x-1',
                  )}
                />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
