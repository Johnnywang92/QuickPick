import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useAlbumStore } from './store/albumStore';
import { useSelectionStore } from './store/selectionStore';
import { photoFixture } from './test/photoFixture';

vi.mock('./services/tauriBridge', () => ({
  fetchStartupHealth: vi.fn().mockResolvedValue({
    previous_session_unclean: false,
    database_recovered: false,
    recovered_export_jobs: 0,
    cleaned_export_temp_files: 0,
  }),
  fetchEngineInfo: vi.fn().mockResolvedValue({ libraw_version: '0.21.2', status: 'ready' }),
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



describe('App with empty skipped filter', () => {
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

  it('renders App and switches to skipped filter when empty without crashing', async () => {
    render(<App />);
    expect(screen.getByText('全部照片')).toBeDefined();

    // Click '已不选' tab
    const skippedTab = screen.getByText('已不选');
    act(() => {
      fireEvent.click(skippedTab);
    });

    // Check if empty state appears and no crash occurred
    expect(screen.getByText('当前选项暂无匹配照片')).toBeDefined();
    expect(screen.getByText('当前选项下暂无照片')).toBeDefined();

    // Clicking "查看全部照片" resets back to all photos
    const resetBtn = screen.getByRole('button', { name: /查看全部照片/ });
    act(() => {
      fireEvent.click(resetBtn);
    });

    expect(useAlbumStore.getState().activeFilter).toBe('all');
  });
});

