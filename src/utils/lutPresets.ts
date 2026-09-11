export interface LutPreset {
  id: string;
  name: string;
  tag: string;
  description: string;
  size: number;
}

export const BUILTIN_LUTS: LutPreset[] = [
  {
    id: 'kodak_portra_400',
    name: 'Kodak Portra 400',
    tag: '经典胶片人像',
    description: '暖金高光、柔和低反差与微青暗部，自然通透肤色',
    size: 33,
  },
  {
    id: 'fuji_classic_chrome',
    name: 'Fuji Classic Chrome',
    tag: '富士纪实色彩',
    description: '低饱和度、硬朗阴影、典雅青绿天空，纪实人文氛围',
    size: 33,
  },
  {
    id: 'ccd_vintage_digital',
    name: 'CCD Vintage Digicam',
    tag: '千禧复古 CCD',
    description: '浓郁原色饱和度、暖白高光溢出与复古油画质感，还原千禧年经典卡片机氛围',
    size: 33,
  },
  {
    id: 'wedding_pure_white',
    name: 'Pure White Bridal',
    tag: '日系通透纯白',
    description: '高调柔光曲线、婚纱纯净透亮不泛黄、粉嫩元气肤质',
    size: 33,
  },
  {
    id: 'cinematic_teal_orange',
    name: 'Teal & Orange',
    tag: '电影冷暖对冲',
    description: '深邃青蓝暗部对比暖金琥珀高光，强烈视觉冲击力',
    size: 33,
  },
  {
    id: 'leica_monochrome',
    name: 'Leica M Monochrome',
    tag: '莱卡高反差黑白',
    description: '经典全色阶明度权重、深邃黑阶、极度利落的光影轮廓',
    size: 33,
  },
  {
    id: 'kodak_ektar_100',
    name: 'Kodak Ektar 100',
    tag: '风光浓郁胶片',
    description: '高饱和度、浓郁晚霞红与透亮蓝天，风光大片首选',
    size: 33,
  },
  {
    id: 'nordic_clean',
    name: 'Nordic Minimalist',
    tag: '北欧清冷淡雅',
    description: '冷白高光、克制低饱和、现代纯净极简美学',
    size: 33,
  },
];

/**
 * 辅助色彩曲线变换 (S 曲线、伽马、冷暖偏移)
 */
