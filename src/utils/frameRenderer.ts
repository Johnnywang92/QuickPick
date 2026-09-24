import { CustomFrameTemplate, FrameConfig, PhotoAdjustments, WatermarkConfig } from '../types/adjust';
import { LocalPhoto } from '../types/photo';
import { isAdjustmentsNoop } from './adjustEngine';
import { applyWatermarkToCanvas } from './watermarkRenderer';
import { get2DContextWithOptions } from './colorSpace';
import { apply3dLutToImageData, generateBuiltinLutData } from './lutEngine';

export interface FrameLutConfig {
  lutId: string | null;
  intensity: number;
  customData?: { size: number; data: Uint8Array } | null;
}

/**
 * 判断十六进制颜色是否属于深色系
 */
export function isColorDark(hexColor: string): boolean {
  if (!hexColor) return false;
  let hex = hexColor.replace(/^#/, '').trim();
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  if (hex.length !== 6) return false;
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 140;
}

/**
 * 相机品牌识别与规范化 (用于元数据合规文本呈现)
 */
export function detectCameraBrand(
  cameraMake?: string,
  cameraModel?: string,
): { brand: string; cleanModel: string } {
  const make = (cameraMake || '').toLowerCase();
  const model = (cameraModel || '').trim();

  if (make.includes('sony') || model.toLowerCase().startsWith('ilce') || model.toLowerCase().startsWith('a7')) {
    const clean = model.replace(/^ILCE-/i, 'α').replace(/^SONY/i, '').trim();
    return { brand: 'SONY', cleanModel: clean || model || 'Alpha' };
  }
  if (make.includes('canon') || model.toLowerCase().startsWith('eos')) {
    const clean = model.replace(/^Canon\s+/i, '').trim();
    return { brand: 'Canon', cleanModel: clean || model || 'EOS' };
  }
  if (make.includes('nikon') || model.toLowerCase().startsWith('nikon')) {
    const clean = model.replace(/^NIKON\s+/i, '').trim();
    return { brand: 'NIKON', cleanModel: clean || model || 'Z' };
  }
  if (make.includes('fujifilm') || make.includes('fuji') || model.toLowerCase().startsWith('x-')) {
    const clean = model.replace(/^FUJIFILM\s+/i, '').trim();
    return { brand: 'FUJIFILM', cleanModel: clean || model || 'X-System' };
  }
  if (make.includes('leica')) {
    const clean = model.replace(/^LEICA\s+/i, '').trim();
    return { brand: 'Leica', cleanModel: clean || model || 'M-System' };
  }
  if (make.includes('hasselblad')) {
    const clean = model.replace(/^HASSELBLAD\s+/i, '').trim();
    return { brand: 'Hasselblad', cleanModel: clean || model || 'Medium Format' };
  }
  if (make.includes('apple') || model.toLowerCase().includes('iphone')) {
    return { brand: 'Apple', cleanModel: model || 'iPhone' };
  }

  const combined = [cameraMake, cameraModel].filter(Boolean).join(' ');
  return { brand: cameraMake?.toUpperCase() || 'CAMERA', cleanModel: combined || 'Camera' };
}

/**
 * 格式化参数文本
 */
export function formatExifStrings(photo: LocalPhoto, config: FrameConfig): {
  cameraTitle: string;
  lensTitle: string;
  paramsString: string;
  dateString: string;
  photographerText: string;
} {
  const exif = photo.exif;
  const { brand, cleanModel } = detectCameraBrand(exif?.camera_make, exif?.camera_model);

  const cameraTitle = config.customCameraModel?.trim()
    ? config.customCameraModel.trim()
    : `${brand} ${cleanModel}`.trim();

  const lensTitle = config.customLens?.trim()
    ? config.customLens.trim()
    : exif?.lens_model || exif?.lens_make || '';

  const params: string[] = [];
  if (exif?.focal_length) {
    params.push(`${Math.round(exif.focal_length)}mm`);
  } else if (exif?.focal_length_35mm) {
    params.push(`${exif.focal_length_35mm}mm`);
  }

  if (exif?.aperture) {
    const apStr = exif.aperture.toFixed(1).replace(/\.0$/, '');
    params.push(`f/${apStr}`);
  }

  if (exif?.shutter_speed) {
    params.push(exif.shutter_speed);
  } else if (exif?.shutter_speed_value) {
    if (exif.shutter_speed_value < 1) {
      params.push(`1/${Math.round(1 / exif.shutter_speed_value)}s`);
    } else {
      params.push(`${exif.shutter_speed_value}s`);
    }
  }

  if (exif?.iso) {
    params.push(`ISO ${exif.iso}`);
  }

  // 精致的浅色细竖线分隔符
  const paramsString = params.join('   │   ');

  let dateString = '';
  const rawDate = exif?.date_time_original || photo.capturedAt;
  if (rawDate) {
    const dateMatch = rawDate.match(/^(\d{4})[-:.](\d{2})[-:.](\d{2})[\sT](\d{2}):(\d{2})/);
    if (dateMatch) {
      dateString = `${dateMatch[1]}.${dateMatch[2]}.${dateMatch[3]} ${dateMatch[4]}:${dateMatch[5]}`;
    } else {
      dateString = rawDate.slice(0, 16).replace(/-/g, '.');
    }
  }

  const photographerText = config.customPhotographer.trim();

  return {
    cameraTitle,
    lensTitle,
    paramsString,
    dateString,
    photographerText,
  };
}

/**
 * 绘制高质感、纯几何原创、100% 具备知识产权保护的摄影艺术徽标
 * 避免打包或复制商业注册商标，确保法律合规与纯净
 */
export function drawPhotographicBadge(
  ctx: CanvasRenderingContext2D,
  badgeType: 'aperture' | 'rangefinder' | 'amber_lens' | 'cinema' | 'camera' | 'none',
  x: number,
  y: number,
  size: number,
  isDark: boolean,
) {
  if (badgeType === 'none') return;
  ctx.save();
  ctx.translate(x, y);

  if (badgeType === 'aperture') {
    // 经典红色/深色光圈叶片徽标 (Aperture Blades)
    const r = size / 2;
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fillStyle = isDark ? '#E11D48' : '#BE123C'; // 优雅绯红
    ctx.fill();

    // 内部几何多边形光圈叶片
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(1.2, size * 0.06);
    ctx.beginPath();
    const blades = 6;
    for (let i = 0; i < blades; i++) {
      const angle = (i * 2 * Math.PI) / blades;
      const x1 = r + Math.cos(angle) * (r * 0.75);
      const y1 = r + Math.sin(angle) * (r * 0.75);
      const x2 = r + Math.cos(angle + 1.2) * (r * 0.35);
      const y2 = r + Math.sin(angle + 1.2) * (r * 0.35);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();

    // 瞳孔中心极小亮点
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(r, r, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
  } else if (badgeType === 'amber_lens') {
    // 标志性琥珀对焦圆环标 (Amber Precision Focus Ring)
    const r = size / 2;
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fillStyle = '#D97706'; // 哑光琥珀金
    ctx.fill();

    ctx.strokeStyle = '#FEF3C7';
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.beginPath();
    ctx.arc(r, r, r * 0.65, 0, Math.PI * 2);
    ctx.stroke();

    // 四象限精密十字对焦刻度
    ctx.beginPath();
    ctx.moveTo(r, r * 0.2);
    ctx.lineTo(r, r * 0.45);
    ctx.moveTo(r, r * 1.55);
    ctx.lineTo(r, r * 1.8);
    ctx.moveTo(r * 0.2, r);
    ctx.lineTo(r * 0.45, r);
    ctx.moveTo(r * 1.55, r);
    ctx.lineTo(r * 1.8, r);
    ctx.stroke();
  } else if (badgeType === 'cinema') {
    // 电影 35mm 胶片孔与镜头标 (Cinematic 35mm Perforation)
    ctx.fillStyle = '#F59E0B'; // 经典电影橙金
    ctx.beginPath();
    ctx.roundRect(0, size * 0.15, size * 1.1, size * 0.7, size * 0.12);
    ctx.fill();

    // 胶片齿孔
    ctx.fillStyle = '#0F172A';
    const holeW = size * 0.18;
    const holeH = size * 0.22;
    ctx.fillRect(size * 0.18, size * 0.38, holeW, holeH);
    ctx.fillRect(size * 0.72, size * 0.38, holeW, holeH);
  } else if (badgeType === 'rangefinder') {
    // 极简旁轴取景器图标
    ctx.strokeStyle = isDark ? '#E2E8F0' : '#1E293B';
    ctx.lineWidth = Math.max(1.5, size * 0.08);
    ctx.beginPath();
    ctx.roundRect(0, size * 0.2, size * 1.15, size * 0.65, size * 0.12);
    ctx.stroke();

    // 镜头圈
    ctx.beginPath();
    ctx.arc(size * 0.58, size * 0.52, size * 0.22, 0, Math.PI * 2);
    ctx.stroke();

    // 取景窗小方块
    ctx.fillStyle = isDark ? '#E2E8F0' : '#1E293B';
    ctx.fillRect(size * 0.18, size * 0.3, size * 0.18, size * 0.14);
  } else {
    // 通用极简微单机身几何
    ctx.fillStyle = isDark ? '#334155' : '#E2E8F0';
    ctx.strokeStyle = isDark ? '#94A3B8' : '#475569';
    ctx.lineWidth = Math.max(1.2, size * 0.06);

    ctx.beginPath();
    ctx.roundRect(0, size * 0.25, size, size * 0.65, size * 0.15);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(size * 0.5, size * 0.58, size * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = isDark ? '#0F172A' : '#FFFFFF';
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * 在 Canvas 像素缓冲上执行高保真快速调色 (带 1D LUT 查表加速与短路优化)
 */
export function applyAdjustmentsToImageData(
  imageData: ImageData,
  adjustments: PhotoAdjustments,
): void {
  if (isAdjustmentsNoop(adjustments)) return;

  const data = imageData.data;
  const len = data.length;

  const hasExposure = adjustments.exposure !== 0;
  const hasContrast = adjustments.contrast !== 0;
  const hasShadowsOrHighlights = adjustments.shadows !== 0 || adjustments.highlights !== 0;
  const hasTempOrTint = adjustments.temperature !== 0 || adjustments.tint !== 0;
  const hasSaturationOrBw = adjustments.isBlackAndWhite || adjustments.saturation !== 0;

  const exposureFactor = hasExposure ? Math.pow(2, adjustments.exposure) : 1;
  const contrastFactor = hasContrast
    ? (259 * (adjustments.contrast + 255)) / (255 * (259 - adjustments.contrast))
    : 1;
  const tempR = 1 + adjustments.temperature * 0.003;
  const tempB = 1 - adjustments.temperature * 0.003;
  const tintG = 1 - adjustments.tint * 0.003;
  const satFactor = adjustments.isBlackAndWhite ? 0 : 1 + adjustments.saturation / 100;
  const shadowGain = adjustments.shadows / 100;
  const highlightGain = adjustments.highlights / 100;
  const shadowDeltaBase = shadowGain * 45;
  const hlDeltaBase = highlightGain * 45;

  // 极致性能快速通道：当无需逐像素计算光影权重与多通道饱和度交叉时，使用 1D 查找表 (LUT) 秒级映射
  if (!hasShadowsOrHighlights && !hasSaturationOrBw) {
    const lutR = new Uint8Array(256);
    const lutG = new Uint8Array(256);
    const lutB = new Uint8Array(256);

    for (let i = 0; i < 256; i++) {
      let r = i;
      let g = i;
      let b = i;

      if (hasExposure) {
        r *= exposureFactor;
        g *= exposureFactor;
        b *= exposureFactor;
      }
      if (hasContrast) {
        r = contrastFactor * (r - 128) + 128;
        g = contrastFactor * (g - 128) + 128;
        b = contrastFactor * (b - 128) + 128;
      }
      if (hasTempOrTint) {
        r *= tempR;
        b *= tempB;
        g *= tintG;
      }

      lutR[i] = r < 0 ? 0 : r > 255 ? 255 : (r + 0.5) | 0;
      lutG[i] = g < 0 ? 0 : g > 255 ? 255 : (g + 0.5) | 0;
      lutB[i] = b < 0 ? 0 : b > 255 ? 255 : (b + 0.5) | 0;
    }

    for (let i = 0; i < len; i += 4) {
      data[i] = lutR[data[i]];
      data[i + 1] = lutG[data[i + 1]];
      data[i + 2] = lutB[data[i + 2]];
    }
    return;
  }

  // 通用通道（包含高光阴影局部权重及饱和度通道混合）
  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    if (hasExposure) {
      r *= exposureFactor;
      g *= exposureFactor;
      b *= exposureFactor;
    }

    if (hasShadowsOrHighlights) {
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const shadowWeight = Math.max(0, 1 - lum * 0.0078125);
      const highlightWeight = Math.max(0, (lum - 128) * 0.007874);
      const delta = shadowDeltaBase * shadowWeight + hlDeltaBase * highlightWeight;
      r += delta;
      g += delta;
      b += delta;
    }

    if (hasContrast) {
      r = contrastFactor * (r - 128) + 128;
      g = contrastFactor * (g - 128) + 128;
      b = contrastFactor * (b - 128) + 128;
    }

    if (hasTempOrTint) {
      r *= tempR;
      b *= tempB;
      g *= tintG;
    }

    if (hasSaturationOrBw) {
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = gray + (r - gray) * satFactor;
      g = gray + (g - gray) * satFactor;
      b = gray + (b - gray) * satFactor;
    }

    data[i] = r < 0 ? 0 : r > 255 ? 255 : (r + 0.5) | 0;
    data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : (g + 0.5) | 0;
    data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : (b + 0.5) | 0;
  }
}

/**
 * 完整离屏相框渲染与排版引擎 (支持 6 种经典版式)
 */
export async function renderFramedPhotoCanvas(
  sourceImage: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  photo: LocalPhoto,
  config: FrameConfig,
  adjustments: PhotoAdjustments,
  maxEdge = 2560,
  watermarkConfig?: WatermarkConfig,
  lutConfig?: FrameLutConfig,
  customTemplates?: CustomFrameTemplate[],
): Promise<HTMLCanvasElement> {
  // 1. 规范化缩放
  let photoW = sourceWidth;
  let photoH = sourceHeight;
  const maxSrcEdge = Math.max(photoW, photoH);
  if (maxSrcEdge > maxEdge) {
    const scale = maxEdge / maxSrcEdge;
    photoW = Math.round(photoW * scale);
    photoH = Math.round(photoH * scale);
  }

  // 2. 旋转与调色处理
  const rot = adjustments.rotation % 360;
  const isRotated90 = rot === 90 || rot === 270;
  const adjustedPhotoW = isRotated90 ? photoH : photoW;
  const adjustedPhotoH = isRotated90 ? photoW : photoH;

  const photoCanvas = document.createElement('canvas');
  photoCanvas.width = adjustedPhotoW;
  photoCanvas.height = adjustedPhotoH;
  const photoCtx = get2DContextWithOptions(photoCanvas, { willReadFrequently: true });
  if (!photoCtx) {
    throw new Error('无法初始化照片 2D 绘图环境');
  }

  photoCtx.save();
  photoCtx.translate(adjustedPhotoW / 2, adjustedPhotoH / 2);
  photoCtx.rotate((rot * Math.PI) / 180);
  photoCtx.drawImage(sourceImage, -photoW / 2, -photoH / 2, photoW, photoH);
  photoCtx.restore();

  const needsAdjust = config.includeAdjustments && !isAdjustmentsNoop(adjustments);
  const needsLut =
    config.includeAdjustments &&
    Boolean(lutConfig?.lutId && (lutConfig.intensity ?? 0) > 0);

  if (needsAdjust || needsLut) {
    const imgData = photoCtx.getImageData(0, 0, adjustedPhotoW, adjustedPhotoH);
    if (needsAdjust) {
      applyAdjustmentsToImageData(imgData, adjustments);
    }
    if (needsLut && lutConfig?.lutId) {
      const lutSize = lutConfig.customData ? lutConfig.customData.size : 33;
      const lutRaw = lutConfig.customData
        ? lutConfig.customData.data
        : generateBuiltinLutData(lutConfig.lutId, lutSize);
      apply3dLutToImageData(imgData, lutRaw, lutSize, lutConfig.intensity);
    }
    photoCtx.putImageData(imgData, 0, 0);
  }

  // 3. 模板版式与画布几何计算
  const template = config.template;
  const customTpl = customTemplates?.find((t) => t.id === template);

  let borderScale = Math.max(0.06, Math.min(config.borderScale || 0.1, 0.18));
  if (customTpl && customTpl.borderScale && !config.borderScale) {
    borderScale = Math.max(0.06, Math.min(customTpl.borderScale, 0.18));
  }
  const longEdge = Math.max(adjustedPhotoW, adjustedPhotoH);

  let canvasW = adjustedPhotoW;
  let canvasH = adjustedPhotoH;
  let photoX = 0;
  let photoY = 0;
  let bottomBarH = 0;
  let topBarH = 0;
  let isDark = false;
  let bgColor = '#FFFFFF';

  // 规范化别名
  const isClassicWhite = template === 'classic_white' || template === 'leica_white';
  const isPolaroid =
    template === 'retro_polaroid' ||
    template === 'polaroid' ||
    customTpl?.baseLayout === 'polaroid';
  const isCinematic =
    template === 'cinematic_scope' || customTpl?.baseLayout === 'cinematic';
  const isOverlayBadge =
    template === 'overlay_badge' || customTpl?.baseLayout === 'overlay_badge';
  const isBottomBar =
    isClassicWhite ||
    template === 'obsidian_black' ||
    template === 'amber_minimal' ||
    customTpl?.baseLayout === 'bottom_bar' ||
    (!isPolaroid && !isCinematic && !isOverlayBadge);

  if (customTpl) {
    bgColor = customTpl.bgColor || '#FFFFFF';
    isDark = customTpl.isDark !== undefined ? customTpl.isDark : isColorDark(bgColor);
    if (customTpl.baseLayout === 'bottom_bar') {
      bottomBarH = Math.round(longEdge * borderScale);
      canvasH = adjustedPhotoH + bottomBarH;
    } else if (customTpl.baseLayout === 'cinematic') {
      topBarH = Math.round(longEdge * 0.08);
      bottomBarH = Math.round(longEdge * 0.1);
      canvasH = adjustedPhotoH + topBarH + bottomBarH;
      photoY = topBarH;
    } else if (customTpl.baseLayout === 'polaroid') {
      const sideMargin = Math.round(longEdge * 0.045);
      bottomBarH = Math.round(longEdge * (borderScale + 0.05));
      canvasW = adjustedPhotoW + sideMargin * 2;
      canvasH = adjustedPhotoH + sideMargin + bottomBarH;
      photoX = sideMargin;
      photoY = sideMargin;
    } else if (customTpl.baseLayout === 'overlay_badge') {
      canvasW = adjustedPhotoW;
      canvasH = adjustedPhotoH;
    }
  } else if (isClassicWhite) {
    bottomBarH = Math.round(longEdge * borderScale);
    canvasH = adjustedPhotoH + bottomBarH;
    isDark = false;
    bgColor = '#FFFFFF';
  } else if (template === 'obsidian_black') {
    bottomBarH = Math.round(longEdge * borderScale);
    canvasH = adjustedPhotoH + bottomBarH;
    isDark = true;
    bgColor = '#0F1013';
  } else if (template === 'amber_minimal') {
    bottomBarH = Math.round(longEdge * borderScale);
    canvasH = adjustedPhotoH + bottomBarH;
    isDark = false;
    bgColor = '#FBFBFA';
  } else if (template === 'cinematic_scope') {
    // 2.39:1 电影宽荧幕上下遮幅
    topBarH = Math.round(longEdge * 0.08);
    bottomBarH = Math.round(longEdge * 0.1);
    canvasH = adjustedPhotoH + topBarH + bottomBarH;
    photoY = topBarH;
    isDark = true;
    bgColor = '#08080A';
  } else if (isPolaroid) {
    const sideMargin = Math.round(longEdge * 0.045);
    bottomBarH = Math.round(longEdge * (borderScale + 0.05));
    canvasW = adjustedPhotoW + sideMargin * 2;
    canvasH = adjustedPhotoH + sideMargin + bottomBarH;
    photoX = sideMargin;
    photoY = sideMargin;
    isDark = false;
    bgColor = '#F9F9F6';
  } else if (template === 'overlay_badge') {
    canvasW = adjustedPhotoW;
    canvasH = adjustedPhotoH;
    isDark = true;
  }

  // 4. 构造主输出画布
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = canvasW;
  finalCanvas.height = canvasH;
  const ctx = get2DContextWithOptions(finalCanvas);
  if (!ctx) {
    throw new Error('无法初始化主排版画布');
  }

  // 绘制底色
  if (!isOverlayBadge) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  // 拍立得相纸轻微纸张微投影模拟
  if (isPolaroid) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
    ctx.fillRect(photoX - 1, photoY - 1, adjustedPhotoW + 2, adjustedPhotoH + 2);
    ctx.restore();
  }

  // 绘制照片主体
  ctx.drawImage(photoCanvas, photoX, photoY, adjustedPhotoW, adjustedPhotoH);

  // 5. 格式化排版文本
  const { cameraTitle, lensTitle, paramsString, dateString, photographerText } =
    formatExifStrings(photo, config);

  // 6. 各版式细节排版与徽标绘制
  if (isBottomBar) {
    const barTop = adjustedPhotoH;
    const paddingX = Math.round(canvasW * 0.04);
    const centerY = barTop + bottomBarH * 0.5;

    // 优雅分隔微弱细线
    if (!isDark) {
      ctx.strokeStyle = template === 'amber_minimal' ? '#E5E7EB' : 'rgba(0, 0, 0, 0.06)';
      ctx.lineWidth = Math.max(1, Math.round(bottomBarH * 0.008));
      ctx.beginPath();
      ctx.moveTo(0, barTop);
      ctx.lineTo(canvasW, barTop);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = Math.max(1, Math.round(bottomBarH * 0.008));
      ctx.beginPath();
      ctx.moveTo(0, barTop);
      ctx.lineTo(canvasW, barTop);
      ctx.stroke();
    }

    const badgeSize = Math.round(bottomBarH * 0.38);
    const badgeX = paddingX;
    const badgeY = centerY - badgeSize * 0.5;

    const badgeType = customTpl
      ? customTpl.badgeType
      : template === 'amber_minimal'
      ? 'amber_lens'
      : isClassicWhite
      ? 'aperture'
      : template === 'obsidian_black'
      ? 'rangefinder'
      : 'camera';

    if (badgeType !== 'none') {
      drawPhotographicBadge(ctx, badgeType, badgeX, badgeY, badgeSize, isDark);
    }

    const textStartX =
      badgeType === 'none'
        ? paddingX
        : badgeX + badgeSize + Math.round(bottomBarH * 0.16);
    const mainFontSize = Math.max(13, Math.round(bottomBarH * 0.23));
    const subFontSize = Math.max(10, Math.round(bottomBarH * 0.16));

    ctx.textAlign = 'left';

    // 机身标题
    if (config.showCameraModel && cameraTitle) {
      ctx.fillStyle = isDark ? '#F8FAFC' : '#0F172A';
      ctx.font = `600 ${mainFontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif`;
      ctx.fillText(cameraTitle, textStartX, centerY - bottomBarH * 0.06);
    }

    // 副标题（镜头与作者署名）
    const subParts = [];
    if (config.showLens && lensTitle) subParts.push(lensTitle);
    if (photographerText) subParts.push(photographerText);
    const subLine = subParts.join('   ·   ');

    if (subLine) {
      ctx.fillStyle = isDark ? '#94A3B8' : '#64748B';
      ctx.font = `normal ${subFontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`;
      ctx.fillText(subLine, textStartX, centerY + bottomBarH * 0.24);
    }

    // 右侧曝光参数与拍摄时间
    const rightX = canvasW - paddingX;
    ctx.textAlign = 'right';

    if (config.showParams && paramsString) {
      ctx.fillStyle = isDark ? '#F1F5F9' : '#1E293B';
      ctx.font = `500 ${Math.max(12, Math.round(bottomBarH * 0.2))}px "SF Mono", Menlo, Monaco, Consolas, monospace`;
      ctx.fillText(paramsString, rightX, centerY - bottomBarH * 0.06);
    }

    if (config.showDate && dateString) {
      ctx.fillStyle = isDark ? '#64748B' : '#94A3B8';
      ctx.font = `normal ${subFontSize}px "SF Mono", Menlo, monospace`;
      ctx.fillText(dateString, rightX, centerY + bottomBarH * 0.24);
    }
  } else if (isCinematic) {
    // 电影胶片宽荧幕排版 (Cinematic Scope)
    const paddingX = Math.round(canvasW * 0.04);
    const centerY = photoY + adjustedPhotoH + bottomBarH * 0.5;

    // 左侧徽标与标题
    const badgeSize = Math.round(bottomBarH * 0.35);
    const badgeType = customTpl ? customTpl.badgeType : 'cinema';
    if (badgeType !== 'none') {
      drawPhotographicBadge(ctx, badgeType, paddingX, centerY - badgeSize * 0.5, badgeSize, isDark);
    }

    const textStartX = badgeType === 'none' ? paddingX : paddingX + badgeSize * 1.35;
    ctx.textAlign = 'left';

    ctx.fillStyle = isDark ? '#F59E0B' : '#D97706';
    ctx.font = `bold ${Math.max(11, Math.round(bottomBarH * 0.2))}px "SF Mono", monospace`;
    ctx.fillText(
      customTpl ? customTpl.name.toUpperCase() : 'CINEMASCOPE 2.39:1',
      textStartX,
      centerY - bottomBarH * 0.08,
    );

    ctx.fillStyle = isDark ? '#94A3B8' : '#64748B';
    ctx.font = `normal ${Math.max(10, Math.round(bottomBarH * 0.16))}px -apple-system, sans-serif`;
    const cineSub = [cameraTitle, lensTitle, photographerText].filter(Boolean).join('  ·  ');
    ctx.fillText(cineSub || 'ANALOG 35MM MOTION PICTURE', textStartX, centerY + bottomBarH * 0.22);

    // 右侧：拍摄参数与胶片调色标识
    const rightX = canvasW - paddingX;
    ctx.textAlign = 'right';

    if (config.showParams && paramsString) {
      ctx.fillStyle = isDark ? '#F8FAFC' : '#1E293B';
      ctx.font = `500 ${Math.max(11, Math.round(bottomBarH * 0.2))}px "SF Mono", monospace`;
      ctx.fillText(paramsString, rightX, centerY - bottomBarH * 0.08);
    }

    if (config.showDate && dateString) {
      ctx.fillStyle = isDark ? '#64748B' : '#94A3B8';
      ctx.font = `normal ${Math.max(10, Math.round(bottomBarH * 0.15))}px "SF Mono", monospace`;
      ctx.fillText(dateString, rightX, centerY + bottomBarH * 0.22);
    }
  } else if (isPolaroid) {
    const barTop = photoY + adjustedPhotoH;
    const centerY = barTop + bottomBarH * 0.48;
    const paddingX = photoX + Math.round(adjustedPhotoW * 0.025);
    const rightX = photoX + adjustedPhotoW - Math.round(adjustedPhotoW * 0.025);
    const availableWidth = rightX - paddingX;

    const badgeType = customTpl ? customTpl.badgeType : 'none';
    const badgeSize = Math.round(bottomBarH * 0.32);
    if (badgeType !== 'none') {
      drawPhotographicBadge(ctx, badgeType, paddingX, centerY - badgeSize * 0.5, badgeSize, isDark);
    }
    const textStartX = badgeType === 'none' ? paddingX : paddingX + badgeSize * 1.35;

    // 拍立得复古字体与字号自适应计算
    let mainFontSize = Math.max(13, Math.min(26, Math.round(bottomBarH * 0.22)));
    let subFontSize = Math.max(10, Math.min(16, Math.round(bottomBarH * 0.15)));
    let paramsFontSize = Math.max(11, Math.min(18, Math.round(bottomBarH * 0.18)));

    const polaroidDate = config.showDate && dateString ? dateString : '';
    // 拍立得参数精简排版 (使用雅致中圆点间隔，避免长竖线过度占用横向空间)
    let polaroidParams = '';
    if (config.showParams && paramsString) {
      polaroidParams = paramsString.replace(/\s{2,}│\s{2,}/g, '  ·  ');
    }

    // 右侧曝光参数测量与字号自适应（避免极端窄图或长参数溢出）
    ctx.font = `500 ${paramsFontSize}px "SF Mono", Menlo, Monaco, Consolas, monospace`;
    let rightParamsWidth = polaroidParams ? ctx.measureText(polaroidParams).width : 0;
    while (rightParamsWidth > availableWidth * 0.58 && paramsFontSize > 9) {
      paramsFontSize -= 1;
      ctx.font = `500 ${paramsFontSize}px "SF Mono", Menlo, Monaco, Consolas, monospace`;
      rightParamsWidth = ctx.measureText(polaroidParams).width;
    }

    ctx.font = `normal ${subFontSize}px "SF Mono", Menlo, monospace`;
    let rightDateWidth = polaroidDate ? ctx.measureText(polaroidDate).width : 0;
    while (rightDateWidth > availableWidth * 0.45 && subFontSize > 8) {
      subFontSize -= 1;
      ctx.font = `normal ${subFontSize}px "SF Mono", Menlo, monospace`;
      rightDateWidth = ctx.measureText(polaroidDate).width;
    }

    const maxRightWidth = Math.max(rightParamsWidth, rightDateWidth);
    const gap = Math.max(12, Math.round(availableWidth * 0.03));
    const maxLeftWidth = availableWidth - (maxRightWidth > 0 ? maxRightWidth + gap : 0) - (textStartX - paddingX);

    // 左侧第一行：作者或机型 (经典复古衬线体 Georgia)
    const mainTitle = photographerText || (config.showCameraModel ? cameraTitle : '');
    if (mainTitle) {
      ctx.textAlign = 'left';
      ctx.fillStyle = isDark ? '#F8FAFC' : '#1E293B';
      ctx.font = `600 ${mainFontSize}px Georgia, "Times New Roman", serif`;

      let displayMainTitle = mainTitle;
      if (ctx.measureText(displayMainTitle).width > maxLeftWidth) {
        while (displayMainTitle.length > 3 && ctx.measureText(displayMainTitle + '…').width > maxLeftWidth) {
          displayMainTitle = displayMainTitle.slice(0, -1);
        }
        displayMainTitle += '…';
      }
      ctx.fillText(displayMainTitle, textStartX, centerY - bottomBarH * 0.08);
    }

    // 左侧第二行：镜头信息或机型副标题
    const subLine = [photographerText && config.showCameraModel ? cameraTitle : null, config.showLens ? lensTitle : null]
      .filter(Boolean)
      .join('  ·  ');
    if (subLine) {
      ctx.textAlign = 'left';
      ctx.fillStyle = isDark ? '#94A3B8' : '#64748B';
      ctx.font = `normal ${subFontSize}px "SF Mono", monospace, sans-serif`;

      let displaySubLine = subLine;
      if (ctx.measureText(displaySubLine).width > maxLeftWidth) {
        while (displaySubLine.length > 3 && ctx.measureText(displaySubLine + '…').width > maxLeftWidth) {
          displaySubLine = displaySubLine.slice(0, -1);
        }
        displaySubLine += '…';
      }
      ctx.fillText(displaySubLine, textStartX, centerY + bottomBarH * 0.22);
    }

    // 右侧第一行：完整曝光参数 (焦距、光圈、快门、ISO，右对齐锚定)
    if (polaroidParams) {
      ctx.textAlign = 'right';
      ctx.fillStyle = isDark ? '#F1F5F9' : '#1E293B';
      ctx.font = `500 ${paramsFontSize}px "SF Mono", Menlo, Monaco, Consolas, monospace`;
      ctx.fillText(polaroidParams, rightX, centerY - bottomBarH * 0.08);
    }

    // 右侧第二行：完整拍摄日期与时间戳 (右对齐锚定)
    if (polaroidDate) {
      ctx.textAlign = 'right';
      ctx.fillStyle = isDark ? '#64748B' : '#94A3B8';
      ctx.font = `normal ${subFontSize}px "SF Mono", Menlo, monospace`;
      ctx.fillText(polaroidDate, rightX, centerY + bottomBarH * 0.22);
    }
  }
 else if (isOverlayBadge) {
    const badgePadX = Math.round(canvasW * 0.035);
    const badgePadY = Math.round(canvasH * 0.035);
    const pillH = Math.max(38, Math.round(longEdge * 0.038));
    const pillPad = Math.round(pillH * 0.4);

    const displayParams = [cameraTitle, paramsString, dateString].filter(Boolean).join('   │   ');
    ctx.font = `500 ${Math.max(11, Math.round(pillH * 0.38))}px -apple-system, BlinkMacSystemFont, sans-serif`;
    const textWidth = ctx.measureText(displayParams).width;
    const pillW = textWidth + pillPad * 2;

    const pillX = badgePadX;
    const pillY = canvasH - badgePadY - pillH;

    // 磨砂玻璃质感胶囊
    ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.88)';
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, pillH * 0.5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isDark ? '#FFFFFF' : '#0F172A';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayParams, pillX + pillPad, pillY + pillH * 0.5);
  }

  // 4. 水印与个性化签名叠加层
  if (watermarkConfig && watermarkConfig.enabled) {
    await applyWatermarkToCanvas(finalCanvas, watermarkConfig);
  }

  return finalCanvas;
}

/**
 * 转换 Canvas 为指定格式 Blob
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/jpeg',
  quality = 0.94,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas 转 Blob 失败'));
        }
      },
      type,
      quality,
    );
  });
}

/**
 * 复制图片到剪贴板
 */
export async function copyCanvasToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  const blob = await canvasToBlob(canvas, 'image/png', 1.0);
  if (!navigator.clipboard || !navigator.clipboard.write) {
    throw new Error('当前系统环境不支持直接写入剪贴板图片');
  }
  const item = new ClipboardItem({ 'image/png': blob });
  await navigator.clipboard.write([item]);
  return true;
}

/**
 * 触发本地图片文件下载
 */
export function downloadCanvasAsImage(
  canvas: HTMLCanvasElement,
  filename: string,
  type = 'image/jpeg',
  quality = 0.94,
): void {
  const dataUrl = canvas.toDataURL(type, quality);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
