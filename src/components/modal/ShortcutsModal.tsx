import React, { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';

interface ShortcutsModalProps {
  onClose: () => void;
}

const SHORTCUT_GROUPS = [
  {
    title: '选择',
    items: [
      ['Space', '选择或取消选择当前照片'],
      ['M', '放入待考虑'],
      ['N', '明确标记为不选'],
      ['P', '连拍极速对决（两两PK淘汰）'],
      ['R', '打开或关闭修图批注要求'],
      ['Cmd/Ctrl + Z', '撤销上一次选择操作'],
    ],
  },
  {
    title: '浏览',
    items: [
      ['Tab / Shift+F', '进入或退出纯粹沉浸看片模式 (Lights Out)'],
      ['← / → / ↑ / ↓ 或 K / J', '上一张 / 下一张'],
      ['触控板双指轻扫', '平滑切图 (带弹性阻尼反馈)'],
      ['Z', '100% 真实像素点对点查焦 / 全屏切换'],
      ['Home / End', '跳到当前筛选结果首张 / 末张'],
      ['F', '打开或关闭人脸特写'],
    ],
  },
  {
    title: '构图与调色',
    items: [
      ['O', '循环切换经典构图参考线 (三分法/黄金螺旋/分割/对角/十字)'],
      ['Shift + O', '旋转黄金螺旋朝向 (四象限顺时针)'],
      ['E', '打开相机参数相框与选片快速调色工作台'],
      ['L', '打开或关闭 3D LUT 胶片调色'],
      ['\\（按住）', '按住临时查看未调色原片'],
      ['B', '一键切换莱卡高反差黑白检查'],
    ],
  },
  {
    title: '比较',
    items: [
      ['C', '进入或退出双图比较'],
      ['S', '交换左右照片'],
      ['Esc', '退出比较或重置筛选'],
    ],
  },
] as const;

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ onClose }) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-dark-700 bg-dark-850 shadow-2xl">
      <div className="flex items-center justify-between border-b border-dark-700/80 bg-dark-900/60 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Keyboard className="h-5 w-5 text-brand-400" />
          <div>
            <h2 id="shortcuts-title" className="text-sm font-bold text-slate-100">
              快捷键帮助
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-400">所有核心选片动作也可以使用鼠标完成</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-dark-700 hover:text-slate-100"
          aria-label="关闭快捷键帮助"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title} className="rounded-xl border border-dark-700 bg-dark-900/55 p-3">
            <h3 className="mb-2 text-xs font-semibold text-slate-200">{group.title}</h3>
            <dl className="space-y-2.5">
              {group.items.map(([keys, description]) => (
                <div key={keys}>
                  <dt className="font-mono text-[10px] font-semibold text-brand-300">{keys}</dt>
                  <dd className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{description}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      </div>
    </div>
  );
};
