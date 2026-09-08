import React from 'react';
import {
  usePhotoStore,
  FilterCategory,
  WorkflowScene,
  isPhotoMatchingFilter,
  getPhotoUncertainty,
} from '../../store/photoStore';
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
  Scale,
  Mic2,
  Briefcase,
  Heart,
  ChevronDown,
  SlidersHorizontal,
} from 'lucide-react';

const sceneOptions: {
  id: WorkflowScene;
  label: string;
  shortLabel: string;
  icon: React.FC<any>;
  desc: string;
  activeClass: string;
}[] = [
  {
    id: 'general',
    label: '通用人像 / 旅拍客照',
    shortLabel: '通用人像',
    icon: Camera,
    desc: '标准人像合焦、曝光与面部睁闭眼综合评估',
    activeClass: 'bg-dark-700 text-slate-100 border-slate-600',
  },
  {
    id: 'concert',
    label: '演唱会 / 舞台演出 / 音乐节',
    shortLabel: '演唱会/舞台',
    icon: Mic2,
    desc: '深情闭眼直接放行免杀，重点排查舞台爆闪死白与麦克风遮挡',
    activeClass: 'bg-purple-600/20 text-purple-300 border-purple-500/50 shadow-purple-500/10 shadow-sm',
  },
  {
    id: 'cosplay',
    label: '二次元 / 漫展 / Cosplay',
    shortLabel: '二次元Cos',
    icon: Sparkles,
    desc: '假毛睫毛与美瞳合焦超严苛质检，连拍动作张力峰值选优',
    activeClass: 'bg-pink-600/20 text-pink-300 border-pink-500/50 shadow-pink-500/10 shadow-sm',
  },
  {
    id: 'conference',
    label: '商业活动 / 公关会议 / 图片直播',
    shortLabel: '商业会议',
    icon: Briefcase,
    desc: '大合影全员睁眼严格一票否决，主讲人发言表情强过滤',
    activeClass: 'bg-blue-600/20 text-blue-300 border-blue-500/50 shadow-blue-500/10 shadow-sm',
  },
  {
    id: 'wedding',
    label: '婚礼纪实 / 情感抓拍',
    shortLabel: '婚礼纪实',
    icon: Heart,
    desc: '真情流露大哭大笑表情宽容，大合影连拍换脸拯救',
    activeClass: 'bg-rose-600/20 text-rose-300 border-rose-500/50 shadow-rose-500/10 shadow-sm',
  },
];

