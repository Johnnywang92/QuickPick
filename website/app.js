/**
 * QuickPick Landing Page Interactive Engine
 * Bilingual (ZH/EN) + Live Darkroom Workbench Simulation
 * Author: Johnny Boy Studio
 */

const I18N = {
  zh: {
    pageTitle: "QuickPick 极选 — 摄影师本地极速选片与构图调色工作台 | Johnny Boy Studio",
    heroEyebrow: "JOHNNY BOY STUDIO · 专业暗房工作台 v0.2.0",
    heroTitlePrefix: "从三千张 RAW 底片到惊艳交付，",
    heroTitleHighlight: "只需一杯咖啡的时间",
    heroSub: "专为专业摄影师与深度影像爱好者打造的本地极速选片与构图调色工作台。零上传 · 100% 原片只读安全 · 毫秒级原生解码 · 电影级调色与审美相框。",
    btnDownloadMac: "免费下载 macOS 客户端",
    btnViewGithub: "GitHub 开源仓库",
    gatekeeperTip: "macOS 首次打开安全放行命令：",
    copyBtn: "复制命令",
    copiedToast: "已复制到剪贴板！",
    
    trustReadOnly: "100% 物理只读安全",
    trustLibRaw: "毫秒级 LibRaw 原生解码",
    trustPixi: "Pixi.js v8 硬件加速",
    trustLicense: "MIT 开源许可证",

    demoHeader: "在线拟真暗房交互体验",
    demoTip: "支持在网页中直接按键盘快捷键或鼠标点击体验",
    demoWindowFile: "DSC06182.ARW · 4000×6000 (24.0MP) · Sony A7M4",
    demoHudFps: "120 FPS 硬件加速",
    
    groupGrid: "构图线 (O)",
    gridNone: "关闭",
    gridThirds: "三分法",
    gridSpiral: "黄金螺旋",
    gridRatio: "黄金分割",
    gridDiagonal: "动态对称",
    gridCross: "中心地平",
    
    groupLut: "色彩风格 (L/B)",
    lutRaw: "RAW直出",
    lutPortra: "Portra 400",
    lutChrome: "Classic Chrome",
    lutLeica: "徕卡高反差黑白 (B)",
    
    groupFrame: "参数相框 (E)",
    frameNone: "无相框",
    frame1: "1 经典白",
    frame2: "2 黑曜石",
    frame3: "3 琥珀金",
    frame4: "4 宽幅",
    frame5: "5 复古纸",

    bentoTag: "核心特性",
    bentoTitle: "为极速而生，为审美与安全而设计",
    
    bento1Title: "⚡ 废片一键粉碎漏斗 (Blink & Blur)",
    bento1Desc: "AI 智能筛查闭眼缺陷（双眼睁开度算法）、严重脱焦/模糊（拉普拉斯锐度方差）与连拍冗余次选。独创「金标强锁定保护」，已被保留的照片严禁批量误剔除，支持 Cmd+Z 原子撤销。",
    bento1Badge: "AI 缺陷筛查 · 强保护",

    bento2Title: "📐 5 大摄影经典构图参考线",
    bento2Desc: "3×3黄金三分法、斐波那契黄金螺旋（Shift+O 4象限旋转）、黄金分割比例（1:0.618:1）、动态对称网格与高精度地平线校准。Pixi.js v8 逆缩放保证 1.25px 物理像素极锐显示。",
    bento2Badge: "Pixi.js 硬件加速",

    bento3Title: "🎨 EXIF 摄影参数相框与调色台",
    bento3Desc: "快捷键 E 瞬时呼出。提供 6 大合规艺术相框模板与原创几何光圈徽标。智能调光 (Auto Tone Engine)，一键 Cmd+C 复制带框高清图到剪贴板，支持 AirDrop 隔空投送。",
    bento3Badge: "100% 商用合规 · 免版权风险",

    bento4Title: "🎞️ 3D LUT 电影级胶片调色",
    bento4Desc: "内置 Kodak Portra、Fuji Classic Chrome 与徕卡高反差黑白影调。支持导入自定义 .cube 3D LUT 文件，Rust 多线程与 WebGPU 实时 60~120fps 超高速映射。",
    bento4Badge: "实时 120 FPS 映射",

    bento5Title: "👥 故事线与至亲人物出场记分板",
    bento5Desc: "婚礼/大型活动摄影必备。剧本式故事线场景分段配额、人像聚类核心人物防漏片雷达、连拍两两对决 (P) 与人物面部 100% 特写抽屉 (F)。",
    bento5Badge: "活动/婚礼摄影利器",

    bento6Title: "🔒 物理级源文件只读安全红线",
    bento6Desc: "全生命周期对源照片目录保持物理只读，绝不修改、覆盖或写入任何隐藏缓存。导出强制校验 SHA-256 哈希，杜绝向源目录写出冲突。",
    bento6Badge: "绝对数据安全",

    keysTag: "键盘流神操作",
    keysTitle: "双手不离键盘，盲打即完成挑片与调色",
    keysTip: "点击或直接按下物理键盘体验触发：",

    secBadge: "数据资产至高无上",
    secTitle: "不可逾越的 4 道数据安全红线",
    sec1: "源照片物理只读：绝不修改、重命名或向源目录写入元数据",
    sec2: "导出防覆盖隔离：严格禁止导出至源目录，遇重名智能重命名",
    sec3: "SHA-256 完整性校验：导出文件经过多重哈希校验确保不掉帧",
    sec4: "纯本地离线隐私：不依赖任何云端，零上传，100% 本地运行",

    faqTitle: "macOS 首次安装提示解决指南",
    faq1Q: "为什么首次打开提示「无法验证开发者」或「已移入废纸篓」？",
    faq1A: "由于 QuickPick 为独立开源项目，未向苹果支付商业证书年费，属于 macOS Gatekeeper 正常拦截。只需打开系统终端，运行上方提供的放行命令：xattr -cr /Applications/QuickPick.app 即可秒级开启。",
    faq2Q: "支持 Windows 和 Intel Mac 吗？",
    faq2A: "目前 GitHub Releases 提供编译好的 macOS Apple Silicon (M1/M2/M3/M4) DMG 安装包。Windows 与 Intel Mac 正在适配准备中，开发者也可通过 README 指引本地编译体验。",

    footerDesc: "专为摄影师与修图师打造的本地极速选片与美学工作台。极致安全，极致顺手。",
    footerCol1: "产品",
    footerCol2: "资源",
    footerCol3: "关于",
    footerHome: "Johnny Boy Studio 主站",
    footerRelease: "最新版本下载",
    footerDoc: "开发与测试文档",
    footerIssues: "反馈 Bug / 建议",
    footerRights: "保留所有权利。"
  },

  en: {
    pageTitle: "QuickPick — Ultra-fast Local Photo Culling & Darkroom Workbench | Johnny Boy Studio",
    heroEyebrow: "JOHNNY BOY STUDIO · PRO DARKROOM WORKBENCH v0.2.0",
    heroTitlePrefix: "From 3,000 RAW Shots to Stunning Delivery,",
    heroTitleHighlight: "In Just a Coffee Break",
    heroSub: "Built for pro photographers and visual artists. Zero cloud upload · 100% Read-Only safety · Millisecond native LibRaw decode · Cinematic 3D LUTs and aesthetic EXIF frames.",
    btnDownloadMac: "Download for macOS (Apple Silicon)",
    btnViewGithub: "View on GitHub",
    gatekeeperTip: "macOS First-Launch Gatekeeper command:",
    copyBtn: "Copy Command",
    copiedToast: "Copied to clipboard!",

    trustReadOnly: "100% Read-Only Safety",
    trustLibRaw: "Millisecond LibRaw Native",
    trustPixi: "Pixi.js v8 Hardware Accelerated",
    trustLicense: "MIT Open Source",

    demoHeader: "Interactive Darkroom Simulation",
    demoTip: "Interact via live keyboard shortcuts or mouse clicks directly in your browser",
    demoWindowFile: "DSC06182.ARW · 4000×6000 (24.0MP) · Sony A7M4",
    demoHudFps: "120 FPS Hardware Accelerated",

    groupGrid: "Grids (O)",
    gridNone: "Off",
    gridThirds: "Thirds",
    gridSpiral: "Golden Spiral",
    gridRatio: "Phi Grid",
    gridDiagonal: "Diagonal",
    gridCross: "Horizon Cross",

    groupLut: "Color Style (L/B)",
    lutRaw: "RAW Straight",
    lutPortra: "Portra 400",
    lutChrome: "Classic Chrome",
    lutLeica: "Leica High Contrast B&W (B)",

    groupFrame: "EXIF Frames (E)",
    frameNone: "None",
    frame1: "1 Classic White",
    frame2: "2 Obsidian",
    frame3: "3 Amber Gold",
    frame4: "4 Cinema Scope",
    frame5: "5 Polaroid",

    bentoTag: "Core Highlights",
    bentoTitle: "Engineered for Speed, Crafted for Aesthetics & Safety",

    bento1Title: "⚡ Blink & Blur Funnel",
    bento1Desc: "AI screens closed eyes (Eye-Aspect-Ratio), severe blur (Laplacian variance), and burst redundancy. Selected keepers are locked with a Gold Shield to prevent accidental deletion, backed by Cmd+Z atomic undo.",
    bento1Badge: "AI Defect Triage · Keeper Shield",

    bento2Title: "📐 5 Classic Composition Grids",
    bento2Desc: "Rule of Thirds, Fibonacci Golden Spiral (Shift+O 4-quadrant rotation), Golden Ratio Phi grid, Diagonal Symmetry, and Level Crosshairs. Rendered via Pixi.js v8 with constant 1.25px physical sharpness.",
    bento2Badge: "Pixi.js Accelerated",

    bento3Title: "🎨 EXIF Parameter Frames & Workbench",
    bento3Desc: "Instant hotkey E. 6 IP-compliant fine art frames with geometric aperture insignias. Auto Tone Engine for Rec.709/sRGB mapping, plus Cmd+C to copy high-res framed photos directly to clipboard or AirDrop.",
    bento3Badge: "100% Commercial IP Compliant",

    bento4Title: "🎞️ 3D LUT Film Emulation",
    bento4Desc: "Built-in Kodak Portra, Fuji Classic Chrome, and Leica High-Contrast B&W. Import custom .cube files with multi-threaded Rust and WebGPU rendering at ultra-fluid 60–120 FPS.",
    bento4Badge: "Fluid 120 FPS LUTs",

    bento5Title: "👥 Storyline & Family Radar",
    bento5Desc: "Essential for weddings and events. Automatic scenario segment quotas, VIP attendee radar scoreboard, 1v1 Burst Elimination (P), and 100% Face Closeup Drawer (F).",
    bento5Badge: "Pro Event Workflow",

    bento6Title: "🔒 Absolute Read-Only Security Line",
    bento6Desc: "Your source directory remains physically read-only throughout the lifecycle. No writes, no lock files, no cache pollution. SHA-256 verified export strictly bans destination overwrite.",
    bento6Badge: "Guaranteed Zero Corruption",

    keysTag: "Keyboard-Driven Flow",
    keysTitle: "Hands on Keyboard, Blind-Typing Culling & Grading",
    keysTip: "Click any key or press physical keys on your keyboard:",

    secBadge: "Integrity Above All",
    secTitle: "4 Inviolable Safety Redlines",
    sec1: "Physical Read-Only Source: Zero edits, renames, or metadata writes in your photo folder",
    sec2: "Destination Overwrite Defense: Strictly prohibits selecting source folders as export target",
    sec3: "SHA-256 Hash Verification: Multi-tier checksums ensure uncompromised file integrity",
    sec4: "100% Local & Offline Privacy: No cloud dependency, zero data upload, runs entirely locally",

    faqTitle: "macOS First Launch Gatekeeper Guide",
    faq1Q: "Why does macOS say 'Cannot verify developer' or 'Moved to Trash'?",
    faq1A: "QuickPick is an open-source tool without Apple's costly annual certificate notarization. This is standard Gatekeeper behavior. Simply run the one-line command: xattr -cr /Applications/QuickPick.app in Terminal to open immediately.",
    faq2Q: "Are Windows and Intel Macs supported?",
    faq2A: "Our GitHub Releases provide the compiled macOS Apple Silicon (M1/M2/M3/M4) DMG. Windows and Intel Mac builds are underway, and developers can also build locally following our README instructions.",

    footerDesc: "The ultra-fast local photo culling & darkroom workbench for photographers. Built with uncompromising safety and craft.",
    footerCol1: "Product",
    footerCol2: "Resources",
    footerCol3: "About",
    footerHome: "Johnny Boy Studio",
    footerRelease: "Latest Releases",
    footerDoc: "Architecture & Baselines",
    footerIssues: "Report Bug / Feature Request",
    footerRights: "All rights reserved."
  }
};

