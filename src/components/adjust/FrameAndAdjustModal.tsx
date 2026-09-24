import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAlbumStore } from '../../store/albumStore';
import { usePreviewStore } from '../../store/previewStore';
import { useAdjustStore } from '../../store/adjustStore';
import { useSelectionStore } from '../../store/selectionStore';
import {
  renderFramedPhotoCanvas,
  copyCanvasToClipboard,
  downloadCanvasAsImage,
} from '../../utils/frameRenderer';
import { calculateAutoTone } from '../../utils/autoTone';
import { isAdjustmentsNoop } from '../../utils/adjustEngine';
import { FrameTemplate, DEFAULT_ADJUSTMENTS } from '../../types/adjust';
import {
  X,
  Sliders,
  Frame,
  Copy,
  Check,
  Download,
  RotateCw,
  SunMedium,
  RefreshCw,
  CheckCheck,
  Smartphone,
  Camera,
  Eye,
  Sparkles,
  ArrowRightLeft,
  Stamp,
  Type,
  Image as ImageIcon,
  Trash2,
  Grid3X3,
  Film,
  Upload,
} from 'lucide-react';
import clsx from 'clsx';
import { shareCustomImagesViaAirDrop } from '../../services/tauriBridge';
import { useLutStore } from '../../store/lutStore';
import { BUILTIN_LUTS } from '../../utils/lutPresets';

