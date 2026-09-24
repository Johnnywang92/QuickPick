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
 * 高精度 Rec.709 亮度权重（现代摄影与 sRGB 标准，比老旧 Rec.601 更符合人眼知觉）
 */
export function getLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function clamp01(v: number): number {
  if (isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * 安全连续的 S 型胶片特性反差曲线（带软高光 Shoulder 与暗部 Toe），
 * 严格杜绝任何负底数幂计算造成的 NaN，保证输出平滑且在 [0, 1] 范围内。
 */
export function filmCurve(x: number, contrast = 1.15, toe = 0.0, shoulder = 1.0): number {
  const v = clamp01(x);
  let mapped: number;
  if (v < 0.5) {
    mapped = 0.5 * Math.pow(Math.max(0, 2 * v), contrast);
  } else {
    mapped = 1 - 0.5 * Math.pow(Math.max(0, 2 * (1 - v)), contrast);
  }
  return toe + mapped * (shoulder - toe);
}

/**
 * 安全平滑的色彩饱和度微调函数，带色彩边界软截断保护，
 * 避免强饱和色彩在通道边缘发生溢出或异常翻转。
 */
export function adjustSaturation(
  r: number,
  g: number,
  b: number,
  factor: number,
): [number, number, number] {
  const lum = getLuminance(r, g, b);
  let nr = lum + (r - lum) * factor;
  let ng = lum + (g - lum) * factor;
  let nb = lum + (b - lum) * factor;

  nr = clamp01(nr);
  ng = clamp01(ng);
  nb = clamp01(nb);

  return [nr, ng, nb];
}

/**
 * 分区色调微调 (Shadows / Highlights Split Toning)
 * 模拟胶片冲洗时的阴影冷暖调与高光暖调化学沉淀
 */
export function applySplitToning(
  r: number,
  g: number,
  b: number,
  lum: number,
  shadowTint: [number, number, number],
  highlightTint: [number, number, number],
): [number, number, number] {
  const shadowWeight = Math.pow(1 - lum, 1.8);
  const highlightWeight = Math.pow(lum, 1.6);

  const outR = r + shadowTint[0] * shadowWeight + highlightTint[0] * highlightWeight;
  const outG = g + shadowTint[1] * shadowWeight + highlightTint[1] * highlightWeight;
  const outB = b + shadowTint[2] * shadowWeight + highlightTint[2] * highlightWeight;

  return [clamp01(outR), clamp01(outG), clamp01(outB)];
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

        // 根据胶片预设施加专业摄影级色彩与反差映射
        switch (presetId) {
          case 'kodak_portra_400': {
            // Kodak Portra 400: 经典人像胶片，通透健康肤色，温暖高光，柔和暗部
            const lum = getLuminance(r, g, b);
            const [satR, satG, satB] = adjustSaturation(r, g, b, 1.05);

            // 肖像柔和反差，保留高光与暗部细腻层次
            const cr = filmCurve(satR, 1.12, 0.015, 0.995);
            const cg = filmCurve(satG, 1.10, 0.012, 0.995);
            const cb = filmCurve(satB, 1.14, 0.018, 0.990);

            // 高光微暖琥珀金，暗部微青，肤色保护
            const [tr, tg, tb] = applySplitToning(
              cr, cg, cb, lum,
              [-0.010, 0.008, 0.022],
              [0.032, 0.016, -0.020],
            );
            outR = tr;
            outG = tg;
            outB = tb;
            break;
          }

          case 'fuji_classic_chrome': {
            // Fuji Classic Chrome: 纪实人文，低饱和度，坚实阴影，典雅青绿天际
            const lum = getLuminance(r, g, b);
            const [satR, satG, satB] = adjustSaturation(r, g, b, 0.86);

            const cr = filmCurve(satR, 1.22, 0.005, 0.995);
            const cg = filmCurve(satG, 1.20, 0.005, 0.995);
            const cb = filmCurve(satB, 1.18, 0.008, 0.995);

            // 富士特有经典暗部青碧与高光微温
            const [tr, tg, tb] = applySplitToning(
              cr, cg, cb, lum,
              [-0.015, 0.018, 0.028],
              [0.015, -0.005, -0.010],
            );
            outR = tr;
            outG = tg;
            outB = tb;
            break;
          }

          case 'ccd_vintage_digital': {
            // 千禧年复古 CCD: 浓郁原色油画质感、透亮蓝天、温润泛光与微抬底阶
            const lum = getLuminance(r, g, b);
            const [satR, satG, satB] = adjustSaturation(r, g, b, 1.18);

            const cr = filmCurve(satR, 1.22, 0.018, 0.995);
            const cg = filmCurve(satG, 1.20, 0.016, 0.995);
            const cb = filmCurve(satB, 1.24, 0.020, 0.990);

            // 高光温润暖白（模拟 CCD 过曝漫反射光晕），暗部微冷通透
            const [tr, tg, tb] = applySplitToning(
              cr, cg, cb, lum,
              [-0.008, 0.005, 0.020],
              [0.030, 0.018, -0.015],
            );
            outR = tr;
            outG = tg;
            outB = tb;
            break;
          }

          case 'wedding_pure_white': {
            // 日系通透纯白: 高调明朗透明感，消除黄绿杂色，纯净透亮婚纱与元气肤质
            const lum = getLuminance(r, g, b);
            const liftR = Math.pow(Math.max(0, r), 0.94);
            const liftG = Math.pow(Math.max(0, g), 0.94);
            const liftB = Math.pow(Math.max(0, b), 0.92);

            const cr = filmCurve(liftR, 1.08, 0.010, 0.998);
            const cg = filmCurve(liftG, 1.06, 0.010, 0.998);
            const cb = filmCurve(liftB, 1.08, 0.012, 1.000);

            const [tr, tg, tb] = applySplitToning(
              cr, cg, cb, lum,
              [0.010, 0.005, 0.025],
              [0.012, 0.010, 0.018],
            );
            outR = tr;
            outG = tg;
            outB = tb;
            break;
          }

          case 'cinematic_teal_orange': {
            // 电影冷暖对冲: 深邃青蓝暗阶，琥珀金暖高光，中阶曝光中正，肤色保护
            const lum = getLuminance(r, g, b);

            const cr = filmCurve(r, 1.20, 0.005, 0.995);
            const cg = filmCurve(g, 1.18, 0.005, 0.995);
            const cb = filmCurve(b, 1.22, 0.005, 0.995);

            // 肤色区间保护
            const isSkin = r > g && g > b && lum > 0.25;
            const skinShield = isSkin ? 0.35 : 1.0;

            const [tr, tg, tb] = applySplitToning(
              cr, cg, cb, lum,
              [-0.055 * skinShield, 0.020 * skinShield, 0.065 * skinShield],
              [0.055, 0.022, -0.045],
            );
            outR = tr;
            outG = tg;
            outB = tb;
            break;
          }

          case 'leica_monochrome': {
            // 莱卡高反差黑白: 全色阶加权与橙镜质感，深邃黑位，利落光影轮廓
            const gray = 0.26 * r + 0.64 * g + 0.10 * b;
            const mono = filmCurve(gray, 1.30, 0.002, 0.998);
            outR = mono;
            outG = mono;
            outB = mono;
            break;
          }

          case 'kodak_ektar_100': {
            // Kodak Ektar 100: 风光大片浓郁色彩，高饱和，高透亮蓝天与落日红霞
            const lum = getLuminance(r, g, b);
            const [satR, satG, satB] = adjustSaturation(r, g, b, 1.20);

            const cr = filmCurve(satR, 1.24, 0.002, 0.998);
            const cg = filmCurve(satG, 1.22, 0.002, 0.998);
            const cb = filmCurve(satB, 1.25, 0.002, 0.998);

            const [tr, tg, tb] = applySplitToning(
              cr, cg, cb, lum,
              [-0.010, 0.005, 0.025],
              [0.025, 0.010, -0.015],
            );
            outR = tr;
            outG = tg;
            outB = tb;
            break;
          }

          case 'nordic_clean': {
            // 北欧极简冷白: 清冷纯净，克制低饱和，高光冷白，静谧质感
            const lum = getLuminance(r, g, b);
            const [satR, satG, satB] = adjustSaturation(r, g, b, 0.82);

            const cr = filmCurve(satR, 1.12, 0.008, 0.996);
            const cg = filmCurve(satG, 1.10, 0.008, 0.996);
            const cb = filmCurve(satB, 1.14, 0.010, 0.996);

            const [tr, tg, tb] = applySplitToning(
              cr, cg, cb, lum,
              [-0.010, 0.000, 0.018],
              [-0.012, 0.004, 0.022],
            );
            outR = tr;
            outG = tg;
            outB = tb;
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
