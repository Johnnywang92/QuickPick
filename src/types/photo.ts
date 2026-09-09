export type PhotoFormat = 'raw' | 'jpeg' | 'png';

export type SelectionState = 'unreviewed' | 'selected' | 'maybe' | 'skipped';

export type WorkflowScene = 'general' | 'concert' | 'cosplay' | 'conference' | 'wedding';

export interface FaceInfo {
  id: string;
  x: number;              // 归一化 0.0 ~ 1.0 (左上角)
  y: number;
  width: number;
  height: number;
  eye_open_score: number; // 0.0 (完全闭眼) ~ 1.0 (完全睁开)
  sharpness: number;      // 0 ~ 100 局部合焦锐度
  is_pinned: boolean;
  priority: number;
  label?: string;
}

export interface ExifMetadata {
  camera_make?: string;
  camera_model?: string;
  lens_model?: string;
  lens_make?: string;
  focal_length?: number;
  focal_length_35mm?: number;
  aperture?: number;
  shutter_speed?: string;
  shutter_speed_value?: number;
  iso?: number;
  date_time_original?: string;
}

/**
 * 本地照片实体 (只读原片信息)
 */
export interface LocalPhoto {
  id: string;
  path: string;
  filename: string;
  fileSize: number;
  format: PhotoFormat;
  isRaw: boolean;
  previewWidth?: number;
  previewHeight?: number;
  capturedAt?: string;
  burstGroupId?: string;
  faces?: FaceInfo[];
  exif?: ExifMetadata;
}

/**
 * 本地照片分析提示（纯辅助，不替用户做决定）
 */
export interface PhotoInsight {
  photoId: string;
  analysisStatus: 'pending' | 'no_issues' | 'needs_check' | 'failed';
  possibleBlur?: number;          // 模糊评分 (0 ~ 100)
  possibleClosedEyes?: number;    // 闭眼程度或最小睁眼打分
  similarityGroupId?: string;     // 相似/连拍分组
  reasons: string[];              // 人类可读提示标签，如 ["可能闭眼", "轻微脱焦"]
}

/**
 * 用户选片决定 (完全物理隔离保存于应用独立存储中，绝不写入原片目录)
 */
export interface UserSelection {
  photoId: string;
  state: SelectionState;          // 'unreviewed' | 'selected' | 'maybe' | 'skipped'
  note?: string;                  // 用户自定义备注，如 "喜欢这张侧脸"
  updatedAt: string;              // ISO 8601 时间戳
}

/**
 * 拍摄场景 (如：第一套造型、室内、外景、合影、仪式、宴会等)
 */
export interface SceneChapter {
  id: string;
  name: string;
  startIndex: number;
  endIndex: number;
  startPath: string;
  endPath: string;
  photoCount: number;
  color: string;
  targetGoal?: number;            // 建议目标选片张数
  targetQuota?: number;           // 兼容旧属性别名
  startTime?: string;
  endTime?: string;
  photoPaths?: string[];
}

/**
 * 主界面筛选分类
 */
export type FilterCategory =
  | 'all'             // 全部照片
  | 'unreviewed'      // 未查看
  | 'selected'        // 已选
  | 'maybe'           // 待考虑
  | 'needs_check'     // 可能需要检查 (闭眼/模糊)
  | 'burst';          // 相似连拍

/**
 * 导出模式
 */
export type ExportMode =
  | 'copy_raw'        // 模式 A：复制所选原片
  | 'manifest';       // 模式 B：导出文件名清单
