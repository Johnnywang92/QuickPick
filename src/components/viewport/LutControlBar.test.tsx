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
    expect(screen.getByText('Kodak Portra 400')).toBeInTheDocument();
    expect(screen.getByText('Fuji Classic Chrome')).toBeInTheDocument();
    expect(screen.getByText('CCD Vintage Digicam')).toBeInTheDocument();
  });

  it('selects a preset from the popover', () => {
    render(<LutControlBar />);
    // Open
    fireEvent.click(screen.getByText('3D LUT 胶片预览'));

    // Select Kodak Portra 400
    fireEvent.click(screen.getByText('Kodak Portra 400'));
    expect(useLutStore.getState().activeLutId).toBe('kodak_portra_400');
    expect(useLutStore.getState().isEnabled).toBe(true);

    // Header now reflects selected LUT
    expect(screen.getByText(/Kodak Portra 400 \(85%\)/)).toBeInTheDocument();
  });

  it('adjusts intensity slider', () => {
    useLutStore.setState({ activeLutId: 'kodak_portra_400', isPanelOpen: true });
    render(<LutControlBar />);

    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '0.6' } });
    expect(useLutStore.getState().intensity).toBe(0.6);
  });

  it('triggers bypass comparison on mouse down and up', () => {
    useLutStore.setState({ activeLutId: 'kodak_portra_400' });
    render(<LutControlBar />);

    const compareBtn = screen.getByText('按住对比');
    fireEvent.mouseDown(compareBtn);
    expect(useLutStore.getState().isBypassComparing).toBe(true);

    fireEvent.mouseUp(compareBtn);
    expect(useLutStore.getState().isBypassComparing).toBe(false);
  });

  it('toggles enabled state', () => {
    useLutStore.setState({ activeLutId: 'kodak_portra_400', isEnabled: true });
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
    fireEvent.click(screen.getByText('Kodak Portra 400'));

    expect(useLutStore.getState().photoLuts['p1']).toEqual({
      lutId: 'kodak_portra_400',
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
    fireEvent.click(screen.getByText('Kodak Portra 400'));

    // Click batch apply to selected (2 photos)
    const applySelectedBtn = screen.getByText(/应用到已选 \(2\)/);
    fireEvent.click(applySelectedBtn);

    expect(useLutStore.getState().photoLuts['p2']).toEqual({
      lutId: 'kodak_portra_400',
      intensity: 0.85,
    });
    expect(useLutStore.getState().photoLuts['p3']).toEqual({
      lutId: 'kodak_portra_400',
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

    const fujiPreset = screen.getByText('Fuji Classic Chrome');
    fireEvent.mouseEnter(fujiPreset);

    expect(useLutStore.getState().hoverLutId).toBe('fuji_classic_chrome');
    expect(screen.getByText(/Fuji Classic Chrome \(预览中\)/)).toBeInTheDocument();

    fireEvent.mouseLeave(fujiPreset);
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
