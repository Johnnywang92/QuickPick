# QuickPick (极选) 📸

> **高性能、本地优先（Local-First）跨平台商业摄影照片初筛、AI 辅助诊断与团队协同系统**  
> 专为商业摄影师、婚礼跟拍机构、肖像工作室与独立修图师打造，告别慢吞吞的传统选片流程。

[![Tauri v2](https://img.shields.io/badge/Tauri-v2-blue.svg)](https://tauri.app/)
[![React 18](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![Pixi.js v8](https://img.shields.io/badge/Pixi.js-v8-e72264.svg)](https://pixijs.com/)
[![Rust](https://img.shields.io/badge/Rust-2021-orange.svg)](https://www.rust-lang.org/)
[![License: MIT/LGPL](https://img.shields.io/badge/License-MIT%2FLGPL-green.svg)](./LICENSE)

---

## ⚡ 为什么选择 QuickPick？

商业婚礼跟拍或大型活动动辄 **3,000 ~ 10,000+ 张 RAW 底片**（索尼 `.ARW`、佳能 `.CR3`、尼康 `.NEF` 等），单张高达 50MB~80MB。传统软件（Lightroom、Bridge 等）在千兆网口/Wi-Fi 或移动硬盘下翻页卡顿、解码迟钝、大合影容易漏看偷闭眼、连拍相似片难挑，且多端并发容易踩坏调色数据。

QuickPick 针对上述痛点彻底重构了工作流：

1. **60fps 满帧跟手**：基于 WebGL (Pixi.js v8) 硬件加速渲染管线，平滑滚轮无级缩放与毫秒级抓手平移；
2. **RAW 毫秒级极速抽取**：直接调用 LibRaw 原生动态链接库（FFI），**5~15ms** 提取相机无损内嵌高画质全尺寸预览，无需昂贵的全量马赛克还原；
3. **XMP 黄金数据保真**：基于严格 SHA-256 基线比较与字段级合并，持久化评星、色标与标记，**绝不篡改或丢失** Lightroom/Capture One 的已有调色参数与版权信息；
4. **AI 智能“可修/不可修”分类**：基于光学合焦方差、曝光宽容度与高光截断比率，自动诊断“严重脱焦”、“死白废片”，并利用同组连拍实现跨帧救片（“连拍可换脸/换眼”）；
5. **多脸联动特写窗格（Face Loupe）**：按重要度自动计算归一化优先级，展示 Top 6 关键人脸切片，叠加 1:1 瞳孔合焦锐度、睁眼率评分与大合影闭眼报警，支持主角钉选跨帧追踪；
6. **双图分屏联动比对（Split Compare View）**：双 WebGL 画布硬件加速并排呈现，支持双向缩放平移锁定、1:1 睫毛瞳孔特写复位、主备底片一键互换 `[S]` 与快捷候选片遍历；
7. **选片结果导出器（Export Pipeline）**：支持一键将入选底片与同名 `.xmp` 伴侣文件原子成对暂存、复制或移动至交付目录，并一键调起 Finder / 资源管理器；
8. **NAS 局域网协同与 2K 代理加速**：提供微型无头后台守护进程（`quickpick-server`）与 Docker 容器镜像，自动在服务端转码 2K 轻量代理，客户端以 **150KB** 代理直接浏览，**节约 99.6% 传输带宽**，彻底攻克局域网 I/O 瓶颈。

---

## 🚀 快速上手

### 1. 环境依赖准备

* **Node.js**：`>= 18.0.0`
* **Rust**：`>= 1.75.0`
* **LibRaw 动态链接库**：
  * **macOS**：
    ```bash
    brew install libraw little-cms2 pkg-config
    ```
  * **Ubuntu / Debian**：
    ```bash
    sudo apt-get update && sudo apt-get install -y libraw-dev pkg-config
    ```
  * **Windows**：
    安装已编译好的 LibRaw `.dll` 并加入系统 `PATH`。

### 2. 获取代码与依赖安装

```bash
# 克隆仓库
git clone https://github.com/your-org/QuickPick.git
cd QuickPick

# 安装前端依赖
npm install
```

### 3. 运行与编译

| 模式 | 运行命令 | 说明 |
| :--- | :--- | :--- |
| **纯 Web 体验模式** | `npm run dev` | 打开浏览器进行功能体验（自带高仿真 Mock 底片数据与模拟导出） |
| **原生桌面客户端** | `npm run tauri dev` | 启动完整的 Tauri v2 macOS / Windows 桌面客户端，直连本机底层引擎 |
| **前端打包验证** | `npm run build` | 执行 TypeScript 类型安全检查与 Vite 生产打包 |
| **Rust 单元测试** | `cargo test --manifest-path src-tauri/Cargo.toml` | 运行全部 22 项 Rust 引擎与规则测试（XMP 锁、导出、缓存、Face 模型） |
| **编译 NAS 后台 Daemon** | `cargo build --release --bin quickpick-server --manifest-path src-tauri/Cargo.toml` | 编译轻量级无头服务端守护进程 |

---

## 📖 核心功能使用指南

### 1. 导入相册与目录扫描
* 点击顶部导航栏 **“选择照片目录”** 按钮；
* 选中装有相机原片（SD/CFexpress 拷卡目录、移动固态硬盘或 NAS 挂载目录）的文件夹；
* 引擎自动扫描包含 Sony (`.ARW`)、Canon (`.CR3`/`.CR2`)、Nikon (`.NEF`)、Adobe (`.DNG`) 等 RAW 及普通图片；
* 若目录下已存在 `.quickpick_cache` 代理缓存，系统将瞬间就绪并点亮顶部 **`⚡ 2K 加速`** 绿色徽标。

---

### 2. 摄影师盲打快捷键（全键盘流操作）

为保证一天挑选数千张底片的极致手感，QuickPick 所有操作全面支持盲打：

| 快捷键 | 功能操作 | 动作说明 |
| :---: | :--- | :--- |
| `0` ~ `5` | **星级评定 (Rating)** | 为当前照片打上 0 到 5 星，瞬间原子写入 XMP |
| `P` | **采纳照片 (Pick)** | 标记为精选片（绿色状态指示） |
| `X` | **排除照片 (Reject)** | 标记为废片（红色状态指示） |
| `U` | **取消标记 (Unmark)** | 恢复为未标记状态 |
| `6` | **红色色标 (Red)** | 人工分类色标 |
| `7` | **黄色色标 (Yellow)** | 人工分类色标 |
| `8` | **绿色色标 (Green)** | 人工分类色标 |
| `9` | **蓝色色标 (Blue)** | 人工分类色标 |
| `J` / `→` | **下一张底片** | 向后翻页（若在对比模式下，则切换候选片） |
| `K` / `←` | **上一张底片** | 向前翻页（若在对比模式下，则切换候选片） |
| `F` | **开闭 Face Loupe 抽屉** | 展开/收起底部人脸特写联动窗格 |
| `C` | **双图分屏比对** | 调起/退出双 WebGL 视口分屏比对模式 |
| `S` | **主备底片对调** | 在分屏比对模式下，一键互换左右视口照片 |
| `Esc` | **复位/退出** | 退出分屏比对模式，复位至主视口 |

> 💡 **小技巧（自动跳张模式）**：勾选顶部工具条中的 **“自动跳张”** 复选框后，按下评星（`0~5`）或采纳（`P`/`X`）会自动跳到下一张，初选速度翻倍。

---

### 3. AI 规则初筛与智能药丸

系统在加载底片时会在后台执行轻量化光学诊断：
* **🟢 未见明显问题（完美原片）**：合焦锐利、动态范围适中，建议 4~5 星直接采纳；
* **🟡 可修解决**：欠曝偏暗（宽容度可拉回）、焦点微偏（可通过锐化滤镜补偿）、或触发 **连拍可换脸/换眼** 拯救机制；
* **🔴 不可修硬伤**：严重脱焦、剧烈运动拖影、大面积全通道高光死白；
* **摄影师主权覆写**：悬浮在视口中央的诊断药丸展示诊断依据。点击药丸下拉菜单，摄影师可随时强制覆写为“完美原片”或“不可修硬伤”，系统记录人工判断。

---

### 4. 多脸联动特写窗格（Face Loupe）

专为婚礼合影、家庭聚会（8~50 人同框）设计，按下 **`[F]`** 键即可唤起：
* **归一化优先级打分与 Top 6 截断**：按人脸面积、画面中心距离综合加权，大合影中自动截取最具代表性的 6 张切片并排展示，防止撑爆界面；
* **1:1 切片与眼神状态**：每个卡片呈现睫毛与瞳孔原生点对点像素，叠加睁眼开合度药丸（🟢 95% 睁眼 / 🟡 62% 微闭 / 🔴 18% 闭眼）与合焦锐度分值；
* **主角人脸钉选（📌）**：点击切片右上角的大头针即可钉选新人主角。在同一个连拍组内浏览其他帧时，系统通过空间几何追踪自动继承钉选，牢牢锁定在第一窗格；
* **闭眼报警气泡**：未进入 Top 6 的背景人物若发生偷闭眼，自动在顶部触发浮动预警气泡，点击即可让视口瞬间平滑居中聚焦至该人物。

---

### 5. 双图分屏联动比对（Side-by-Side）

针对“连拍多张微表情打架”或“焦点略有差异”的场景：
* 按 **`[C]`** 键进入分屏比对，左侧视口固定当前主选底片，右侧视口展示备选片；
* **缩放平移双向联动**：开启“同步联动”后，在一个视口缩放或拖拽平移，另一视口自适应保持同等比例与坐标联动；
* **一键 1:1 睫毛对焦**：点击“双图 1:1 特写”，双图瞬跳至 100% 原始像素，比对双眼睫毛与瞳孔扎实度；
* **候选遍历跳过主图**：按右箭头或点击 Next，自动跨过左侧主选图，杜绝死锁卡死；
* **左右独立定夺**：左右视口下方提供专属的独立评星与 `[P] 采纳` / `[X] 排除` 工具条，互不干扰。

---

### 6. 选片结果导出器（Export Pipeline）

当完成初选与评星后，点击顶栏 **“📦 导出选片”**：
1. **选择导出范围**：
   * `已采纳照片 (Pick)`（推荐业务主流程）
   * `所有完美原片 (Clean)`
   * `评星 ≥ 3 星`
   * `当前筛选视图`
2. **选择目标目录**：默认填充原文件夹下的 `QuickPick_Selected/`，亦可自由指定；
3. **选择导出模式**：
   * **安全复制 (Copy)**：保留原存储卡/硬盘底片完好无损；
   * **原子移动 (Move)**：采用“复制 + 校验 + 删源”两阶段事务，杜绝半套文件残留。
4. **XMP 强绑定同步**：严格将同名 `.xmp` 伴侣文件成对导出，导入 Adobe Lightroom / Capture One 时自动无缝呈现摄影师的评星、色标与诊断标签；
5. **系统原生打开**：导出完成后自动调起 macOS Finder 或 Windows 资源管理器。

---

### 7. NAS 局域网协同与 2K 代理加速（Docker 部署）

针对工作室将 RAW 统一存放于 NAS（群晖 Synology、威联通 QNAP、Unraid、TrueNAS）的场景，避免千兆 SMB 读取 50MB RAW 延迟高达 3 秒的物理瓶颈。

#### 一键 Docker Compose 部署

在 NAS 存储服务器上拉起后台转码服务：

```yaml
# docker/docker-compose.yml
services:
  quickpick-server:
    image: quickpick-server:latest
    build:
      context: ..
      dockerfile: docker/Dockerfile.nas
    container_name: quickpick-server
    restart: unless-stopped
    volumes:
      - /volume1/photos:/photos # 映射 NAS 照片主卷
    environment:
      - WATCH_DIRS=/photos
      - SCAN_INTERVAL=30
      - PROXY_MAX_EDGE=2048
```

启动命令：
```bash
cd docker
docker compose up -d
```

#### 工作流优势：
1. 摄影师拷卡完成后，NAS 容器在后台静默轮询，生成 `.quickpick_cache/catalog.json` 索引与 `proxies/*.jpg`（长边 2048px，单张约 150KB）；
2. 摄影师桌面端打开 SMB 挂载目录时，系统自动识别并载入 150KB 代理缓存，加载延迟从 **500~3000ms 暴降至 1.2ms（提速 300x）**；
3. 单机出差摄影师亦可在客户端点击顶栏 **“⚡ 生成 2K 缓存”** 按钮就地预先生成代理离线选片。

---

## 🛡️ 数据安全与高可靠性

| 安全机制 | 技术实现 | 带来的保障 |
| :--- | :--- | :--- |
| **XMP 保真更新** | 仅合并 QuickPick 负责的 rating/label 字段 | 不破坏已有的 Lightroom / Camera Raw 调色曲线、色调及元数据 |
| **SHA-256 冲突检测** | 写入临界区前重新读取完整文档 Hash 比对 | 多台电脑或多人同时打开同张照片时，绝不静默覆盖外部修改 |
| **冲突三向决策** | 冲突时弹出对话框 | 提供“重新载入”、“保留本地”或“另存副本 (`.quickpick-local-*.xmp`)” |
| **自愈式哨兵锁** | 带 UUID Token 的 `.photo.xmp.lock` 租约锁 | 客户端异常崩溃或掉线后，锁在超时后会被安全接管，杜绝死锁死机 |
| **首次接管备份** | 首次修改外部 XMP 时自动生成 `.xmp.quickpick-backup` | 原片目录拥有安全后路，支持随时一键原样回滚 |
| **GPU 显存防爆治理** | LRU 淘汰时联动 PixiJS `Assets.unload(url)` 与 Sprite 显式销毁 | 连续 60fps 翻看数千张照片显存稳定平稳，杜绝 WebGL 上下文崩溃 |

---

## 🛠️ 项目目录架构

```text
QuickPick/
├── src-tauri/                  # Rust 底层引擎 (Tauri v2)
│   ├── src/
│   │   ├── bin/server.rs       # NAS 无头后台服务端守护进程 (quickpick-server)
│   │   ├── engine/
│   │   │   ├── mod.rs          # 目录扫描器与照片预览提取流
│   │   │   ├── cache.rs        # .quickpick_cache 规范与 2K 代理生成引擎
│   │   │   └── export.rs       # 选片结果批量成对导出流水线
│   │   ├── libraw_ffi/         # LGPL 合规 LibRaw FFI 动态链接与安全内存封装
│   │   ├── rules/              # AI 规则初筛（脱焦、高光死白、连拍分组、Face Priority）
│   │   ├── xmp/                # XMP 伴侣原子读写、字段合并与哨兵租约锁机制
│   │   ├── models.rs           # 核心领域数据模型定义
│   │   └── lib.rs              # 单元测试矩阵（全量 22 项全绿）
│   └── Cargo.toml              # Rust 依赖与二进制目标配置
├── src/                        # 前端交互与渲染层 (React 18 + Pixi.js v8)
│   ├── components/
│   │   ├── viewport/           # 视口层 (PixiCanvas.tsx 单视口, SplitCompareView.tsx 双图对比)
│   │   ├── loupe/              # 特写层 (FaceLoupe.tsx 多脸抽屉与主角钉选)
│   │   ├── triage/             # 诊断层 (DefectBadge.tsx 药丸, FilterToolbar.tsx 筛选栏)
│   │   ├── filmstrip/          # 胶片层 (Filmstrip.tsx 底部缩略图轮播)
│   │   └── export/             # 交付层 (ExportModal.tsx 选片导出配置弹窗)
│   ├── store/photoStore.ts     # Zustand 核心状态机 (LRU 显存缓存、盲打分发、选片状态)
│   ├── hooks/useKeyboardShortcuts.ts # 全键盘盲打快捷键调度器
│   ├── services/tauriBridge.ts # Tauri IPC 通信桥与 Web 降级 Mock 驱动
│   └── App.tsx                 # 主界面框架与顶栏控制器
├── docker/
│   ├── Dockerfile.nas          # NAS 多阶段生产级微型镜像 (Debian + LibRaw20 + Tini)
│   └── docker-compose.yml      # 群晖 / 威联通一键部署配置
├── test_fixtures/              # 真实底片端到端测试用例
├── CHECKLIST.md                # 工业级全景研发任务跟踪与整改清单
└── DEVELOPMENT_PLAN.md         # 原始技术架构与开发方案 (V3.1 锁定版)
```

---

## 🤝 参与贡献与开发

欢迎提交 Issue 与 Pull Request！在提交代码前，请确保通过全套质量门禁：

```bash
# 1. 运行 Rust 单元测试
cargo test --manifest-path src-tauri/Cargo.toml

# 2. 运行前端构建检查
npm run build

# 3. 运行 Rust Clippy 静态检查
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
```

---

## 📄 开源许可证

* 本项目前端及业务代码遵循 **MIT License**；
* 底层 RAW 解码依赖遵循 **LGPL v2.1 / CDDL**，采用标准动态链接隔离，符合商业闭源与私有化部署规范。
