import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RetouchPanel } from './RetouchPanel';
import { useAlbumStore } from '../../store/albumStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useTagStore } from '../../store/tagStore';
import { photoFixture } from '../../test/photoFixture';

vi.mock('../../services/tauriBridge', () => ({
  persistSelection: vi.fn().mockResolvedValue({}),
  persistSelections: vi.fn().mockResolvedValue({}),
}));

describe('RetouchPanel AI Advisor', () => {
  const mockPhoto = photoFixture('DSC001', {
    exif: {
      camera_make: 'SONY',
      camera_model: 'ILCE-7RM5',
      lens_model: 'FE 85mm F1.4 GM',
      focal_length: 85,
      aperture: 1.4,
      iso: 100,
    },
    faces: [
      {
        id: 'f1',
        x: 0.3,
        y: 0.2,
        width: 0.4,
        height: 0.4,
        sharpness: 92,
        eye_open_score: 0.95,
        is_pinned: false,
        priority: 1,
      },
    ],
  });

  beforeEach(() => {
    useAlbumStore.setState({
      photos: [mockPhoto],
      currentIndex: 0,
      activePresetId: 'wedding',
    });
    useSelectionStore.setState({
      selections: {},
      currentProjectId: 'test-project',
    });
    useTagStore.setState({
      availableTags: ['面部微调', '修除碎发', '调亮主体', '保留真实肤色'],
    });

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders AI Retouch Advisor card and summary', () => {
    render(
      <RetouchPanel
        isOpen={true}
        onClose={vi.fn()}
        isAddingPin={false}
        setIsAddingPin={vi.fn()}
      />,
    );

    expect(screen.getByText('AI 智能修图顾问')).toBeInTheDocument();
    expect(screen.getByText(/唯美高雅婚纱纪实/)).toBeInTheDocument();
    expect(screen.getByText('建议清单')).toBeInTheDocument();
    expect(screen.getByText('AI 提示词')).toBeInTheDocument();
    expect(screen.getByText('LR 基准')).toBeInTheDocument();
  });

  it('switches tabs to AI Prompts and copies prompt', async () => {
    render(
      <RetouchPanel
        isOpen={true}
        onClose={vi.fn()}
        isAddingPin={false}
        setIsAddingPin={vi.fn()}
      />,
    );

    // Switch to prompts tab
    fireEvent.click(screen.getByText('AI 提示词'));
    expect(screen.getByText('Photoshop 创成式填充指令')).toBeInTheDocument();
    expect(screen.getByText('Midjourney v6 提示词')).toBeInTheDocument();

    // Click copy MJ prompt
    const copyMjBtn = screen.getByText('复制 MJ 词');
    await act(async () => {
      fireEvent.click(copyMjBtn);
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('--ar 3:2 --style raw --v 6.0'),
    );
  });

  it('switches tabs to Lightroom benchmarks', () => {
    render(
      <RetouchPanel
        isOpen={true}
        onClose={vi.fn()}
        isAddingPin={false}
        setIsAddingPin={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('LR 基准'));
    expect(screen.getByText('曝光补偿')).toBeInTheDocument();
    expect(screen.getByText('高光压暗')).toBeInTheDocument();
    expect(screen.getByText('阴影提亮')).toBeInTheDocument();
    expect(screen.getByText('纹理质感')).toBeInTheDocument();
  });

  it('one-click adopts advice into tags and comments', async () => {
    render(
      <RetouchPanel
        isOpen={true}
        onClose={vi.fn()}
        isAddingPin={false}
        setIsAddingPin={vi.fn()}
      />,
    );

    const adoptBtn = screen.getByText('一键采纳到修图要求清单');
    await act(async () => {
      fireEvent.click(adoptBtn);
    });

    const annotation = useSelectionStore.getState().getAnnotation(mockPhoto.id);
    expect(annotation.comment).toContain('【AI 修图建议');
    expect(annotation.presetTags).toContain('保留真实肤色');
    expect(screen.getByText('已采纳建议至标签与附注 ✓')).toBeInTheDocument();
  });
});
