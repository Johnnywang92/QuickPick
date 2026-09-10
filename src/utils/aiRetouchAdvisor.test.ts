import { describe, it, expect } from 'vitest';
import { generateRetouchAdvice } from './aiRetouchAdvisor';
import { LocalPhoto, PhotoInsight } from '../types/photo';

describe('aiRetouchAdvisor', () => {
  const basePhoto: LocalPhoto = {
    id: 'photo_test',
    path: '/path/to/test.jpg',
    filename: 'test.jpg',
    fileSize: 5000000,
    format: 'jpeg',
    isRaw: false,
    exif: {
      camera_make: 'SONY',
      camera_model: 'ILCE-7RM5',
      lens_model: 'FE 85mm F1.4 GM II',
      focal_length: 85,
      aperture: 1.4,
      shutter_speed: '1/250s',
      iso: 100,
    },
    faces: [
      {
        id: 'f1',
        x: 0.3,
        y: 0.2,
        width: 0.4,
        height: 0.4,
        sharpness: 90,
        eye_open_score: 0.88,
        is_pinned: false,
        priority: 1,
      },
    ],
  };

  it('generates standard portrait advice for wedding scene', () => {
    const advice = generateRetouchAdvice(basePhoto, null, 'wedding');

    expect(advice.summary).toContain('唯美高雅婚纱纪实');
    expect(advice.suggestions.length).toBeGreaterThan(0);
    expect(advice.lightroomParams.highlights).toBe(-15);
    expect(advice.lightroomParams.shadows).toBe(15);
    expect(advice.aiPrompts.sdPositivePrompt).toContain('ILCE-7RM5');
    expect(advice.aiPrompts.sdPositivePrompt).toContain('FE 85mm F1.4 GM II');
    expect(advice.aiPrompts.midjourneyPrompt).toContain('--ar 3:2 --style raw --v 6.0');
    expect(advice.aiPrompts.photoshopInstruction).toContain('保留真实皮肤毛孔');
  });

  it('triggers closed-eye suggestion and tag when eye_open_score is low', () => {
    const closedEyePhoto: LocalPhoto = {
      ...basePhoto,
      faces: [
        {
          id: 'f_closed',
          x: 0.3,
          y: 0.2,
          width: 0.4,
          height: 0.4,
          sharpness: 85,
          eye_open_score: 0.25,
          is_pinned: false,
          priority: 1,
        },
      ],
    };

    const advice = generateRetouchAdvice(closedEyePhoto, null, 'wedding');
    const hasClosedEyeSuggestion = advice.suggestions.some(
      (s) => s.title.includes('眼神光重塑') || s.title.includes('连拍眼神替换'),
    );
    expect(hasClosedEyeSuggestion).toBe(true);
    expect(advice.recommendedTags).toContain('面部微调');
  });

  it('handles group portrait with closed eye', () => {
    const groupPhoto: LocalPhoto = {
      ...basePhoto,
      faces: [
        { id: 'f1', x: 0.2, y: 0.2, width: 0.2, height: 0.2, sharpness: 80, eye_open_score: 0.9, is_pinned: false, priority: 1 },
        { id: 'f2', x: 0.6, y: 0.2, width: 0.2, height: 0.2, sharpness: 85, eye_open_score: 0.3, is_pinned: false, priority: 2 },
      ],
    };

    const advice = generateRetouchAdvice(groupPhoto, null, 'family');
    expect(advice.summary).toContain('温馨暖意亲子纪实');
    const hasGroupSwap = advice.suggestions.some((s) => s.title.includes('合影闭眼连拍无缝换脸'));
    expect(hasGroupSwap).toBe(true);
  });

  it('adjusts dynamic range when high contrast / blown highlights are detected', () => {
    const insight: PhotoInsight = {
      photoId: basePhoto.id,
      analysisStatus: 'needs_check',
      reasons: ['高光严重死白'],
    };

    const advice = generateRetouchAdvice(basePhoto, insight, 'wedding');
    expect(advice.lightroomParams.highlights).toBe(-40);
    expect(advice.lightroomParams.shadows).toBe(25);
    const highlightSuggestion = advice.suggestions.find((s) => s.title.includes('大光比高光压暗'));
    expect(highlightSuggestion).toBeDefined();
    expect(advice.recommendedTags).toContain('调亮主体');
  });

  it('adjusts exposure when underexposure is detected', () => {
    const insight: PhotoInsight = {
      photoId: basePhoto.id,
      analysisStatus: 'needs_check',
      reasons: ['可能偏暗'],
    };

    const advice = generateRetouchAdvice(basePhoto, insight, 'wedding');
    expect(advice.lightroomParams.exposure).toBe('+0.4 EV');
    expect(advice.lightroomParams.shadows).toBe(30);
    const darkSuggestion = advice.suggestions.find((s) => s.title.includes('暗部提亮'));
    expect(darkSuggestion).toBeDefined();
  });

  it('suggests high ISO noise reduction when ISO >= 3200', () => {
    const highIsoPhoto: LocalPhoto = {
      ...basePhoto,
      exif: {
        ...basePhoto.exif,
        iso: 6400,
      },
    };

    const advice = generateRetouchAdvice(highIsoPhoto, null, 'concert');
    expect(advice.summary).toContain('爆裂舞台摇滚光影');
    const isoSuggestion = advice.suggestions.find((s) => s.title.includes('高感光度 AI 噪点抑制'));
    expect(isoSuggestion).toBeDefined();
    expect(isoSuggestion?.detail).toContain('ISO 6400');
  });

  it('suggests wide angle lens distortion correction for focal length <= 28mm', () => {
    const widePhoto: LocalPhoto = {
      ...basePhoto,
      exif: {
        ...basePhoto.exif,
        focal_length: 24,
      },
    };

    const advice = generateRetouchAdvice(widePhoto, null, 'travel');
    expect(advice.summary).toContain('人文旅拍与地标风光');
    const distortionSuggestion = advice.suggestions.find((s) => s.title.includes('广角镜头畸变'));
    expect(distortionSuggestion).toBeDefined();
    expect(advice.recommendedTags).toContain('调整构图/水平');
  });

  it('adapts scene styles across all supported genres', () => {
    const conferenceAdvice = generateRetouchAdvice(basePhoto, null, 'conference');
    expect(conferenceAdvice.summary).toContain('严谨商务峰会风');

    const cosplayAdvice = generateRetouchAdvice(basePhoto, null, 'cosplay');
    expect(cosplayAdvice.summary).toContain('二次元与国风写真');

    const generalAdvice = generateRetouchAdvice(basePhoto, null, 'general');
    expect(generalAdvice.summary).toContain('纪实原色质感');
  });
});
