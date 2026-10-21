# QuickPick 官网 (Cloudflare Pages 部署指南)

本项目静态落地页位于仓库根目录的 `website/` 文件夹下，包含高质感暗房风格 UI、中英双语即时切换、可交互构图与调色模拟器、以及 macOS 最新安装包下载链接。

---

## ⚡ 3 步完成 Cloudflare Pages 部署

### 步骤 1：在 Cloudflare Dashboard 创建 Pages 项目
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)；
2. 在左侧导航栏点击 **Workers & Pages** -> **Create application** -> 选择 **Pages** -> **Connect to Git**；
3. 选择你的 GitHub 仓库 `Johnnywang92/QuickPick` 并点击 **Begin setup**。

### 步骤 2：配置构建设置 (Build Settings)
Cloudflare Pages 会提示配置构建命令与发布目录，填入以下设置：

| 配置项 | 填写内容 | 说明 |
| :--- | :--- | :--- |
| **Project name** | `quickpick` | 项目名（默认生成 `quickpick.pages.dev`） |
| **Production branch** | `main` | 生产分支 |
| **Framework preset** | `None` | 纯原生静态，无需任何编译框架 |
| **Build command** | *(留空，不填)* | 零构建耗时，秒级秒发 |
| **Build output directory** | `website` | **重要**：指向网站静态文件夹 |

点击 **Save and Deploy**，数秒内即可构建完成，访问生成的 `https://quickpick.pages.dev` 即可预览！

---

### 步骤 3：绑定自定义子域名 `quickpick.johnnyboystudio.com`
1. 在刚创建的 Pages 项目主页中，切换到 **Custom domains** 选项卡；
2. 点击 **Set up a custom domain**；
3. 输入子域名：`quickpick.johnnyboystudio.com`，点击 **Continue**；
4. **DNS 解析处理**：
   - 如果你的主域名 `johnnyboystudio.com` 已经在 Cloudflare 托管：Cloudflare 会自动帮你添加一条 CNAME 记录，点击 **Activate domain** 即可；
   - 如果 `johnnyboystudio.com` 在阿里云、腾讯云、Namecheap 或 GoDaddy 等其他 DNS 提供商：在你的 DNS 控制台添加一条记录：
     - **记录类型**：`CNAME`
     - **主机记录 / 名称**：`quickpick`
     - **记录值 / 指向**：`quickpick.pages.dev`
     - **TTL**：默认或自动
5. Cloudflare Pages 会自动免费签发通配符 SSL 证书并开启 HTTP/3、Brotli 压缩与全球 CDN 加速。

---

## 🛠️ 本地预览与调试

如需在本地开发或微调落地页：
```bash
# 进入 website 目录
cd website

# 使用任何轻量静态服务器（例如 Python 或 npx serve）
python3 -m http.server 3000
# 或
npx serve .
```
浏览器打开 `http://localhost:3000` 即可实时预览并测试中英双语切换与键盘快捷键交互。
