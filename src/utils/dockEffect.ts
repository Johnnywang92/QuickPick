/**
 * macOS Dock 风格动态鱼眼放大曲线计算工具
 */

export interface DockMagnificationOptions {
  /** 影响波及半径 (单位: px)，默认 260px (覆盖约 2.2 个卡片宽度) */
  radius?: number;
  /** 最大放大比例增量，默认 0.30 (即最大放大至 1.30x) */
  maxScale?: number;
}

export interface DockMagnificationResult {
  /** 当前卡片的缩放比例 (1.0 ~ 1.0 + maxScale) */
  scale: number;
  /** 影响因子 (0.0 ~ 1.0)，可用于动态计算阴影与层级 */
  factor: number;
  /** z-index 提升数值 (0 ~ 30) */
  zIndexBoost: number;
}

/**
 * 计算单个卡片基于鼠标横坐标位置的 Dock 鱼眼放大属性
 * 采用余弦钟形曲线（Cosine Curve），产生极其平滑自然的连带放大与过渡感
 *
 * @param hoverContentX 鼠标在胶卷内容轨道内的绝对横坐标 (null 表示未划入)
 * @param cardCenterX 卡片在轨道内的中心点绝对横坐标
 * @param options 配置项
 */
export function calculateDockScale(
  hoverContentX: number | null,
  cardCenterX: number,
  options?: DockMagnificationOptions,
): DockMagnificationResult {
  if (hoverContentX === null) {
    return { scale: 1.0, factor: 0, zIndexBoost: 0 };
  }

  const radius = options?.radius ?? 260;
  const maxScale = options?.maxScale ?? 0.30;
  const dist = Math.abs(hoverContentX - cardCenterX);

  if (dist >= radius) {
    return { scale: 1.0, factor: 0, zIndexBoost: 0 };
  }

  // 余弦过渡曲线: dist = 0 时为 1.0, dist = radius 时平滑归 0
  const factor = Math.cos((dist / radius) * (Math.PI / 2));
  const scale = 1.0 + factor * maxScale;
  const zIndexBoost = Math.round(factor * 30);

  return {
    scale,
    factor,
    zIndexBoost,
  };
}
