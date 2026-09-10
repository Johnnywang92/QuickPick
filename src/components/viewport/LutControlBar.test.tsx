import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LutControlBar } from './LutControlBar';
import { useLutStore } from '../../store/lutStore';

describe('LutControlBar', () => {
  beforeEach(() => {
    localStorage.clear();
    useLutStore.setState({
      activeLutId: null,
      isEnabled: true,
      intensity: 0.85,
      isBypassComparing: false,
      isPanelOpen: false,
      customLuts: [],
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
});
