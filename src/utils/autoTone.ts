import { DEFAULT_ADJUSTMENTS, PhotoAdjustments } from '../types/adjust';

export interface ImageLuminanceStats {
  median: number;           // 亮度中位数 (0 ~ 255)
  mean: number;             // 平均亮度 (0 ~ 255)
  p2: number;               // 第 2 百分位 (暗部下界)
  p25: number;              // 第 25 百分位
  p75: number;              // 第 75 百分位
  p98: number;              // 第 98 百分位 (高光上界)
  stdDev: number;           // 亮度标准差 (对比度指标)
  highlightClipPct: number; // 极高光比例 (L >= 248)
  shadowClipPct: number;    // 极死黑比例 (L <= 8)
  avgR: number;             // 中间调 R 均值
  avgG: number;             // 中间调 G 均值
  avgB: number;             // 中间调 B 均值
  totalPixels: number;
}

export interface PixelDataSource {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

/**
 * 从像素数据缓冲中统计画面的感知亮度直方图与色彩通道分布
 */
export function extractLuminanceStatsFromPixels(
  pixelData: ArrayLike<number>,
  width: number,
  height: number,
  samplingStep = 1,
): ImageLuminanceStats {
  const histogram = new Uint32Array(256);
  let totalPixels = 0;
  let sumLum = 0;
  let sumSqLum = 0;
  let highlightClipCount = 0;
  let shadowClipCount = 0;

  let midRSum = 0;
  let midGSum = 0;
  let midBSum = 0;
  let midCount = 0;

  const len = width * height * 4;
  const stride = Math.max(1, samplingStep) * 4;

  for (let i = 0; i < len; i += stride) {
    const r = pixelData[i];
    const g = pixelData[i + 1];
    const b = pixelData[i + 2];
    const a = pixelData[i + 3];

    // 跳过完全透明像素
    if (a < 16) continue;

    // ITU-R BT.709 感知亮度
    const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const clampedLum = lum < 0 ? 0 : lum > 255 ? 255 : lum;

    histogram[clampedLum]++;
    sumLum += clampedLum;
    sumSqLum += clampedLum * clampedLum;
    totalPixels++;

    if (clampedLum >= 248) highlightClipCount++;
    if (clampedLum <= 8) shadowClipCount++;

    // 中间调色彩均值 (排除极黑与极白)
    if (clampedLum >= 35 && clampedLum <= 220) {
      midRSum += r;
      midGSum += g;
      midBSum += b;
      midCount++;
    }
  }

  if (totalPixels === 0) {
    return {
      median: 128,
      mean: 128,
      p2: 30,
      p25: 80,
      p75: 160,
      p98: 225,
      stdDev: 50,
      highlightClipPct: 0,
      shadowClipPct: 0,
      avgR: 128,
      avgG: 128,
      avgB: 128,
      totalPixels: 0,
    };
  }

  const mean = sumLum / totalPixels;
  const variance = Math.max(0, sumSqLum / totalPixels - mean * mean);
  const stdDev = Math.sqrt(variance);

  // 计算累积分布分位数
  let acc = 0;
  let p2 = 0;
  let p25 = 64;
  let median = 128;
  let p75 = 192;
  let p98 = 255;

  const t2 = totalPixels * 0.02;
  const t25 = totalPixels * 0.25;
  const t50 = totalPixels * 0.50;
  const t75 = totalPixels * 0.75;
  const t98 = totalPixels * 0.98;

  let foundP2 = false;
  let foundP25 = false;
  let foundP50 = false;
  let foundP75 = false;
  let foundP98 = false;

  for (let i = 0; i < 256; i++) {
    acc += histogram[i];
    if (!foundP2 && acc >= t2) {
      p2 = i;
      foundP2 = true;
    }
    if (!foundP25 && acc >= t25) {
      p25 = i;
      foundP25 = true;
    }
    if (!foundP50 && acc >= t50) {
      median = i;
      foundP50 = true;
    }
    if (!foundP75 && acc >= t75) {
      p75 = i;
      foundP75 = true;
    }
    if (!foundP98 && acc >= t98) {
      p98 = i;
      foundP98 = true;
    }
  }

  return {
    median,
    mean,
    p2,
    p25,
    p75,
    p98,
    stdDev,
    highlightClipPct: highlightClipCount / totalPixels,
    shadowClipPct: shadowClipCount / totalPixels,
    avgR: midCount > 0 ? midRSum / midCount : 128,
    avgG: midCount > 0 ? midGSum / midCount : 128,
    avgB: midCount > 0 ? midBSum / midCount : 128,
    totalPixels,
  };
}

/**
 * 从 Canvas 或 Image 中提取像素数据并进行光影分析
 */
export function extractStatsFromSource(
  source: CanvasImageSource | PixelDataSource,
  sampleWidth = 240,
  sampleHeight = 240,
): ImageLuminanceStats {
  // 1. 若已经是 PixelDataSource (例如 ImageData 或单元测试模拟对象)
  if ('data' in source && typeof source.width === 'number' && typeof source.height === 'number') {
    return extractLuminanceStatsFromPixels(source.data, source.width, source.height, 1);
  }

  // 2. 浏览器 DOM 环境下使用离屏采样 Canvas
  if (typeof document !== 'undefined') {
    try {
      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = sampleWidth;
      sampleCanvas.height = sampleHeight;
      const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(source as CanvasImageSource, 0, 0, sampleWidth, sampleHeight);
        const imgData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
        return extractLuminanceStatsFromPixels(imgData.data, sampleWidth, sampleHeight, 1);
      }
    } catch (e) {
      console.warn('离屏画布取样失败，使用默认测光', e);
    }
  }

