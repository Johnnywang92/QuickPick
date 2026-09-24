import React, { useRef } from 'react';
import { useLutStore } from '../../store/lutStore';
import { useAlbumStore } from '../../store/albumStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useAdjustStore } from '../../store/adjustStore';
import { BUILTIN_LUTS } from '../../utils/lutPresets';
import {
  Film,
  Sparkles,
  SlidersHorizontal,
  Eye,
  Upload,
  X,
  Check,
  Trash2,
  Layers,
  Frame,
} from 'lucide-react';
import clsx from 'clsx';

export const LutControlBar: React.FC = () => {
  const {
    activeLutId,
    isEnabled,
    intensity,
    isBypassComparing,
    isPanelOpen,
    customLuts,
    photoLuts,
    hoverLutId,
    setActiveLutId,
    setHoverLutId,
    toggleEnabled,
    setIntensity,
    setIsBypassComparing,
    setIsPanelOpen,
    togglePanelOpen,
    importCubeContent,
    removeCustomLut,
    setPhotoLut,
    clearPhotoLut,
    batchApplyLut,
    clearAllPhotoLuts,
  } = useLutStore();

  const { photos, currentIndex } = useAlbumStore();
  const selections = useSelectionStore((s) => s.selections);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentPhoto = photos[currentIndex];
  const currentPhotoLut = currentPhoto ? photoLuts[currentPhoto.id] : null;

  // 单张图片生效的 LUT 与浓度：如果当前有照片，优先以单照片的设置生效；若单照片未设置则为 null（原片直出）；如果完全没有载入图库，则跟随全局 activeLutId
  const effectiveLutId = currentPhoto ? currentPhotoLut?.lutId ?? null : activeLutId;
  const effectiveIntensity = currentPhoto ? (currentPhotoLut ? currentPhotoLut.intensity : intensity) : intensity;

  // 获取当前生效的 LUT 名称与 Hover 预览名称
  const currentBuiltin = BUILTIN_LUTS.find((l) => l.id === effectiveLutId);
  const currentCustom = customLuts.find((l) => l.id === effectiveLutId);
  const currentName = currentBuiltin?.name || currentCustom?.name;

  const isHovering = hoverLutId !== null;
  const hoverBuiltin = BUILTIN_LUTS.find((l) => l.id === hoverLutId);
  const hoverCustom = customLuts.find((l) => l.id === hoverLutId);
  const hoverName =
    hoverLutId === '__bypass__'
      ? '原片直出'
      : hoverBuiltin?.name || hoverCustom?.name || '';

  const handleTogglePanel = () => {
    if (isPanelOpen) {
      setHoverLutId(null);
    }
    togglePanelOpen();
  };

  // 批量应用候选
  const selectedPhotoIds = photos.filter((p) => selections[p.id]?.state === 'selected').map((p) => p.id);
  const totalLutsAppliedCount = Object.keys(photoLuts).length;

  const handleSelectLut = (lutId: string | null) => {
    setHoverLutId(null);
    if (currentPhoto) {
      if (lutId === null) {
        clearPhotoLut(currentPhoto.id);
      } else {
        setPhotoLut(currentPhoto.id, lutId, effectiveIntensity);
      }
    }
    setActiveLutId(lutId);
  };

  const handleIntensityChange = (val: number) => {
    setIntensity(val);
    if (currentPhoto && effectiveLutId) {
      setPhotoLut(currentPhoto.id, effectiveLutId, val);
    }
  };

  const handleApplyToSelected = () => {
    const targetLutId = effectiveLutId || activeLutId;
    if (!targetLutId || selectedPhotoIds.length === 0) return;
    batchApplyLut(selectedPhotoIds, targetLutId, effectiveIntensity);
  };

  const handleApplyToAll = () => {
    const targetLutId = effectiveLutId || activeLutId;
    if (!targetLutId || photos.length === 0) return;
    batchApplyLut(photos.map((p) => p.id), targetLutId, effectiveIntensity);
  };

  const handleClearAll = () => {
    clearAllPhotoLuts();
    setActiveLutId(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        try {
          const newId = importCubeContent(content, file.name);
          if (currentPhoto) {
            setPhotoLut(currentPhoto.id, newId, effectiveIntensity);
          }
        } catch (err) {
          alert(`导入 .cube 文件失败: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="relative inline-block text-xs font-sans select-none">
      {/* 隐藏的文件导入框 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".cube"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* 顶部胶囊快捷条 */}
      <div className="flex items-center space-x-1.5 bg-dark-800/85 backdrop-blur-md border border-dark-700/80 px-2.5 py-1.5 rounded-lg shadow-lg text-slate-300">
        <button
          onClick={handleTogglePanel}
          className={clsx(
            'flex items-center space-x-1.5 px-2 py-0.5 rounded-md font-medium transition-all cursor-pointer',
            isHovering
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
              : effectiveLutId && isEnabled
              ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 shadow-sm'
              : 'hover:bg-dark-700 text-slate-300',
          )}
          title="点击展开 3D LUT 胶片调色预设库"
        >
          <Film className={clsx('w-3.5 h-3.5', isHovering ? 'text-amber-400' : 'text-indigo-400')} />
          <span className="font-sans">
            {isHovering
              ? `${hoverName} (预览中)`
              : effectiveLutId && isEnabled
              ? `${currentName || '胶片调色'} (${Math.round(effectiveIntensity * 100)}%)`
              : '3D LUT 胶片预览'}
          </span>
        </button>

        {effectiveLutId && (
          <>
            <div className="w-[1px] h-3.5 bg-dark-600" />

            {/* 开关 LUT [L] */}
            <button
              onClick={toggleEnabled}
              className={clsx(
                'px-1.5 py-0.5 rounded text-[10.5px] font-semibold transition-colors cursor-pointer',
                isEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-dark-700 text-slate-400 hover:text-slate-200',
              )}
              title="一键开启/关闭 LUT [快捷键 L]"
            >
              {isEnabled ? '开' : '关'}
            </button>

            {/* 原片长按瞬时对比 [\] */}
            <button
              onMouseDown={() => setIsBypassComparing(true)}
              onMouseUp={() => setIsBypassComparing(false)}
              onMouseLeave={() => setIsBypassComparing(false)}
              onTouchStart={() => setIsBypassComparing(true)}
              onTouchEnd={() => setIsBypassComparing(false)}
              className={clsx(
                'px-2 py-0.5 rounded text-[10.5px] flex items-center space-x-1 transition-all cursor-pointer',
                isBypassComparing
                  ? 'bg-amber-500 text-slate-900 font-bold shadow-md'
                  : 'bg-dark-700 hover:bg-dark-650 text-slate-300',
              )}
              title="按住临时查看未调色原片 [快捷键 \\]"
            >
              <Eye className="w-3 h-3" />
              <span>{isBypassComparing ? '原片中...' : '按住对比'}</span>
            </button>
          </>
        )}
      </div>

      {/* 展开的 LUT 调色面板 Popover */}
      {isPanelOpen && (
        <div
          onMouseLeave={() => setHoverLutId(null)}
          className="absolute right-0 top-10 z-50 w-76 rounded-2xl border border-dark-700 bg-dark-900/95 p-3.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 text-slate-200 space-y-3"
        >
          {/* 面板头部 */}
          <div className="flex items-center justify-between pb-2 border-b border-dark-750">
            <div className="flex items-center space-x-2">
              <span className="p-1 rounded-md bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
              <div>
                <h4 className="text-xs font-bold text-slate-100">3D LUT 胶片色彩预览</h4>
                <p className="text-[10px] text-slate-400 font-sans">
                  实时 GPU 渲染 · 原片无损无修改
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setHoverLutId(null);
                setIsPanelOpen(false);
              }}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-dark-800 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 预设列表 */}
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {/* 原片直出选项 */}
            <button
              onClick={() => handleSelectLut(null)}
              onMouseEnter={() => setHoverLutId('__bypass__')}
              onMouseLeave={() => setHoverLutId(null)}
              className={clsx(
                'w-full flex items-center justify-between p-2 rounded-xl border text-left transition-all cursor-pointer',
                effectiveLutId === null
                  ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 shadow-sm'
                  : hoverLutId === '__bypass__'
                  ? 'bg-dark-800 border-indigo-500/60 text-slate-200'
                  : 'bg-dark-850/70 border-dark-750 hover:bg-dark-800 text-slate-300',
              )}
            >
              <div>
                <div className="font-semibold text-xs flex items-center gap-1.5">
                  <span>原片直出 (Raw / Bypass)</span>
                  {effectiveLutId === null && <Check className="w-3 h-3 text-indigo-400" />}
                </div>
                <div className="text-[10px] text-slate-400">相机原生色彩，不施加任何色彩模拟</div>
              </div>
            </button>

            {/* 内置摄影级胶片与复古预设 */}
            {BUILTIN_LUTS.map((lut) => {
              const isSelected = effectiveLutId === lut.id;
              const isHovered = hoverLutId === lut.id;
              return (
                <button
                  key={lut.id}
                  onClick={() => handleSelectLut(lut.id)}
                  onMouseEnter={() => setHoverLutId(lut.id)}
                  onMouseLeave={() => setHoverLutId(null)}
                  className={clsx(
                    'w-full flex items-center justify-between p-2 rounded-xl border text-left transition-all cursor-pointer',
                    isSelected
                      ? 'bg-indigo-600/25 border-indigo-500 text-indigo-200 shadow-sm ring-1 ring-indigo-500/50'
                      : isHovered
                      ? 'bg-dark-800 border-indigo-500/60 text-slate-200 ring-1 ring-indigo-500/30'
                      : 'bg-dark-850/70 border-dark-750 hover:bg-dark-800 text-slate-300',
                  )}
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs truncate">{lut.name}</span>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-dark-750 text-slate-400 border border-dark-700 shrink-0">
                        {lut.tag}
                      </span>
                      {isSelected && <Check className="w-3 h-3 text-indigo-400 shrink-0" />}
                    </div>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">{lut.description}</p>
                  </div>
                </button>
              );
            })}

            {/* 用户自定义 .cube LUT 列表 */}
            {customLuts.length > 0 && (
              <div className="pt-2 border-t border-dark-750/70">
                <div className="text-[10px] text-slate-400 font-semibold mb-1">自定义导入 LUT</div>
                {customLuts.map((custom) => {
                  const isSelected = effectiveLutId === custom.id;
                  const isHovered = hoverLutId === custom.id;
                  return (
                    <div
                      key={custom.id}
                      onClick={() => handleSelectLut(custom.id)}
                      onMouseEnter={() => setHoverLutId(custom.id)}
                      onMouseLeave={() => setHoverLutId(null)}
                      className={clsx(
                        'flex items-center justify-between p-2 rounded-xl border text-left transition-all cursor-pointer mb-1.5',
                        isSelected
                          ? 'bg-indigo-600/25 border-indigo-500 text-indigo-200'
                          : isHovered
                          ? 'bg-dark-800 border-indigo-500/60 text-slate-200 ring-1 ring-indigo-500/30'
                          : 'bg-dark-850/70 border-dark-750 hover:bg-dark-800 text-slate-300',
                      )}
                    >
                      <div className="flex-1 truncate mr-2">
                        <div className="font-bold text-xs truncate">{custom.name}</div>
                        <div className="text-[9px] text-slate-500 font-mono">
                          {custom.size}x{custom.size}x{custom.size} 3D LUT
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCustomLut(custom.id);
                        }}
                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                        title="删除该自定义 LUT"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 风格强度滑块 */}
          {effectiveLutId && (
            <div className="pt-2 border-t border-dark-750 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-slate-400 font-medium">
                  <SlidersHorizontal className="w-3 h-3 text-indigo-400" />
                  风格渲染浓度
                </span>
                <span className="font-mono font-bold text-indigo-300">
                  {Math.round(effectiveIntensity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={effectiveIntensity}
                onChange={(e) => handleIntensityChange(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 h-1.5 bg-dark-800 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          )}

          {/* 批量应用管理 */}
          <div className="pt-2 border-t border-dark-750 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1.5 font-medium">
                <Layers className="w-3 h-3 text-indigo-400" />
                批量统一调色
              </span>
              {currentName && (
                <span className="text-[10px] text-indigo-300 truncate max-w-[100px]" title={currentName}>
                  {currentName}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={handleApplyToSelected}
                disabled={!effectiveLutId || selectedPhotoIds.length === 0}
                className="py-1.5 px-2 rounded-lg bg-dark-800 hover:bg-dark-750 disabled:opacity-40 disabled:hover:bg-dark-800 border border-dark-700 text-slate-200 text-[10px] font-medium transition-colors cursor-pointer disabled:cursor-not-allowed text-center"
                title={selectedPhotoIds.length === 0 ? '当前没有标记为已挑选的照片' : `应用到 ${selectedPhotoIds.length} 张已选照片`}
              >
                应用到已选 ({selectedPhotoIds.length})
              </button>
              <button
                onClick={handleApplyToAll}
                disabled={!effectiveLutId || photos.length === 0}
                className="py-1.5 px-2 rounded-lg bg-dark-800 hover:bg-dark-750 disabled:opacity-40 disabled:hover:bg-dark-800 border border-dark-700 text-slate-200 text-[10px] font-medium transition-colors cursor-pointer disabled:cursor-not-allowed text-center"
                title={`将当前滤镜批量应用到全部 ${photos.length} 张照片`}
              >
                应用到全部 ({photos.length})
              </button>
            </div>

            {totalLutsAppliedCount > 0 && (
              <button
                onClick={handleClearAll}
                className="w-full py-1 rounded-lg hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 text-slate-400 hover:text-rose-300 text-[9.5px] transition-colors cursor-pointer flex items-center justify-center gap-1"
                title="重置所有照片的 LUT 设置，恢复为原片直出"
              >
                <Trash2 className="w-2.5 h-2.5" />
                <span>清除全部照片调色 ({totalLutsAppliedCount} 张已调色)</span>
              </button>
            )}
          </div>

          {/* 底部操作与联动 */}
          <div className="pt-2 border-t border-dark-750 space-y-2">
            <button
              onClick={() => {
                setIsPanelOpen(false);
                useAdjustStore.getState().setIsModalOpen(true);
                useAdjustStore.getState().setActiveTab('adjust');
              }}
              className="w-full py-1.5 px-2.5 rounded-xl bg-gradient-to-r from-amber-500/15 via-brand-500/20 to-indigo-500/15 hover:from-amber-500/25 hover:to-indigo-500/25 border border-brand-500/30 text-brand-200 hover:text-white font-medium text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-sm"
              title="进入完整相框工作台进行曝光、白平衡与艺术相框精修 [快捷键 E]"
            >
              <Frame className="w-3.5 h-3.5 text-brand-400" />
              <span>打开完整相框与微调工作台 (E) ↗</span>
            </button>

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-1.5 px-2.5 rounded-xl bg-dark-800 hover:bg-dark-750 border border-dark-700 text-slate-300 hover:text-white font-medium text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Upload className="w-3 h-3 text-indigo-400" />
                <span>导入 .cube 文件</span>
              </button>
            </div>
          </div>

          {/* 快捷键提示条 */}
          <div className="text-[9.5px] text-slate-500 flex items-center justify-between pt-1 border-t border-dark-800">
            <span>按 L 键开关</span>
            <span>按住 \ 对比原片</span>
            <span>按 B 键黑白</span>
          </div>
        </div>
      )}
    </div>
  );
};
