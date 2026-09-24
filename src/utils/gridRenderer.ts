import { Graphics } from 'pixi.js';
import { GridType, SpiralOrientation, GridColor, GRID_COLORS } from '../types/grid';

export interface GridRenderOptions {
  gridType: GridType;
  spiralOrientation: SpiralOrientation;
  gridColor: GridColor;
  opacity: number;
  showPowerPoints: boolean;
  scale: number;
}

/**
 * 纯计算与绘制函数：在 Pixi v8 Graphics 实例上绘制指定摄影构图参考线
 * 坐标系：原点 (0, 0) 为图片正中心，X 范围 [-width/2, width/2]，Y 范围 [-height/2, height/2]
 */
export function renderCompositionGrid(
  graphics: Graphics,
  width: number,
  height: number,
  options: GridRenderOptions,
): void {
  graphics.clear();
  if (options.gridType === 'none' || width <= 0 || height <= 0) {
    return;
  }

  const { gridType, spiralOrientation, gridColor, opacity, showPowerPoints, scale } = options;
  const colorCfg = GRID_COLORS[gridColor] || GRID_COLORS.gold;

  // 自适应逆缩放：确保参考线在屏幕上恒定为 1.25px 物理像素宽度
  const s = Math.max(scale, 0.0001);
  const strokeW = Math.max(0.5, 1.25 / s);
  const thinW = Math.max(0.3, 0.85 / s);
  const powerPointRadius = Math.max(2.5, 5.5 / s);
  const powerPointDot = Math.max(1.2, 2.5 / s);

  const halfW = width / 2;
  const halfH = height / 2;

  // 1. 经典三分法 (Rule of Thirds)
  if (gridType === 'thirds') {
    const x1 = -width / 6;
    const x2 = width / 6;
    const y1 = -height / 6;
    const y2 = height / 6;

    // 外边框微描边
    graphics.rect(-halfW, -halfH, width, height);
    graphics.stroke({ color: colorCfg.hex, width: thinW, alpha: opacity * 0.45 });

    // 纵横四线
    graphics.moveTo(x1, -halfH);
    graphics.lineTo(x1, halfH);
    graphics.moveTo(x2, -halfH);
    graphics.lineTo(x2, halfH);
    graphics.moveTo(-halfW, y1);
    graphics.lineTo(halfW, y1);
    graphics.moveTo(-halfW, y2);
    graphics.lineTo(halfW, y2);
    graphics.stroke({ color: colorCfg.hex, width: strokeW, alpha: opacity });

    // 4 个黄金兴趣交点 (Power Points)
    if (showPowerPoints) {
      const intersections: [number, number][] = [
        [x1, y1],
        [x2, y1],
        [x1, y2],
        [x2, y2],
      ];
      for (const [ix, iy] of intersections) {
        graphics.circle(ix, iy, powerPointRadius);
        graphics.stroke({ color: colorCfg.hex, width: strokeW, alpha: opacity * 0.9 });
        graphics.circle(ix, iy, powerPointDot);
        graphics.fill({ color: colorCfg.dotHex, alpha: opacity * 0.95 });
      }
    }
  }

  // 2. 黄金分割比例网格 (Golden Ratio / Phi Grid 1:0.618:1)
  else if (gridType === 'golden_ratio') {
    // 0.618 / 2.618 ≈ 0.236，距边 0.382，离中心距离为 (0.5 - 0.382) = 0.118
    const offsetX = 0.118 * width;
    const offsetY = 0.118 * height;
    const x1 = -offsetX;
    const x2 = offsetX;
    const y1 = -offsetY;
    const y2 = offsetY;

    graphics.rect(-halfW, -halfH, width, height);
    graphics.stroke({ color: colorCfg.hex, width: thinW, alpha: opacity * 0.45 });

    graphics.moveTo(x1, -halfH);
    graphics.lineTo(x1, halfH);
    graphics.moveTo(x2, -halfH);
    graphics.lineTo(x2, halfH);
    graphics.moveTo(-halfW, y1);
    graphics.lineTo(halfW, y1);
    graphics.moveTo(-halfW, y2);
    graphics.lineTo(halfW, y2);
    graphics.stroke({ color: colorCfg.hex, width: strokeW, alpha: opacity });

    if (showPowerPoints) {
      const intersections: [number, number][] = [
        [x1, y1],
        [x2, y1],
        [x1, y2],
        [x2, y2],
      ];
      for (const [ix, iy] of intersections) {
        graphics.circle(ix, iy, powerPointRadius);
        graphics.stroke({ color: colorCfg.hex, width: strokeW, alpha: opacity * 0.9 });
        graphics.circle(ix, iy, powerPointDot);
        graphics.fill({ color: colorCfg.dotHex, alpha: opacity * 0.95 });
      }
    }
  }

  // 3. 斐波那契黄金螺旋 (Golden Spiral)
  else if (gridType === 'golden_spiral') {
    renderGoldenSpiral(
      graphics,
      -halfW,
      -halfH,
      width,
      height,
      spiralOrientation,
      colorCfg.hex,
      strokeW,
      thinW,
      opacity,
    );
  }

  // 4. 对角线与动态对称 (Diagonal & Dynamic Symmetry)
  else if (gridType === 'diagonal') {
    graphics.rect(-halfW, -halfH, width, height);
    graphics.stroke({ color: colorCfg.hex, width: thinW, alpha: opacity * 0.45 });

    // 主对角线
    graphics.moveTo(-halfW, -halfH);
    graphics.lineTo(halfW, halfH);
    graphics.moveTo(-halfW, halfH);
    graphics.lineTo(halfW, -halfH);
    graphics.stroke({ color: colorCfg.hex, width: strokeW, alpha: opacity });

    // 从 4 顶点向对角线投射的垂足线（形成互补动态三角形）
    // 主对角线斜率 m = height / width
    // 垂线满足直角相交
    const diagLenSq = width * width + height * height;
    if (diagLenSq > 0) {
      // 垂足点坐标
      const px1 = (width * (width * width - height * height)) / (2 * diagLenSq);
      const py1 = (height * (height * height - width * width)) / (2 * diagLenSq);

      graphics.moveTo(-halfW, halfH);
      graphics.lineTo(px1, -py1);
      graphics.moveTo(halfW, -halfH);
      graphics.lineTo(-px1, py1);

      graphics.moveTo(-halfW, -halfH);
      graphics.lineTo(px1, py1);
      graphics.moveTo(halfW, halfH);
      graphics.lineTo(-px1, -py1);
      graphics.stroke({ color: colorCfg.hex, width: thinW, alpha: opacity * 0.75 });
    }
  }

  // 5. 中心十字与地平线校准 (Center Crosshair & Horizon)
  else if (gridType === 'center') {
    graphics.rect(-halfW, -halfH, width, height);
    graphics.stroke({ color: colorCfg.hex, width: thinW, alpha: opacity * 0.35 });

    // 主横轴（水平仪）与纵轴
    graphics.moveTo(-halfW, 0);
    graphics.lineTo(halfW, 0);
    graphics.moveTo(0, -halfH);
    graphics.lineTo(0, halfH);
    graphics.stroke({ color: colorCfg.hex, width: strokeW, alpha: opacity });

    // 水平刻度线 (每 5% 与 10% 间距微刻度，用于校准倾斜角度)
    const tickStep = width * 0.05;
    const majorTickH = Math.max(3, 8 / s);
    const minorTickH = Math.max(1.5, 4 / s);

    for (let x = -halfW + tickStep; x < halfW; x += tickStep) {
      if (Math.abs(x) < 2) continue; // 避开正中央
      const isMajor = Math.round((Math.abs(x) / width) * 100) % 10 === 0;
      const th = isMajor ? majorTickH : minorTickH;
      graphics.moveTo(x, -th);
      graphics.lineTo(x, th);
    }
    graphics.stroke({ color: colorCfg.hex, width: thinW, alpha: opacity * 0.8 });

    // 中央双同心瞄准环
    const r1 = Math.max(6, 18 / s);
    const r2 = Math.max(12, 36 / s);
    graphics.circle(0, 0, r1);
    graphics.circle(0, 0, r2);
    graphics.stroke({ color: colorCfg.hex, width: thinW, alpha: opacity * 0.85 });

    // 中心小十字
    const centerCross = Math.max(2, 6 / s);
    graphics.moveTo(-centerCross, 0);
    graphics.lineTo(centerCross, 0);
    graphics.moveTo(0, -centerCross);
    graphics.lineTo(0, centerCross);
    graphics.stroke({ color: colorCfg.dotHex, width: strokeW, alpha: opacity });
  }
}

