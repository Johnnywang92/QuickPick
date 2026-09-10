import { LocalPhoto, PhotoAnnotation, WorkflowScene } from '../types/photo';
import { StorylinePreset } from './storylinePresets';
import { parseAnnotation } from './annotationUtils';

export interface RoleStatistic {
  id: string;
  name: string;
  icon: string;
  description: string;
  selectedCount: number;
  totalAppearances: number;
  minWarningCount?: number;
  matchingPhotoIndices: number[];
  unselectedPhotoIndices: number[];
  samplePhotoIndex?: number;
}

export interface RadarAnalysisResult {
  roleStats: RoleStatistic[];
  totalSelectedCount: number;
  totalPhotosWithRoleData: number;
  hasReliableRoleData: boolean;
  warningRoles: RoleStatistic[];
  warningMessage: string;
  balanceScore: number;
  balanceLevel: 'excellent' | 'good' | 'warning' | 'critical';
  balanceText: string;
}

/**
 * 7大摄影题材全部角色的同义词与关键词别名表
 */
export const ROLE_LABEL_ALIASES: Record<string, string[]> = {
  // 婚礼纪实
  bride: ['新娘', '新妇', '女主角', '主纱', '晨袍', 'bride'],
  groom: ['新郎', '男主角', '西装', '新郎官', 'groom'],
  parents: ['父母', '双方长辈', '长辈', '妈妈', '爸爸', '公公', '婆婆', '岳父', '岳母', '母亲', '父亲', 'parent', 'parents'],
  bridal_party: ['伴娘', '伴郎', '伴娘团', '伴郎团', '闺蜜', '兄弟团', '姐妹团', 'bridesmaid', 'groomsman'],
  group: ['大合影', '合影', '亲友群像', '全场大合照', '集体合影', '大景', '全体', 'group'],

  // 亲子与家庭
  baby: ['宝宝', '婴儿', '孩子', '小主角', '小宝', '新生儿', '百天', '周岁', 'baby', 'kid', 'child'],
  mom: ['妈妈', '母亲', '母爱', '妈咪', 'mom', 'mother'],
  dad: ['爸爸', '父亲', '老爸', '父爱', 'dad', 'father'],
  grandparents: ['爷爷', '奶奶', '外公', '外婆', '姥姥', '姥爷', '祖父', '祖母', '长辈', 'grandparent', 'grandparents'],
  family_group: ['全家福', '全家福大合影', '家庭大合影', '三代同堂', '合影', 'family'],

  // 商务峰会与年会
  speaker: ['主讲', '演讲', '主讲嘉宾', '领导致辞', '分享嘉宾', '嘉宾发言', '讲师', 'speaker', 'keynote'],
  vip: ['vip', '高管', '领导', '签约代表', '特邀嘉宾', '重要领导', '总裁', '董事长'],
  round_table: ['圆桌', '论坛', '对谈', '圆桌嘉宾', '交锋', '研讨', 'roundtable'],
  audience: ['观众', '听众', '现场代表', '台下观众', '鼓掌', '提问', 'audience'],

  // 音乐演出与舞台
  lead_singer: ['主唱', '歌手', '主唱特写', '立麦', 'vocal', 'singer'],
  guitar_bass: ['吉他', '贝斯', '吉他手', '贝斯手', '扫弦', 'guitar', 'bass'],
  drum_keyboard: ['鼓手', '键盘', '键盘手', '打击乐', '架子鼓', 'drum', 'keyboard'],
  fans: ['乐迷', '乐迷观众', '粉丝', '歌迷', '荧光海', '台下挥手', 'fans'],
  stage_full: ['舞台全景', '全景舞美', '舞美灯光', '大场景', '舞台大景', 'stage'],

  // 二次元与汉服写真
  character_a: ['造型一', '正片一', '主造型', '第一造型', '造型1', '主角色', 'coser'],
  character_b: ['造型二', '正片二', '换装', '第二造型', '战损', '造型2', '第二套'],
  closeup: ['特写', '眼妆', '美瞳', '面部特写', '妆容', '眼神', 'closeup'],
  full_body: ['全身', '动势', '动作', '全景', '大景', '身形', '剧情', 'fullbody'],
  behind_scenes: ['幕后', '花絮', '后勤', '同好', '集邮', '场馆巡游', 'bts', 'behind'],

  // 旅拍与城市纪实
  protagonist: ['旅拍主角', '主角', '人像', '模特', '旅伴主角', '出游人像', 'protagonist'],
  companion: ['同行', '伴侣', '同行伴侣', '双人', '亲友', '闺蜜', '情侣', 'companion'],
  street_life: ['市井', '人文', '当地人', '街头', '市井生活', '路人抓拍', '生活气息'],
  landscape: ['风光', '风景', '建筑', '地标', '空镜', '自然风光', '落日', '城市全景', 'landscape'],
  details: ['美食', '物件', '细节', '局部', '静物', '咖啡', '小吃', '招牌', 'details'],

  // 通用纪实与活动
  primary: ['核心主角', '主角', '焦点人物', '焦点', '主要人物', 'primary'],
  secondary: ['重要配角', '配角', '互动人物', '陪同', '互动', 'secondary'],
  candid: ['抓拍', '花絮', '精彩瞬间', '情绪', '生动神情', '偶得', 'candid'],
};

