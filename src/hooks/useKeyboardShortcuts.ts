import { useEffect } from 'react';
import { useAlbumStore } from '../store/albumStore';
import { useSelectionStore } from '../store/selectionStore';
import { useCompareStore } from '../store/compareStore';
import { useInsightStore } from '../store/insightStore';

export function useKeyboardShortcuts() {
  const { photos, currentIndex, nextPhoto, prevPhoto, resetFilter, jumpToFirstMatching, jumpToLastMatching } = useAlbumStore();
  const { toggleSelect, setMaybe, setSkipped, undoLast } = useSelectionStore();
  const { isCompareMode, toggleCompareMode, exitCompareMode, swapComparePhotos, nextCompareCandidate, prevCompareCandidate } = useCompareStore();
  const { toggleFaceLoupe } = useInsightStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 避免在输入框中触发
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target instanceof HTMLElement &&
          (e.target.isContentEditable ||
            e.target.closest('[contenteditable]:not([contenteditable="false"])') !== null)) ||
        document.querySelector('[role="dialog"][aria-modal="true"]')
      ) {
        return;
      }

      // 撤销操作: Cmd/Ctrl + Z
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undoLast();
        return;
      }

      if (photos.length === 0) return;

      const currentPhoto = photos[currentIndex];

      switch (e.key) {
        // 选择 / 取消选择 [空格 Space]
        case ' ':
          e.preventDefault();
          if (currentPhoto) {
            toggleSelect(currentPhoto.id);
          }
          break;

        // 加入待考虑 [M]
        case 'm':
        case 'M':
          e.preventDefault();
          if (currentPhoto) {
            setMaybe(currentPhoto.id);
          }
          break;

        // 明确标记为不选 [N]
        case 'n':
        case 'N':
          e.preventDefault();
          if (currentPhoto) {
            setSkipped(currentPhoto.id);
          }
          break;

        // 查看人脸特写抽屉 [F]
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFaceLoupe();
          break;

        // 双图分屏比对 [C]
        case 'c':
        case 'C':
          e.preventDefault();
          toggleCompareMode();
          break;

        // 对比模式下主备互换 [S]
        case 's':
        case 'S':
          if (isCompareMode) {
            e.preventDefault();
            swapComparePhotos();
          }
          break;

        // 退出对比模式 或 重置筛选 [Escape]
        case 'Escape':
          if (isCompareMode) {
            e.preventDefault();
            exitCompareMode();
          } else {
            e.preventDefault();
            resetFilter();
          }
          break;

        // 翻页导航
        case 'ArrowRight':
        case 'j':
        case 'J':
          e.preventDefault();
          if (isCompareMode) {
            nextCompareCandidate();
          } else {
            nextPhoto();
          }
          break;

        case 'ArrowLeft':
        case 'k':
        case 'K':
          e.preventDefault();
          if (isCompareMode) {
            prevCompareCandidate();
          } else {
            prevPhoto();
          }
          break;

        // 首尾快速跳转 [Home / End]
        case 'Home':
          e.preventDefault();
          jumpToFirstMatching();
          break;

        case 'End':
          e.preventDefault();
          jumpToLastMatching();
          break;

        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    photos,
    currentIndex,
    nextPhoto,
    prevPhoto,
    toggleSelect,
    setMaybe,
    setSkipped,
    undoLast,
    isCompareMode,
    toggleCompareMode,
    exitCompareMode,
    swapComparePhotos,
    nextCompareCandidate,
    prevCompareCandidate,
    toggleFaceLoupe,
    resetFilter,
    jumpToFirstMatching,
    jumpToLastMatching,
  ]);
}
