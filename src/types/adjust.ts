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
