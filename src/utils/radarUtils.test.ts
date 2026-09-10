import { describe, it, expect } from 'vitest';
import {
  textMatchesRole,
  matchPhotoToRoles,
  computeRadarAnalysis,
  calculateBalanceScore,
  getPolygonCoordinates,
  pointsToSvgPath,
} from './radarUtils';
import { getStorylinePreset } from './storylinePresets';
import { LocalPhoto, PhotoAnnotation } from '../types/photo';

function makeDummyPhoto(id: string, overrides: Partial<LocalPhoto> = {}): LocalPhoto {
  return {
    id,
    path: `/photos/${id}.jpg`,
    filename: `${id}.jpg`,
    fileSize: 1024,
    format: 'jpeg',
    isRaw: false,
    ...overrides,
  };
}

describe('radarUtils', () => {
  describe('ROLE_LABEL_ALIASES and textMatchesRole', () => {
    it('should match wedding aliases correctly', () => {
      expect(textMatchesRole('新娘', 'bride', '新娘 / 女主角')).toBe(true);
      expect(textMatchesRole('新娘化妆', 'bride', '新娘 / 女主角')).toBe(true);
      expect(textMatchesRole('新郎接亲', 'groom', '新郎 / 男主角')).toBe(true);
      expect(textMatchesRole('岳父岳母敬茶', 'parents', '父母 / 双方长辈')).toBe(true);
      expect(textMatchesRole('伴娘姐妹团', 'bridal_party', '伴娘 / 伴郎团')).toBe(true);
      expect(textMatchesRole('大合影留念', 'group', '大合影 / 亲友群像')).toBe(true);
    });

    it('should match family aliases correctly', () => {
      expect(textMatchesRole('小宝周岁抓周', 'baby', '宝宝 / 小主角')).toBe(true);
      expect(textMatchesRole('温柔妈咪怀抱', 'mom', '妈妈 / 亲子互动')).toBe(true);
      expect(textMatchesRole('老爸托举', 'dad', '爸爸 / 亲子陪伴')).toBe(true);
      expect(textMatchesRole('全家福温馨留念', 'family_group', '全家福大合影')).toBe(true);
    });

    it('should match concert, cosplay, conference, and travel aliases', () => {
      expect(textMatchesRole('主讲嘉宾分享', 'speaker', '主讲嘉宾 / 行业领袖')).toBe(true);
      expect(textMatchesRole('主唱立麦飙高音', 'lead_singer', '主唱 / 舞台C位')).toBe(true);
      expect(textMatchesRole('贝斯手扫弦', 'guitar_bass', '吉他手 / 贝斯手')).toBe(true);
      expect(textMatchesRole('第一造型战损版', 'character_a', '第一造型正片')).toBe(true);
      expect(textMatchesRole('自然风光地标', 'landscape', '自然风光 / 建筑')).toBe(true);
    });

    it('should reject uninformative default face numbers', () => {
      expect(textMatchesRole('人物 #1', 'bride', '新娘 / 女主角')).toBe(false);
      expect(textMatchesRole('人物 2', 'groom', '新郎 / 男主角')).toBe(false);
      expect(textMatchesRole('人物#3', 'dad', '爸爸 / 亲子陪伴')).toBe(false);
      expect(textMatchesRole('', 'baby', '宝宝 / 小主角')).toBe(false);
    });
  });

  describe('matchPhotoToRoles', () => {
    const weddingPreset = getStorylinePreset('wedding');

    it('should match roles from photo presetTags (QuickTagBar)', () => {
      const photo = makeDummyPhoto('p1');
      const annotation: PhotoAnnotation = {
        presetTags: ['新娘', '面部微调'],
        comment: '',
        pins: [],
      };
      const matched = matchPhotoToRoles(photo, annotation, weddingPreset, 'wedding');
      expect(matched.has('bride')).toBe(true);
      expect(matched.has('groom')).toBe(false);
    });

    it('should match roles from photo comment and pin tags', () => {
      const photo = makeDummyPhoto('p2');
      const annotation: PhotoAnnotation = {
        presetTags: [],
        comment: '双方父母敬茶感动落泪',
        pins: [{ id: 'pin1', pinIndex: 1, x: 0.5, y: 0.5, tag: '伴郎团' }],
      };
      const matched = matchPhotoToRoles(photo, annotation, weddingPreset, 'wedding');
      expect(matched.has('parents')).toBe(true);
      expect(matched.has('bridal_party')).toBe(true);
    });

    it('should match pinned faces to preset protagonist role', () => {
      const photo = makeDummyPhoto('p3', {
        faces: [
          {
            id: 'face_1',
            x: 0.2,
            y: 0.2,
            width: 0.2,
            height: 0.2,
            eye_open_score: 0.9,
            sharpness: 90,
            is_pinned: true,
            priority: 15,
            label: '人物 #1',
          },
        ],
      });
      const matched = matchPhotoToRoles(photo, undefined, weddingPreset, 'wedding');
      expect(matched.has('bride')).toBe(true);
    });

    it('should detect multi-person group shots based on face count', () => {
      const photo = makeDummyPhoto('p4', {
        faces: Array.from({ length: 7 }).map((_, i) => ({
          id: `face_${i}`,
          x: i * 0.1,
          y: 0.2,
          width: 0.08,
          height: 0.08,
          eye_open_score: 0.9,
          sharpness: 80,
          is_pinned: false,
          priority: 0,
        })),
      });
      const matched = matchPhotoToRoles(photo, undefined, weddingPreset, 'wedding');
      expect(matched.has('group')).toBe(true);
    });

    it('should fallback to chapter context if no tags exist', () => {
      const photo = makeDummyPhoto('p5');
      const matched = matchPhotoToRoles(
        photo,
        undefined,
        weddingPreset,
        'wedding',
        '新郎迎亲与堵门',
      );
      expect(matched.has('groom')).toBe(true);
    });
  });

  describe('computeRadarAnalysis and dynamic warnings', () => {
    const familyPreset = getStorylinePreset('family');

    it('should correctly count appearances and selections and warn about missing Dad in family preset', () => {
      const photos: LocalPhoto[] = [
        makeDummyPhoto('f1'),
        makeDummyPhoto('f2'),
        makeDummyPhoto('f3'),
        makeDummyPhoto('f4'),
      ];

      // 10 dummy photos to reach warning threshold
      for (let i = 5; i <= 15; i++) {
        photos.push(makeDummyPhoto(`f${i}`));
      }

      // Notes marking baby on f1, f2, f3; marking dad on f4
      const selections: Record<string, { state: string; note?: string }> = {
        f1: { state: 'selected', note: JSON.stringify({ presetTags: ['宝宝'] }) },
        f2: { state: 'selected', note: JSON.stringify({ presetTags: ['宝宝'] }) },
        f3: { state: 'selected', note: JSON.stringify({ presetTags: ['宝宝'] }) },
        f4: { state: 'unreviewed', note: JSON.stringify({ presetTags: ['爸爸'] }) }, // Dad not selected!
      };

      for (let i = 5; i <= 15; i++) {
        selections[`f${i}`] = {
          state: 'selected',
          note: JSON.stringify({ presetTags: ['宝宝'] }),
        };
      }

      const result = computeRadarAnalysis(photos, selections, familyPreset, 'family');

      expect(result.hasReliableRoleData).toBe(true);
      expect(result.totalSelectedCount).toBe(14);

      const babyRole = result.roleStats.find((r) => r.id === 'baby');
      expect(babyRole?.selectedCount).toBe(14);

      const dadRole = result.roleStats.find((r) => r.id === 'dad');
      expect(dadRole?.totalAppearances).toBe(1);
      expect(dadRole?.selectedCount).toBe(0);

      // Warning should be triggered for dad
      expect(result.warningRoles.map((r) => r.id)).toContain('dad');
      expect(result.warningMessage).toContain('「爸爸」');
      expect(result.warningMessage).toContain('家庭摄影中爸爸或祖辈常因掌镜容易被遗漏');
    });

    it('should generate concert-specific warning text for music concerts', () => {
      const concertPreset = getStorylinePreset('concert');
      const photos = Array.from({ length: 12 }, (_, i) => makeDummyPhoto(`c${i}`));
      const selections: Record<string, { state: string; note?: string }> = {};

      photos.forEach((p, idx) => {
        // Singer selected on all, but guitar has 1 appearance and 0 selections
        if (idx === 0) {
          selections[p.id] = { state: 'unreviewed', note: JSON.stringify({ presetTags: ['吉他手'] }) };
        } else {
          selections[p.id] = { state: 'selected', note: JSON.stringify({ presetTags: ['主唱'] }) };
        }
      });

      const result = computeRadarAnalysis(photos, selections, concertPreset, 'concert');
      expect(result.warningMessage).toContain('音乐节现场');
      expect(result.warningMessage).not.toContain('父母长辈');
    });
  });

  describe('calculateBalanceScore', () => {
    it('should score balanced roles highly', () => {
      const roles = [
        {
          id: 'r1',
          name: '角色1',
          icon: '⭐',
          description: '',
          selectedCount: 5,
          totalAppearances: 10,
          matchingPhotoIndices: [],
          unselectedPhotoIndices: [],
        },
        {
          id: 'r2',
          name: '角色2',
          icon: '⭐',
          description: '',
          selectedCount: 5,
          totalAppearances: 10,
          matchingPhotoIndices: [],
          unselectedPhotoIndices: [],
        },
      ];
      const res = calculateBalanceScore(roles, 10);
      expect(res.score).toBeGreaterThanOrEqual(85);
      expect(res.level).toBe('excellent');
    });

    it('should penalize missing warned roles', () => {
      const roles = [
        {
          id: 'r1',
          name: '主角',
          icon: '⭐',
          description: '',
          selectedCount: 20,
          totalAppearances: 20,
          matchingPhotoIndices: [],
          unselectedPhotoIndices: [],
        },
        {
          id: 'r2',
          name: '配角',
          icon: '👤',
          description: '',
          minWarningCount: 2,
          selectedCount: 0,
          totalAppearances: 5,
          matchingPhotoIndices: [],
          unselectedPhotoIndices: [],
        },
      ];
      const res = calculateBalanceScore(roles, 20);
      expect(res.score).toBeLessThan(70);
    });
  });

  describe('SVG polygon math', () => {
    it('should compute radar polygon coordinates', () => {
      const coords = getPolygonCoordinates([10, 20, 30, 40], 50, 100, 100, 80);
      expect(coords).toHaveLength(4);
      // Top point (12 o'clock): angle = -PI/2 -> cos is 0, sin is -1
      expect(coords[0].x).toBeCloseTo(100);
      expect(coords[0].y).toBeCloseTo(100 - 80 * (10 / 50));

      const path = pointsToSvgPath(coords);
      expect(path).toMatch(/^M 100\.0,\d+\.\d+ L .* Z$/);
    });
  });
});