// Current State
let currentLang = 'zh';
let currentGrid = 'thirds';
let spiralRotation = 0; // 0, 90, 180, 270
let currentLut = 'portra';
let currentFrame = 'classic-white';
let currentTriage = 'selected'; // 'none', 'selected', 'maybe', 'rejected'
let isPeeking = false;

const PHOTOS = [
  {
    id: 1,
    src: 'sample1.jpg',
    file: 'DSC06182.ARW · 4000×6000 (24.0MP) · Sony A7M4',
    camera: 'SONY ILCE-7M4',
    lens: 'FE 50mm F1.2 GM',
    params: { focal: '50mm', aperture: 'f/1.4', shutter: '1/250s', iso: 'ISO 400' },
    triage: 'selected',
    width: 360,
    height: 540,
  },
  {
    id: 2,
    src: 'sample2.jpg',
    file: 'DSC06183.ARW · 4000×6000 (24.0MP) · Sony A7M4',
    camera: 'SONY ILCE-7M4',
    lens: 'FE 50mm F1.2 GM',
    params: { focal: '50mm', aperture: 'f/1.8', shutter: '1/320s', iso: 'ISO 500' },
    triage: 'selected',
    width: 360,
    height: 540,
  },
  {
    id: 3,
    src: 'sample3.jpg',
    file: 'DSC06190.ARW · 4000×6000 (24.0MP) · Sony A7M4',
    camera: 'SONY ILCE-7M4',
    lens: 'FE 35mm F1.4 GM',
    params: { focal: '35mm', aperture: 'f/2.0', shutter: '1/160s', iso: 'ISO 200' },
    triage: 'maybe',
    width: 390,
    height: 520,
  }
];