/**
 * 判断文本或标签是否匹配特定角色
 */
export function textMatchesRole(
  text: string | undefined | null,
  roleId: string,
  roleName: string,
): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed || /^人物\s*#?\d+$/i.test(trimmed)) return false;

  const normalized = trimmed.toLocaleLowerCase();
  const nameParts = roleName
    .split(/[\/／]/)
    .map((part) => part.trim().toLocaleLowerCase())
    .filter((part) => part.length >= 2);
  const aliases = ROLE_LABEL_ALIASES[roleId] || [];

  return [...aliases, ...nameParts, roleId.toLocaleLowerCase()].some((keyword) =>
    normalized.includes(keyword.toLocaleLowerCase()),
  );
}

/**
 * 题材的核心主角角色 ID 映射（用于 face.is_pinned 自动认领主角）
 */
const PROTAGONIST_ROLE_MAP: Record<WorkflowScene, string[]> = {
  wedding: ['bride', 'groom'],
  family: ['baby', 'mom', 'dad'],
  conference: ['speaker', 'vip'],
  concert: ['lead_singer'],
  cosplay: ['character_a'],
  travel: ['protagonist'],
  general: ['primary'],
};

/**
 * 合影角色 ID 候选列表
 */
const GROUP_ROLE_IDS = ['group', 'family_group', 'stage_full'];

/**
 * 匹配单张照片所属的角色集合
 */
export function matchPhotoToRoles(
  photo: LocalPhoto,
  annotation: PhotoAnnotation | undefined,
  activePreset: StorylinePreset,
  currentGenre: WorkflowScene,
  sceneChapterName?: string,
): Set<string> {
  const matchedRoleKeys = new Set<string>();

  // 1. 照片预设标签与自定义标签 (来自 QuickTagBar)
  if (annotation?.presetTags && annotation.presetTags.length > 0) {
    for (const tag of annotation.presetTags) {
      for (const role of activePreset.roles) {
        if (textMatchesRole(tag, role.id, role.name)) {
          matchedRoleKeys.add(role.id);
        }
      }
    }
  }

  // 2. 照片整体备注与局部图钉标签 (来自 annotation.comment / pins)
  if (annotation?.comment) {
    for (const role of activePreset.roles) {
      if (textMatchesRole(annotation.comment, role.id, role.name)) {
        matchedRoleKeys.add(role.id);
      }
    }
  }
  if (annotation?.pins && annotation.pins.length > 0) {
    for (const pin of annotation.pins) {
      if (pin.tag) {
        for (const role of activePreset.roles) {
          if (textMatchesRole(pin.tag, role.id, role.name)) {
            matchedRoleKeys.add(role.id);
          }
        }
      }
    }
  }

  // 3. 人脸特征与显式人脸命名 (face.label)
  const faces = photo.faces || [];
  const faceCount = faces.length;

  for (const face of faces) {
    // 显式命名的人脸标签
    if (face.label && !/^人物\s*#?\d+$/i.test(face.label)) {
      for (const role of activePreset.roles) {
        if (textMatchesRole(face.label, role.id, role.name)) {
          matchedRoleKeys.add(role.id);
        }
      }
    }

    // 钉选主角 (is_pinned) 自动关联到当前题材的核心主角
    if (face.is_pinned) {
      const protagonistRoles = PROTAGONIST_ROLE_MAP[currentGenre] || ['primary'];
      const targetRole = activePreset.roles.find((r) => protagonistRoles.includes(r.id));
      if (targetRole) {
        matchedRoleKeys.add(targetRole.id);
      }
    }
  }

  // 4. 多人合影构图自适应判断
  const groupThreshold =
    currentGenre === 'conference' ? 8 : currentGenre === 'wedding' ? 6 : currentGenre === 'family' ? 4 : 5;
  if (faceCount >= groupThreshold) {
    const groupRole = activePreset.roles.find((role) => GROUP_ROLE_IDS.includes(role.id));
    if (groupRole) matchedRoleKeys.add(groupRole.id);
  }

  // 5. 章节场景上下文关联 (若照片未显式打标，利用分段章节名称辅助确认)
  if (sceneChapterName && matchedRoleKeys.size === 0) {
    for (const role of activePreset.roles) {
      if (textMatchesRole(sceneChapterName, role.id, role.name)) {
        matchedRoleKeys.add(role.id);
      }
    }
  }

  return matchedRoleKeys;
}

