import { useEffect } from 'react';
import { usePhotoStore } from './store/photoStore';
import { PixiCanvas } from './components/viewport/PixiCanvas';
import { SplitCompareView } from './components/viewport/SplitCompareView';
import { Filmstrip } from './components/filmstrip/Filmstrip';
import { TriageControls } from './components/triage/TriageControls';
import { FilterToolbar } from './components/triage/FilterToolbar';
import { DefectBadge } from './components/triage/DefectBadge';
import { FaceLoupe } from './components/loupe/FaceLoupe';
import { PhotoInfoHud } from './components/viewport/PhotoInfoHud';
import { ExportModal } from './components/export/ExportModal';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { selectFolder } from './services/tauriBridge';
import { FolderOpen, FolderOutput, Cpu, Sparkles, Image as ImageIcon, ArrowRightLeft, Users, Zap, Loader2, CheckCircle2, AlertCircle, X, RefreshCw, Copy, ShieldAlert, Undo2 } from 'lucide-react';

export default function App() {
  const {
    folderPath,
    photos,
    currentIndex,
    currentPreviewUrl,
    previewStatus,
    previewError,
    engineInfo,
    isLoading,
    isCompareMode,
    writeStatus,
    writeError,
    xmpConflict,
    undoStack,
    isUndoing,
    clearWriteError,
    dismissXmpConflict,
    resolveXmpConflict,
    undoLast,
    toggleCompareMode,
    isFaceLoupeOpen,
    toggleFaceLoupe,
    isProxyAccelerated,
    isGeneratingCache,
    generateCurrentFolderCache,
    initEngine,
    openFolder,
    retryCurrentPreview,
    setExportModalOpen,
  } = usePhotoStore();

  useKeyboardShortcuts();

  useEffect(() => {
    initEngine();
  }, [initEngine]);

  const handleSelectFolder = async () => {
    const selected = await selectFolder();
    if (selected) {
      await openFolder(selected);
    }
  };

  const currentPhoto = photos[currentIndex];

  return (
    <div className="flex flex-col h-screen w-screen bg-dark-900 text-slate-100 select-none overflow-hidden font-sans">
      {/* 顶部工具与状态栏 */}
      <header className="h-12 border-b border-dark-700 bg-dark-800/90 backdrop-blur flex items-center justify-between px-4 z-30 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2.5 font-semibold tracking-wide">
            <img src="/icon.png" alt="QuickPick Logo" className="w-6 h-6 rounded-md shadow-sm object-cover" />
            <span className="text-base font-bold bg-gradient-to-r from-blue-400 via-indigo-300 to-sky-400 bg-clip-text text-transparent">
              QuickPick 极选
            </span>
          </div>

          <div className="h-4 w-[1px] bg-dark-600" />

          {folderPath ? (
            <div className="flex items-center space-x-2 text-xs text-slate-300">
              <span className="text-slate-500 font-mono">目录:</span>
              <span className="font-mono bg-dark-700 px-2 py-0.5 rounded text-slate-200 max-w-[280px] truncate" title={folderPath}>
                {folderPath}
              </span>
              <span className="bg-brand-600/20 text-brand-400 border border-brand-500/30 px-2 py-0.5 rounded font-mono text-[11px]">
                {currentIndex + 1} / {photos.length}
              </span>
            </div>
          ) : (
            <span className="text-xs text-slate-500">未载入相册</span>
          )}
        </div>

        {/* 右侧操作按钮 */}
        <div className="flex items-center space-x-3">
          {engineInfo && (
            <div className="flex items-center space-x-1.5 text-xs px-2.5 py-1 rounded bg-dark-700/60 border border-dark-600 text-slate-300">
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-mono text-[11px]">LibRaw {engineInfo.libraw_version}</span>
            </div>
          )}

          {photos.length > 0 && (
            <button
              onClick={() => void undoLast()}
              disabled={undoStack.length === 0 || writeStatus === 'saving' || isUndoing}
              className="flex items-center gap-1.5 rounded border border-dark-600 bg-dark-700/60 px-2.5 py-1 text-[11px] text-slate-300 transition-colors hover:bg-dark-600 disabled:cursor-not-allowed disabled:opacity-35"
              title={undoStack.length > 0 ? `${undoStack[undoStack.length - 1].label} (Cmd/Ctrl+Z)` : '没有可撤销的操作'}
            >
              {isUndoing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
              <span>撤销</span>
            </button>
          )}

          {writeStatus === 'saving' && (
            <div className="flex items-center space-x-1.5 text-[11px] text-blue-300">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>正在安全写入 XMP</span>
            </div>
          )}
          {writeStatus === 'saved' && (
            <div className="flex items-center space-x-1.5 text-[11px] text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>已保存</span>
            </div>
          )}

          {/* NAS / 本地 2K 代理加速状态指示徽标 */}
          {isProxyAccelerated && (
            <div
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold animate-in fade-in duration-200"
              title="已激活 NAS / 本地 2K 代理缓存，单张仅约 150KB，零 RAW 传输 60fps 极速秒通"
            >
              <Zap className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" />
              <span>2K 加速</span>
            </div>
          )}

          {/* 预生成 2K 代理缓存按钮 */}
          {folderPath && photos.length > 0 && !isProxyAccelerated && (
            <button
              onClick={() => generateCurrentFolderCache()}
              disabled={isGeneratingCache}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-dark-750 hover:bg-dark-700 text-slate-300 border border-dark-600 transition-all cursor-pointer disabled:opacity-50"
              title="为当前相册一键预生成轻量 2K 代理缓存 (.quickpick_cache)"
            >
              {isGeneratingCache ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 text-brand-400 animate-spin" />
                  <span>生成缓存中...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>生成 2K 缓存</span>
                </>
              )}
            </button>
          )}

          {photos.length > 0 && currentPhoto && currentPhoto.faces && currentPhoto.faces.length > 0 && (
            <button
              onClick={toggleFaceLoupe}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                isFaceLoupeOpen
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                  : 'bg-dark-750 hover:bg-dark-700 text-slate-300 border-dark-600'
              }`}
              title="展开/收起多脸联动特写抽屉 [F]"
            >
              <Users className="w-3.5 h-3.5" />
              <span>特写 ({currentPhoto.faces.length})</span>
              {currentPhoto.faces.some((f) => f.eye_open_score < 0.35) && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              )}
            </button>
          )}

          {photos.length >= 2 && (
            <button
              onClick={() => toggleCompareMode()}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                isCompareMode
                  ? 'bg-brand-600 text-white border-brand-500 shadow-sm'
                  : 'bg-dark-750 hover:bg-dark-700 text-slate-300 border-dark-600'
              }`}
              title="进入/退出双图分屏比对 [C]"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>对比 (C)</span>
            </button>
          )}

          {photos.length > 0 && (
            <button
              onClick={() => setExportModalOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm hover:shadow-emerald-500/20 transition-all cursor-pointer"
              title="批量导出入选照片与 XMP 伴侣文件"
            >
              <FolderOutput className="w-3.5 h-3.5" />
              <span>导出选片</span>
              {photos.filter((p) => p.pick_status === 'Pick').length > 0 && (
                <span className="bg-emerald-800/90 text-emerald-200 px-1.5 py-0.2 rounded-full font-mono text-[10px]">
                  {photos.filter((p) => p.pick_status === 'Pick').length}
                </span>
              )}
            </button>
          )}

          <button
            onClick={handleSelectFolder}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium rounded-lg shadow-sm hover:shadow-brand-500/20 transition-all cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>打开照片目录</span>
          </button>
        </div>
      </header>

      {writeStatus === 'error' && writeError && !xmpConflict && (
        <div className="absolute top-14 right-4 z-50 max-w-md flex items-start space-x-2 rounded-lg border border-rose-500/40 bg-rose-950/95 px-3 py-2 text-xs text-rose-200 shadow-xl">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="whitespace-pre-line">{writeError}</span>
          <button onClick={clearWriteError} className="p-0.5 rounded hover:bg-rose-500/20" title="关闭错误提示">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {xmpConflict && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-amber-500/35 bg-dark-800 p-5 shadow-2xl shadow-black/50">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-amber-500/15 p-2.5 text-amber-300">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-slate-100">检测到 XMP 外部修改</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{xmpConflict.message}</p>
                <p className="mt-2 truncate rounded bg-dark-900/70 px-2 py-1.5 font-mono text-[11px] text-slate-300" title={xmpConflict.localPhoto.path}>
                  {xmpConflict.localPhoto.filename}
                </p>
              </div>
              <button
                onClick={dismissXmpConflict}
                disabled={writeStatus === 'saving'}
                className="rounded p-1 text-slate-500 hover:bg-dark-700 hover:text-slate-200 disabled:opacity-40"
                title="稍后处理"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-4 text-[11px] leading-relaxed text-amber-200/80">
              QuickPick 已阻止自动覆盖。请选择如何处理本次本地打标结果。
            </p>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                onClick={() => resolveXmpConflict('reload')}
                disabled={writeStatus === 'saving'}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-dark-600 bg-dark-700 px-3 py-2 text-xs text-slate-200 hover:bg-dark-600 disabled:opacity-50"
                title="放弃本次本地修改，读取磁盘上的最新 XMP"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                重新载入
              </button>
              <button
                onClick={() => resolveXmpConflict('copy')}
                disabled={writeStatus === 'saving'}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs text-blue-200 hover:bg-blue-500/20 disabled:opacity-50"
                title="保留磁盘 XMP，并把本地结果写入独立副本"
              >
                <Copy className="h-3.5 w-3.5" />
                另存副本
              </button>
              <button
                onClick={() => resolveXmpConflict('overwrite')}
                disabled={writeStatus === 'saving'}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
                title="明确使用 QuickPick 本地结果覆盖磁盘 XMP"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                保留本地并覆盖
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 视图过滤与智能批量操作条 */}
      {photos.length > 0 && <FilterToolbar />}

      {/* 正在扫描目录时的加载动效 */}
      {isLoading && (
        <div className="absolute inset-0 bg-dark-900/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-full border-3 border-brand-500 border-t-transparent animate-spin mb-4 shadow-lg shadow-brand-500/20" />
          <h3 className="text-sm font-semibold text-slate-100 mb-1">
            正在极速扫描与构建相册索引...
          </h3>
          <p className="text-xs text-slate-400 font-mono">
            读取 LibRaw 原生内嵌预览与 XMP 伴侣文件
          </p>
        </div>
      )}

      {/* 主工作区 */}
      <main className="flex-1 relative flex items-center justify-center bg-dark-900 overflow-hidden">
        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center max-w-lg border border-dashed border-dark-700/90 rounded-2xl bg-dark-800/30">
            <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/15 mb-5">
              <img src="/icon.png" alt="QuickPick App Icon" className="w-full h-full object-cover" />
            </div>
            <h2 className="text-xl font-bold text-slate-100 mb-2">
              开启 60fps 极速照片粗选
            </h2>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed max-w-md">
              选择包含 Sony ARW、Canon CR3、Nikon NEF 或 JPG 的拍摄文件夹。<br />
              结合 LibRaw 动态原生解码、环形预取、XMP 哨兵锁与“可修/不可修”智能规则打标。
            </p>
            <button
              onClick={handleSelectFolder}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-blue-500/20 transition-all flex items-center space-x-2 cursor-pointer"
            >
              <FolderOpen className="w-4 h-4" />
              <span>选择照片文件夹开始初选</span>
            </button>
            <div className="mt-8 flex items-center space-x-4 text-[11px] text-slate-500">
              <span className="flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>智能可修性诊断</span>
              </span>
              <span>•</span>
              <span className="flex items-center space-x-1">
                <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
                <span>Pixi.js WebGL 视口</span>
              </span>
            </div>
          </div>
        ) : isCompareMode ? (
          <SplitCompareView />
        ) : (
          <div className="w-full h-full relative">
            {/* Pixi.js 硬件加速照片视口 */}
            <PixiCanvas
              imageUrl={currentPreviewUrl}
              filename={currentPhoto ? currentPhoto.filename : ''}
              previewStatus={previewStatus}
              previewError={previewError}
              onRetryPreview={() => void retryCurrentPreview()}
            />

            {/* 视口左上方：相机机身、镜头与拍摄参数 HUD */}
            <div className="absolute top-4 left-4 z-20">
              <PhotoInfoHud />
            </div>

            {/* 视口上方：AI '可修/不可修' 智能诊断与换脸提示药丸 */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
              <DefectBadge />
            </div>

            {/* 视口下方：多脸联动特写窗格 (Face Loupe) */}
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 flex justify-center w-full px-4 pointer-events-none [&>*]:pointer-events-auto">
              <FaceLoupe />
            </div>

            {/* 视口下方：摄影师键盘/鼠标选片打标工具条 */}
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20">
              <TriageControls />
            </div>
          </div>
        )}
      </main>

      {/* 底部胶片缩略图轮播栏 */}
      {photos.length > 0 && (
        <footer className="h-20 border-t border-dark-700 bg-dark-800/95 flex items-center shrink-0 z-20">
          <Filmstrip />
        </footer>
      )}

      {/* 选片结果批量导出弹窗 */}
      <ExportModal />
    </div>
  );
}
