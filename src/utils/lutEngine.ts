import {
  Filter,
  GlProgram,
  GpuProgram,
  Texture,
  UniformGroup,
  BufferImageSource,
} from 'pixi.js';

export * from './lutPresets';
import { generateBuiltinLutData, clamp01 } from './lutPresets';

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

/**
 * 软件级 CPU 3D LUT 三线性插值变换（供离屏相框导出与高清 Canvas 渲染使用）
 */
export function apply3dLutToImageData(
  imageData: ImageData,
  lutData: Uint8Array,
  lutSize: number,
  intensity = 1.0,
): void {
  if (intensity <= 0 || !lutData || lutData.length === 0 || lutSize < 2) return;
  const clampedIntensity = Math.max(0, Math.min(1, intensity));
  const data = imageData.data;
  const len = data.length;
  const maxIdx = lutSize - 1;
  const sizeSq = lutSize * lutSize;

  for (let i = 0; i < len; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const rf = (r / 255) * maxIdx;
    const gf = (g / 255) * maxIdx;
    const bf = (b / 255) * maxIdx;

    const r0 = Math.floor(rf);
    const r1 = Math.min(r0 + 1, maxIdx);
    const dr = rf - r0;

    const g0 = Math.floor(gf);
    const g1 = Math.min(g0 + 1, maxIdx);
    const dg = gf - g0;

    const b0 = Math.floor(bf);
    const b1 = Math.min(b0 + 1, maxIdx);
    const db = bf - b0;

    // 8 个相邻顶点的偏移索引: (b * size * size + g * size + r) * 4
    const i000 = (b0 * sizeSq + g0 * lutSize + r0) * 4;
    const i100 = (b0 * sizeSq + g0 * lutSize + r1) * 4;
    const i010 = (b0 * sizeSq + g1 * lutSize + r0) * 4;
    const i110 = (b0 * sizeSq + g1 * lutSize + r1) * 4;

    const i001 = (b1 * sizeSq + g0 * lutSize + r0) * 4;
    const i101 = (b1 * sizeSq + g0 * lutSize + r1) * 4;
    const i011 = (b1 * sizeSq + g1 * lutSize + r0) * 4;
    const i111 = (b1 * sizeSq + g1 * lutSize + r1) * 4;

    // 沿 R 轴进行双线性插值
    const rdr0 = 1 - dr;
    // z = b0 面
    const c00_r = lutData[i000] * rdr0 + lutData[i100] * dr;
    const c00_g = lutData[i000 + 1] * rdr0 + lutData[i100 + 1] * dr;
    const c00_b = lutData[i000 + 2] * rdr0 + lutData[i100 + 2] * dr;

    const c10_r = lutData[i010] * rdr0 + lutData[i110] * dr;
    const c10_g = lutData[i010 + 1] * rdr0 + lutData[i110 + 1] * dr;
    const c10_b = lutData[i010 + 2] * rdr0 + lutData[i110 + 2] * dr;

    // z = b1 面
    const c01_r = lutData[i001] * rdr0 + lutData[i101] * dr;
    const c01_g = lutData[i001 + 1] * rdr0 + lutData[i101 + 1] * dr;
    const c01_b = lutData[i001 + 2] * rdr0 + lutData[i101 + 2] * dr;

    const c11_r = lutData[i011] * rdr0 + lutData[i111] * dr;
    const c11_g = lutData[i011 + 1] * rdr0 + lutData[i111 + 1] * dr;
    const c11_b = lutData[i011 + 2] * rdr0 + lutData[i111 + 2] * dr;

    // 沿 G 轴插值
    const rdg0 = 1 - dg;
    const c0_r = c00_r * rdg0 + c10_r * dg;
    const c0_g = c00_g * rdg0 + c10_g * dg;
    const c0_b = c00_b * rdg0 + c10_b * dg;

    const c1_r = c01_r * rdg0 + c11_r * dg;
    const c1_g = c01_g * rdg0 + c11_g * dg;
    const c1_b = c01_b * rdg0 + c11_b * dg;

    // 沿 B 轴插值
    const rdb0 = 1 - db;
    const targetR = c0_r * rdb0 + c1_r * db;
    const targetG = c0_g * rdb0 + c1_g * db;
    const targetB = c0_b * rdb0 + c1_b * db;

    // 混合强度
    if (clampedIntensity >= 0.999) {
      data[i] = (targetR + 0.5) | 0;
      data[i + 1] = (targetG + 0.5) | 0;
      data[i + 2] = (targetB + 0.5) | 0;
    } else {
      const invInt = 1 - clampedIntensity;
      data[i] = (r * invInt + targetR * clampedIntensity + 0.5) | 0;
      data[i + 1] = (g * invInt + targetG * clampedIntensity + 0.5) | 0;
      data[i + 2] = (b * invInt + targetB * clampedIntensity + 0.5) | 0;
    }
  }
}
