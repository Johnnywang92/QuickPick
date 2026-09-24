export type WorkbenchTab = 'adjust' | 'lut' | 'frame' | 'watermark';

export type FrameTemplate =
  | 'classic_white'
  | 'leica_white'
  | 'obsidian_black'
  | 'amber_minimal'
  | 'cinematic_scope'
  | 'retro_polaroid'
  | 'polaroid'
  | 'overlay_badge';

export interface PhotoAdjustments {
  exposure: number;          // 曝光补偿 (-3.0 ~ +3.0 EV, 默认 0)
  contrast: number;          // 对比度 (-100 ~ +100, 默认 0)
  highlights: number;        // 高光 (-100 ~ +100, 默认 0)
  shadows: number;           // 阴影 (-100 ~ +100, 默认 0)
  temperature: number;       // 色温 (-100 冷蓝 ~ +100 暖黄, 默认 0)
  tint: number;              // 色调 (-100 绿 ~ +100 洋红, 默认 0)
  saturation: number;        // 饱和度 (-100 ~ +100, 默认 0)
  isBlackAndWhite: boolean;  // 一键黑白预览 (默认 false)
  rotation: number;          // 旋转角度 (0, 90, 180, 270)
}

export const DEFAULT_ADJUSTMENTS: PhotoAdjustments = {
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

export interface FrameConfig {
  template: FrameTemplate;
  showCameraModel: boolean;
  showLens: boolean;
  showParams: boolean;       // 焦距、光圈、快门、ISO
  showDate: boolean;
  showLocation: boolean;
  customPhotographer: string;
  customCameraModel?: string;
  customLens?: string;
  borderScale: number;       // 边框比例 (0.06 ~ 0.16)
  includeAdjustments: boolean;
}

export const DEFAULT_FRAME_CONFIG: FrameConfig = {
  template: 'classic_white',
  showCameraModel: true,
  showLens: true,
  showParams: true,
  showDate: true,
  showLocation: false,
  customPhotographer: '',
  customCameraModel: '',
  customLens: '',
  borderScale: 0.1,
  includeAdjustments: true,
};

export type WatermarkType = 'text' | 'logo';

export type WatermarkPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'tiled'; // 45° 对角平铺防盗样片

export type WatermarkFontFamily = 'sans' | 'serif' | 'signature' | 'mono';

export interface WatermarkConfig {
  enabled: boolean;
  type: WatermarkType;

  // 文字与签名
  text: string;
  fontFamily: WatermarkFontFamily;
  color: string;
  bold: boolean;
  italic: boolean;

  // 图片 / Logo
  logoDataUrl?: string;

  // 排版与质感
  position: WatermarkPosition;
  opacity: number;       // 0.1 ~ 1.0 (默认 0.75)
  scale: number;         // 0.05 ~ 0.4 (默认 0.16，相对于短边尺寸)
  margin: number;        // 0.01 ~ 0.1 (默认 0.035)
  hasShadow: boolean;    // 是否开启柔和外发光/投影
}

export const DEFAULT_WATERMARK_CONFIG: WatermarkConfig = {
  enabled: false,
  type: 'text',
  text: '© 2026 QuickPick Photography',
  fontFamily: 'sans',
  color: '#FFFFFF',
  bold: false,
  italic: false,
  position: 'bottom-right',
  opacity: 0.75,
  scale: 0.16,
  margin: 0.035,
  hasShadow: true,
};

