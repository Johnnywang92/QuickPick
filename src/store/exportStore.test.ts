import { beforeEach, describe, expect, it, vi } from 'vitest';
import { photoFixture } from '../test/photoFixture';
import { useAlbumStore } from './albumStore';
import { useExportStore } from './exportStore';
import { useSelectionStore } from './selectionStore';

vi.mock('../services/tauriBridge', () => ({
  exportPhotos: vi.fn(),
  cancelExport: vi.fn(),
  preflightExportPhotos: vi.fn(),
  selectDirectory: vi.fn(),
  confirmAction: vi.fn(),
  saveManifestFile: vi.fn(),
}));

describe('exportStore manifest domain', () => {
  beforeEach(() => {
    useAlbumStore.setState({
      folderPath: '/album',
      photos: [
        photoFixture('first', { path: '/album/set-a/photo.jpg', filename: 'photo.jpg' }),
        photoFixture('second', { path: '/album/set-b/photo.jpg', filename: 'photo.jpg' }),
      ],
    });
    useSelectionStore.setState({
      selections: {
        first: { photoId: 'first', state: 'selected', note: '=formula', updatedAt: '' },
        second: { photoId: 'second', state: 'selected', updatedAt: '' },
      },
    });
    useExportStore.setState({ manifestFormat: 'csv' });
  });

  it('keeps duplicate filenames distinguishable by relative path and neutralizes CSV formulas', () => {
    const content = useExportStore.getState().generateManifestContent();

    expect(content.startsWith('\uFEFF')).toBe(true);
    expect(content).toContain('set-a/photo.jpg');
    expect(content).toContain('set-b/photo.jpg');
    expect(content).toContain("'=formula");
  });
});
