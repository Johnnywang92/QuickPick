# QuickPick 第三方开源依赖与知识产权合规通知 (Third-Party Notices & IP Compliance)

本文件详尽记录了 QuickPick（极选）所依赖的全部开源软件组件、动态链接库、字体许可声明及商标指示性合理使用政策。

---

## 1. 核心架构与专有代码协议

- **QuickPick 应用主体代码**（前端 React/TypeScript、后端 Rust Tauri 核心）：
  采用宽松商业友好的 **[MIT License](../LICENSE)** 开源。
  版权所有 © 2026 Johnny Boy Studio。

---

## 2. 底层动态共享库 (C/C++ Libraries)

QuickPick 通过操作系统动态链接（Dynamic Linking）加载以下底层动态库，绝不静态链接（Static Link）至可执行文件内部，严格保持架构与版权独立性：

### A. LibRaw (RAW 图像解码引擎)
- **许可证**：GNU Lesser General Public License (LGPL) v2.1 / CDDL 1.0
- **版权声明**：Copyright © LibRaw LLC (info@libraw.org)
- **动态链接与自由替换保障**：
  依照 LGPL 2.1 第 6 节及 LGPL 3.0 第 4 节之规定，QuickPick 赋予用户完全自由替换 `libraw.dylib` / `libraw.dll` 的权利。详细替换操作指南详见 [LIBRAW_REPLACEMENT.md](LIBRAW_REPLACEMENT.md) 及 [../LICENSES/LGPL-2.1.txt](../LICENSES/LGPL-2.1.txt)。

### B. Little-CMS 2 (色彩管理与 ICC Profile 解析)
- **许可证**：MIT License
- **版权声明**：Copyright © 1998-2024 Marti Maria Saguer
- **许可授权**：依照 MIT 协议，允许无限制使用、复制、修改与分发。

### C. libjpeg-turbo (高速 SIMD JPEG 编码/解码)
- **许可证**：BSD 3-Clause / IJG License / zlib License
- **版权声明**：Copyright © 2009-2024 D. R. Commander; Copyright © 2015 Viktor Szathmáry
- **通知文本**：This software is based in part on the work of the Independent JPEG Group.

### D. LLVM OpenMP Runtime (`libomp`)
- **许可证**：Apache License 2.0 with LLVM Exception
- **版权声明**：Copyright © LLVM Project Contributors

---

## 3. 字体使用与分发合规声明 (Font Licensing Policy)

1. **零商业字体打包分发**：QuickPick 安装包与发布产物（.dmg / .exe）**不打包、不携带、不分发任何商业字体文件**（无 `.ttf` / `.otf` / `.woff` 二进制文件）。
2. **系统字体栈安全调用**：在构图线、EXIF 水印相框及界面渲染中，全部通过标准 CSS / Canvas 声明调用用户操作系统本地已合法安装的字体栈（例如 macOS 的 `-apple-system`, `SF Pro Display`, `SF Mono`, `PingFang SC`；Windows 的 `Segoe UI`, `Consolas`, `Microsoft YaHei`）。
3. **相机品牌专属字体禁绝**：严禁内嵌或分发相机品牌专有定制字体（如 Leica LG1055 等），杜绝字体版权与分发侵权。

---

## 4. 商标指示性合理使用政策 (Nominative Fair Use Policy)

1. **相机 EXIF 元数据呈现**：
   - 选片相框中提取展示的相机品牌与镜头型号文本（例如 `SONY α7RM5`、`Canon EOS R5`、`NIKON Z8`、`Leica M11`、`Apple iPhone` 等），系从用户自身拍摄的原片 EXIF Header 中如实读取的技术参数。
   - 该展示符合通行知识产权法之**指示性合理使用原则（Nominative Fair Use）**：(1) 不使用该品牌名称便无法客观准确指代该照片的拍摄硬件设备；(2) 仅使用必要的纯文本字符，排版遵循正常摄影参数视觉比例，绝不喧宾夺主；(3) 不暗示任何官方商业赞助、授权或联名背书。
2. **相机品牌图形商标（Logo）全面禁绝**：
   - QuickPick 所有相框徽标（光圈叶片、琥珀对焦环、极简旁轴框等）**均为 100% 原创程序化自绘几何图形**。
   - 严禁打包、复制或使用任何相机厂商的受保护图形商标（如 Leica 红点商标、Sony α 专有图案商标等）。
3. **色彩影调预设去商标化 (Film Emulation Presets)**：
   - QuickPick 内置调色风格预设全部采用纯影调美学描述词汇（如 `暖金人像`、`纪实青调`、`千禧复古 CCD`、`通透纯白`、`电影青橙`、`极致黑白`、`浓郁风光`、`清冷极简` 等），杜绝将他人注册商标作为软件功能名称。
4. **商标免责声明**：
   *All product names, logos, brands, trademarks, and registered trademarks mentioned or referenced in this software or documentation are the property of their respective owners. QuickPick and Johnny Boy Studio are not affiliated with, associated with, sponsored by, or endorsed by Eastman Kodak Company, FUJIFILM Corporation, Leica Camera AG, Sony Corporation, Canon Inc., Nikon Corporation, or any other camera or film manufacturer.*

---

## 5. 示例图片与模特肖像权政策 (Model Release & Imagery Policy)

1. **图库许可局限性警示**：Unsplash、Pexels 等免费图库平台仅授予摄影作品著作权许可，**不担保或转让画面中人物的合法商业肖像权（Model Release）**。
2. **官方展示素材红线**：
   - 官方网站、安装包演示图片及应用商店宣传截图中，**优先使用纯风光、建筑、静物、微距与街景剪影/背影素材**；
   - 任何涉及正脸、可清晰识别的人物肖像图片，必须确保为原创自摄且拥有已签署的书面模特肖像授权书（Model Release Form），严禁将无模特授权的第三方图库人像用于商业推广或付费相框演示。


---

## 6. 完整依赖许可证清单与 LGPL 源码获取

1. **完整清单**：全部 npm 与 Rust 依赖的许可证清单见 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)，由 `node scripts/gen_license_inventory.js` 生成，发布前须重新生成。其中 MPL-2.0 组件（cssparser、selectors、dtoa-short、option-ext 等）按其条款，对这些文件本身的修改须以 MPL-2.0 公开（本项目未修改）。
2. **LibRaw 源码获取（LGPL 要约）**：随包分发的 `libraw.25.dylib` 为 Homebrew 构建的 LibRaw，仅通过 `install_name_tool` 调整加载路径并重签名，未修改源码。对应源码可从 https://github.com/LibRaw/LibRaw 获取；如需源码副本，请联系 johnny.boy.1km@gmail.com，我们将在收到请求后提供，有效期不少于三年。
   <!-- TODO: 发布前填写实际打包的 LibRaw 版本号与 Homebrew formula 版本 -->
3. **随包许可证文本（待完成）**：发布前须把 libjpeg-turbo（BSD-3 / IJG / zlib）、Little-CMS（MIT）、libomp（Apache-2.0 with LLVM Exception）的完整许可证文本放入 `LICENSES/`（`tauri.conf.json` 已通过 `../LICENSES/*` 打包）。
4. **商标声明（中文）**：本文提及的所有产品名称、品牌与商标均归其各自所有者所有。QuickPick 与 Johnny Boy Studio 与相关厂商无任何关联，也未获其赞助或认可。
5. **Adobe Lightroom**：应用中的 “Lightroom 参数” 仅为与常见调色软件滑块对应的参考数值，与 Adobe 无关联，也未获其认可。
