#!/usr/bin/env bash
set -e

# ==============================================================================
# QuickPick macOS LibRaw & Dependencies Standalone Bundling Script
# Converts Homebrew absolute paths into portable @rpath-based dynamic libraries
# ==============================================================================

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRAMEWORKS_DIR="$ROOT_DIR/src-tauri/Frameworks"

mkdir -p "$FRAMEWORKS_DIR"

LIBRAW_PATH=$(brew --prefix libraw 2>/dev/null || echo "/opt/homebrew/opt/libraw")
LIBOMP_PATH=$(brew --prefix libomp 2>/dev/null || echo "/opt/homebrew/opt/libomp")
JPEGTURBO_PATH=$(brew --prefix jpeg-turbo 2>/dev/null || echo "/opt/homebrew/opt/jpeg-turbo")
LCMS2_PATH=$(brew --prefix little-cms2 2>/dev/null || echo "/opt/homebrew/opt/little-cms2")

echo "==> 复制依赖库到 $FRAMEWORKS_DIR"
cp "$LIBRAW_PATH/lib/libraw.25.dylib" "$FRAMEWORKS_DIR/"
ln -sf libraw.25.dylib "$FRAMEWORKS_DIR/libraw.dylib"
cp "$LIBOMP_PATH/lib/libomp.dylib" "$FRAMEWORKS_DIR/"
cp "$JPEGTURBO_PATH/lib/libjpeg.8.dylib" "$FRAMEWORKS_DIR/"
cp "$LCMS2_PATH/lib/liblcms2.2.dylib" "$FRAMEWORKS_DIR/"
chmod 755 "$FRAMEWORKS_DIR"/*.dylib

echo "==> 规范化 LC_ID_DYLIB 与加载路径为 @rpath"
install_name_tool -id @rpath/libraw.25.dylib "$FRAMEWORKS_DIR/libraw.25.dylib" 2>/dev/null || true
install_name_tool -change "$LIBOMP_PATH/lib/libomp.dylib" @rpath/libomp.dylib "$FRAMEWORKS_DIR/libraw.25.dylib" 2>/dev/null || true
install_name_tool -change "$JPEGTURBO_PATH/lib/libjpeg.8.dylib" @rpath/libjpeg.8.dylib "$FRAMEWORKS_DIR/libraw.25.dylib" 2>/dev/null || true
install_name_tool -change "$LCMS2_PATH/lib/liblcms2.2.dylib" @rpath/liblcms2.2.dylib "$FRAMEWORKS_DIR/libraw.25.dylib" 2>/dev/null || true

install_name_tool -id @rpath/libomp.dylib "$FRAMEWORKS_DIR/libomp.dylib" 2>/dev/null || true
install_name_tool -id @rpath/libjpeg.8.dylib "$FRAMEWORKS_DIR/libjpeg.8.dylib" 2>/dev/null || true
install_name_tool -id @rpath/liblcms2.2.dylib "$FRAMEWORKS_DIR/liblcms2.2.dylib" 2>/dev/null || true

strip_local_rpaths() {
  local binary="$1"
  while IFS= read -r rpath; do
    case "$rpath" in
      /opt/homebrew/*|/usr/local/*)
        install_name_tool -delete_rpath "$rpath" "$binary"
        ;;
    esac
  done < <(otool -l "$binary" | awk '$1 == "cmd" && $2 == "LC_RPATH" { getline; getline; print $2 }')
}

echo "==> 移除构建机本地 Homebrew RPATH"
for binary in "$FRAMEWORKS_DIR"/*.dylib; do
  strip_local_rpaths "$binary"
done

echo "==> 重签名依赖库 (Ad-hoc)"
codesign -f -s - "$FRAMEWORKS_DIR"/*.dylib

echo "==> 动态库打包就绪："
ls -la "$FRAMEWORKS_DIR"
