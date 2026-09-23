import {
  Filter,
  GlProgram,
  GpuProgram,
  UniformGroup,
} from 'pixi.js';
import { PhotoAdjustments } from '../types/adjust';

const ADJUST_VERTEX_GLSL = `
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

const ADJUST_FRAGMENT_GLSL = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;

uniform float uExposure;
uniform float uContrast;
uniform float uHighlights;
uniform float uShadows;
uniform float uTemp;
uniform float uTint;
uniform float uSaturation;
uniform float uIsBw;

void main(void)
{
    vec4 orig = texture(uTexture, vTextureCoord);
    if (orig.a == 0.0) {
        finalColor = orig;
        return;
    }

    vec3 col = orig.rgb / orig.a;

    // 1. 曝光调整
    col *= exp2(uExposure);

    // 2. 阴影与高光调整
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    float shadowWeight = clamp(1.0 - lum * 2.0, 0.0, 1.0);
    float highlightWeight = clamp((lum - 0.5) * 2.0, 0.0, 1.0);

    col += vec3((uShadows * 0.35 * shadowWeight) + (uHighlights * 0.35 * highlightWeight));

    // 3. 对比度调整
    float contrastFactor = (259.0 * (uContrast * 100.0 + 255.0)) / (255.0 * (259.0 - uContrast * 100.0));
    col = (col - 0.5) * contrastFactor + 0.5;

    // 4. 色温 (Temp) 与色调 (Tint)
    col.r *= (1.0 + uTemp * 0.3);
    col.b *= (1.0 - uTemp * 0.3);
    col.g *= (1.0 - uTint * 0.3);

    // 5. 饱和度与一键黑白
    float gray = dot(col, vec3(0.2126, 0.7152, 0.0722));
    float sat = (uIsBw > 0.5) ? 0.0 : (1.0 + uSaturation);
    col = mix(vec3(gray), col, sat);

    col = clamp(col, 0.0, 1.0);
    finalColor = vec4(col * orig.a, orig.a);
}
`;

const ADJUST_WGSL = `
struct GlobalFilterUniforms {
  uInputSize: vec4<f32>,
  uInputPixel: vec4<f32>,
  uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>,
  uGlobalFrame: vec4<f32>,
  uOutputTexture: vec4<f32>,
};

struct AdjustUniforms {
  uExposure: f32,
  uContrast: f32,
  uHighlights: f32,
  uShadows: f32,
  uTemp: f32,
  uTint: f32,
  uSaturation: f32,
  uIsBw: f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@group(1) @binding(0) var<uniform> adjustUniforms: AdjustUniforms;

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
  if (orig.a == 0.0) {
    return orig;
  }

  var col = orig.rgb / orig.a;

  // 曝光
  col = col * exp2(adjustUniforms.uExposure);

  // 阴影高光
  let lum = dot(col, vec3<f32>(0.2126, 0.7152, 0.0722));
  let shadowWeight = clamp(1.0 - lum * 2.0, 0.0, 1.0);
  let highlightWeight = clamp((lum - 0.5) * 2.0, 0.0, 1.0);
  col = col + vec3<f32>(
    (adjustUniforms.uShadows * 0.35 * shadowWeight) + (adjustUniforms.uHighlights * 0.35 * highlightWeight)
  );

  // 对比度
  let contrastFactor = (259.0 * (adjustUniforms.uContrast * 100.0 + 255.0)) / (255.0 * (259.0 - adjustUniforms.uContrast * 100.0));
  col = (col - 0.5) * contrastFactor + 0.5;

  // 色温色调
  col.r = col.r * (1.0 + adjustUniforms.uTemp * 0.3);
  col.b = col.b * (1.0 - adjustUniforms.uTemp * 0.3);
  col.g = col.g * (1.0 - adjustUniforms.uTint * 0.3);

  // 饱和度与黑白
  let gray = dot(col, vec3<f32>(0.2126, 0.7152, 0.0722));
  var sat = 1.0 + adjustUniforms.uSaturation;
  if (adjustUniforms.uIsBw > 0.5) {
    sat = 0.0;
  }
  col = mix(vec3<f32>(gray), col, sat);
  col = clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));

  return vec4<f32>(col * orig.a, orig.a);
}
`;

/**
 * 判断调色参数是否全为默认无操作值
 */
export function isAdjustmentsNoop(adj?: PhotoAdjustments | null): boolean {
  if (!adj) return true;
  return (
    adj.exposure === 0 &&
    adj.contrast === 0 &&
    adj.highlights === 0 &&
    adj.shadows === 0 &&
    adj.temperature === 0 &&
    adj.tint === 0 &&
    adj.saturation === 0 &&
    !adj.isBlackAndWhite
  );
}

/**
 * 专为 Pixi.js v8 打造的选片级实时色彩微调滤镜
 */
export class ColorAdjustFilter extends Filter {
  private _adjustUniforms: UniformGroup;

  constructor(adjustments?: PhotoAdjustments) {
    const adj = adjustments || {
      exposure: 0,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      temperature: 0,
      tint: 0,
      saturation: 0,
      isBlackAndWhite: false,
      rotation: 0,
    };

    const adjustUniforms = new UniformGroup({
      uExposure: { value: adj.exposure, type: 'f32' },
      uContrast: { value: adj.contrast / 100, type: 'f32' },
      uHighlights: { value: adj.highlights / 100, type: 'f32' },
      uShadows: { value: adj.shadows / 100, type: 'f32' },
      uTemp: { value: adj.temperature / 100, type: 'f32' },
      uTint: { value: adj.tint / 100, type: 'f32' },
      uSaturation: { value: adj.saturation / 100, type: 'f32' },
      uIsBw: { value: adj.isBlackAndWhite ? 1.0 : 0.0, type: 'f32' },
    });

    const glProgram = GlProgram.from({
      vertex: ADJUST_VERTEX_GLSL,
      fragment: ADJUST_FRAGMENT_GLSL,
      name: 'color-adjust-filter-gl',
    });

    const gpuProgram = GpuProgram.from({
      vertex: {
        source: ADJUST_WGSL,
        entryPoint: 'mainVertex',
      },
      fragment: {
        source: ADJUST_WGSL,
        entryPoint: 'mainFragment',
      },
    });

    super({
      glProgram,
      gpuProgram,
      resources: {
        adjustUniforms,
      },
    });

    this._adjustUniforms = adjustUniforms;
  }

  public updateAdjustments(adj: PhotoAdjustments): void {
    const u = this._adjustUniforms.uniforms;
    u.uExposure = adj.exposure;
    u.uContrast = adj.contrast / 100;
    u.uHighlights = adj.highlights / 100;
    u.uShadows = adj.shadows / 100;
    u.uTemp = adj.temperature / 100;
    u.uTint = adj.tint / 100;
    u.uSaturation = adj.saturation / 100;
    u.uIsBw = adj.isBlackAndWhite ? 1.0 : 0.0;
  }
}
