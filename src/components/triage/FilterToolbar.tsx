import React from 'react';
import { usePhotoStore, FilterCategory, isPhotoMatchingFilter } from '../../store/photoStore';
import { confirmAction, showAlert } from '../../services/tauriBridge';
import {
  Sparkles,
  Wand2,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Zap,
  CircleDashed,
  RefreshCw,
  Camera,
  Aperture,
  X,
} from 'lucide-react';

export const FilterToolbar: React.FC = () => {
  const {
    photos,
    activeFilter,
    setActiveFilter,
    selectedCamera,
    setSelectedCamera,
    selectedLens,
    setSelectedLens,
    batchPickClean,
    batchRejectFatal,
    applyAiSuggestions,
  } = usePhotoStore();

  if (photos.length === 0) return null;

  const countAll = photos.length;
  const countPending = photos.filter((p) => p.retouch_status === 'pending').length;
  const countFailed = photos.filter((p) => p.retouch_status === 'failed').length;
  const countClean = photos.filter((p) => p.retouch_status === 'clean').length;
  const countFixable = photos.filter((p) => p.retouch_status === 'fixable').length;
  const countFatal = photos.filter((p) => p.retouch_status === 'fatal').length;
  const countPicked = photos.filter((p) => p.pick_status === 'Pick').length;

  const isFiltered = activeFilter !== 'all' || selectedCamera !== null || selectedLens !== null;
  const matchingCount = React.useMemo(() => {
    if (!isFiltered) return countAll;
    return photos.filter((p) => isPhotoMatchingFilter(p, activeFilter, selectedCamera, selectedLens)).length;
  }, [photos, isFiltered, activeFilter, selectedCamera, selectedLens, countAll]);

  // 提取所有可用的相机型号与镜头型号选项
  const cameraOptions = React.useMemo(() => {
    const set = new Set<string>();
    photos.forEach((p) => {
      const cam = [p.exif?.camera_make, p.exif?.camera_model].filter(Boolean).join(' ') || p.exif?.camera_model;
      if (cam && cam.trim()) set.add(cam.trim());
    });
    return Array.from(set).sort();
  }, [photos]);

  const lensOptions = React.useMemo(() => {
    const set = new Set<string>();
    photos.forEach((p) => {
      const lens = p.exif?.lens_model || p.exif?.lens_make;
      if (lens && lens.trim()) set.add(lens.trim());
    });
    return Array.from(set).sort();
  }, [photos]);

  const confirmAndRun = async (
    message: string,
    action: () => Promise<void>,
  ) => {
    const confirmed = await confirmAction(message, '批量操作确认');
    if (!confirmed) return;
    try {
      await action();
    } catch (error) {
      await showAlert(String(error), '批量操作异常');
    }
  };

  const filterTabs: { id: FilterCategory; label: string; count: number; icon: React.FC<any>; activeClass: string }[] = [
    {
      id: 'all',
      label: '全部照片',
      count: countAll,
      icon: Layers,
      activeClass: 'bg-dark-700 text-slate-100 border-slate-500',
    },
    {
      id: 'pending',
      label: '待分析',
      count: countPending,
      icon: CircleDashed,
      activeClass: 'bg-slate-600/20 text-slate-300 border-slate-500/50',
    },
    {
      id: 'failed',
      label: '分析失败',
      count: countFailed,
      icon: RefreshCw,
      activeClass: 'bg-orange-600/20 text-orange-300 border-orange-500/50',
    },
    {
      id: 'clean',
      label: '未见明显问题',
      count: countClean,
      icon: Sparkles,
      activeClass: 'bg-emerald-600/20 text-emerald-400 border-emerald-500/50 shadow-emerald-500/10 shadow-sm',
    },
    {
      id: 'fixable',
      label: '可修解决',
      count: countFixable,
      icon: Wand2,
      activeClass: 'bg-amber-600/20 text-amber-300 border-amber-500/50 shadow-amber-500/10 shadow-sm',
    },
    {
      id: 'fatal',
      label: '不可修硬伤',
      count: countFatal,
      icon: AlertTriangle,
      activeClass: 'bg-rose-600/20 text-rose-300 border-rose-500/50 shadow-rose-500/10 shadow-sm',
    },
    {
      id: 'picked',
      label: '已采纳',
      count: countPicked,
      icon: CheckCircle2,
      activeClass: 'bg-blue-600/20 text-blue-400 border-blue-500/50 shadow-blue-500/10 shadow-sm',
    },
  ];

  return (
    <div className="h-10 border-b border-dark-700/80 bg-dark-850 flex items-center justify-between px-4 text-xs select-none">
      {/* 左侧：视图分类 Filter Tabs 与 相机/镜头筛选器 */}
      <div className="flex items-center space-x-2 overflow-x-auto min-w-0 pr-2">
        <span className="text-[11px] text-slate-500 font-mono mr-0.5 shrink-0">视图过滤:</span>
        <div className="flex items-center space-x-1.5 shrink-0">
          {filterTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeFilter === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`flex items-center space-x-1.5 px-2 py-1 rounded-md border text-xs font-medium transition-all ${
                  isActive
                    ? tab.activeClass
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-dark-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isActive ? 'bg-white/10' : 'bg-dark-750 text-slate-400'
                }`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* 相机机位 & 镜头快捷过滤 */}
        {(cameraOptions.length > 0 || lensOptions.length > 0) && (
          <div className="flex items-center space-x-1.5 border-l border-dark-700/80 pl-2 shrink-0">
            {cameraOptions.length > 0 && (
              <div className="flex items-center space-x-1 bg-dark-800 border border-dark-700 rounded px-1.5 py-0.5">
                <Camera className="w-3 h-3 text-slate-400 shrink-0" />
                <select
                  value={selectedCamera || ''}
                  onChange={(e) => setSelectedCamera(e.target.value ? e.target.value : null)}
                  className="bg-transparent text-slate-200 text-[11px] outline-none cursor-pointer max-w-[130px] truncate"
                  title="按机身筛选照片"
                >
                  <option value="" className="bg-dark-850 text-slate-200">全部机位</option>
                  {cameraOptions.map((cam) => {
                    const count = photos.filter((p) => {
                      const c = [p.exif?.camera_make, p.exif?.camera_model].filter(Boolean).join(' ') || p.exif?.camera_model;
                      return c === cam;
                    }).length;
                    return (
                      <option key={cam} value={cam} className="bg-dark-850 text-slate-200">
                        {cam} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {lensOptions.length > 0 && (
              <div className="flex items-center space-x-1 bg-dark-800 border border-dark-700 rounded px-1.5 py-0.5">
                <Aperture className="w-3 h-3 text-slate-400 shrink-0" />
                <select
                  value={selectedLens || ''}
                  onChange={(e) => setSelectedLens(e.target.value ? e.target.value : null)}
                  className="bg-transparent text-slate-200 text-[11px] outline-none cursor-pointer max-w-[150px] truncate"
                  title="按镜头型号筛选照片"
                >
                  <option value="" className="bg-dark-850 text-slate-200">全部镜头</option>
                  {lensOptions.map((lens) => {
                    const count = photos.filter((p) => (p.exif?.lens_model || p.exif?.lens_make) === lens).length;
                    return (
                      <option key={lens} value={lens} className="bg-dark-850 text-slate-200">
                        {lens} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {(selectedCamera || selectedLens) && (
              <button
                onClick={() => {
                  setSelectedCamera(null);
                  setSelectedLens(null);
                }}
                className="flex items-center space-x-0.5 px-1.5 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[10px] transition-colors"
                title="清除机身/镜头筛选"
              >
                <X className="w-3 h-3" />
                <span>清除筛选</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 摄影师批量智能操作区 */}
      <div className="flex items-center space-x-2 shrink-0">
        {isFiltered && (
          <div
            className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[11px] font-mono text-amber-300 mr-1 shadow-sm"
            title="当前筛选条件下匹配的照片数 / 总照片数"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>匹配: <strong className="text-amber-200 font-semibold">{matchingCount}</strong> / {countAll}</span>
          </div>
        )}

        <button
          onClick={() => void confirmAndRun(
            `将 ${countClean} 张“未见明显问题”的照片标记为采纳，并为未评级照片设置 5 星。是否继续？`,
            batchPickClean,
          )}
          title="批量采纳已完成分析且未发现明显问题的照片"
          className="flex items-center space-x-1 px-2.5 py-1 rounded bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-700/50 text-[11px] transition-colors"
        >
          <Sparkles className="w-3 h-3 text-emerald-400" />
          <span>采纳低风险片</span>
        </button>

        <button
          onClick={() => void confirmAndRun(
            `将 ${countFatal} 张“不可修硬伤”照片标记为排除。待分析照片不会受影响。是否继续？`,
            batchRejectFatal,
          )}
          title="将所有检测为'不可修硬伤'的照片批量标记为排除 (Reject)"
          className="flex items-center space-x-1 px-2.5 py-1 rounded bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-700/50 text-[11px] transition-colors"
        >
          <AlertTriangle className="w-3 h-3 text-rose-400" />
          <span>排除所有硬伤</span>
        </button>

        <div className="w-[1px] h-3 bg-dark-700" />

        <button
          onClick={() => void confirmAndRun(
            `应用规则建议：采纳 ${countClean} 张低风险片、排除 ${countFatal} 张硬伤片；${countPending} 张待分析和 ${countFailed} 张分析失败照片保持不变。是否继续？`,
            applyAiSuggestions,
          )}
          title="一键应用 AI 筛选建议：采纳完美片，排除硬伤片，保留可修片待人工确认"
          className="flex items-center space-x-1 px-2.5 py-1 rounded bg-brand-600/30 hover:bg-brand-500/40 text-brand-300 border border-brand-500/40 text-[11px] font-medium transition-colors"
        >
          <Zap className="w-3 h-3 text-amber-300" />
          <span>应用 AI 规则建议</span>
        </button>
      </div>
    </div>
  );
};