let currentPhotoIdx = 0;

// DOM Elements
const elements = {
  langOpts: document.querySelectorAll('.lang-opt'),
  copyBtn: document.getElementById('copyGatekeeperBtn'),
  copyCode: document.getElementById('gatekeeperCmd'),
  toast: document.getElementById('toast'),
  
  // Demo Elements
  sampleImg: document.getElementById('samplePhotoImg'),
  frameWrap: document.getElementById('sampleFrameWrap'),
  gridSvg: document.getElementById('gridSvgOverlay'),
  triageBadge: document.getElementById('triageHudBadge'),
  peekHud: document.getElementById('peekOverlayHud'),
  
  // Tool pills
  gridPills: document.querySelectorAll('[data-grid]'),
  lutPills: document.querySelectorAll('[data-lut]'),
  framePills: document.querySelectorAll('[data-frame]'),
  
  // Filmstrip & Nav
  prevBtn: document.getElementById('canvasPrevBtn'),
  nextBtn: document.getElementById('canvasNextBtn'),
  thumbs: document.querySelectorAll('.thumb-item'),
  counter: document.getElementById('filmstripCounter'),
  demoWindowFile: document.querySelector('[data-i18n="demoWindowFile"]'),
  exifCamera: document.getElementById('exifCameraName'),
  exifLens: document.getElementById('exifLensSpec'),
  exifParams: document.getElementById('exifParams'),

  // Keys
  keycaps: document.querySelectorAll('.keycap'),
  keyDisplay: document.getElementById('keyActionDisplay')
};