/**
 * 汇总计算整组照片的雷达分析数据
 */
export function computeRadarAnalysis(
  photos: LocalPhoto[],
  selections: Record<string, { state: string; note?: string }>,
  activePreset: StorylinePreset,
  currentGenre: WorkflowScene,
  photoChapterNames?: Record<string, string>,
): RadarAnalysisResult {
  let totalSelected = 0;
  const rolesMap: Record<string, RoleStatistic> = {};

  activePreset.roles.forEach((r) => {
    rolesMap[r.id] = {
      id: r.id,
      name: r.name,
      icon: r.icon,
      description: r.description,
      selectedCount: 0,
      totalAppearances: 0,
      minWarningCount: r.minWarningCount,
      matchingPhotoIndices: [],
      unselectedPhotoIndices: [],
      samplePhotoIndex: undefined,
    };
  });

  let photosWithRoleDataCount = 0;

  photos.forEach((photo, idx) => {
    const sel = selections[photo.id];
    const isSelected = sel?.state === 'selected';
    if (isSelected) totalSelected++;

    const annotation = sel?.note ? parseAnnotation(sel.note) : undefined;
    const chapterName = photoChapterNames ? photoChapterNames[photo.id] : undefined;

    const matchedRoles = matchPhotoToRoles(photo, annotation, activePreset, currentGenre, chapterName);

    if (matchedRoles.size > 0) {
      photosWithRoleDataCount++;
    }

    matchedRoles.forEach((roleId) => {
      const target = rolesMap[roleId];
      if (target) {
        target.totalAppearances++;
        target.matchingPhotoIndices.push(idx);

        if (isSelected) {
          target.selectedCount++;
        } else {
          target.unselectedPhotoIndices.push(idx);
        }

        if (target.samplePhotoIndex === undefined) {
          target.samplePhotoIndex = idx;
        }
      }
    });
  });

  const roleList = Object.values(rolesMap);

  // 预警判定：总选片数达到 10 张以上时，若该角色存在拍摄但选入数 <= minWarningCount，或出现多次但选入为0
  const warningRoles = roleList.filter((r) => {
    if (
      totalSelected >= 10 &&
      r.totalAppearances > 0 &&
      ((r.minWarningCount !== undefined && r.selectedCount <= r.minWarningCount) ||
        (r.totalAppearances >= 1 && r.selectedCount === 0))
    ) {
      return true;
    }
    return false;
  });

  // 动态生成预警文案
  let warningMessage = '';
  if (warningRoles.length > 0) {
    const names = warningRoles.map((r) => `「${r.name.split('/')[0].trim()}」`).join('、');
    if (currentGenre === 'wedding') {
      warningMessage = `已精选 ${totalSelected} 张，但 ${names} 入选偏少。婚礼交付中新人双方长辈合影与仪式大合影是高危漏选项，建议排查敬茶与互动画面！`;
    } else if (currentGenre === 'family') {
      warningMessage = `已精选 ${totalSelected} 张，但 ${names} 入选偏少。家庭摄影中爸爸或祖辈常因掌镜容易被遗漏，建议排查亲子互动与全家福！`;
    } else if (currentGenre === 'conference') {
      warningMessage = `已精选 ${totalSelected} 张，但 ${names} 入选偏少。商务交付中核心主讲发言与VIP大合照为重点考核项！`;
    } else if (currentGenre === 'concert') {
      warningMessage = `已精选 ${totalSelected} 张，但 ${names} 入选偏少。音乐节现场舞台舞美与核心乐手特写直接影响成片丰富度！`;
    } else if (currentGenre === 'cosplay') {
      warningMessage = `已精选 ${totalSelected} 张，但 ${names} 入选偏少。角色写真中建议保持不同造型、局部特写与动势大景的平衡！`;
    } else if (currentGenre === 'travel') {
      warningMessage = `已精选 ${totalSelected} 张，但 ${names} 入选偏少。旅拍成片建议合理配比人像特写、同行互动与风光地标！`;
    } else {
      warningMessage = `已精选 ${totalSelected} 张，但 ${names} 入选偏少。建议检查是否遗漏了核心人物或重要互动瞬间！`;
    }
  }

  // 综合出场均衡度评分计算 (0 ~ 100)
  const { score, level, text } = calculateBalanceScore(roleList, totalSelected);

  return {
    roleStats: roleList,
    totalSelectedCount: totalSelected,
    totalPhotosWithRoleData: photosWithRoleDataCount,
    hasReliableRoleData: photosWithRoleDataCount > 0,
    warningRoles,
    warningMessage,
    balanceScore: score,
    balanceLevel: level,
    balanceText: text,
  };
}

