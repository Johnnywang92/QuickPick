import { act, fireEvent, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useAlbumStore } from '../store/albumStore';
import { useSelectionStore } from '../store/selectionStore';
import { useCompareStore } from '../store/compareStore';
import { photoFixture } from '../test/photoFixture';

describe('useKeyboardShortcuts', () => {
  const toggleSelect = vi.fn();

  beforeEach(() => {
    toggleSelect.mockReset();
    useAlbumStore.setState({ photos: [photoFixture('current')], currentIndex: 0 });
    useSelectionStore.setState({ toggleSelect });
    useCompareStore.setState({ isPkMode: false, isCompareMode: false });
  });

  it('does not trigger selection while typing in editable controls', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.append(input, textarea, select, editable);
    renderHook(() => useKeyboardShortcuts());

    for (const target of [input, textarea, select, editable]) {
      fireEvent.keyDown(target, { key: ' ' });
    }

    expect(toggleSelect).not.toHaveBeenCalled();
  });

  it('pauses global shortcuts while a modal dialog is open', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    renderHook(() => useKeyboardShortcuts());

    fireEvent.keyDown(window, { key: ' ' });

    expect(toggleSelect).not.toHaveBeenCalled();
  });

  it('triggers selection from the main workspace', () => {
    renderHook(() => useKeyboardShortcuts());

    fireEvent.keyDown(window, { key: ' ' });

    expect(toggleSelect).toHaveBeenCalledWith('current');
  });

  it('pauses shortcuts only while PK mode is active', () => {
    renderHook(() => useKeyboardShortcuts());

    act(() => useCompareStore.setState({ isPkMode: true }));
    fireEvent.keyDown(window, { key: ' ' });
    expect(toggleSelect).not.toHaveBeenCalled();

    act(() => useCompareStore.setState({ isPkMode: false }));
    fireEvent.keyDown(window, { key: ' ' });
    expect(toggleSelect).toHaveBeenCalledWith('current');
  });

  it('toggles tag and auto-selects with number key 1', () => {
    const setAnnotation = vi.fn();
    const setSelectionState = vi.fn();
    useSelectionStore.setState({
      getAnnotation: () => ({ comment: '', presetTags: [], pins: [] }),
      setAnnotation,
      getSelection: () => ({ photoId: 'current', state: 'unreviewed', updatedAt: '' }),
      setSelectionState,
    });
    renderHook(() => useKeyboardShortcuts());

    fireEvent.keyDown(window, { key: '1' });

    expect(setAnnotation).toHaveBeenCalled();
    expect(setSelectionState).toHaveBeenCalledWith('current', 'selected');
  });

  it('navigates with ArrowDown and ArrowUp keys', () => {
    const nextPhoto = vi.fn();
    const prevPhoto = vi.fn();
    useAlbumStore.setState({ nextPhoto, prevPhoto });

    renderHook(() => useKeyboardShortcuts());

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(nextPhoto).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(prevPhoto).toHaveBeenCalledTimes(1);
  });
});

