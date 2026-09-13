# QuickPick（极选）

QuickPick 是面向普通用户的本地选片工具，帮助用户从摄影师交付的 RAW/JPEG 原片中完成浏览、选择、复核和安全导出。扫描、浏览、分析和选择过程不会修改、移动、覆盖或删除源照片，也不会在源目录写入项目文件、缓存、锁或伴侣文件。

## 当前能力

- 快速扫描 ARW、CR3、CR2、NEF、DNG、RAF、ORF、RW2、PEF、SRW、JPEG、PNG 和 WebP。
- 文件列表先就绪，EXIF、预览、人脸、锐度和感知哈希 (pHash) 等辅助分析在后台以有界并发运行，可取消、重试。
- 采用“时间戳 + 文件名序列 + 64-bit DCT 感知哈希”混合聚类算法识别相似连拍，防止转场误成组，并支持跨间隔或无时间戳相似照片聚合。
- 连拍组内根据锐度与人脸睁眼评分提供“组内推荐最佳”标记，双图分屏比较模式中实时展示画面视觉相似度百分比。
- 使用 PixiJS 显示预览，提供内存 LRU、磁盘缓存、相邻照片预加载和双图比较；RAW 视口会明确标注内嵌预览尺寸及“非完整 RAW 像素”。
- 使用 `未查看`、`已选`、`待考虑`、`未选择` 记录用户决定；分析提示与用户选择相互独立。
- 使用 SQLite 保存项目、选择、查看进度和界面状态，支持最近项目、源目录重新定位、周期备份和损坏恢复。
- 将所选原片安全复制到用户指定的外部目录，或原生保存 TXT、CSV、JSON 选片清单。
- 导出前检查空间和名称冲突；复制时校验源文件版本和 SHA-256，不覆盖既有目标文件，并支持取消与异常恢复。
- 可选择同时复制源目录中已经存在的同名 XMP 伴侣文件；QuickPick 只读取和复制它们，从不编辑其内容。

辅助分析只显示“可能模糊”“建议检查眼睛”“未见明显问题”“组内推荐最佳”或“无法分析”等复核提示。它不会自动选择或排除照片，也不应替代用户查看原图。

## 快捷键

| 快捷键 | 操作 |
| :---: | :--- |
| `Space` | 选择或取消选择当前照片 |
| `M` | 放入待考虑 |
| `N` | 明确标记为不选 |
| `←` / `→`（或 `K` / `J`） | 上一张 / 下一张 |
| `C` | 进入或退出双图比较 |
| `S` | 在比较模式中交换左右照片 |
| `F` | 打开或关闭人脸特写 |
| `Cmd/Ctrl + Z` | 撤销上一次选择操作 |
| `Home` / `End` | 跳到当前筛选结果首张 / 末张 |
| `Esc` | 退出比较或重置筛选 |

主要操作同时提供鼠标按钮，应用顶栏的键盘图标可随时打开完整快捷键帮助。

## 数据安全

### 源数据

- 源照片和源目录在主流程中保持只读。
- 用户决定和项目状态保存在 Tauri 应用数据目录中的 SQLite 数据库。
- 预览磁盘缓存位于应用数据目录，采用版本化 key 和 1 GiB 容量上限。
- 独立 NAS 代理服务需要显式指定缓存根目录；Docker 照片卷按只读方式挂载。

### 导出

- 复制目标必须由用户明确选择，且不能是源目录或其子目录。
- 目标存在同名文件时只允许跳过或生成唯一名称，绝不覆盖。
- 每个任务和文件状态持久化；异常退出后仅清理该任务拥有的临时文件。
- TXT/CSV/JSON 清单通过临时文件、`fsync` 和原子无覆盖提交保存。

## 开发环境

要求：

- Node.js 18 或更高版本
- Rust 1.75 或更高版本
- LibRaw 动态库和 `pkg-config`

macOS：

```bash
brew install libraw little-cms2 pkg-config
npm install
npm run tauri dev
```

Ubuntu / Debian：

```bash
sudo apt-get update
sudo apt-get install -y libraw-dev pkg-config
npm install
npm run tauri dev
```

浏览器模拟模式可使用：

```bash
npm run dev
```

模拟扫描与后台分析遵循与桌面端相同的数据边界，但不读取真实照片。

## 质量门禁

提交前运行：

```bash
npm run gate
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
git diff --check
```

`npm run gate` 会执行前端 Vitest、TypeScript 检查、Vite 生产构建、Clippy、Rust 测试和项目基线检查。Pixi 视口、双图比较、人脸窗格与导出弹窗按需加载；基线会精确检查 HTML 引用的入口 chunk，并限制任意单个 JavaScript chunk 不超过 500 KiB。

Apple Silicon 发布包在 macOS 构建机上执行：

```bash
bash scripts/bundle_macos_libs.sh
npm run tauri build -- --bundles app
npm run verify:mac-bundle
```

bundle 检查会核对 arm64 架构、`Contents/Frameworks` 动态库、可移植加载路径及 LGPL/LibRaw 许可与替换说明。正式分发仍需配置 Apple Developer ID 完成签名和公证；本地 ad-hoc 签名不等同于公证。

真实照片目录验收运行：

```bash
npm run accept:media -- /path/to/real-album --min-count 1000
```

它会输出真实格式覆盖和扫描/预览延迟，并默认用前后 SHA-256 快照证明源目录未被修改。仓库内置 JPEG 只用于工程回归，不作为真实 RAW 或千张客片验收证据。

## 代码结构

```text
QuickPick/
├── src/                         # React 前端
│   ├── components/              # 浏览、比较、复核和导出界面
│   ├── services/tauriBridge.ts  # Tauri IPC 与浏览器模拟边界
│   ├── store/                   # 相册、选择、预览、比较、分析、导出状态
│   └── types/                   # 前端领域类型
├── src-tauri/
│   ├── src/engine/              # 扫描、预览缓存和安全导出
│   ├── src/rules/               # 只供人工复核的本地分析提示
│   ├── src/project.rs           # SQLite 项目持久化与恢复
│   ├── src/models.rs            # Rust IPC/领域模型
│   └── src/main.rs              # Tauri commands
├── docker/                      # 可选 NAS 代理服务
├── docs/                        # 性能与测试说明
└── CHECKLIST.md                 # 发布优先级与验收状态
```

## 当前限制

- 真实 RAW 机型矩阵、只读介质、macOS Intel、Windows 安装包和正式代码签名/公证尚未完成发布验收。
- 人脸、闭眼、锐度和相似度提示仍需真实素材评估误报与漏报。
- 社交媒体 JPEG、完整 RAW 显影、XMP/Lightroom 编辑工作流、多人协作属于后续范围。

## 许可证

本项目基于 [MIT License](LICENSE) 开源，著作权归属于 Johnny Boy Studio (Copyright (c) 2026)。

第三方底层 RAW 图像解码组件（LibRaw）采用独立动态链接库形式加载，遵循 GNU LGPL v2.1 / CDDL 1.0 开源许可协议，详细替换与合规说明请参见 [docs/LIBRAW_REPLACEMENT.md](docs/LIBRAW_REPLACEMENT.md) 及 [LICENSES/](LICENSES/) 目录。
