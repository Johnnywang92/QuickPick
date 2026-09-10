import React, { useState } from 'react';
import { useExportStore, ExportPurpose, ManifestFormat } from '../../store/exportStore';
import { useAlbumStore } from '../../store/albumStore';
import { useSelectionStore } from '../../store/selectionStore';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileText,
  FolderCheck,
  FolderOpen,
  FolderOutput,
  HardDrive,
  ImageDown,
  MonitorDown,
  Loader2,
  Send,
  Server,
  ShieldCheck,
  Smartphone,
  UserRound,
  X,
} from 'lucide-react';

const manifestFormatOptions: Array<{
  value: ManifestFormat;
  label: string;
  description: string;
}> = [
  { value: 'txt', label: 'TXT', description: '纯文件名' },
  { value: 'csv', label: 'CSV', description: '表格整理' },
  { value: 'json', label: 'JSON', description: '系统交换' },
  { value: 'html', label: 'HTML', description: '图文指示单' },
  { value: 'lrsmcol', label: 'LIGHTROOM', description: 'Smart Collection' },
  { value: 'pmselection', label: 'PHOTO MECHANIC', description: 'Load Selection' },
];

const purposeOptions: Array<{
  value: ExportPurpose;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: 'photographer', label: '给摄影师修图', description: '原片与专业清单', icon: UserRound },
  { value: 'self_edit', label: '给自己修图', description: '复制到本地工作区', icon: MonitorDown },
  { value: 'social', label: '发布社交媒体', description: '轻量高清 JPEG', icon: ImageDown },
  { value: 'phone', label: '发送到手机', description: 'macOS AirDrop', icon: Smartphone },
  { value: 'nas', label: '备份到 NAS', description: '安全校验复制', icon: Server },
];

