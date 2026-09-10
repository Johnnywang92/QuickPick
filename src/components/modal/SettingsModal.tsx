import React, { useEffect } from 'react';
import { useThemeStore, ThemeMode } from '../../store/themeStore';
import {
  Settings,
  X,
  Moon,
  Sun,
  Laptop,
  CheckCircle2,
  ShieldCheck,
  Palette,
} from 'lucide-react';
import clsx from 'clsx';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ThemeOption {
  id: ThemeMode;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  previewClass: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'dark',
    title: '深色专业模式',
    subtitle: '专业修图暗调底色，防眩光，聚焦原片真实色彩与明暗细节',
    icon: <Moon className="w-4 h-4 text-indigo-400" />,
    previewClass: 'bg-[#0d0f12] border-slate-700 text-slate-100',
  },
  {
    id: 'light',
    title: '明亮浅色模式',
    subtitle: '纯白雅致底色，适合日间自然光或明亮办公环境，清晰自然',
    icon: <Sun className="w-4 h-4 text-amber-500" />,
    previewClass: 'bg-[#f8fafc] border-slate-300 text-slate-900',
  },
  {
    id: 'system',
    title: '跟随操作系统',
    subtitle: '自动随 macOS / Windows 系统的深浅模式偏好实时同步切换',
    icon: <Laptop className="w-4 h-4 text-blue-400" />,
    previewClass: 'bg-gradient-to-r from-[#0d0f12] to-[#f8fafc] border-slate-500 text-slate-200',
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { themeMode, effectiveTheme, setThemeMode } = useThemeStore();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150 select-none font-sans"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-dark-700 bg-dark-850 shadow-2xl text-slate-200 flex flex-col max-h-[90vh]">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-750 bg-dark-800/80 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 id="settings-modal-title" className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>偏好设置</span>
                <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30 font-mono">
                  Preferences
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                个性化界面外观、背景色彩与选片使用偏好
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-700 transition-colors cursor-pointer"
            title="关闭 (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 设置内容区 */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs">
          {/* 界面外观 */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-200">
              <Palette className="w-4 h-4 text-brand-400" />
              <span>界面外观底色 (Theme & Appearance)</span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {THEME_OPTIONS.map((option) => {
                const isSelected = themeMode === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setThemeMode(option.id)}
                    className={clsx(
                      'flex items-center justify-between p-3.5 rounded-xl border text-left transition-all cursor-pointer group',
                      isSelected
                        ? 'border-brand-500 bg-brand-500/10 shadow-sm ring-1 ring-brand-500/30'
                        : 'border-dark-700 bg-dark-800/60 hover:border-dark-600 hover:bg-dark-800',
                    )}
                  >
                    <div className="flex items-center space-x-3.5 min-w-0">
                      <div
                        className={clsx(
                          'w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105',
                          option.previewClass,
                        )}
                      >
                        {option.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-xs text-slate-100">
                            {option.title}
                          </span>
                          {option.id === 'system' && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-dark-700 text-slate-400 font-mono">
                              当前: {effectiveTheme === 'light' ? '浅色' : '深色'}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                          {option.subtitle}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 ml-3">
                      {isSelected ? (
                        <CheckCircle2 className="w-5 h-5 text-brand-400 fill-brand-400/20" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border border-dark-600 group-hover:border-dark-500" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 数据安全说明 */}
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-1.5">
            <div className="flex items-center space-x-2 text-emerald-300 font-semibold text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>本地隐私与配置持久化说明</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              您的外观主题偏好已自动保存在本地系统配置中，重新启动 QuickPick 时将自动应用。
              系统依然严格遵守只读原则，绝不在原片目录留下任何缓存或配置文件。
            </p>
          </div>
        </div>

        {/* 底部确认按钮 */}
        <div className="px-6 py-3.5 border-t border-dark-750 bg-dark-800/40 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
          >
            完成设置
          </button>
        </div>
      </div>
    </div>
  );
};
