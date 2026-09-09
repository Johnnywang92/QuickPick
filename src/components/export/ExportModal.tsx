import React, { useState } from 'react';
import { useExportStore, ManifestFormat } from '../../store/exportStore';
import { useAlbumStore } from '../../store/albumStore';
import { useSelectionStore } from '../../store/selectionStore';
import {
  FolderOutput,
  FolderCheck,
  FolderOpen,
  X,
  Check,
  AlertCircle,
  FileText,
  Copy,
  Download,
  ShieldCheck,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export const ExportModal: React.FC = () => {
  const {
    isExportModalOpen,
    setExportModalOpen,
    exportMode,
    setExportMode,
    targetDir,
    includeXmp,
    setIncludeXmp,
    openAfterExport,
    setOpenAfterExport,
    manifestFormat,
    setManifestFormat,
    browseTargetDir,
    getSelectedPhotos,
    executeCopyRaw,
    cancelCurrentExport,
    downloadManifest,
    copyManifestToClipboard,
    isExporting,
    isCancelling,
    exportResult,
    preflightResult,
    errorMessage,
    manifestExportSuccess,
    resetExportState,
  } = useExportStore();

  const [copied, setCopied] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [reviewWarningAcknowledged, setReviewWarningAcknowledged] = useState(false);
  const { photos } = useAlbumStore();
  const { getStats } = useSelectionStore();

  if (!isExportModalOpen) return null;

  const selectedPhotos = getSelectedPhotos();
  const reviewStats = getStats(photos.length);
  const hasPendingReview = reviewStats.unreviewedCount > 0 || reviewStats.maybeCount > 0;
  const canExport = !hasPendingReview || reviewWarningAcknowledged;
  const totalSizeBytes = selectedPhotos.reduce((acc, p) => acc + (p.fileSize || 35000000), 0);
  const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(1);
  const totalSizeGB = (totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2);

  const handleClose = () => {
    resetExportState();
    setExportModalOpen(false);
  };

  const handleCopyClipboard = async () => {
    const ok = await copyManifestToClipboard();
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-dark-700 bg-dark-850 font-sans text-slate-200 shadow-2xl">
        {/* 顶部标题 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-750 bg-dark-800/80">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <FolderOutput className="w-4 h-4" />
            </div>
            <div>
              <h3 id="export-modal-title" className="text-sm font-bold text-slate-100">导出选片结果</h3>
              <p className="text-[11px] text-slate-400">
                已精选 <span className="text-emerald-400 font-semibold">{selectedPhotos.length}</span> 张照片，请选择适合的交付方式
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            disabled={isExporting}
            className="p-1.5 hover:bg-dark-700 text-slate-400 hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 导出模式 Tab 切换 */}
        <div className="grid grid-cols-2 border-b border-dark-750 bg-dark-800/40 p-1 text-xs">
          <button
            onClick={() => setExportMode('copy_raw')}
            className={`flex items-center justify-center space-x-1.5 py-2.5 rounded-lg font-semibold transition-all cursor-pointer ${
              exportMode === 'copy_raw'
                ? 'bg-dark-700 text-emerald-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderCheck className="w-3.5 h-3.5" />
            <span>模式 A: 复制所选原片</span>
          </button>

          <button
            onClick={() => setExportMode('manifest')}
            className={`flex items-center justify-center space-x-1.5 py-2.5 rounded-lg font-semibold transition-all cursor-pointer ${
              exportMode === 'manifest'
                ? 'bg-dark-700 text-blue-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>模式 B: 选片清单</span>
          </button>

        </div>

        {/* 弹窗内容主体 */}
        <div className="space-y-5 overflow-y-auto p-6">
          {hasPendingReview ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-100" role="alert">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <div>
                  <div className="font-semibold">选片尚未完全复核</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-amber-200/80">
                    还有 {reviewStats.unreviewedCount} 张未查看、{reviewStats.maybeCount} 张待考虑。你可以关闭窗口先去复核，也可以明确确认后继续导出当前已选照片。
                  </p>
                </div>
              </div>
              <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-amber-500/20 bg-black/10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={reviewWarningAcknowledged}
                  onChange={(event) => setReviewWarningAcknowledged(event.target.checked)}
                  className="mt-0.5 rounded border-amber-500/40 bg-dark-800 text-amber-500 focus:ring-amber-500/30"
                />
                <span className="text-[11px] leading-relaxed">
                  我已了解仍有照片未完成复核，继续导出当前已选的 {selectedPhotos.length} 张照片
                </span>
              </label>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-3 text-xs text-emerald-200">
              <Check className="h-4 w-4 shrink-0" />
              <span>所有照片都已查看，待考虑队列已清空。</span>
            </div>
          )}

          {/* 模式 A：复制所选原片 */}
          {exportMode === 'copy_raw' && (
            <>
              {exportResult ? (
                /* 复制结果状态卡片 */
                <div className="py-4 flex flex-col items-center text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                    <Check className="w-6 h-6 stroke-[2.5]" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-100">
                      {exportResult.cancelled ? '导出已安全取消' : '原片复制完成'}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm">
                      {exportResult.cancelled
                        ? '任务创建的临时文件已清理，尚未处理的照片保持不变。'
                        : '已将选中的底片安全复制到新目录。原片目录全程只读，源文件完好无损。'}
                    </p>
                  </div>

                  <div className="grid grid-cols-4 gap-3 w-full max-w-md bg-dark-800/80 border border-dark-700/80 p-3 rounded-xl text-center text-xs">
                    <div>
                      <span className="text-[11px] text-slate-400">成功复制</span>
                      <div className="text-lg font-bold text-emerald-400 font-mono mt-0.5">
                        {exportResult.success_photos} 张
                      </div>
                    </div>
                    <div className="border-x border-dark-700">
                      <span className="text-[11px] text-slate-400">重复跳过</span>
                      <div className="text-lg font-bold text-slate-400 font-mono mt-0.5">
                        {exportResult.skipped} 张
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400">失败</span>
                      <div className="text-lg font-bold text-rose-400 font-mono mt-0.5">
                        {exportResult.failed} 张
                      </div>
                    </div>
                    <div className="border-l border-dark-700">
                      <span className="text-[11px] text-slate-400">未处理</span>
                      <div className="text-lg font-bold text-amber-400 font-mono mt-0.5">
                        {exportResult.unprocessed} 张
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] font-mono text-slate-400 bg-dark-800 px-3 py-1.5 rounded-lg border border-dark-700 max-w-md truncate w-full">
                    📁 {exportResult.target_directory}
                  </div>

                  <button
                    onClick={handleClose}
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-md transition-all cursor-pointer"
                  >
                    完成
                  </button>
                </div>
              ) : (
                /* 复制参数配置 */
                <div className="space-y-4 text-xs">
                  <div className="bg-dark-800/80 border border-dark-700 p-3.5 rounded-xl space-y-1">
                    <div className="font-semibold text-slate-200">交由修图师或导入修图软件</div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      将挑好的 RAW 或 JPEG 原片完整复制到指定的新文件夹，附带 SHA-256 完整性校验和选片清单。原片文件夹保持只读，绝不移动、覆盖或删除源文件。
                    </p>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 mb-1.5">
                      导出目标文件夹 (新建/已有目录)
                    </label>
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 flex items-center bg-dark-900 border border-dark-700 rounded-lg px-3 py-2 font-mono text-slate-300 overflow-hidden">
                        <span className="truncate" title={targetDir}>
                          {targetDir || '请选择导出目标目录...'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={browseTargetDir}
                        className="flex items-center space-x-1.5 px-3 py-2 bg-dark-750 hover:bg-dark-700 text-slate-200 font-medium rounded-lg border border-dark-600 transition-colors shrink-0 cursor-pointer"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>选择...</span>
                      </button>
                    </div>
                  </div>

                  {/* 高级选项折叠 */}
                  <div className="border border-dark-750 rounded-xl overflow-hidden bg-dark-800/40">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                      className="w-full flex items-center justify-between px-3.5 py-2 text-slate-400 hover:text-slate-200 text-left transition-colors"
                    >
                      <span className="font-medium text-[11px]">高级选项 (摄影师伴侣文件)</span>
                      {showAdvancedOptions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    {showAdvancedOptions && (
                      <div className="px-3.5 pb-3 pt-1 border-t border-dark-750 space-y-2 text-[11px]">
                        <label className="flex items-center space-x-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={includeXmp}
                            onChange={(e) => setIncludeXmp(e.target.checked)}
                            className="rounded bg-dark-700 border-dark-600 text-emerald-600 focus:ring-emerald-500/20"
                          />
                          <span className="text-slate-300">
                            若摄影师原片目录中包含同名 .xmp 伴侣文件，连同 XMP 一并复制
                          </span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={openAfterExport}
                            onChange={(e) => setOpenAfterExport(e.target.checked)}
                            className="rounded bg-dark-700 border-dark-600 text-emerald-600 focus:ring-emerald-500/20"
                          />
                          <span className="text-slate-300">
                            导出完成后在 Finder / 资源管理器中打开目标目录
                          </span>
                        </label>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px]">
                    <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>原片绝对只读保护：系统仅执行单向安全复制，任何情况下绝不删除或修改摄影师的原片。</span>
                  </div>

                  {preflightResult && (
                    <div className="rounded-lg border border-dark-700 bg-dark-900/70 p-3 text-[11px] space-y-2">
                      <div className="flex items-center justify-between text-slate-300">
                        <span>
                          预检：{preflightResult.total_photos} 张 / {preflightResult.total_files} 个文件
                        </span>
                        <span className={preflightResult.has_enough_space ? 'text-emerald-400' : 'text-rose-400'}>
                          可用 {(preflightResult.available_bytes / (1024 ** 3)).toFixed(2)} GB
                        </span>
                      </div>
                      {preflightResult.conflicts.length > 0 && (
                        <div className="space-y-1 border-t border-dark-750 pt-2">
                          <div className="text-amber-300">
                            {preflightResult.conflicts.length} 个同名冲突将安全跳过：
                          </div>
                          <div className="max-h-20 overflow-auto space-y-1 font-mono text-slate-400">
                            {preflightResult.conflicts.map((conflict, index) => (
                              <div key={`${conflict.target_path}-${index}`} title={conflict.source_path}>
                                {conflict.target_path} — {conflict.reason}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {errorMessage && (
                    <div className="flex items-center space-x-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-dark-750">
                    <div className="font-mono text-slate-400">
                      共选定 <span className="font-bold text-slate-100">{selectedPhotos.length}</span> 张
                      <span className="mx-1.5">•</span>
                      预估容量: <span className="text-slate-300">{Number(totalSizeGB) > 1 ? `${totalSizeGB} GB` : `${totalSizeMB} MB`}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={isExporting ? () => void cancelCurrentExport() : handleClose}
                        disabled={isCancelling}
                        className="px-4 py-2 bg-dark-750 hover:bg-dark-700 disabled:opacity-50 text-slate-300 font-medium rounded-lg transition-colors cursor-pointer"
                      >
                        {isCancelling ? '正在安全取消...' : isExporting ? '取消导出' : '取消'}
                      </button>
                      <button
                        onClick={executeCopyRaw}
                        disabled={isExporting || selectedPhotos.length === 0 || !canExport}
                        className="flex items-center space-x-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg shadow-md transition-all cursor-pointer"
                      >
                        {isExporting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>正在检查或复制 ({selectedPhotos.length} 张)...</span>
                          </>
                        ) : (
                          <>
                            <FolderCheck className="w-3.5 h-3.5" />
                            <span>开始复制原片</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 模式 B：导出选片清单 */}
          {exportMode === 'manifest' && (
            <div className="space-y-4 text-xs">
              <div className="bg-dark-800/80 border border-dark-700 p-3.5 rounded-xl space-y-1">
                <div className="font-semibold text-slate-200">把选中的文件名发给摄影师</div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  无需复制几十 GB 的大文件。直接导出文件名列表（如微信发给摄影师或发邮件），速度最快。
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-2">选择清单格式</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['txt', 'csv', 'json', 'html'] as ManifestFormat[]).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => setManifestFormat(fmt)}
                      className={`p-2 rounded-lg border text-center font-mono font-semibold uppercase transition-all cursor-pointer text-xs ${
                        manifestFormat === fmt
                          ? 'border-blue-500 bg-blue-500/15 text-blue-300'
                          : 'border-dark-700 bg-dark-800 text-slate-400 hover:border-dark-600'
                      }`}
                    >
                      {fmt === 'html' ? 'HTML 指示单' : fmt}
                    </button>
                  ))}
                </div>
              </div>

              {/* 清单预览框 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-semibold text-slate-300">清单预览 (前 5 条)</label>
                  <span className="text-[11px] text-slate-500 font-mono">共 {selectedPhotos.length} 项</span>
                </div>
                <pre className="bg-dark-900 border border-dark-700 rounded-xl p-3 text-[11px] font-mono text-slate-300 max-h-32 overflow-auto select-all">
                  {selectedPhotos.slice(0, 5).map((p) => p.filename).join('\n')}
                  {selectedPhotos.length > 5 && `\n...以及其它 ${selectedPhotos.length - 5} 张照片`}
                </pre>
              </div>

              {manifestExportSuccess && (
                <div className="flex items-center space-x-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>清单已成功复制到剪贴板或保存为文件！</span>
                </div>
              )}

              {errorMessage && (
                <div className="flex items-center space-x-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}。请更换文件名后重试。</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-dark-750">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-dark-750 hover:bg-dark-700 text-slate-300 font-medium rounded-lg transition-colors cursor-pointer"
                >
                  关闭
                </button>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleCopyClipboard}
                    disabled={selectedPhotos.length === 0 || !canExport}
                    className="flex items-center space-x-1.5 px-4 py-2 bg-dark-700 hover:bg-dark-650 text-slate-200 font-medium rounded-lg border border-dark-600 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copied ? '已复制到剪贴板' : '复制到剪贴板'}</span>
                  </button>
                  <button
                    onClick={() => void downloadManifest()}
                    disabled={isExporting || selectedPhotos.length === 0 || !canExport}
                    className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>保存为清单文件</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