// SVG Paths for Composition Grids
function renderGridSvg(type, customW, customH) {
  if (type === 'none') {
    elements.gridSvg.innerHTML = '';
    return;
  }
  
  const width = customW || (PHOTOS[currentPhotoIdx] ? PHOTOS[currentPhotoIdx].width : 360);
  const height = customH || (PHOTOS[currentPhotoIdx] ? PHOTOS[currentPhotoIdx].height : 540);
  const strokeColor = '#f59e0b';
  const strokeWidth = '1.25';
  
  let content = '';
  
  if (type === 'thirds') {
    // 3x3 Rule of Thirds with 4 power points
    const x1 = width / 3;
    const x2 = (width * 2) / 3;
    const y1 = height / 3;
    const y2 = (height * 2) / 3;
    
    content = `
      <line x1="${x1}" y1="0" x2="${x1}" y2="${height}" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="0.8" />
      <line x1="${x2}" y1="0" x2="${x2}" y2="${height}" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="0.8" />
      <line x1="0" y1="${y1}" x2="${width}" y2="${y1}" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="0.8" />
      <line x1="0" y1="${y2}" x2="${width}" y2="${y2}" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="0.8" />
      
      <!-- 4 Golden Power Points -->
      <circle cx="${x1}" cy="${y1}" r="4" fill="${strokeColor}" opacity="0.9" />
      <circle cx="${x1}" cy="${y1}" r="8" fill="none" stroke="${strokeColor}" stroke-width="1" opacity="0.5" />
      
      <circle cx="${x2}" cy="${y1}" r="4" fill="${strokeColor}" opacity="0.9" />
      <circle cx="${x2}" cy="${y1}" r="8" fill="none" stroke="${strokeColor}" stroke-width="1" opacity="0.5" />
      
      <circle cx="${x1}" cy="${y2}" r="4" fill="${strokeColor}" opacity="0.9" />
      <circle cx="${x1}" cy="${y2}" r="8" fill="none" stroke="${strokeColor}" stroke-width="1" opacity="0.5" />
      
      <circle cx="${x2}" cy="${y2}" r="4" fill="${strokeColor}" opacity="0.9" />
      <circle cx="${x2}" cy="${y2}" r="8" fill="none" stroke="${strokeColor}" stroke-width="1" opacity="0.5" />
    `;
  } else if (type === 'golden_spiral') {
    // Fibonacci Golden Spiral (Portrait)
    const rot = spiralRotation;
    content = `
      <g transform="rotate(${rot} ${width/2} ${height/2})">
        <path d="M 0,0 L ${width},0 L ${width},${height} L 0,${height} Z" fill="none" stroke="${strokeColor}" stroke-width="1" opacity="0.3"/>
        <line x1="0" y1="${height * 0.666}" x2="${width}" y2="${height * 0.666}" stroke="${strokeColor}" stroke-width="1" opacity="0.4" />
        <line x1="${width * 0.618}" y1="${height * 0.666}" x2="${width * 0.618}" y2="${height}" stroke="${strokeColor}" stroke-width="1" opacity="0.4" />
        <path d="M 0,0 A ${width},${width} 0 0,1 ${width},${width} A ${height - width},${height - width} 0 0,1 ${width * 0.5},${height} A 120,120 0 0,1 ${width * 0.618},${height * 0.75}" 
              fill="none" stroke="${strokeColor}" stroke-width="1.8" stroke-linecap="round" opacity="0.9" />
      </g>
    `;
  } else if (type === 'golden_ratio') {
    // 1 : 0.618 : 1 Phi Grid
    const x1 = width * 0.382;
    const x2 = width * 0.618;
    const y1 = height * 0.382;
    const y2 = height * 0.618;
    content = `
      <line x1="${x1}" y1="0" x2="${x1}" y2="${height}" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="0.8" />
      <line x1="${x2}" y1="0" x2="${x2}" y2="${height}" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="0.8" />
      <line x1="0" y1="${y1}" x2="${width}" y2="${y1}" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="0.8" />
      <line x1="0" y1="${y2}" x2="${width}" y2="${y2}" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="0.8" />
    `;
  } else if (type === 'diagonal') {
    // Dynamic Symmetry
    content = `
      <line x1="0" y1="0" x2="${width}" y2="${height}" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="0.8" />
      <line x1="0" y1="${height}" x2="${width}" y2="0" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="0.8" />
      <line x1="0" y1="${height}" x2="${width * 0.618}" y2="0" stroke="${strokeColor}" stroke-width="1" opacity="0.4" stroke-dasharray="4,4" />
      <line x1="${width * 0.382}" y1="${height}" x2="${width}" y2="0" stroke="${strokeColor}" stroke-width="1" opacity="0.4" stroke-dasharray="4,4" />
    `;
  } else if (type === 'crosshair') {
    // Center Crosshair & Horizon with mm ticks
    const cx = width / 2;
    const cy = height / 2;
    let ticks = '';
    for (let x = 40; x <= width - 40; x += 20) {
      const h = (x === cx) ? 14 : ((x - cx) % 80 === 0 ? 8 : 4);
      ticks += `<line x1="${x}" y1="${cy - h}" x2="${x}" y2="${cy + h}" stroke="${strokeColor}" stroke-width="1" opacity="0.6"/>`;
    }
    content = `
      <line x1="20" y1="${cy}" x2="${width - 20}" y2="${cy}" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="0.85" />
      <line x1="${cx}" y1="30" x2="${cx}" y2="${height - 30}" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="0.85" />
      <circle cx="${cx}" cy="${cy}" r="24" fill="none" stroke="${strokeColor}" stroke-width="1.2" opacity="0.8" />
      <circle cx="${cx}" cy="${cy}" r="3" fill="${strokeColor}" opacity="0.9" />
      ${ticks}
    `;
  }
  
  elements.gridSvg.innerHTML = content;
}

