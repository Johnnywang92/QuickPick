import { beforeEach, describe, expect, it, vi } from 'vitest';
import { photoFixture } from '../test/photoFixture';
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
});
