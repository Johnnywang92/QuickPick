import { WorkflowScene } from '../types/photo';

export interface StorylinePresetChapter {
  name: string;
  weight: number; // 建议配额权重百分比
  description?: string;
}

export interface StorylineCharacterRole {
  id: string;
  name: string;
  icon: string;
  description: string;
  minWarningCount?: number;
}

export interface StorylinePreset {
  id: WorkflowScene;
  name: string;
  icon: string;
  description: string;
  defaultGapMinutes: number;
  chapters: StorylinePresetChapter[];
  roles: StorylineCharacterRole[];
}

export const STORYLINE_PRESETS: Record<WorkflowScene, StorylinePreset> = {
  wedding: {
    id: 'wedding',
    name: '婚礼纪实',
    icon: '💒',
    description: '早妆晨袍、迎亲堵门、敬茶改口、外景特写、主仪式宣誓、晚宴敬酒',
    defaultGapMinutes: 10,
    chapters: [
      { name: '新娘早妆与晨袍', weight: 15, description: '静物婚鞋、婚纱挂拍、新娘化妆特写与闺蜜互动' },
      { name: '新郎迎亲与堵门', weight: 15, description: '伴郎团集结、接亲堵门游戏、求婚献花' },
      { name: '敬茶改口与合影', weight: 10, description: '双方长辈敬茶、感恩拥抱、家族小合影' },
      { name: '外景采风与特写', weight: 15, description: '新人双人漫步、草坪/街景唯美婚纱抓拍' },
      { name: '婚礼主仪式宣誓', weight: 25, description: '入场、父亲交接、誓言对白、交换戒指、亲吻' },
      { name: '晚宴敬酒与派对', weight: 20, description: '换礼服敬酒、切蛋糕、抛手捧花、After Party' },
    ],
    roles: [
      { id: 'bride', name: '新娘 / 女主角', icon: '👰', description: '全场核心视觉焦点' },
      { id: 'groom', name: '新郎 / 男主角', icon: '🤵', description: '男主角英姿与深情瞬间' },
      { id: 'parents', name: '父母 / 双方长辈', icon: '👵', description: '父母长辈敬茶与感动瞬间', minWarningCount: 1 },
      { id: 'bridal_party', name: '伴娘 / 伴郎团', icon: '👯', description: '接亲互动与同龄好友' },
      { id: 'group', name: '大合影 / 亲友群像', icon: '👥', description: '仪式大合影与全场群像', minWarningCount: 0 },
    ],
  },
  family: {
    id: 'family',
    name: '亲子与家庭',
    icon: '👶',
    description: '睡颜萌态、亲子互动、抓周/玩具时光、全家福合影、户外奔跑',
    defaultGapMinutes: 10,
    chapters: [
      { name: '睡颜萌态与静物', weight: 15, description: '小手小脚特写、安静睡颜、出生纪念物件' },
      { name: '室内亲子互动', weight: 20, description: '父母怀抱、抚触逗乐、亲子对视' },
      { name: '抓周与玩具时光', weight: 20, description: '传统抓周仪式、摆弄玩具抓拍、童真专注神态' },
      { name: '情绪表情特写', weight: 15, description: '大笑、嘟嘴、哭闹等纯真情绪捕捉' },
      { name: '全家福至亲合影', weight: 15, description: '三代同堂、一家三/四口温馨合影' },
      { name: '户外奔跑与撒欢', weight: 15, description: '公园草坪、踩水坑、自然光下的动态奔跑' },
    ],
    roles: [
      { id: 'baby', name: '宝宝 / 小主角', icon: '👶', description: '全家掌上明珠' },
      { id: 'mom', name: '妈妈 / 亲子互动', icon: '👩', description: '温柔母爱与互动' },
      { id: 'dad', name: '爸爸 / 亲子陪伴', icon: '👨', description: '沉稳陪伴与托举（防漏选提醒）', minWarningCount: 1 },
      { id: 'grandparents', name: '爷爷奶奶 / 外公外婆', icon: '👵', description: '长辈含饴弄孙慈祥瞬间' },
      { id: 'family_group', name: '全家福大合影', icon: '👨‍👩‍👧‍👦', description: '端庄温馨的家庭整齐留影', minWarningCount: 0 },
    ],
  },
  conference: {
    id: 'conference',
    name: '商务峰会与年会',
    icon: '💼',
    description: '嘉宾签到、主旨演讲、圆桌对话、商务茶歇、VIP全体合影、颁奖表彰',
    defaultGapMinutes: 15,
    chapters: [
      { name: '嘉宾签到与留念', weight: 10, description: '签名墙留影、VIP迎宾入场' },
      { name: '领导致辞与主旨演讲', weight: 25, description: '大咖嘉宾PPT宣讲、舞台聚光灯全景与特写' },
      { name: '高峰圆桌与对话', weight: 15, description: '多位行业专家交锋对谈、中景抓拍' },
      { name: '商务茶歇与交流', weight: 10, description: '同行自由换名片、端咖啡自然热聊' },
      { name: 'VIP 全体大合影', weight: 15, description: '全体嘉宾阶梯大合照（严查闭眼）' },
      { name: '闭幕颁奖与成果发布', weight: 25, description: '优秀表彰授牌、白皮书发布仪式、香槟庆祝' },
    ],
    roles: [
      { id: 'speaker', name: '主讲嘉宾 / 行业领袖', icon: '🎤', description: '台前主旨分享（防漏选）', minWarningCount: 1 },
      { id: 'vip', name: '签约高管 / VIP代表', icon: '💼', description: '前排VIP与领导特写' },
      { id: 'round_table', name: '圆桌对谈嘉宾', icon: '🤝', description: '台上多边研讨嘉宾' },
      { id: 'audience', name: '现场观众 / 互动代表', icon: '👀', description: '台下热烈鼓掌与提问' },
      { id: 'group', name: '全体大合影 / 表彰群像', icon: '👥', description: '全阵容大合影', minWarningCount: 0 },
    ],
  },
  concert: {
    id: 'concert',
    name: '音乐演出与舞台',
    icon: '🎸',
    description: '开场演出、热力唱跳、慢歌特写、嘉宾互动、高潮合唱、安可谢幕',
    defaultGapMinutes: 8,
    chapters: [
      { name: '开场演出与首发', weight: 15, description: '震撼开场舞美、第一首点燃全场' },
      { name: '热力唱跳与主打', weight: 25, description: '动感舞步抓拍、舞台灯光爆点瞬间' },
      { name: '慢歌抒情与特写', weight: 15, description: '主唱立麦深情演绎、面部汗水与情绪特写' },
      { name: '中场互动与嘉宾', weight: 10, description: 'MC环节与台下聊天、特邀神秘嘉宾同台' },
      { name: '高潮曲目与大合唱', weight: 20, description: '全场万人合唱、彩带/喷火/冷烟花齐发' },
      { name: '安可返场与谢幕', weight: 15, description: '换装返场、全乐队向台下90度鞠躬谢幕' },
    ],
    roles: [
      { id: 'lead_singer', name: '主唱 / 舞台C位', icon: '🌟', description: '绝对视觉焦点', minWarningCount: 1 },
      { id: 'guitar_bass', name: '吉他手 / 贝斯手', icon: '🎸', description: 'Solo扫弦动态张力', minWarningCount: 0 },
      { id: 'drum_keyboard', name: '鼓手 / 键盘手', icon: '🥁', description: '节拍律动与专注侧颜' },
      { id: 'fans', name: '乐迷观众 / 荧光海', icon: '🙌', description: '台下热烈鼓掌与挥臂互动' },
      { id: 'stage_full', name: '舞台全景舞美', icon: '🏟️', description: '灯光舞美大场景' },
    ],
  },
  cosplay: {
    id: 'cosplay',
    name: '二次元与汉服写真',
    icon: '👘',
    description: '第一造型正片、第二造型正片、动作剧情特写、场馆巡游、幕后花絮',
    defaultGapMinutes: 10,
    chapters: [
      { name: '角色正片第一造型', weight: 25, description: '主武器、标志性站姿、还原原作经典名场面' },
      { name: '角色正片第二造型', weight: 25, description: '战损版或换装形态、情绪与光影升级' },
      { name: '动作抓拍与剧情特写', weight: 25, description: '裙摆飞扬、甩发、剑拔弩张动态快门' },
      { name: '场馆巡游与同好互动', weight: 15, description: 'CP同框、漫展集邮、双人对峙抓拍' },
      { name: '幕后花絮与谢幕', weight: 10, description: '后勤整理假发、吃便当崩人设搞笑瞬间' },
    ],
    roles: [
      { id: 'character_a', name: '第一造型正片', icon: '👘', description: '主角色经典还原', minWarningCount: 1 },
      { id: 'character_b', name: '第二造型正片', icon: '👗', description: '换装变体形态' },
      { id: 'closeup', name: '眼妆与美瞳特写', icon: '👁️', description: '面部与妆容精修位' },
      { id: 'full_body', name: '全身动势与剧情', icon: '🤺', description: '武器与大景构图' },
      { id: 'behind_scenes', name: '幕后花絮与同好', icon: '📸', description: '轻松写实记录' },
    ],
  },
  travel: {
    id: 'travel',
    name: '旅拍与城市纪实',
    icon: '✈️',
    description: '启程在途、城市地标、人文市井、自然风光、落日黄金时刻、夜景美食',
    defaultGapMinutes: 15,
    chapters: [
      { name: '启程在途与车窗光影', weight: 10, description: '机场/高铁站、车窗看风景的侧影、行李箱' },
      { name: '地标打卡与全景风光', weight: 20, description: '著名景点大构图、人在景中留影' },
      { name: '人文市井与街头漫步', weight: 20, description: '穿梭老街巷陌、当地市集、生活气息抓拍' },
      { name: '日落黄昏黄金时刻', weight: 20, description: '傍晚暖阳金光、剪影、海边微风' },
      { name: '夜景灯火与地道美食', weight: 15, description: '霓虹夜市、招牌小吃品尝瞬间' },
      { name: '情绪抓拍与旅途花絮', weight: 15, description: '旅伴欢笑、迷路小插曲、随手偶遇' },
    ],
    roles: [
      { id: 'protagonist', name: '旅拍主角 / 人像', icon: '🎒', description: '出游主角自然神态', minWarningCount: 1 },
      { id: 'companion', name: '同行伴侣 / 亲友', icon: '👭', description: '旅途双人互动' },
      { id: 'street_life', name: '人文市井 / 当地人', icon: '🚲', description: '地道风土人情' },
      { id: 'landscape', name: '自然风光 / 建筑', icon: '🏔️', description: '宏大风景空镜' },
      { id: 'details', name: '美食 / 局部物件', icon: '☕', description: '咖啡杯、机票、小物件' },
    ],
  },
  general: {
    id: 'general',
    name: '通用纪实与活动',
    icon: '📸',
    description: '基于快门时间空白自动切分各环节，灵活适应各类摄影',
    defaultGapMinutes: 10,
    chapters: [
      { name: '环节 1', weight: 20, description: '第一阶段拍摄' },
      { name: '环节 2', weight: 20, description: '第二阶段拍摄' },
      { name: '环节 3', weight: 20, description: '第三阶段拍摄' },
      { name: '环节 4', weight: 20, description: '第四阶段拍摄' },
      { name: '环节 5', weight: 20, description: '第五阶段拍摄' },
    ],
    roles: [
      { id: 'primary', name: '核心主角 / 焦点人物', icon: '⭐', description: '画面重心人物', minWarningCount: 1 },
      { id: 'secondary', name: '重要配角 / 互动人物', icon: '👤', description: '身边互动对象' },
      { id: 'group', name: '集体合影 / 现场大景', icon: '👥', description: '多人全貌留影' },
      { id: 'details', name: '局部细节 / 静物空镜', icon: '📷', description: '环境与物件细节' },
      { id: 'candid', name: '精彩抓拍 / 花絮偶得', icon: '✨', description: '不经意的生动神情' },
    ],
  },
};

