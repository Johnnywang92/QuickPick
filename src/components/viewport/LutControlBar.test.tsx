import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LutControlBar } from './LutControlBar';
import { useLutStore } from '../../store/lutStore';
import { useAlbumStore } from '../../store/albumStore';
import { useSelectionStore } from '../../store/selectionStore';

describe('LutControlBar', () => {
  beforeEach(() => {
    localStorage.clear();
    useAlbumStore.setState({ photos: [], currentIndex: 0 });
    useSelectionStore.setState({ selections: {} });
    useLutStore.setState({
      activeLutId: null,
      isEnabled: true,
      intensity: 0.85,
      isBypassComparing: false,
      isPanelOpen: false,
      customLuts: [],
      photoLuts: {},
    });
  });

  it('renders default button and opens popover on click', () => {
    render(<LutControlBar />);
    const trigger = screen.getByText('3D LUT 胶片预览');
    expect(trigger).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByText('3D LUT 胶片色彩预览')).toBeInTheDocument();
    expect(screen.getByText('暖金人像')).toBeInTheDocument();
    expect(screen.getByText('纪实青调')).toBeInTheDocument();
    expect(screen.getByText('千禧复古 CCD')).toBeInTheDocument();
  });

  it('selects a preset from the popover', () => {
    render(<LutControlBar />);
    // Open
    fireEvent.click(screen.getByText('3D LUT 胶片预览'));

    // Select 暖金人像
    fireEvent.click(screen.getByText('暖金人像'));
    expect(useLutStore.getState().activeLutId).toBe('warm_portrait');
    expect(useLutStore.getState().isEnabled).toBe(true);

    // Header now reflects selected LUT
    expect(screen.getByText(/暖金人像 \(85%\)/)).toBeInTheDocument();
  });

  it('adjusts intensity slider', () => {
    useLutStore.setState({ activeLutId: 'warm_portrait', isPanelOpen: true });
    render(<LutControlBar />);

    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '0.6' } });
    expect(useLutStore.getState().intensity).toBe(0.6);
  });

  it('triggers bypass comparison on mouse down and up', () => {
    useLutStore.setState({ activeLutId: 'warm_portrait' });
    render(<LutControlBar />);

    const compareBtn = screen.getByText('按住对比');
    fireEvent.mouseDown(compareBtn);
    expect(useLutStore.getState().isBypassComparing).toBe(true);

    fireEvent.mouseUp(compareBtn);
    expect(useLutStore.getState().isBypassComparing).toBe(false);
  });

  it('toggles enabled state', () => {
    useLutStore.setState({ activeLutId: 'warm_portrait', isEnabled: true });
    render(<LutControlBar />);

    const toggleBtn = screen.getByText('开');
    fireEvent.click(toggleBtn);
    expect(useLutStore.getState().isEnabled).toBe(false);
  });

  it('assigns LUT to the currently active photo and keeps other photos unstyled', () => {
    const photo1 = { id: 'p1', filename: 'img1.jpg', path: '/p1.jpg' } as any;
    const photo2 = { id: 'p2', filename: 'img2.jpg', path: '/p2.jpg' } as any;
    useAlbumStore.setState({ photos: [photo1, photo2], currentIndex: 0 });

    const { rerender } = render(<LutControlBar />);
    fireEvent.click(screen.getByText('3D LUT 胶片预览'));
    fireEvent.click(screen.getByText('暖金人像'));

    expect(useLutStore.getState().photoLuts['p1']).toEqual({
      lutId: 'warm_portrait',
      intensity: 0.85,
    });
    expect(useLutStore.getState().photoLuts['p2']).toBeUndefined();

    // Switch to photo 2
    useAlbumStore.setState({ currentIndex: 1 });
    rerender(<LutControlBar />);
    expect(screen.getByText('3D LUT 胶片预览')).toBeInTheDocument();
  });

  it('batch applies LUT to selected photos and all photos', () => {
    const photo1 = { id: 'p1', filename: 'img1.jpg', path: '/p1.jpg' } as any;
    const photo2 = { id: 'p2', filename: 'img2.jpg', path: '/p2.jpg' } as any;
    const photo3 = { id: 'p3', filename: 'img3.jpg', path: '/p3.jpg' } as any;

    useAlbumStore.setState({ photos: [photo1, photo2, photo3], currentIndex: 0 });
    useSelectionStore.setState({
      selections: {
        p2: { photoId: 'p2', state: 'selected', note: '', updatedAt: '' },
        p3: { photoId: 'p3', state: 'selected', note: '', updatedAt: '' },
      },
    });

    render(<LutControlBar />);
    fireEvent.click(screen.getByText('3D LUT 胶片预览'));
    fireEvent.click(screen.getByText('暖金人像'));

    // Click batch apply to selected (2 photos)
    const applySelectedBtn = screen.getByText(/应用到已选 \(2\)/);
    fireEvent.click(applySelectedBtn);

    expect(useLutStore.getState().photoLuts['p2']).toEqual({
      lutId: 'warm_portrait',
      intensity: 0.85,
    });
    expect(useLutStore.getState().photoLuts['p3']).toEqual({
      lutId: 'warm_portrait',
      intensity: 0.85,
    });

    // Clear all
    const clearBtn = screen.getByText(/清除全部照片调色/);
    fireEvent.click(clearBtn);
    expect(Object.keys(useLutStore.getState().photoLuts).length).toBe(0);
  });

  it('triggers hover quick-peek preview on mouse enter and leaves cleanly', () => {
    render(<LutControlBar />);
    fireEvent.click(screen.getByText('3D LUT 胶片预览'));

    const docPreset = screen.getByText('纪实青调');
    fireEvent.mouseEnter(docPreset);

    expect(useLutStore.getState().hoverLutId).toBe('documentary_cyan');
    expect(screen.getByText(/纪实青调 \(预览中\)/)).toBeInTheDocument();

    fireEvent.mouseLeave(docPreset);
    expect(useLutStore.getState().hoverLutId).toBeNull();
    expect(screen.queryByText(/预览中/)).not.toBeInTheDocument();

    const rawPreset = screen.getByText(/原片直出/);
    fireEvent.mouseEnter(rawPreset);
    expect(useLutStore.getState().hoverLutId).toBe('__bypass__');
    expect(screen.getByText(/原片直出 \(预览中\)/)).toBeInTheDocument();

    fireEvent.mouseLeave(rawPreset);
    expect(useLutStore.getState().hoverLutId).toBeNull();
  });
});
