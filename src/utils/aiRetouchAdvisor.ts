import { LocalPhoto, PhotoInsight, WorkflowScene } from '../types/photo';

export interface RetouchSuggestion {
  category: 'lighting' | 'portrait' | 'color' | 'composition';
  title: string;
  detail: string;
  recommendedTag?: string;
}

export interface LightroomParams {
  exposure: string;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  texture: number;
  clarity: number;
  lensCorrection: boolean;
}

export interface AiPrompts {
  photoshopInstruction: string;
  photoshopInstructionEn: string;
  sdPositivePrompt: string;
  sdNegativePrompt: string;
  midjourneyPrompt: string;
}

export interface PhotoRetouchAdvice {
  summary: string;
  suggestions: RetouchSuggestion[];
  lightroomParams: LightroomParams;
  aiPrompts: AiPrompts;
  recommendedTags: string[];
}

/**
 * 根据照片特征、EXIF 元数据、缺陷诊断和题材预设，自动生成专家级修图建议与 AI 创成式提示词
 */
export function generateRetouchAdvice(
  photo: LocalPhoto,
  insight?: PhotoInsight | null,
  scene: WorkflowScene = 'wedding',
): PhotoRetouchAdvice {
  const suggestions: RetouchSuggestion[] = [];
  const recommendedTagsSet = new Set<string>();

  const exif = photo.exif;
  const faces = photo.faces || [];
  const faceCount = faces.length;
  const hasFaces = faceCount > 0;
  const hasClosedEye = faces.some((f) => f.eye_open_score < 0.40);
  const minEyeScore = hasFaces ? Math.min(...faces.map((f) => f.eye_open_score)) : 1.0;

  const aperture = exif?.aperture;
  const focalLength = exif?.focal_length || exif?.focal_length_35mm;
  const iso = exif?.iso || 100;
  const cameraModel = exif?.camera_model ? `${exif.camera_make || ''} ${exif.camera_model}`.trim() : 'Professional DSLR/Mirrorless';
  const lensModel = exif?.lens_model || (focalLength ? `${focalLength}mm Prime/Zoom` : 'Prime Lens');

  // 1. 光影与曝光维度
  let lrExposure = '0.0 EV';
  let lrHighlights = -15;
  let lrShadows = +15;
  let lrWhites = +5;
  let lrBlacks = -5;

  const reasons = insight?.reasons || [];
  const isHighContrast = reasons.some((r) => r.includes('死白') || r.includes('偏亮') || r.includes('高光'));
  const isDark = reasons.some((r) => r.includes('偏暗') || r.includes('暗部'));

  if (isHighContrast) {
    lrHighlights = -40;
    lrShadows = +25;
    suggestions.push({
      category: 'lighting',
      title: '大光比高光压暗与细节拯救',
      detail: '画面局部高光反差强烈，建议在 RAW 中压暗高光 -35 ~ -50，恢复浅色衣物/天空质感，并微提阴影扩展动态范围。',
      recommendedTag: '调亮主体',
    });
    recommendedTagsSet.add('调亮主体');
  } else if (isDark) {
    lrExposure = '+0.4 EV';
    lrShadows = +30;
    suggestions.push({
      category: 'lighting',
      title: '暗部提亮与中途阶对比拉升',
      detail: '画面直方图偏暗，建议提高整体曝光 +0.3 ~ +0.5 EV，提亮暗部曲线，并开启轻微彩色降噪以防止暗部噪点浮现。',
      recommendedTag: '调亮主体',
    });
    recommendedTagsSet.add('调亮主体');
  } else {
    suggestions.push({
      category: 'lighting',
      title: '光影层次塑形',
      detail: '曝光基准良好，建议通过局部微压高光与轻提中途阶对比，增强主体轮廓光的立体雕刻感。',
    });
  }

  // 2. 人像与肤质维度
  if (hasFaces) {
    if (faceCount === 1) {
      // 单人肖像
      if (hasClosedEye || minEyeScore < 0.40) {
        suggestions.push({
          category: 'portrait',
          title: '眼神光重塑或连拍眼神替换',
          detail: '核心人物眼部微闭或处于眨眼瞬间，首选从同组连拍中替换睁眼，或在后期中手动提亮眼部巩膜并重塑眼神反光点。',
          recommendedTag: '面部微调',
        });
      } else {
        suggestions.push({
          category: 'portrait',
          title: '高低频/双曲线真实毛孔微精修',
          detail: '保留皮肤真实微孔与天然纹理，拒绝塑料假面感；消除法令纹与眼周暗沉，提亮眼球虹膜与高光反差。',
          recommendedTag: '保留真实肤色',
        });
      }
      suggestions.push({
        category: 'portrait',
        title: '修除发际线与下颌碎发',
        detail: '清理额头前、耳周及下颌线外侧杂乱的飘散发丝，保持头颈轮廓利落修长。',
        recommendedTag: '修除碎发',
      });
      recommendedTagsSet.add('面部微调');
      recommendedTagsSet.add('修除碎发');
      recommendedTagsSet.add('保留真实肤色');
    } else {
      // 多人合影 / 双人互动
      if (hasClosedEye) {
        suggestions.push({
          category: 'portrait',
          title: '合影闭眼连拍无缝换脸',
          detail: `检测到合影中有人物闭眼，建议利用同组连拍在 Photoshop 中对齐图层，通过蒙版无缝替换最佳睁眼神态。`,
          recommendedTag: '面部微调',
        });
        recommendedTagsSet.add('面部微调');
      }
      suggestions.push({
        category: 'portrait',
        title: '全员面部肤色统一与色温平滑',
        detail: '合影中受侧向环境光影响容易产生不同人物冷暖肤色不一致，需局部建立肤色蒙版校准统一色相。',
        recommendedTag: '保留真实肤色',
      });
      recommendedTagsSet.add('保留真实肤色');
    }
  }

  // 3. 题材场景风格与调色基调
  let sceneStyleZh = '通透纯净';
  let sceneStyleEn = 'cinematic natural';

  switch (scene) {
    case 'wedding':
      sceneStyleZh = '唯美高雅婚纱纪实';
      sceneStyleEn = 'luxurious wedding portrait, romantic soft Rembrandt lighting, creamy highlights, pristine white bridal dress texture';
      suggestions.push({
        category: 'color',
        title: '婚礼通透白皙与高级暖调',
        detail: '婚纱保持纯白不发灰、不泛黄；暗部与逆光发丝适度融入柔和暖金色，呈现浪漫优雅氛围。',
      });
      break;
    case 'family':
      sceneStyleZh = '温馨暖意亲子纪实';
      sceneStyleEn = 'heartwarming family photography, vibrant natural daylight, authentic joyful emotions, soft skin tones';
      suggestions.push({
        category: 'color',
        title: '清新自然暖调与纯真神态',
        detail: '强化自然光柔和感，适度提高橙色明度让儿童与父母肤色更具活力与血色。',
      });
      break;
    case 'conference':
      sceneStyleZh = '严谨商务峰会风';
      sceneStyleEn = 'executive business summit, crisp stage spotlight, clear corporate colors, sharp suit fabric texture';
      suggestions.push({
        category: 'color',
        title: '中性利落白平衡与大屏校色',
        detail: '矫正现场 LED 大屏的强烈偏色，恢复主讲人自然肤色，确保品牌背板标准色相准确。',
      });
      break;
    case 'concert':
      sceneStyleZh = '爆裂舞台摇滚光影';
      sceneStyleEn = 'electrifying live concert stage, neon laser volumetric lighting, atmospheric fog, dynamic rim lights';
      suggestions.push({
        category: 'color',
        title: '舞台霓虹氛围保留与面光提亮',
        detail: '保留舞台射灯激光的冷暖对比与烟雾丁达尔效应，仅在歌手面部局部压制高饱和单色光并提亮眼神。',
      });
      break;
    case 'cosplay':
      sceneStyleZh = '二次元与国风写真';
      sceneStyleEn = 'cinematic anime cosplay photography, luminous eyes and contact lenses, immaculate wig details, dramatic backlight';
      suggestions.push({
        category: 'color',
        title: '美瞳色彩强化与服装质感升级',
        detail: '强化眼睛美瞳的晶莹剔透感，清理假发反光杂边，强化主武器或道具的金属/布料质感。',
      });
      break;
    case 'travel':
      sceneStyleZh = '人文旅拍与地标风光';
      sceneStyleEn = 'cinematic travel documentary, golden hour warm radiance, majestic landscape, vibrant authentic street life';
      suggestions.push({
        category: 'color',
        title: '冷暖黄金时刻与地平线校准',
        detail: '加强日落黄昏天空的渐变冷暖对比，消除前景杂乱路人与垃圾桶，强化画面的沉浸故事感。',
        recommendedTag: '消除路人/杂物',
      });
      recommendedTagsSet.add('消除路人/杂物');
      break;
    default:
      sceneStyleZh = '纪实原色质感';
      sceneStyleEn = 'authentic documentary portrait, realistic colors, balanced depth of field, natural lighting';
      suggestions.push({
        category: 'color',
        title: '自然写实色彩校准',
        detail: '还原肉眼所见的真实动态与色彩平衡，增强中等灰度层次的微弱质感。',
      });
  }

  // 4. 构图、镜头畸变与背景杂物
  if (focalLength && focalLength <= 28) {
    suggestions.push({
      category: 'composition',
      title: '广角镜头畸变与边缘透视校正',
      detail: '当前使用广角焦段拍摄，需开启镜头光学配置文件校正暗角与桶形畸变，并检查画面边缘人物身形拉伸。',
      recommendedTag: '调整构图/水平',
    });
    recommendedTagsSet.add('调整构图/水平');
  } else {
    suggestions.push({
      category: 'composition',
      title: '边角穿帮与背景路人清理',
      detail: '检查四角是否存在杂乱穿帮灯架、路人或地面杂物，适当进行内容感知消除或微裁切。',
      recommendedTag: '消除路人/杂物',
    });
    recommendedTagsSet.add('消除路人/杂物');
  }

  // 5. ISO 高感降噪提示
  if (iso >= 3200) {
    suggestions.push({
      category: 'lighting',
      title: '高感光度 AI 噪点抑制',
      detail: `当前感光度为 ISO ${iso}，建议开启 Lightroom AI 降噪或捕获一降噪，在磨除暗部彩色杂讯的同时完整保留发丝与织物边缘。`,
    });
  }

  // 6. 合成 AI 创成式提示词 (Photoshop / Midjourney / Stable Diffusion / ComfyUI)
  const apertureStr = aperture ? `f/${aperture}` : 'f/1.8';
  const focalStr = focalLength ? `${focalLength}mm` : '85mm';

  const sdPositivePrompt = [
    'masterpiece',
    'best quality',
    'cinematic film photography',
    sceneStyleEn,
    hasFaces ? (faceCount > 1 ? 'group portrait, natural joyful expressions, consistent skin tones' : 'delicate facial features, authentic skin texture, realistic pores, detailed sparkling eyes') : 'stunning focal subject, clean composition',
    `shot on ${cameraModel}`,
    `${lensModel} ${focalStr} ${apertureStr}`,
    'shallow depth of field, creamy bokeh',
    'sharp focus on eyes, 8k resolution, raw color, photorealistic, no plastic skin',
  ].join(', ');

  const sdNegativePrompt = [
    'plastic skin',
    'over-smoothed skin',
    'doll face',
    'cartoon',
    'anime',
    'distorted eyes',
    'closed eyes',
    'unnatural anatomy',
    'deformed hands',
    'bad proportions',
    'blurry',
    'motion blur',
    'overexposed',
    'blown highlights',
    'heavy noise',
    'chromatic aberration',
    'watermark',
    'text',
  ].join(', ');

  const midjourneyPrompt = `${sdPositivePrompt} --ar 3:2 --style raw --v 6.0`;

  const photoshopInstruction = hasFaces
    ? '消除背景杂乱穿帮与路人，保留真实皮肤毛孔微纹理，微提眼神光，修除额头及外轮廓碎发，平整衣物折痕。'
    : '消除画面边缘穿帮杂物，校正水平线，增强光影冷暖层次与材质质感。';

  const photoshopInstructionEn = hasFaces
    ? 'Remove background distractions and passing pedestrians, preserve natural skin pores, enhance eye reflections, clean up stray hair on forehead, smooth fabric wrinkles while maintaining dress texture.'
    : 'Remove background distractions, correct horizontal alignment, enhance dynamic lighting and authentic textures.';

  const summary = `【${sceneStyleZh}】建议重点把控：${suggestions.map((s) => s.title).slice(0, 3).join('、')}。`;

  return {
    summary,
    suggestions,
    lightroomParams: {
      exposure: lrExposure,
      highlights: lrHighlights,
      shadows: lrShadows,
      whites: lrWhites,
      blacks: lrBlacks,
      texture: 8,
      clarity: 4,
      lensCorrection: true,
    },
    aiPrompts: {
      photoshopInstruction,
      photoshopInstructionEn,
      sdPositivePrompt,
      sdNegativePrompt,
      midjourneyPrompt,
    },
    recommendedTags: Array.from(recommendedTagsSet),
  };
}
