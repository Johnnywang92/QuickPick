# QuickPick 性能基准规范与质量红线 (Performance & Quality Baselines)

> 最后修订: 2026-09-08  
> 适用版本: QuickPick MVP (v0.1.0+)

---

## 1. 核心性能基准指标 (KPIs)

| 场景 / 指标 | 目标基准 (Target) | 告警红线 (Red Line) | 测量方式 |
| :--- | :---: | :---: | :--- |
| **EXIF 拍摄元数据解析吞吐** | **≥ 1,000 张/秒** | < 400 张/秒 | 纯 Rust 头部极速解析 (`engine/exif.rs`) |
| **RAW 原生内嵌预览提取** | **5 ~ 15 ms/张** | > 35 ms/张 | LibRaw `dcraw_make_mem_thumb` |
| **单图翻页渲染时延** | **≤ 16.6 ms (60 FPS)** | > 33.3 ms (掉帧) | WebGL 纹理上屏与 PixiJS Render Loop |
| **主备底片瞬时闪烁比对 (Blink)** | **≤ 5 ms** | > 16.6 ms | 双视口纹理引用瞬时替换 |
| **胶片栏虚拟滚动 DOM 节点数** | **恒定 15 ~ 20 个** | > 40 个 | `Filmstrip.tsx` 动态可视区域切片 |
| **10,000 张相册常驻内存峰值** | **< 350 MB** | > 600 MB | 显存/内存 LRU 淘汰与 `Assets.unload` |
| **前端入口 JavaScript** | **< 650 KB** | > 1,024 KB | 从 `dist/index.html` 精确定位入口文件 |
| **最大 JavaScript Chunk** | **< 500 KB** | > 500 KB | Vite Rollup 生产构建输出体积 |

---

## 2. 内存与显存防爆治理准则

1. **PixiJS 显存驱逐联动**：
   - 前端 LRU 缓存保持活跃预览上限；
   - 驱逐旧缩略图时，必须显式调用 `Assets.unload(url)` 与 `destroy({ texture: true, baseTexture: true })`，严禁产生悬空 WebGL 纹理上下文。
2. **虚拟轨道自适应**：
   - 胶片栏无论载入 1,000 张还是 100,000 张底片，真实渲染的 DOM 元素只计算当前可视窗口宽度（加上前后各 5 个 Overscan 缓冲节点）。
3. **筛选相对序号映射预计算**：
   - `filteredIndexMap` 使用 `useMemo` 按需计算，在虚拟轨道滑动事件（`onScroll`）中只做 `O(1)` Map 索引查询，绝不允许每帧遍历相册。

---

## 3. 跨平台打包与分发合规准则

1. **动态库解耦 (LGPL 2.1 / 3.0)**：
   - 主执行程序必须动态链接 `libraw` 共享库（macOS: `libraw.dylib`，Windows: `libraw.dll`，Linux: `libraw.so`）；
   - macOS 采用 `@executable_path/../Frameworks` 优先的 RPATH，独立携带动态库，杜绝普通用户机器上因缺少 Homebrew 而引发的 dyld 崩溃。
2. **合规文档同捆**：
   - 安装包内必须包含 `LICENSES/LGPL-2.1.txt`、`LICENSES/LIBRAW_LICENSE.txt` 以及 `docs/LIBRAW_REPLACEMENT.md`。
   - 前端界面需常驻“关于 QuickPick 与开源合规”入口。

---

## 4. 自动化门禁测试套件

在提交代码与触发 CI 时，必须通过全套门禁：
```bash
npm run gate
```
该命令会自动串行执行：
1. `npm run build`: 前端 TypeScript 严格类型检查与生产静态构建；
2. `npm run clippy`: Rust 全目标代码静态检查，`-D warnings` 零容忍策略；
3. `npm run test:rs`: 运行 Rust 单元与集成测试（包含项目恢复、只读扫描和导出容灾）；
4. `npm run baseline`: 验证产物体积与合规资源完整性。

`npm run baseline` 中的内置照片仅用于发现工程性能回退，不能作为真实客片性能验收证据。真实 RAW/JPEG 素材使用只读验收命令：

```bash
npm run accept:media -- /path/to/real-album --min-count 1000
```

该命令默认在操作前后对源目录所有文件计算 SHA-256，验证目录内容、大小、mtime、权限及链接目标均未变化；同时输出格式覆盖、首列表、首预览、预览平均值/P95、元数据成功数和失败文件。使用 `--limit N` 可先做抽样解码，但照片总数仍按整个目录校验。`--metadata-only` 只用于大目录快速预检，不能替代发布前的完整内容校验。
