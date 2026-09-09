import { describe, it, expect } from 'vitest';
import {
  parseAnnotation,
  serializeAnnotation,
  hasRetouchRequirements,
  createPin,
} from './annotationUtils';

describe('annotationUtils', () => {
  it('parses empty or plain text note correctly', () => {
    expect(parseAnnotation('')).toEqual({ comment: '', presetTags: [], pins: [] });
    expect(parseAnnotation(undefined)).toEqual({ comment: '', presetTags: [], pins: [] });
    expect(parseAnnotation('喜欢这张侧脸')).toEqual({
      comment: '喜欢这张侧脸',
      presetTags: [],
      pins: [],
    });
  });

  it('serializes plain text without pins or tags as raw string', () => {
    const raw = serializeAnnotation({ comment: '简单备注', presetTags: [], pins: [] });
    expect(raw).toBe('简单备注');
  });

  it('preserves trailing spaces while editing plain and structured comments', () => {
    const plain = serializeAnnotation({ comment: 'hello ', presetTags: [], pins: [] });
    expect(plain).toBe('hello ');
    expect(parseAnnotation(plain).comment).toBe('hello ');

    const structured = serializeAnnotation({
      comment: 'hello ',
      presetTags: ['修除碎发'],
      pins: [],
    });
    expect(parseAnnotation(structured).comment).toBe('hello ');
  });

  it('serializes and deserializes structured annotation with pins and tags', () => {
    const pin1 = createPin(0.45, 0.62, 1, '面部微调', '鼻翼微修');
    const pin2 = createPin(0.85, 0.12, 2, '消除路人/杂物', '擦掉背景空调');
    const ann = {
      comment: '总体色调偏暖',
      presetTags: ['面部微调', '消除路人/杂物'],
      pins: [pin1, pin2],
    };

    const serialized = serializeAnnotation(ann);
    expect(serialized.startsWith('{')).toBe(true);

    const parsed = parseAnnotation(serialized);
    expect(parsed.comment).toBe('总体色调偏暖');
    expect(parsed.presetTags).toEqual(['面部微调', '消除路人/杂物']);
    expect(parsed.pins?.length).toBe(2);
    expect(parsed.pins?.[0].pinIndex).toBe(1);
    expect(parsed.pins?.[0].x).toBe(0.45);
    expect(parsed.pins?.[0].tag).toBe('面部微调');
  });

  it('detects retouch requirements accurately', () => {
    expect(hasRetouchRequirements('')).toBe(false);
    expect(hasRetouchRequirements(null)).toBe(false);
    expect(hasRetouchRequirements('纯备注')).toBe(true);

    const withTags = serializeAnnotation({ comment: '', presetTags: ['修除碎发'], pins: [] });
    expect(hasRetouchRequirements(withTags)).toBe(true);
  });
});
