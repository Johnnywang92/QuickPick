import React, { useState } from 'react';
import { useAlbumStore } from '../../store/albumStore';
import { useSelectionStore } from '../../store/selectionStore';
import { SelectionState } from '../../types/photo';
import {
  analyzeSelectionMerge,
  buildExportPackage,
  MergeAnalysisResult,
  MergeConflictItem,
  QuickPickSelectionExport,
  resolveImportedSelections,
} from '../../utils/mergeUtils';
import { saveManifestFile } from '../../services/tauriBridge';
import {
  GitMerge,
  Download,
  Upload,
  X,
  CheckCircle2,
  AlertTriangle,
  Heart,
  HelpCircle,
  FileCheck,
  Users,
} from 'lucide-react';
import clsx from 'clsx';

interface MergeSelectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MergeSelectionsModal: React.FC<MergeSelectionsModalProps> = ({ isOpen, onClose }) => {
  const { photos, folderPath } = useAlbumStore();
  const { selections, currentProjectId, setSelectionStates } = useSelectionStore();

  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import');
  const [importedPackage, setImportedPackage] = useState<QuickPickSelectionExport | null>(null);
  const [analysis, setAnalysis] = useState<MergeAnalysisResult | null>(null);
  const [conflictsState, setConflictsState] = useState<MergeConflictItem[]>([]);
  const [role, setRole] = useState<'bride' | 'groom' | 'family' | 'primary'>('bride');
  const [authorName, setAuthorName] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const albumName = folderPath ? folderPath.split('/').filter(Boolean).pop() || '相册' : '相册';

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text) as QuickPickSelectionExport;
        if (!parsed || !parsed.selections) {
          throw new Error('选片文件格式不正确');
        }
        const res = analyzeSelectionMerge(photos, selections, parsed, folderPath);
        if (Object.keys(parsed.selections).length > 0 && res.matchedSelectionCount === 0) {
          throw new Error('选片文件中的照片与当前相册不匹配，请确认双方打开的是同一套原片');
        }
        setImportedPackage(parsed);
        setAnalysis(res);
        setConflictsState(res.conflicts);
      } catch (err: any) {
        setImportError(err.message || '无法解析该选片文件');
      }
    };
    reader.readAsText(file);
  };

  const handleApplyMerge = () => {
    if (!analysis || !importedPackage) return;

    const updates: { photoId: string; state: SelectionState }[] = [];
    const resolvedSelections = resolveImportedSelections(photos, importedPackage, folderPath);

    // 1. 共识区：双方都选中的，确保为已选
    for (const photo of photos) {
      const local = selections[photo.id];
      const incoming = resolvedSelections[photo.id];
      if (incoming && incoming.state === 'selected') {
        if (!local || local.state !== 'selected') {
          // 对方选中但本地未选的，或者双方都选中的，统统加入 updates
          updates.push({ photoId: photo.id, state: 'selected' });
        }
      }
    }

    // 2. 争议分歧区：按照用户在界面中针对每张照片的裁决应用
    for (const conf of conflictsState) {
      let finalState: SelectionState = 'selected';
      if (conf.resolvedChoice === 'local') {
        finalState = conf.localState;
      } else if (conf.resolvedChoice === 'imported') {
        finalState = conf.importedState;
      } else if (conf.resolvedChoice === 'maybe') {
        finalState = 'maybe';
      } else {
        finalState = 'selected';
      }
      updates.push({ photoId: conf.photoId, state: finalState });
    }

    if (updates.length > 0) {
      setSelectionStates(updates, `合并他人选片 (${importedPackage.authorName || '对方'})`);
    }

    setSuccessMessage(`成功合并！已更新 ${updates.length} 张照片的选择结果。`);
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  const handleExportPackage = async () => {
    if (!currentProjectId) return;
    const pkg = buildExportPackage(
      currentProjectId,
      albumName,
      photos,
      selections,
      role,
      authorName,
      folderPath,
    );
    const content = JSON.stringify(pkg, null, 2);
    try {
      await saveManifestFile(content, 'json');
      setSuccessMessage('选片工程已成功导出！可将文件发给对方进行离线合并。');
    } catch (e: any) {
      setImportError(`导出失败：${e.message || String(e)}`);
    }
  };

  const roleLabels = {
    bride: '👰 新娘',
    groom: '🤵 新郎',
    family: '👨‍👩‍👧 家人/长辈',
    primary: '👤 个人',
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="merge-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm select-none"
    >
      <div className="w-full max-w-2xl bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-slate-200 animate-modal-sheet">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-dark-750 bg-dark-850/80 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <GitMerge className="w-4 h-4" />
            </div>
            <div>
              <h2 id="merge-modal-title" className="text-sm font-bold text-slate-100">
                离线双人选片协同工程
              </h2>
              <p className="text-[11px] text-slate-400">
                无需网络 · 导出轻量选片文件 · 一键合并双方共识
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-750 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b border-dark-750 bg-dark-950 shrink-0">
          <button
            onClick={() => setActiveTab('import')}
            className={clsx(
              'flex-1 py-2.5 text-xs font-semibold flex items-center justify-center space-x-2 border-b-2 transition-all cursor-pointer',
              activeTab === 'import'
                ? 'border-emerald-500 text-emerald-800 dark:text-emerald-300 bg-emerald-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200',
            )}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>导入并合并对方选片</span>
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={clsx(
              'flex-1 py-2.5 text-xs font-semibold flex items-center justify-center space-x-2 border-b-2 transition-all cursor-pointer',
              activeTab === 'export'
                ? 'border-blue-500 text-blue-800 dark:text-blue-300 bg-blue-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200',
            )}
          >
            <Download className="w-3.5 h-3.5" />
            <span>导出我的选片工程文件</span>
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {successMessage && (
            <div className="flex items-center space-x-2 p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-950 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {importError && (
            <div className="flex items-center space-x-2 p-3 rounded-xl bg-rose-50/80 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-rose-950 dark:text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{importError}</span>
            </div>
          )}

          {activeTab === 'import' ? (
            <div className="space-y-4">
              {!importedPackage ? (
                <div className="p-8 border-2 border-dashed border-dark-700 hover:border-emerald-500/60 rounded-2xl bg-dark-850/50 flex flex-col items-center justify-center text-center transition-all">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
                    <FileCheck className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-200 mb-1">选择对方导出的选片工程</h3>
                  <p className="text-[11px] text-slate-400 mb-4 max-w-sm">
                    支持读取对方导出的 .json / .qppick 选片工程文件。
                  </p>
                  <label className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs shadow-md transition-all cursor-pointer">
                    <span>浏览并导入选片文件</span>
                    <input
                      type="file"
                      accept=".json,.qppick"
                      onChange={handleFileSelected}
                      className="hidden"
                    />
                  </label>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* 对比分析大盘卡片 */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-emerald-50/70 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl">
                      <div className="flex items-center space-x-1.5 text-emerald-700 dark:text-emerald-400 font-semibold mb-1">
                        <Heart className="w-3.5 h-3.5 fill-emerald-600 dark:fill-emerald-400 text-emerald-600 dark:text-emerald-400" />
                        <span>心有灵犀共识</span>
                      </div>
                      <div className="text-xl font-mono font-bold text-emerald-900 dark:text-emerald-300">
                        {analysis?.consensusSelectedCount} 张
                      </div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">双方均标为已选</span>
                    </div>

                    <div className="p-3 bg-amber-50/70 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl">
                      <div className="flex items-center space-x-1.5 text-amber-700 dark:text-amber-400 font-semibold mb-1">
                        <HelpCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        <span>存在意见分歧</span>
                      </div>
                      <div className="text-xl font-mono font-bold text-amber-900 dark:text-amber-300">
                        {analysis?.conflicts.length} 张
                      </div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">一人想选一人犹豫/不选</span>
                    </div>

                    <div className="p-3 bg-blue-50/70 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl">
                      <div className="flex items-center space-x-1.5 text-blue-700 dark:text-blue-400 font-semibold mb-1">
                        <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>对方额外选中</span>
                      </div>
                      <div className="text-xl font-mono font-bold text-blue-900 dark:text-blue-300">
                        {analysis?.importOnlySelectedCount} 张
                      </div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">对方选了我尚未细看</span>
                    </div>
                  </div>

                  {/* 争议照片列表与裁决 */}
                  {conflictsState.length > 0 && (
                    <div className="border border-dark-750 rounded-xl overflow-hidden bg-dark-850/60">
                      <div className="px-3.5 py-2 bg-dark-800 border-b border-dark-750 flex items-center justify-between font-semibold text-slate-300">
                        <span>商榷讨论区（快速协商这 {conflictsState.length} 张）</span>
                        <span className="text-[10px] text-slate-500">默认推荐全部保留为已选</span>
                      </div>
                      <div className="divide-y divide-dark-750 max-h-48 overflow-y-auto">
                        {conflictsState.map((conf) => {
                          const p = photos.find((item) => item.id === conf.photoId);
                          return (
                            <div key={conf.photoId} className="p-3 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-mono text-xs text-slate-200 truncate">
                                  {p?.filename || conf.photoId}
                                </div>
                                <div className="text-[10px] text-slate-400 space-x-2 mt-0.5">
                                  <span>我: <strong className="text-slate-300">{conf.localState}</strong></span>
                                  <span>·</span>
                                  <span>对方: <strong className="text-amber-300">{conf.importedState}</strong></span>
                                  {conf.importedNote && (
                                    <span className="text-indigo-300 italic">({conf.importedNote})</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center space-x-1 shrink-0">
                                <button
                                  onClick={() =>
                                    setConflictsState((list) =>
                                      list.map((c) =>
                                        c.photoId === conf.photoId
                                          ? { ...c, resolvedChoice: 'both_selected' }
                                          : c,
                                      ),
                                    )
                                  }
                                  className={clsx(
                                    'px-2 py-1 rounded text-[10px] font-medium border transition-colors cursor-pointer',
                                    conf.resolvedChoice === 'both_selected'
                                      ? 'bg-emerald-600 text-white border-emerald-500'
                                      : 'bg-dark-800 text-slate-400 border-dark-700 hover:text-slate-200',
                                  )}
                                >
                                  选入 (保留)
                                </button>
                                <button
                                  onClick={() =>
                                    setConflictsState((list) =>
                                      list.map((c) =>
                                        c.photoId === conf.photoId ? { ...c, resolvedChoice: 'maybe' } : c,
                                      ),
                                    )
                                  }
                                  className={clsx(
                                    'px-2 py-1 rounded text-[10px] font-medium border transition-colors cursor-pointer',
                                    conf.resolvedChoice === 'maybe'
                                      ? 'bg-amber-600 text-white border-amber-500'
                                      : 'bg-dark-800 text-slate-400 border-dark-700 hover:text-slate-200',
                                  )}
                                >
                                  待考虑
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-end space-x-2 pt-2">
                    <button
                      onClick={() => {
                        setImportedPackage(null);
                        setAnalysis(null);
                      }}
                      className="px-3 py-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-dark-800 cursor-pointer"
                    >
                      重新选择文件
                    </button>
                    <button
                      onClick={handleApplyMerge}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer"
                    >
                      确认合并到当前项目
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* 导出我的选片工程 */
            <div className="space-y-4">
              <div className="bg-dark-850 p-4 rounded-xl border border-dark-750 space-y-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1.5">我的选片角色</label>
                  <div className="grid grid-cols-4 gap-2">
                    {(Object.keys(roleLabels) as (keyof typeof roleLabels)[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => setRole(r)}
                        className={clsx(
                          'py-2 px-2.5 rounded-xl border text-center font-medium transition-all cursor-pointer',
                          role === r
                            ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-sm'
                            : 'bg-dark-800 border-dark-750 text-slate-400 hover:border-dark-650',
                        )}
                      >
                        {roleLabels[r]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">称呼 / 姓名 (可选)</label>
                  <input
                    type="text"
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    placeholder="如：小红 / 老公 / 妈妈"
                    className="w-full px-3 py-1.5 bg-dark-900 border border-dark-700 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="text-[11px] text-slate-400">
                  将导出纯文本轻量工程，绝不打包原图，大小仅约 30KB。
                </div>
                <button
                  onClick={handleExportPackage}
                  className="flex items-center space-x-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>导出工程文件 (.qppick)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
