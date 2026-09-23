#!/usr/bin/env bash
set -e

# ==============================================================================
# QuickPick macOS DMG Standalone Packaging Script
# Packages QuickPick.app with Applications symlink into a compressed .dmg
# ==============================================================================

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT_DIR/package.json').version")"
APP_PATH="$ROOT_DIR/src-tauri/target/release/bundle/macos/QuickPick.app"
DMG_DIR="$ROOT_DIR/src-tauri/target/release/bundle/dmg"
DMG_PATH="$DMG_DIR/QuickPick_${VERSION}_aarch64.dmg"
ROOT_DMG_PATH="$ROOT_DIR/QuickPick_${VERSION}_aarch64.dmg"
VOLUME_NAME="QuickPick"

# 1. 确保 macOS 依赖动态库已打包就绪
echo "==> [1/4] 检查并打包 macOS 依赖动态库..."
bash "$ROOT_DIR/scripts/bundle_macos_libs.sh"

# 2. 若 QuickPick.app 尚未构建或版本不一致，执行 release app bundle 构建
APP_VERSION=""
if [ -f "$APP_PATH/Contents/Info.plist" ]; then
  APP_VERSION="$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$APP_PATH/Contents/Info.plist" 2>/dev/null || true)"
fi

if [ ! -d "$APP_PATH" ] || [ ! -f "$APP_PATH/Contents/MacOS/quickpick-engine" ] || [ "$APP_VERSION" != "$VERSION" ]; then
  echo "==> [2/4] 构建 QuickPick.app (目标版本: $VERSION)..."
  rm -rf "$APP_PATH"
  npx tauri build --bundles app
else
  echo "==> [2/4] 检测到已有 QuickPick.app (版本: $VERSION)，复用最新发布构建"
fi

# 3. 校验 App Bundle 符合 Apple Silicon 发布规范
echo "==> [3/4] 校验 App Bundle 架构与动态链接完整性..."
node "$ROOT_DIR/scripts/check_macos_bundle.js"

# 4. 准备 DMG 临时挂载目录并注入 /Applications 拖拽安装软链接
STAGING_DIR="$(mktemp -d -t quickpick-dmg-staging.XXXXXX)"
cleanup() {
  rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

echo "==> [4/4] 准备 DMG 结构并生成最终镜像..."
cp -R "$APP_PATH" "$STAGING_DIR/"
ln -s /Applications "$STAGING_DIR/Applications"

mkdir -p "$DMG_DIR"
rm -f "$DMG_PATH"

hdiutil create \
  -volname "$VOLUME_NAME" \
  -srcfolder "$STAGING_DIR" \
  -ov \
  -format UDZO \
  -imagekey zlib-level=9 \
  "$DMG_PATH"

echo "==> QuickPick macOS DMG 安装包构建成功！"
ls -lh "$DMG_PATH"

cp "$DMG_PATH" "$ROOT_DMG_PATH"
echo "==> 已同步最新安装镜像至项目根目录: $ROOT_DMG_PATH"
ls -lh "$ROOT_DMG_PATH"
