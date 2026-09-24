#!/usr/bin/env node

/**
 * QuickPick 工程质量与性能基准自动化核验脚本
 * 验证产物体积、合规文件完整性与质量基准红线
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let hasError = false;

function logPass(msg) {
  console.log(`\x1b[32m  ✓ [PASS]\x1b[0m ${msg}`);
}

function logWarn(msg) {
  console.log(`\x1b[33m  ⚠ [WARN]\x1b[0m ${msg}`);
}

function logFail(msg) {
  console.log(`\x1b[31m  ✗ [FAIL]\x1b[0m ${msg}`);
  hasError = true;
}

console.log('\n\x1b[1m=== 1. 检查开源协议与 LGPL 合规文件完整性 ===\x1b[0m');

const requiredFiles = [
  'LICENSES/LGPL-2.1.txt',
  'LICENSES/LIBRAW_LICENSE.txt',
  'docs/LIBRAW_REPLACEMENT.md',
  'docs/PERFORMANCE_BASELINES.md',
];

for (const relPath of requiredFiles) {
  const fullPath = path.join(rootDir, relPath);
  if (fs.existsSync(fullPath)) {
    const size = fs.statSync(fullPath).size;
    logPass(`${relPath} 存在 (${size} bytes)`);
  } else {
    logFail(`缺少关键合规文件: ${relPath}`);
  }
}

console.log('\n\x1b[1m=== 2. 检查前端生产构建产物体积与阈值 ===\x1b[0m');

const distDir = path.join(rootDir, 'dist');
if (!fs.existsSync(distDir)) {
  logFail('未找到 dist/ 构建产物目录，请先执行 npm run build');
} else {
  const indexHtml = path.join(distDir, 'index.html');
  let mainJsFile = '';
  if (fs.existsSync(indexHtml)) {
    logPass('dist/index.html 存在');
    const html = fs.readFileSync(indexHtml, 'utf-8');
    const entryMatch = html.match(/<script[^>]+src=["']\/assets\/(index-[^"']+\.js)["']/);
    if (entryMatch) mainJsFile = entryMatch[1];
  } else {
    logFail('缺少 dist/index.html');
  }

  const assetsDir = path.join(distDir, 'assets');
  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    let totalSize = 0;
    let mainJsSize = 0;
    let largestJsSize = 0;
    let largestJsFile = '';

    for (const file of files) {
      const filePath = path.join(assetsDir, file);
      const stat = fs.statSync(filePath);
      totalSize += stat.size;

      if (file.endsWith('.js') && stat.size > largestJsSize) {
        largestJsSize = stat.size;
        largestJsFile = file;
      }

      if (file === mainJsFile) {
        mainJsSize = stat.size;
      }
    }

    const mainJsKb = (mainJsSize / 1024).toFixed(2);
    const totalMb = (totalSize / (1024 * 1024)).toFixed(2);

    if (mainJsSize === 0) {
      logFail('无法从 dist/index.html 定位主 JavaScript 入口 Chunk');
    } else if (mainJsSize > 1024 * 1024) {
      logFail(`主 Bundle 体积过大: ${mainJsKb} KB (上限 1,024 KB)`);
    } else if (mainJsSize > 650 * 1024) {
      logWarn(`主 Bundle 体积略高: ${mainJsKb} KB (建议 < 650 KB)`);
    } else {
      logPass(`主 Bundle 体积在标准预算内: ${mainJsKb} KB`);
    }

    const largestJsKb = (largestJsSize / 1024).toFixed(2);
    if (largestJsSize > 650 * 1024) {
      logFail(`单个 JavaScript Chunk 体积过大: ${largestJsFile} ${largestJsKb} KB (上限 650 KB)`);
    } else {
      logPass(`最大 JavaScript Chunk 在标准预算内: ${largestJsFile} ${largestJsKb} KB`);
    }


    if (totalSize > 3 * 1024 * 1024) {
      logFail(`前端 Assets 总产物体积过大: ${totalMb} MB (上限 3.0 MB)`);
    } else {
      logPass(`前端 Assets 总产物体积正常: ${totalMb} MB`);
    }
  } else {
    logFail('缺少 dist/assets 目录');
  }
}

console.log('\n\x1b[1m=== 3. 检查构建与动态库配置 ===\x1b[0m');

// 检查 src-tauri/.cargo/config.toml 是否存在硬编码 target
const cargoConfigPath = path.join(rootDir, 'src-tauri/.cargo/config.toml');
if (fs.existsSync(cargoConfigPath)) {
  const content = fs.readFileSync(cargoConfigPath, 'utf-8');
  if (/^\s*target\s*=\s*"aarch64-apple-darwin"/m.test(content)) {
    logFail('src-tauri/.cargo/config.toml 中仍包含硬编码 target = "aarch64-apple-darwin"，破坏了跨平台自适应构建！');
  } else {
    logPass('src-tauri/.cargo/config.toml 已解除硬编码 target 绑定');
  }
} else {
  logPass('src-tauri/.cargo/config.toml 无硬编码 target 限制');
}

const tauriConfigPath = path.join(rootDir, 'src-tauri/tauri.conf.json');
const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf-8'));
const bundledFrameworks = tauriConfig.bundle?.macOS?.frameworks || [];
const requiredFrameworks = [
  'Frameworks/libraw.25.dylib',
  'Frameworks/libomp.dylib',
  'Frameworks/libjpeg.8.dylib',
  'Frameworks/liblcms2.2.dylib',
];
if (requiredFrameworks.every((framework) => bundledFrameworks.includes(framework))) {
  logPass('Tauri 已配置 macOS Contents/Frameworks 动态库与标准 RPATH');
} else {
  logFail('Tauri macOS frameworks 配置不完整，发布包可能无法在无 Homebrew 环境运行');
}

console.log('\n\x1b[1m=== 4. 执行合成样本核心管线回归基准 ===\x1b[0m');
try {
  const { execSync } = await import('child_process');
  const benchOutput = execSync('cargo run --manifest-path src-tauri/Cargo.toml --features benchmark-bin --bin benchmark --quiet', {
    cwd: rootDir,
    encoding: 'utf-8',
    timeout: 30000,
  });
  const lines = benchOutput.trim().split('\n');
  for (const line of lines) {
    if (line.startsWith('•')) {
      logPass(line.replace(/^•\s*/, ''));
    }
  }
} catch (error) {
  logFail(`性能基准压测未通过或发生异常: ${error.message}`);
}

console.log('\n\x1b[1m=== 基准核验结果 ===\x1b[0m');
if (hasError) {
  console.log('\x1b[31m❌ 质量基准或合规核验失败，请根据上方信息排查修正。\x1b[0m\n');
  process.exit(1);
} else {
  console.log('\x1b[32m✨ 全部工程基准与合规核验通过！\x1b[0m\n');
  process.exit(0);
}
