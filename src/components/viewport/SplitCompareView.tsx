import React, { useEffect, useRef, useState } from 'react';
import { Application, Assets, Sprite, Container } from 'pixi.js';
import { useAlbumStore } from '../../store/albumStore';
import { useCompareStore } from '../../store/compareStore';
import { useSelectionStore } from '../../store/selectionStore';
import { usePreviewStore } from '../../store/previewStore';
import { useInsightStore } from '../../store/insightStore';
import { useThemeStore } from '../../store/themeStore';
import { useLutStore } from '../../store/lutStore';
import { useAdjustStore } from '../../store/adjustStore';
import { getOrCreateLutTexture, LutFilter } from '../../utils/lutEngine';
import {
  ArrowRightLeft,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Layers,
  HelpCircle,
  Eye,
  Lock,
  Unlock,
  Maximize2,
  Sparkles,
  Sliders,
} from 'lucide-react';
import { computeVisualSimilarity } from '../../utils/phashUtils';

export const SplitCompareView: React.FC = () => {
  const { photos, currentIndex } = useAlbumStore();
  const {
    compareScope,
    setCompareScope,
    compareTargetIndex,
    comparePreviewUrl,
    comparePreviewStatus,
    comparePreviewError,
    syncZoomAndPan,
    lastSwapTimestamp,
    toggleSyncZoomAndPan,
    swapComparePhotos,
    exitCompareMode,
    nextCompareCandidate,
    prevCompareCandidate,
    retryComparePreview,
    chooseLeft,
    chooseRight,
    chooseBoth,
    deferBoth,
    nextSimilarGroup,
  } = useCompareStore();
  const { selections } = useSelectionStore();
  const { currentPreviewUrl, previewStatus, previewError, retryCurrentPreview } = usePreviewStore();
  const { getInsight } = useInsightStore();
  const effectiveTheme = useThemeStore((state) => state.effectiveTheme);
  const canvasBgColor = effectiveTheme === 'light' ? 0xf8fafc : 0x0a0c10;

  const leftContainerRef = useRef<HTMLDivElement>(null);
  const rightContainerRef = useRef<HTMLDivElement>(null);

  const leftAppRef = useRef<Application | null>(null);
  const rightAppRef = useRef<Application | null>(null);

  const leftImageContainerRef = useRef<Container | null>(null);
  const rightImageContainerRef = useRef<Container | null>(null);
  const leftSpriteRef = useRef<Sprite | null>(null);
  const rightSpriteRef = useRef<Sprite | null>(null);

  const activeLutId = useLutStore((state) => state.activeLutId);
  const photoLuts = useLutStore((state) => state.photoLuts);
  const isLutEnabled = useLutStore((state) => state.isEnabled);
  const lutIntensity = useLutStore((state) => state.intensity);
  const isLutBypassComparing = useLutStore((state) => state.isBypassComparing);
  const getCustomLutData = useLutStore((state) => state.getCustomLutData);
  const leftLutFilterRef = useRef<LutFilter | null>(null);
  const rightLutFilterRef = useRef<LutFilter | null>(null);

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
  const [isBlinking, setIsBlinking] = useState(false);

  const leftIsPanning = useRef<boolean>(false);
  const rightIsPanning = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isRecentlySwapped = Boolean(lastSwapTimestamp && Date.now() - lastSwapTimestamp < 450);

  const leftPhoto = photos[currentIndex];
  const rightPhoto = compareTargetIndex !== null ? photos[compareTargetIndex] : null;

  const leftLutConfig = leftPhoto ? photoLuts[leftPhoto.id] : null;
  const rightLutConfig = rightPhoto ? photoLuts[rightPhoto.id] : null;

  const leftEffectiveLutId = leftPhoto ? leftLutConfig?.lutId ?? null : activeLutId;
  const leftEffectiveIntensity = !isLutEnabled || isLutBypassComparing || !leftEffectiveLutId
    ? 0.0
    : (leftLutConfig?.intensity ?? lutIntensity);

  const rightEffectiveLutId = rightPhoto ? rightLutConfig?.lutId ?? null : activeLutId;
  const rightEffectiveIntensity = !isLutEnabled || isLutBypassComparing || !rightEffectiveLutId
    ? 0.0
    : (rightLutConfig?.intensity ?? lutIntensity);

  const leftBurstId = leftPhoto?.burstGroupId;

  const leftSelection = leftPhoto ? selections[leftPhoto.id]?.state || 'unreviewed' : 'unreviewed';
  const rightSelection = rightPhoto ? selections[rightPhoto.id]?.state || 'unreviewed' : 'unreviewed';

  const leftInsight = leftPhoto ? getInsight(leftPhoto.id) : null;
  const rightInsight = rightPhoto ? getInsight(rightPhoto.id) : null;

  const visualSimilarity = React.useMemo(() => {
    if (!leftPhoto?.phash || !rightPhoto?.phash) return null;
    return computeVisualSimilarity(leftPhoto.phash, rightPhoto.phash);
  }, [leftPhoto?.phash, rightPhoto?.phash]);

  const burstPhotos = React.useMemo(() => {
    if (!leftBurstId) return [];
    return photos.filter((photo) => photo.burstGroupId === leftBurstId);
  }, [photos, leftBurstId]);

  const burstTotalCount = burstPhotos.length;
  const similarGroupIds = React.useMemo(
    () => Array.from(new Set(photos.flatMap((photo) => (photo.burstGroupId ? [photo.burstGroupId] : [])))),
    [photos],
  );
  const currentSimilarGroupPosition = leftBurstId
    ? similarGroupIds.indexOf(leftBurstId) + 1
    : 0;
  const burstCandidatePosition = React.useMemo(() => {
    if (!rightPhoto || !leftBurstId) return 1;
    const idx = burstPhotos.findIndex((p) => p.path === rightPhoto.path);
    return idx >= 0 ? idx + 1 : 1;
  }, [burstPhotos, rightPhoto, leftBurstId]);

  // 瞬时闪烁比对按键监听 (按住 B 临时切换左图为右图)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.key === 'b' || e.key === 'B') && !e.repeat) {
        e.preventDefault();
        setIsBlinking(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        setIsBlinking(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // 闪烁切换左图 Pixi 纹理
  useEffect(() => {
    const sprite = leftSpriteRef.current;
    if (!sprite) return;
    if (isBlinking && comparePreviewUrl) {
      try {
        const candidateTexture = Assets.get(comparePreviewUrl);
        if (candidateTexture) {
          sprite.texture = candidateTexture;
        }
      } catch (e) {
        console.error(e);
      }
    } else if (currentPreviewUrl) {
      try {
        const mainTexture = Assets.get(currentPreviewUrl);
        if (mainTexture) {
          sprite.texture = mainTexture;
        }
      } catch (e) {
        console.error(e);
      }
    }
  }, [isBlinking, currentPreviewUrl, comparePreviewUrl]);

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
          backgroundColor: canvasBgColor,
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
          backgroundColor: canvasBgColor,
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

  // 主题切换时动态更新双图画布背景色
  useEffect(() => {
    if (leftAppRef.current?.renderer) {
      leftAppRef.current.renderer.background.color = canvasBgColor;
    }
    if (rightAppRef.current?.renderer) {
      rightAppRef.current.renderer.background.color = canvasBgColor;
    }
  }, [canvasBgColor]);

  // 加载左图纹理 (双缓冲原位替换，消除黑屏闪烁)
  const [leftTextureVersion, setLeftTextureVersion] = useState(0);

  useEffect(() => {
    if (!currentPreviewUrl || !leftReady || !leftAppRef.current || !leftImageContainerRef.current) return;
    let isCurrent = true;
    if (!leftSpriteRef.current) {
      setLeftRenderStatus('loading');
    }
    setLeftRenderError(null);

    const loadTexture = async () => {
      try {
        const texture = await Assets.load(currentPreviewUrl);
        if (!isCurrent || !leftAppRef.current || !leftImageContainerRef.current) return;
        const container = leftImageContainerRef.current;

        if (leftSpriteRef.current) {
          leftSpriteRef.current.texture = texture;
        } else {
          const sprite = new Sprite(texture);
          leftSpriteRef.current = sprite;
          sprite.anchor.set(0.5);
          container.addChild(sprite);
        }

        const app = leftAppRef.current;
        const scaleX = (app.screen.width * 0.9) / texture.width;
        const scaleY = (app.screen.height * 0.9) / texture.height;
        const fitScale = Math.min(scaleX, scaleY, 1.0);

        container.x = app.screen.width / 2;
        container.y = app.screen.height / 2;
        container.scale.set(fitScale);

        setLeftZoom(Math.round(fitScale * 100));
        setLeftRenderStatus('loaded');
        setLeftTextureVersion((v) => v + 1);
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

  // 加载右图纹理 (双缓冲原位替换，消除黑屏闪烁)
  const [rightTextureVersion, setRightTextureVersion] = useState(0);

  useEffect(() => {
    if (!comparePreviewUrl || !rightReady || !rightAppRef.current || !rightImageContainerRef.current) return;
    let isCurrent = true;
    if (!rightSpriteRef.current) {
      setRightRenderStatus('loading');
    }
    setRightRenderError(null);

    const loadTexture = async () => {
      try {
        const texture = await Assets.load(comparePreviewUrl);
        if (!isCurrent || !rightAppRef.current || !rightImageContainerRef.current) return;
        const container = rightImageContainerRef.current;

        if (rightSpriteRef.current) {
          rightSpriteRef.current.texture = texture;
        } else {
          const sprite = new Sprite(texture);
          rightSpriteRef.current = sprite;
          sprite.anchor.set(0.5);
          container.addChild(sprite);
        }

        const app = rightAppRef.current;
        const scaleX = (app.screen.width * 0.9) / texture.width;
        const scaleY = (app.screen.height * 0.9) / texture.height;
        const fitScale = Math.min(scaleX, scaleY, 1.0);

        container.x = app.screen.width / 2;
        container.y = app.screen.height / 2;
        container.scale.set(fitScale);

        setRightZoom(Math.round(fitScale * 100));
        setRightRenderStatus('loaded');
        setRightTextureVersion((v) => v + 1);
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

  // 双图分屏同步应用 3D LUT 滤镜
  // 应用 3D LUT 胶片调色实时对比 Filter (左右视图独立支持不同 LUT 渲染)
  useEffect(() => {
    const leftSprite = leftSpriteRef.current;
    const rightSprite = rightSpriteRef.current;
    if (!leftSprite && !rightSprite) return;

    if (leftSprite) {
      if (!leftEffectiveLutId || leftEffectiveIntensity <= 0.001) {
        leftSprite.filters = [];
      } else {
        try {
          const customData = leftEffectiveLutId.startsWith('custom_') ? getCustomLutData(leftEffectiveLutId) : undefined;
          const { texture, size } = getOrCreateLutTexture(leftEffectiveLutId, customData || undefined);

          if (!leftLutFilterRef.current) {
            leftLutFilterRef.current = new LutFilter(texture, size, leftEffectiveIntensity);
          } else {
            leftLutFilterRef.current.updateLut(texture, size);
            leftLutFilterRef.current.intensity = leftEffectiveIntensity;
          }
          leftSprite.filters = [leftLutFilterRef.current];
        } catch (err) {
          console.error('应用左图 3D LUT 失败:', err);
          leftSprite.filters = [];
        }
      }
    }

    if (rightSprite) {
      if (!rightEffectiveLutId || rightEffectiveIntensity <= 0.001) {
        rightSprite.filters = [];
      } else {
        try {
          const customData = rightEffectiveLutId.startsWith('custom_') ? getCustomLutData(rightEffectiveLutId) : undefined;
          const { texture, size } = getOrCreateLutTexture(rightEffectiveLutId, customData || undefined);

          if (!rightLutFilterRef.current) {
            rightLutFilterRef.current = new LutFilter(texture, size, rightEffectiveIntensity);
          } else {
            rightLutFilterRef.current.updateLut(texture, size);
            rightLutFilterRef.current.intensity = rightEffectiveIntensity;
          }
          rightSprite.filters = [rightLutFilterRef.current];
        } catch (err) {
          console.error('应用右图 3D LUT 失败:', err);
          rightSprite.filters = [];
        }
      }
    }
  }, [
    leftEffectiveLutId,
    leftEffectiveIntensity,
    rightEffectiveLutId,
    rightEffectiveIntensity,
    getCustomLutData,
    leftRenderStatus,
    rightRenderStatus,
    leftTextureVersion,
    rightTextureVersion,
  ]);

  const getLeftFitScale = () => {
    if (!leftAppRef.current || !leftSpriteRef.current) return 1.0;
    const app = leftAppRef.current;
    const sprite = leftSpriteRef.current;
    return Math.min((app.screen.width * 0.9) / sprite.texture.width, (app.screen.height * 0.9) / sprite.texture.height, 1.0);
  };

  const getRightFitScale = () => {
    if (!rightAppRef.current || !rightSpriteRef.current) return 1.0;
    const app = rightAppRef.current;
    const sprite = rightSpriteRef.current;
    return Math.min((app.screen.width * 0.9) / sprite.texture.width, (app.screen.height * 0.9) / sprite.texture.height, 1.0);
  };

  // 视口平移越界硬约束算法：防止对比画面被拖出视口，最小比例吸附中央
  const clampPosition = (
    x: number,
    y: number,
    scale: number,
    app: Application | null,
    sprite: Sprite | null,
    fitScale: number,
  ): { x: number; y: number } => {
    if (!app || !sprite) return { x, y };

    if (scale <= fitScale + 0.005) {
      return { x: app.screen.width / 2, y: app.screen.height / 2 };
    }

    const imgW = sprite.texture.width * scale;
    const imgH = sprite.texture.height * scale;
    const W = app.screen.width;
    const H = app.screen.height;

    let clampedX = x;
    let clampedY = y;

    if (imgW <= W) {
      clampedX = W / 2;
    } else {
      const slackX = Math.min(W * 0.25, 120);
      const minX = W - imgW / 2 - slackX;
      const maxX = imgW / 2 + slackX;
      clampedX = Math.max(minX, Math.min(maxX, x));
    }

    if (imgH <= H) {
      clampedY = H / 2;
    } else {
      const slackY = Math.min(H * 0.25, 120);
      const minY = H - imgH / 2 - slackY;
      const maxY = imgH / 2 + slackY;
      clampedY = Math.max(minY, Math.min(maxY, y));
    }

    return { x: clampedX, y: clampedY };
  };

  // 全局鼠标按键释放与失焦监听：杜绝分屏对比中鼠标划过分割线或窗外松开后的粘滞拖拽
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      leftIsPanning.current = false;
      rightIsPanning.current = false;
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('blur', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('blur', handleGlobalMouseUp);
    };
  }, []);

  // 滚轮与触控板缩放处理 (支持双指捏合缩放、双指滑动平移与双画布联动)
  const handleWheel = (e: React.WheelEvent, isLeft: boolean) => {
    e.preventDefault();

    const isPinchZoom = e.ctrlKey;
    const isModifierZoom = e.metaKey || e.altKey;
    const isMouseWheel = e.deltaMode !== 0 || (Math.abs(e.deltaY) >= 50 && e.deltaX === 0);

    const targetWrapper = isLeft ? leftContainerRef.current : rightContainerRef.current;
    const rect = targetWrapper?.getBoundingClientRect();
    const mouseX = rect ? e.clientX - rect.left : 0;
    const mouseY = rect ? e.clientY - rect.top : 0;

    const applyZoom = (
      container: Container | null,
      app: Application | null,
      sprite: Sprite | null,
      fitScale: number,
      setZoom: (z: number) => void,
    ) => {
      if (!container || !app || !sprite) return;
      const oldScale = container.scale.x;
      const zoomFactor = isPinchZoom
        ? Math.exp(-e.deltaY * 0.01)
        : isModifierZoom
        ? Math.exp(-e.deltaY * 0.005)
        : e.deltaY < 0
        ? 1.15
        : 0.85;

      const targetScale = oldScale * zoomFactor;
      const newScale = Math.max(fitScale, Math.min(targetScale, 8.0));

      if (newScale <= fitScale + 0.001) {
        container.scale.set(fitScale);
        container.x = app.screen.width / 2;
        container.y = app.screen.height / 2;
        setZoom(Math.round(fitScale * 100));
      } else {
        const rawX = rect ? mouseX - (mouseX - container.x) * (newScale / oldScale) : container.x;
        const rawY = rect ? mouseY - (mouseY - container.y) * (newScale / oldScale) : container.y;
        const { x: clampedX, y: clampedY } = clampPosition(rawX, rawY, newScale, app, sprite, fitScale);

        container.x = clampedX;
        container.y = clampedY;
        container.scale.set(newScale);
        setZoom(Math.round(newScale * 100));
      }
    };

    const applyPan = (
      container: Container | null,
      app: Application | null,
      sprite: Sprite | null,
      fitScale: number,
    ) => {
      if (!container || !app || !sprite) return;
      if (container.scale.x > fitScale + 0.005) {
        const rawX = container.x - e.deltaX;
        const rawY = container.y - e.deltaY;
        const { x: clampedX, y: clampedY } = clampPosition(rawX, rawY, container.scale.x, app, sprite, fitScale);
        container.x = clampedX;
        container.y = clampedY;
      }
    };

    if (isPinchZoom || isModifierZoom || isMouseWheel) {
      if (syncZoomAndPan) {
        applyZoom(leftImageContainerRef.current, leftAppRef.current, leftSpriteRef.current, getLeftFitScale(), setLeftZoom);
        applyZoom(rightImageContainerRef.current, rightAppRef.current, rightSpriteRef.current, getRightFitScale(), setRightZoom);
      } else {
        if (isLeft) {
          applyZoom(leftImageContainerRef.current, leftAppRef.current, leftSpriteRef.current, getLeftFitScale(), setLeftZoom);
        } else {
          applyZoom(rightImageContainerRef.current, rightAppRef.current, rightSpriteRef.current, getRightFitScale(), setRightZoom);
        }
      }
    } else {
      if (syncZoomAndPan) {
        applyPan(leftImageContainerRef.current, leftAppRef.current, leftSpriteRef.current, getLeftFitScale());
        applyPan(rightImageContainerRef.current, rightAppRef.current, rightSpriteRef.current, getRightFitScale());
      } else {
        if (isLeft) {
          applyPan(leftImageContainerRef.current, leftAppRef.current, leftSpriteRef.current, getLeftFitScale());
        } else {
          applyPan(rightImageContainerRef.current, rightAppRef.current, rightSpriteRef.current, getRightFitScale());
        }
      }
    }
  };

  // 鼠标拖拽平移 (仅在放大状态下响应，全屏适配禁止破坏居中)
  const handleMouseDown = (e: React.MouseEvent, isLeft: boolean) => {
    if (e.button === 0 || e.button === 1) {
      const leftFit = getLeftFitScale();
      const rightFit = getRightFitScale();
      const leftScale = leftImageContainerRef.current?.scale.x ?? 1.0;
      const rightScale = rightImageContainerRef.current?.scale.x ?? 1.0;

      const canPanLeft = leftScale > leftFit + 0.01;
      const canPanRight = rightScale > rightFit + 0.01;

      if (syncZoomAndPan) {
        if (canPanLeft || canPanRight) {
          leftIsPanning.current = true;
          rightIsPanning.current = true;
          dragStartRef.current = { x: e.clientX, y: e.clientY };
        }
      } else {
        if (isLeft && canPanLeft) {
          leftIsPanning.current = true;
          dragStartRef.current = { x: e.clientX, y: e.clientY };
        } else if (!isLeft && canPanRight) {
          rightIsPanning.current = true;
          dragStartRef.current = { x: e.clientX, y: e.clientY };
        }
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const isPanning = leftIsPanning.current || rightIsPanning.current;
    if (!isPanning) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    dragStartRef.current = { x: e.clientX, y: e.clientY };

    const leftContainer = leftImageContainerRef.current;
    const rightContainer = rightImageContainerRef.current;
    const leftApp = leftAppRef.current;
    const rightApp = rightAppRef.current;
    const leftSprite = leftSpriteRef.current;
    const rightSprite = rightSpriteRef.current;
    const leftFit = getLeftFitScale();
    const rightFit = getRightFitScale();

    if (syncZoomAndPan) {
      if (leftContainer && leftContainer.scale.x > leftFit + 0.01) {
        const { x, y } = clampPosition(leftContainer.x + dx, leftContainer.y + dy, leftContainer.scale.x, leftApp, leftSprite, leftFit);
        leftContainer.x = x;
        leftContainer.y = y;
      }
      if (rightContainer && rightContainer.scale.x > rightFit + 0.01) {
        const { x, y } = clampPosition(rightContainer.x + dx, rightContainer.y + dy, rightContainer.scale.x, rightApp, rightSprite, rightFit);
        rightContainer.x = x;
        rightContainer.y = y;
      }
    } else {
      if (leftIsPanning.current && leftContainer && leftContainer.scale.x > leftFit + 0.01) {
        const { x, y } = clampPosition(leftContainer.x + dx, leftContainer.y + dy, leftContainer.scale.x, leftApp, leftSprite, leftFit);
        leftContainer.x = x;
        leftContainer.y = y;
      } else if (rightIsPanning.current && rightContainer && rightContainer.scale.x > rightFit + 0.01) {
        const { x, y } = clampPosition(rightContainer.x + dx, rightContainer.y + dy, rightContainer.scale.x, rightApp, rightSprite, rightFit);
        rightContainer.x = x;
        rightContainer.y = y;
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

          {/* 连拍比对作用域切换 */}
          {burstTotalCount > 1 && (
            <div className="flex items-center bg-dark-800 border border-dark-650 rounded-md p-0.5 text-[11px]">
              <button
                onClick={() => setCompareScope('burst')}
                className={`flex items-center space-x-1 px-2 py-0.5 rounded transition-colors ${
                  compareScope === 'burst'
                    ? 'bg-brand-600 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="候选片仅在当前连拍组内循环"
              >
                <Layers className="w-3 h-3" />
                <span>连拍组内 ({burstTotalCount}张)</span>
              </button>
              <button
                onClick={() => setCompareScope('all')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  compareScope === 'all'
                    ? 'bg-dark-650 text-slate-200 font-medium shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="候选片在全相册内切换"
              >
                全相册
              </button>
            </div>
          )}

          {/* 闪烁比对快捷提示 */}
          <div
            className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] border font-mono transition-all ${
              isBlinking
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                : 'bg-dark-800/80 text-slate-400 border-dark-700'
            }`}
            title="在左侧视口按住 [B] 键可瞬时显示右侧候选片，松开瞬时还原"
          >
            <Eye className="w-3 h-3 text-amber-400" />
            <span>按住 [B] 闪烁比对</span>
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
            <span key={String(syncZoomAndPan)} className="inline-flex animate-lock-snap">
              {syncZoomAndPan ? <Lock className="w-3 h-3 text-blue-400" /> : <Unlock className="w-3 h-3" />}
            </span>
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
            onClick={() => useAdjustStore.getState().openModal('lut')}
            title="打开调色工作台 [快捷键 E / 胶片 L]"
            className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-dark-750 hover:bg-dark-700 text-slate-200 border border-dark-600 transition-colors cursor-pointer text-xs"
          >
            <Sliders className="w-3 h-3 text-brand-400" />
            <span>调色工作台 (E)</span>
          </button>

          <button
            onClick={swapComparePhotos}
            title="主备底片互换位置 (快捷键 [S])"
            className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-dark-750 hover:bg-dark-700 text-slate-200 border border-dark-600 transition-colors cursor-pointer"
          >
            <ArrowRightLeft className={`w-3 h-3 text-brand-400 transition-transform duration-300 ${isRecentlySwapped ? 'rotate-180 scale-110' : ''}`} />
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
          key={lastSwapTimestamp ? `left-${lastSwapTimestamp}` : undefined}
          ref={leftContainerRef}
          onWheel={(e) => handleWheel(e, true)}
          onMouseDown={(e) => handleMouseDown(e, true)}
          className={`flex-1 h-full relative border-r border-dark-700/80 bg-dark-900 overflow-hidden ${
            leftZoom > Math.round(getLeftFitScale() * 100) + 1
              ? 'cursor-grab active:cursor-grabbing'
              : 'cursor-default'
          } ${isRecentlySwapped ? 'animate-swap-left' : ''}`}
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
            {isBlinking ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span className="font-semibold text-amber-400">⚡ 闪烁比对中 (候选片)</span>
                <span className="text-slate-300">{rightPhoto?.filename || ''}</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="font-semibold text-emerald-400">主选片 #{currentIndex + 1}</span>
                <span className="text-slate-300">{leftPhoto.filename}</span>
                {leftPhoto.isRaw && (
                  <span className="text-[10px] text-amber-300">内嵌预览 · 非完整 RAW 像素</span>
                )}
                {leftPhoto.exif && (leftPhoto.exif.shutter_speed || leftPhoto.exif.aperture) && (
                  <span className="text-amber-300/90 pl-1.5 border-l border-dark-700 text-[11px]">
                    {leftPhoto.exif.focal_length ? `${Math.round(leftPhoto.exif.focal_length)}mm ` : ''}
                    {leftPhoto.exif.aperture ? `f/${leftPhoto.exif.aperture} ` : ''}
                    {leftPhoto.exif.shutter_speed || ''}
                  </span>
                )}
              </>
            )}
            <span className="text-slate-500">{leftZoom}%</span>
          </div>

          {/* 左侧状态徽标与本地分析提示 */}
          <div className="absolute top-3 right-3 z-20 flex items-center space-x-1.5">
            <span
              className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${
                leftSelection === 'selected'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : leftSelection === 'maybe'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : leftSelection === 'skipped'
                  ? 'bg-slate-600/50 text-slate-200 border-slate-500'
                  : 'bg-dark-700/60 text-slate-400 border-dark-600'
              }`}
            >
              {leftSelection === 'selected'
                ? '已选'
                : leftSelection === 'maybe'
                ? '待考虑'
                : leftSelection === 'skipped'
                ? '不选'
                : '未决定'}
            </span>
            {leftInsight?.isBestPick && (
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-500/40 text-[10px] text-emerald-300 font-semibold shadow-sm">
                <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
                <span>★ 组内推荐最佳</span>
              </span>
            )}
            {leftInsight?.reasons && leftInsight.reasons.length > 0 && !leftInsight.isBestPick && (
              <span className="px-2 py-0.5 rounded-full bg-dark-800/80 border border-dark-700 text-[10px] text-slate-300">
                {leftInsight.reasons[0]}
              </span>
            )}
          </div>
        </div>

        {/* 左右分界中线与互换闪光 */}
        <div
          key={lastSwapTimestamp ? `divider-${lastSwapTimestamp}` : undefined}
          className={`absolute inset-y-0 left-1/2 -ml-px w-0.5 z-25 pointer-events-none transition-all duration-300 ${
            isRecentlySwapped
              ? 'animate-swap-divider'
              : syncZoomAndPan
              ? 'bg-blue-500/60 shadow-[0_0_8px_rgba(59,130,246,0.35)]'
              : 'bg-dark-700/80'
          }`}
        />

        {/* 右侧视口: 备选照片 (Candidate) */}
        <div
          key={lastSwapTimestamp ? `right-${lastSwapTimestamp}` : undefined}
          ref={rightContainerRef}
          onWheel={(e) => handleWheel(e, false)}
          onMouseDown={(e) => handleMouseDown(e, false)}
          className={`flex-1 h-full relative bg-dark-900 overflow-hidden ${
            rightZoom > Math.round(getRightFitScale() * 100) + 1
              ? 'cursor-grab active:cursor-grabbing'
              : 'cursor-default'
          } ${isRecentlySwapped ? 'animate-swap-right' : ''}`}
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
            <span className="font-semibold text-blue-400">
              {compareScope === 'burst' && leftBurstId
                ? `连拍候选 [${burstCandidatePosition}/${burstTotalCount}]`
                : `对比候选 #${compareTargetIndex! + 1}`}
            </span>
            <span className="text-slate-300">{rightPhoto.filename}</span>
            {rightPhoto.isRaw && (
              <span className="text-[10px] text-amber-300">内嵌预览 · 非完整 RAW 像素</span>
            )}
            {rightPhoto.exif && (rightPhoto.exif.shutter_speed || rightPhoto.exif.aperture) && (
              <span className="text-amber-300/90 pl-1.5 border-l border-dark-700 text-[11px]">
                {rightPhoto.exif.focal_length ? `${Math.round(rightPhoto.exif.focal_length)}mm ` : ''}
                {rightPhoto.exif.aperture ? `f/${rightPhoto.exif.aperture} ` : ''}
                {rightPhoto.exif.shutter_speed || ''}
              </span>
            )}
            <span className="text-slate-500">{rightZoom}%</span>
            {visualSimilarity !== null && (
              <span
                className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono"
                title="基于 64-bit DCT 感知哈希 (pHash) 评估的画面视觉相似度"
              >
                相似度 {visualSimilarity}%
              </span>
            )}

            <div className="flex items-center space-x-0.5 pl-1.5 border-l border-dark-700">
              <button
                onClick={handlePrevCandidate}
                disabled={compareScope === 'burst' ? burstTotalCount <= 1 : compareTargetIndex === 0}
                title="切换上一张候选片 (快捷键 ← / ↑ 或 K)"
                className="p-0.5 hover:bg-dark-700 rounded disabled:opacity-30 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleNextCandidate}
                disabled={compareScope === 'burst' ? burstTotalCount <= 1 : compareTargetIndex === photos.length - 1}
                title="切换下一张候选片 (快捷键 → / ↓ 或 J)"
                className="p-0.5 hover:bg-dark-700 rounded disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 右侧状态徽标与本地分析提示 */}
          {rightPhoto && (
            <div className="absolute top-3 right-3 z-20 flex items-center space-x-1.5">
              <span
                className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${
                  rightSelection === 'selected'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : rightSelection === 'maybe'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : rightSelection === 'skipped'
                    ? 'bg-slate-600/50 text-slate-200 border-slate-500'
                    : 'bg-dark-700/60 text-slate-400 border-dark-600'
                }`}
              >
                {rightSelection === 'selected'
                  ? '已选'
                  : rightSelection === 'maybe'
                  ? '待考虑'
                  : rightSelection === 'skipped'
                  ? '不选'
                  : '未决定'}
              </span>
              {rightInsight?.isBestPick && (
                <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-500/40 text-[10px] text-emerald-300 font-semibold shadow-sm">
                  <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
                  <span>★ 组内推荐最佳</span>
                </span>
              )}
              {rightInsight?.reasons && rightInsight.reasons.length > 0 && !rightInsight.isBestPick && (
                <span className="px-2 py-0.5 rounded-full bg-dark-800/80 border border-dark-700 text-[10px] text-slate-300">
                  {rightInsight.reasons[0]}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 底部居中：面向普通用户的双图决策操作坞 */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center space-x-2 bg-dark-850/95 backdrop-blur-md px-4 py-2 rounded-2xl border border-dark-700 shadow-2xl text-xs select-none">
        <button
          onClick={chooseLeft}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
            leftSelection === 'selected'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'bg-dark-750 hover:bg-dark-700 text-slate-200 border border-dark-600'
          }`}
          title="选择左侧照片"
        >
          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>选择左图</span>
        </button>

        <button
          onClick={chooseRight}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
            rightSelection === 'selected'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'bg-dark-750 hover:bg-dark-700 text-slate-200 border border-dark-600'
          }`}
          title="选择右侧照片"
        >
          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>选择右图</span>
        </button>

        <div className="h-4 w-[1px] bg-dark-700 mx-0.5" />

        <button
          onClick={chooseBoth}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition-all cursor-pointer"
          title="两张都很喜欢，全部加入已选"
        >
          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>两张都选</span>
        </button>

        <button
          onClick={deferBoth}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-medium bg-dark-750 hover:bg-dark-700 text-amber-300 border border-dark-600 transition-all cursor-pointer"
          title="两张都拿不准，保留在待考虑"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>两张都暂不决定</span>
        </button>

        <div className="h-4 w-[1px] bg-dark-700 mx-0.5" />

        <button
          onClick={nextSimilarGroup}
          disabled={similarGroupIds.length <= 1}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-medium bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          title={similarGroupIds.length <= 1 ? '没有其它相似组' : '对比下一组连拍或相似照片'}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>
            下一相似组
            {currentSimilarGroupPosition > 0 && ` (${currentSimilarGroupPosition}/${similarGroupIds.length})`}
          </span>
        </button>
      </div>
    </div>
  );
};
