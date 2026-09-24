import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DefectFunnelModal } from './DefectFunnelModal';
import { useAlbumStore } from '../../store/albumStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useInsightStore } from '../../store/insightStore';
import { LocalPhoto } from '../../types/photo';

describe('DefectFunnelModal component', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    const mockPhotos: LocalPhoto[] = [
      {
        id: 'photo-1',
        filename: 'IMG_0001.JPG',
        path: '/photos/IMG_0001.JPG',
        fileSize: 1024,
        format: 'jpeg',
        isRaw: false,
        faces: [{ id: 'f1', x: 0.1, y: 0.1, width: 0.2, height: 0.2, eye_open_score: 0.1, sharpness: 80, is_pinned: false, priority: 1 }],
      },
      {
        id: 'photo-2',
        filename: 'IMG_0002.JPG',
        path: '/photos/IMG_0002.JPG',
        fileSize: 1024,
        format: 'jpeg',
        isRaw: false,
        sharpness: 10,
      },
      {
        id: 'photo-3',
        filename: 'IMG_0003.JPG',
        path: '/photos/IMG_0003.JPG',
        fileSize: 1024,
        format: 'jpeg',
        isRaw: false,
      },
    ];

    useAlbumStore.setState({
      photos: mockPhotos,
      currentIndex: 0,
    });

    useInsightStore.setState({
      insights: {
        'photo-1': {
          photoId: 'photo-1',
          analysisStatus: 'needs_check',
          possibleClosedEyes: 0.1,
          reasons: ['疑似闭眼'],
        },
        'photo-2': {
          photoId: 'photo-2',
          analysisStatus: 'needs_check',
          possibleBlur: 60,
          reasons: ['画面脱焦模糊'],
        },
        'photo-3': {
          photoId: 'photo-3',
          analysisStatus: 'no_issues',
          possibleBlur: 10,
          possibleClosedEyes: 0.9,
          reasons: [],
        },
      },
    });

    useSelectionStore.setState({
      selections: {
        'photo-1': { photoId: 'photo-1', state: 'selected', updatedAt: '' }, // 摄影师已选保护
        'photo-2': { photoId: 'photo-2', state: 'unreviewed', updatedAt: '' },
      },
    });
  });

  it('renders modal with defect categories and identifies blinks and blur', () => {
    render(<DefectFunnelModal onClose={mockOnClose} />);

    expect(screen.getByText('废片一键粉碎漏斗 (Blink & Blur Funnel)')).toBeInTheDocument();
    // photo-1 is blink, photo-2 is blur
    expect(screen.getByText('IMG_0001.JPG')).toBeInTheDocument();
    expect(screen.getByText('IMG_0002.JPG')).toBeInTheDocument();
    // photo-3 is not a defect
    expect(screen.queryByText('IMG_0003.JPG')).not.toBeInTheDocument();

    // photo-1 is protected
    expect(screen.getByText('已保护')).toBeInTheDocument();
  });

  it('culls non-protected defect photos when button is clicked', () => {
    const setSelectionStatesSpy = vi.spyOn(useSelectionStore.getState(), 'setSelectionStates');

    render(<DefectFunnelModal onClose={mockOnClose} />);

    // Click the cull button
    const cullButton = screen.getByText(/一键粉碎选中的/);
    expect(cullButton).toBeInTheDocument();
    fireEvent.click(cullButton);

    expect(setSelectionStatesSpy).toHaveBeenCalled();
    const calledUpdates = setSelectionStatesSpy.mock.calls[0][0];
    // photo-2 should be culled, while photo-1 was protected
    expect(calledUpdates.some((u) => u.photoId === 'photo-2' && u.state === 'skipped')).toBe(true);
    expect(calledUpdates.some((u) => u.photoId === 'photo-1')).toBe(false);
  });

  it('closes on Escape key press', () => {
    render(<DefectFunnelModal onClose={mockOnClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalled();
  });
});
