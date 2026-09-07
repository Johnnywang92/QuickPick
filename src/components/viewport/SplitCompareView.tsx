import React, { useEffect, useRef, useState } from 'react';
import { Application, Assets, Sprite, Container } from 'pixi.js';
import { usePhotoStore } from '../../store/photoStore';
import {
  ArrowRightLeft,
  X,
  Check,
  Star,
  Maximize2,
  Lock,
  Unlock,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  Wand2,
  Loader2,
  RefreshCw,
} from 'lucide-react';

export const SplitCompareView: React.FC = () => {
  const {
    photos,
    currentIndex,
    compareTargetIndex,
    currentPreviewUrl,
    comparePreviewUrl,
    previewStatus,
    previewError,
    comparePreviewStatus,
    comparePreviewError,
    syncZoomAndPan,
    toggleSyncZoomAndPan,
    swapComparePhotos,
    exitCompareMode,
    nextCompareCandidate,
    prevCompareCandidate,
    setRating,
    setPickStatus,
    setComparePhotoRating,
    setComparePhotoPickStatus,
    retryCurrentPreview,
    retryComparePreview,
  } = usePhotoStore();

  const leftContainerRef = useRef<HTMLDivElement>(null);
  const rightContainerRef = useRef<HTMLDivElement>(null);

  const leftAppRef = useRef<Application | null>(null);
  const rightAppRef = useRef<Application | null>(null);

  const leftImageContainerRef = useRef<Container | null>(null);
  const rightImageContainerRef = useRef<Container | null>(null);

  const [leftZoom, setLeftZoom] = useState<number>(100);
  const [rightZoom, setRightZoom] = useState<number>(100);
  const [leftReady, setLeftReady] = useState(false);
  const [rightReady, setRightReady] = useState(false);
  const [leftRenderStatus, setLeftRenderStatus] = useState<'initializing' | 'loading' | 'loaded' | 'error'>('initializing');
  const [rightRenderStatus, setRightRenderStatus] = useState<'initializing' | 'loading' | 'loaded' | 'error'>('initializing');
  const [leftRenderError, setLeftRenderError] = useState<string | null>(null);
  const [rightRenderError, setRightRenderError] = useState<string | null>(null);
  const [leftInitAttempt, setLeftInitAttempt] = useState(0);
  const [rightInitAttempt, setRightInitAttempt] = useState(0);
  const [leftLoadAttempt, setLeftLoadAttempt] = useState(0);
  const [rightLoadAttempt, setRightLoadAttempt] = useState(0);

  const leftIsPanning = useRef<boolean>(false);
  const rightIsPanning = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const leftPhoto = photos[currentIndex];
  const rightPhoto = compareTargetIndex !== null ? photos[compareTargetIndex] : null;

  // 初始化左侧 Pixi Application
  useEffect(() => {
    let isMounted = true;
    const parent = leftContainerRef.current;
    if (!parent) return;

    const app = new Application();
    setLeftReady(false);
    setLeftRenderStatus('initializing');
    setLeftRenderError(null);

    const initialize = async () => {
      try {
        await app.init({
          resizeTo: parent,
          backgroundColor: 0x0a0c10,
          antialias: true,
          autoDensity: true,
          resolution: window.devicePixelRatio || 1,
        });
        if (!isMounted) {
          app.destroy(true);
          return;
        }
        leftAppRef.current = app;
        parent.appendChild(app.canvas);
        const stage = new Container();
        app.stage.addChild(stage);
        leftImageContainerRef.current = stage;
        setLeftReady(true);
      } catch (error) {
        if (isMounted) {
          setLeftRenderStatus('error');
          setLeftRenderError(`左侧图形渲染器初始化失败：${String(error)}`);
        }
      }
    };

    void initialize();

    return () => {
      isMounted = false;
      if (leftAppRef.current) {
        try {
          leftAppRef.current.destroy(true, { children: true, texture: false });
        } catch (e) {
          console.error(e);
        }
        leftAppRef.current = null;
      }
      leftImageContainerRef.current = null;
    };
  }, [leftInitAttempt]);

  // 初始化右侧 Pixi Application
  useEffect(() => {
    let isMounted = true;
    const parent = rightContainerRef.current;
    if (!parent) return;

    const app = new Application();
    setRightReady(false);
    setRightRenderStatus('initializing');
    setRightRenderError(null);

    const initialize = async () => {
      try {
        await app.init({
          resizeTo: parent,
          backgroundColor: 0x0a0c10,
          antialias: true,
          autoDensity: true,
          resolution: window.devicePixelRatio || 1,
        });
        if (!isMounted) {
          app.destroy(true);
          return;
        }
        rightAppRef.current = app;
        parent.appendChild(app.canvas);
        const stage = new Container();
        app.stage.addChild(stage);
        rightImageContainerRef.current = stage;
        setRightReady(true);
      } catch (error) {
        if (isMounted) {
          setRightRenderStatus('error');
          setRightRenderError(`右侧图形渲染器初始化失败：${String(error)}`);
        }
      }
    };

    void initialize();

    return () => {
      isMounted = false;
      if (rightAppRef.current) {
        try {
          rightAppRef.current.destroy(true, { children: true, texture: false });
        } catch (e) {
          console.error(e);
        }
        rightAppRef.current = null;
      }
      rightImageContainerRef.current = null;
    };
  }, [rightInitAttempt]);

  // 加载左图纹理
  useEffect(() => {
    if (!currentPreviewUrl || !leftReady || !leftAppRef.current || !leftImageContainerRef.current) return;
    let isCurrent = true;
    const existingContainer = leftImageContainerRef.current;
    existingContainer.children.forEach((child) => child.destroy());
    existingContainer.removeChildren();
    setLeftRenderStatus('loading');
    setLeftRenderError(null);

    const loadTexture = async () => {
      try {
        const texture = await Assets.load(currentPreviewUrl);
        if (!isCurrent || !leftAppRef.current || !leftImageContainerRef.current) return;
        const container = leftImageContainerRef.current;
        container.children.forEach((child) => child.destroy());
        container.removeChildren();

        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);

        const app = leftAppRef.current;
        const scaleX = (app.screen.width * 0.9) / texture.width;
        const scaleY = (app.screen.height * 0.9) / texture.height;
        const fitScale = Math.min(scaleX, scaleY, 1.0);

        container.x = app.screen.width / 2;
        container.y = app.screen.height / 2;
        container.scale.set(fitScale);
        container.addChild(sprite);

        setLeftZoom(Math.round(fitScale * 100));
        setLeftRenderStatus('loaded');
      } catch (error) {
        if (isCurrent) {
          setLeftRenderStatus('error');
          setLeftRenderError(`左侧预览纹理载入失败：${String(error)}`);
        }
      }
    };

    void loadTexture();

    return () => {
      isCurrent = false;
    };
  }, [currentPreviewUrl, leftReady, leftLoadAttempt]);

  // 加载右图纹理
  useEffect(() => {
    if (!comparePreviewUrl || !rightReady || !rightAppRef.current || !rightImageContainerRef.current) return;
    let isCurrent = true;
    const existingContainer = rightImageContainerRef.current;
    existingContainer.children.forEach((child) => child.destroy());
    existingContainer.removeChildren();
    setRightRenderStatus('loading');
    setRightRenderError(null);

    const loadTexture = async () => {
      try {
        const texture = await Assets.load(comparePreviewUrl);
        if (!isCurrent || !rightAppRef.current || !rightImageContainerRef.current) return;
        const container = rightImageContainerRef.current;
        container.children.forEach((child) => child.destroy());
        container.removeChildren();

        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);

        const app = rightAppRef.current;
        const scaleX = (app.screen.width * 0.9) / texture.width;
        const scaleY = (app.screen.height * 0.9) / texture.height;
        const fitScale = Math.min(scaleX, scaleY, 1.0);

        container.x = app.screen.width / 2;
        container.y = app.screen.height / 2;
        container.scale.set(fitScale);
        container.addChild(sprite);

        setRightZoom(Math.round(fitScale * 100));
        setRightRenderStatus('loaded');
      } catch (error) {
        if (isCurrent) {
          setRightRenderStatus('error');
          setRightRenderError(`右侧预览纹理载入失败：${String(error)}`);
        }
      }
    };

    void loadTexture();

    return () => {
      isCurrent = false;
    };
  }, [comparePreviewUrl, rightReady, rightLoadAttempt]);

  // 滚轮缩放处理 (支持双画布联动)
  const handleWheel = (e: React.WheelEvent, isLeft: boolean) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.85;

    const applyZoom = (container: Container | null, setZoom: (z: number) => void) => {
      if (!container) return;
      const newScale = Math.max(0.1, Math.min(container.scale.x * factor, 8.0));
      container.scale.set(newScale);
      setZoom(Math.round(newScale * 100));
    };

    if (syncZoomAndPan) {
      applyZoom(leftImageContainerRef.current, setLeftZoom);
      applyZoom(rightImageContainerRef.current, setRightZoom);
    } else {
      if (isLeft) {
        applyZoom(leftImageContainerRef.current, setLeftZoom);
      } else {
        applyZoom(rightImageContainerRef.current, setRightZoom);
      }
    }
  };

  // 鼠标拖拽平移 (支持双画布联动)
  const handleMouseDown = (e: React.MouseEvent, isLeft: boolean) => {
    if (e.button === 0 || e.button === 1) {
      if (isLeft) leftIsPanning.current = true;
      else rightIsPanning.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const isPanning = leftIsPanning.current || rightIsPanning.current;
    if (!isPanning) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    dragStartRef.current = { x: e.clientX, y: e.clientY };

    if (syncZoomAndPan) {
      if (leftImageContainerRef.current) {
        leftImageContainerRef.current.x += dx;
        leftImageContainerRef.current.y += dy;
      }
      if (rightImageContainerRef.current) {
        rightImageContainerRef.current.x += dx;
        rightImageContainerRef.current.y += dy;
      }
    } else {
      if (leftIsPanning.current && leftImageContainerRef.current) {
        leftImageContainerRef.current.x += dx;
        leftImageContainerRef.current.y += dy;
      } else if (rightIsPanning.current && rightImageContainerRef.current) {
        rightImageContainerRef.current.x += dx;
        rightImageContainerRef.current.y += dy;
      }
    }
  };

  const handleMouseUp = () => {
    leftIsPanning.current = false;
    rightIsPanning.current = false;
  };

  // 1:1 像素复位
  const zoomBothTo100 = () => {
    if (leftImageContainerRef.current && leftAppRef.current) {
      leftImageContainerRef.current.scale.set(1.0);
      leftImageContainerRef.current.x = leftAppRef.current.screen.width / 2;
      leftImageContainerRef.current.y = leftAppRef.current.screen.height / 2;
      setLeftZoom(100);
    }
    if (rightImageContainerRef.current && rightAppRef.current) {
      rightImageContainerRef.current.scale.set(1.0);
      rightImageContainerRef.current.x = rightAppRef.current.screen.width / 2;
      rightImageContainerRef.current.y = rightAppRef.current.screen.height / 2;
      setRightZoom(100);
    }
  };

  // 右侧候选片前后切换 (自动跨过主选底片，杜绝死锁卡顿)
  const handlePrevCandidate = () => {
    prevCompareCandidate();
  };

  const handleNextCandidate = () => {
    nextCompareCandidate();
  };

  if (!leftPhoto || !rightPhoto) return null;

  return (
    <div
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="relative w-full h-full flex flex-col bg-dark-950 overflow-hidden select-none font-sans"
    >
      {/* 顶部对比控制条 */}
      <div className="h-10 border-b border-dark-700/80 bg-dark-850 flex items-center justify-between px-4 z-30 shrink-0 text-xs text-slate-300">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-brand-600/20 text-brand-400 border border-brand-500/30 font-semibold">
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>双图分屏比对模式</span>
          </div>

          <button
            onClick={toggleSyncZoomAndPan}
            title="开启/关闭双画布缩放平移联动"
            className={`flex items-center space-x-1 px-2 py-0.5 rounded border transition-colors cursor-pointer ${
              syncZoomAndPan
                ? 'bg-blue-600/20 text-blue-300 border-blue-500/40'
                : 'bg-dark-750 text-slate-400 border-dark-600 hover:text-slate-200'
            }`}
          >
            {syncZoomAndPan ? <Lock className="w-3 h-3 text-blue-400" /> : <Unlock className="w-3 h-3" />}
            <span>同步联动: {syncZoomAndPan ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={zoomBothTo100}
            title="双图同时放大至当前内嵌或代理预览的 1:1 像素，不代表完整 RAW 像素"
            className="flex items-center space-x-1 px-2 py-0.5 rounded bg-dark-750 hover:bg-dark-700 border border-dark-600 text-slate-300 transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3 h-3" />
            <span>双图 1:1 预览</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={swapComparePhotos}
            title="主备底片互换位置 (快捷键 [S])"
            className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-dark-750 hover:bg-dark-700 text-slate-200 border border-dark-600 transition-colors cursor-pointer"
          >
            <ArrowRightLeft className="w-3 h-3 text-brand-400" />
            <span>主备互换 [S]</span>
          </button>

          <button
            onClick={exitCompareMode}
            title="退出对比模式 (快捷键 [Esc] 或 [C])"
            className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>退出对比 [Esc]</span>
          </button>
        </div>
      </div>

      {/* 双视口并排工作区 */}
      <div className="flex-1 flex w-full h-full relative overflow-hidden">
        {/* 左侧视口: 主选照片 (Anchor) */}
        <div
          ref={leftContainerRef}
          onWheel={(e) => handleWheel(e, true)}
          onMouseDown={(e) => handleMouseDown(e, true)}
          className="flex-1 h-full relative border-r border-dark-700 bg-dark-900 cursor-grab active:cursor-grabbing overflow-hidden"
        >
          {(previewStatus === 'loading' || leftRenderStatus === 'initializing' || leftRenderStatus === 'loading') && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-dark-900/55">
              <div className="flex items-center gap-2 rounded-lg border border-dark-700 bg-dark-800/90 px-3 py-2 text-xs text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin text-brand-400" />
                正在载入左侧预览…
              </div>
            </div>
          )}
          {(previewStatus === 'error' || leftRenderStatus === 'error') && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-dark-900/90 p-5">
              <div className="max-w-sm rounded-xl border border-amber-500/35 bg-dark-800 p-4 text-center">
                <AlertTriangle className="mx-auto h-6 w-6 text-amber-400" />
                <p className="mt-2 break-words text-xs leading-relaxed text-slate-400">{previewError || leftRenderError}</p>
                <button
                  onClick={() => {
                    if (previewStatus === 'error') void retryCurrentPreview();
                    else if (!leftReady) setLeftInitAttempt((attempt) => attempt + 1);
                    else setLeftLoadAttempt((attempt) => attempt + 1);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-brand-500/40 bg-brand-500/15 px-3 py-1.5 text-xs text-brand-200 hover:bg-brand-500/25"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  重试左图
                </button>
              </div>
            </div>
          )}

          {/* 左侧信息浮标 */}
          <div className="absolute top-3 left-3 z-20 flex items-center space-x-2 bg-dark-800/85 backdrop-blur-md px-2.5 py-1 rounded-lg border border-dark-700 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="font-semibold text-emerald-400">主选片 #{currentIndex + 1}</span>
            <span className="text-slate-300">{leftPhoto.filename}</span>
            {leftPhoto.exif && (leftPhoto.exif.shutter_speed || leftPhoto.exif.aperture) && (
              <span className="text-amber-300/90 pl-1.5 border-l border-dark-700 text-[11px]">
                {leftPhoto.exif.focal_length ? `${Math.round(leftPhoto.exif.focal_length)}mm ` : ''}
                {leftPhoto.exif.aperture ? `f/${leftPhoto.exif.aperture} ` : ''}
                {leftPhoto.exif.shutter_speed || ''}
              </span>
            )}
            <span className="text-slate-500">{leftZoom}%</span>
          </div>

          {/* 左侧 AI 诊断微标 */}
          <div className="absolute top-3 right-3 z-20">
            <span
              className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold flex items-center space-x-1 ${
                leftPhoto.retouch_status === 'clean'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : leftPhoto.retouch_status === 'fixable'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : leftPhoto.retouch_status === 'fatal'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  : leftPhoto.retouch_status === 'failed'
                  ? 'bg-orange-500/20 text-orange-300 border-orange-500/30'
                  : 'bg-slate-700/50 text-slate-300 border-slate-600'
              }`}
            >
              {leftPhoto.retouch_status === 'clean' && <Sparkles className="w-3 h-3" />}
              {leftPhoto.retouch_status === 'fixable' && <Wand2 className="w-3 h-3" />}
              {leftPhoto.retouch_status === 'fatal' && <AlertTriangle className="w-3 h-3" />}
              {leftPhoto.retouch_status === 'failed' && <AlertTriangle className="w-3 h-3" />}
              <span>{leftPhoto.retouch_status === 'clean' ? '未见明显问题' : leftPhoto.retouch_status === 'fixable' ? '可修解决' : leftPhoto.retouch_status === 'fatal' ? '不可修硬伤' : leftPhoto.retouch_status === 'failed' ? '分析失败' : '待分析'}</span>
            </span>
          </div>

          {/* 左侧独立定夺工具栏 */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center space-x-2 bg-dark-850/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-dark-700 shadow-xl text-xs">
            <button
              onClick={() => setPickStatus('Pick')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg font-semibold transition-all ${
                leftPhoto.pick_status === 'Pick'
                  ? 'bg-emerald-600 text-white'
                  : 'hover:bg-dark-700 text-slate-300'
              }`}
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>采纳左图 [P]</span>
            </button>
            <button
              onClick={() => setPickStatus('Reject')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg font-semibold transition-all ${
                leftPhoto.pick_status === 'Reject'
                  ? 'bg-rose-600 text-white'
                  : 'hover:bg-dark-700 text-slate-300'
              }`}
            >
              <X className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>排除左图 [X]</span>
            </button>
            <div className="flex items-center space-x-0.5 border-l border-dark-700 pl-1.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => setRating(leftPhoto.rating === s ? 0 : s)}
                  className={`p-1 ${s <= leftPhoto.rating ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'}`}
                >
                  <Star className="w-3.5 h-3.5 fill-current" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 右侧视口: 备选照片 (Candidate) */}
        <div
          ref={rightContainerRef}
          onWheel={(e) => handleWheel(e, false)}
          onMouseDown={(e) => handleMouseDown(e, false)}
          className="flex-1 h-full relative bg-dark-900 cursor-grab active:cursor-grabbing overflow-hidden"
        >
          {(comparePreviewStatus === 'loading' || rightRenderStatus === 'initializing' || rightRenderStatus === 'loading') && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-dark-900/55">
              <div className="flex items-center gap-2 rounded-lg border border-dark-700 bg-dark-800/90 px-3 py-2 text-xs text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin text-brand-400" />
                正在载入右侧预览…
              </div>
            </div>
          )}
          {(comparePreviewStatus === 'error' || rightRenderStatus === 'error') && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-dark-900/90 p-5">
              <div className="max-w-sm rounded-xl border border-amber-500/35 bg-dark-800 p-4 text-center">
                <AlertTriangle className="mx-auto h-6 w-6 text-amber-400" />
                <p className="mt-2 break-words text-xs leading-relaxed text-slate-400">{comparePreviewError || rightRenderError}</p>
                <button
                  onClick={() => {
                    if (comparePreviewStatus === 'error') void retryComparePreview();
                    else if (!rightReady) setRightInitAttempt((attempt) => attempt + 1);
                    else setRightLoadAttempt((attempt) => attempt + 1);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-brand-500/40 bg-brand-500/15 px-3 py-1.5 text-xs text-brand-200 hover:bg-brand-500/25"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  重试右图
                </button>
              </div>
            </div>
          )}

          {/* 右侧信息浮标与候选前后切换器 */}
          <div className="absolute top-3 left-3 z-20 flex items-center space-x-2 bg-dark-800/85 backdrop-blur-md px-2.5 py-1 rounded-lg border border-dark-700 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="font-semibold text-blue-400">对比候选 #{compareTargetIndex! + 1}</span>
            <span className="text-slate-300">{rightPhoto.filename}</span>
            {rightPhoto.exif && (rightPhoto.exif.shutter_speed || rightPhoto.exif.aperture) && (
              <span className="text-amber-300/90 pl-1.5 border-l border-dark-700 text-[11px]">
                {rightPhoto.exif.focal_length ? `${Math.round(rightPhoto.exif.focal_length)}mm ` : ''}
                {rightPhoto.exif.aperture ? `f/${rightPhoto.exif.aperture} ` : ''}
                {rightPhoto.exif.shutter_speed || ''}
              </span>
            )}
            <span className="text-slate-500">{rightZoom}%</span>

            <div className="flex items-center space-x-0.5 pl-1.5 border-l border-dark-700">
              <button
                onClick={handlePrevCandidate}
                disabled={compareTargetIndex === 0}
                title="切换上一张候选片"
                className="p-0.5 hover:bg-dark-700 rounded disabled:opacity-30"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleNextCandidate}
                disabled={compareTargetIndex === photos.length - 1}
                title="切换下一张候选片"
                className="p-0.5 hover:bg-dark-700 rounded disabled:opacity-30"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 右侧 AI 诊断微标 */}
          <div className="absolute top-3 right-3 z-20">
            <span
              className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold flex items-center space-x-1 ${
                rightPhoto.retouch_status === 'clean'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : rightPhoto.retouch_status === 'fixable'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : rightPhoto.retouch_status === 'fatal'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  : rightPhoto.retouch_status === 'failed'
                  ? 'bg-orange-500/20 text-orange-300 border-orange-500/30'
                  : 'bg-slate-700/50 text-slate-300 border-slate-600'
              }`}
            >
              {rightPhoto.retouch_status === 'clean' && <Sparkles className="w-3 h-3" />}
              {rightPhoto.retouch_status === 'fixable' && <Wand2 className="w-3 h-3" />}
              {rightPhoto.retouch_status === 'fatal' && <AlertTriangle className="w-3 h-3" />}
              {rightPhoto.retouch_status === 'failed' && <AlertTriangle className="w-3 h-3" />}
              <span>{rightPhoto.retouch_status === 'clean' ? '未见明显问题' : rightPhoto.retouch_status === 'fixable' ? '可修解决' : rightPhoto.retouch_status === 'fatal' ? '不可修硬伤' : rightPhoto.retouch_status === 'failed' ? '分析失败' : '待分析'}</span>
            </span>
          </div>

          {/* 右侧独立定夺工具栏 */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center space-x-2 bg-dark-850/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-dark-700 shadow-xl text-xs">
            <button
              onClick={() => setComparePhotoPickStatus('Pick')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg font-semibold transition-all ${
                rightPhoto.pick_status === 'Pick'
                  ? 'bg-emerald-600 text-white'
                  : 'hover:bg-dark-700 text-slate-300'
              }`}
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>采纳右图</span>
            </button>
            <button
              onClick={() => setComparePhotoPickStatus('Reject')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg font-semibold transition-all ${
                rightPhoto.pick_status === 'Reject'
                  ? 'bg-rose-600 text-white'
                  : 'hover:bg-dark-700 text-slate-300'
              }`}
            >
              <X className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>排除右图</span>
            </button>
            <div className="flex items-center space-x-0.5 border-l border-dark-700 pl-1.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => setComparePhotoRating(rightPhoto.rating === s ? 0 : s)}
                  className={`p-1 ${s <= rightPhoto.rating ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'}`}
                >
                  <Star className="w-3.5 h-3.5 fill-current" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
