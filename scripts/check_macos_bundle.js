#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appDir = path.join(
  rootDir,
  'src-tauri/target/release/bundle/macos/QuickPick.app',
);
const executable = path.join(appDir, 'Contents/MacOS/quickpick-engine');
const requiredFiles = [
  'Contents/MacOS/quickpick-engine',
  'Contents/Frameworks/libraw.25.dylib',
  'Contents/Frameworks/libomp.dylib',
  'Contents/Frameworks/libjpeg.8.dylib',
  'Contents/Frameworks/liblcms2.2.dylib',
  'Contents/Resources/icon.icns',
  'Contents/Resources/LICENSES/LGPL-2.1.txt',
  'Contents/Resources/LICENSES/LIBRAW_LICENSE.txt',
  'Contents/Resources/docs/LIBRAW_REPLACEMENT.md',
];

if (process.platform !== 'darwin') {
  console.error('macOS bundle 检查只能在 macOS 构建机运行');
  process.exit(1);
}

const missing = requiredFiles.filter((relativePath) => !fs.existsSync(path.join(appDir, relativePath)));
if (missing.length > 0) {
  console.error(`macOS bundle 缺少必要文件：\n${missing.join('\n')}`);
  process.exit(1);
}

const infoPlist = execFileSync('plutil', ['-p', path.join(appDir, 'Contents/Info.plist')], {
  encoding: 'utf8',
});
if (!infoPlist.includes('"CFBundleIconFile" => "icon.icns"')) {
  console.error('macOS bundle 的 Info.plist 未声明 icon.icns 应用图标');
  process.exit(1);
}

for (const unwanted of ['benchmark', 'quickpick-server']) {
  if (fs.existsSync(path.join(appDir, 'Contents/MacOS', unwanted))) {
    console.error(`macOS bundle 不应包含内部工具二进制：${unwanted}`);
    process.exit(1);
  }
}

const binaries = [
  executable,
  ...requiredFiles
    .filter((relativePath) => relativePath.endsWith('.dylib'))
    .map((relativePath) => path.join(appDir, relativePath)),
];
for (const binary of binaries) {
  const architectures = execFileSync('lipo', ['-archs', binary], { encoding: 'utf8' })
    .trim()
    .split(/\s+/);
  if (architectures.length !== 1 || architectures[0] !== 'arm64') {
    console.error(`${path.basename(binary)} 架构不符合 Apple Silicon 发布要求：${architectures.join(', ')}`);
    process.exit(1);
  }

  const linkedLibraries = execFileSync('otool', ['-L', binary], { encoding: 'utf8' });
  if (/\/(opt\/homebrew|usr\/local)\//.test(linkedLibraries)) {
    console.error(`${path.basename(binary)} 仍依赖构建机本地 Homebrew 路径`);
    process.exit(1);
  }

  const loadCommands = execFileSync('otool', ['-l', binary], { encoding: 'utf8' });
  if (/\/(opt\/homebrew|usr\/local)\//.test(loadCommands)) {
    console.error(`${path.basename(binary)} 仍包含构建机本地 Homebrew 加载路径`);
    process.exit(1);
  }
}

const loadCommands = execFileSync('otool', ['-l', executable], { encoding: 'utf8' });
if (!loadCommands.includes('@executable_path/../Frameworks')) {
  console.error('主程序缺少 Contents/Frameworks RPATH');
  process.exit(1);
}

console.log('✓ macOS arm64 app bundle 布局、动态链接和 LGPL 资源检查通过');
