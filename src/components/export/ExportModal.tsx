import React, { useState, useEffect } from 'react';
import { usePhotoStore } from '../../store/photoStore';
import {
  selectDirectory,
  exportPhotos,
  revealDirectory,
  ExportResult,
} from '../../services/tauriBridge';
import {
  FolderOutput,
  FolderCheck,
  FolderOpen,
  X,
  Check,
  AlertCircle,
  FileCheck2,
  Loader2,
  ExternalLink,
  Layers,
  Sparkles,
  Star,
} from 'lucide-react';

type ExportScope = 'picked' | 'clean' | 'high_rating' | 'current_filter';

export const ExportModal: React.FC = () => {
  const {
    photos,
    folderPath,
    activeFilter,
    isExportModalOpen,
    setExportModalOpen,
    openFolder,
  } = usePhotoStore();

  const [scope, setScope] = useState<ExportScope>('picked');
  const [targetDir, setTargetDir] = useState<string>('');
  const [includeXmp, setIncludeXmp] = useState<boolean>(true);
  const [isMove, setIsMove] = useState<boolean>(false);
  const [overwrite, setOverwrite] = useState<boolean>(false);
  const [openAfterExport, setOpenAfterExport] = useState<boolean>(true);

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 初始化默认目标目录
  useEffect(() => {
    setTargetDir(folderPath ? `${folderPath}/QuickPick_Selected` : '');
  }, [folderPath]);

  if (!isExportModalOpen) return null;

  // 根据 Scope 计算待导出的照片列表
  const getSelectedPhotos = () => {
    switch (scope) {
      case 'picked':
        return photos.filter((p) => p.pick_status === 'Pick');
      case 'clean':
        return photos.filter((p) => p.retouch_status === 'clean');
      case 'high_rating':
        return photos.filter((p) => p.rating >= 3);
      case 'current_filter':
        return photos.filter((p) => {
          if (activeFilter === 'all') return true;
          if (activeFilter === 'pending') return p.retouch_status === 'pending';
          if (activeFilter === 'failed') return p.retouch_status === 'failed';
          if (activeFilter === 'clean') return p.retouch_status === 'clean';
          if (activeFilter === 'fixable') return p.retouch_status === 'fixable';
          if (activeFilter === 'fatal') return p.retouch_status === 'fatal';
          if (activeFilter === 'picked') return p.pick_status === 'Pick';
          return true;
        });
      default:
        return [];
    }
  };

  const selectedPhotos = getSelectedPhotos();
  const totalSizeBytes = selectedPhotos.reduce((acc, p) => acc + (p.file_size || 35000000), 0);
  const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(1);
  const totalSizeGB = (totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2);

  const handleBrowseDir = async () => {
    const chosen = await selectDirectory('选择导出目标文件夹');
    if (chosen) {
      setTargetDir(chosen);
    }
  };

  const handleStartExport = async () => {
    if (selectedPhotos.length === 0) {
      setErrorMessage('当前选择的范围内没有可导出的照片');
      return;
    }
    if (!targetDir.trim()) {
      setErrorMessage('请指定有效的导出目标文件夹');
      return;
    }

    setIsExporting(true);
    setErrorMessage(null);

    try {
      const result = await exportPhotos({
        photo_paths: selectedPhotos.map((p) => p.path),
        target_dir: targetDir,
        is_move: isMove,
        include_xmp: includeXmp,
        overwrite,
        open_after_export: openAfterExport,
      });
      setExportResult(result);
      if (isMove && result.success_photos > 0 && folderPath) {
        await openFolder(folderPath);
      }
    } catch (e: any) {
      setErrorMessage(e?.toString() || '导出发生未知错误');
    } finally {
      setIsExporting(false);
    }
  };

  const handleClose = () => {
    setExportResult(null);
    setErrorMessage(null);
    setExportModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-dark-850 border border-dark-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col text-slate-200 font-sans">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-750 bg-dark-800/80">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-600/20 text-brand-400 flex items-center justify-center border border-brand-500/30">
              <FolderOutput className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">选片结果批量导出</h3>
              <p className="text-[11px] text-slate-400">将挑选好的底片及 XMP 伴侣文件导出到交付目录</p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-1.5 hover:bg-dark-700 text-slate-400 hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 弹窗内容 */}
        <div className="p-6 space-y-5">
          {exportResult ? (
            /* 导出成功结果页 */
            <div className="py-4 flex flex-col items-center text-center space-y-4">
              <div className={`w-14 h-14 rounded-full border flex items-center justify-center shadow-lg ${
                exportResult.failed > 0
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-emerald-500/10'
              }`}>
                {exportResult.failed > 0
                  ? <AlertCircle className="w-7 h-7 stroke-[2.5]" />
                  : <Check className="w-7 h-7 stroke-[2.5]" />}
              </div>

              <div>
                <h4 className="text-base font-bold text-slate-100">
                  {exportResult.failed > 0 ? '导出完成，但有项目失败' : '选片导出完成'}
                </h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  {isMove ? '已将成功项目安全移动到目标目录。' : '已将成功项目安全复制到目标目录。'}
                  {exportResult.failed > 0 ? '失败项目仍保留在源目录，请查看下方详情后重试。' : ' Lightroom / Capture One 导入后可读取评级与色标。'}
                </p>
              </div>

              <div className="grid grid-cols-4 gap-3 w-full max-w-md bg-dark-800/80 border border-dark-700/80 p-3.5 rounded-xl text-center">
                <div className="flex flex-col">
                  <span className="text-[11px] text-slate-400">成功导出底片</span>
                  <span className="text-lg font-bold text-emerald-400 font-mono">
                    {exportResult.success_photos}
                  </span>
                </div>
                <div className="flex flex-col border-x border-dark-700">
                  <span className="text-[11px] text-slate-400">同步 XMP 伴侣</span>
                  <span className="text-lg font-bold text-blue-400 font-mono">
                    {exportResult.success_xmps}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] text-slate-400">跳过/重复</span>
                  <span className="text-lg font-bold text-slate-400 font-mono">
                    {exportResult.skipped}
                  </span>
                </div>
                <div className="flex flex-col border-l border-dark-700">
                  <span className="text-[11px] text-slate-400">失败</span>
                  <span className={`text-lg font-bold font-mono ${exportResult.failed > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                    {exportResult.failed}
                  </span>
                </div>
              </div>

              {exportResult.errors.length > 0 && (
                <div className="w-full max-w-md max-h-28 overflow-auto text-left text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-2 font-mono">
                  {exportResult.errors.map((error) => <div key={error}>{error}</div>)}
                </div>
              )}

              <div className="text-[11px] font-mono text-slate-400 bg-dark-800 px-3 py-1.5 rounded-lg border border-dark-700 max-w-md truncate w-full" title={exportResult.target_directory}>
                📁 {exportResult.target_directory}
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <button
                  onClick={() => revealDirectory(exportResult.target_directory)}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-dark-700 hover:bg-dark-600 text-slate-200 text-xs font-medium rounded-lg border border-dark-600 transition-all cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>在 Finder / 资源管理器中查看</span>
                </button>
                <button
                  onClick={handleClose}
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg shadow-md transition-all cursor-pointer"
                >
                  完成
                </button>
              </div>
            </div>
          ) : (
            /* 导出配置表单 */
            <>
              {/* 1. 导出范围选择 */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  1. 选择导出照片范围
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setScope('picked')}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs text-left transition-all ${
                      scope === 'picked'
                        ? 'border-brand-500 bg-brand-600/15 text-slate-100 ring-1 ring-brand-500/30'
                        : 'border-dark-700 bg-dark-800 text-slate-400 hover:border-dark-600'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <FileCheck2 className={`w-4 h-4 ${scope === 'picked' ? 'text-brand-400' : 'text-slate-500'}`} />
                      <div>
                        <div className="font-semibold">已采纳照片 (Pick)</div>
                        <div className="text-[10px] text-slate-500">仅导出标记为 P 的精选片</div>
                      </div>
                    </div>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-dark-700 text-slate-300">
                      {photos.filter((p) => p.pick_status === 'Pick').length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScope('clean')}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs text-left transition-all ${
                      scope === 'clean'
                        ? 'border-emerald-500 bg-emerald-600/15 text-slate-100 ring-1 ring-emerald-500/30'
                        : 'border-dark-700 bg-dark-800 text-slate-400 hover:border-dark-600'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <Sparkles className={`w-4 h-4 ${scope === 'clean' ? 'text-emerald-400' : 'text-slate-500'}`} />
                      <div>
                        <div className="font-semibold">所有完美原片</div>
                        <div className="text-[10px] text-slate-500">AI 判定无瑕疵的底片</div>
                      </div>
                    </div>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-dark-700 text-slate-300">
                      {photos.filter((p) => p.retouch_status === 'clean').length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScope('high_rating')}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs text-left transition-all ${
                      scope === 'high_rating'
                        ? 'border-amber-500 bg-amber-600/15 text-slate-100 ring-1 ring-amber-500/30'
                        : 'border-dark-700 bg-dark-800 text-slate-400 hover:border-dark-600'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <Star className={`w-4 h-4 ${scope === 'high_rating' ? 'text-amber-400' : 'text-slate-500'}`} />
                      <div>
                        <div className="font-semibold">评星 ≥ 3 星</div>
                        <div className="text-[10px] text-slate-500">所有三星及以上高分片</div>
                      </div>
                    </div>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-dark-700 text-slate-300">
                      {photos.filter((p) => p.rating >= 3).length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScope('current_filter')}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs text-left transition-all ${
                      scope === 'current_filter'
                        ? 'border-blue-500 bg-blue-600/15 text-slate-100 ring-1 ring-blue-500/30'
                        : 'border-dark-700 bg-dark-800 text-slate-400 hover:border-dark-600'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <Layers className={`w-4 h-4 ${scope === 'current_filter' ? 'text-blue-400' : 'text-slate-500'}`} />
                      <div>
                        <div className="font-semibold">当前筛选视图</div>
                        <div className="text-[10px] text-slate-500">主界面当前显示的列表</div>
                      </div>
                    </div>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-dark-700 text-slate-300">
                      {selectedPhotos.length}
                    </span>
                  </button>
                </div>
              </div>

              {/* 2. 目标输出文件夹 */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  2. 导出目标文件夹
                </label>
                <div className="flex items-center space-x-2">
                  <div className="flex-1 flex items-center bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 overflow-hidden">
                    <span className="truncate" title={targetDir || '未指定目录'}>
                      {targetDir || '点击右侧按钮选择目标目录...'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleBrowseDir}
                    className="flex items-center space-x-1.5 px-3 py-2 bg-dark-750 hover:bg-dark-700 text-slate-200 text-xs font-medium rounded-lg border border-dark-600 transition-colors shrink-0 cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>选择...</span>
                  </button>
                </div>
              </div>

              {/* 3. 伴侣与安全选项 */}
              <div className="bg-dark-800/60 border border-dark-700/70 p-3 rounded-xl space-y-2.5 text-xs">
                <label className="flex items-center space-x-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeXmp}
                    onChange={(e) => setIncludeXmp(e.target.checked)}
                    className="rounded bg-dark-700 border-dark-600 text-brand-600 focus:ring-brand-500/20"
                  />
                  <span className="font-medium text-slate-200">
                    同时导出同名 .xmp 伴侣文件
                  </span>
                  <span className="text-[10px] text-slate-500">
                    (推荐，Lightroom / Capture One 自动同步评星与色标)
                  </span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={openAfterExport}
                    onChange={(e) => setOpenAfterExport(e.target.checked)}
                    className="rounded bg-dark-700 border-dark-600 text-brand-600 focus:ring-brand-500/20"
                  />
                  <span className="text-slate-300">
                    导出完成后自动在 Finder / 资源管理器中打开目标目录
                  </span>
                </label>

                <div className="pt-1 border-t border-dark-700/60 flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center space-x-3">
                    <span>操作模式:</span>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input
                        type="radio"
                        name="exportMode"
                        checked={!isMove}
                        onChange={() => setIsMove(false)}
                        className="text-brand-600"
                      />
                      <span>复制 (保留原片)</span>
                    </label>
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input
                        type="radio"
                        name="exportMode"
                        checked={isMove}
                        onChange={() => setIsMove(true)}
                        className="text-brand-600"
                      />
                      <span className="text-amber-400/80">移动 (释放原空间)</span>
                    </label>
                  </div>

                  <label className="flex items-center space-x-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overwrite}
                      onChange={(e) => setOverwrite(e.target.checked)}
                      className="rounded bg-dark-700 border-dark-600 text-brand-600"
                    />
                    <span>覆盖同名文件</span>
                  </label>
                </div>
              </div>

              {/* 错误提示 */}
              {errorMessage && (
                <div className="flex items-center space-x-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* 底部按钮栏 */}
              <div className="flex items-center justify-between pt-3 border-t border-dark-750">
                <div className="text-xs text-slate-400 font-mono">
                  共选定 <span className="font-bold text-slate-100">{selectedPhotos.length}</span> 张底片
                  <span className="mx-1.5">•</span>
                  预估大小: <span className="text-slate-300">{Number(totalSizeGB) > 1 ? `${totalSizeGB} GB` : `${totalSizeMB} MB`}</span>
                </div>

                <div className="flex items-center space-x-2.5">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isExporting}
                    className="px-4 py-2 bg-dark-750 hover:bg-dark-700 text-slate-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    取消
                  </button>

                  <button
                    type="button"
                    onClick={handleStartExport}
                    disabled={isExporting || selectedPhotos.length === 0}
                    className="flex items-center space-x-1.5 px-5 py-2 bg-brand-600 hover:bg-brand-500 disabled:bg-dark-700 disabled:text-slate-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-brand-500/20 transition-all cursor-pointer"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>正在导出 ({selectedPhotos.length} 张)...</span>
                      </>
                    ) : (
                      <>
                        <FolderCheck className="w-3.5 h-3.5" />
                        <span>开始导出 ({selectedPhotos.length} 张)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
