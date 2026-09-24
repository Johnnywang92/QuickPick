/**
 * QuickPick Display P3 广色域与 Apple 显示管线辅助模块
 * 用于在 Retina MacBook Pro (Liquid Retina XDR)、Studio Display 等具备 P3 色域的硬件上，
 * 提供宽色域色彩空间渲染支持，避免 Canvas 默认 sRGB 色域对相机高饱和色彩造成的硬截断。
 */

/**
 * 校验当前宿主显示器是否支持 Display P3 广色域
 */
export const isDisplayP3Supported = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(color-gamut: p3)').matches;
  } catch {
    return false;
  }
};

/**
 * 获取最适 Canvas 2D 上下文的色彩空间配置
 */
export const getOptimalCanvasColorSpace = (): PredefinedColorSpace => {
  return isDisplayP3Supported() ? 'display-p3' : 'srgb';
};

/**
 * 创建具备最适色彩空间的 2D 画布上下文
 */
export const get2DContextWithOptions = (
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D | null => {
  const colorSpace = getOptimalCanvasColorSpace();
  try {
    return canvas.getContext('2d', {
      colorSpace,
      ...options,
    });
  } catch {
    // 降级使用标准 2d 上下文
    return canvas.getContext('2d', options);
  }
};
