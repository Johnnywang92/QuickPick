import { useEffect } from 'react';
import { usePhotoStore } from '../store/photoStore';

export function useKeyboardShortcuts() {
  const {
    photos,
    currentIndex,
    nextPhoto,
    prevPhoto,
    setRating,
    setColorLabel,
    setPickStatus,
    isCompareMode,
    toggleCompareMode,
    exitCompareMode,
    swapComparePhotos,
    nextCompareCandidate,
    prevCompareCandidate,
    toggleFaceLoupe,
    undoLast,
    pickBurstWinner,
    resetFilter,
    activeFilter,
    selectedCamera,
    selectedLens,
  } = usePhotoStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 避免在输入框中触发
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void undoLast();
        return;
      }

      if (photos.length === 0) return;

      switch (e.key) {
        // 连拍定优 [W]：定为连拍最佳胜出并排除同组其余照片
        case 'w':
        case 'W':
          e.preventDefault();
          void pickBurstWinner(currentIndex);
          break;

        // 多脸联动特写抽屉切换 [F]
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFaceLoupe();
          break;

        // 双图分屏对比切换 [C]
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
          } else if (activeFilter !== 'all' || selectedCamera !== null || selectedLens !== null) {
            e.preventDefault();
            resetFilter();
          }
          break;

        // 翻页导航 (对比模式下微调候选片，单图模式下常规翻页)
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

        // 星级评定 (0-5)
        case '0':
          e.preventDefault();
          setRating(0);
          break;
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
          e.preventDefault();
          setRating(parseInt(e.key, 10));
          break;

        // 色标评定 (6-9)
        case '6':
          e.preventDefault();
          setColorLabel('Red');
          break;
        case '7':
          e.preventDefault();
          setColorLabel('Yellow');
          break;
        case '8':
          e.preventDefault();
          setColorLabel('Green');
          break;
        case '9':
          e.preventDefault();
          setColorLabel('Blue');
          break;

        // 采纳/排除状态标记 (P / X / U)
        case 'p':
        case 'P':
          e.preventDefault();
          setPickStatus('Pick');
          break;

        case 'x':
        case 'X':
          e.preventDefault();
          setPickStatus('Reject');
          break;

        case 'u':
        case 'U':
          e.preventDefault();
          setPickStatus('None');
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
    photos.length,
    currentIndex,
    nextPhoto,
    prevPhoto,
    setRating,
    setColorLabel,
    setPickStatus,
    isCompareMode,
    toggleCompareMode,
    exitCompareMode,
    swapComparePhotos,
    nextCompareCandidate,
    prevCompareCandidate,
    toggleFaceLoupe,
    undoLast,
    pickBurstWinner,
    resetFilter,
    activeFilter,
    selectedCamera,
    selectedLens,
  ]);
}