export const FrameAndAdjustModal: React.FC = () => {
  const {
    isModalOpen,
    setIsModalOpen,
    activeTab,
    setActiveTab,
    frameConfig,
    updateFrameConfig,
    setPhotoAdjustments,
    resetPhotoAdjustments,
    batchApplyAdjustments,
    copyCurrentAdjustments,
    pasteAdjustments,
    copiedAdjustments,
    watermarkConfig,
    updateWatermarkConfig,
    resetWatermarkConfig,
  } = useAdjustStore();

  const { photos, currentIndex } = useAlbumStore();
  const { currentPreviewUrl } = usePreviewStore();
  const { selections } = useSelectionStore();

  const currentPhoto = photos[currentIndex];
  const currentPhotoId = currentPhoto?.id;

  const currentAdjustmentsFromStore = useAdjustStore(
    (state) => (currentPhotoId ? state.photoAdjustments[currentPhotoId] : undefined),
  );
  const photoAdjustments = currentAdjustmentsFromStore || DEFAULT_ADJUSTMENTS;

  const activeLutId = useLutStore((state) => state.activeLutId);
  const photoLuts = useLutStore((state) => state.photoLuts);
  const customLuts = useLutStore((state) => state.customLuts);
  const lutIntensity = useLutStore((state) => state.intensity);
  const setPhotoLut = useLutStore((state) => state.setPhotoLut);
  const clearPhotoLut = useLutStore((state) => state.clearPhotoLut);
  const getCustomLutData = useLutStore((state) => state.getCustomLutData);
  const importCubeContent = useLutStore((state) => state.importCubeContent);
  const removeCustomLut = useLutStore((state) => state.removeCustomLut);
  const batchApplyLut = useLutStore((state) => state.batchApplyLut);
  const clearAllPhotoLuts = useLutStore((state) => state.clearAllPhotoLuts);
  const cubeInputRef = useRef<HTMLInputElement>(null);

  const currentPhotoLut = currentPhoto ? photoLuts[currentPhoto.id] : null;
  const effectiveLutId = currentPhoto
    ? currentPhotoLut !== undefined
      ? currentPhotoLut?.lutId ?? null
      : activeLutId
    : activeLutId;
  const effectiveLutIntensity = currentPhoto
    ? currentPhotoLut
      ? currentPhotoLut.intensity
      : lutIntensity
    : lutIntensity;

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState(false);
  const [airdropSuccess, setAirdropSuccess] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isComparingBefore, setIsComparingBefore] = useState(false);

  // 左右分屏对比模式
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const splitBeforeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentRenderedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const cachedImageRef = useRef<{ url: string; img: HTMLImageElement } | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2400);
  }, []);

  const handleCubeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        try {
          const newId = importCubeContent(content, file.name);
          if (currentPhoto) {
            setPhotoLut(currentPhoto.id, newId, effectiveLutIntensity);
          }
          showToast(`已成功导入胶片 LUT: ${file.name}`);
        } catch (err) {
          alert(`导入 .cube 文件失败: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleApplyLutToSelected = () => {
    if (!effectiveLutId || selectedPhotoIds.length === 0) return;
    batchApplyLut(selectedPhotoIds, effectiveLutId, effectiveLutIntensity);
    showToast(`已将当前胶片风格同步应用至 ${selectedPhotoIds.length} 张已选照片`);
  };

  const handleApplyLutToAll = () => {
    if (!effectiveLutId || photos.length === 0) return;
    batchApplyLut(photos.map((p) => p.id), effectiveLutId, effectiveLutIntensity);
    showToast(`已将当前胶片风格同步应用至全库 ${photos.length} 张照片`);
  };

  const handleClearAllLuts = () => {
    clearAllPhotoLuts();
    showToast('已清空全库所有照片的胶片 LUT 风格');
  };

  // 处理 Logo 上传
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('Logo 图片大小请勿超过 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      if (result) {
        updateWatermarkConfig({ logoDataUrl: result });
        showToast('Logo 图片上传成功！');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // 渲染相框与调色预览
  useEffect(() => {
    if (!isModalOpen || !currentPhoto || !currentPreviewUrl) return;

    let isCancelled = false;

    const renderWithImage = async (img: HTMLImageElement) => {
      try {
        setIsRendering(true);
        setPreviewError(null);
        loadedImageRef.current = img;

        const effectiveAdjustments = isComparingBefore
          ? { ...DEFAULT_ADJUSTMENTS, rotation: photoAdjustments.rotation }
          : photoAdjustments;

        const effectiveConfig = isComparingBefore
          ? { ...frameConfig, includeAdjustments: false }
          : frameConfig;

        const effectiveLutConfig = {
          lutId: isComparingBefore ? null : effectiveLutId,
          intensity: effectiveLutIntensity,
          customData: effectiveLutId ? getCustomLutData(effectiveLutId) : null,
        };

        const canvas = await renderFramedPhotoCanvas(
          img,
          img.naturalWidth || 1920,
          img.naturalHeight || 1280,
          currentPhoto,
          effectiveConfig,
          effectiveAdjustments,
          1600,
          isComparingBefore ? undefined : watermarkConfig,
          effectiveLutConfig,
        );

        if (isCancelled) return;
        currentRenderedCanvasRef.current = canvas;

        const target = previewCanvasRef.current;
        if (target) {
          target.width = canvas.width;
          target.height = canvas.height;
          const ctx = target.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, target.width, target.height);
            ctx.drawImage(canvas, 0, 0);
          }
        }

        // 若开启左右分屏对比，同时渲染 Before 原图层并同步到 splitBeforeCanvasRef
        if (isSplitMode) {
          const beforeCanvas = await renderFramedPhotoCanvas(
            img,
            img.naturalWidth || 1920,
            img.naturalHeight || 1280,
            currentPhoto,
            { ...frameConfig, includeAdjustments: false },
            { ...DEFAULT_ADJUSTMENTS, rotation: photoAdjustments.rotation },
            1600,
            undefined,
          );
          if (isCancelled) return;
          const beforeTarget = splitBeforeCanvasRef.current;
          if (beforeTarget) {
            beforeTarget.width = beforeCanvas.width;
            beforeTarget.height = beforeCanvas.height;
            const bCtx = beforeTarget.getContext('2d');
            if (bCtx) {
              bCtx.clearRect(0, 0, beforeTarget.width, beforeTarget.height);
              bCtx.drawImage(beforeCanvas, 0, 0);
            }
          }
        }
      } catch (err) {
        if (!isCancelled) {
          setPreviewError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!isCancelled) {
          setIsRendering(false);
        }
      }
    };

    if (cachedImageRef.current && cachedImageRef.current.url === currentPreviewUrl) {
      void renderWithImage(cachedImageRef.current.img);
    } else {
      setIsRendering(true);
      setPreviewError(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = currentPreviewUrl;
      img.onload = () => {
        if (isCancelled) return;
        cachedImageRef.current = { url: currentPreviewUrl, img };
        void renderWithImage(img);
      };
      img.onerror = () => {
        if (!isCancelled) {
          setPreviewError('加载预览图失败');
          setIsRendering(false);
        }
      };
    }

    return () => {
      isCancelled = true;
    };
  }, [
    isModalOpen,
    currentPhoto,
    currentPreviewUrl,
    frameConfig,
    photoAdjustments,
    isComparingBefore,
    isSplitMode,
    watermarkConfig,
    effectiveLutId,
    effectiveLutIntensity,
    getCustomLutData,
  ]);

  // 分屏拖拽交互计算
  const updateSplitFromPointer = useCallback((clientX: number) => {
    const el = previewCanvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0.02, Math.min(0.98, (clientX - rect.left) / rect.width));
    setSplitRatio(ratio);
  }, []);

  const handleSplitPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDraggingSplit(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    updateSplitFromPointer(e.clientX);
  };

  const handleSplitPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingSplit) return;
    e.preventDefault();
    updateSplitFromPointer(e.clientX);
  };

  const handleSplitPointerUp = (e: React.PointerEvent) => {
    if (isDraggingSplit) {
      setIsDraggingSplit(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  // 获取导出级高清相框画布（优先 2560px 高清画布，降级使用当前预览画布）
  const getHighResRenderedCanvas = useCallback(
    async (maxEdge = 2560): Promise<HTMLCanvasElement> => {
      if (loadedImageRef.current && loadedImageRef.current.complete && currentPhoto) {
        return await renderFramedPhotoCanvas(
          loadedImageRef.current,
          loadedImageRef.current.naturalWidth || 1920,
          loadedImageRef.current.naturalHeight || 1280,
          currentPhoto,
          frameConfig,
          photoAdjustments,
          maxEdge,
          watermarkConfig,
          {
            lutId: effectiveLutId,
            intensity: effectiveLutIntensity,
            customData: effectiveLutId ? getCustomLutData(effectiveLutId) : null,
          },
        );
      }
      if (currentRenderedCanvasRef.current) {
        return currentRenderedCanvasRef.current;
      }
      throw new Error('相框尚未渲染就绪');
    },
    [
      currentPhoto,
      frameConfig,
      photoAdjustments,
      watermarkConfig,
      effectiveLutId,
      effectiveLutIntensity,
      getCustomLutData,
    ],
  );

  // 算法一键调光
  const handleAutoTone = useCallback(() => {
    if (!currentPhoto) return;
    const source =
      loadedImageRef.current ||
      cachedImageRef.current?.img ||
      currentRenderedCanvasRef.current;
    if (!source) return;

    try {
      const autoAdjustments = calculateAutoTone(source, {
        preserveRotation: photoAdjustments.rotation,
      });
      setPhotoAdjustments(currentPhoto.id, autoAdjustments);
      showToast('✨ 算法一键调光已生效！');
    } catch (err) {
      console.error('Failed to calculate auto tone:', err);
    }
  }, [currentPhoto, photoAdjustments.rotation, setPhotoAdjustments, showToast]);

  // 复制到剪贴板
  const handleCopyClipboard = useCallback(async () => {
    try {
      const canvas = await getHighResRenderedCanvas(2560);
      await copyCanvasToClipboard(canvas);
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2400);
      showToast('📋 已复制相框成图到剪贴板！可以直接粘贴发送');
    } catch (err) {
      alert(`复制到剪贴板失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [getHighResRenderedCanvas, showToast]);

  // 快捷键监听
  useEffect(() => {
    if (!isModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Cmd / Ctrl + Shift + C 复制当前照片调色参数
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        if (currentPhoto) {
          copyCurrentAdjustments(currentPhoto.id);
          showToast('📋 已复制当前照片调色参数 (可切图后按 Cmd+Shift+V 粘贴)');
        }
        return;
      }

      // Cmd / Ctrl + Shift + V 粘贴调色参数到当前照片
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        if (currentPhoto) {
          if (!copiedAdjustments) {
            showToast('⚠️ 剪贴板中尚无已复制的调色参数');
          } else {
            pasteAdjustments(currentPhoto.id);
            showToast('✨ 已成功粘贴应用调色参数！');
          }
        }
        return;
      }

      // Cmd / Ctrl + C 触发复制高清相框图
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        void handleCopyClipboard();
        return;
      }

      // 快捷键 A: 算法一键调光
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        handleAutoTone();
        return;
      }

      // 快捷键 Y: 切换左右分屏卷帘对比
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        setIsSplitMode((prev) => !prev);
        return;
      }

      // 反斜杠键查看原图对比
      if (e.key === '\\') {
        e.preventDefault();
        setIsComparingBefore(true);
        return;
      }

      // 数字键 1 ~ 6 切换相框模板
      const templateKeys: FrameTemplate[] = [
        'classic_white',
        'obsidian_black',
        'amber_minimal',
        'cinematic_scope',
        'retro_polaroid',
        'overlay_badge',
      ];
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= templateKeys.length) {
        e.preventDefault();
        updateFrameConfig({ template: templateKeys[num - 1] });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === '\\') {
        setIsComparingBefore(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    isModalOpen,
    handleCopyClipboard,
    handleAutoTone,
    updateFrameConfig,
    currentPhoto,
    copyCurrentAdjustments,
    pasteAdjustments,
    copiedAdjustments,
    showToast,
  ]);

  if (!isModalOpen || !currentPhoto) return null;

  // 保存为文件
  const handleSaveImage = async () => {
    if (!currentPhoto) return;
    try {
      const canvas = await getHighResRenderedCanvas(2560);
      const baseName = currentPhoto.filename.replace(/\.[^/.]+$/, '');
      const filename = `${baseName}_framed.jpg`;
      downloadCanvasAsImage(canvas, filename, 'image/jpeg', 0.94);
    } catch (err) {
      alert(`保存失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // AirDrop 分享到手机（投送带相框与相机参数的高清图片）
  const handleAirDrop = async () => {
    if (!currentPhoto) return;
    try {
      setAirdropSuccess(true);
      const canvas = await getHighResRenderedCanvas(2560);
      const baseName = currentPhoto.filename.replace(/\.[^/.]+$/, '');
      const filename = `${baseName}_framed.jpg`;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
      await shareCustomImagesViaAirDrop([{ filename, data_url_or_base64: dataUrl }]);
      setTimeout(() => setAirdropSuccess(false), 3000);
    } catch (err) {
      setAirdropSuccess(false);
      alert(`AirDrop 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const selectedPhotoIds = photos
    .filter((p) => selections[p.id]?.state === 'selected')
    .map((p) => p.id);

  const handleApplyToSelected = () => {
    if (selectedPhotoIds.length === 0) {
      alert('当前没有标记为“已选”的照片');
      return;
    }
    batchApplyAdjustments(selectedPhotoIds, photoAdjustments);
    alert(`已成功将当前调色同步应用至 ${selectedPhotoIds.length} 张已选照片！`);
  };

  // 模板定义与微缩图形
  const templates: Array<{
    id: FrameTemplate;
    name: string;
    desc: string;
    shortcut: string;
    renderMockup: () => React.ReactNode;
  }> = [
    {
      id: 'classic_white',
      name: '经典白底',
      desc: '经典白色底栏 · 红色光圈叶片微标 · 参数精致排版',
      shortcut: '1',
      renderMockup: () => (
        <div className="w-full h-11 rounded border border-dark-650 flex flex-col overflow-hidden bg-white shadow-xs">
          <div className="flex-1 bg-dark-800 m-1 rounded-[2px]" />
          <div className="h-3 bg-white px-1.5 flex items-center justify-between">
            <div className="flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              <span className="w-4 h-0.5 bg-slate-800 rounded" />
            </div>
            <span className="w-6 h-0.5 bg-slate-600 rounded" />
          </div>
        </div>
      ),
    },
    {
      id: 'obsidian_black',
      name: '暗夜黑曜',
      desc: '哑光黑底 · 银白细线 · 影调大片画廊质感',
      shortcut: '2',
      renderMockup: () => (
        <div className="w-full h-11 rounded border border-dark-650 flex flex-col overflow-hidden bg-[#0F1013] shadow-xs">
          <div className="flex-1 bg-dark-750 m-1 rounded-[2px]" />
          <div className="h-3 bg-[#0F1013] px-1.5 flex items-center justify-between">
            <div className="flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded border border-slate-400" />
              <span className="w-4 h-0.5 bg-slate-200 rounded" />
            </div>
            <span className="w-6 h-0.5 bg-slate-400 rounded" />
          </div>
        </div>
      ),
    },
    {
      id: 'amber_minimal',
      name: '琥珀极简',
      desc: '哑光琥珀暖橙圆环标 · 高级对焦刻度 · 优雅衬线',
      shortcut: '3',
      renderMockup: () => (
        <div className="w-full h-11 rounded border border-dark-650 flex flex-col overflow-hidden bg-[#FBFBFA] shadow-xs">
          <div className="flex-1 bg-dark-800 m-1 rounded-[2px]" />
          <div className="h-3 bg-[#FBFBFA] px-1.5 flex items-center justify-between">
            <div className="flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span className="w-4 h-0.5 bg-slate-800 rounded" />
            </div>
            <span className="w-6 h-0.5 bg-slate-500 rounded" />
          </div>
        </div>
      ),
    },
    {
      id: 'cinematic_scope',
      name: '电影宽幅',
      desc: '2.39:1 电影宽荧幕上下遮幅 · 胶卷编号印字',
      shortcut: '4',
      renderMockup: () => (
        <div className="w-full h-11 rounded border border-dark-650 flex flex-col overflow-hidden bg-[#08080A] shadow-xs">
          <div className="h-1.5 bg-[#08080A]" />
          <div className="flex-1 bg-dark-700 mx-1 rounded-[1px]" />
          <div className="h-3 bg-[#08080A] px-1 flex items-center justify-between">
            <span className="w-5 h-0.5 bg-amber-400 rounded" />
            <span className="w-6 h-0.5 bg-slate-300 rounded" />
          </div>
        </div>
      ),
    },
    {
      id: 'retro_polaroid',
      name: '复古相纸',
      desc: '四周包边留白 · 经典相纸比例 · 文艺怀旧',
      shortcut: '5',
      renderMockup: () => (
        <div className="w-full h-11 rounded border border-dark-650 flex flex-col overflow-hidden bg-[#F9F9F6] p-1 shadow-xs">
          <div className="flex-1 bg-dark-800 rounded-[1px]" />
          <div className="h-2 flex items-center justify-between pt-0.5 px-0.5">
            <span className="w-5 h-0.5 bg-slate-700 rounded" />
            <span className="w-4 h-0.5 bg-slate-400 rounded" />
          </div>
        </div>
      ),
    },
    {
      id: 'overlay_badge',
      name: '极简角标',
      desc: '原图无边框扩展 · 左下角悬浮半透明磨砂胶囊',
      shortcut: '6',
      renderMockup: () => (
        <div className="w-full h-11 rounded border border-dark-650 relative overflow-hidden bg-dark-800 shadow-xs">
          <div className="absolute bottom-1 left-1 bg-dark-900/90 border border-white/30 rounded-full px-1.5 py-0.5 flex items-center space-x-1">
            <span className="w-3 h-0.5 bg-white rounded" />
            <span className="w-4 h-0.5 bg-slate-300 rounded" />
          </div>
        </div>
      ),
    },
  ];

  const isOriginalActive = isAdjustmentsNoop(photoAdjustments) && !effectiveLutId;
  const isWarmActive =
    photoAdjustments.exposure === 0.3 &&
    photoAdjustments.temperature === 15 &&
    photoAdjustments.shadows === 20 &&
    photoAdjustments.highlights === -15 &&
    photoAdjustments.contrast === 5 &&
    !photoAdjustments.isBlackAndWhite;
  const isCoolActive =
    photoAdjustments.exposure === 0.2 &&
    photoAdjustments.temperature === -20 &&
    photoAdjustments.tint === 5 &&
    photoAdjustments.highlights === -25 &&
    photoAdjustments.contrast === 10 &&
    !photoAdjustments.isBlackAndWhite;
  const isBwActive =
    photoAdjustments.isBlackAndWhite &&
    photoAdjustments.contrast === 25 &&
    photoAdjustments.highlights === -20 &&
    photoAdjustments.shadows === 15;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      {/* 顶部通用灵动 Toast 通知 */}
      {toastMessage && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-60 flex items-center space-x-2.5 rounded-full border border-brand-500/40 bg-dark-900/95 px-5 py-2.5 text-xs font-semibold text-white shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-200">
          <Check className="h-4 w-4 text-brand-400 stroke-[3]" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="relative flex h-[94vh] w-[96vw] max-w-7xl flex-col overflow-hidden rounded-2xl border border-dark-700/80 bg-dark-900 shadow-2xl">
        {/* 顶部标题栏与 Tab 切换 */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-dark-700/80 bg-dark-850 px-6">
          <div className="flex items-center space-x-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30">
              <Camera className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>调色工作台</span>
                <span className="text-[10px] font-mono text-slate-400 bg-dark-750 px-2 py-0.5 rounded-full border border-dark-650">
                  {currentPhoto.filename}
                </span>
              </h2>
            </div>
          </div>

          {/* Tab 切换 */}
          <div className="flex items-center rounded-xl bg-dark-800/80 p-1 border border-dark-700">
            <button
              onClick={() => setActiveTab('adjust')}
              className={clsx(
                'flex items-center space-x-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer',
                activeTab === 'adjust'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>基础微调 (Adjust)</span>
            </button>
            <button
              onClick={() => setActiveTab('lut')}
              className={clsx(
                'flex items-center space-x-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer',
                activeTab === 'lut'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              <Film className="h-3.5 w-3.5" />
              <span>胶片预设 (LUT)</span>
            </button>
            <button
              onClick={() => setActiveTab('frame')}
              className={clsx(
                'flex items-center space-x-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer',
                activeTab === 'frame'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              <Frame className="h-3.5 w-3.5" />
              <span>相机相框 (Frame)</span>
            </button>
            <button
              onClick={() => setActiveTab('watermark')}
              className={clsx(
                'flex items-center space-x-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all cursor-pointer',
                activeTab === 'watermark'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              <Stamp className="h-3.5 w-3.5" />
              <span>水印签名 (Watermark)</span>
            </button>
          </div>

          <button
            onClick={() => setIsModalOpen(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-dark-750 hover:text-slate-200 transition-colors cursor-pointer"
            title="关闭 [Esc]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 主体工作区 (左侧 Canvas 预览 + 右侧控制面板) */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* 左侧：实时画廊式展示画布 */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-dark-950 p-6 select-none">
            {/* 状态指示器与 Before/After 对比胶囊 */}
            <div className="absolute top-4 left-6 z-10 flex items-center space-x-2">
              {isRendering && (
                <div className="flex items-center space-x-1.5 rounded-full bg-dark-850/90 border border-dark-700 px-3 py-1 text-xs text-brand-300 backdrop-blur shadow-lg">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span>实时渲染中…</span>
                </div>
              )}

              {/* 原图对比按键 (按住查看原片) */}
              <button
                onMouseDown={() => setIsComparingBefore(true)}
                onMouseUp={() => setIsComparingBefore(false)}
                onMouseLeave={() => setIsComparingBefore(false)}
                onTouchStart={() => setIsComparingBefore(true)}
                onTouchEnd={() => setIsComparingBefore(false)}
                title="按住临时查看调色前原片 [快捷键 \]"
                className={clsx(
                  'flex items-center space-x-1.5 rounded-full px-3 py-1 text-xs font-semibold backdrop-blur transition-all border cursor-pointer select-none shadow-lg',
                  isComparingBefore
                    ? 'bg-amber-500 text-amber-950 border-amber-400 font-bold'
                    : 'bg-dark-800/90 text-slate-300 border-dark-700 hover:bg-dark-700',
                )}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>{isComparingBefore ? '当前显示：调色前原图' : '按住对比原片 (\\)'}</span>
              </button>

              {/* 左右分屏对比开关 (Y 键开启卷帘对比) */}
              <button
                onClick={() => setIsSplitMode((prev) => !prev)}
                title="开启/关闭 左右卷帘分屏对比 [快捷键 Y]"
                className={clsx(
                  'flex items-center space-x-1.5 rounded-full px-3 py-1 text-xs font-semibold backdrop-blur transition-all border cursor-pointer select-none shadow-lg',
                  isSplitMode
                    ? 'bg-indigo-600 text-white border-indigo-400 font-bold ring-2 ring-indigo-500/40 shadow-indigo-500/20'
                    : 'bg-dark-800/90 text-slate-300 border-dark-700 hover:bg-dark-700',
                )}
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                <span>{isSplitMode ? '分屏卷帘中 (Y)' : '左右分屏对比 (Y)'}</span>
              </button>
            </div>

            {previewError ? (
              <div className="text-xs text-rose-400">{previewError}</div>
            ) : (
              <div
                className="relative flex h-full w-full items-center justify-center pt-10 pb-16 px-4 select-none overflow-hidden"
                onPointerMove={isDraggingSplit ? handleSplitPointerMove : undefined}
                onPointerUp={isDraggingSplit ? handleSplitPointerUp : undefined}
                onPointerCancel={isDraggingSplit ? handleSplitPointerUp : undefined}
              >
                <div className="relative max-h-full max-w-full flex items-center justify-center">
                  {/* 调色后成图 (底层基底) */}
                  <canvas
                    ref={previewCanvasRef}
                    className="max-h-full max-w-full rounded-md shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] object-contain ring-1 ring-white/10"
                  />

                  {/* 原片对比层 (顶层，基于 clip-path 裁切，仅在分屏模式下显示) */}
                  {isSplitMode && (
                    <canvas
                      ref={splitBeforeCanvasRef}
                      style={{
                        clipPath: `inset(0 ${(1 - splitRatio) * 100}% 0 0)`,
                      }}
                      className="absolute inset-0 max-h-full max-w-full rounded-md object-contain pointer-events-none"
                    />
                  )}

                  {/* 分屏拖拽分水岭与双向手柄 */}
                  {isSplitMode && (
                    <div
                      className="absolute top-0 bottom-0 z-20 cursor-ew-resize flex items-center justify-center select-none"
                      style={{ left: `${splitRatio * 100}%` }}
                      onPointerDown={handleSplitPointerDown}
                    >
                      {/* 垂直高亮细线 */}
                      <div className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_8px_rgba(0,0,0,0.85)] -translate-x-1/2 pointer-events-none" />

                      {/* 交互手柄胶囊 */}
                      <div className="relative -translate-x-1/2 flex items-center space-x-1 px-2.5 py-1 rounded-full bg-dark-900/90 text-[10px] font-bold text-white border border-white/40 shadow-2xl backdrop-blur select-none cursor-ew-resize hover:scale-105 active:scale-95 transition-transform ring-2 ring-black/40">
                        <span className="text-amber-400">◀ 原片</span>
                        <span className="text-slate-400">│</span>
                        <span className="text-brand-300">调色 ▶</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 底部快捷键提示胶囊 */}
            <div className="absolute bottom-3 left-6 z-20 px-3 py-1.5 rounded-xl bg-dark-900/85 backdrop-blur-md border border-dark-750 shadow-xl text-[11px] text-slate-400 font-mono flex items-center space-x-2 select-none pointer-events-none">
              <span className="text-slate-300 font-medium">快捷键：</span>
              <span>1~6 模板</span>
              <span className="text-dark-600">•</span>
              <span>A 调光</span>
              <span className="text-dark-600">•</span>
              <span>Y 分屏</span>
              <span className="text-dark-600">•</span>
              <span>\ 瞬看</span>
              <span className="text-dark-600">•</span>
              <span>Cmd+C 拷图</span>
              <span className="text-dark-600">•</span>
              <span>Cmd+Shift+C/V 拷粘调色</span>
            </div>
          </div>

          {/* 右侧：控制面板 */}
          <div className="w-96 shrink-0 border-l border-dark-700/80 bg-dark-850 flex flex-col justify-between overflow-y-auto">
            <div className="p-5 space-y-6">
              {activeTab === 'frame' ? (
                /* 相框模板与排版设置 */
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <label className="text-xs font-bold text-slate-300">
                        选择相框风格模板 (按数字键 1~6)
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {templates.map((t) => {
                        const isSelected =
                          frameConfig.template === t.id ||
                          (t.id === 'classic_white' && frameConfig.template === 'leica_white') ||
                          (t.id === 'retro_polaroid' && frameConfig.template === 'polaroid');

                        return (
                          <button
                            key={t.id}
                            onClick={() => updateFrameConfig({ template: t.id })}
                            className={clsx(
                              'group flex flex-col p-2.5 rounded-xl border text-left transition-all cursor-pointer select-none',
                              isSelected
                                ? 'border-brand-500 bg-brand-500/10 shadow-md ring-1 ring-brand-500/30'
                                : 'border-dark-700 bg-dark-800/70 hover:border-dark-600 hover:bg-dark-800',
                            )}
                          >
                            {/* 微缩排版图 */}
                            <div className="mb-2 w-full">{t.renderMockup()}</div>

                            <div className="flex items-center justify-between w-full mb-1">
                              <span className="text-xs font-bold text-slate-200 group-hover:text-white flex items-center gap-1.5">
                                <span>{t.name}</span>
                                <span className="text-[10px] font-mono px-1 rounded bg-dark-700 text-slate-400 font-normal">
                                  {t.shortcut}
                                </span>
                              </span>
                              {isSelected && (
                                <Check className="h-3.5 w-3.5 text-brand-400 stroke-[3]" />
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 line-clamp-2 leading-tight">
                              {t.desc}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 边框留白厚度微调 */}
                  {frameConfig.template !== 'overlay_badge' && (
                    <div className="pt-2 border-t border-dark-750">
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="font-bold text-slate-300">边框留白厚度</span>
                        <span className="font-mono text-brand-400">
                          {Math.round((frameConfig.borderScale || 0.1) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.06"
                        max="0.16"
                        step="0.01"
                        value={frameConfig.borderScale || 0.1}
                        onChange={(e) =>
                          updateFrameConfig({ borderScale: parseFloat(e.target.value) })
                        }
                        className="w-full accent-brand-500 cursor-pointer"
                      />
                    </div>
                  )}

                  {/* 包含元素开关 */}
                  <div className="space-y-2.5 pt-2 border-t border-dark-750">
                    <label className="text-xs font-bold text-slate-300 block">排版显示要素</label>
                    <div className="space-y-2 text-xs text-slate-300">
                      <label className="flex items-center justify-between cursor-pointer hover:text-slate-100">
                        <span>显示相机型号</span>
                        <input
                          type="checkbox"
                          checked={frameConfig.showCameraModel}
                          onChange={(e) => updateFrameConfig({ showCameraModel: e.target.checked })}
                          className="rounded bg-dark-900 border-dark-600 text-brand-500 focus:ring-0"
                        />
                      </label>
                      <label className="flex items-center justify-between cursor-pointer hover:text-slate-100">
                        <span>显示镜头型号</span>
                        <input
                          type="checkbox"
                          checked={frameConfig.showLens}
                          onChange={(e) => updateFrameConfig({ showLens: e.target.checked })}
                          className="rounded bg-dark-900 border-dark-600 text-brand-500 focus:ring-0"
                        />
                      </label>
                      <label className="flex items-center justify-between cursor-pointer hover:text-slate-100">
                        <span>显示拍摄核心四参数 (焦距/光圈/快门/ISO)</span>
                        <input
                          type="checkbox"
                          checked={frameConfig.showParams}
                          onChange={(e) => updateFrameConfig({ showParams: e.target.checked })}
                          className="rounded bg-dark-900 border-dark-600 text-brand-500 focus:ring-0"
                        />
                      </label>
                      <label className="flex items-center justify-between cursor-pointer hover:text-slate-100">
                        <span>显示拍摄日期与时间</span>
                        <input
                          type="checkbox"
                          checked={frameConfig.showDate}
                          onChange={(e) => updateFrameConfig({ showDate: e.target.checked })}
                          className="rounded bg-dark-900 border-dark-600 text-brand-500 focus:ring-0"
                        />
                      </label>
                      <label className="flex items-center justify-between cursor-pointer hover:text-slate-100">
                        <span>包含当前快速调色效果</span>
                        <input
                          type="checkbox"
                          checked={frameConfig.includeAdjustments}
                          onChange={(e) => updateFrameConfig({ includeAdjustments: e.target.checked })}
                          className="rounded bg-dark-900 border-dark-600 text-brand-500 focus:ring-0"
                        />
                      </label>
                    </div>
                  </div>

                  {/* 自定义签名与覆盖 */}
                  <div className="space-y-3 pt-2 border-t border-dark-750">
                    <label className="text-xs font-bold text-slate-300 block">自定义署名与覆盖</label>
                    <div className="space-y-2">
                      <div>
                        <div className="text-[11px] text-slate-400 mb-1">摄影师署名 (如 Photo by ...)</div>
                        <input
                          type="text"
                          value={frameConfig.customPhotographer}
                          onChange={(e) => updateFrameConfig({ customPhotographer: e.target.value })}
                          placeholder="例如：Photo by Johnny"
                          className="w-full rounded-lg bg-dark-900 border border-dark-700 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-400 mb-1">覆盖相机型号（留空自动读取 EXIF）</div>
                        <input
                          type="text"
                          value={frameConfig.customCameraModel || ''}
                          onChange={(e) => updateFrameConfig({ customCameraModel: e.target.value })}
                          placeholder="自动提取"
                          className="w-full rounded-lg bg-dark-900 border border-dark-700 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : activeTab === 'adjust' ? (
                /* 选片级快速调色面板 */
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300">选片快速调光 (GPU 硬件加速)</span>
                    <button
                      onClick={() => {
                        resetPhotoAdjustments(currentPhoto.id);
                        if (currentPhoto) clearPhotoLut(currentPhoto.id);
                      }}
                      className="text-[11px] text-slate-400 hover:text-brand-300 flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>复位全部调色</span>
                    </button>
                  </div>

                  {/* 算法一键调光按钮 */}
                  <button
                    onClick={handleAutoTone}
                    className="flex items-center justify-center space-x-2 rounded-xl bg-gradient-to-r from-amber-500/20 via-brand-500/25 to-indigo-500/20 border border-brand-500/40 py-2.5 px-3 text-xs font-bold text-brand-200 hover:text-white hover:border-brand-400 hover:from-amber-500/30 hover:to-indigo-500/30 transition-all shadow-md w-full cursor-pointer group active:scale-[0.99]"
                    title="基于直方图感知亮度与 Rec.709 加权算法，自动计算最优曝光补偿、高光抑制与阴影提亮 [快捷键 A]"
                  >
                    <Sparkles className="h-4 w-4 text-amber-400 group-hover:rotate-12 transition-transform" />
                    <span>✨ 算法一键调光 (快捷键 A)</span>
                  </button>

                  {/* 一键快捷影调预设 */}
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-medium text-slate-400">一键快捷影调</div>
                    <div className="grid grid-cols-4 gap-1.5 text-[11px]">
                      <button
                        onClick={() => {
                          resetPhotoAdjustments(currentPhoto.id);
                          if (currentPhoto) clearPhotoLut(currentPhoto.id);
                        }}
                        className={clsx(
                          'py-1.5 px-1 rounded-lg border transition-all cursor-pointer text-center',
                          isOriginalActive
                            ? 'bg-dark-700 border-brand-400 text-white font-bold ring-1 ring-brand-400/50 shadow-sm'
                            : 'bg-dark-800 hover:bg-dark-750 border-dark-700 text-slate-300 hover:text-white',
                        )}
                        title="清空所有微调，恢复原片直出"
                      >
                        原片直出
                      </button>
                      <button
                        onClick={() =>
                          setPhotoAdjustments(currentPhoto.id, {
                            exposure: 0.3,
                            temperature: 15,
                            shadows: 20,
                            highlights: -15,
                            contrast: 5,
                            isBlackAndWhite: false,
                          })
                        }
                        className={clsx(
                          'py-1.5 px-1 rounded-lg border transition-all cursor-pointer text-center',
                          isWarmActive
                            ? 'bg-amber-500/25 border-amber-400 text-amber-200 font-bold ring-1 ring-amber-400/50 shadow-sm'
                            : 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300',
                        )}
                        title="暖阳人像：微加曝光与暖调，提亮暗部细节"
                      >
                        暖阳人像
                      </button>
                      <button
                        onClick={() =>
                          setPhotoAdjustments(currentPhoto.id, {
                            exposure: 0.2,
                            temperature: -20,
                            tint: 5,
                            highlights: -25,
                            contrast: 10,
                            isBlackAndWhite: false,
                          })
                        }
                        className={clsx(
                          'py-1.5 px-1 rounded-lg border transition-all cursor-pointer text-center',
                          isCoolActive
                            ? 'bg-sky-500/25 border-sky-400 text-sky-200 font-bold ring-1 ring-sky-400/50 shadow-sm'
                            : 'bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/30 text-sky-300',
                        )}
                        title="清透冷调：冷色温，压暗高光，清爽通透"
                      >
                        清透冷调
                      </button>
                      <button
                        onClick={() =>
                          setPhotoAdjustments(currentPhoto.id, {
                            isBlackAndWhite: true,
                            contrast: 25,
                            highlights: -20,
                            shadows: 15,
                          })
                        }
                        className={clsx(
                          'py-1.5 px-1 rounded-lg border transition-all cursor-pointer text-center',
                          isBwActive
                            ? 'bg-slate-600/80 border-slate-300 text-white font-bold ring-1 ring-slate-300/50 shadow-sm'
                            : 'bg-slate-700/50 hover:bg-slate-700 border border-slate-600 text-slate-200',
                        )}
                        title="影调黑白：黑白预览，增强明暗对比与层次"
                      >
                        影调黑白
                      </button>
                    </div>
                  </div>

                  {/* 一键黑白预览 */}
                  <div className="rounded-xl border border-dark-700/80 bg-dark-800/60 p-3">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div className="flex items-center space-x-2">
                        <SunMedium className="h-4 w-4 text-amber-400" />
                        <div>
                          <div className="text-xs font-semibold text-slate-200">一键黑白预览 (B&W)</div>
                          <div className="text-[10px] text-slate-400">排除色彩杂乱，纯粹评估光影与明暗对比</div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={photoAdjustments.isBlackAndWhite}
                        onChange={(e) =>
                          setPhotoAdjustments(currentPhoto.id, { isBlackAndWhite: e.target.checked })
                        }
                        className="rounded bg-dark-900 border-dark-600 text-brand-500 focus:ring-0"
                      />
                    </label>
                  </div>

                  {/* 渐变指示滑杆 */}
                  <div className="space-y-4 text-xs text-slate-300">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 px-0.5 pb-0.5">
                      <span className="font-semibold text-slate-300">光影与色彩微调</span>
                      <span className="text-[10px] text-brand-300/80 bg-brand-500/10 px-1.5 py-0.5 rounded border border-brand-500/20">
                        双击名称快速归零
                      </span>
                    </div>
                    {/* 曝光补偿 */}
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span
                          className="font-medium text-slate-300 cursor-pointer hover:text-brand-300"
                          title="双击归零"
                          onDoubleClick={() => setPhotoAdjustments(currentPhoto.id, { exposure: 0 })}
                        >
                          曝光补偿 (Exposure)
                        </span>
                        <span className="font-mono text-brand-400 font-bold">
                          {photoAdjustments.exposure > 0
                            ? `+${photoAdjustments.exposure.toFixed(1)}`
                            : photoAdjustments.exposure.toFixed(1)}{' '}
                          EV
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-3.0"
                        max="3.0"
                        step="0.1"
                        value={photoAdjustments.exposure}
                        onChange={(e) =>
                          setPhotoAdjustments(currentPhoto.id, { exposure: parseFloat(e.target.value) })
                        }
                        className="w-full accent-brand-500 cursor-pointer rounded-lg h-2 bg-gradient-to-r from-slate-950 via-slate-700 to-slate-200"
                      />
                    </div>

                    {/* 高光 */}
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span
                          className="font-medium text-slate-300 cursor-pointer hover:text-brand-300"
                          title="双击归零"
                          onDoubleClick={() => setPhotoAdjustments(currentPhoto.id, { highlights: 0 })}
                        >
                          高光拉回 (Highlights)
                        </span>
                        <span className="font-mono text-slate-400">{photoAdjustments.highlights}</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={photoAdjustments.highlights}
                        onChange={(e) =>
                          setPhotoAdjustments(currentPhoto.id, { highlights: parseInt(e.target.value, 10) })
                        }
                        className="w-full accent-brand-500 cursor-pointer rounded-lg h-2 bg-dark-750"
                      />
                    </div>

                    {/* 阴影 */}
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span
                          className="font-medium text-slate-300 cursor-pointer hover:text-brand-300"
                          title="双击归零"
                          onDoubleClick={() => setPhotoAdjustments(currentPhoto.id, { shadows: 0 })}
                        >
                          阴影提亮 (Shadows)
                        </span>
                        <span className="font-mono text-slate-400">{photoAdjustments.shadows}</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={photoAdjustments.shadows}
                        onChange={(e) =>
                          setPhotoAdjustments(currentPhoto.id, { shadows: parseInt(e.target.value, 10) })
                        }
                        className="w-full accent-brand-500 cursor-pointer rounded-lg h-2 bg-dark-750"
                      />
                    </div>

                    {/* 对比度 */}
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span
                          className="font-medium text-slate-300 cursor-pointer hover:text-brand-300"
                          title="双击归零"
                          onDoubleClick={() => setPhotoAdjustments(currentPhoto.id, { contrast: 0 })}
                        >
                          对比度 (Contrast)
                        </span>
                        <span className="font-mono text-slate-400">{photoAdjustments.contrast}</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={photoAdjustments.contrast}
                        onChange={(e) =>
                          setPhotoAdjustments(currentPhoto.id, { contrast: parseInt(e.target.value, 10) })
                        }
                        className="w-full accent-brand-500 cursor-pointer rounded-lg h-2 bg-dark-750"
                      />
                    </div>

                    {/* 色温 (冷蓝到暖黄渐变底槽) */}
                    <div className="pt-2 border-t border-dark-750">
                      <div className="flex justify-between text-[11px] mb-1">
                        <span
                          className="font-medium text-slate-300 cursor-pointer hover:text-amber-300"
                          title="双击归零"
                          onDoubleClick={() => setPhotoAdjustments(currentPhoto.id, { temperature: 0 })}
                        >
                          色温 (冷蓝 / 暖黄)
                        </span>
                        <span className="font-mono text-amber-400">{photoAdjustments.temperature}</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={photoAdjustments.temperature}
                        onChange={(e) =>
                          setPhotoAdjustments(currentPhoto.id, { temperature: parseInt(e.target.value, 10) })
                        }
                        className="w-full accent-amber-400 cursor-pointer rounded-lg h-2 bg-gradient-to-r from-sky-400 via-dark-700 to-amber-400"
                      />
                    </div>

                    {/* 色调 (偏绿到偏洋红渐变底槽) */}
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span
                          className="font-medium text-slate-300 cursor-pointer hover:text-fuchsia-300"
                          title="双击归零"
                          onDoubleClick={() => setPhotoAdjustments(currentPhoto.id, { tint: 0 })}
                        >
                          色调 (偏绿 / 偏洋红)
                        </span>
                        <span className="font-mono text-fuchsia-400">{photoAdjustments.tint}</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={photoAdjustments.tint}
                        onChange={(e) =>
                          setPhotoAdjustments(currentPhoto.id, { tint: parseInt(e.target.value, 10) })
                        }
                        className="w-full accent-fuchsia-400 cursor-pointer rounded-lg h-2 bg-gradient-to-r from-emerald-400 via-dark-700 to-fuchsia-400"
                      />
                    </div>

                    {/* 饱和度 */}
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span
                          className="font-medium text-slate-300 cursor-pointer hover:text-indigo-300"
                          title="双击归零"
                          onDoubleClick={() => setPhotoAdjustments(currentPhoto.id, { saturation: 0 })}
                        >
                          饱和度 (Saturation)
                        </span>
                        <span className="font-mono text-indigo-400">{photoAdjustments.saturation}</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={photoAdjustments.saturation}
                        onChange={(e) =>
                          setPhotoAdjustments(currentPhoto.id, { saturation: parseInt(e.target.value, 10) })
                        }
                        className="w-full accent-indigo-400 cursor-pointer rounded-lg h-2 bg-gradient-to-r from-slate-600 via-dark-700 to-indigo-400"
                      />
                    </div>
                  </div>

                  {/* 旋转 90 度 */}
                  <div className="pt-2 border-t border-dark-750">
                    <button
                      onClick={() =>
                        setPhotoAdjustments(currentPhoto.id, {
                          rotation: (photoAdjustments.rotation + 90) % 360,
                        })
                      }
                      className="flex items-center space-x-2 rounded-lg border border-dark-700 bg-dark-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-dark-750 transition-colors w-full justify-center cursor-pointer"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                      <span>旋转 90° (当前 {photoAdjustments.rotation}°)</span>
                    </button>
                  </div>

                  {/* 批量同步已选照片 */}
                  {selectedPhotoIds.length > 0 && (
                    <div className="pt-2">
                      <button
                        onClick={handleApplyToSelected}
                        className="flex items-center justify-center space-x-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/15 px-3 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/25 transition-all w-full cursor-pointer"
                      >
                        <CheckCheck className="h-4 w-4" />
                        <span>同步应用至已选 {selectedPhotoIds.length} 张照片</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : activeTab === 'lut' ? (
                /* 3D 胶片色彩模拟 (LUT) 面板 */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <Film className="h-4 w-4 text-brand-400" />
                      <span className="text-xs font-bold text-slate-200">3D 胶片色彩模拟 (LUT)</span>
                    </div>
                    {effectiveLutId && (
                      <button
                        type="button"
                        onClick={() => {
                          if (currentPhoto) clearPhotoLut(currentPhoto.id);
                        }}
                        className="text-[11px] text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
                      >
                        清除胶片风格
                      </button>
                    )}
                  </div>

                  {/* 隐藏的 .cube 文件上传 input */}
                  <input
                    ref={cubeInputRef}
                    type="file"
                    accept=".cube"
                    className="hidden"
                    onChange={handleCubeUpload}
                  />

                  {/* 浓度/强度滑杆 */}
                  {effectiveLutId && (
                    <div className="rounded-xl border border-dark-700/80 bg-dark-800/50 p-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-slate-300">
                        <span className="font-medium">胶片风格渲染浓度</span>
                        <span className="font-mono text-brand-400 font-semibold">
                          {Math.round(effectiveLutIntensity * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={effectiveLutIntensity}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (currentPhoto) setPhotoLut(currentPhoto.id, effectiveLutId, val);
                        }}
                        className="w-full h-1.5 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-brand-400"
                      />
                      <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                        <span>10% (淡雅微调)</span>
                        <span>50%</span>
                        <span>100% (标准全效)</span>
                      </div>
                    </div>
                  )}

                  {/* 导入自定义 LUT 按钮 */}
                  <button
                    type="button"
                    onClick={() => cubeInputRef.current?.click()}
                    className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-xl border border-dashed border-dark-600 hover:border-brand-400 bg-dark-800/40 hover:bg-dark-800 text-xs text-slate-300 hover:text-brand-300 transition-all cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>导入自定义 .cube 3D LUT 文件...</span>
                  </button>

                  {/* 预设卡片列表 */}
                  <div className="space-y-1.5 max-h-[38vh] overflow-y-auto pr-1">
                    {/* 原色直出 */}
                    <button
                      type="button"
                      onClick={() => {
                        if (currentPhoto) clearPhotoLut(currentPhoto.id);
                      }}
                      className={clsx(
                        'w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all cursor-pointer',
                        !effectiveLutId
                          ? 'bg-brand-500/15 border-brand-400/80 text-white shadow-sm'
                          : 'bg-dark-800/60 hover:bg-dark-750 border-dark-700/80 text-slate-300',
                      )}
                    >
                      <div>
                        <div className="text-xs font-semibold">原片直出 (无 LUT)</div>
                        <div className="text-[10px] text-slate-400">保留相机原始直出色彩与基础微调</div>
                      </div>
                      {!effectiveLutId && (
                        <span className="text-[10px] bg-brand-500 text-white px-1.5 py-0.5 rounded font-mono">生效中</span>
                      )}
                    </button>

                    {/* 内置胶片预设 */}
                    {BUILTIN_LUTS.map((lut) => {
                      const isSelected = effectiveLutId === lut.id;
                      return (
                        <button
                          key={lut.id}
                          type="button"
                          onClick={() => {
                            if (currentPhoto) setPhotoLut(currentPhoto.id, lut.id, effectiveLutIntensity);
                          }}
                          className={clsx(
                            'w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all cursor-pointer',
                            isSelected
                              ? 'bg-amber-500/15 border-amber-400/80 text-amber-100 shadow-sm'
                              : 'bg-dark-800/60 hover:bg-dark-750 border-dark-700/80 text-slate-300',
                          )}
                        >
                          <div>
                            <div className="text-xs font-semibold flex items-center gap-1.5">
                              <span>{lut.name}</span>
                            </div>
                            <div className="text-[10px] text-slate-400">{lut.description}</div>
                          </div>
                          {isSelected && (
                            <span className="text-[10px] bg-amber-500 text-black font-bold px-1.5 py-0.5 rounded font-mono">
                              生效中
                            </span>
                          )}
                        </button>
                      );
                    })}

                    {/* 用户自定义 LUT */}
                    {customLuts.map((lut) => {
                      const isSelected = effectiveLutId === lut.id;
                      return (
                        <div
                          key={lut.id}
                          className={clsx(
                            'w-full flex items-center justify-between p-2.5 rounded-xl border transition-all',
                            isSelected
                              ? 'bg-amber-500/15 border-amber-400/80 text-amber-100 shadow-sm'
                              : 'bg-dark-800/60 border-dark-700/80 text-slate-300',
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (currentPhoto) setPhotoLut(currentPhoto.id, lut.id, effectiveLutIntensity);
                            }}
                            className="flex-1 text-left cursor-pointer"
                          >
                            <div className="text-xs font-semibold truncate">{lut.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">自定义 .cube (Grid: {lut.size})</div>
                          </button>
                          <div className="flex items-center space-x-1.5">
                            {isSelected && (
                              <span className="text-[10px] bg-amber-500 text-black font-bold px-1.5 py-0.5 rounded font-mono">
                                生效中
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeCustomLut(lut.id);
                                if (effectiveLutId === lut.id && currentPhoto) {
                                  clearPhotoLut(currentPhoto.id);
                                }
                              }}
                              className="p-1 hover:bg-dark-700 text-slate-400 hover:text-red-400 rounded transition-colors cursor-pointer"
                              title="删除此自定义 LUT"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 批量应用与复位 */}
                  <div className="pt-2 border-t border-dark-750/80 space-y-1.5">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleApplyLutToSelected}
                        disabled={!effectiveLutId || selectedPhotoIds.length === 0}
                        className={clsx(
                          'flex-1 py-1.5 px-2 rounded-lg border text-xs font-medium transition-all text-center',
                          effectiveLutId && selectedPhotoIds.length > 0
                            ? 'bg-dark-800 hover:bg-dark-750 border-dark-700 text-slate-200 hover:text-white cursor-pointer'
                            : 'bg-dark-850 border-dark-800 text-slate-500 cursor-not-allowed',
                        )}
                        title={selectedPhotoIds.length > 0 ? `同步应用至 ${selectedPhotoIds.length} 张已选照片` : '需先通过快捷键 [Space] 标记至少一张已选照片'}
                      >
                        应用至已选 ({selectedPhotoIds.length})
                      </button>
                      <button
                        type="button"
                        onClick={handleApplyLutToAll}
                        disabled={!effectiveLutId || photos.length === 0}
                        className={clsx(
                          'flex-1 py-1.5 px-2 rounded-lg border text-xs font-medium transition-all text-center',
                          effectiveLutId && photos.length > 0
                            ? 'bg-dark-800 hover:bg-dark-750 border-dark-700 text-slate-200 hover:text-white cursor-pointer'
                            : 'bg-dark-850 border-dark-800 text-slate-500 cursor-not-allowed',
                        )}
                        title="将当前胶片 LUT 同步应用至全库所有照片"
                      >
                        应用至全库 ({photos.length})
                      </button>
                    </div>

                    {Object.keys(photoLuts).length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearAllLuts}
                        className="w-full py-1 text-center text-[11px] text-slate-400 hover:text-red-300 transition-colors cursor-pointer"
                      >
                        清空全库所有照片的胶片 LUT 风格
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* 水印与摄影师签名面板 */
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300">照片水印与签名设置</span>
                    <button
                      onClick={resetWatermarkConfig}
                      className="text-[11px] text-slate-400 hover:text-brand-300 flex items-center gap-1 cursor-pointer"
                      title="重置水印为默认状态"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>复位参数</span>
                    </button>
                  </div>

                  {/* 总开关 */}
                  <div className="rounded-xl border border-dark-700/80 bg-dark-800/60 p-3">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div className="flex items-center space-x-2">
                        <Stamp className="h-4 w-4 text-brand-400" />
                        <div>
                          <div className="text-xs font-semibold text-slate-200">启用照片水印 / 签名</div>
                          <div className="text-[10px] text-slate-400">在照片画面上压印签名、工作室Logo或防盗水印</div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={watermarkConfig.enabled}
                        onChange={(e) => updateWatermarkConfig({ enabled: e.target.checked })}
                        className="rounded bg-dark-900 border-dark-600 text-brand-500 focus:ring-0 cursor-pointer"
                      />
                    </label>
                  </div>

                  {/* 水印类型选择 (文字签名 vs 图像Logo) */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-medium text-slate-400">水印形式</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => updateWatermarkConfig({ type: 'text' })}
                        className={clsx(
                          'flex items-center justify-center space-x-1.5 py-2 px-3 rounded-lg border text-xs font-medium transition-all cursor-pointer',
                          watermarkConfig.type === 'text'
                            ? 'bg-brand-600/20 border-brand-500 text-brand-200 ring-1 ring-brand-500/30 font-semibold'
                            : 'bg-dark-800 border-dark-700 text-slate-300 hover:bg-dark-750',
                        )}
                      >
                        <Type className="h-3.5 w-3.5" />
                        <span>文字签名 / 版权</span>
                      </button>
                      <button
                        onClick={() => updateWatermarkConfig({ type: 'logo' })}
                        className={clsx(
                          'flex items-center justify-center space-x-1.5 py-2 px-3 rounded-lg border text-xs font-medium transition-all cursor-pointer',
                          watermarkConfig.type === 'logo'
                            ? 'bg-brand-600/20 border-brand-500 text-brand-200 ring-1 ring-brand-500/30 font-semibold'
                            : 'bg-dark-800 border-dark-700 text-slate-300 hover:bg-dark-750',
                        )}
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        <span>工作室 Logo 图标</span>
                      </button>
                    </div>
                  </div>

                  {/* 文字签名专属设置 */}
                  {watermarkConfig.type === 'text' ? (
                    <div className="space-y-4 rounded-xl border border-dark-700/60 bg-dark-800/40 p-3">
                      <div>
                        <div className="text-[11px] text-slate-400 mb-1">签名 / 水印内容</div>
                        <input
                          type="text"
                          value={watermarkConfig.text}
                          onChange={(e) => updateWatermarkConfig({ text: e.target.value })}
                          placeholder="例如：© 2026 Johnny Wang"
                          className="w-full rounded-lg bg-dark-900 border border-dark-700 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                        />
                      </div>

                      {/* 快速预设词条 */}
                      <div>
                        <div className="text-[10px] text-slate-400 mb-1.5">快速填充常用词条</div>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            '© 2026 Johnny Wang',
                            'SHOT ON ALPHA · PHOTO BY JOHNNY',
                            'PROOF 选片专用样张 · 请勿转载',
                            'SAMPLE 样片',
                          ].map((preset) => (
                            <button
                              key={preset}
                              onClick={() => updateWatermarkConfig({ text: preset })}
                              className="px-2 py-0.5 rounded text-[10px] bg-dark-700 text-slate-300 hover:bg-brand-600 hover:text-white transition-colors cursor-pointer"
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 字体风格选择 */}
                      <div>
                        <div className="text-[11px] text-slate-400 mb-1.5">字体风格</div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { id: 'sans', label: '现代无衬线 (Sans)' },
                            { id: 'serif', label: '经典衬线 (Serif)' },
                            { id: 'signature', label: '优雅手写 (Signature)' },
                            { id: 'mono', label: '工业等宽 (Mono)' },
                          ].map((font) => (
                            <button
                              key={font.id}
                              onClick={() => updateWatermarkConfig({ fontFamily: font.id as any })}
                              className={clsx(
                                'py-1.5 px-2 rounded-lg border text-[11px] text-left transition-all cursor-pointer',
                                watermarkConfig.fontFamily === font.id
                                  ? 'bg-brand-500/20 border-brand-500 text-brand-200 font-semibold'
                                  : 'bg-dark-900 border-dark-700 text-slate-300 hover:bg-dark-750',
                              )}
                            >
                              {font.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 字重、斜体与颜色 */}
                      <div className="space-y-2">
                        <div className="text-[11px] text-slate-400">样式与颜色</div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => updateWatermarkConfig({ bold: !watermarkConfig.bold })}
                            className={clsx(
                              'px-2.5 py-1 rounded text-xs border font-bold transition-colors cursor-pointer',
                              watermarkConfig.bold
                                ? 'bg-brand-500/20 border-brand-500 text-brand-200'
                                : 'bg-dark-900 border-dark-700 text-slate-400',
                            )}
                            title="加粗"
                          >
                            B
                          </button>
                          <button
                            onClick={() => updateWatermarkConfig({ italic: !watermarkConfig.italic })}
                            className={clsx(
                              'px-2.5 py-1 rounded text-xs border italic font-serif transition-colors cursor-pointer',
                              watermarkConfig.italic
                                ? 'bg-brand-500/20 border-brand-500 text-brand-200'
                                : 'bg-dark-900 border-dark-700 text-slate-400',
                            )}
                            title="斜体"
                          >
                            I
                          </button>
                          <div className="h-4 w-[1px] bg-dark-700 mx-1" />
                          <div className="flex items-center space-x-1.5">
                            {[
                              { label: '纯白', color: '#FFFFFF' },
                              { label: '深黑', color: '#0F172A' },
                              { label: '复古金', color: '#F59E0B' },
                              { label: '中灰', color: '#94A3B8' },
                            ].map((c) => (
                              <button
                                key={c.color}
                                onClick={() => updateWatermarkConfig({ color: c.color })}
                                className={clsx(
                                  'h-6 w-6 rounded-full border-2 transition-all cursor-pointer',
                                  watermarkConfig.color.toUpperCase() === c.color.toUpperCase()
                                    ? 'border-brand-400 scale-110 shadow-sm'
                                    : 'border-dark-600 hover:scale-105',
                                )}
                                style={{ backgroundColor: c.color }}
                                title={c.label}
                              />
                            ))}
                            <input
                              type="color"
                              value={watermarkConfig.color}
                              onChange={(e) => updateWatermarkConfig({ color: e.target.value })}
                              className="h-6 w-6 rounded cursor-pointer bg-transparent border-0"
                              title="自定义取色"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Logo 图像专属上传与预览 */
                    <div className="space-y-3 rounded-xl border border-dark-700/60 bg-dark-800/40 p-3">
                      <div className="text-[11px] text-slate-400">工作室 Logo 图片 (推荐透明 PNG)</div>
                      {watermarkConfig.logoDataUrl ? (
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-dark-900 border border-dark-700">
                          <div className="flex items-center space-x-3">
                            <div className="h-10 w-10 rounded border border-dark-700 flex items-center justify-center p-1 bg-dark-950">
                              <img
                                src={watermarkConfig.logoDataUrl}
                                alt="Logo Preview"
                                className="max-h-full max-w-full object-contain"
                              />
                            </div>
                            <div className="text-[11px] text-emerald-400 font-medium">已加载自定义 Logo</div>
                          </div>
                          <button
                            onClick={() => updateWatermarkConfig({ logoDataUrl: undefined })}
                            className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
                            title="清除 Logo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <label className="flex flex-col items-center justify-center p-4 border border-dashed border-dark-600 hover:border-brand-500 rounded-xl bg-dark-900/60 hover:bg-dark-900 transition-all cursor-pointer group">
                            <ImageIcon className="h-6 w-6 text-slate-500 group-hover:text-brand-400 mb-1 transition-colors" />
                            <span className="text-xs text-slate-300 group-hover:text-white font-medium">
                              点击上传 Logo 图片
                            </span>
                            <span className="text-[10px] text-slate-500 mt-0.5">
                              支持 PNG (透明底)、JPG、WebP (小于 5MB)
                            </span>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/svg+xml"
                              onChange={handleLogoUpload}
                              className="hidden"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 位置与排版 (九宫格 + 全屏平铺) */}
                  <div className="space-y-2 pt-2 border-t border-dark-750">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-400">水印位置与排版</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {watermarkConfig.position === 'tiled' ? '全屏防盗平铺' : watermarkConfig.position}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 p-2 rounded-xl bg-dark-900 border border-dark-750 max-w-[220px] mx-auto">
                      {(
                        [
                          ['top-left', '↖ 左上'],
                          ['top-center', '↑ 顶部'],
                          ['top-right', '↗ 右上'],
                          ['center-left', '← 居左'],
                          ['center', '· 居中'],
                          ['center-right', '→ 居右'],
                          ['bottom-left', '↙ 左下'],
                          ['bottom-center', '↓ 底部'],
                          ['bottom-right', '↘ 右下'],
                        ] as const
                      ).map(([pos, label]) => {
                        const isSelected = watermarkConfig.position === pos;
                        return (
                          <button
                            key={pos}
                            onClick={() => updateWatermarkConfig({ position: pos })}
                            className={clsx(
                              'py-2 rounded-lg text-[10px] font-medium transition-all text-center cursor-pointer',
                              isSelected
                                ? 'bg-brand-500 text-white font-bold shadow-sm'
                                : 'bg-dark-800 text-slate-400 hover:bg-dark-700 hover:text-slate-200',
                            )}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    {/* 全屏对角防盗平铺 */}
                    <button
                      onClick={() =>
                        updateWatermarkConfig({
                          position: watermarkConfig.position === 'tiled' ? 'bottom-right' : 'tiled',
                        })
                      }
                      className={clsx(
                        'w-full py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer',
                        watermarkConfig.position === 'tiled'
                          ? 'bg-amber-500/20 border-amber-500 text-amber-200 ring-1 ring-amber-500/30'
                          : 'bg-dark-800 border-dark-700 text-slate-300 hover:bg-dark-750',
                      )}
                    >
                      <Grid3X3 className="h-4 w-4 text-amber-400" />
                      <span>📐 45° 全屏对角防盗平铺 (Proof Mode)</span>
                    </button>
                  </div>

                  {/* 细节滑块微调 */}
                  <div className="space-y-3 pt-2 border-t border-dark-750">
                    {/* 不透明度 */}
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="font-medium text-slate-300">不透明度 (Opacity)</span>
                        <span className="font-mono text-slate-400">{Math.round(watermarkConfig.opacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.05"
                        value={watermarkConfig.opacity}
                        onChange={(e) => updateWatermarkConfig({ opacity: parseFloat(e.target.value) })}
                        className="w-full accent-brand-500 cursor-pointer rounded-lg h-2 bg-dark-750"
                      />
                    </div>

                    {/* 尺寸缩放 */}
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="font-medium text-slate-300">尺寸大小 (Scale)</span>
                        <span className="font-mono text-slate-400">{Math.round(watermarkConfig.scale * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.05"
                        max="0.4"
                        step="0.01"
                        value={watermarkConfig.scale}
                        onChange={(e) => updateWatermarkConfig({ scale: parseFloat(e.target.value) })}
                        className="w-full accent-brand-500 cursor-pointer rounded-lg h-2 bg-dark-750"
                      />
                    </div>

                    {/* 边距留白 (仅在非平铺模式下可用) */}
                    {watermarkConfig.position !== 'tiled' && (
                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="font-medium text-slate-300">边缘留白 (Margin)</span>
                          <span className="font-mono text-slate-400">{Math.round(watermarkConfig.margin * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.01"
                          max="0.1"
                          step="0.005"
                          value={watermarkConfig.margin}
                          onChange={(e) => updateWatermarkConfig({ margin: parseFloat(e.target.value) })}
                          className="w-full accent-brand-500 cursor-pointer rounded-lg h-2 bg-dark-750"
                        />
                      </div>
                    )}

                    {/* 阴影效果抗反差开关 */}
                    <div className="rounded-xl border border-dark-700/80 bg-dark-800/60 p-2.5">
                      <label className="flex items-center justify-between cursor-pointer">
                        <div>
                          <div className="text-xs font-semibold text-slate-200">投影抗反差 (Drop Shadow)</div>
                          <div className="text-[10px] text-slate-400">避免文字/Logo与背景色彩混淆看不清</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={watermarkConfig.hasShadow}
                          onChange={(e) => updateWatermarkConfig({ hasShadow: e.target.checked })}
                          className="rounded bg-dark-900 border-dark-600 text-brand-500 focus:ring-0 cursor-pointer"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 底部高频快捷动作栏 */}
            <div className="border-t border-dark-750 bg-dark-900/95 p-4 space-y-2">
              <button
                onClick={handleCopyClipboard}
                className={clsx(
                  'flex w-full items-center justify-center space-x-2 rounded-xl py-2.5 text-xs font-bold transition-all shadow-lg cursor-pointer',
                  copyToast
                    ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                    : 'bg-brand-600 hover:bg-brand-500 text-white shadow-brand-600/25',
                )}
              >
                {copyToast ? (
                  <>
                    <Check className="h-4 w-4 stroke-[3]" />
                    <span>已复制到剪贴板！可直接粘贴发微信/社交圈</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span>一键复制带框图片 (Cmd+C / 粘贴即发)</span>
                  </>
                )}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleSaveImage}
                  className="flex items-center justify-center space-x-1.5 rounded-xl border border-dark-700 bg-dark-800 py-2 text-xs font-semibold text-slate-200 hover:bg-dark-750 transition-colors cursor-pointer"
                >
                  <Download className="h-3.5 w-3.5 text-slate-400" />
                  <span>保存高清 JPEG</span>
                </button>

                <button
                  onClick={handleAirDrop}
                  className={clsx(
                    'flex items-center justify-center space-x-1.5 rounded-xl border py-2 text-xs font-semibold transition-colors cursor-pointer',
                    airdropSuccess
                      ? 'border-blue-500/50 bg-blue-500/20 text-blue-200'
                      : 'border-dark-700 bg-dark-800 text-slate-200 hover:bg-dark-750',
                  )}
                >
                  <Smartphone className="h-3.5 w-3.5 text-blue-400" />
                  <span>AirDrop 到手机</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
