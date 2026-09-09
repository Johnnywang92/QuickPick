import { PhotoAnnotation, VisualPin } from '../types/photo';

export const PRESET_RETOUCH_TAGS = [
  '面部微调',
  '修除碎发',
  '消除路人/杂物',
  '保留真实肤色',
  '去除反光',
  '抚平衣物褶皱',
  '调整构图/水平',
  '调亮主体',
] as const;

export function parseAnnotation(rawNote: string | undefined | null): PhotoAnnotation {
  if (!rawNote || !rawNote.trim()) {
    return { comment: '', presetTags: [], pins: [] };
  }

  const trimmed = rawNote.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (
        parsed &&
        typeof parsed === 'object' &&
        (Array.isArray(parsed.pins) || Array.isArray(parsed.presetTags) || typeof parsed.comment === 'string')
      ) {
        return {
          comment: typeof parsed.comment === 'string' ? parsed.comment : '',
          presetTags: Array.isArray(parsed.presetTags) ? parsed.presetTags : [],
          pins: Array.isArray(parsed.pins) ? parsed.pins : [],
          updatedAt: parsed.updatedAt,
        };
      }
    } catch {
      // Not valid JSON, fall back to plain comment
    }
  }

  return { comment: trimmed, presetTags: [], pins: [] };
}

export function serializeAnnotation(annotation: PhotoAnnotation): string {
  const hasPins = Array.isArray(annotation.pins) && annotation.pins.length > 0;
  const hasTags = Array.isArray(annotation.presetTags) && annotation.presetTags.length > 0;
  const comment = (annotation.comment || '').trim();

  // 如果只有纯文本备注，没有图上 Pin 针也没有预设标签，直接存储纯文本以保持极简与旧兼容
  if (!hasPins && !hasTags) {
    return comment;
  }

  const payload: PhotoAnnotation = {
    comment,
    presetTags: hasTags ? annotation.presetTags : [],
    pins: hasPins ? annotation.pins : [],
    updatedAt: new Date().toISOString(),
  };

  return JSON.stringify(payload);
}

export function hasRetouchRequirements(rawNote: string | undefined | null): boolean {
  const ann = parseAnnotation(rawNote);
  return (
    (ann.pins && ann.pins.length > 0) ||
    (ann.presetTags && ann.presetTags.length > 0) ||
    Boolean(ann.comment && ann.comment.trim().length > 0)
  );
}

export function createPin(x: number, y: number, pinIndex: number, tag?: string, comment?: string): VisualPin {
  return {
    id: `pin_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    pinIndex,
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    tag,
    comment,
  };
}
