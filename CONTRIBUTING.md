# QuickPick 参与贡献指引 (Contributing Guidelines)

感谢你对 QuickPick（极选）的关注与支持！我们非常欢迎社区伙伴提交 Issue、反馈使用体验、提出新功能建议或直接提交代码 Pull Request (PR)。

---

## 核心开发红线 (Non-negotiable Invariants)

在开始贡献代码前，请务必了解本项目的**核心安全原则**：

1. **原片源目录绝对只读**：扫描、浏览、分析、选片与复核全流程严禁对源照片进行任何写操作（不修改、不移动、不删除、不重命名源文件，不向源目录写入锁、缓存或项目文件）。
2. **LGPL 动态库隔离**：底层 RAW 解码组件 LibRaw 必须以动态共享库（`.dylib` / `.dll`）形式加载，严禁将其静态编译混入闭源或 MIT 主程序中，以维护 LGPL 2.1 合规性。
3. **确定性与稳定性**：所有状态持久化须保证原子性，任何持久化失败均须在界面明确提示，不可静默伪装“已保存”。

---

## PR 提交流程 (Pull Request Workflow)

1. **Fork 仓库**：在 GitHub 上 Fork [Johnnywang92/QuickPick](https://github.com/Johnnywang92/QuickPick) 到你的个人账号。
2. **创建分支**：基于最新的 `master` 分支创建独立特性或修复分支：
   ```bash
   git checkout -b feat/your-feature-name
   # 或修复分支
   git checkout -b fix/issue-description
   ```
3. **本地开发与测试**：
   - 参照 `README.md` 安装 Node 20+、Rust 1.75+ 以及系统动态库（`libraw`, `little-cms2`, `pkg-config`）；
   - 执行 `npm run dev` 启动前端开发或 `npm run tauri dev` 启动桌面端完整调试。
4. **运行全套质量门禁（必做）**：
   在提交 PR 前，请务必在本地运行并通过质量门禁：
   ```bash
   npm run gate
   ```
   门禁将自动执行以下检查：
   - `npm run test:ui`：前端 Vitest 单元测试；
   - `npm run build`：TypeScript 静态类型检查与 Vite 生产打包；
   - `npm run clippy`：Rust Clippy 静态代码质量检查（0 警告）；
   - `npm run test:rs`：Rust 核心引擎与安全回归单元测试；
   - `npm run baseline`：合规文件完整性与 Chunk 体积基准核验。
5. **规范提交信息 (Conventional Commits)**：
   提交信息推荐遵循 Conventional Commits 规范，例如：
   - `feat: 新增某功能`
   - `fix: 修复某问题`
   - `perf: 优化某处性能`
   - `docs: 文档补充与调整`
   - `refactor: 代码重构`
6. **发起 PR**：推送你的分支到个人 Fork 仓库，并在 GitHub 上向官方 `master` 分支发起 Pull Request。请在 PR 描述中清晰说明修改动机、改动细节及测试方法。

---

## 报告 Bug 与功能建议

- **Bug 反馈**：若发现程序崩溃、性能卡顿或异常行为，请前往 [GitHub Issues](https://github.com/Johnnywang92/QuickPick/issues) 提交，并附上操作系统版本、机型芯片、发生步骤及相关日志。
- **功能探讨**：欢迎在 Issue 中发起讨论，分享你的选片流程与实际摄影工作流痛点！
