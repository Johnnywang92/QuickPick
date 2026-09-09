import { LocalPhoto, SelectionState, UserSelection } from '../types/photo';

export interface QuickPickSelectionExport {
  schemaVersion: '1.0' | '1.1';
  projectId: string;
  albumName: string;
  exportedAt: string;
  authorRole: 'bride' | 'groom' | 'family' | 'primary';
  authorName?: string;
  totalPhotos: number;
  selections: Record<
    string,
    {
      state: SelectionState;
      note?: string;
      updatedAt?: string;
      relativePath?: string;
    }
  >;
}

export interface MergeConflictItem {
  photoId: string;
  localState: SelectionState;
  importedState: SelectionState;
  localNote?: string;
  importedNote?: string;
  resolvedChoice?: 'local' | 'imported' | 'both_selected' | 'maybe';
}

export interface MergeAnalysisResult {
  totalPhotos: number;
  matchedSelectionCount: number;
  consensusSelectedCount: number;
  consensusSkippedCount: number;
  conflicts: MergeConflictItem[];
  importOnlySelectedCount: number;
  localOnlySelectedCount: number;
}

type ExportedSelection = QuickPickSelectionExport['selections'][string];

function normalizePhotoPath(value: string): string {
  return value
    .normalize('NFC')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\//, '')
    .replace(/\/$/, '');
}

function relativePhotoPath(photo: LocalPhoto, rootPath?: string | null): string {
  const normalizedPath = normalizePhotoPath(photo.path);
  const normalizedRoot = rootPath ? normalizePhotoPath(rootPath) : '';
  if (normalizedRoot && normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return normalizedPath.slice(normalizedRoot.length + 1);
  }
  return normalizePhotoPath(photo.filename);
}

export function resolveImportedSelections(
  photos: LocalPhoto[],
  imported: QuickPickSelectionExport,
  rootPath?: string | null,
): Record<string, ExportedSelection> {
  const incomingByRelativePath = new Map<string, ExportedSelection | null>();
  for (const incoming of Object.values(imported.selections)) {
    if (!incoming.relativePath) continue;
    const key = normalizePhotoPath(incoming.relativePath);
    incomingByRelativePath.set(key, incomingByRelativePath.has(key) ? null : incoming);
  }

  const resolved: Record<string, ExportedSelection> = {};
  for (const photo of photos) {
    const byPath = incomingByRelativePath.get(relativePhotoPath(photo, rootPath));
    const incoming = byPath || imported.selections[photo.id];
    if (incoming) resolved[photo.id] = incoming;
  }
  return resolved;
}

export function analyzeSelectionMerge(
  photos: LocalPhoto[],
  localSelections: Record<string, UserSelection>,
  imported: QuickPickSelectionExport,
  rootPath?: string | null,
): MergeAnalysisResult {
  let consensusSelectedCount = 0;
  let consensusSkippedCount = 0;
  let importOnlySelectedCount = 0;
  let localOnlySelectedCount = 0;
  const conflicts: MergeConflictItem[] = [];
  const importedSelections = resolveImportedSelections(photos, imported, rootPath);

  for (const photo of photos) {
    const local = localSelections[photo.id] || { state: 'unreviewed' };
    const incoming = importedSelections[photo.id];
    const incomingState = incoming ? incoming.state : 'unreviewed';

    if (local.state === 'selected' && incomingState === 'selected') {
      consensusSelectedCount++;
    } else if (local.state === 'skipped' && incomingState === 'skipped') {
      consensusSkippedCount++;
    } else if (local.state === 'selected' && incomingState === 'unreviewed') {
      localOnlySelectedCount++;
    } else if (local.state === 'unreviewed' && incomingState === 'selected') {
      importOnlySelectedCount++;
    } else if (
      (local.state === 'selected' && (incomingState === 'skipped' || incomingState === 'maybe')) ||
      (incomingState === 'selected' && (local.state === 'skipped' || local.state === 'maybe')) ||
      (local.state === 'maybe' && incomingState === 'skipped') ||
      (local.state === 'skipped' && incomingState === 'maybe')
    ) {
      conflicts.push({
        photoId: photo.id,
        localState: local.state,
        importedState: incomingState,
        localNote: local.note,
        importedNote: incoming?.note,
        resolvedChoice: 'both_selected', // 默认推荐宽容共识（只要有人喜欢就保留）
      });
    }
  }

  return {
    totalPhotos: photos.length,
    matchedSelectionCount: Object.keys(importedSelections).length,
    consensusSelectedCount,
    consensusSkippedCount,
    conflicts,
    importOnlySelectedCount,
    localOnlySelectedCount,
  };
}

export function buildExportPackage(
  projectId: string,
  albumName: string,
  photos: LocalPhoto[],
  selections: Record<string, UserSelection>,
  authorRole: 'bride' | 'groom' | 'family' | 'primary' = 'primary',
  authorName?: string,
  rootPath?: string | null,
): QuickPickSelectionExport {
  const exportSelections: QuickPickSelectionExport['selections'] = {};

  for (const photo of photos) {
    const sel = selections[photo.id];
    if (sel && sel.state !== 'unreviewed') {
      exportSelections[photo.id] = {
        state: sel.state,
        note: sel.note,
        updatedAt: sel.updatedAt,
        relativePath: relativePhotoPath(photo, rootPath),
      };
    }
  }

  return {
    schemaVersion: '1.1',
    projectId,
    albumName,
    exportedAt: new Date().toISOString(),
    authorRole,
    authorName,
    totalPhotos: photos.length,
    selections: exportSelections,
  };
}
