import { LocalPhoto, WorkflowScene } from '../types/photo';

export interface DetectedPresetResult {
  presetId: WorkflowScene;
  confidence: number; // 0.0 ~ 1.0 置信度
  reasons: string[]; // 推荐理由列表
  scores: Record<WorkflowScene, number>;
}

interface ScenePattern {
  id: WorkflowScene;
  name: string;
  pathRegex: RegExp;
  pathWeight: number;
}

const SCENE_PATTERNS: ScenePattern[] = [
  {
    id: 'wedding',
    name: '婚礼纪实',
    pathRegex:
      /(?:婚|wedding|bride|groom|接亲|迎亲|早妆|晨袍|敬茶|改口|新娘|伴娘|伴郎|婚纱|婚礼|出阁|归宁|主仪式)/i,
    pathWeight: 60,
  },
  {
    id: 'family',
    name: '亲子与家庭',
    pathRegex:
      /(?:亲子|家庭|全家福|宝宝|婴儿|周岁|抓周|百天|百日|满月|儿童|family|baby|kid|kids|child|infant|newborn)/i,
    pathWeight: 60,
  },
  {
    id: 'conference',
    name: '商务峰会与年会',
    pathRegex:
      /(?:会议|峰会|年会|论坛|研讨|发布会|大会|签约|开幕式|闭幕式|圆桌|茶歇|表彰|颁奖|展厅|交流会|conference|summit|annual|meeting|forum|seminar)/i,
    pathWeight: 60,
  },
  {
    id: 'concert',
    name: '音乐演出与舞台',
    pathRegex:
      /(?:演唱会|音乐节|livehouse|音乐会|舞台|演出|巡演|乐队|专场|开场|安可|唱跳|主唱|现场演出|concert|gig|live|festival|band)/i,
    pathWeight: 60,
  },
  {
    id: 'cosplay',
    name: 'Cosplay 与展会',
    pathRegex: /(?:漫展|cosplay|cos|cp\d+|bw\d*|bilibili\s*world|comic|同人|正片|场照|妆造|二次元|动漫)/i,
    pathWeight: 60,
  },
  {
    id: 'travel',
    name: '旅拍与风光',
    pathRegex:
      /(?:旅拍|旅游|旅行|出游|风景|风光|游记|自驾|travel|trip|tour|landscape|vacation|大理|丽江|三亚|川西|西藏|新疆|青海|普吉|冰岛|富士山|海边|海岛)/i,
    pathWeight: 60,
  },
];

const parseTimestamp = (photo: LocalPhoto): number | null => {
  const dtStr = photo.exif?.date_time_original || photo.capturedAt;
  if (!dtStr) return null;
  const normalized = dtStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(/-/g, '/');
  const ts = Date.parse(normalized);
  return isNaN(ts) ? null : ts / 1000;
};

/**
 * 自动检测并推断最贴切的故事线模板
 *
 * 结合 3 重维度：
 * 1. 文件夹路径与文件名语义正则匹配（权重最高、响应零延迟）
 * 2. EXIF 拍摄时序特征（单日跨度、多日跨度、拍摄时段分布）
 * 3. EXIF 曝光与光学参数（高感光度分布、大/小光圈比例）
 */
