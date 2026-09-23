import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
} from 'lucide-react';
import clsx from 'clsx';
import { shareCustomImagesViaAirDrop } from '../../services/tauriBridge';

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
  } = useAdjustStore();

  const allPhotoAdjustments = useAdjustStore((state) => state.photoAdjustments);
  const { photos, currentIndex } = useAlbumStore();
  const { currentPreviewUrl } = usePreviewStore();
  const { selections } = useSelectionStore();

  const currentPhoto = photos[currentIndex];
  const photoAdjustments = useMemo(
    () =>
      currentPhoto?.id && allPhotoAdjustments[currentPhoto.id]
        ? allPhotoAdjustments[currentPhoto.id]
        : { ...DEFAULT_ADJUSTMENTS },
    [allPhotoAdjustments, currentPhoto?.id],
  );

  const [copyToast, setCopyToast] = useState(false);
  const [airdropSuccess, setAirdropSuccess] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isComparingBefore, setIsComparingBefore] = useState(false);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentRenderedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const cachedImageRef = useRef<{ url: string; img: HTMLImageElement } | null>(null);

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

        const canvas = await renderFramedPhotoCanvas(
          img,
          img.naturalWidth || 1920,
          img.naturalHeight || 1280,
          currentPhoto,
          effectiveConfig,
          effectiveAdjustments,
          1600,
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
  ]);

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
        );
      }
      if (currentRenderedCanvasRef.current) {
        return currentRenderedCanvasRef.current;
      }
      throw new Error('相框尚未渲染就绪');
    },
    [currentPhoto, frameConfig, photoAdjustments],
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
    } catch (err) {
      console.error('Failed to calculate auto tone:', err);
    }
  }, [currentPhoto, photoAdjustments.rotation, setPhotoAdjustments]);

  // 复制到剪贴板
  const handleCopyClipboard = useCallback(async () => {
    try {
      const canvas = await getHighResRenderedCanvas(2560);
      await copyCanvasToClipboard(canvas);
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2600);
    } catch (err) {
      alert(`复制到剪贴板失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [getHighResRenderedCanvas]);

  // 快捷键监听
  useEffect(() => {
    if (!isModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Cmd / Ctrl + C 触发复制
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
  }, [isModalOpen, handleCopyClipboard, handleAutoTone, updateFrameConfig]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      {/* 复制成功毛玻璃灵动岛通知 */}
      {copyToast && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-60 flex items-center space-x-2.5 rounded-full border border-emerald-500/40 bg-emerald-950/90 px-5 py-2.5 text-xs font-semibold text-emerald-200 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-200">
          <Check className="h-4 w-4 text-emerald-400 stroke-[3]" />
          <span>已成功复制高清带框图片到剪贴板！可直接在微信/社交软件按 Cmd+V 粘贴</span>
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
                <span>相机 EXIF 参数相框与选片快速调色</span>
                <span className="text-[10px] font-mono text-slate-400 bg-dark-750 px-2 py-0.5 rounded-full border border-dark-650">
                  {currentPhoto.filename}
                </span>
              </h2>
            </div>
          </div>

          {/* Tab 切换 */}
          <div className="flex items-center rounded-xl bg-dark-800/80 p-1 border border-dark-700">
            <button
              onClick={() => setActiveTab('frame')}
              className={clsx(
                'flex items-center space-x-1.5 rounded-lg px-3.5 py-1 text-xs font-semibold transition-all cursor-pointer',
                activeTab === 'frame'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              <Frame className="h-3.5 w-3.5" />
              <span>相机参数相框 (Frame)</span>
            </button>
            <button
              onClick={() => setActiveTab('adjust')}
              className={clsx(
                'flex items-center space-x-1.5 rounded-lg px-3.5 py-1 text-xs font-semibold transition-all cursor-pointer',
                activeTab === 'adjust'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200',
              )}
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>快速调色 (Adjust)</span>
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

              {/* 原图对比按键 */}
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
                <span>{isComparingBefore ? '当前显示：调色前原图' : '按住对比原图 (\)'}</span>
              </button>
            </div>

            {previewError ? (
              <div className="text-xs text-rose-400">{previewError}</div>
            ) : (
              <div className="flex h-full w-full items-center justify-center p-2">
                <canvas
                  ref={previewCanvasRef}
                  className="max-h-full max-w-full rounded-md shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] object-contain ring-1 ring-white/10"
                />
              </div>
            )}

            {/* 底部快捷键提示 */}
            <div className="absolute bottom-4 left-6 text-[11px] text-slate-500 font-mono flex items-center space-x-4">
              <span>快捷键：按 1~6 换模板</span>
              <span>•</span>
              <span>按 A 算法调光</span>
              <span>•</span>
              <span>按 Cmd+C 复制图片</span>
              <span>•</span>
              <span>按 \ 对比原片</span>
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
              ) : (
                /* 选片级快速调色面板 */
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300">选片快速调光 (GPU 硬件加速)</span>
                    <button
                      onClick={() => resetPhotoAdjustments(currentPhoto.id)}
                      className="text-[11px] text-slate-400 hover:text-brand-300 flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>复位参数</span>
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
                        onClick={() => resetPhotoAdjustments(currentPhoto.id)}
                        className="py-1.5 px-1 rounded-lg bg-dark-800 hover:bg-dark-750 border border-dark-700 text-slate-300 hover:text-white transition-colors cursor-pointer text-center"
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
                        className="py-1.5 px-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 transition-colors cursor-pointer text-center"
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
                        className="py-1.5 px-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 transition-colors cursor-pointer text-center"
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
                        className="py-1.5 px-1 rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-slate-600 text-slate-200 transition-colors cursor-pointer text-center"
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
