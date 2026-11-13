# QuickPick 隐私政策 / Privacy Policy

> 版本：草案 v0.1（2026-11-13）。**发布前请由运营方（Johnny Boy Studio）和法律顾问审阅并填写占位项。**

## 1. 概述
QuickPick（极选）是本地运行的桌面选片工具。在当前版本中，应用**不包含账号体系、云端同步、遥测或崩溃上报**，也不会主动上传您的照片或元数据。
> 若未来版本新增联网功能（更新检查、云端 AI、崩溃上报等），我们会更新本政策，并在启用前征得您的明确同意。

## 2. 我们处理哪些数据（均仅在您的设备上）
| 数据 | 用途 | 存放位置 |
|---|---|---|
| 照片文件（只读访问） | 浏览、缩略图/预览生成、导出 | 您选择的源目录，不会被修改 |
| EXIF 元数据（相机型号、镜头、拍摄参数、时间，可能含 GPS） | 排序、相框展示、故事线分段 | 本地数据库 |
| 选片标记、批注、项目状态 | 保存您的选片结果 | 应用数据目录中的本地 SQLite |
| 预览缓存（2K 代理图） | 加速浏览，有 1 GiB 上限与 LRU 淘汰 | 系统应用数据目录 |
| 人脸区域坐标、闭眼/模糊/相似度结果 | 缺陷提示、人物特写与出场统计 | 本地数据库 |

## 3. 人脸与生物识别信息
- 应用会在本地分析照片中的人脸区域，用于闭眼检测、人物特写和人物出场统计。
- 这些结果仅存于本地，**不会用于身份识别，也不会上传**。
- 在部分法域（如中国 PIPL、欧盟 GDPR），人脸信息属于敏感/特殊类别个人信息。**如果您使用本软件处理第三方（如婚礼宾客、客户）的照片，您是该数据的处理者，需自行取得必要的授权，并遵守当地法律。**
- 您可以随时在应用内删除项目数据，或删除应用数据目录来清除全部分析结果。

## 4. 数据共享
我们不向任何第三方出售、共享或传输您的数据。您主动执行的操作（导出文件、复制到剪贴板、通过系统 AirDrop 分享）由您控制接收方。

## 5. 官网
官网 quickpick.johnnyboystudio.com 托管于 Cloudflare Pages，托管方可能记录常规访问日志（IP、User-Agent）。官网不使用广告追踪。
<!-- TODO: 如接入统计工具，请在此披露 -->

## 6. 您的权利与数据删除
所有数据均在本地，您可直接在系统中查看、导出或删除：
- 删除应用数据目录（macOS：`~/Library/Application Support/com.quickpick.triage`）即可清除数据库与缓存。
- 源照片和导出的文件由您自行管理。

## 7. 未成年人
本软件不面向 14 周岁以下儿童提供服务，且不收集任何用户个人信息。

## 8. 联系方式
johnny.boy.1km@gmail.com（请确认是否继续作为官方联系邮箱）

## 9. 政策变更
政策更新会随版本发布并更新本文件顶部日期。

---

# English Summary
QuickPick runs entirely on your device. It has no accounts, telemetry, crash reporting or cloud upload. Photos are accessed read-only; selections, EXIF-derived data and face-region analysis results are stored in a local database and cache. Face analysis is not used for identification. If you process other people's photos, you are responsible for obtaining required consents under applicable law (e.g. GDPR, PIPL). Contact: johnny.boy.1km@gmail.com.