function sCurve(x: number, power = 1.35): number {
  return x < 0.5
    ? 0.5 * Math.pow(2 * x, power)
    : 1 - 0.5 * Math.pow(2 * (1 - x), power);
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * 根据预设 ID 生成 33x33x33 展开为 (33*33) x 33 的 2D 贴图像素数据 (RGBA Uint8Array)
 */
export function generateBuiltinLutData(presetId: string, size = 33): Uint8Array {
  const width = size * size;
  const height = size;
  const data = new Uint8Array(width * height * 4);

  for (let bIndex = 0; bIndex < size; bIndex++) {
    const b = bIndex / (size - 1);

    for (let gIndex = 0; gIndex < size; gIndex++) {
      const g = gIndex / (size - 1);

      for (let rIndex = 0; rIndex < size; rIndex++) {
        const r = rIndex / (size - 1);

        let outR = r;
        let outG = g;
        let outB = b;

        // 根据胶片预设施加非线性色彩与明度映射
        switch (presetId) {
          case 'kodak_portra_400': {
            // 暖金高光与柔和微青暗阶，降低高光死白，提亮暗部
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            const curveR = sCurve(r, 1.25);
            const curveG = sCurve(g, 1.22);
            const curveB = sCurve(b, 1.30);

            // 高光偏暖，暗部微青
            outR = curveR * 1.05 + 0.02 * (1 - lum);
            outG = curveG * 1.01 + 0.03 * (1 - lum);
            outB = curveB * 0.92 + 0.06 * (1 - lum);
            // 柔和暗部压缩
            outR = 0.04 + outR * 0.94;
            outG = 0.03 + outG * 0.95;
            outB = 0.05 + outB * 0.92;
            break;
          }

          case 'fuji_classic_chrome': {
            // 稍硬的阴影，平缓的中途阶，降低青绿高饱和
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            // 去饱和 15%
            const desatR = lum + (r - lum) * 0.85;
            const desatG = lum + (g - lum) * 0.80;
            const desatB = lum + (b - lum) * 0.88;

            outR = sCurve(desatR, 1.45);
            outG = sCurve(desatG, 1.40);
            outB = sCurve(desatB, 1.35);

            // 富士特有的暗部偏青与高光微品红
            outR = outR * 1.02;
            outB = outB * 0.96 + (1 - lum) * 0.03;
            break;
          }

          case 'ccd_vintage_digital': {
            // 千禧年复古 CCD 传感器风格：浓郁原色油画质感、高饱和宝石蓝天与微透暖光
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;

            // 1. 中阶与原色饱和度强化 (经典 CCD 标志性油画感原色)
            const satR = lum + (r - lum) * 1.22;
            const satG = lum + (g - lum) * 1.18;
            const satB = lum + (b - lum) * 1.26;

            // 2. CCD 适度反差 S 曲线 (硬朗明暗与层次感)
            const curveR = sCurve(satR, 1.34);
            const curveG = sCurve(satG, 1.32);
            const curveB = sCurve(satB, 1.36);

            // 3. 高光温润奶白微暖泛光，阴影微冷净透
            const highlightWeight = Math.pow(lum, 1.6);
            const shadowWeight = Math.pow(1 - lum, 1.5);

            outR = curveR + highlightWeight * 0.04;
            outG = curveG + highlightWeight * 0.02;
            outB = curveB - highlightWeight * 0.02 + shadowWeight * 0.03;

            // 4. 黑平阶与微雾感：适度抬升暗部底阶 (黑位约 0.025)，还原经典卡片机氛围
            outR = 0.025 + outR * 0.96;
            outG = 0.022 + outG * 0.96;
            outB = 0.030 + outB * 0.95;
            break;
          }

          case 'wedding_pure_white': {
            // 日系高调透亮：高光柔和泛白，消除黄色杂色，暗部透光
            // 提亮中低调
            const liftR = Math.pow(r, 0.88);
            const liftG = Math.pow(g, 0.88);
            const liftB = Math.pow(b, 0.86);

            // 抑制黄绿色偏，赋予微粉透亮感
            outR = liftR * 1.04;
            outG = liftG * 1.01;
            outB = liftB * 1.03;
            // 提亮极暗阶
            outR = 0.03 + outR * 0.97;
            outG = 0.03 + outG * 0.97;
            outB = 0.04 + outB * 0.96;
            break;
          }

          case 'cinematic_teal_orange': {
            // 电影感：暗部推向青蓝 (Teal)，高光推向金黄橙 (Orange)
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            const contrast = sCurve(lum, 1.4);
            const shadowWeight = Math.pow(1 - lum, 1.8);
            const highlightWeight = Math.pow(lum, 1.5);

            // 暗部加青(降低R，增加B和G)
            outR = r * contrast - shadowWeight * 0.08 + highlightWeight * 0.12;
            outG = g * contrast + shadowWeight * 0.02 + highlightWeight * 0.05;
            outB = b * contrast + shadowWeight * 0.14 - highlightWeight * 0.08;
            break;
          }

          case 'leica_monochrome': {
            // 莱卡高反差黑白
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            // 强 S 曲线压暗低光，强化中高光层次
            const mono = sCurve(gray, 1.55);
            outR = mono;
            outG = mono;
            outB = mono;
            break;
          }

          case 'kodak_ektar_100': {
            // 浓郁色彩，强化红黄色系与蓝天饱和度
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            // 饱和度提升 25%
            const satR = lum + (r - lum) * 1.25;
            const satG = lum + (g - lum) * 1.20;
            const satB = lum + (b - lum) * 1.28;

            outR = sCurve(satR, 1.32);
            outG = sCurve(satG, 1.30);
            outB = sCurve(satB, 1.32);
            break;
          }

          case 'nordic_clean': {
            // 北欧极简冷白：降饱和，轻微偏冷，极净通透
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            const desat = lum + (r - lum) * 0.78;
            const desatG = lum + (g - lum) * 0.80;
            const desatB = lum + (b - lum) * 0.84;

            // 轻微冷调微偏
            outR = desat * 0.98;
            outG = desatG * 0.99;
            outB = desatB * 1.04;
            // 轻提阴影，微压纯白
            outR = 0.02 + outR * 0.96;
            outG = 0.02 + outG * 0.96;
            outB = 0.03 + outB * 0.96;
            break;
          }

          default:
            break;
        }

        const pixelX = bIndex * size + rIndex;
        const pixelY = gIndex;
        const offset = (pixelY * width + pixelX) * 4;

        data[offset] = Math.round(clamp01(outR) * 255);
        data[offset + 1] = Math.round(clamp01(outG) * 255);
        data[offset + 2] = Math.round(clamp01(outB) * 255);
        data[offset + 3] = 255;
      }
    }
  }

  return data;
}

/**
 * 解析行业标准 Adobe / DaVinci Resolve .cube 3D LUT 文件
 */
export function parseCubeLut(cubeContent: string): {
  title: string;
  size: number;
  data: Uint8Array;
} {
  const lines = cubeContent.split(/\r?\n/);
  let size = 0;
  let title = 'Custom LUT';
  const tableData: [number, number, number][] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('TITLE')) {
      const match = line.match(/^TITLE\s+"?([^"]+)"?/i);
      if (match) title = match[1];
      continue;
    }

    if (line.startsWith('LUT_3D_SIZE')) {
      const parts = line.split(/\s+/);
      size = parseInt(parts[1], 10);
      continue;
    }

    if (line.startsWith('DOMAIN_MIN') || line.startsWith('DOMAIN_MAX')) {
      continue;
    }

    // 数值行: R G B
    const parts = line.split(/\s+/);
    if (parts.length >= 3) {
      const r = parseFloat(parts[0]);
      const g = parseFloat(parts[1]);
      const b = parseFloat(parts[2]);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        tableData.push([r, g, b]);
      }
    }
  }

  if (size <= 0) {
    const inferred = Math.round(Math.cbrt(tableData.length));
    if (inferred * inferred * inferred === tableData.length) {
      size = inferred;
    } else {
      throw new Error(`无法识别的 .cube 文件尺寸，解析到 ${tableData.length} 个点`);
    }
  }

  const expectedPoints = size * size * size;
  if (tableData.length < expectedPoints) {
    throw new Error(
      `.cube 文件数据点不足：期望 ${expectedPoints} 点，实际读取到 ${tableData.length} 点`,
    );
  }

  const width = size * size;
  const height = size;
  const output = new Uint8Array(width * height * 4);

  let index = 0;
  for (let bIndex = 0; bIndex < size; bIndex++) {
    for (let gIndex = 0; gIndex < size; gIndex++) {
      for (let rIndex = 0; rIndex < size; rIndex++) {
        const [r, g, b] = tableData[index++];
        const pixelX = bIndex * size + rIndex;
        const pixelY = gIndex;
        const offset = (pixelY * width + pixelX) * 4;

        output[offset] = Math.round(clamp01(r) * 255);
        output[offset + 1] = Math.round(clamp01(g) * 255);
        output[offset + 2] = Math.round(clamp01(b) * 255);
        output[offset + 3] = 255;
      }
    }
  }

  return {
    title,
    size,
    data: output,
  };
}
