import { beforeEach, describe, expect, it, vi } from 'vitest';
import { photoFixture } from '../test/photoFixture';
import { useAlbumStore } from './albumStore';
import { useInsightStore } from './insightStore';

const bridgeMocks = vi.hoisted(() => ({
  analyzePhotoDetails: vi.fn(),
  detectPhotoFaces: vi.fn(),
}));
vi.mock('../services/tauriBridge', () => bridgeMocks);

describe('insightStore background jobs', () => {
  beforeEach(() => {
    bridgeMocks.analyzePhotoDetails.mockReset();
    bridgeMocks.detectPhotoFaces.mockReset();
    useInsightStore.getState().cancelBackgroundAnalysis();
    useInsightStore.setState({ insights: {} });
    useAlbumStore.setState({ photos: [] });
  });

  it('ignores analysis results from an album generation that was cancelled', async () => {
    let resolveOld: (value: {
      analysis_status: 'no_issues';
      defect_tags: [];
      faces: [];
    }) => void = () => undefined;
    bridgeMocks.analyzePhotoDetails.mockImplementation(
      () => new Promise((resolve) => { resolveOld = resolve; }),
    );
    const oldPhoto = photoFixture('old');
    useInsightStore.setState({
      insights: {
        old: { photoId: 'old', analysisStatus: 'pending', reasons: [] },
      },
    });

    useInsightStore.getState().startBackgroundAnalysis([oldPhoto]);
    useInsightStore.getState().cancelBackgroundAnalysis();
    useInsightStore.setState({
      insights: {
        fresh: { photoId: 'fresh', analysisStatus: 'pending', reasons: [] },
      },
    });
    resolveOld({ analysis_status: 'no_issues', defect_tags: [], faces: [] });

    await vi.waitFor(() => expect(useInsightStore.getState().isAnalyzing).toBe(false));
    expect(useInsightStore.getState().insights).toEqual({
      fresh: { photoId: 'fresh', analysisStatus: 'pending', reasons: [] },
    });
  });

  it('recomputes burst groups and the best pick after retrying one photo', async () => {
    const first = photoFixture('first', {
      filename: 'IMG_0001.JPG',
      capturedAt: '2026-09-09 12:00:00',
      phash: 'ffff0000ffff0000',
      sharpness: 10,
    });
    const second = photoFixture('second', {
      filename: 'IMG_0002.JPG',
      capturedAt: '2026-09-09 12:00:10',
      phash: '0000000000000000',
      sharpness: 20,
    });
    useAlbumStore.setState({ photos: [first, second] });
    useInsightStore.setState({
      insights: {
        first: { photoId: 'first', analysisStatus: 'failed', reasons: ['无法分析'] },
        second: { photoId: 'second', analysisStatus: 'no_issues', reasons: [] },
      },
    });
    bridgeMocks.analyzePhotoDetails.mockResolvedValue({
      analysis_status: 'no_issues',
      defect_tags: [],
      faces: [],
      phash: '0000000000000001',
      sharpness: 80,
    });

    await useInsightStore.getState().analyzeSinglePhoto('first', first.path, 0);

    const grouped = useAlbumStore.getState().photos;
    expect(grouped[0].burstGroupId).toBe('burst:first');
    expect(grouped[1].burstGroupId).toBe('burst:first');
    expect(useInsightStore.getState().insights.first.isBestPick).toBe(true);
    expect(useInsightStore.getState().insights.second.isBestPick).toBe(false);
    expect(useInsightStore.getState().insights.first.reasons).toContain('组内推荐最佳');
  });
});
