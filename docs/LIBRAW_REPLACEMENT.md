# LibRaw 动态共享库替换与合规指南 (LGPL Compliance Guide)

## 1. 概述与合规声明

QuickPick（极选）使用了开源的 [LibRaw](https://www.libraw.org/) 库用于高性能相机 RAW 格式内嵌缩略图提取与 EXIF 元数据解码。

依照 **GNU Lesser General Public License (LGPL) v2.1 第 6 节** 及 **LGPL v3.0 第 4 节** 的合规要求：
- QuickPick 采用**动态共享库链接机制**（macOS 下为 `libraw.dylib`，Windows 下为 `libraw.dll`，Linux 下为 `libraw.so`）；
- QuickPick 自身代码与业务逻辑通过动态链接调用 LibRaw，保持独立的专有版权；
- 赋予并保障所有最终用户在不重新编译 QuickPick 主程序的前提下，**自由审查、定制、重新编译并替换** LibRaw 动态共享库的权利。

---

## 2. 当前使用的 LibRaw 版本与 ABI 信息

在 QuickPick 主界面顶部状态栏中，可随时查阅当前链接的 LibRaw 版本号（例如 `LibRaw 0.22.2`）。

- **官方上游源码**：https://github.com/LibRaw/LibRaw
- **默认编译参数**：标准 LGPL 2.1 兼容构建，启用 LittleCMS2 色彩管理支持。
- **动态库导出符号**：C API 接口集合（包含 `libraw_init`, `libraw_open_file`, `libraw_unpack_thumb`, `libraw_dcraw_make_mem_thumb`, `libraw_recycle` 等）。

---

## 3. 动态共享库替换步骤

只要您编译或获取的动态库保持 ABI 兼容性（LibRaw 0.20.0 及以上版本），即可按照以下步骤完成替换。

### 🍎 macOS 平台替换指引

在 macOS 系统上，QuickPick 的可执行文件配置了标准 `@executable_path/../Frameworks` 优先的 RPATH。

1. **完全退出 QuickPick**（确保后台进程无存活）。
2. 打开“终端 (Terminal)”，定位到应用程序包内容目录：
   ```bash
   cd /Applications/QuickPick.app/Contents/Frameworks/
   # 或者如果是开发调试版构建：
   # cd src-tauri/target/release/bundle/macos/QuickPick.app/Contents/Frameworks/
   ```
3. 备份原有的 `libraw.dylib`：
   ```bash
   mv libraw.dylib libraw.dylib.bak
   ```
4. 将您自行编译的新版本动态库复制到该目录：
   ```bash
   cp /path/to/your/custom/libraw.dylib ./libraw.dylib
   ```
5. *(可选/推荐)* 若 macOS Gatekeeper 拦截未签名的替换库，可重签或放行：
   ```bash
   codesign -f -s - ./libraw.dylib
   ```
6. 重新启动 QuickPick，顶部栏将显示您替换后的 LibRaw 版本或生效的新特性。

---

### 🪟 Windows 平台替换指引

在 Windows 系统上，Windows 默认优先从可执行文件所在同级目录加载 DLL。

1. **退出 QuickPick**。
2. 打开资源管理器，进入 QuickPick 安装目录（通常位于 `C:\Program Files\QuickPick\` 或 `AppData\Local\Programs\QuickPick\`）。
3. 找到 `libraw.dll`，将其重命名为 `libraw.dll.bak` 进行备份。
4. 将新编译的 64 位 `libraw.dll`（如 MSVC 或 MinGW-w64 编译版）复制粘贴到该目录下。
5. 启动 QuickPick，主程序即可自动载入新的 DLL。

---

### 🐧 Linux 平台替换指引

Linux 系统支持通过系统包管理器替换，亦可通过 `LD_LIBRARY_PATH` 显式劫持：

1. **直接替换系统动态库**：
   ```bash
   sudo cp /path/to/custom/libraw.so /usr/local/lib/libraw.so
   sudo ldconfig
   ```
2. **或在启动前指定优先库路径**：
   ```bash
   LD_LIBRARY_PATH=/path/to/custom_libraw:$LD_LIBRARY_PATH quickpick
   ```

---

## 4. 常见问题排查 (Troubleshooting)

- **应用启动崩溃提示 `symbol not found`**：
  说明新编译的动态库缺失了关键函数（例如未开启 LCMS 或版本过旧低于 0.20.0）。请确保新库完整导出了 `libraw_*` 系列标准 C API。
- **macOS 提示“无法打开，因为来自未知的开发者”**：
  执行 `xattr -d com.apple.quarantine /Applications/QuickPick.app` 移除隔离属性，并使用 `codesign -f -s -` 本地自签名。
- **如何还原官方库**：
  将备份的 `.bak` 文件还原命名为原动态库文件名即可，或重新运行 QuickPick 安装包覆盖安装。
