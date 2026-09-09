import { fireEvent, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { useAlbumStore } from '../store/albumStore';
import { useSelectionStore } from '../store/selectionStore';
import { photoFixture } from '../test/photoFixture';

describe('useKeyboardShortcuts', () => {
  const toggleSelect = vi.fn();

  beforeEach(() => {
    toggleSelect.mockReset();
    useAlbumStore.setState({ photos: [photoFixture('current')], currentIndex: 0 });
    useSelectionStore.setState({ toggleSelect });
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
});