export const FilterToolbar: React.FC = () => {
  const {
    photos,
    activeFilter,
    setActiveFilter,
    selectedCamera,
    setSelectedCamera,
    selectedLens,
    setSelectedLens,
    reviewOnlyUnadjudicated,
    setReviewOnlyUnadjudicated,
    activeWorkflowScene,
    setWorkflowScene,
    chapters,
    selectedChapterId,
    setSelectedChapter,
    setChaptersModalOpen,
    batchPickClean,
    batchRejectFatal,
    applyAiSuggestions,
  } = usePhotoStore();

  const [showSceneDropdown, setShowSceneDropdown] = React.useState(false);
  const sceneDropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (sceneDropdownRef.current && !sceneDropdownRef.current.contains(e.target as Node)) {
        setShowSceneDropdown(false);
      }
    };
    if (showSceneDropdown) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [showSceneDropdown]);

  if (photos.length === 0) return null;

  const currentScene = sceneOptions.find((s) => s.id === activeWorkflowScene) || sceneOptions[0];
  const CurrentSceneIcon = currentScene.icon;

  const countAll = photos.length;
  const countPending = photos.filter((p) => p.retouch_status === 'pending').length;
  const countFailed = photos.filter((p) => p.retouch_status === 'failed').length;
  const countClean = photos.filter((p) => p.retouch_status === 'clean').length;
  const countFixable = photos.filter((p) => p.retouch_status === 'fixable').length;
  const countFatal = photos.filter((p) => p.retouch_status === 'fatal').length;
  const countPicked = photos.filter((p) => p.pick_status === 'Pick').length;
  const countReview = photos.filter(
    (p) =>
      getPhotoUncertainty(p, activeWorkflowScene).isUncertain &&
      (!reviewOnlyUnadjudicated || p.pick_status === 'None'),
  ).length;

  const cleanEligible = photos.filter(
    (p) => p.retouch_status === 'clean' && !getPhotoUncertainty(p, activeWorkflowScene).isUncertain,
  ).length;
  const cleanProtected = countClean - cleanEligible;

  const fatalEligible = photos.filter(
    (p) => p.retouch_status === 'fatal' && !getPhotoUncertainty(p, activeWorkflowScene).isUncertain,
  ).length;
  const fatalProtected = countFatal - fatalEligible;

  const isFiltered =
    activeFilter !== 'all' ||
    selectedCamera !== null ||
    selectedLens !== null ||
    selectedChapterId !== null;
  const matchingCount = React.useMemo(() => {
    if (!isFiltered) return countAll;
    return photos.filter((p, i) =>
      isPhotoMatchingFilter(
        p,
        activeFilter,
        selectedCamera,
        selectedLens,
        reviewOnlyUnadjudicated,
        activeWorkflowScene,
        selectedChapterId,
        chapters,
        i,
      ),
    ).length;
  }, [
    photos,
    isFiltered,
    activeFilter,
    selectedCamera,
    selectedLens,
    reviewOnlyUnadjudicated,
    activeWorkflowScene,
    selectedChapterId,
    chapters,
    countAll,
  ]);

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
      id: 'review',
      label: '待定复核',
      count: countReview,
      icon: Scale,
      activeClass: 'bg-indigo-600/20 text-indigo-300 border-indigo-500/50 shadow-indigo-500/10 shadow-sm',
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
      {/* 左侧：工作流场景预设、视图分类 Filter Tabs 与 相机/镜头筛选器 */}
      <div className="flex items-center space-x-2 overflow-x-auto min-w-0 pr-2">
        {/* 场景工作流预设下拉选择器 */}
        <div className="relative shrink-0" ref={sceneDropdownRef}>
          <button
            onClick={() => setShowSceneDropdown(!showSceneDropdown)}
            className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-all ${currentScene.activeClass}`}
            title={`当前摄影场景模式：${currentScene.label}\n${currentScene.desc}\n(点击切换并定制 AI 评判标准)`}
          >
            <CurrentSceneIcon className="w-3.5 h-3.5 shrink-0" />
            <span className="font-semibold">{currentScene.shortLabel}</span>
            <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
          </button>

          {showSceneDropdown && (
            <div className="absolute top-9 left-0 z-50 bg-dark-800 border border-dark-700 rounded-xl shadow-2xl p-1.5 w-72 flex flex-col space-y-1 text-xs animate-in fade-in zoom-in-95">
              <div className="px-2 py-1 text-[10px] text-slate-400 border-b border-dark-700/80 font-mono">
                选择拍摄题材（实时适配 AI 判定规则）
              </div>
              {sceneOptions.map((opt) => {
                const OptIcon = opt.icon;
                const isCurrent = activeWorkflowScene === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setWorkflowScene(opt.id);
                      setShowSceneDropdown(false);
                    }}
                    className={`flex flex-col items-start px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                      isCurrent
                        ? 'bg-brand-600/30 text-brand-200 border border-brand-500/30'
                        : 'hover:bg-dark-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5 font-medium">
                      <OptIcon className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                      <span>{opt.label}</span>
                      {isCurrent && <span className="text-[10px] text-brand-300 ml-auto font-mono">生效中</span>}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="w-[1px] h-3.5 bg-dark-700 shrink-0" />

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

        {/* 待定复核模式下的仅看未裁决切换 */}
        {activeFilter === 'review' && (
          <button
            onClick={() => setReviewOnlyUnadjudicated(!reviewOnlyUnadjudicated)}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded border text-[11px] font-mono transition-colors shrink-0 ${
              reviewOnlyUnadjudicated
                ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200'
                : 'bg-dark-800 border-dark-700 text-slate-400 hover:text-slate-200'
            }`}
            title="点击切换：仅显示尚未标记(Pick/Reject)的待复核照片"
          >
            <span>{reviewOnlyUnadjudicated ? '仅看未裁决' : '全部待复核'}</span>
          </button>
        )}

        {/* 流程分章快捷过滤与看板 */}
        {chapters.length > 0 && (
          <div className="flex items-center space-x-1.5 border-l border-dark-700/80 pl-2 shrink-0">
            <div className="flex items-center space-x-1 bg-dark-800 border border-dark-700 rounded px-1.5 py-0.5">
              <Layers className="w-3 h-3 text-brand-400 shrink-0" />
              <select
                value={selectedChapterId || ''}
                onChange={(e) => setSelectedChapter(e.target.value ? e.target.value : null)}
                className="bg-transparent text-slate-200 text-[11px] outline-none cursor-pointer max-w-[150px] truncate"
                title="按拍摄流程环节过滤视图"
              >
                <option value="" className="bg-dark-850 text-slate-200">全部环节 ({chapters.length})</option>
                {chapters.map((c, idx) => {
                  const picked = photos.slice(c.startIndex, c.endIndex + 1).filter((p) => p.pick_status === 'Pick').length;
                  const warning = picked === 0 && c.photoCount > 0 ? ' ⚠️' : '';
                  return (
                    <option key={c.id} value={c.id} className="bg-dark-850 text-slate-200">
                      {String(idx + 1).padStart(2, '0')}. {c.name} ({picked}/{c.targetQuota}{warning})
                    </option>
                  );
                })}
              </select>
            </div>

            {selectedChapterId && (
              <button
                onClick={() => setSelectedChapter(null)}
                className="flex items-center space-x-0.5 px-1.5 py-0.5 rounded bg-brand-500/15 hover:bg-brand-500/25 text-brand-300 text-[10px] transition-colors"
                title="取消环节过滤"
              >
                <X className="w-3 h-3" />
                <span>所有环节</span>
              </button>
            )}

            <button
              onClick={() => setChaptersModalOpen(true)}
              className="p-1 hover:bg-dark-750 text-slate-400 hover:text-brand-300 rounded transition-colors"
              title="打开流程分章与交付配额看板"
            >
              <SlidersHorizontal className="w-3 h-3" />
            </button>
          </div>
        )}

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
            `将 ${cleanEligible} 张“未见明显问题”的照片标记为采纳，并为未评级照片设置 5 星${cleanProtected > 0 ? `（已安全豁免 ${cleanProtected} 张争议/待复核照片）` : ''}。是否继续？`,
            batchPickClean,
          )}
          title={`批量采纳已完成分析且未发现明显问题的照片${cleanProtected > 0 ? ` (自动豁免 ${cleanProtected} 张争议待复核照片)` : ''}`}
          className="flex items-center space-x-1 px-2.5 py-1 rounded bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-700/50 text-[11px] transition-colors"
        >
          <Sparkles className="w-3 h-3 text-emerald-400" />
          <span>采纳低风险片</span>
        </button>

        <button
          onClick={() => void confirmAndRun(
            `将 ${fatalEligible} 张“不可修硬伤”照片标记为排除${fatalProtected > 0 ? `（已安全豁免 ${fatalProtected} 张争议/待复核照片）` : ''}。待分析照片不会受影响。是否继续？`,
            batchRejectFatal,
          )}
          title={`将所有检测为'不可修硬伤'的照片批量标记为排除 (Reject)${fatalProtected > 0 ? ` (自动豁免 ${fatalProtected} 张争议待复核照片)` : ''}`}
          className="flex items-center space-x-1 px-2.5 py-1 rounded bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-700/50 text-[11px] transition-colors"
        >
          <AlertTriangle className="w-3 h-3 text-rose-400" />
          <span>排除所有硬伤</span>
        </button>

        <div className="w-[1px] h-3 bg-dark-700" />

        <button
          onClick={() => void confirmAndRun(
            `应用规则建议：采纳 ${cleanEligible} 张低风险片、排除 ${fatalEligible} 张硬伤片${(cleanProtected + fatalProtected) > 0 ? `（安全保护 ${cleanProtected + fatalProtected} 张争议片留待人工裁决）` : ''}；${countPending} 张待分析和 ${countFailed} 张分析失败照片保持不变。是否继续？`,
            applyAiSuggestions,
          )}
          title="一键应用 AI 筛选建议：采纳完美片，排除硬伤片，保留争议片与可修片待人工确认"
          className="flex items-center space-x-1 px-2.5 py-1 rounded bg-brand-600/30 hover:bg-brand-500/40 text-brand-300 border border-brand-500/40 text-[11px] font-medium transition-colors"
        >
          <Zap className="w-3 h-3 text-amber-300" />
          <span>应用 AI 规则建议</span>
        </button>
      </div>
    </div>
  );
};