  // 降级保底
  return {
    median: 118,
    mean: 118,
    p2: 25,
    p25: 75,
    p75: 165,
    p98: 235,
    stdDev: 55,
    highlightClipPct: 0.01,
    shadowClipPct: 0.01,
    avgR: 128,
    avgG: 128,
    avgB: 128,
    totalPixels: 1,
  };
}

/**
 * 核心算法：基于直方图统计计算自适应一键调光参数
 */
export function calculateAutoTone(
  source: CanvasImageSource | PixelDataSource,
  options?: {
    preserveRotation?: number;
    subtle?: boolean;
  },
): PhotoAdjustments {
  const stats = extractStatsFromSource(source);

  // 1. 曝光补偿 (Exposure Compensation)
  // 摄影中性 18% 灰对应感知中位目标约为 118
  const targetMedian = 118;
  const effectiveMedian = Math.max(20, Math.min(235, stats.median));
  const rawEvDiff = Math.log2(targetMedian / effectiveMedian);

  // 高光保护阻尼：如果画面高光已经接近死白溢出，限制正向提曝，防止高光炸开
  let exposure = 0;
  if (rawEvDiff > 0) {
    // 欠曝提亮：若高光比例高，衰减提亮幅度
    const highlightDamping = Math.max(0.2, 1.0 - stats.highlightClipPct * 12);
    exposure = rawEvDiff * highlightDamping * 0.8;
  } else {
    // 过曝压暗：稍平滑压暗
    exposure = rawEvDiff * 0.85;
  }
  // 安全范围限制在 [-1.5, +1.5] EV 之间，四舍五入保留 1 位小数
  exposure = Math.round(Math.max(-1.5, Math.min(1.5, exposure)) * 10) / 10;

  // 2. 高光拉回 (Highlights)
  // 针对高光溢出与死白边缘，进行自适应压暗拯救
  let highlights = 0;
  if (stats.p98 > 230 || stats.highlightClipPct > 0.01) {
    const excess = Math.max(0, stats.p98 - 230);
    const clipPenalty = stats.highlightClipPct * 120;
    const hlPull = -(excess * 1.5 + clipPenalty);
    highlights = Math.round(Math.max(-55, Math.min(-10, hlPull)));
  } else if (stats.p98 < 190 && exposure >= 0) {
    // 高光极度欠缺且不发灰时，微放高光展现通透感
    highlights = Math.round(Math.min(15, (200 - stats.p98) * 0.3));
  }

  // 3. 阴影提亮 (Shadows)
  // 针对暗部死黑或阴影层次粘连，进行细节舒展提亮
  let shadows = 0;
  if (stats.p2 < 35 || stats.shadowClipPct > 0.015) {
    const deficit = Math.max(0, 35 - stats.p2);
    const shadowBonus = stats.shadowClipPct * 100;
    const shLift = deficit * 1.3 + shadowBonus;
    shadows = Math.round(Math.min(50, Math.max(12, shLift)));
  } else if (stats.p2 > 65) {
    // 暗部发灰无沉淀感时，微压阴影增加沉着度
    shadows = Math.round(Math.max(-20, (50 - stats.p2) * 0.4));
  }

  // 4. 动态对比度 (Contrast)
  // 依据亮度标准差 (动态范围离散度)
  let contrast = 0;
  if (stats.stdDev < 42) {
    // 画面平淡、灰雾：拉升反差
    contrast = Math.round(Math.min(25, (45 - stats.stdDev) * 1.2));
  } else if (stats.stdDev > 75) {
    // 大光比、硬光过烈：温和软化反差
    contrast = Math.round(Math.max(-18, -(stats.stdDev - 72) * 0.8));
  } else {
    // 正常场景微调 +5 增加清爽度
    contrast = 4;
  }

  // 5. 自动白平衡与色温微调 (Auto White Balance)
  let temperature = 0;
  let tint = 0;

  const rDiff = stats.avgR - stats.avgB;
  if (Math.abs(rDiff) > 12) {
    // 偏暖(R>B)则微冷化；偏冷(B>R)则微暖化
    const rawTemp = -rDiff * 0.4;
    temperature = Math.round(Math.max(-25, Math.min(25, rawTemp)));
  }

  const gDiff = stats.avgG - (stats.avgR + stats.avgB) / 2;
  if (Math.abs(gDiff) > 8) {
    // 偏绿(G过高)则微偏洋红；偏品(G过低)则微偏绿
    const rawTint = -gDiff * 0.5;
    tint = Math.round(Math.max(-20, Math.min(20, rawTint)));
  }

  // 6. 微量饱和度优化 (Saturation)
  // 如果画面由于提暗部而略有灰度，给 +4 ~ +8 保护生动色彩
  let saturation = 0;
  if (shadows > 15 || contrast < 0) {
    saturation = 6;
  }

  return {
    exposure,
    contrast,
    highlights,
    shadows,
    temperature,
    tint,
    saturation,
    isBlackAndWhite: false,
    rotation: options?.preserveRotation ?? DEFAULT_ADJUSTMENTS.rotation,
  };
}
