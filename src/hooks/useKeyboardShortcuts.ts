import { useEffect, useRef } from 'react';
import { useAlbumStore } from '../store/albumStore';
import { useSelectionStore } from '../store/selectionStore';
import { useCompareStore } from '../store/compareStore';
import { useInsightStore } from '../store/insightStore';
import { useTagStore } from '../store/tagStore';
import { useLutStore } from '../store/lutStore';

interface KeyboardShortcutsOptions {
  onToggleRetouch?: () => void;
}

export function useKeyboardShortcuts(options?: KeyboardShortcutsOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

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

      const {
        isPkMode,
        isCompareMode,
        startBurstPk,
        toggleCompareMode,
        exitCompareMode,
        swapComparePhotos,
        nextCompareCandidate,
        prevCompareCandidate,
      } = useCompareStore.getState();

      // 如果处于 PK 对决全屏模式，将按键交由对决状态机接管
      if (isPkMode) {
        return;
      }

      // 撤销操作: Cmd/Ctrl + Z
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        useSelectionStore.getState().undoLast();
        return;
      }

      const {
        photos,
        currentIndex,
        nextPhoto,
        prevPhoto,
        resetFilter,
        jumpToFirstMatching,
        jumpToLastMatching,
      } = useAlbumStore.getState();

      if (photos.length === 0) return;

      const currentPhoto = photos[currentIndex];
      const {
        toggleSelect,
        setMaybe,
        setSkipped,
        getAnnotation,
        setAnnotation,
        getSelection,
        setSelectionState,
      } = useSelectionStore.getState();

      switch (e.key) {
        // 连拍极速对决 [P]
        case 'p':
        case 'P':
          if (!isCompareMode && currentPhoto?.burstGroupId) {
            e.preventDefault();
            startBurstPk(currentPhoto.burstGroupId);
          }
          break;

        // 修图与批注要求 [R]
        case 'r':
        case 'R':
          if (!isCompareMode) {
            e.preventDefault();
            optionsRef.current?.onToggleRetouch?.();
          }
          break;

        // 3D LUT 胶片调色开关 [L]
        case 'l':
        case 'L': {
          e.preventDefault();
          const { activeLutId, setActiveLutId, toggleEnabled } = useLutStore.getState();
          if (!activeLutId) {
            setActiveLutId('kodak_portra_400');
          } else {
            toggleEnabled();
          }
          break;
        }

        // 黑白影调检查模式 [B]
        case 'b':
        case 'B': {
          e.preventDefault();
          const { activeLutId, isEnabled, setActiveLutId, toggleEnabled } = useLutStore.getState();
          if (activeLutId === 'leica_monochrome' && isEnabled) {
            toggleEnabled();
          } else {
            setActiveLutId('leica_monochrome');
          }
          break;
        }

        // 按住瞬时旁路对比原片 [\]
        case '\\': {
          e.preventDefault();
          useLutStore.getState().setIsBypassComparing(true);
          break;
        }

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

        // 快捷数字键 1~5 对应前 5 个高频标签打标
        case '1':
        case '2':
        case '3':
        case '4':
        case '5': {
          if (currentPhoto && !isCompareMode) {
            const index = parseInt(e.key, 10) - 1;
            const availableTags = useTagStore.getState().availableTags;
            const tag = availableTags[index];
            if (tag) {
              e.preventDefault();
              const ann = getAnnotation(currentPhoto.id);
              const active = ann.presetTags || [];
              const next = active.includes(tag)
                ? active.filter((t) => t !== tag)
                : [...active, tag];
              setAnnotation(currentPhoto.id, {
                ...ann,
                presetTags: next,
              });
              if (getSelection(currentPhoto.id).state === 'unreviewed' && next.length > 0) {
                setSelectionState(currentPhoto.id, 'selected');
              }
            }
          }
          break;
        }

        // 查看人脸特写抽屉 [F]
        case 'f':
        case 'F':
          e.preventDefault();
          useInsightStore.getState().toggleFaceLoupe();
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

        // 翻页导航: 支持左右及上下按键 (← / → / ↑ / ↓ 或 K / J)
        case 'ArrowRight':
        case 'ArrowDown':
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
        case 'ArrowUp':
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

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === '\\') {
        useLutStore.getState().setIsBypassComparing(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);
}
