import { WatermarkConfig, WatermarkFontFamily, WatermarkPosition } from '../types/adjust';
import { get2DContextWithOptions } from './colorSpace';

const FONT_MAP: Record<WatermarkFontFamily, string> = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  serif: 'Didot, "Bodoni MT", Georgia, "Times New Roman", serif',
  signature: '"Brush Script MT", "Caveat", "Dancing Script", cursive, "Apple Chancery", sans-serif',
  mono: '"SF Mono", Menlo, Monaco, "Courier New", monospace',
};

// 缓存已加载的 Logo Image 对象，避免频繁创建 HTMLImageElement
const logoImageCache = new Map<string, HTMLImageElement>();

function loadLogoImage(dataUrl: string): Promise<HTMLImageElement> {
  const cached = logoImageCache.get(dataUrl);
  if (cached && cached.complete) {
    return Promise.resolve(cached);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      logoImageCache.set(dataUrl, img);
      resolve(img);
    };
    img.onerror = (err) => reject(err);
    img.src = dataUrl;
  });
}

/**
 * 计算九宫格在 Canvas 上的绝对锚点坐标
 */
export function calculateAnchorCoordinates(
  width: number,
  height: number,
  marginPx: number,
  position: WatermarkPosition,
): { x: number; y: number; align: CanvasTextAlign; baseline: CanvasTextBaseline } {
  switch (position) {
    case 'top-left':
      return { x: marginPx, y: marginPx, align: 'left', baseline: 'top' };
    case 'top-center':
      return { x: width / 2, y: marginPx, align: 'center', baseline: 'top' };
    case 'top-right':
      return { x: width - marginPx, y: marginPx, align: 'right', baseline: 'top' };
    case 'center-left':
      return { x: marginPx, y: height / 2, align: 'left', baseline: 'middle' };
    case 'center':
      return { x: width / 2, y: height / 2, align: 'center', baseline: 'middle' };
    case 'center-right':
      return { x: width - marginPx, y: height / 2, align: 'right', baseline: 'middle' };
    case 'bottom-left':
      return { x: marginPx, y: height - marginPx, align: 'left', baseline: 'bottom' };
    case 'bottom-center':
      return { x: width / 2, y: height - marginPx, align: 'center', baseline: 'bottom' };
    case 'bottom-right':
    default:
      return { x: width - marginPx, y: height - marginPx, align: 'right', baseline: 'bottom' };
  }
}

/**
 * 核心渲染管线：在给定 Canvas 上绘制高质量水印或签名
 */
export async function applyWatermarkToCanvas(
  canvas: HTMLCanvasElement,
  config: WatermarkConfig,
): Promise<void> {
  if (!config.enabled) return;

  const ctx = get2DContextWithOptions(canvas);
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const shortEdge = Math.min(width, height);
  const marginPx = Math.round(shortEdge * Math.max(0.01, config.margin));

  ctx.save();
  ctx.globalAlpha = Math.max(0.05, Math.min(1.0, config.opacity));

  // 1. 全屏 45° 对角平铺防盗样片模式 (Tiled Proof Mode)
  if (config.position === 'tiled') {
    const text = (config.text || 'PROOF 选片样片').trim();
    const fontSize = Math.max(16, Math.round(shortEdge * 0.05));
    const fontStr = `${config.italic ? 'italic ' : ''}${config.bold ? 'bold ' : ''}${fontSize}px ${FONT_MAP[config.fontFamily] || FONT_MAP.sans}`;

    ctx.font = fontStr;
    ctx.fillStyle = config.color || '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (config.hasShadow) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
    }

    ctx.translate(width / 2, height / 2);
    ctx.rotate((-30 * Math.PI) / 180);

    const stepX = Math.max(160, Math.round(fontSize * 9));
    const stepY = Math.max(100, Math.round(fontSize * 5));
    const diag = Math.sqrt(width * width + height * height);

    const startX = -diag;
    const endX = diag;
    const startY = -diag;
    const endY = diag;

    let rowIndex = 0;
    for (let y = startY; y < endY; y += stepY) {
      const offsetX = (rowIndex % 2 === 0) ? 0 : stepX / 2;
      for (let x = startX; x < endX; x += stepX) {
        ctx.fillText(text, x + offsetX, y);
      }
      rowIndex++;
    }

    ctx.restore();
    return;
  }

  // 2. 图片 / Logo 水印模式
  if (config.type === 'logo' && config.logoDataUrl) {
    try {
      const img = await loadLogoImage(config.logoDataUrl);
      const targetWidth = Math.max(30, Math.round(shortEdge * config.scale));
      const aspectRatio = img.naturalWidth / (img.naturalHeight || 1);
      const targetHeight = targetWidth / (aspectRatio || 1);

      let drawX = marginPx;
      let drawY = marginPx;

      switch (config.position) {
        case 'top-left':
          drawX = marginPx;
          drawY = marginPx;
          break;
        case 'top-center':
          drawX = (width - targetWidth) / 2;
          drawY = marginPx;
          break;
        case 'top-right':
          drawX = width - targetWidth - marginPx;
          drawY = marginPx;
          break;
        case 'center-left':
          drawX = marginPx;
          drawY = (height - targetHeight) / 2;
          break;
        case 'center':
          drawX = (width - targetWidth) / 2;
          drawY = (height - targetHeight) / 2;
          break;
        case 'center-right':
          drawX = width - targetWidth - marginPx;
          drawY = (height - targetHeight) / 2;
          break;
        case 'bottom-left':
          drawX = marginPx;
          drawY = height - targetHeight - marginPx;
          break;
        case 'bottom-center':
          drawX = (width - targetWidth) / 2;
          drawY = height - targetHeight - marginPx;
          break;
        case 'bottom-right':
        default:
          drawX = width - targetWidth - marginPx;
          drawY = height - targetHeight - marginPx;
          break;
      }

      if (config.hasShadow) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 2;
      }

      ctx.drawImage(img, drawX, drawY, targetWidth, targetHeight);
      ctx.restore();
      return;
    } catch (err) {
      console.warn('加载 Logo 水印图片失败，降级为文字水印', err);
    }
  }

  // 3. 文字 / 摄影师签名模式
  const text = (config.text || '').trim();
  if (!text) {
    ctx.restore();
    return;
  }

  const fontSize = Math.max(12, Math.round(shortEdge * config.scale * 0.28));
  const fontStr = `${config.italic ? 'italic ' : ''}${config.bold ? 'bold ' : ''}${fontSize}px ${FONT_MAP[config.fontFamily] || FONT_MAP.sans}`;

  ctx.font = fontStr;
  ctx.fillStyle = config.color || '#FFFFFF';

  const anchor = calculateAnchorCoordinates(width, height, marginPx, config.position);
  ctx.textAlign = anchor.align;
  ctx.textBaseline = anchor.baseline;

  if (config.hasShadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = Math.max(3, Math.round(fontSize * 0.18));
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
  }

  ctx.fillText(text, anchor.x, anchor.y);
  ctx.restore();
}