export const ExportModal: React.FC = () => {
  const {
    isExportModalOpen,
    setExportModalOpen,
    exportMode,
    setExportMode,
    exportPurpose,
    setExportPurpose,
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
    renderedExportResult,
    executeSocialExport,
    shareToPhone,
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
  const totalSizeBytes = selectedPhotos.reduce((acc, photo) => acc + (photo.fileSize || 35000000), 0);
  const totalSizeMB = (totalSizeBytes / (1024 * 1024)).toFixed(1);
  const totalSizeGB = (totalSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
  const formattedTotalSize = Number(totalSizeGB) >= 1 ? `${totalSizeGB} GB` : `${totalSizeMB} MB`;

  const handleClose = () => {
    resetExportState();
    setCopied(false);
    setReviewWarningAcknowledged(false);
    setExportModalOpen(false);
  };

  const handleCopyClipboard = async () => {
    const ok = await copyManifestToClipboard();
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm animate-in fade-in duration-150 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-dark-700 bg-dark-850 font-sans text-slate-200 shadow-2xl sm:max-h-[calc(100vh-3rem)]">
        <header className="shrink-0 border-b border-dark-700/80 bg-dark-900/55 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 shadow-inner">
                <FolderOutput className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="export-modal-title" className="text-base font-bold tracking-tight text-slate-100">
                    导出所选照片
                  </h2>
                  <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                    {selectedPhotos.length} 张 · {formattedTotalSize}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">选择一种交付方式，QuickPick 会保护原片不被修改。</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={isExporting}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-dark-700 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="关闭导出窗口"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="overflow-y-auto">
          <div className="space-y-5 p-5 sm:p-6">
            <section aria-labelledby="delivery-method-title">
              <div className="mb-2.5 flex items-center justify-between">
                <h3 id="delivery-method-title" className="text-xs font-semibold text-slate-300">
                  这次照片要去哪里？
                </h3>
                <span className="text-[10px] text-slate-500">QuickPick 会自动匹配交付设置</span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="导出目的">
                {purposeOptions.map((option) => {
                  const Icon = option.icon;
                  const active = exportPurpose === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={isExporting}
                      onClick={() => setExportPurpose(option.value)}
                      className={`relative rounded-xl border px-2.5 py-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                        active
                          ? 'border-emerald-500/60 bg-emerald-500/10 shadow-[0_0_0_1px_rgb(16_185_129_/_0.08)]'
                          : 'border-dark-700 bg-dark-900/45 hover:border-dark-600 hover:bg-dark-800/70'
                      }`}
                    >
                      <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-dark-800 text-slate-400'}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="mt-2 block text-[11px] font-semibold text-slate-200">{option.label}</span>
                      <span className="mt-0.5 block text-[9px] leading-relaxed text-slate-500">{option.description}</span>
                      {active && (
                        <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                          <Check className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            {exportPurpose === 'photographer' && (
              <div className="grid grid-cols-2 rounded-xl border border-dark-700 bg-dark-900/45 p-1" role="tablist" aria-label="摄影师交付内容">
                <button
                  type="button"
                  role="tab"
                  aria-selected={exportMode === 'copy_raw'}
                  onClick={() => setExportMode('copy_raw')}
                  className={`rounded-lg px-3 py-2 text-[11px] font-semibold transition-colors ${exportMode === 'copy_raw' ? 'bg-dark-700 text-emerald-300' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  原片交付包
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={exportMode === 'manifest'}
                  onClick={() => setExportMode('manifest')}
                  className={`rounded-lg px-3 py-2 text-[11px] font-semibold transition-colors ${exportMode === 'manifest' ? 'bg-dark-700 text-blue-300' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  软件选片清单
                </button>
              </div>
            )}

            {hasPendingReview ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-100" role="alert">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">导出前还有内容待复核</div>
                    <p className="mt-1 text-[11px] leading-relaxed text-amber-200/80">
                      {reviewStats.unreviewedCount} 张未查看，{reviewStats.maybeCount} 张待考虑。确认后仍可只导出当前已选的 {selectedPhotos.length} 张。
                    </p>
                  </div>
                </div>
                <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-amber-500/20 bg-black/10 px-3 py-2.5 transition-colors hover:bg-amber-500/5">
                  <input
                    type="checkbox"
                    checked={reviewWarningAcknowledged}
                    onChange={(event) => setReviewWarningAcknowledged(event.target.checked)}
                    className="mt-0.5 rounded border-amber-500/40 bg-dark-800 text-amber-500 focus:ring-amber-500/30"
                  />
                  <span className="text-[11px] leading-relaxed">我已了解，继续导出当前选片结果</span>
                </label>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-3 text-xs text-emerald-300">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check className="h-3 w-3" />
                </span>
                <span>复核已完成，所有照片均已查看，待考虑队列为空。</span>
              </div>
            )}

            {(exportPurpose === 'photographer' || exportPurpose === 'self_edit' || exportPurpose === 'nas') && exportMode === 'copy_raw' && (
              <>
                {exportResult ? (
                  <section className="flex flex-col items-center py-5 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-400 shadow-lg shadow-emerald-950/20">
                      <Check className="h-7 w-7 stroke-[2.5]" />
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-slate-100">
                      {exportResult.cancelled ? '导出已安全取消' : '原片复制完成'}
                    </h3>
                    <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-400">
                      {exportResult.cancelled
                        ? '任务创建的临时文件已清理，尚未处理的照片保持不变。'
                        : '所选原片已安全复制并完成校验，源目录中的文件没有被修改。'}
                    </p>

                    <div className="mt-5 grid w-full grid-cols-2 overflow-hidden rounded-xl border border-dark-700 bg-dark-900/60 sm:grid-cols-4">
                      {[
                        { label: '成功复制', value: exportResult.success_photos, color: 'text-emerald-400' },
                        { label: '重复跳过', value: exportResult.skipped, color: 'text-slate-300' },
                        { label: '复制失败', value: exportResult.failed, color: 'text-rose-400' },
                        { label: '未处理', value: exportResult.unprocessed, color: 'text-amber-400' },
                      ].map((item) => (
                        <div key={item.label} className="border-dark-700 p-3 text-center even:border-l sm:border-l sm:first:border-l-0">
                          <div className="text-[10px] text-slate-500">{item.label}</div>
                          <div className={`mt-1 font-mono text-lg font-bold ${item.color}`}>{item.value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex w-full items-center gap-2 rounded-lg border border-dark-700 bg-dark-900/70 px-3 py-2 text-left font-mono text-[10px] text-slate-400">
                      <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate" title={exportResult.target_directory}>{exportResult.target_directory}</span>
                    </div>

                    <button
                      type="button"
                      onClick={handleClose}
                      className="mt-5 rounded-lg bg-emerald-600 px-6 py-2.5 text-xs font-semibold text-white shadow-md transition-all hover:bg-emerald-500"
                    >
                      完成
                    </button>
                  </section>
                ) : (
                  <section className="space-y-4" aria-label="原片导出设置">
                    <div className="rounded-xl border border-dark-700 bg-dark-900/45 p-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold text-emerald-400">01</span>
                        <h3 className="text-xs font-semibold text-slate-200">
                          {exportPurpose === 'nas' ? '选择已挂载的 NAS 目录' : exportPurpose === 'self_edit' ? '选择本地修图工作目录' : '选择摄影师交付目录'}
                        </h3>
                      </div>
                      <p className="mt-1 pl-6 text-[11px] text-slate-500">
                        {exportPurpose === 'nas' ? '支持 Finder 已连接的 SMB / AFP 卷；写入前会检查容量和同名冲突。' : '可以选择新建或已有文件夹，同名文件会自动安全跳过。'}
                      </p>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <div className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border px-3 py-2.5 ${
                          targetDir ? 'border-dark-600 bg-dark-950/70' : 'border-dashed border-dark-600 bg-dark-900/50'
                        }`}>
                          <span className={`h-2 w-2 shrink-0 rounded-full ${targetDir ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                          <span className={`truncate font-mono text-[11px] ${targetDir ? 'text-slate-300' : 'text-slate-500'}`} title={targetDir}>
                            {targetDir || '尚未选择导出目录'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={browseTargetDir}
                          disabled={isExporting}
                          className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-dark-600 bg-dark-750 px-4 py-2.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-dark-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <FolderOpen className="h-3.5 w-3.5" />
                          <span>{targetDir ? '更换文件夹' : '选择文件夹'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-dark-700 bg-dark-900/35">
                      <button
                        type="button"
                        onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-dark-800/60"
                        aria-expanded={showAdvancedOptions}
                      >
                        <span>
                          <span className="block text-xs font-semibold text-slate-300">交付选项</span>
                          <span className="mt-0.5 block text-[10px] text-slate-500">
                            {includeXmp ? '包含 XMP 伴侣文件' : '仅复制照片'} · {openAfterExport ? '完成后打开目录' : '完成后保持后台'}
                          </span>
                        </span>
                        {showAdvancedOptions ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                      </button>
                      {showAdvancedOptions && (
                        <div className="space-y-2 border-t border-dark-700 px-4 py-3">
                          <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-dark-800/60">
                            <input
                              type="checkbox"
                              checked={includeXmp}
                              onChange={(event) => setIncludeXmp(event.target.checked)}
                              className="mt-0.5 rounded border-dark-600 bg-dark-700 text-emerald-600 focus:ring-emerald-500/20"
                            />
                            <span>
                              <span className="block text-[11px] font-medium text-slate-300">同时复制 XMP 伴侣文件</span>
                              <span className="mt-0.5 block text-[10px] leading-relaxed text-slate-500">保留摄影师在 Lightroom / Camera Raw 中的已有调整。</span>
                            </span>
                          </label>
                          <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-dark-800/60">
                            <input
                              type="checkbox"
                              checked={openAfterExport}
                              onChange={(event) => setOpenAfterExport(event.target.checked)}
                              className="mt-0.5 rounded border-dark-600 bg-dark-700 text-emerald-600 focus:ring-emerald-500/20"
                            />
                            <span>
                              <span className="block text-[11px] font-medium text-slate-300">导出完成后打开目标目录</span>
                              <span className="mt-0.5 block text-[10px] leading-relaxed text-slate-500">完成后自动在 Finder 或资源管理器中定位。</span>
                            </span>
                          </label>
                        </div>
                      )}
                    </div>

                    <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] p-3 text-[11px] leading-relaxed text-emerald-300">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                      <span><strong className="font-semibold">只读安全导出：</strong>单向复制、SHA-256 完整性校验，不移动、不覆盖、不删除任何原片。</span>
                    </div>

                    {preflightResult && (
                      <div className="rounded-xl border border-dark-700 bg-dark-900/60 p-3.5 text-[11px]">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-slate-300">
                          <span className="font-semibold">导出预检</span>
                          <span className={preflightResult.has_enough_space ? 'text-emerald-400' : 'text-rose-400'}>
                            目标磁盘可用 {(preflightResult.available_bytes / (1024 ** 3)).toFixed(2)} GB
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-slate-500">
                          <span>{preflightResult.total_photos} 张照片</span>
                          <span>{preflightResult.total_files} 个文件</span>
                          <span>{(preflightResult.total_bytes / (1024 ** 3)).toFixed(2)} GB</span>
                        </div>
                        {preflightResult.conflicts.length > 0 && (
                          <div className="mt-3 border-t border-dark-700 pt-2.5">
                            <div className="text-amber-300">{preflightResult.conflicts.length} 个同名文件将自动跳过</div>
                            <div className="mt-1.5 max-h-20 space-y-1 overflow-auto font-mono text-[10px] text-slate-500">
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
                      <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300" role="alert">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{errorMessage}</span>
                      </div>
                    )}

                    <footer className="flex flex-col gap-3 border-t border-dark-700 pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-[11px] text-slate-500">
                        即将导出 <span className="font-semibold text-slate-200">{selectedPhotos.length} 张</span>
                        <span className="mx-1.5">·</span>
                        预计 <span className="font-mono text-slate-300">{formattedTotalSize}</span>
                      </div>
                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                          type="button"
                          onClick={isExporting ? () => void cancelCurrentExport() : handleClose}
                          disabled={isCancelling}
                          className="rounded-lg bg-dark-750 px-4 py-2.5 text-xs font-medium text-slate-300 transition-colors hover:bg-dark-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isCancelling ? '正在安全取消…' : isExporting ? '取消导出' : '取消'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void executeCopyRaw()}
                          disabled={isExporting || selectedPhotos.length === 0 || !canExport}
                          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-emerald-950/20 transition-all hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderCheck className="h-3.5 w-3.5" />}
                          <span>{isExporting ? '正在检查或复制…' : exportPurpose === 'nas' ? `备份 ${selectedPhotos.length} 张到 NAS` : `安全导出 ${selectedPhotos.length} 张`}</span>
                        </button>
                      </div>
                    </footer>
                  </section>
                )}
              </>
            )}

            {exportPurpose === 'photographer' && exportMode === 'manifest' && (
              <section className="space-y-4" aria-label="清单导出设置">
                <div>
                  <div className="mb-2.5 flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-300">选择清单格式</h3>
                    <span className="text-[10px] text-slate-500">不会复制原片</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {manifestFormatOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setManifestFormat(option.value)}
                        aria-pressed={manifestFormat === option.value}
                        className={`rounded-xl border px-3 py-3 text-left transition-all ${
                          manifestFormat === option.value
                            ? 'border-blue-500/60 bg-blue-500/10 shadow-[0_0_0_1px_rgb(59_130_246_/_0.08)]'
                            : 'border-dark-700 bg-dark-900/45 hover:border-dark-600 hover:bg-dark-800/70'
                        }`}
                      >
                        <span className={`block font-mono text-xs font-bold ${manifestFormat === option.value ? 'text-blue-400' : 'text-slate-300'}`}>
                          {option.label}
                        </span>
                        <span className="mt-1 block text-[10px] text-slate-500">{option.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-dark-700 bg-dark-900/65">
                  <div className="flex items-center justify-between border-b border-dark-700 bg-dark-800/65 px-3.5 py-2.5">
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-300">
                      <FileText className="h-3.5 w-3.5 text-blue-400" />
                      清单预览
                    </div>
                    <span className="font-mono text-[10px] text-slate-500">前 5 条 / 共 {selectedPhotos.length} 条</span>
                  </div>
                  <pre className="min-h-28 max-h-40 select-all overflow-auto p-4 font-mono text-[11px] leading-6 text-slate-300">
                    {selectedPhotos.slice(0, 5).map((photo) => photo.filename).join('\n') || '暂无已选照片'}
                    {selectedPhotos.length > 5 && `\n… 以及其他 ${selectedPhotos.length - 5} 张照片`}
                  </pre>
                </div>

                {manifestExportSuccess && (
                  <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300" role="status">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3 w-3" /></span>
                    <span>清单已成功复制或保存，可以发送给摄影师了。</span>
                  </div>
                )}

                {errorMessage && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300" role="alert">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <footer className="flex flex-col gap-3 border-t border-dark-700 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-[11px] text-slate-500">
                    {manifestFormat === 'html'
                      ? '生成包含精修标注与备注的网页指示单'
                      : manifestFormat === 'lrsmcol'
                        ? '在 Lightroom Classic 的“收藏夹”面板中导入 Smart Collection'
                        : manifestFormat === 'pmselection'
                          ? '在 Photo Mechanic 中使用 Edit → Load Selection 载入'
                          : `生成 ${manifestFormat.toUpperCase()} 格式的 ${selectedPhotos.length} 条记录`}
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => void handleCopyClipboard()}
                      disabled={selectedPhotos.length === 0 || !canExport}
                      className="flex items-center gap-2 rounded-lg border border-dark-600 bg-dark-750 px-4 py-2.5 text-xs font-medium text-slate-200 transition-colors hover:bg-dark-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copied ? '已复制' : '复制清单'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void downloadManifest()}
                      disabled={isExporting || selectedPhotos.length === 0 || !canExport}
                      className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-blue-950/20 transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>{manifestFormat === 'lrsmcol' ? '保存 Lightroom Collection' : manifestFormat === 'pmselection' ? '保存 Photo Mechanic Selection' : '保存清单文件'}</span>
                    </button>
                  </div>
                </footer>
              </section>
            )}

            {exportPurpose === 'social' && (
              <section className="space-y-4" aria-label="社交媒体导出设置">
                {renderedExportResult ? (
                  <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-center">
                    <Check className="mx-auto h-6 w-6 text-emerald-400" />
                    <h3 className="mt-2 text-sm font-bold text-slate-100">社交媒体 JPEG 已生成</h3>
                    <p className="mt-1 text-[11px] text-slate-400">成功 {renderedExportResult.success} 张，跳过 {renderedExportResult.skipped} 张，失败 {renderedExportResult.failed} 张。</p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border border-dark-700 bg-dark-900/45 p-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-pink-500/10 text-pink-400"><ImageDown className="h-4 w-4" /></span>
                        <div>
                          <h3 className="text-xs font-semibold text-slate-200">社交平台通用高清</h3>
                          <p className="mt-0.5 text-[10px] text-slate-500">JPEG · 长边不超过 2048 px · 品质 88 · 保持原始比例</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-dark-600 bg-dark-950/60 px-3 py-2.5 font-mono text-[11px] text-slate-400">
                          <HardDrive className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{targetDir || '尚未选择保存目录'}</span>
                        </div>
                        <button type="button" onClick={browseTargetDir} className="rounded-lg border border-dark-600 bg-dark-750 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-dark-700">
                          {targetDir ? '更换目录' : '选择目录'}
                        </button>
                      </div>
                    </div>
                    {errorMessage && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300" role="alert">{errorMessage}</div>}
                    <div className="flex justify-end border-t border-dark-700 pt-4">
                      <button type="button" onClick={() => void executeSocialExport()} disabled={isExporting || !canExport || selectedPhotos.length === 0} className="flex items-center gap-2 rounded-lg bg-pink-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-pink-500 disabled:opacity-40">
                        {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        {isExporting ? '正在生成 JPEG…' : `导出 ${selectedPhotos.length} 张 JPEG`}
                      </button>
                    </div>
                  </>
                )}
              </section>
            )}

            {exportPurpose === 'phone' && (
              <section className="space-y-4" aria-label="AirDrop 手机导出">
                <div className="rounded-xl border border-blue-500/25 bg-blue-500/[0.07] p-5 text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-500/25 bg-blue-500/10 text-blue-400"><Smartphone className="h-6 w-6" /></span>
                  <h3 className="mt-3 text-sm font-bold text-slate-100">通过 AirDrop 发送到手机</h3>
                  <p className="mx-auto mt-1 max-w-md text-[11px] leading-relaxed text-slate-400">QuickPick 会生成长边不超过 2560 px、品质 90 的 JPEG，然后打开 macOS 原生 AirDrop 窗口。RAW 原片不会发送。</p>
                  {renderedExportResult && <p className="mt-3 text-[11px] text-emerald-400">已准备 {renderedExportResult.success} 张照片，AirDrop 窗口已打开。</p>}
                </div>
                {errorMessage && <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300" role="alert">{errorMessage}</div>}
                <div className="flex justify-end border-t border-dark-700 pt-4">
                  <button type="button" onClick={() => void shareToPhone()} disabled={isExporting || !canExport || selectedPhotos.length === 0} className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40">
                    {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    {isExporting ? '正在准备照片…' : `打开 AirDrop · ${selectedPhotos.length} 张`}
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
