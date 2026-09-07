import React, { useEffect, useRef, useState } from 'react';
import { Application, Assets, Sprite, Container } from 'pixi.js';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { usePhotoStore } from '../../store/photoStore';

interface PixiCanvasProps {
  imageUrl: string | null;
  filename: string;
}

export const PixiCanvas: React.FC<PixiCanvasProps> = ({ imageUrl, filename }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const imageContainerRef = useRef<Container | null>(null);
  const spriteRef = useRef<Sprite | null>(null);

  const focusedFace = usePhotoStore((state) => state.focusedFace);

  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    let isMounted = true;
    const parent = containerRef.current;
    if (!parent) return;

    const app = new Application();

    const initPixi = async () => {
      await app.init({
        resizeTo: parent,
        backgroundColor: 0x0d0f12,
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
      });

      if (!isMounted) {
        app.destroy(true);
        return;
      }

      appRef.current = app;
      parent.appendChild(app.canvas);

      const stageContainer = new Container();
      app.stage.addChild(stageContainer);
      imageContainerRef.current = stageContainer;
    };

    initPixi();

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
    };
  }, []);

  // 当图片 URL 切换时，更新纹理
  useEffect(() => {
    if (!imageUrl || !appRef.current || !imageContainerRef.current) return;

    let isCurrent = true;

    const loadTexture = async () => {
      try {
        const texture = await Assets.load(imageUrl);
        if (!isCurrent || !imageContainerRef.current || !appRef.current) return;

        const container = imageContainerRef.current;
        container.children.forEach((child) => child.destroy());
        container.removeChildren();

        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);

        // 计算居中与自适应适配缩放 (Fit to Screen)
        const app = appRef.current;
        const screenW = app.screen.width;
        const screenH = app.screen.height;

        const scaleX = (screenW * 0.92) / texture.width;
        const scaleY = (screenH * 0.92) / texture.height;
        const fitScale = Math.min(scaleX, scaleY, 1.0);

        container.x = screenW / 2;
        container.y = screenH / 2;
        container.scale.set(fitScale);

        container.addChild(sprite);
        spriteRef.current = sprite;
        setZoomLevel(Math.round(fitScale * 100));
      } catch (e) {
        console.error('Failed to render Pixi texture', e);
      }
    };

    loadTexture();

    return () => {
      isCurrent = false;
    };
  }, [imageUrl]);

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
  }, [focusedFace]);

  // 滚轮缩放事件监听
  const handleWheel = (e: React.WheelEvent) => {
    if (!imageContainerRef.current || !appRef.current) return;
    e.preventDefault();

    const container = imageContainerRef.current;
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;

    const newScale = Math.max(0.1, Math.min(container.scale.x * zoomFactor, 8.0));
    container.scale.set(newScale);
    setZoomLevel(Math.round(newScale * 100));
  };

  // 鼠标拖动画布
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      setIsPanning(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || !imageContainerRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    imageContainerRef.current.x += dx;
    imageContainerRef.current.y += dy;

    dragStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // 100% 点对点与重置适配
  const resetToFit = () => {
    if (!imageContainerRef.current || !appRef.current || !spriteRef.current) return;
    const app = appRef.current;
    const sprite = spriteRef.current;
    const container = imageContainerRef.current;

    const scaleX = (app.screen.width * 0.92) / sprite.texture.width;
    const scaleY = (app.screen.height * 0.92) / sprite.texture.height;
    const fitScale = Math.min(scaleX, scaleY, 1.0);

    container.x = app.screen.width / 2;
    container.y = app.screen.height / 2;
    container.scale.set(fitScale);
    setZoomLevel(Math.round(fitScale * 100));
  };

  const zoomTo100 = () => {
    if (!imageContainerRef.current || !appRef.current) return;
    const app = appRef.current;
    const container = imageContainerRef.current;
    container.x = app.screen.width / 2;
    container.y = app.screen.height / 2;
    container.scale.set(1.0);
    setZoomLevel(100);
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className={`relative w-full h-full overflow-hidden bg-dark-900 ${
        isPanning ? 'cursor-grabbing' : 'cursor-grab'
      }`}
    >
      {/* 悬浮缩放控制栏 */}
      <div className="absolute top-4 right-4 z-10 flex items-center space-x-1.5 bg-dark-800/80 backdrop-blur border border-dark-700/80 px-2.5 py-1.5 rounded-lg shadow-lg text-slate-300 text-xs">
        <span className="font-mono text-slate-400 w-12 text-center">{zoomLevel}%</span>
        <div className="w-[1px] h-3.5 bg-dark-600" />
        <button
          onClick={resetToFit}
          title="适应屏幕"
          className="p-1 hover:bg-dark-700 rounded transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={zoomTo100}
          title="1:1 实际像素"
          className="px-1.5 py-0.5 hover:bg-dark-700 rounded text-[11px] font-mono transition-colors"
        >
          1:1
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
          className="p-1 hover:bg-dark-700 rounded transition-colors"
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
          className="p-1 hover:bg-dark-700 rounded transition-colors"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 照片名称信息浮标 */}
      <div className="absolute bottom-4 left-4 z-10 bg-dark-800/80 backdrop-blur border border-dark-700/80 px-3 py-1.5 rounded-lg shadow-md text-xs text-slate-300 font-mono flex items-center space-x-2">
        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
        <span>{filename}</span>
      </div>
    </div>
  );
};
