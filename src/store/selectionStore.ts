import { create } from 'zustand';
import {
  openProjectState,
  PersistenceOutcome,
  PersistedSelection,
  persistSelection,
  persistSelections,
  persistViewedPhoto,
  ProjectState,
} from '../services/tauriBridge';
import { UserSelection, SelectionState, PhotoAnnotation } from '../types/photo';
import { parseAnnotation, serializeAnnotation } from '../utils/annotationUtils';

export interface SelectionUndoChange {
  photoId: string;
  previousState: SelectionState;
  nextState: SelectionState;
}

export interface SelectionUndoItem {
  changes: SelectionUndoChange[];
  label: string;
}

export interface SelectionStats {
  viewedCount: number;
  selectedCount: number;
  maybeCount: number;
  skippedCount: number;
  unreviewedCount: number;
}

export type PersistenceStatus = 'idle' | 'saving' | 'saved' | 'error';

interface SelectionStore {
  selections: Record<string, UserSelection>;
  viewedPhotoIds: Record<string, boolean>;
  undoStack: SelectionUndoItem[];
  isUndoing: boolean;
  currentProjectId: string | null;
  persistenceStatus: PersistenceStatus;
  persistenceError: string | null;
  persistenceWarning: string | null;

  initSelections: (project: ProjectState, photoIds: string[]) => void;
  openProject: (
    folderPath: string,
    photos: Parameters<typeof openProjectState>[1],
  ) => Promise<ProjectState>;
  markAsViewed: (photoId: string) => void;
  toggleSelect: (photoId: string) => void;
  setSelectionState: (photoId: string, state: SelectionState) => void;
  setSelectionStates: (
    updates: { photoId: string; state: SelectionState }[],
    label?: string,
  ) => void;
  setMaybe: (photoId: string) => void;
  setSkipped: (photoId: string) => void;
  setNote: (photoId: string, note: string) => void;
  setAnnotation: (photoId: string, annotation: PhotoAnnotation) => void;
  getAnnotation: (photoId: string) => PhotoAnnotation;
  undoLast: () => void;
  getSelection: (photoId: string) => UserSelection;
  getStats: (totalCount: number) => SelectionStats;
  clearPersistenceError: () => void;
  clearPersistenceWarning: () => void;
  reportPersistenceError: (message: string) => void;
  reportPersistenceWarning: (message: string) => void;
}

let persistenceQueue: Promise<void> = Promise.resolve();
let pendingPersistenceCount = 0;

function asPersistedSelection(selection: UserSelection): PersistedSelection {
  return {
    photo_id: selection.photoId,
    state: selection.state,
    note: selection.note,
    updated_at: selection.updatedAt,
  };
}

function persistenceMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function enqueuePersistence(
  operation: () => Promise<PersistenceOutcome>,
  onFailure: () => void,
): void {
  pendingPersistenceCount += 1;
  useSelectionStore.setState({
    persistenceStatus: 'saving',
    persistenceError: null,
  });

  const run = () =>
    operation().then((outcome) => {
      if (outcome.backup_warning) {
        useSelectionStore.setState({
          persistenceWarning: `选择已保存，但安全备份暂时失败：${outcome.backup_warning}`,
        });
      }
    });
  persistenceQueue = persistenceQueue.then(run, run);
  void persistenceQueue.then(
    () => {
      pendingPersistenceCount = Math.max(0, pendingPersistenceCount - 1);
      if (pendingPersistenceCount === 0) {
        useSelectionStore.setState({ persistenceStatus: 'saved' });
      }
    },
    (error) => {
      pendingPersistenceCount = Math.max(0, pendingPersistenceCount - 1);
      onFailure();
      useSelectionStore.setState({
        persistenceStatus: 'error',
        persistenceError: `选片结果未能安全保存：${persistenceMessage(error)}`,
      });
    },
  );
}