/**
 * 计算角色均衡度评分
 */
export function calculateBalanceScore(
  roles: RoleStatistic[],
  totalSelected: number,
): { score: number; level: 'excellent' | 'good' | 'warning' | 'critical'; text: string } {
  const activeRoles = roles.filter((r) => r.totalAppearances > 0);

  if (activeRoles.length === 0 || totalSelected === 0) {
    return { score: 100, level: 'good', text: '暂无足够数据评估均衡度' };
  }

  // 1. 覆盖率得分：有出场的角色中，有多少被选入了至少 1 张
  const coveredRoles = activeRoles.filter((r) => r.selectedCount > 0).length;
  const coverageRatio = coveredRoles / activeRoles.length;
  const coverageScore = coverageRatio * 60; // 满分 60 分

  // 2. 预警惩罚：每个触发预警的角色扣 15 分
  const warningCount = activeRoles.filter(
    (r) => r.minWarningCount !== undefined && r.selectedCount <= r.minWarningCount,
  ).length;
  const warningPenalty = Math.min(30, warningCount * 15);

  // 3. 均衡离散度得分 (满分 40 分)
  const shares = activeRoles.map((r) => r.selectedCount / totalSelected);
  const idealShare = 1 / activeRoles.length;
  const variance = shares.reduce((sum, s) => sum + Math.pow(s - idealShare, 2), 0) / activeRoles.length;
  const balanceScore = Math.max(0, 40 - Math.sqrt(variance) * 80);

  const rawScore = Math.round(Math.max(10, Math.min(100, coverageScore + balanceScore - warningPenalty)));

  if (rawScore >= 85) {
    return { score: rawScore, level: 'excellent', text: '各角色出场分布均衡' };
  }
  if (rawScore >= 70) {
    return { score: rawScore, level: 'good', text: '整体良好 · 存在轻度倾斜' };
  }
  if (rawScore >= 50) {
    return { score: rawScore, level: 'warning', text: '关键主体入选不足 · 建议补齐' };
  }
  return { score: rawScore, level: 'critical', text: '严重偏科 · 存在核心角色遗漏' };
}

/**
 * 极坐标雷达图坐标计算器
 */
export interface RadarPoint {
  x: number;
  y: number;
}

export function getPolygonCoordinates(
  values: number[],
  maxVal: number,
  centerX: number,
  centerY: number,
  radius: number,
): RadarPoint[] {
  const count = values.length;
  if (count === 0) return [];

  const angleStep = (Math.PI * 2) / count;
  const startAngle = -Math.PI / 2; // 从正上方 12 点钟开始

  return values.map((val, i) => {
    const ratio = maxVal > 0 ? Math.min(1, Math.max(0, val / maxVal)) : 0;
    const currentRadius = radius * ratio;
    const angle = startAngle + i * angleStep;
    return {
      x: centerX + currentRadius * Math.cos(angle),
      y: centerY + currentRadius * Math.sin(angle),
    };
  });
}

export function pointsToSvgPath(points: RadarPoint[]): string {
  if (points.length === 0) return '';
  return `${points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} Z`;
}