// LUT Filter Update
function updateLut(lut) {
  currentLut = lut;
  elements.lutPills.forEach(p => p.classList.toggle('active', p.getAttribute('data-lut') === lut));
  
  if (isPeeking) {
    elements.sampleImg.style.filter = 'none';
    elements.peekHud.style.display = 'block';
    return;
  }
  
  elements.peekHud.style.display = 'none';
  
  if (lut === 'raw') {
    elements.sampleImg.style.filter = 'contrast(0.92) saturate(0.9)';
  } else if (lut === 'portra') {
    // Warm, highlight rolled off, saturated skin tones
    elements.sampleImg.style.filter = 'contrast(1.06) brightness(1.03) saturate(1.15) sepia(0.08) hue-rotate(-3deg)';
  } else if (lut === 'chrome') {
    // Fuji Classic Chrome: hard contrast, muted blues/greens, calm tones
    elements.sampleImg.style.filter = 'contrast(1.18) saturate(0.85) brightness(0.98)';
  } else if (lut === 'leica-bw') {
    // Leica High Contrast B&W
    elements.sampleImg.style.filter = 'grayscale(100%) contrast(1.45) brightness(0.95)';
  }
}

// Frame Update
function updateFrame(frame) {
  currentFrame = frame;
  elements.framePills.forEach(p => p.classList.toggle('active', p.getAttribute('data-frame') === frame));
  
  elements.frameWrap.className = 'sample-photo-frame';
  if (frame !== 'none') {
    elements.frameWrap.classList.add(`frame-${frame}`);
  } else {
    elements.frameWrap.classList.add('frame-none');
  }
  
  const exifBar = document.getElementById('frameExifBar');
  if (exifBar) {
    exifBar.style.display = (frame === 'none') ? 'none' : 'flex';
  }
}

