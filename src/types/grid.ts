export type GridType =
  | 'none'
  | 'thirds'
  | 'golden_spiral'
  | 'golden_ratio'
  | 'diagonal'
  | 'center';

export type SpiralOrientation = 0 | 1 | 2 | 3;

export type GridColor = 'gold' | 'white' | 'cyan' | 'black';

export interface GridColorConfig {
  id: GridColor;
  label: string;
  hex: number; // Pixi color number (e.g. 0xf59e0b)
  cssColor: string; // CSS color representation
  dotHex: number;
}

export const GRID_COLORS: Record<GridColor, GridColorConfig> = {
  gold: {
    id: 'gold',
    label: '暖金',
    hex: 0xf59e0b,
    cssColor: '#f59e0b',
    dotHex: 0xfef08a,
  },
  white: {
    id: 'white',
    label: '亮白',
    hex: 0xf8fafc,
    cssColor: '#f8fafc',
    dotHex: 0x38bdf8,
  },
  cyan: {
    id: 'cyan',
    label: '科技青',
    hex: 0x06b6d4,
    cssColor: '#06b6d4',
    dotHex: 0x67e8f9,
  },
  black: {
    id: 'black',
    label: '深黑',
    hex: 0x0f172a,
    cssColor: '#0f172a',
    dotHex: 0x64748b,
  },
};

export interface GridTypeMeta {
  id: GridType;
  name: string;
  shortName: string;
  description: string;
  iconName: string;
}

export const GRID_TYPE_METAS: GridTypeMeta[] = [
  {
    id: 'none',
    name: '关闭参考线',
    shortName: '关',
    description: '隐藏所有辅助线',
    iconName: 'EyeOff',
  },
  {
    id: 'thirds',
    name: '经典三分法',
    shortName: '三分法',
    description: '3×3 经典九宫格与 4 个黄金兴趣焦点',
    iconName: 'Grid3X3',
  },
  {
    id: 'golden_spiral',
    name: '斐波那契黄金螺旋',
    shortName: '黄金螺旋',
    description: '遵循 1.618 黄金分割的渐进螺旋曲线与矩形划分',
    iconName: 'Disc',
  },
  {
    id: 'golden_ratio',
    name: '黄金分割比例网格',
    shortName: '黄金分割',
    description: '1:0.618:1 黄金分割网格，重心更聚焦',
    iconName: 'LayoutGrid',
  },
  {
    id: 'diagonal',
    name: '对角线与动态对称',
    shortName: '动态对称',
    description: '四角对角线与互补垂足构成的黄金三角形网格',
    iconName: 'Maximize2',
  },
  {
    id: 'center',
    name: '中心十字与地平线',
    shortName: '中心十字',
    description: '正中央水平仪刻度与中心对称瞄准环',
    iconName: 'Crosshair',
  },
];
