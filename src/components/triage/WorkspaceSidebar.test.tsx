import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { useAlbumStore } from '../../store/albumStore';
import { useSelectionStore } from '../../store/selectionStore';
import { photoFixture } from '../../test/photoFixture';

vi.mock('../../services/tauriBridge', () => ({
  fetchStartupHealth: vi.fn().mockResolvedValue({
    previous_session_unclean: false,
    database_recovered: false,
    recovered_export_jobs: 0,
    cleaned_export_temp_files: 0,
  }),
  fetchEngineInfo: vi.fn().mockResolvedValue({ libraw_version: '0.22.2', status: 'ready' }),
  listRecentProjects: vi.fn().mockResolvedValue([]),
  isTauri: vi.fn().mockReturnValue(false),
  selectFolder: vi.fn(),
  getPhotoPreview: vi.fn().mockResolvedValue('blob:test'),
  loadProjectSelections: vi.fn().mockResolvedValue([]),
  saveProjectViewState: vi.fn().mockResolvedValue(undefined),
  saveBatchSelections: vi.fn().mockResolvedValue(undefined),
}));

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

Element.prototype.scrollTo = vi.fn();

describe('Scheme A dual-pane workspace layout', () => {
  beforeEach(() => {
    useAlbumStore.setState({
      folderPath: '/test/photos',
      photos: [photoFixture('photo-1'), photoFixture('photo-2')],
      currentIndex: 0,
      activeFilter: 'all',
      isLoading: false,
      scanError: null,
      failedFolderPath: null,
      scenes: [],
      selectedSceneId: null,
      activeTagFilter: null,
    });
    useSelectionStore.setState({
      selections: {},
      viewedPhotoIds: {},
    });
  });

  it('toggles left workspace sidebar with [ key and header button', () => {
    render(<App />);
    expect(screen.getByLabelText('筛选与工具侧边栏')).toBeDefined();

    act(() => {
      fireEvent.keyDown(window, { key: '[' });
    });
    expect(screen.queryByLabelText('筛选与工具侧边栏')).toBeNull();

    const toggleBtn = screen.getByLabelText('切换左侧筛选与工具栏');
    act(() => {
      fireEvent.click(toggleBtn);
    });
    expect(screen.getByLabelText('筛选与工具侧边栏')).toBeDefined();
  });

  it('shows secondary utilities inside the unified more menu', () => {
    render(<App />);
    const moreBtn = screen.getByLabelText('更多功能');
    act(() => {
      fireEvent.click(moreBtn);
    });
    expect(screen.getByText('帮助中心')).toBeDefined();
    expect(screen.getByText('快捷键帮助')).toBeDefined();
    expect(screen.getByText('偏好设置')).toBeDefined();
  });
});