// Triage Badge Update
function updateTriage(triage) {
  currentTriage = triage;
  elements.triageBadge.className = 'triage-hud';
  
  if (triage === 'selected') {
    elements.triageBadge.classList.add('triage-selected');
    elements.triageBadge.innerHTML = '🛡️ SELECTED (金标保护)';
  } else if (triage === 'maybe') {
    elements.triageBadge.classList.add('triage-maybe');
    elements.triageBadge.innerHTML = '⭐ MAYBE (待定)';
  } else if (triage === 'rejected') {
    elements.triageBadge.classList.add('triage-rejected');
    elements.triageBadge.innerHTML = '❌ REJECTED (排除)';
  } else {
    elements.triageBadge.style.display = 'none';
    return;
  }
  elements.triageBadge.style.display = 'flex';
}

// Photo Switcher
function switchPhoto(idx) {
  if (idx < 0) idx = PHOTOS.length - 1;
  if (idx >= PHOTOS.length) idx = 0;
  currentPhotoIdx = idx;
  const photo = PHOTOS[idx];
  
  elements.sampleImg.src = photo.src;
  
  if (elements.demoWindowFile) {
    elements.demoWindowFile.textContent = photo.file;
  }
  if (elements.exifCamera) elements.exifCamera.textContent = photo.camera;
  if (elements.exifLens) elements.exifLens.textContent = photo.lens;
  if (elements.exifParams) {
    elements.exifParams.innerHTML = `
      <span>${photo.params.focal}</span>
      <span>${photo.params.aperture}</span>
      <span>${photo.params.shutter}</span>
      <span>${photo.params.iso}</span>
    `;
  }
  
  if (elements.counter) {
    elements.counter.textContent = `${idx + 1} / ${PHOTOS.length}`;
  }
  
  elements.thumbs.forEach((t, i) => {
    t.classList.toggle('active', i === idx);
  });
  
  const imgContainer = document.querySelector('.sample-img-container');
  if (imgContainer) {
    imgContainer.style.width = `${photo.width}px`;
    imgContainer.style.height = `${photo.height}px`;
  }
  if (elements.gridSvg) {
    elements.gridSvg.setAttribute('viewBox', `0 0 ${photo.width} ${photo.height}`);
  }
  
  renderGridSvg(currentGrid, photo.width, photo.height);
  updateTriage(photo.triage);
}

// Language Switch
function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('quickpick_lang', lang);
  
  elements.langOpts.forEach(opt => {
    opt.classList.toggle('active', opt.getAttribute('data-lang') === lang);
  });
  
  const dict = I18N[lang];
  document.title = dict.pageTitle;
  
  // Replace elements with data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });
  
  // Update Triage Label text
  updateTriage(currentTriage);
}

