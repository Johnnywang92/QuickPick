# QuickPick (极选)

> 高性能、全平台（Windows / macOS / NAS）婚纱摄影与外拍照片粗筛、自动筛、人工复选系统。

## 项目核心文档

- 📘 **[完整技术架构与工业级开发方案 (V3.1 锁定版)](./DEVELOPMENT_PLAN.md)**
  - 系统总体架构（Tauri v2 + Rust + WebGL/PixiJS + ONNX Runtime）
  - RAW 图像引擎与 LGPL 商业合规（LibRaw 动态链接 + 800px 自适应预览）
  - NAS / SMB 局域网分布式文件锁机制（带租约哨兵锁、心跳续租、TOCTOU 防竞态与自愈）
  - AI 筛选预设与严格量纲归一化 Face Priority 算法
  - 双轨研发排期表（工程轨 vs 商务协调轨）与交付清单
