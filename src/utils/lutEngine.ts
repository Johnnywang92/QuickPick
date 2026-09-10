import {
  Filter,
  GlProgram,
  GpuProgram,
  Texture,
  UniformGroup,
  BufferImageSource,
} from 'pixi.js';

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

function clamp01(v: number): number {
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

          case 'wedding_pure_white': {
            // 日系高调透亮：高光柔和泛白，消除黄色杂色，暗部透光
            // 提亮中低调
            const liftR = Math.pow(r, 0.88);
            const liftG = Math.pow(g, 0.88);
            const liftB = Math.pow(b, 0.86);

            // 抑制黄绿色偏，赋予微粉透亮感
            outR = liftR * 1.04;
            outG = liftG * 1.01;
            outB = liftB * 1.06;

            // 高光压缩防止溢出
            outR = Math.min(1.0, outR);
            outG = Math.min(1.0, outG);
            outB = Math.min(1.0, outB);
            break;
          }

          case 'cinematic_teal_orange': {
            // 电影大片 Teal & Orange: 阴影推向 Teal 青蓝，高光推向 Orange 暖橙
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            const sR = sCurve(r, 1.4);
            const sG = sCurve(g, 1.35);
            const sB = sCurve(b, 1.4);

            // 暗部加青绿蓝，高光加红橙
            const shadowMask = Math.pow(1.0 - lum, 1.8);
            const highlightMask = Math.pow(lum, 1.6);

            outR = sR - shadowMask * 0.08 + highlightMask * 0.14;
            outG = sG + shadowMask * 0.04 + highlightMask * 0.05;
            outB = sB + shadowMask * 0.15 - highlightMask * 0.10;
            break;
          }

          case 'leica_monochrome': {
            // 莱卡经典全色阶高反差黑白
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            const sGray = sCurve(gray, 1.5);
            outR = sGray;
            outG = sGray;
            outB = sGray;
            break;
          }

          case 'kodak_ektar_100': {
            // 浓郁鲜活风光反转片
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            const satR = lum + (r - lum) * 1.35;
            const satG = lum + (g - lum) * 1.30;
            const satB = lum + (b - lum) * 1.35;

            outR = sCurve(clamp01(satR), 1.35);
            outG = sCurve(clamp01(satG), 1.30);
            outB = sCurve(clamp01(satB), 1.35);
            break;
          }

          case 'nordic_clean': {
            // 北欧冷淡高冷风
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            // 降低饱和 30%
            const desatR = lum + (r - lum) * 0.70;
            const desatG = lum + (g - lum) * 0.65;
            const desatB = lum + (b - lum) * 0.75;

            outR = sCurve(desatR, 1.15) * 0.95;
            outG = sCurve(desatG, 1.15) * 0.98;
            outB = sCurve(desatB, 1.15) * 1.06;
            break;
          }

          default:
            outR = r;
            outG = g;
            outB = b;
        }

        // 计算 2D 贴图中的像素坐标
        // X 坐标 = bIndex * size + rIndex
        // Y 坐标 = gIndex
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
    // 尝试根据点数推导尺寸 N = round(total^(1/3))
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

  // 转换为 (size*size) x size 的 2D 贴图
  const width = size * size;
  const height = size;
  const output = new Uint8Array(width * height * 4);

  // 在 .cube 规范中，顺序通常是：R 先变，G 次之，B 再次之：
  // index = r + g * size + b * size * size
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

/**
 * 缓存的贴图映射
 */
const textureCache = new Map<string, Texture>();

export function getOrCreateLutTexture(presetId: string, customData?: { size: number; data: Uint8Array }): {
  texture: Texture;
  size: number;
} {
  const cacheKey = customData ? `custom_${presetId}` : presetId;
  const existing = textureCache.get(cacheKey);
  const size = customData?.size || 33;

  if (existing) {
    return { texture: existing, size };
  }

  const rawData = customData ? customData.data : generateBuiltinLutData(presetId, size);
  const width = size * size;
  const height = size;

  const source = new BufferImageSource({
    resource: rawData,
    width,
    height,
    format: 'rgba8unorm',
    scaleMode: 'linear',
  });

  const texture = new Texture({ source });
  textureCache.set(cacheKey, texture);

  return { texture, size };
}

// WebGL 顶点着色器 (Pixi v8 规范)
const LUT_VERTEX_GLSL = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

// WebGL 片段着色器 (三线性插值 3D LUT)
const LUT_FRAGMENT_GLSL = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uLutTexture;

uniform float uLutSize;
uniform float uIntensity;