// Setup Event Listeners
function initEvents() {
  // Photo Switcher Events
  if (elements.prevBtn) {
    elements.prevBtn.addEventListener('click', () => {
      switchPhoto(currentPhotoIdx - 1);
      highlightKeycap('ArrowLeft');
      showKeyAction(`← / K: Previous Photo (${currentPhotoIdx + 1}/${PHOTOS.length})`);
    });
  }
  if (elements.nextBtn) {
    elements.nextBtn.addEventListener('click', () => {
      switchPhoto(currentPhotoIdx + 1);
      highlightKeycap('ArrowRight');
      showKeyAction(`→ / J: Next Photo (${currentPhotoIdx + 1}/${PHOTOS.length})`);
    });
  }
  elements.thumbs.forEach(thumb => {
    thumb.addEventListener('click', () => {
      const idx = parseInt(thumb.getAttribute('data-photo-idx') || '0', 10);
      switchPhoto(idx);
      showKeyAction(`Select Photo -> ${PHOTOS[idx].file.split(' · ')[0]}`);
    });
  });

  // Lang Switch
  elements.langOpts.forEach(opt => {
    opt.addEventListener('click', () => {
      setLanguage(opt.getAttribute('data-lang'));
    });
  });
  
  // Copy Gatekeeper Command
  if (elements.copyBtn) {
    elements.copyBtn.addEventListener('click', () => {
      const code = 'xattr -cr /Applications/QuickPick.app';
      navigator.clipboard.writeText(code).then(() => {
        elements.toast.textContent = I18N[currentLang].copiedToast;
        elements.toast.classList.add('show');
        setTimeout(() => elements.toast.classList.remove('show'), 2200);
      });
    });
  }
  
  // Grid Pills
  elements.gridPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const g = pill.getAttribute('data-grid');
      currentGrid = g;
      elements.gridPills.forEach(p => p.classList.toggle('active', p === pill));
      renderGridSvg(currentGrid);
      showKeyAction(`Grid -> ${g.toUpperCase()}`);
    });
  });
  
  // LUT Pills
  elements.lutPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const l = pill.getAttribute('data-lut');
      updateLut(l);
      showKeyAction(`LUT -> ${l.toUpperCase()}`);
    });
  });
  
  // Frame Pills
  elements.framePills.forEach(pill => {
    pill.addEventListener('click', () => {
      const f = pill.getAttribute('data-frame');
      updateFrame(f);
      showKeyAction(`Frame -> ${f.toUpperCase()}`);
    });
  });
  
  // Keycaps click
  elements.keycaps.forEach(cap => {
    cap.addEventListener('click', () => {
      const key = cap.getAttribute('data-key');
      simulateKey(key);
    });
  });
  
  // Physical Keyboard Handler
  window.addEventListener('keydown', (e) => {
    // Avoid interfering if user is focused on an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    const key = e.key.toUpperCase();
    
    // Check for Shift + O (Rotate Golden Spiral)
    if (e.shiftKey && key === 'O') {
      e.preventDefault();
      spiralRotation = (spiralRotation + 90) % 360;
      currentGrid = 'golden_spiral';
      elements.gridPills.forEach(p => p.classList.toggle('active', p.getAttribute('data-grid') === 'golden_spiral'));
      renderGridSvg(currentGrid);
      highlightKeycap('O');
      showKeyAction(`Shift + O: Rotate Golden Spiral (${spiralRotation}°)`);
      return;
    }
    
    if (e.key === 'ArrowLeft' || key === 'K') {
      e.preventDefault();
      switchPhoto(currentPhotoIdx - 1);
      highlightKeycap('ArrowLeft');
      showKeyAction(`← / K: Previous Photo (${currentPhotoIdx + 1}/${PHOTOS.length})`);
      return;
    } else if (e.key === 'ArrowRight' || key === 'J') {
      e.preventDefault();
      switchPhoto(currentPhotoIdx + 1);
      highlightKeycap('ArrowRight');
      showKeyAction(`→ / J: Next Photo (${currentPhotoIdx + 1}/${PHOTOS.length})`);
      return;
    }

    if (key === 'O') {
      e.preventDefault();
      cycleGrid();
      highlightKeycap('O');
    } else if (key === 'L') {
      e.preventDefault();
      cycleLut();
      highlightKeycap('L');
    } else if (key === 'B') {
      e.preventDefault();
      updateLut('leica-bw');
      highlightKeycap('B');
      showKeyAction('B: Leica High Contrast B&W (徕卡黑白)');
    } else if (key === '\\') {
      e.preventDefault();
      isPeeking = true;
      updateLut(currentLut);
      highlightKeycap('\\');
      showKeyAction('\\: Hold to Compare Original RAW (查看原片对比)');
    } else if (key === ' ') {
      e.preventDefault();
      updateTriage(currentTriage === 'selected' ? 'none' : 'selected');
      highlightKeycap('Space');
      showKeyAction('Space: Toggle Pick (选择/取消选择)');
    } else if (key === 'M') {
      e.preventDefault();
      updateTriage('maybe');
      highlightKeycap('M');
      showKeyAction('M: Mark as Maybe (待考虑)');
    } else if (key === 'N') {
      e.preventDefault();
      updateTriage('rejected');
      highlightKeycap('N');
      showKeyAction('N: Reject Photo (排除)');
    } else if (key === 'E') {
      e.preventDefault();
      updateFrame(currentFrame === 'none' ? 'classic-white' : 'none');
      highlightKeycap('E');
      showKeyAction('E: Toggle Frame & Tone Workbench (相框工作台)');
    } else if (key >= '1' && key <= '5') {
      const frames = ['classic-white', 'obsidian-black', 'amber-minimal', 'cinematic-scope', 'retro-polaroid'];
      const idx = parseInt(key) - 1;
      if (frames[idx]) {
        updateFrame(frames[idx]);
        showKeyAction(`${key}: Frame Template -> ${frames[idx]}`);
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === '\\') {
      isPeeking = false;
      updateLut(currentLut);
    }
  });
}

