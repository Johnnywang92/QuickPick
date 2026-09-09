import { beforeEach, describe, expect, it, vi } from 'vitest';
import { photoFixture } from '../test/photoFixture';
import { usePreviewStore } from './previewStore';

const getPhotoPreview = vi.hoisted(() => vi.fn());
vi.mock('../services/tauriBridge', () => ({ getPhotoPreview }));

describe('previewStore async album navigation', () => {
  beforeEach(() => {
    getPhotoPreview.mockReset();
    usePreviewStore.getState().clearCache();
  });

  it('does not let a late preview overwrite the newer current photo', async () => {
    let resolveFirst: (url: string) => void = () => undefined;
    let resolveSecond: (url: string) => void = () => undefined;
    getPhotoPreview
      .mockImplementationOnce(() => new Promise<string>((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise<string>((resolve) => { resolveSecond = resolve; }));

    const first = photoFixture('first');
    const second = photoFixture('second');
    const firstLoad = usePreviewStore.getState().loadPreviewForCurrent(first);
    const secondLoad = usePreviewStore.getState().loadPreviewForCurrent(second);

    resolveSecond('preview:second');
    await secondLoad;
    resolveFirst('preview:first');
    await firstLoad;

    expect(usePreviewStore.getState().currentPhotoPath).toBe(second.path);
    expect(usePreviewStore.getState().currentPreviewUrl).toBe('preview:second');
    expect(usePreviewStore.getState().previewStatus).toBe('loaded');
  });

  it('reports an error when the current source photo is moved during preview loading', async () => {
    let rejectPreview: (error: Error) => void = () => undefined;
    getPhotoPreview.mockImplementationOnce(
      () => new Promise<string>((_, reject) => { rejectPreview = reject; }),
    );
    const photo = photoFixture('moved');

    const loading = usePreviewStore.getState().loadPreviewForCurrent(photo);
    rejectPreview(new Error('source file no longer exists'));
    await loading;

    expect(usePreviewStore.getState().currentPhotoPath).toBe(photo.path);
    expect(usePreviewStore.getState().previewStatus).toBe('error');
    expect(usePreviewStore.getState().previewError).toContain('source file no longer exists');
  });
});