void main(void)
{
    vec4 orig = texture(uTexture, vTextureCoord);
    if (orig.a == 0.0 || uIntensity <= 0.0) {
        finalColor = orig;
        return;
    }

    vec3 col = clamp(orig.rgb / orig.a, 0.0, 1.0);

    float blue = col.b * (uLutSize - 1.0);
    float slice0 = floor(blue);
    float slice1 = min(slice0 + 1.0, uLutSize - 1.0);

    float u0 = (slice0 * uLutSize + col.r * (uLutSize - 1.0) + 0.5) / (uLutSize * uLutSize);
    float u1 = (slice1 * uLutSize + col.r * (uLutSize - 1.0) + 0.5) / (uLutSize * uLutSize);
    float v = (col.g * (uLutSize - 1.0) + 0.5) / uLutSize;

    vec3 lut0 = texture(uLutTexture, vec2(u0, v)).rgb;
    vec3 lut1 = texture(uLutTexture, vec2(u1, v)).rgb;

    vec3 graded = mix(lut0, lut1, fract(blue));
    vec3 result = mix(col, graded, uIntensity);

    finalColor = vec4(result * orig.a, orig.a);
}
`;

// WebGPU WGSL 着色器
const LUT_WGSL = `
struct GlobalFilterUniforms {
  uInputSize: vec4<f32>,
  uInputPixel: vec4<f32>,
  uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>,
  uGlobalFrame: vec4<f32>,
  uOutputTexture: vec4<f32>,
};

struct LutUniforms {
  uLutSize: f32,
  uIntensity: f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@group(1) @binding(0) var<uniform> lutUniforms: LutUniforms;
@group(1) @binding(1) var uLutTexture: texture_2d<f32>;
@group(1) @binding(2) var uLutSampler: sampler;

struct VSOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {
  var output: VSOutput;
  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
  output.position = vec4<f32>(position, 0.0, 1.0);
  output.uv = aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
  return output;
}

@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let orig = textureSample(uTexture, uSampler, uv);
  if (orig.a == 0.0 || lutUniforms.uIntensity <= 0.0) {
    return orig;
  }
  let col = clamp(orig.rgb / orig.a, vec3<f32>(0.0), vec3<f32>(1.0));
  let size = lutUniforms.uLutSize;
  let blue = col.b * (size - 1.0);
  let slice0 = floor(blue);
  let slice1 = min(slice0 + 1.0, size - 1.0);

  let u0 = (slice0 * size + col.r * (size - 1.0) + 0.5) / (size * size);
  let u1 = (slice1 * size + col.r * (size - 1.0) + 0.5) / (size * size);
  let v = (col.g * (size - 1.0) + 0.5) / size;

  let lut0 = textureSample(uLutTexture, uLutSampler, vec2<f32>(u0, v)).rgb;
  let lut1 = textureSample(uLutTexture, uLutSampler, vec2<f32>(u1, v)).rgb;

  let graded = mix(lut0, lut1, fract(blue));
  let result = mix(col, graded, lutUniforms.uIntensity);
  return vec4<f32>(result * orig.a, orig.a);
}
`;

/**
 * 专为 Pixi.js v8 打造的硬件级 3D LUT 色彩映射滤镜
 */
export class LutFilter extends Filter {
  private _lutUniforms: UniformGroup;

  constructor(lutTexture: Texture, lutSize: number, intensity = 0.85) {
    const lutUniforms = new UniformGroup({
      uLutSize: { value: lutSize, type: 'f32' },
      uIntensity: { value: intensity, type: 'f32' },
    });

    const glProgram = GlProgram.from({
      vertex: LUT_VERTEX_GLSL,
      fragment: LUT_FRAGMENT_GLSL,
      name: 'lut-filter-gl',
    });

    const gpuProgram = GpuProgram.from({
      vertex: {
        source: LUT_WGSL,
        entryPoint: 'mainVertex',
      },
      fragment: {
        source: LUT_WGSL,
        entryPoint: 'mainFragment',
      },
    });

    const textureSource = lutTexture.source;

    super({
      glProgram,
      gpuProgram,
      resources: {
        lutUniforms,
        uLutTexture: textureSource,
        uLutSampler: textureSource.style,
      },
    });

    this._lutUniforms = lutUniforms;
  }

  public get intensity(): number {
    return this._lutUniforms.uniforms.uIntensity as number;
  }

  public set intensity(value: number) {
    this._lutUniforms.uniforms.uIntensity = clamp01(value);
  }

  public updateLut(lutTexture: Texture, lutSize: number): void {
    this._lutUniforms.uniforms.uLutSize = lutSize;
    const textureSource = lutTexture.source;
    (this.resources as any).uLutTexture = textureSource;
    (this.resources as any).uLutSampler = textureSource.style;
  }
}
