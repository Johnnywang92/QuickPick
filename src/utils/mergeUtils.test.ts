import { describe, it, expect } from 'vitest';
import { analyzeSelectionMerge, buildExportPackage, QuickPickSelectionExport } from './mergeUtils';
import { LocalPhoto, UserSelection } from '../types/photo';

describe('mergeUtils', () => {
  const photo1: LocalPhoto = { id: 'p1', filename: '1.jpg', path: '/1.jpg', fileSize: 100, format: 'jpeg', isRaw: false };
  const photo2: LocalPhoto = { id: 'p2', filename: '2.jpg', path: '/2.jpg', fileSize: 100, format: 'jpeg', isRaw: false };
  const photo3: LocalPhoto = { id: 'p3', filename: '3.jpg', path: '/3.jpg', fileSize: 100, format: 'jpeg', isRaw: false };
  const photos = [photo1, photo2, photo3];

  it('builds export package correctly', () => {
    const selections: Record<string, UserSelection> = {
      p1: { photoId: 'p1', state: 'selected', updatedAt: '2026-09-09T00:00:00Z' },
      p2: { photoId: 'p2', state: 'unreviewed', updatedAt: '' },
    };

    const pkg = buildExportPackage('proj_1', '婚礼精选', photos, selections, 'bride', '小红');
    expect(pkg.schemaVersion).toBe('1.1');
    expect(pkg.albumName).toBe('婚礼精选');
    expect(pkg.authorRole).toBe('bride');
    expect(pkg.authorName).toBe('小红');
    expect(pkg.selections.p1.state).toBe('selected');
    expect(pkg.selections.p1.relativePath).toBe('1.jpg');
    expect(pkg.selections.p2).toBeUndefined(); // unreviewed should be omitted
  });

  it('matches selections by relative path when device-local photo IDs differ', () => {
    const exportedPhotos = [
      { ...photo1, id: 'device-a-id', path: '/Users/a/Wedding/ceremony/1.jpg' },
    ];
    const pkg = buildExportPackage(
      'device-a-project',
      'Wedding',
      exportedPhotos,
      {
        'device-a-id': {
          photoId: 'device-a-id',
          state: 'selected',
          updatedAt: '2026-09-09T00:00:00Z',
        },
      },
      'bride',
      undefined,
      '/Users/a/Wedding',
    );
    const localPhotos = [
      { ...photo1, id: 'device-b-id', path: '/Volumes/Photos/Wedding/ceremony/1.jpg' },
    ];

    const result = analyzeSelectionMerge(
      localPhotos,
      {},
      pkg,
      '/Volumes/Photos/Wedding',
    );

    expect(pkg.selections['device-a-id'].relativePath).toBe('ceremony/1.jpg');
    expect(result.matchedSelectionCount).toBe(1);
    expect(result.importOnlySelectedCount).toBe(1);
  });

  it('analyzes consensus and conflicts accurately', () => {
    const localSelections: Record<string, UserSelection> = {
      p1: { photoId: 'p1', state: 'selected', updatedAt: '' }, // Both selected
      p2: { photoId: 'p2', state: 'selected', updatedAt: '' }, // Local selected, incoming skipped -> conflict
      p3: { photoId: 'p3', state: 'skipped', updatedAt: '' },  // Local skipped, incoming skipped -> consensus skipped
    };

    const imported: QuickPickSelectionExport = {
      schemaVersion: '1.0',
      projectId: 'proj_1',
      albumName: '婚礼精选',
      exportedAt: '2026-09-09T01:00:00Z',
      authorRole: 'groom',
      totalPhotos: 3,
      selections: {
        p1: { state: 'selected' },
        p2: { state: 'skipped' },
        p3: { state: 'skipped' },
      },
    };

    const result = analyzeSelectionMerge(photos, localSelections, imported);
    expect(result.consensusSelectedCount).toBe(1); // p1
    expect(result.consensusSkippedCount).toBe(1);  // p3
    expect(result.conflicts.length).toBe(1);        // p2
    expect(result.conflicts[0].photoId).toBe('p2');
    expect(result.conflicts[0].localState).toBe('selected');
    expect(result.conflicts[0].importedState).toBe('skipped');
  });
});
