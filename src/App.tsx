import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { photoMatchesFilter, useAlbumStore } from './store/albumStore';
import { useSelectionStore } from './store/selectionStore';
import { usePreviewStore } from './store/previewStore';
import { useCompareStore } from './store/compareStore';
import { useExportStore } from './store/exportStore';
import { useInsightStore } from './store/insightStore';
import {
  fetchEngineInfo,
  fetchStartupHealth,
  isTauri,
  listRecentProjects,
  RecentProject,
  selectFolder,
} from './services/tauriBridge';
import { Filmstrip } from './components/filmstrip/Filmstrip';
import { TriageControls } from './components/triage/TriageControls';
import { FilterToolbar } from './components/triage/FilterToolbar';
import { DefectBadge } from './components/triage/DefectBadge';
import { QuickTagBar } from './components/triage/QuickTagBar';
import { PhotoInfoHud } from './components/viewport/PhotoInfoHud';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import {
  FolderOpen,
  FolderOutput,
  Sparkles,
  Image as ImageIcon,
  Undo2,
  Eye,
  Info,
  Keyboard,
  AlertCircle,
  Loader2,
  X,
  History,
  Settings,
  Sun,
  Moon,
  Filter,
} from 'lucide-react';
import { useThemeStore } from './store/themeStore';
import { useAdjustStore } from './store/adjustStore';

const PixiCanvas = lazy(() =>
  import('./components/viewport/PixiCanvas').then((module) => ({ default: module.PixiCanvas })),
);
const FrameAndAdjustModal = lazy(() =>
  import('./components/adjust/FrameAndAdjustModal').then((module) => ({
    default: module.FrameAndAdjustModal,
  })),
);
const SplitCompareView = lazy(() =>
  import('./components/viewport/SplitCompareView').then((module) => ({
    default: module.SplitCompareView,
  })),
);
const BurstKnockoutView = lazy(() =>
  import('./components/viewport/BurstKnockoutView').then((module) => ({
    default: module.BurstKnockoutView,
  })),
);
import { RetouchPanel } from './components/triage/RetouchPanel';
import { TriageFeedbackOverlay } from './components/viewport/TriageFeedbackOverlay';
import { createPin } from './utils/annotationUtils';
const FaceLoupe = lazy(() =>
  import('./components/loupe/FaceLoupe').then((module) => ({ default: module.FaceLoupe })),
);
const ExportModal = lazy(() =>
  import('./components/export/ExportModal').then((module) => ({ default: module.ExportModal })),
);
const AboutModal = lazy(() =>
  import('./components/modal/AboutModal').then((module) => ({ default: module.AboutModal })),
);
const ShortcutsModal = lazy(() =>
  import('./components/modal/ShortcutsModal').then((module) => ({
    default: module.ShortcutsModal,
  })),
);
const ReviewCenterModal = lazy(() =>
  import('./components/modal/ReviewCenterModal').then((module) => ({
    default: module.ReviewCenterModal,
  })),
);
const TimelineQuotasModal = lazy(() =>
  import('./components/timeline/TimelineQuotasModal').then((module) => ({
    default: module.TimelineQuotasModal,
  })),
);
import { StorylineBar } from './components/timeline/StorylineBar';
const FamilyRadarModal = lazy(() =>
  import('./components/modal/FamilyRadarModal').then((module) => ({
    default: module.FamilyRadarModal,
  })),
);
const MergeSelectionsModal = lazy(() =>
  import('./components/modal/MergeSelectionsModal').then((module) => ({
    default: module.MergeSelectionsModal,
  })),
);
const AlbumPreviewModal = lazy(() =>
  import('./components/modal/AlbumPreviewModal').then((module) => ({
    default: module.AlbumPreviewModal,
  })),
);
const SettingsModal = lazy(() =>
  import('./components/modal/SettingsModal').then((module) => ({
    default: module.SettingsModal,
  })),
);

const LoadingPanel = () => (
  <div className="flex h-full w-full items-center justify-center bg-dark-950 text-xs text-slate-400">
    <Loader2 className="mr-2 h-4 w-4 animate-spin text-brand-400" />
    正在加载视图…
  </div>
);