/**
 * 递归计算并绘制黄金螺旋与黄金矩形分割
 */
function renderGoldenSpiral(
  graphics: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  orientation: SpiralOrientation,
  colorHex: number,
  strokeW: number,
  thinW: number,
  opacity: number,
): void {
  // 按照黄金比例 0.6180339887 进行 8 阶迭代
  const PHI = 0.6180339887;
  const iterations = 8;

  let curX = x;
  let curY = y;
  let curW = w;
  let curH = h;

  // 外边框
  graphics.rect(x, y, w, h);
  graphics.stroke({ color: colorHex, width: thinW, alpha: opacity * 0.45 });

  // 记录螺旋路径点
  const spiralPoints: { x: number; y: number }[] = [];

  // 方向映射步进 (0: 右下收敛, 1: 左下收敛, 2: 左上收敛, 3: 右上收敛)
  let step = orientation;

  for (let i = 0; i < iterations; i++) {
    const isHorizontal = curW >= curH;
    let squareW = 0;
    let squareH = 0;
    let arcCenterX = 0;
    let arcCenterY = 0;
    let arcRadius = 0;
    let startAngle = 0;
    let endAngle = 0;

    if (isHorizontal) {
      squareW = curW * PHI;
      squareH = curH;

      if (step % 2 === 0) {
        // 切除左侧正方形
        const cutX = curX + curW - squareW;
        graphics.moveTo(cutX, curY);
        graphics.lineTo(cutX, curY + curH);

        arcRadius = curW - squareW;
        arcCenterX = cutX;
        arcCenterY = curY + (step === 0 ? 0 : curH);
        startAngle = step === 0 ? Math.PI / 2 : Math.PI;
        endAngle = step === 0 ? Math.PI : (3 * Math.PI) / 2;

        curX = cutX;
        curW = squareW;
      } else {
        // 切除右侧正方形
        const cutX = curX + squareW;
        graphics.moveTo(cutX, curY);
        graphics.lineTo(cutX, curY + curH);

        arcRadius = curW - squareW;
        arcCenterX = curX;
        arcCenterY = curY + (step === 1 ? curH : 0);
        startAngle = step === 1 ? (3 * Math.PI) / 2 : 0;
        endAngle = step === 1 ? 2 * Math.PI : Math.PI / 2;

        curW = squareW;
      }
    } else {
      squareW = curW;
      squareH = curH * PHI;

      if (step % 2 === 0) {
        const cutY = curY + curH - squareH;
        graphics.moveTo(curX, cutY);
        graphics.lineTo(curX + curW, cutY);

        arcRadius = curH - squareH;
        arcCenterX = curX + (step === 0 ? curW : 0);
        arcCenterY = cutY;
        startAngle = step === 0 ? Math.PI : (3 * Math.PI) / 2;
        endAngle = step === 0 ? (3 * Math.PI) / 2 : 2 * Math.PI;

        curY = cutY;
        curH = squareH;
      } else {
        const cutY = curY + squareH;
        graphics.moveTo(curX, cutY);
        graphics.lineTo(curX + curW, cutY);

        arcRadius = curH - squareH;
        arcCenterX = curX + (step === 1 ? 0 : curW);
        arcCenterY = curY;
        startAngle = step === 1 ? 0 : Math.PI / 2;
        endAngle = step === 1 ? Math.PI / 2 : Math.PI;

        curH = squareH;
      }
    }

    // 生成当前象限的平滑螺旋弧段点
    const segments = 16;
    for (let s = 0; s <= segments; s++) {
      const a = startAngle + ((endAngle - startAngle) * s) / segments;
      spiralPoints.push({
        x: arcCenterX + Math.cos(a) * arcRadius,
        y: arcCenterY + Math.sin(a) * arcRadius,
      });
    }

    step = (step + 1) % 4;
  }

  // 绘制内部轻量分割线
  graphics.stroke({ color: colorHex, width: thinW, alpha: opacity * 0.45 });

  // 绘制高亮黄金螺旋曲线
  if (spiralPoints.length > 1) {
    graphics.moveTo(spiralPoints[0].x, spiralPoints[0].y);
    for (let k = 1; k < spiralPoints.length; k++) {
      graphics.lineTo(spiralPoints[k].x, spiralPoints[k].y);
    }
    graphics.stroke({ color: colorHex, width: strokeW * 1.3, alpha: opacity * 1.1 });
  }
}
