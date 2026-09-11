import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Application, Assets, Sprite, Container, Graphics, Text } from 'pixi.js';
import { AlertTriangle, Loader2, Maximize2, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import { useInsightStore } from '../../store/insightStore';
import { useAlbumStore } from '../../store/albumStore';
import { useThemeStore } from '../../store/themeStore';
import { useLutStore } from '../../store/lutStore';
import { getOrCreateLutTexture, LutFilter } from '../../utils/lutEngine';
import { LutControlBar } from './LutControlBar';
import { VisualPin } from '../../types/photo';
import clsx from 'clsx';

interface PixiCanvasProps {
  imageUrl: string | null;
  filename: string;
  previewStatus?: 'idle' | 'loading' | 'loaded' | 'error';
  previewError?: string | null;
  onRetryPreview?: () => void;
  isAddingPin?: boolean;
  onDropPin?: (normX: number, normY: number) => void;
  pins?: VisualPin[];
}

export const PixiCanvas: React.FC<PixiCanvasProps> = ({
  imageUrl,
  filename: _filename,
  previewStatus = 'loaded',
  previewError = null,
  onRetryPreview,
  isAddingPin = false,
  onDropPin,
  pins = [],
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const imageContainerRef = useRef<Container | null>(null);
  const pinsContainerRef = useRef<Container | null>(null);
  const spriteRef = useRef<Sprite | null>(null);
  const mouseDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const focusedFace = useInsightStore((state) => state.focusedFace);
  const effectiveTheme = useThemeStore((state) => state.effectiveTheme);
  const canvasBgColor = effectiveTheme === 'light' ? 0xf8fafc : 0x0d0f12;

  const photos = useAlbumStore((state) => state.photos);
  const currentIndex = useAlbumStore((state) => state.currentIndex);
  const activeLutId = useLutStore((state) => state.activeLutId);
  const photoLuts = useLutStore((state) => state.photoLuts);
  const hoverLutId = useLutStore((state) => state.hoverLutId);
  const isLutEnabled = useLutStore((state) => state.isEnabled);
  const lutIntensity = useLutStore((state) => state.intensity);
  const isLutBypassComparing = useLutStore((state) => state.isBypassComparing);
  const getCustomLutData = useLutStore((state) => state.getCustomLutData);
  const lutFilterRef = useRef<LutFilter | null>(null);

  const currentPhoto = photos[currentIndex];
  const currentPhotoLut = currentPhoto ? photoLuts[currentPhoto.id] : null;
  const effectiveLutId = currentPhoto ? currentPhotoLut?.lutId ?? null : activeLutId;
  const effectiveLutIntensity = currentPhoto ? (currentPhotoLut ? currentPhotoLut.intensity : lutIntensity) : lutIntensity;
  const activeDisplayLutId =
    hoverLutId === '__bypass__'
      ? null
      : hoverLutId !== null
      ? hoverLutId
      : effectiveLutId;

  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [pixiStatus, setPixiStatus] = useState<'initializing' | 'ready' | 'error'>('initializing');
  const [imageStatus, setImageStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initAttempt, setInitAttempt] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [textureVersion, setTextureVersion] = useState(0);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const keepPinMarkersReadable = useCallback(() => {
    const scale = imageContainerRef.current?.scale.x;
    if (!scale || !pinsContainerRef.current) return;
    const inverseScale = 1 / Math.max(scale, 0.001);
    for (const marker of pinsContainerRef.current.children) {
      marker.scale.set(inverseScale);
    }
  }, []);

  const getFitScale = useCallback(() => {
    if (!appRef.current || !spriteRef.current) return 1.0;
    const app = appRef.current;
    const sprite = spriteRef.current;
    const scaleX = (app.screen.width * 0.92) / sprite.texture.width;
    const scaleY = (app.screen.height * 0.92) / sprite.texture.height;
    return Math.min(scaleX, scaleY, 1.0);
  }, []);

  const fitImageToViewport = useCallback(() => {
    if (!imageContainerRef.current || !appRef.current || !spriteRef.current) return;
    const app = appRef.current;
    const container = imageContainerRef.current;
    const fitScale = getFitScale();

    container.x = app.screen.width / 2;
    container.y = app.screen.height / 2;
    container.scale.set(fitScale);
    keepPinMarkersReadable();
    setZoomLevel(Math.round(fitScale * 100));
  }, [getFitScale, keepPinMarkersReadable]);

  // 视口平移越界硬约束算法：防止照片被拖丢出屏幕，并在全屏/缩小状态强吸附中心
  const clampPosition = useCallback(
    (x: number, y: number, scale: number): { x: number; y: number } => {
      if (!appRef.current || !spriteRef.current) return { x, y };
      const app = appRef.current;
      const sprite = spriteRef.current;
      const fitScale = getFitScale();

      // 当图片在适配全屏比例（或以下）时，强制锚定屏幕绝对中心，杜绝任何偏斜
      if (scale <= fitScale + 0.005) {
        return { x: app.screen.width / 2, y: app.screen.height / 2 };
      }

      const imgW = sprite.texture.width * scale;
      const imgH = sprite.texture.height * scale;
      const W = app.screen.width;
      const H = app.screen.height;

      let clampedX = x;
      let clampedY = y;

      // 水平方向边界保护：允许留有适度缓冲余量 (slack)，保证摄影师能滑至最边缘细节，但绝不脱出视野
      if (imgW <= W) {
        clampedX = W / 2;
      } else {
        const slackX = Math.min(W * 0.25, 120);
        const minX = W - imgW / 2 - slackX;
        const maxX = imgW / 2 + slackX;
        clampedX = Math.max(minX, Math.min(maxX, x));
      }

      // 垂直方向边界保护
      if (imgH <= H) {
        clampedY = H / 2;
      } else {
        const slackY = Math.min(H * 0.25, 120);
        const minY = H - imgH / 2 - slackY;
        const maxY = imgH / 2 + slackY;
        clampedY = Math.max(minY, Math.min(maxY, y));
      }

      return { x: clampedX, y: clampedY };
    },
    [getFitScale],
  );

  useEffect(() => {
    let isMounted = true;
    const parent = containerRef.current;
    if (!parent) return;

    const app = new Application();
    setPixiStatus('initializing');
    setLoadError(null);

    const initPixi = async () => {
      try {
        await app.init({
          resizeTo: parent,
          backgroundColor: canvasBgColor,
          antialias: true,
          autoDensity: true,
          resolution: window.devicePixelRatio || 1,
        });
      } catch (error) {
        if (isMounted) {
          setPixiStatus('error');
          setLoadError(`图形渲染器初始化失败：${String(error)}`);
        }
        return;
      }

      if (!isMounted) {
        app.destroy(true);
        return;
      }

      appRef.current = app;
      parent.appendChild(app.canvas);

      const stageContainer = new Container();
      app.stage.addChild(stageContainer);
      imageContainerRef.current = stageContainer;
      setPixiStatus('ready');
    };

    void initPixi();

    return () => {
      isMounted = false;
      if (appRef.current) {
        try {
          appRef.current.destroy(true, { children: true, texture: false });
        } catch (e) {
          console.error(e);
        }
        appRef.current = null;
      }
      imageContainerRef.current = null;
      spriteRef.current = null;
    };
  }, [initAttempt]);

  // 主题切换时动态更新画布背景色
  useEffect(() => {
    if (appRef.current && appRef.current.renderer) {
      appRef.current.renderer.background.color = canvasBgColor;
    }
  }, [canvasBgColor]);

  // 修图侧栏开关或窗口尺寸变化时，让画布与照片自动适配剩余空间。
  useEffect(() => {
    const parent = containerRef.current;
    if (!parent || pixiStatus !== 'ready' || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(([entry]) => {
      const app = appRef.current;
      if (!app || entry.contentRect.width <= 0 || entry.contentRect.height <= 0) return;
      app.renderer.resize(
        Math.round(entry.contentRect.width),
        Math.round(entry.contentRect.height),
      );
      fitImageToViewport();
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [fitImageToViewport, pixiStatus]);

  // 当图片 URL 切换时，更新纹理（采用双缓冲就地置换，彻底消除切图黑屏闪烁）
  useEffect(() => {
    if (!imageUrl) {
      if (imageContainerRef.current) {
        imageContainerRef.current.children.forEach((child) => child.destroy());
        imageContainerRef.current.removeChildren();
      }
      spriteRef.current = null;
      pinsContainerRef.current = null;
      setImageStatus('idle');
      setLoadError(null);
      return;
    }
    if (pixiStatus !== 'ready' || !appRef.current || !imageContainerRef.current) return;

    let isCurrent = true;
    // 若已有底片呈现，保持当前画面，直到新纹理载入完成直接替换，消除黑屏闪烁
    if (!spriteRef.current) {
      setImageStatus('loading');
    }
    setLoadError(null);

    const loadTexture = async () => {
      try {
        const texture = await Assets.load(imageUrl);
        if (!isCurrent || !imageContainerRef.current || !appRef.current) return;

        const container = imageContainerRef.current;
        if (spriteRef.current) {
          // 双缓冲原位替换：直接换装新纹理
          spriteRef.current.texture = texture;
        } else {
          // 初次挂载生成主精灵与图钉层
          const sprite = new Sprite(texture);
          sprite.anchor.set(0.5);
          container.addChild(sprite);
          spriteRef.current = sprite;

          const pinsLayer = new Container();
          container.addChild(pinsLayer);
          pinsContainerRef.current = pinsLayer;
        }

        fitImageToViewport();
        setImageStatus('loaded');
        setTextureVersion((v) => v + 1);
      } catch (e) {
        console.error('Failed to render Pixi texture', e);
        if (isCurrent) {
          setImageStatus('error');
          setLoadError(`无法载入当前预览：${String(e)}`);
        }
      }
    };

    void loadTexture();

    return () => {
      isCurrent = false;
    };
  }, [fitImageToViewport, imageUrl, pixiStatus, loadAttempt]);

  // 应用 3D LUT 胶片调色实时预览 Filter
  useEffect(() => {
    const sprite = spriteRef.current;
    if (!sprite) return;

    const isHovering = hoverLutId !== null;
    const effectiveIntensity =
      (!isLutEnabled && !isHovering) || isLutBypassComparing || !activeDisplayLutId
        ? 0.0
        : effectiveLutIntensity > 0
        ? effectiveLutIntensity
        : 0.85;

    if (!activeDisplayLutId || effectiveIntensity <= 0.001) {
      sprite.filters = [];
      return;
    }

    try {
      const customData = activeDisplayLutId.startsWith('custom_') ? getCustomLutData(activeDisplayLutId) : undefined;
      const { texture, size } = getOrCreateLutTexture(activeDisplayLutId, customData || undefined);

      if (!lutFilterRef.current) {
        lutFilterRef.current = new LutFilter(texture, size, effectiveIntensity);
      } else {
        lutFilterRef.current.updateLut(texture, size);
        lutFilterRef.current.intensity = effectiveIntensity;
      }

      sprite.filters = [lutFilterRef.current];
    } catch (err) {
      console.error('应用 3D LUT 滤镜失败:', err);
      sprite.filters = [];
    }
  }, [activeDisplayLutId, effectiveLutIntensity, isLutEnabled, isLutBypassComparing, hoverLutId, getCustomLutData, imageStatus, textureVersion]);

  // 渲染图上 Pin 针标记层
  useEffect(() => {
    if (!pinsContainerRef.current || !spriteRef.current) return;
    const pinsLayer = pinsContainerRef.current;
    const sprite = spriteRef.current;

    // 清空现有 pin 针子节点
    pinsLayer.removeChildren();

    if (!pins || pins.length === 0) return;

    for (const pin of pins) {
      const pinX = (pin.x - 0.5) * sprite.texture.width;
      const pinY = (pin.y - 0.5) * sprite.texture.height;

      const marker = new Container();
      marker.position.set(pinX, pinY);

      const target = new Graphics();
      target.circle(0, 0, 22);
      target.fill({ color: 0xef4444, alpha: 0.24 });
      target.circle(0, 0, 16);
      target.fill({ color: 0xdc2626 });
      target.stroke({ color: 0xffffff, width: 3 });
      target.moveTo(-25, 0);
      target.lineTo(-18, 0);
      target.moveTo(18, 0);
      target.lineTo(25, 0);
      target.moveTo(0, -25);
      target.lineTo(0, -18);
      target.moveTo(0, 18);
      target.lineTo(0, 25);
      target.stroke({ color: 0xfef2f2, width: 2 });
      marker.addChild(target);

      const text = new Text({
        text: String(pin.pinIndex),
        style: {
          fontFamily: 'sans-serif',
          fontSize: 14,
          fontWeight: 'bold',
          fill: 0xffffff,
          align: 'center',
        },
      });
      text.anchor.set(0.5);
      marker.addChild(text);
      marker.scale.set(1 / Math.max(imageContainerRef.current?.scale.x || 1, 0.001));
      pinsLayer.addChild(marker);
    }
  }, [pins, imageStatus, textureVersion]);

  // 当摄影师点击 Face Loupe 人脸特写卡片时，平滑聚焦与居中放大至对应人物
  useEffect(() => {
    if (!focusedFace || !imageContainerRef.current || !appRef.current || !spriteRef.current) return;
    const app = appRef.current;
    const sprite = spriteRef.current;
    const container = imageContainerRef.current;

    const targetScale = Math.min(Math.max(1.6, 0.38 / (focusedFace.width || 0.15)), 4.0);

    const facePixelX = (focusedFace.x + focusedFace.width / 2) * sprite.texture.width;
    const facePixelY = (focusedFace.y + focusedFace.height / 2) * sprite.texture.height;

    const relX = facePixelX - sprite.texture.width / 2;
    const relY = facePixelY - sprite.texture.height / 2;

    container.scale.set(targetScale);
    container.x = app.screen.width / 2 - relX * targetScale;
    container.y = app.screen.height / 2 - relY * targetScale;
    setZoomLevel(Math.round(targetScale * 100));
    keepPinMarkersReadable();
  }, [focusedFace, keepPinMarkersReadable]);

  // 触控板轻扫切图跟踪引用
  const swipeDeltaXRef = useRef(0);
  const swipeCooldownRef = useRef(0);
  const swipeResetTimeoutRef = useRef<number | null>(null);

  // 全局鼠标按键释放与窗口失焦监听：彻底杜绝鼠标快速甩出窗口外部松手时的“粘滞拖拽”
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsPanning(false);
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('blur', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('blur', handleGlobalMouseUp);
    };
  }, []);

  // 滚轮与触控板手势监听：区分双指捏合缩放 (Pinch)、双指滑动平移 (Pan)、全屏双指轻扫切图与实体鼠标滚轮
  const handleWheel = (e: React.WheelEvent) => {
    if (!imageContainerRef.current || !appRef.current || !containerRef.current || !spriteRef.current) return;
    e.preventDefault();

    const container = imageContainerRef.current;
    const app = appRef.current;
    const fitScale = getFitScale();
    const oldScale = container.scale.x;

    // 1. 双指捏合缩放 (Pinch-to-zoom: macOS 标准触发 e.ctrlKey === true) 或 按住 Cmd/Alt 的滚轮缩放
    const isPinchZoom = e.ctrlKey;
    const isModifierZoom = e.metaKey || e.altKey;
    // 物理鼠标滚轮通常为较大整数阶梯 (如 100/120) 且无 X 轴分量
    const isMouseWheel = e.deltaMode !== 0 || (Math.abs(e.deltaY) >= 50 && e.deltaX === 0);

    if (isPinchZoom || isModifierZoom || isMouseWheel) {
      const zoomFactor = isPinchZoom
        ? Math.exp(-e.deltaY * 0.01)
        : isModifierZoom
        ? Math.exp(-e.deltaY * 0.005)
        : e.deltaY < 0
        ? 1.15
        : 0.85;

      const targetScale = oldScale * zoomFactor;
      // 设定底片缩放最小为 fitScale（整图完全适配视口），杜绝缩小成左下角/右下角邮票
      const newScale = Math.max(fitScale, Math.min(targetScale, 8.0));

      if (newScale <= fitScale + 0.001) {
        // 当缩小到完整全屏展示或以下时，强约束吸附居中，彻底消除左下/右下偏移
        container.scale.set(fitScale);
        container.x = app.screen.width / 2;
        container.y = app.screen.height / 2;
        setZoomLevel(Math.round(fitScale * 100));
      } else {
        // 放大时（检查对焦/细节），以光标指针为中心进行平滑缩放，并施加视口边界安全约束
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const rawX = mouseX - (mouseX - container.x) * (newScale / oldScale);
        const rawY = mouseY - (mouseY - container.y) * (newScale / oldScale);
        const { x: clampedX, y: clampedY } = clampPosition(rawX, rawY, newScale);

        container.x = clampedX;
        container.y = clampedY;
        container.scale.set(newScale);
        setZoomLevel(Math.round(newScale * 100));
      }
      keepPinMarkersReadable();
      return;
    }

    // 2. 双指滑动平移或轻扫切图 (Pan / Swipe: !e.ctrlKey)
    if (oldScale > fitScale + 0.005) {
      // 放大状态：双指平移视角查看细节，施加边界硬约束
      const rawX = container.x - e.deltaX;
      const rawY = container.y - e.deltaY;
      const { x: clampedX, y: clampedY } = clampPosition(rawX, rawY, oldScale);
      container.x = clampedX;
      container.y = clampedY;
      keepPinMarkersReadable();
    } else {
      // 全屏未放大状态：触控板双指横向轻扫触发切换上一张/下一张
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 2) {
        swipeDeltaXRef.current += e.deltaX;
        if (swipeResetTimeoutRef.current) {
          clearTimeout(swipeResetTimeoutRef.current);
        }
        swipeResetTimeoutRef.current = window.setTimeout(() => {
          swipeDeltaXRef.current = 0;
        }, 280);

        const now = performance.now();
        if (now - swipeCooldownRef.current > 350) {
          if (swipeDeltaXRef.current > 70) {
            useAlbumStore.getState().nextPhoto();
            swipeDeltaXRef.current = 0;
            swipeCooldownRef.current = now;
          } else if (swipeDeltaXRef.current < -70) {
            useAlbumStore.getState().prevPhoto();
            swipeDeltaXRef.current = 0;
            swipeCooldownRef.current = now;
          }
        }
      }
    }
  };

  // 双击画布切换放大对焦与全屏适配
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!imageContainerRef.current || !appRef.current || !spriteRef.current || !containerRef.current) return;
    const container = imageContainerRef.current;
    const fitScale = getFitScale();
    const isCurrentlyFit = Math.abs(container.scale.x - fitScale) < 0.05;

    if (isCurrentlyFit) {
      const targetScale = Math.max(1.0, fitScale * 2.0);
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const rawX = mouseX - (mouseX - container.x) * (targetScale / container.scale.x);
      const rawY = mouseY - (mouseY - container.y) * (targetScale / container.scale.y);
      const { x: clampedX, y: clampedY } = clampPosition(rawX, rawY, targetScale);

      container.x = clampedX;
      container.y = clampedY;
      container.scale.set(targetScale);
      setZoomLevel(Math.round(targetScale * 100));
    } else {
      fitImageToViewport();
    }
    keepPinMarkersReadable();
  };

  // 鼠标拖动画布：仅在放大查看细节时响应平移，全屏适配状态禁止破坏居中
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
      const fitScale = getFitScale();
      const currentScale = imageContainerRef.current?.scale.x ?? 1.0;

      if (currentScale > fitScale + 0.01) {
        setIsPanning(true);
        dragStartRef.current = { x: e.clientX, y: e.clientY };
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || !imageContainerRef.current) return;
    const container = imageContainerRef.current;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    const rawX = container.x + dx;
    const rawY = container.y + dy;
    const { x: clampedX, y: clampedY } = clampPosition(rawX, rawY, container.scale.x);

    container.x = clampedX;
    container.y = clampedY;

    dragStartRef.current = { x: e.clientX, y: e.clientY };
    keepPinMarkersReadable();
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    setIsPanning(false);

    // 点图落针模式：若未发生大幅拖拽（点击），换算归一化坐标并落针
    if (isAddingPin && onDropPin && spriteRef.current && imageContainerRef.current && containerRef.current) {
      const dist = Math.hypot(
        e.clientX - mouseDownPosRef.current.x,
        e.clientY - mouseDownPosRef.current.y,
      );
      if (dist < 6) {
        const rect = containerRef.current.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;

        const container = imageContainerRef.current;
        const sprite = spriteRef.current;

        const localX = (clientX - container.x) / container.scale.x;
        const localY = (clientY - container.y) / container.scale.y;

        const normX = (localX + sprite.texture.width / 2) / sprite.texture.width;
        const normY = (localY + sprite.texture.height / 2) / sprite.texture.height;

        if (normX >= 0 && normX <= 1 && normY >= 0 && normY <= 1) {
          onDropPin(normX, normY);
        }
      }
    }
  };

  // 100% 点对点与重置适配
  const resetToFit = () => {
    fitImageToViewport();
  };

  const zoomTo100 = () => {
    if (!imageContainerRef.current || !appRef.current) return;
    const app = appRef.current;
    const container = imageContainerRef.current;
    container.x = app.screen.width / 2;
    container.y = app.screen.height / 2;
    container.scale.set(1.0);
    keepPinMarkersReadable();
    setZoomLevel(100);
  };

  const fitZoom = Math.round(getFitScale() * 100);
  const isZoomed = zoomLevel > fitZoom + 1;

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className={clsx(
        'relative w-full h-full overflow-hidden bg-dark-900 select-none',
        isAddingPin
          ? 'cursor-crosshair'
          : isPanning
          ? 'cursor-grabbing'
          : isZoomed
          ? 'cursor-grab'
          : 'cursor-default',
      )}
    >
      {isAddingPin && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full border border-rose-400/60 bg-rose-950/90 px-3 py-1.5 text-xs font-semibold text-rose-100 shadow-lg shadow-black/40">
          点击照片中的修图位置，将生成醒目的编号标注
        </div>
      )}
      {(pixiStatus === 'initializing' || previewStatus === 'loading' || imageStatus === 'loading') && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-dark-900/55">
          <div className="flex items-center gap-2 rounded-lg border border-dark-700 bg-dark-800/90 px-3 py-2 text-xs text-slate-300 shadow-lg">
            <Loader2 className="h-4 w-4 animate-spin text-brand-400" />
            <span>{pixiStatus === 'initializing' ? '正在初始化图形渲染器…' : '正在载入预览…'}</span>
          </div>
        </div>
      )}

      {(pixiStatus === 'error' || previewStatus === 'error' || imageStatus === 'error') && (
        <div className="absolute inset-0 z-[6] flex items-center justify-center bg-dark-900/90 p-6">
          <div className="max-w-md rounded-xl border border-amber-500/35 bg-dark-800 p-5 text-center shadow-xl">
            <AlertTriangle className="mx-auto h-7 w-7 text-amber-400" />
            <h3 className="mt-3 text-sm font-semibold text-slate-100">预览暂时无法显示</h3>
            <p className="mt-1 break-words text-xs leading-relaxed text-slate-400">{previewError || loadError}</p>
            <button
              onClick={() => {
                if (previewStatus === 'error' && onRetryPreview) {
                  onRetryPreview();
                } else if (pixiStatus === 'error') {
                  setInitAttempt((attempt) => attempt + 1);
                } else {
                  setLoadAttempt((attempt) => attempt + 1);
                }
              }}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-brand-500/40 bg-brand-500/15 px-3 py-1.5 text-xs text-brand-200 hover:bg-brand-500/25"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重试预览
            </button>
          </div>
        </div>
      )}

      {/* 悬浮控制栏（3D LUT 胶片调色 + 缩放控制） */}
      <div className="absolute top-4 right-4 z-10 flex items-center space-x-2">
        <LutControlBar />

        {/* 悬浮缩放控制栏 */}
        <div className="flex items-center space-x-1.5 bg-dark-800/80 backdrop-blur border border-dark-700/80 px-2.5 py-1.5 rounded-lg shadow-lg text-slate-300 text-xs">
          <span className="font-mono text-slate-400 w-12 text-center">{zoomLevel}%</span>
          <div className="w-[1px] h-3.5 bg-dark-600" />
          <button
            onClick={resetToFit}
            title="适应屏幕"
            className="p-1 hover:bg-dark-700 rounded transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={zoomTo100}
            title="1:1 显示当前内嵌或代理预览的实际像素，不代表完整 RAW 像素"
            className="px-1.5 py-0.5 hover:bg-dark-700 rounded text-[11px] font-mono transition-colors cursor-pointer"
          >
            1:1 预览
          </button>
          <button
            onClick={() => {
              if (imageContainerRef.current) {
                const s = Math.min(imageContainerRef.current.scale.x * 1.25, 8.0);
                imageContainerRef.current.scale.set(s);
                setZoomLevel(Math.round(s * 100));
              }
            }}
            title="放大"
            className="p-1 hover:bg-dark-700 rounded transition-colors cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              if (imageContainerRef.current) {
                const s = Math.max(imageContainerRef.current.scale.x * 0.8, 0.1);
                imageContainerRef.current.scale.set(s);
                setZoomLevel(Math.round(s * 100));
              }
            }}
            title="缩小"
            className="p-1 hover:bg-dark-700 rounded transition-colors cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
