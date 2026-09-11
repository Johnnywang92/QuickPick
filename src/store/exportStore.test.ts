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
  exportShareableJpegs: vi.fn(),
  sharePhotosViaAirDrop: vi.fn(),
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

  it('generates an importable Lightroom Smart Collection with exact filename rules', () => {
    useExportStore.setState({ manifestFormat: 'lrsmcol' });

    const content = useExportStore.getState().generateManifestContent();

    expect(content).toContain('type = "LibrarySmartCollection"');
    expect(content).toContain('combine = "union"');
    expect(content).toContain('criteria = "filename"');
    expect(content).toContain('value = "photo.jpg"');
  });

  it('generates a UTF-8 Photo Mechanic selection using absolute paths', () => {
    useExportStore.setState({ manifestFormat: 'pmselection' });

    const content = useExportStore.getState().generateManifestContent();

    expect(content).toContain('/album/set-a/photo.jpg');
    expect(content).toContain('/album/set-b/photo.jpg');
  });

  it('passes per-photo LUT configs and encoded LUT tables when bakeLutEffect is true', async () => {
    const { exportShareableJpegs } = await import('../services/tauriBridge');
    const { useLutStore } = await import('./lutStore');

    (exportShareableJpegs as any).mockResolvedValue({ total: 2, success: 2, failed: 0 });

    useLutStore.setState({
      photoLuts: {
        first: { lutId: 'kodak_portra_400', intensity: 0.9 },
        // second has no LUT
      },
    });

    useExportStore.setState({
      targetDir: '/output',
      bakeLutEffect: true,
    });

    await useExportStore.getState().executeSocialExport();

    expect(exportShareableJpegs).toHaveBeenCalledTimes(1);
    const [items, targetDir, maxDim, quality, lutTables] = (exportShareableJpegs as any).mock.calls[0];

    expect(targetDir).toBe('/output');
    expect(maxDim).toBe(2048);
    expect(quality).toBe(88);

    // First photo has Portra 400
    expect(items[0].id).toBe('first');
    expect(items[0].lutId).toBe('kodak_portra_400');
    expect(items[0].lutIntensity).toBe(0.9);

    // Second photo has no LUT
    expect(items[1].id).toBe('second');
    expect(items[1].lutId).toBeNull();

    // lutTables contains the kodak_portra_400 3D table
    expect(lutTables).toBeDefined();
    expect(lutTables['kodak_portra_400']).toBeDefined();
    expect(lutTables['kodak_portra_400'].size).toBe(33);
    expect(typeof lutTables['kodak_portra_400'].data_base64).toBe('string');
  });

  it('omits LUT configs when bakeLutEffect is false', async () => {
    const { exportShareableJpegs } = await import('../services/tauriBridge');
    const { useLutStore } = await import('./lutStore');
    vi.clearAllMocks();

    (exportShareableJpegs as any).mockResolvedValue({ total: 2, success: 2, failed: 0 });

    useLutStore.setState({
      photoLuts: {
        first: { lutId: 'kodak_portra_400', intensity: 0.9 },
      },
    });

    useExportStore.setState({
      targetDir: '/output',
      bakeLutEffect: false,
    });

    await useExportStore.getState().executeSocialExport();

    expect(exportShareableJpegs).toHaveBeenCalledTimes(1);
    const [items, , , , lutTables] = (exportShareableJpegs as any).mock.calls[0];

    expect(items[0].lutId).toBeNull();
    expect(lutTables).toBeUndefined();
  });
});