export function detectOptimalPreset(
  folderPath: string,
  photos: LocalPhoto[],
): DetectedPresetResult {
  const scores: Record<WorkflowScene, number> = {
    wedding: 0,
    family: 0,
    conference: 0,
    concert: 0,
    cosplay: 0,
    travel: 0,
    general: 0,
  };

  const reasonsMap: Record<WorkflowScene, string[]> = {
    wedding: [],
    family: [],
    conference: [],
    concert: [],
    cosplay: [],
    travel: [],
    general: [],
  };

  if (!photos || photos.length === 0) {
    return {
      presetId: 'general',
      confidence: 0,
      reasons: ['相册内暂无照片，默认采用通用故事线模板'],
      scores,
    };
  }

  // -------------------------------------------------------------
  // 维度 1: 路径与文件名语义分析
  // -------------------------------------------------------------
  const normalizedPath = folderPath.toLowerCase();
  // 抽样检查前 60 张照片的文件名或相对路径
  const sampleFilenames = photos
    .slice(0, 60)
    .map((p) => p.filename.toLowerCase())
    .join(' ');

  for (const pattern of SCENE_PATTERNS) {
    // 检查目录路径（包含文件夹名及父级）
    if (pattern.pathRegex.test(normalizedPath)) {
      scores[pattern.id] += pattern.pathWeight;
      reasonsMap[pattern.id].push(`目录路径包含与「${pattern.name}」相关的业务关键词`);
    } else if (pattern.pathRegex.test(sampleFilenames)) {
      scores[pattern.id] += Math.round(pattern.pathWeight * 0.5);
      reasonsMap[pattern.id].push(`文件名中检测到「${pattern.name}」相关命名特征`);
    }
  }

  // -------------------------------------------------------------
  // 维度 2: EXIF 拍摄时序分析
  // -------------------------------------------------------------
  const timestamps = photos
    .map(parseTimestamp)
    .filter((ts): ts is number => ts !== null)
    .sort((a, b) => a - b);

  if (timestamps.length >= 2) {
    const minTs = timestamps[0];
    const maxTs = timestamps[timestamps.length - 1];
    const totalDurationHours = (maxTs - minTs) / 3600;

    // 计算跨越的自然日数量
    const uniqueDays = new Set(
      timestamps.map((ts) => {
        const d = new Date(ts * 1000);
        return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      }),
    ).size;

    // 多日跨度判断 -> 旅拍强特征
    if (uniqueDays >= 2 && totalDurationHours >= 18) {
      scores.travel += 40;
      reasonsMap.travel.push(
        `拍摄周期横跨 ${uniqueDays} 个自然日（跨度 ${totalDurationHours.toFixed(1)} 小时），契合多日旅拍/旅行特征`,
      );
    } else if (uniqueDays === 1) {
      // 单日长跨度（全天拍摄 7~18 小时） -> 婚礼、年会强特征
      if (totalDurationHours >= 7 && totalDurationHours <= 18) {
        scores.wedding += 30;
        reasonsMap.wedding.push(
          `单日拍摄全天跨度达 ${totalDurationHours.toFixed(1)} 小时，契合婚礼早妆至晚宴全流程`,
        );
        scores.conference += 20;
        reasonsMap.conference.push(
          `拍摄跨度达 ${totalDurationHours.toFixed(1)} 小时，契合全天峰会/大会日程`,
        );
      } else if (totalDurationHours >= 0.5 && totalDurationHours <= 4.0) {
        // 短平快拍摄（1~3.5小时） -> 亲子家庭摄影极典型时长
        scores.family += 25;
        reasonsMap.family.push(
          `拍摄时长集中在 ${totalDurationHours.toFixed(1)} 小时内，契合亲子儿童专注拍摄时长`,
        );
        scores.concert += 15;
        reasonsMap.concert.push(
          `单场拍摄约 ${totalDurationHours.toFixed(1)} 小时，符合演出与活动时段`,
        );
      }

      // 拍摄时段分布判断（晚间演出黄金时间）
      const eveningShots = timestamps.filter((ts) => {
        const hour = new Date(ts * 1000).getHours();
        return hour >= 19 || hour <= 2;
      }).length;
      const eveningRatio = eveningShots / timestamps.length;
      if (eveningRatio >= 0.7 && totalDurationHours <= 6) {
        scores.concert += 30;
        reasonsMap.concert.push(
          `超过 ${(eveningRatio * 100).toFixed(0)}% 的照片在夜间（19:00后）拍摄，契合晚间演出时段`,
        );
      }
    }
  }

  // -------------------------------------------------------------
  // 维度 3: EXIF 曝光与光学器材特征
  // -------------------------------------------------------------
  const validIsoPhotos = photos.filter((p) => p.exif?.iso && p.exif.iso > 0);
  if (validIsoPhotos.length >= 5) {
    const isos = validIsoPhotos.map((p) => p.exif!.iso!).sort((a, b) => a - b);
    const medianIso = isos[Math.floor(isos.length / 2)];
    const highIsoCount = isos.filter((iso) => iso >= 3200).length;
    const highIsoRatio = highIsoCount / isos.length;
    const lowIsoCount = isos.filter((iso) => iso <= 200).length;
    const lowIsoRatio = lowIsoCount / isos.length;

    // 舞台极暗光高 ISO 特征
    if (medianIso >= 3200 || highIsoRatio >= 0.4) {
      scores.concert += 35;
      reasonsMap.concert.push(
        `高感光度（ISO ≥ 3200）占比达 ${(highIsoRatio * 100).toFixed(0)}%（中位数 ISO ${medianIso}），符合舞台暗光抓拍特征`,
      );
    } else if (lowIsoRatio >= 0.65) {
      // 充足日光/户外低 ISO
      scores.travel += 20;
      reasonsMap.travel.push(
        `低感光度（ISO ≤ 200）占比达 ${(lowIsoRatio * 100).toFixed(0)}%，符合户外日光与风光摄影特征`,
      );
    }
  }

  const validAperturePhotos = photos.filter(
    (p) => p.exif?.aperture && p.exif.aperture > 0,
  );
  if (validAperturePhotos.length >= 5) {
    const apertures = validAperturePhotos.map((p) => p.exif!.aperture!);
    const largeApertureCount = apertures.filter((f) => f <= 2.0).length;
    const largeApertureRatio = largeApertureCount / apertures.length;
    const smallApertureCount = apertures.filter((f) => f >= 6.3).length;
    const smallApertureRatio = smallApertureCount / apertures.length;

    if (largeApertureRatio >= 0.5) {
      scores.wedding += 10;
      scores.family += 10;
      scores.cosplay += 15;
      reasonsMap.cosplay.push(
        `大光圈特写镜头（f/2.0 及以上）占比达 ${(largeApertureRatio * 100).toFixed(0)}%`,
      );
    } else if (smallApertureRatio >= 0.4) {
      scores.travel += 20;
      reasonsMap.travel.push(
        `小光圈风光景深（f/6.3 及以下）占比达 ${(smallApertureRatio * 100).toFixed(0)}%`,
      );
    }
  }

  // -------------------------------------------------------------
  // 选出最高得分场景并计算置信度
  // -------------------------------------------------------------
  const candidates: WorkflowScene[] = [
    'wedding',
    'family',
    'conference',
    'concert',
    'cosplay',
    'travel',
  ];

  let bestScene: WorkflowScene = 'general';
  let highestScore = 0;

  for (const scene of candidates) {
    if (scores[scene] > highestScore) {
      highestScore = scores[scene];
      bestScene = scene;
    }
  }

  // 若最高得分不足 30 分，判定为无明显场景特征，采用通用模板
  if (highestScore < 30) {
    return {
      presetId: 'general',
      confidence: 0.3,
      reasons: ['未检测到单一场景特征，采用通用纪实故事线模板'],
      scores,
    };
  }

  // 置信度计算：最高得分相对基准的归一化（0.50 ~ 0.98）
  const confidence = Math.min(
    0.98,
    Math.max(0.5, Math.round((highestScore / (highestScore + 25)) * 100) / 100),
  );

  return {
    presetId: bestScene,
    confidence,
    reasons: reasonsMap[bestScene].length > 0 ? reasonsMap[bestScene] : ['综合时序与拍摄特征匹配'],
    scores,
  };
}