export const useSelectionStore = create<SelectionStore>((set, get) => ({
  selections: {},
  viewedPhotoIds: {},
  undoStack: [],
  isUndoing: false,
  currentProjectId: null,
  persistenceStatus: 'idle',
  persistenceError: null,
  persistenceWarning: null,

  openProject: (folderPath, photos) => openProjectState(folderPath, photos),

  initSelections: (project, photoIds) => {
    const loadedSelections: Record<string, UserSelection> = {};
    for (const selection of project.selections) {
      loadedSelections[selection.photo_id] = {
        photoId: selection.photo_id,
        state: selection.state,
        note: selection.note,
        updatedAt: selection.updated_at,
      };
    }

    const now = new Date().toISOString();
    for (const photoId of photoIds) {
      if (!loadedSelections[photoId]) {
        loadedSelections[photoId] = {
          photoId,
          state: 'unreviewed',
          updatedAt: now,
        };
      }
    }

    set({
      currentProjectId: project.project_id,
      selections: loadedSelections,
      viewedPhotoIds: Object.fromEntries(
        project.viewed_photo_ids.map((photoId) => [photoId, true]),
      ),
      undoStack: [],
      persistenceStatus: 'saved',
      persistenceError: null,
      persistenceWarning: project.backup_warning
        ? `项目已打开，但安全备份暂时失败：${project.backup_warning}`
        : null,
    });
  },

  markAsViewed: (photoId) => {
    const { viewedPhotoIds, currentProjectId } = get();
    if (viewedPhotoIds[photoId] || !currentProjectId) return;

    set({ viewedPhotoIds: { ...viewedPhotoIds, [photoId]: true } });
    enqueuePersistence(
      () => persistViewedPhoto(currentProjectId, photoId),
      () => {
        const current = get().viewedPhotoIds;
        if (!current[photoId]) return;
        const next = { ...current };
        delete next[photoId];
        set({ viewedPhotoIds: next });
      },
    );
  },

  toggleSelect: (photoId) => {
    const current = get().selections[photoId]?.state || 'unreviewed';
    get().setSelectionState(photoId, current === 'selected' ? 'unreviewed' : 'selected');
  },

  setSelectionState: (photoId, state) => {
    const labels: Record<SelectionState, string> = {
      selected: '已选',
      maybe: '待考虑',
      skipped: '未选择',
      unreviewed: '未决定',
    };
    get().setSelectionStates([{ photoId, state }], `修改为 ${labels[state]}`);
  },

  setSelectionStates: (updates, label = '批量修改选择') => {
    const { selections, undoStack, currentProjectId } = get();
    if (!currentProjectId) {
      get().reportPersistenceError('项目数据库尚未就绪');
      return;
    }

    const deduplicated = new Map(updates.map((update) => [update.photoId, update.state]));
    const changes: SelectionUndoChange[] = [];
    const previousSelections: Record<string, UserSelection> = {};
    const nextSelections = { ...selections };
    const updatedRecords: UserSelection[] = [];

    for (const [photoId, state] of deduplicated) {
      const previous = selections[photoId] || {
        photoId,
        state: 'unreviewed' as SelectionState,
        updatedAt: '',
      };
      if (previous.state === state) continue;
      get().markAsViewed(photoId);
      const updated: UserSelection = {
        ...previous,
        state,
        updatedAt: new Date().toISOString(),
      };
      previousSelections[photoId] = previous;
      nextSelections[photoId] = updated;
      updatedRecords.push(updated);
      changes.push({ photoId, previousState: previous.state, nextState: state });
    }

    if (changes.length === 0) return;
    const undoItem: SelectionUndoItem = { changes, label };

    set({
      selections: nextSelections,
      undoStack: [...undoStack.slice(-50), undoItem],
    });

    enqueuePersistence(
      () => persistSelections(currentProjectId, updatedRecords.map(asPersistedSelection)),
      () => {
        const rolledBack = { ...get().selections };
        for (const updated of updatedRecords) {
          if (rolledBack[updated.photoId]?.updatedAt === updated.updatedAt) {
            rolledBack[updated.photoId] = previousSelections[updated.photoId];
          }
        }
        set({
          selections: rolledBack,
          undoStack: get().undoStack.filter((item) => item !== undoItem),
        });
      },
    );
  },

  setMaybe: (photoId) => get().setSelectionState(photoId, 'maybe'),
  setSkipped: (photoId) => get().setSelectionState(photoId, 'skipped'),

  setNote: (photoId, note) => {
    const { selections, currentProjectId } = get();
    if (!currentProjectId) {
      get().reportPersistenceError('项目数据库尚未就绪');
      return;
    }
    const previous = selections[photoId] || {
      photoId,
      state: 'unreviewed' as SelectionState,
      updatedAt: '',
    };
    const updated: UserSelection = {
      ...previous,
      note,
      updatedAt: new Date().toISOString(),
    };
    set({ selections: { ...selections, [photoId]: updated } });
    enqueuePersistence(
      () => persistSelection(currentProjectId, asPersistedSelection(updated)),
      () => {
        if (get().selections[photoId]?.updatedAt !== updated.updatedAt) return;
        set({ selections: { ...get().selections, [photoId]: previous } });
      },
    );
  },

  setAnnotation: (photoId, annotation) => {
    const note = serializeAnnotation(annotation);
    get().setNote(photoId, note);
  },

  getAnnotation: (photoId) => {
    const selection = get().selections[photoId];
    return parseAnnotation(selection?.note);
  },

  undoLast: () => {
    const { undoStack, selections, currentProjectId } = get();
    if (undoStack.length === 0 || !currentProjectId) return;
    const last = undoStack[undoStack.length - 1];
    const beforeUndo: Record<string, UserSelection> = {};
    const revertedRecords: UserSelection[] = [];
    const revertedSelections = { ...selections };
    for (const change of last.changes) {
      const current = selections[change.photoId] || {
        photoId: change.photoId,
        state: change.nextState,
        updatedAt: '',
      };
      const reverted: UserSelection = {
        ...current,
        state: change.previousState,
        updatedAt: new Date().toISOString(),
      };
      beforeUndo[change.photoId] = current;
      revertedSelections[change.photoId] = reverted;
      revertedRecords.push(reverted);
    }
    set({
      isUndoing: true,
      selections: revertedSelections,
      undoStack: undoStack.slice(0, -1),
    });
    enqueuePersistence(
      () => persistSelections(currentProjectId, revertedRecords.map(asPersistedSelection)),
      () => {
        const restored = { ...get().selections };
        for (const reverted of revertedRecords) {
          if (restored[reverted.photoId]?.updatedAt === reverted.updatedAt) {
            restored[reverted.photoId] = beforeUndo[reverted.photoId];
          }
        }
        set({ selections: restored, undoStack: [...get().undoStack, last] });
      },
    );
    set({ isUndoing: false });
  },

  getSelection: (photoId) =>
    get().selections[photoId] || {
      photoId,
      state: 'unreviewed',
      updatedAt: '',
    },

  getStats: (totalCount) => {
    const { selections, viewedPhotoIds } = get();
    let selectedCount = 0;
    let maybeCount = 0;
    let skippedCount = 0;
    Object.values(selections).forEach((selection) => {
      if (selection.state === 'selected') selectedCount += 1;
      else if (selection.state === 'maybe') maybeCount += 1;
      else if (selection.state === 'skipped') skippedCount += 1;
    });
    const viewedCount = Object.keys(viewedPhotoIds).length;
    return {
      viewedCount,
      selectedCount,
      maybeCount,
      skippedCount,
      unreviewedCount: Math.max(0, totalCount - viewedCount),
    };
  },

  clearPersistenceError: () => set({ persistenceError: null, persistenceStatus: 'idle' }),
  clearPersistenceWarning: () => set({ persistenceWarning: null }),
  reportPersistenceError: (message) =>
    set({ persistenceStatus: 'error', persistenceError: message }),
  reportPersistenceWarning: (message) => set({ persistenceWarning: message }),
}));