function cycleGrid() {
  const grids = ['none', 'thirds', 'golden_spiral', 'golden_ratio', 'diagonal', 'crosshair'];
  const nextIdx = (grids.indexOf(currentGrid) + 1) % grids.length;
  currentGrid = grids[nextIdx];
  elements.gridPills.forEach(p => p.classList.toggle('active', p.getAttribute('data-grid') === currentGrid));
  renderGridSvg(currentGrid);
  showKeyAction(`O: Cycle Grid -> ${currentGrid.toUpperCase()}`);
}

function cycleLut() {
  const luts = ['raw', 'portra', 'chrome', 'leica-bw'];
  const nextIdx = (luts.indexOf(currentLut) + 1) % luts.length;
  updateLut(luts[nextIdx]);
  showKeyAction(`L: Film LUT -> ${luts[nextIdx].toUpperCase()}`);
}

function simulateKey(key) {
  if (key === 'ArrowLeft') {
    switchPhoto(currentPhotoIdx - 1);
    showKeyAction(`← / K: Previous Photo (${currentPhotoIdx + 1}/${PHOTOS.length})`);
  } else if (key === 'ArrowRight') {
    switchPhoto(currentPhotoIdx + 1);
    showKeyAction(`→ / J: Next Photo (${currentPhotoIdx + 1}/${PHOTOS.length})`);
  } else if (key === 'O') {
    cycleGrid();
  } else if (key === 'L') {
    cycleLut();
  } else if (key === 'B') {
    updateLut('leica-bw');
    showKeyAction('B: Leica High Contrast B&W (徕卡黑白)');
  } else if (key === 'Space') {
    updateTriage(currentTriage === 'selected' ? 'none' : 'selected');
    showKeyAction('Space: Toggle Pick (选择/取消选择)');
  } else if (key === 'M') {
    updateTriage('maybe');
    showKeyAction('M: Mark as Maybe (待考虑)');
  } else if (key === 'N') {
    updateTriage('rejected');
    showKeyAction('N: Reject Photo (排除)');
  } else if (key === 'E') {
    updateFrame(currentFrame === 'none' ? 'classic-white' : 'none');
    showKeyAction('E: Toggle Frame & Adjust (相框开关)');
  } else if (key === 'P') {
    showKeyAction('P: Burst Knockout Duel (连拍两两淘汰对决)');
  } else if (key === 'F') {
    showKeyAction('F: Face Close-up Drawer (人物面部100%特写抽屉)');
  } else if (key === 'Z') {
    showKeyAction('Z: 100% Sensor Zoom / Fit (100%真实像素查焦)');
  }
  highlightKeycap(key);
}

function highlightKeycap(key) {
  elements.keycaps.forEach(cap => {
    if (cap.getAttribute('data-key') === key) {
      cap.classList.add('pressed');
      setTimeout(() => cap.classList.remove('pressed'), 250);
    }
  });
}

function showKeyAction(text) {
  if (elements.keyDisplay) {
    elements.keyDisplay.innerHTML = `<span class="accent">⚡ Action:</span> ${text}`;
  }
}

// Initial Run
window.addEventListener('DOMContentLoaded', () => {
  const savedLang = localStorage.getItem('quickpick_lang');
  const browserLang = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  setLanguage(savedLang || browserLang);
  
  switchPhoto(0);
  updateLut(currentLut);
  updateFrame(currentFrame);
  initEvents();
});
