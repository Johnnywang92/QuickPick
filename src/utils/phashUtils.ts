import { LocalPhoto } from '../types/photo';

/**
 * 解析照片的拍摄时间戳 (秒)
 */
export const parsePhotoTimestamp = (photo: LocalPhoto): number | null => {
  const dtStr = photo.exif?.date_time_original || photo.capturedAt;
  if (!dtStr) return null;
  const normalized = dtStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(/-/g, '/');
  const ts = Date.parse(normalized);
  return Number.isNaN(ts) ? null : ts / 1000;
};

/**
 * 提取文件名中的序列数字编号
 */
export function extractFilenameSequence(filename: string): number | null {
  const digits = filename.match(/\d+/g)?.join('');
  if (!digits) return null;
  const value = Number.parseInt(digits, 10);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * 计算两个 16 位十六进制 64-bit 感知哈希之间的汉明距离 (0 ~ 64)
 */
export function computeHammingDistance(hex1?: string, hex2?: string): number | null {
  if (!hex1 || !hex2 || hex1.length !== 16 || hex2.length !== 16) {
    return null;
  }
  try {
    const b1 = BigInt(`0x${hex1}`);
    const b2 = BigInt(`0x${hex2}`);
    let xor = b1 ^ b2;
    let count = 0;
    while (xor > 0n) {
      xor &= xor - 1n;
      count++;
    }
    return count;
  } catch {
    return null;
  }
}

/**
 * 将汉明距离换算为 0 ~ 100% 视觉相似度百分比
 */
export function computeVisualSimilarity(hex1?: string, hex2?: string): number | null {
  const dist = computeHammingDistance(hex1, hex2);
  if (dist === null) return null;
  const clamped = Math.min(64, Math.max(0, dist));
  return Math.round(((64 - clamped) / 64) * 100);
}

/**
 * 判定两张照片是否构成连拍/相似组连续序列 (混合时间戳、文件名与 pHash 感知哈希)
 */
export function arePhotosBurstConsecutive(current: LocalPhoto, previous: LocalPhoto): boolean {
  const visualDist = computeHammingDistance(current.phash, previous.phash);

  // 1. 视觉防误断开: 若两图具有感知哈希且汉明距离 >= 14 (画面主体/背景完全不同)，
  // 即使拍摄时间在 2 秒以内也不属于同一连拍组 (如摄影师转身或快速转场)
  if (visualDist !== null && visualDist >= 14) {
    return false;
  }

  const previousTime = parsePhotoTimestamp(previous);
  const currentTime = parsePhotoTimestamp(current);
  const previousSequence = extractFilenameSequence(previous.filename);
  const currentSequence = extractFilenameSequence(current.filename);
  const sequenceGap =
    previousSequence !== null && currentSequence !== null
      ? Math.abs(currentSequence - previousSequence)
      : null;

  if (previousTime !== null && currentTime !== null) {
    const dt = Math.abs(currentTime - previousTime);
    if (dt <= 2) {
      return sequenceGap === null || sequenceGap <= 5;
    }
    if (dt <= 15) {
      // 时间差在 15 秒以内，如果视觉高度相似 (汉明距离 <= 8)，判定为同一组连拍
      return visualDist !== null && visualDist <= 8;
    }
    if (dt <= 60) {
      // 极度相似或重复画面 (汉明距离 <= 3)，放宽至 60 秒内
      return visualDist !== null && visualDist <= 3;
    }
    return false;
  }

  // 若缺少时间戳: 优先依赖感知哈希
  if (visualDist !== null) {
    return visualDist <= 8;
  }
  return sequenceGap === 1;
}

/**
 * 评估连拍组内单张照片的综合质量得分 (用于推荐组内最佳瞬间)
 */
export function calculateBurstPhotoScore(photo: LocalPhoto): number {
  const baseSharpness = photo.sharpness ?? 50;

  // 评估人脸睁眼与状态
  let eyeFactor = 1.0;
  if (photo.faces && photo.faces.length > 0) {
    const minEyeOpen = Math.min(...photo.faces.map((f) => f.eye_open_score));
    if (minEyeOpen < 0.35) {
      // 严重闭眼或半睁眼，大幅降权
      eyeFactor = 0.4;
    } else if (minEyeOpen >= 0.7) {
      // 眼神明亮完好，加分
      eyeFactor = 1.2;
    }
  }

  return baseSharpness * eyeFactor;
}

/**
 * 针对所有已成组的照片，找出每个相似连拍组中的最佳瞬间照片 ID
 */
export function findBestPicksByBurstGroup(photos: LocalPhoto[]): Map<string, string> {
  const groups = new Map<string, LocalPhoto[]>();
  for (const photo of photos) {
    if (photo.burstGroupId) {
      const list = groups.get(photo.burstGroupId) || [];
      list.push(photo);
      groups.set(photo.burstGroupId, list);
    }
  }

  const bestMap = new Map<string, string>();
  for (const [groupId, list] of groups.entries()) {
    if (list.length < 2) continue;
    let bestPhoto = list[0];
    let bestScore = calculateBurstPhotoScore(list[0]);
    for (let i = 1; i < list.length; i++) {
      const score = calculateBurstPhotoScore(list[i]);
      if (score > bestScore) {
        bestScore = score;
        bestPhoto = list[i];
      }
    }
    bestMap.set(groupId, bestPhoto.id);
  }
  return bestMap;
}
