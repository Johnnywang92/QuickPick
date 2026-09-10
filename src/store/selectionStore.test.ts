import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSelectionStore } from './selectionStore';
import { parseAnnotation } from '../utils/annotationUtils';

const bridgeMocks = vi.hoisted(() => ({
  openProjectState: vi.fn(),
  persistSelection: vi.fn().mockResolvedValue({}),
  persistSelections: vi.fn().mockResolvedValue({}),
  persistViewedPhoto: vi.fn().mockResolvedValue({}),
}));

vi.mock('../services/tauriBridge', () => bridgeMocks);

describe('selectionStore', () => {
  beforeEach(() => {
    bridgeMocks.persistSelection.mockResolvedValue({});
    bridgeMocks.persistSelections.mockResolvedValue({});
    bridgeMocks.persistViewedPhoto.mockResolvedValue({});
    useSelectionStore.setState({
      selections: {
        left: { photoId: 'left', state: 'unreviewed', updatedAt: '' },
        right: { photoId: 'right', state: 'skipped', updatedAt: '' },
      },
      viewedPhotoIds: {},
      undoStack: [],
      isUndoing: false,
      currentProjectId: 'project',
      persistenceStatus: 'saved',
      persistenceError: null,
      persistenceWarning: null,
    });
  });

  it('counts viewed and all explicit selection states independently', () => {
    useSelectionStore.setState({
      selections: {
        one: { photoId: 'one', state: 'selected', updatedAt: '' },
        two: { photoId: 'two', state: 'maybe', updatedAt: '' },
        three: { photoId: 'three', state: 'skipped', updatedAt: '' },
        four: { photoId: 'four', state: 'unreviewed', updatedAt: '' },
      },
      viewedPhotoIds: { one: true, four: true },
    });

    expect(useSelectionStore.getState().getStats(5)).toEqual({
      viewedCount: 2,
      selectedCount: 1,
      maybeCount: 1,
      skippedCount: 1,
      unreviewedCount: 3,
    });
  });

  it('persists a two-photo decision and its undo as atomic batches', async () => {
    useSelectionStore.getState().setSelectionStates(
      [
        { photoId: 'left', state: 'selected' },
        { photoId: 'right', state: 'selected' },
      ],
      '两张都选',
    );

    expect(useSelectionStore.getState().selections.left.state).toBe('selected');
    expect(useSelectionStore.getState().selections.right.state).toBe('selected');
    expect(useSelectionStore.getState().undoStack).toHaveLength(1);
    await vi.waitFor(() => expect(bridgeMocks.persistSelections).toHaveBeenCalledTimes(1));
    expect(bridgeMocks.persistSelections.mock.calls[0][1]).toHaveLength(2);

    useSelectionStore.getState().undoLast();
    expect(useSelectionStore.getState().selections.left.state).toBe('unreviewed');
    expect(useSelectionStore.getState().selections.right.state).toBe('skipped');
    await vi.waitFor(() => expect(bridgeMocks.persistSelections).toHaveBeenCalledTimes(2));
    expect(bridgeMocks.persistSelections.mock.calls[1][1]).toHaveLength(2);
  });

  it('rolls back every optimistic change when the database batch fails', async () => {
    bridgeMocks.persistSelections.mockRejectedValueOnce(new Error('database is read-only'));

    useSelectionStore.getState().setSelectionStates(
      [
        { photoId: 'left', state: 'selected' },
        { photoId: 'right', state: 'maybe' },
      ],
      '比较选择',
    );
    expect(useSelectionStore.getState().selections.left.state).toBe('selected');
    expect(useSelectionStore.getState().selections.right.state).toBe('maybe');

    await vi.waitFor(() => expect(useSelectionStore.getState().persistenceStatus).toBe('error'));
    expect(useSelectionStore.getState().selections.left.state).toBe('unreviewed');
    expect(useSelectionStore.getState().selections.right.state).toBe('skipped');
    expect(useSelectionStore.getState().undoStack).toHaveLength(0);
    expect(useSelectionStore.getState().persistenceError).toContain('database is read-only');
  });

  it('updates lastTriageFeedback when setting individual selection state and undoing', () => {
    useSelectionStore.getState().setSelectionState('left', 'selected');
    expect(useSelectionStore.getState().lastTriageFeedback).toMatchObject({
      photoId: 'left',
      state: 'selected',
    });

    useSelectionStore.getState().undoLast();
    expect(useSelectionStore.getState().lastTriageFeedback).toMatchObject({
      photoId: 'left',
      state: 'unreviewed',
    });
  });

  it('renames and removes a tag across existing photo annotations', async () => {
    useSelectionStore.setState({
      selections: {
        left: {
          photoId: 'left', state: 'selected', updatedAt: '',
          note: JSON.stringify({ comment: '保留备注', presetTags: ['要修图', '封面'] }),
        },
        right: {
          photoId: 'right', state: 'selected', updatedAt: '',
          note: JSON.stringify({ presetTags: ['要修图'] }),
        },
      },
    });

    useSelectionStore.getState().replaceTagAcrossSelections('要修图', '精细修图');
    expect(parseAnnotation(useSelectionStore.getState().selections.left.note).presetTags).toEqual(['精细修图', '封面']);
    expect(parseAnnotation(useSelectionStore.getState().selections.left.note).comment).toBe('保留备注');
    expect(parseAnnotation(useSelectionStore.getState().selections.right.note).presetTags).toEqual(['精细修图']);
    await vi.waitFor(() => expect(bridgeMocks.persistSelections).toHaveBeenCalled());

    useSelectionStore.getState().replaceTagAcrossSelections('精细修图', null);
    expect(parseAnnotation(useSelectionStore.getState().selections.left.note).presetTags).toEqual(['封面']);
    expect(parseAnnotation(useSelectionStore.getState().selections.right.note).presetTags).toEqual([]);
  });
});
