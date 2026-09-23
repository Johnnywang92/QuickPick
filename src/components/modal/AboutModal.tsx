import React, { useState } from 'react';
import { X, Cpu, ShieldCheck, FileText, RefreshCw, BookOpen, Layers } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  librawVersion?: string;
}

export const AboutModal: React.FC<AboutModalProps> = ({
  isOpen,
  onClose,
  librawVersion = '0.22.2',
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'replacement' | 'license'>('overview');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-dark-850 border border-dark-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        {/* 标头 */}
        <div className="px-6 py-4 border-b border-dark-700/80 flex items-center justify-between bg-dark-900/50">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-100">QuickPick 极选</h2>
                <span className="text-[10px] bg-brand-600/30 text-brand-300 border border-brand-500/30 px-1.5 py-0.2 rounded font-mono font-medium">
                  v0.2.0
                </span>
              </div>
              <p className="text-xs text-slate-400">面向普通用户的本地选片工具，原片全程只读安全无忧</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 hover:bg-dark-700 text-slate-400 hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
            title="关闭 (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 标签栏 */}
        <div className="flex items-center px-6 border-b border-dark-700/80 bg-dark-900/30 text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center space-x-2 py-3 px-3 border-b-2 font-medium transition-colors cursor-pointer ${
              activeTab === 'overview'
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>概览与开源合规</span>
          </button>

          <button
            onClick={() => setActiveTab('replacement')}
            className={`flex items-center space-x-2 py-3 px-3 border-b-2 font-medium transition-colors cursor-pointer ${
              activeTab === 'replacement'
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>动态库自由替换指南</span>
          </button>

          <button
            onClick={() => setActiveTab('license')}
            className={`flex items-center space-x-2 py-3 px-3 border-b-2 font-medium transition-colors cursor-pointer ${
              activeTab === 'license'
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>LGPL 2.1 协议全文</span>
          </button>
        </div>

        {/* 内容区 */}
        <div className="p-6 overflow-y-auto text-xs text-slate-300 space-y-4 font-sans leading-relaxed select-text">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* 原片安全只读红线卡片 */}
              <div className="p-4 rounded-xl bg-emerald-50/70 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 space-y-2">
                <div className="flex items-center space-x-2 text-emerald-800 dark:text-emerald-300 font-semibold">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>原片绝对只读安全保障</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  QuickPick 是面向普通用户的本地选片工具，帮助用户从摄影师交付的上千张 RAW/JPEG 原片中快速找出自己满意的照片，并在不修改、不移动、不删除原片的前提下安全导出选片结果。闭眼、模糊和相似度仅作为可能需要人工复核的提示。
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1 text-[10px] text-slate-400">
                  <div>🔒 绝不移动、删除或覆盖原片</div>
                  <div>💾 选片记录独立隔离保存</div>
                  <div>🛡️ 默认不在照片目录写入 XMP</div>
                  <div>🚀 支持原片校验复制与清单导出</div>
                </div>
              </div>

              {/* 核心引擎信息卡片 */}
              <div className="p-4 rounded-xl bg-dark-800/90 border border-dark-700 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-slate-200 font-semibold">
                    <Cpu className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>RAW 解码引擎规格</span>
                  </div>
                  <span className="text-[11px] font-mono bg-emerald-100/90 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 px-2 py-0.5 rounded font-semibold">
                    LibRaw {librawVersion} (动态共享库)
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  QuickPick 采用动态链接技术调用 LibRaw C API 提取相机原生内嵌预览与 EXIF 拍摄元数据（相机型号、镜头、曝光三要素）。
                </p>
              </div>

              {/* 开源协议与合规声明 */}
              <div className="p-4 rounded-xl bg-dark-800/50 border border-dark-700/80 space-y-2">
                <h4 className="font-semibold text-slate-200 flex items-center space-x-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-brand-400" />
                  <span>开源协议与合规声明 (MIT & LGPL 2.1)</span>
                </h4>
                <p className="text-[11px] text-slate-300">
                  QuickPick 核心前端与应用业务代码采用宽松的 <strong>MIT 开源协议</strong>。依照 LGPL 2.1 第 6 节及 LGPL 3.0 第 4 节之规定，关于底层 RAW 图像解码组件：
                </p>
                <ul className="list-disc list-inside text-[11px] text-slate-400 space-y-1 pl-1">
                  <li>以独立的动态链接库形式加载 LibRaw，保持清晰的模块架构边界；</li>
                  <li>支持用户根据自身需求定制、重新编译或升级替换底层 <code className="text-amber-700 dark:text-amber-300 font-mono">libraw.dylib</code> / <code className="text-amber-700 dark:text-amber-300 font-mono">libraw.dll</code>；</li>
                  <li>随安装包附带了完整的 MIT 协议、LGPL 2.1 协议全文及动态库替换操作指引文件。</li>
                </ul>
              </div>

              <div className="text-[11px] text-slate-500 flex items-center justify-between pt-2 border-t border-dark-700/60">
                <span>MIT License · Copyright © 2026 Johnny Boy Studio</span>
                <span className="font-mono text-slate-400">QuickPick Core v0.2.0</span>
              </div>
            </div>
          )}

          {activeTab === 'replacement' && (
            <div className="space-y-3 text-[11px]">
              <div className="p-3 rounded-lg bg-amber-50/70 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-950 dark:text-amber-200">
                <strong>自由替换权利保障：</strong> 您可以在不重新构建或修改 QuickPick 任何代码的前提下，将本应用内置的 LibRaw 动态库替换为您自行编译或官方更新的动态库版本。
              </div>

              <h4 className="text-xs font-semibold text-slate-100 pt-1">🍎 macOS 替换步骤</h4>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-300 bg-dark-800/60 p-3 rounded-lg border border-dark-700 font-mono">
                <li>完全退出正在运行的 QuickPick；</li>
                <li>打开终端，进入应用包内嵌 Frameworks 目录：<br />
                  <span className="text-slate-400 text-[10px]">cd /Applications/QuickPick.app/Contents/Frameworks/</span>
                </li>
                <li>备份原文件并放入您新编译的动态库：<br />
                  <span className="text-slate-400 text-[10px]">mv libraw.dylib libraw.dylib.bak && cp /path/to/new/libraw.dylib ./</span>
                </li>
                <li>重启 QuickPick，主程序即可自动载入您替换后的动态库。</li>
              </ol>

              <h4 className="text-xs font-semibold text-slate-100 pt-1">🪟 Windows 替换步骤</h4>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-300 bg-dark-800/60 p-3 rounded-lg border border-dark-700 font-mono">
                <li>完全退出 QuickPick；</li>
                <li>在安装目录（如 Program Files\QuickPick\）中找到 <code className="text-amber-700 dark:text-amber-300 font-semibold">libraw.dll</code>；</li>
                <li>将新编译的 64 位动态库重命名替换即可生效。</li>
              </ol>
            </div>
          )}

          {activeTab === 'license' && (
            <div className="bg-dark-900 border border-dark-700/80 rounded-xl p-3 font-mono text-[10px] text-slate-400 max-h-[350px] overflow-y-auto leading-normal space-y-4">
              <div>
                <div className="text-brand-400 font-semibold mb-1">【 QuickPick 核心协议 · MIT License 】</div>
                <pre className="whitespace-pre-wrap">
{`MIT License

Copyright (c) 2026 Johnny Boy Studio

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.`}
                </pre>
              </div>

              <div className="pt-3 border-t border-dark-700">
                <div className="text-emerald-400 font-semibold mb-1">【 第三方动态库协议 · GNU LGPL 2.1 】</div>
                <pre className="whitespace-pre-wrap">
{`                  GNU LESSER GENERAL PUBLIC LICENSE
                       Version 2.1, February 1999

 Copyright (C) 1991, 1999 Free Software Foundation, Inc.
 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301  USA

(完整协议文本已随应用附带在 LICENSES/LGPL-2.1.txt)`}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-3.5 border-t border-dark-700/80 bg-dark-900/50 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Johnny Boy Studio · 遵循 MIT 与 LGPL 2.1 开源协议
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-dark-700 hover:bg-dark-600 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
};