/**
 * 获取指定预设，若不存在则回退至通用模式
 */
export function getStorylinePreset(presetId: string): StorylinePreset {
  const key = presetId as WorkflowScene;
  return STORYLINE_PRESETS[key] || STORYLINE_PRESETS.general;
}

/**
 * 获取所有预设列表
 */
export function getAllStorylinePresets(): StorylinePreset[] {
  return [
    STORYLINE_PRESETS.wedding,
    STORYLINE_PRESETS.family,
    STORYLINE_PRESETS.conference,
    STORYLINE_PRESETS.concert,
    STORYLINE_PRESETS.cosplay,
    STORYLINE_PRESETS.travel,
    STORYLINE_PRESETS.general,
  ];
}

/**
 * 将总选片目标按照各章节的权重（或照片数量）自动分配到各个章节
 * 保证总分配数精确等于 totalGoal
 */
export function distributeTargetGoalAcrossChapters(
  chaptersCount: number,
  totalGoal: number,
  weights?: number[],
): number[] {
  if (chaptersCount <= 0 || totalGoal <= 0) return [];
  if (chaptersCount === 1) return [totalGoal];

  const suppliedWeights =
    weights && weights.length === chaptersCount
      ? weights.map((weight) => Math.max(0, Number.isFinite(weight) ? weight : 0))
      : Array(chaptersCount).fill(1);
  const totalWeight = suppliedWeights.reduce((sum, weight) => sum + weight, 0);
  const actualWeights = totalWeight > 0 ? suppliedWeights : Array(chaptersCount).fill(1);
  const denominator = actualWeights.reduce((sum, weight) => sum + weight, 0);

  // 最大余数法：先向下取整，再按小数余数补齐，始终保持总和等于总目标。
  const exactQuotas = actualWeights.map((weight) => (weight / denominator) * totalGoal);
  const result = exactQuotas.map(Math.floor);
  let remaining = totalGoal - result.reduce((sum, quota) => sum + quota, 0);
  const remainderOrder = exactQuotas
    .map((quota, index) => ({ index, remainder: quota - Math.floor(quota) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (let index = 0; index < remaining; index += 1) {
    result[remainderOrder[index % remainderOrder.length].index] += 1;
  }

  return result;
}