export default function App() {
  const {
    folderPath,
    photos,
    currentIndex,
    isLoading,
    scanError,
    failedFolderPath,
    isScenesModalOpen,
    openFolder,
    retryOpenFolder,
    activeFilter,
    setActiveFilter,
    selectedSceneId,
    setSelectedSceneId,
    activeTagFilter,
    setActiveTagFilter,
    scenes,
  } = useAlbumStore();
  const {
    getStats,
    undoStack,
    isUndoing,
    undoLast,
    persistenceStatus,
    persistenceError,
    persistenceWarning,
    clearPersistenceError,
    clearPersistenceWarning,
    getAnnotation,
    setAnnotation,
    selections,
    viewedPhotoIds,
  } = useSelectionStore();
  const { currentPreviewUrl, previewStatus, previewError, retryCurrentPreview } = usePreviewStore();
  const { isCompareMode, isPkMode } = useCompareStore();
  const { isExportModalOpen, setExportModalOpen } = useExportStore();
  const { isSettingsOpen, setSettingsOpen, effectiveTheme, setThemeMode } = useThemeStore();
  const isAdjustModalOpen = useAdjustStore((state) => state.isModalOpen);
  const {
    isFaceLoupeOpen,
    isAnalyzing,
    analysisTotal,
    analysisCompleted,
    analysisFailed,
    insights,
  } = useInsightStore();

  const [engineVersion, setEngineVersion] = useState<string>('');
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);
  const [isReviewCenterOpen, setIsReviewCenterOpen] = useState<boolean>(false);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [startupWarning, setStartupWarning] = useState<string | null>(null);
  const [isRetouchOpen, setIsRetouchOpen] = useState<boolean>(false);
  const [isAddingPin, setIsAddingPin] = useState<boolean>(false);
  const [isFamilyRadarOpen, setIsFamilyRadarOpen] = useState<boolean>(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState<boolean>(false);
  const [isAlbumPreviewOpen, setIsAlbumPreviewOpen] = useState<boolean>(false);
  const [isDragHovering, setIsDragHovering] = useState<boolean>(false);

  useKeyboardShortcuts({
    onToggleRetouch: () => setIsRetouchOpen((prev) => !prev),
  });

  // macOS 访达 (Finder) 原生拖拽目录支持
  useEffect(() => {
    let unlistenTauri: (() => void) | undefined;

    if (isTauri()) {
      import('@tauri-apps/api/webview')
        .then(({ getCurrentWebview }) => {
          return getCurrentWebview().onDragDropEvent((event) => {
            if (event.payload.type === 'enter' || event.payload.type === 'over') {
              setIsDragHovering(true);
            } else if (event.payload.type === 'leave') {
              setIsDragHovering(false);
            } else if (event.payload.type === 'drop') {
              setIsDragHovering(false);
              const paths = event.payload.paths;
              if (paths && paths.length > 0) {
                let targetPath = paths[0];
                const isImageFile = /\.(arw|cr2|cr3|nef|dng|raw|jpg|jpeg|png|webp|heic|tiff?)$/i.test(targetPath);
                if (isImageFile) {
                  const lastSlash = targetPath.lastIndexOf('/');
                  if (lastSlash > 0) {
                    targetPath = targetPath.substring(0, lastSlash);
                  }
                }
                void openFolder(targetPath);
                listRecentProjects().then(setRecentProjects).catch(() => undefined);
              }
            }
          });
        })
        .then((fn) => {
          unlistenTauri = fn;
        })
        .catch(() => undefined);
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragHovering(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.relatedTarget === null) {
        setIsDragHovering(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragHovering(false);
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      if (unlistenTauri) unlistenTauri();
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [openFolder]);

  useEffect(() => {
    fetchEngineInfo()
      .then((info) => setEngineVersion(info.libraw_version))
      .catch(() => setEngineVersion('Web Mock'));
    listRecentProjects().then(setRecentProjects).catch(() => setRecentProjects([]));
    fetchStartupHealth()
      .then((health) => {
        if (health.database_error) {
          setStartupWarning(`项目数据库检查失败：${health.database_error}`);
        } else if (health.export_recovery_error) {
          setStartupWarning(`未完成导出任务恢复失败：${health.export_recovery_error}`);
        } else if (health.database_recovered) {
          setStartupWarning('检测到项目数据库损坏，已从安全备份恢复。请核对最近的选片结果。');
        } else if (health.recovered_export_jobs > 0) {
          setStartupWarning(
            `检测到 ${health.recovered_export_jobs} 个异常中断的导出任务，已安全清理 ${health.cleaned_export_temp_files} 个临时文件。`,
          );
        } else if (health.previous_session_unclean) {
          setStartupWarning('检测到上次未正常退出，项目数据库已完成完整性检查。');
        }
      })
      .catch((error) => setStartupWarning(`启动安全检查失败：${String(error)}`));
  }, []);

  const handleSelectFolder = async () => {
    const selected = await selectFolder();
    if (selected) {
      await openFolder(selected);
      listRecentProjects().then(setRecentProjects).catch(() => undefined);
    }
  };

  const handleContinueProject = async (project: RecentProject) => {
    if (project.source_available) {
      await openFolder(project.source_root);
    } else {
      const relocatedFolder = await selectFolder();
      if (!relocatedFolder) return;
      await openFolder(relocatedFolder, project.project_id);
    }
    listRecentProjects().then(setRecentProjects).catch(() => undefined);
  };

  const currentPhoto = photos[currentIndex];
  const stats = getStats(photos.length);

  // 计算当前活动筛选条件下的匹配照片索引列表（仅在 unreviewed 筛选下关联 currentIndex，其余模式下翻页 0 数组计算消耗）
  const filterCurrentIndex = activeFilter === 'unreviewed' ? currentIndex : undefined;
  const matchingIndexes = useMemo(() => {
    return photos.flatMap((photo, index) =>
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
        filterCurrentIndex,
      )
        ? [index]
        : [],
    );
  }, [
    photos,
    activeFilter,
    selectedSceneId,
    scenes,
    selections,
    viewedPhotoIds,
    insights,
    activeTagFilter,
    filterCurrentIndex,
  ]);

  const albumName = folderPath ? folderPath.split('/').filter(Boolean).pop() || folderPath : '';

  const formatRecentTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '最近使用';
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-dark-900 text-slate-100 select-none overflow-hidden font-sans">
      {/* 顶部工具与状态栏 */}
      <header className="h-12 border-b border-dark-700 bg-dark-800/95 backdrop-blur flex items-center justify-between px-3 md:px-4 z-30 shrink-0 gap-2 select-none overflow-x-auto no-scrollbar">
        {/* 左侧：Logo 与相册名称 */}
        <div className="flex items-center space-x-2 md:space-x-3 shrink-0 min-w-0">
          <div className="flex items-center space-x-2 font-semibold tracking-wide shrink-0">
            <img src="/icon.png" alt="QuickPick Logo" className="w-6 h-6 rounded-md shadow-sm object-cover shrink-0" />
            <span className="text-sm md:text-base font-bold bg-gradient-to-r from-blue-400 via-indigo-300 to-sky-400 bg-clip-text text-transparent whitespace-nowrap">
              QuickPick 极选
            </span>
          </div>

          <div className="h-4 w-[1px] bg-dark-600 shrink-0" />

          {folderPath ? (
            <div className="flex items-center space-x-1.5 text-xs text-slate-300 min-w-0">
              <span className="text-slate-500 font-medium whitespace-nowrap hidden sm:inline">相册:</span>
              <span
                className="font-semibold bg-dark-700/80 px-2 py-0.5 rounded text-slate-100 max-w-[100px] xl:max-w-[180px] truncate whitespace-nowrap"
                title={folderPath}
              >
                {albumName}
              </span>
            </div>
          ) : (
            <span className="text-xs text-slate-500 whitespace-nowrap">未打开照片文件夹</span>
          )}
        </div>

        {/* 中间：相册总进度 */}
        {photos.length > 0 && (
          <div className="flex items-center space-x-1.5 md:space-x-2 text-xs shrink-0 whitespace-nowrap">
            <div
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-dark-750 border border-dark-700 text-slate-300 font-mono whitespace-nowrap shrink-0"
              title={`相册总进度：已查看 ${stats.viewedCount} / 共 ${photos.length} 张照片`}
            >
              <Eye className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-slate-400">已浏览</span>
              <span className="font-bold text-slate-100">{stats.viewedCount}</span>
              <span className="text-slate-500">/</span>
              <span>{photos.length}</span>
            </div>
          </div>
        )}

        {/* 右侧：操作区 (撤销 / 导出 / 打开文件夹 / 关于) */}
        <div className="flex items-center space-x-1.5 md:space-x-2 shrink-0 whitespace-nowrap">
          {startupWarning && (
            <div
              className="flex max-w-[260px] lg:max-w-[360px] items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-500/15 px-2 py-1 text-xs text-amber-900 dark:text-amber-200 shrink-0 whitespace-nowrap"
              role="alert"
              title={startupWarning}
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="truncate">{startupWarning}</span>
              <button
                onClick={() => setStartupWarning(null)}
                className="rounded p-0.5 hover:bg-amber-500/20 shrink-0 cursor-pointer"
                title="关闭启动安全提示"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {persistenceStatus === 'saving' && (
            <div className="flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-300 shrink-0 whitespace-nowrap" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-blue-600 dark:text-blue-400" />
              <span className="hidden sm:inline">正在保存选择</span>
            </div>
          )}

          {isAnalyzing && analysisTotal > 0 && (
            <div
              className="flex items-center gap-1.5 rounded-lg border border-indigo-400/50 bg-indigo-500/10 px-2 py-1 text-xs text-indigo-900 dark:text-indigo-200 shrink-0 whitespace-nowrap"
              role="status"
              title={`后台分析 ${analysisCompleted}/${analysisTotal}${analysisFailed ? `，失败 ${analysisFailed}` : ''}`}
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span>检查 {analysisCompleted}/{analysisTotal}</span>
            </div>
          )}

          {persistenceStatus === 'error' && (
            <div
              className="flex max-w-[260px] lg:max-w-[320px] items-center gap-1.5 rounded-lg border border-rose-400/50 bg-rose-500/15 px-2 py-1 text-xs text-rose-900 dark:text-rose-200 shrink-0 whitespace-nowrap"
              role="alert"
              title={persistenceError || undefined}
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
              <span className="truncate">{persistenceError || '选片结果保存失败'}</span>
              <button
                onClick={clearPersistenceError}
                className="rounded p-0.5 hover:bg-rose-500/20 shrink-0 cursor-pointer"
                title="关闭错误提示"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {persistenceStatus !== 'error' && persistenceWarning && (
            <div
              className="flex max-w-[260px] lg:max-w-[320px] items-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-500/15 px-2 py-1 text-xs text-amber-900 dark:text-amber-200 shrink-0 whitespace-nowrap"
              role="status"
              title={persistenceWarning}
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="truncate">{persistenceWarning}</span>
              <button
                onClick={clearPersistenceWarning}
                className="rounded p-0.5 hover:bg-amber-500/20 shrink-0 cursor-pointer"
                title="关闭提示"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {photos.length > 0 && (
            <button
              onClick={undoLast}
              disabled={undoStack.length === 0 || isUndoing}
              className="flex items-center gap-1 rounded-lg border border-dark-600 bg-dark-700/60 px-2 py-1.5 text-xs text-slate-300 transition-colors hover:bg-dark-600 disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer shrink-0 whitespace-nowrap"
              title={undoStack.length > 0 ? `${undoStack[undoStack.length - 1].label} (Cmd/Ctrl+Z)` : '没有可撤销的操作'}
            >
              <Undo2 className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden lg:inline">撤销</span>
            </button>
          )}

          {photos.length > 0 && (
            <button
              onClick={() => setExportModalOpen(true)}
              className="flex items-center space-x-1.5 px-2.5 lg:px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-md hover:shadow-emerald-500/20 transition-all cursor-pointer shrink-0 whitespace-nowrap"
              title="批量导出入选原片或文件名清单"
            >
              <FolderOutput className="w-3.5 h-3.5 shrink-0" />
              <span>导出<span className="hidden sm:inline">所选照片</span></span>
              {stats.selectedCount > 0 && (
                <span className="bg-emerald-800/90 text-emerald-200 px-1.5 py-0.2 rounded-full font-mono text-[10px]">
                  {stats.selectedCount}
                </span>
              )}
            </button>
          )}

          <button
            onClick={handleSelectFolder}
            className={clsx(
              'flex items-center space-x-1.5 py-1.5 text-xs font-medium rounded-lg shadow-sm transition-all cursor-pointer shrink-0 whitespace-nowrap',
              photos.length > 0
                ? 'px-2.5 lg:px-3 bg-dark-750 hover:bg-dark-700 text-slate-200 border border-dark-650/80'
                : 'px-3.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold shadow-brand-500/20',
            )}
            title="选择并打开照片文件夹"
          >
            <FolderOpen className="w-3.5 h-3.5 shrink-0" />
            <span>打开<span className="hidden sm:inline">照片目录</span></span>
          </button>

          {/* 一键深浅色模式切换 */}
          <button
            onClick={() => setThemeMode(effectiveTheme === 'dark' ? 'light' : 'dark')}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-dark-700 hover:text-slate-200 cursor-pointer shrink-0"
            title={effectiveTheme === 'dark' ? '切换为明亮浅色模式' : '切换为暗调专业模式'}
            aria-label="切换深浅外观主题"
          >
            {effectiveTheme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber-400 hover:text-amber-300 transition-transform hover:scale-110" />
            ) : (
              <Moon className="h-4 w-4 text-indigo-500 hover:text-indigo-600 transition-transform hover:scale-110" />
            )}
          </button>

          <button
            onClick={() => setIsShortcutsOpen(true)}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-dark-700 hover:text-slate-200 cursor-pointer shrink-0"
            title="查看快捷键帮助"
            aria-label="查看快捷键帮助"
          >
            <Keyboard className="h-4 w-4" />
          </button>

          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-dark-700 hover:text-slate-200 cursor-pointer shrink-0"
            title="偏好设置与外观主题"
            aria-label="偏好设置与外观主题"
          >
            <Settings className="h-4 w-4" />
          </button>

          <button
            onClick={() => setIsAboutOpen(true)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-700 transition-colors cursor-pointer shrink-0"
            title="关于 QuickPick 与安全选片说明"
          >
            <Info className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* 故事线常驻胶囊进度条 */}
      {photos.length > 0 && (
        <StorylineBar
          onOpenFamilyRadar={() => setIsFamilyRadarOpen(true)}
          onOpenMerge={() => setIsMergeModalOpen(true)}
          onOpenAlbumPreview={() => setIsAlbumPreviewOpen(true)}
        />
      )}

      {/* 视图过滤条 */}
      {photos.length > 0 && (
        <FilterToolbar onOpenReviewCenter={() => setIsReviewCenterOpen(true)} />
      )}

      {/* macOS 访达拖拽打开目录全屏毛玻璃指引遮罩 */}
      {isDragHovering && (
        <div className="fixed inset-0 z-60 flex flex-col items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-150 pointer-events-none border-4 border-dashed border-brand-500/80 m-3 rounded-3xl">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-500/20 text-brand-400 border border-brand-500/40 shadow-2xl mb-4 animate-bounce">
            <FolderOpen className="h-10 w-10" />
          </div>
          <h2 className="text-xl font-bold text-white drop-shadow-md tracking-wide">
            松开即可载入照片目录
          </h2>
          <p className="text-xs text-slate-300 mt-1.5 font-sans">
            支持拖入整个 RAW / JPG 文件夹或任意照片，全程只读安全
          </p>
        </div>
      )}

      {/* 正在扫描目录时的加载动效 */}
      {isLoading && (
        <div className="absolute inset-0 bg-dark-900/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-full border-3 border-brand-500 border-t-transparent animate-spin mb-4 shadow-lg shadow-brand-500/20" />
          <h3 className="text-sm font-semibold text-slate-100 mb-1">
            正在读取照片列表...
          </h3>
          <p className="text-xs text-slate-400 font-mono">
            列表就绪后即可选片，照片检查将在后台继续
          </p>
        </div>
      )}

      {/* 主工作区 */}
      <main className="flex-1 relative flex items-center justify-center bg-dark-900 overflow-hidden">
        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 md:p-10 text-center max-w-lg border border-dashed border-dark-700/90 rounded-2xl bg-dark-850/60 shadow-2xl backdrop-blur-sm">
            <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/15 dark:ring-white/15 ring-black/5 mb-5">
              <img src="/icon.png" alt="QuickPick App Icon" className="w-full h-full object-cover" />
            </div>
            <h2 className="text-xl font-bold text-slate-100 mb-2 tracking-wide">
              本地安心选片，快速挑出满意照片
            </h2>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed max-w-md">
              直接打开摄影师交付的 RAW 或 JPG 文件夹。<br />
              原片全程保持只读，本地提示可能的闭眼、模糊与相似连拍，随时安全导出。
            </p>
            <button
              onClick={handleSelectFolder}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-500/25 transition-all flex items-center space-x-2 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            >
              <FolderOpen className="w-4 h-4" />
              <span>选择照片文件夹开始选片</span>
            </button>
            <div className="mt-4 w-full rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-left text-[11px] leading-relaxed text-slate-300">
              <span className="font-semibold text-emerald-800 dark:text-emerald-300">原片目录保持只读。</span>{' '}
              选择记录、查看进度和预览缓存保存在系统的 QuickPick 应用数据目录，不会在照片文件夹中创建项目文件、缓存或锁。
            </div>
            {scanError && failedFolderPath && (
              <div
                className="mt-4 w-full rounded-xl border border-rose-400/50 bg-rose-500/15 p-3 text-left"
                role="alert"
              >
                <div className="flex items-start gap-2 text-xs text-rose-950 dark:text-rose-200">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                  <span className="min-w-0 break-words">{scanError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void retryOpenFolder()}
                  className="mt-2 rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-900 dark:text-rose-100 hover:bg-rose-500/30 cursor-pointer"
                >
                  重试打开
                </button>
              </div>
            )}
            {recentProjects.length > 0 && (
              <div className="mt-6 w-full border-t border-dark-700/80 pt-4 text-left">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                  <History className="h-3.5 w-3.5" />
                  <span>继续最近项目</span>
                </div>
                <div className="space-y-1.5">
                  {recentProjects.slice(0, 3).map((project) => (
                    <button
                      key={project.project_id}
                      type="button"
                      disabled={isLoading}
                      onClick={() => void handleContinueProject(project)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg border border-dark-700 bg-dark-800/80 px-3 py-2 text-left transition-colors hover:border-blue-500/40 hover:bg-dark-700 disabled:cursor-not-allowed disabled:opacity-45"
                      title={
                        project.source_available
                          ? project.source_root
                          : `原文件夹不可用；点击选择移动后的同一文件夹：${project.source_root}`
                      }
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-slate-200">
                          {project.display_name}
                        </span>
                        <span className="block truncate text-[10px] text-slate-500">
                          {project.photo_count} 张 · 已查看 {project.viewed_count} · 已选 {project.selected_count}
                        </span>
                        <span className="block truncate text-[10px] text-slate-600">
                          {formatRecentTime(project.updated_at)} · {project.source_available ? '继续上次进度' : '点击重新定位'}
                        </span>
                      </span>
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-8 flex items-center space-x-4 text-[11px] text-slate-500">
              <span className="flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>本地闭眼与模糊辅助提示</span>
              </span>
              <span>•</span>
              <span className="flex items-center space-x-1">
                <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                <span>双图分屏对比挑优</span>
              </span>
            </div>
          </div>
        ) : isPkMode ? (
          <Suspense fallback={<LoadingPanel />}>
            <BurstKnockoutView />
          </Suspense>
        ) : isCompareMode ? (
          <Suspense fallback={<LoadingPanel />}>
            <SplitCompareView />
          </Suspense>
        ) : matchingIndexes.length === 0 ? (
          <div className="flex flex-1 h-full w-full flex-col items-center justify-center p-8 text-center select-none bg-dark-900">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-dark-800 border border-dark-700 mb-3 shadow-xl text-slate-400">
              <Filter className="h-6 w-6 text-slate-400" />
            </div>
            <h3 className="text-sm font-bold text-slate-100 mb-1">当前选项暂无匹配照片</h3>
            <p className="text-xs text-slate-400 max-w-sm mb-5 leading-relaxed">
              当前筛选或分类条件下未找到照片。您可以切换其它选项或返回全部照片继续选片。
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveFilter('all');
                setSelectedSceneId(null);
                setActiveTagFilter(null);
              }}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-brand-500/20 transition-all cursor-pointer"
            >
              查看全部照片 ({photos.length})
            </button>
          </div>
        ) : (
          <div className="flex h-full w-full min-w-0">
            <div className="relative min-w-0 flex-1">
              {/* Pixi.js 硬件加速照片视口 */}
              <Suspense fallback={<LoadingPanel />}>
                <PixiCanvas
                  imageUrl={currentPreviewUrl}
                  filename={currentPhoto ? currentPhoto.filename : ''}
                  previewStatus={previewStatus}
                  previewError={previewError}
                  onRetryPreview={retryCurrentPreview}
                  isAddingPin={isAddingPin}
                  pins={currentPhoto ? getAnnotation(currentPhoto.id).pins : []}
                  onDropPin={(x, y) => {
                    if (currentPhoto) {
                      const currentAnn = getAnnotation(currentPhoto.id);
                      const nextPins = currentAnn.pins || [];
                      const newPin = createPin(x, y, nextPins.length + 1);
                      setAnnotation(currentPhoto.id, {
                        ...currentAnn,
                        pins: [...nextPins, newPin],
                      });
                      setIsAddingPin(false);
                      setIsRetouchOpen(true);
                    }
                  }}
                />
              </Suspense>

              {/* 画布中央瞬态操作微反馈 */}
              <TriageFeedbackOverlay currentPhotoId={currentPhoto?.id} />

              {/* 视口左上方：极简 HUD 与可选展开高级信息 */}
              <div className="absolute top-4 left-4 z-20">
                <PhotoInfoHud />
              </div>

              {/* 视口上方：本地辅助提示药丸 */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
                <DefectBadge />
              </div>

              {/* 视口下方：多脸联动特写窗格 (Face Loupe) */}
              {isFaceLoupeOpen && (
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 flex justify-center w-full px-4 pointer-events-none [&>*]:pointer-events-auto">
                  <Suspense fallback={null}>
                    <FaceLoupe />
                  </Suspense>
                </div>
              )}

              {/* 视口下方：快捷打标签与核心选片操作条 */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 pointer-events-none [&>*]:pointer-events-auto">
                <QuickTagBar />
                <TriageControls
                  onToggleRetouch={() => setIsRetouchOpen((v) => !v)}
                  isRetouchOpen={isRetouchOpen}
                />
              </div>
            </div>

            {/* 独立右侧栏：占用布局空间，不覆盖照片 */}
            <RetouchPanel
              isOpen={isRetouchOpen}
              onClose={() => {
                setIsRetouchOpen(false);
                setIsAddingPin(false);
              }}
              isAddingPin={isAddingPin}
              setIsAddingPin={setIsAddingPin}
            />
          </div>
        )}
      </main>

      {/* 底部缩略图轮播栏 (支持 macOS Dock 鱼眼悬停放大) */}
      {photos.length > 0 && (
        <footer className="h-24 border-t border-dark-700 bg-dark-800/95 flex items-center shrink-0 z-20">
          <Filmstrip />
        </footer>
      )}

      {/* 相机参数相框与选片快速调色工作台 */}
      {isAdjustModalOpen && (
        <Suspense fallback={null}>
          <FrameAndAdjustModal />
        </Suspense>
      )}

      {/* 选片结果导出弹窗 */}
      {isExportModalOpen && (
        <Suspense fallback={null}>
          <ExportModal />
        </Suspense>
      )}

      {/* 关于与安全说明弹窗 */}
      {isAboutOpen && (
        <Suspense fallback={null}>
          <AboutModal
            isOpen={isAboutOpen}
            onClose={() => setIsAboutOpen(false)}
            librawVersion={engineVersion}
          />
        </Suspense>
      )}

      {/* 快捷键帮助弹窗 */}
      {isShortcutsOpen && (
        <Suspense fallback={null}>
          <ShortcutsModal onClose={() => setIsShortcutsOpen(false)} />
        </Suspense>
      )}

      {/* 集中复核未查看、待考虑、相似连拍与辅助提示 */}
      {isReviewCenterOpen && (
        <Suspense fallback={null}>
          <ReviewCenterModal onClose={() => setIsReviewCenterOpen(false)} />
        </Suspense>
      )}

      {/* 拍摄场景与选片目标弹窗 */}
      {isScenesModalOpen && (
        <Suspense fallback={null}>
          <TimelineQuotasModal />
        </Suspense>
      )}

      {/* 至亲人物出场记分板弹窗 */}
      {isFamilyRadarOpen && (
        <Suspense fallback={null}>
          <FamilyRadarModal
            isOpen={isFamilyRadarOpen}
            onClose={() => setIsFamilyRadarOpen(false)}
          />
        </Suspense>
      )}

      {/* 离线双人选片协同工程弹窗 */}
      {isMergeModalOpen && (
        <Suspense fallback={null}>
          <MergeSelectionsModal
            isOpen={isMergeModalOpen}
            onClose={() => setIsMergeModalOpen(false)}
          />
        </Suspense>
      )}

      {/* 虚拟画册跨页排版模拟弹窗 */}
      {isAlbumPreviewOpen && (
        <Suspense fallback={null}>
          <AlbumPreviewModal
            isOpen={isAlbumPreviewOpen}
            onClose={() => setIsAlbumPreviewOpen(false)}
          />
        </Suspense>
      )}

      {/* 偏好设置与外观主题弹窗 */}
      {isSettingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setSettingsOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
