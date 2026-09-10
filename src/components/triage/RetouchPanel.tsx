import React, { useState, useMemo } from 'react';
import { useAlbumStore } from '../../store/albumStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useInsightStore } from '../../store/insightStore';
import { VisualPin } from '../../types/photo';
import { createPin } from '../../utils/annotationUtils';
import { useTagStore } from '../../store/tagStore';
import { generateRetouchAdvice } from '../../utils/aiRetouchAdvisor';
import {
  X,
  Sparkles,
  MapPin,
  Trash2,
  Tag,
  Plus,
  MessageSquare,
  CheckCircle2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Sliders,
  Sun,
  User,
  Palette,
  Crop,
  Wand2,
} from 'lucide-react';
import clsx from 'clsx';

interface RetouchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  isAddingPin: boolean;
  setIsAddingPin: (adding: boolean) => void;
  onAddPinManual?: (pin: VisualPin) => void;
}

const CATEGORY_MAP = {
  lighting: { label: '光影影调', icon: Sun, color: 'text-amber-400 bg-amber-500/10 border-amber-500/25' },
  portrait: { label: '人像肤质', icon: User, color: 'text-rose-400 bg-rose-500/10 border-rose-500/25' },
  color: { label: '色彩氛围', icon: Palette, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/25' },
  composition: { label: '构图瑕疵', icon: Crop, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' },
};

export const RetouchPanel: React.FC<RetouchPanelProps> = ({
  isOpen,
  onClose,
  isAddingPin,
  setIsAddingPin,
}) => {
  const { photos, currentIndex, activePresetId } = useAlbumStore();
  const { getAnnotation, setAnnotation } = useSelectionStore();
  const { availableTags, addCustomTag } = useTagStore();
  const { insights } = useInsightStore();

  const currentPhoto = photos[currentIndex];
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const [newTagInput, setNewTagInput] = useState('');

  // AI 建议相关交互状态
  const [isAiAdviceOpen, setIsAiAdviceOpen] = useState(true);
  const [aiTab, setAiTab] = useState<'suggestions' | 'prompts' | 'lightroom'>('suggestions');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [adoptedFeedback, setAdoptedFeedback] = useState(false);

  const currentInsight = currentPhoto ? insights[currentPhoto.id] : null;

  // 根据当前照片 EXIF、AI 缺陷、人脸及故事线题材动态生成修图建议
  const advice = useMemo(() => {
    if (!currentPhoto) return null;
    return generateRetouchAdvice(currentPhoto, currentInsight, activePresetId);
  }, [currentPhoto, currentInsight, activePresetId]);

  if (!isOpen || !currentPhoto) return null;

  const annotation = getAnnotation(currentPhoto.id);
  const presetTags = annotation.presetTags || [];
  const pins = annotation.pins || [];
  const comment = annotation.comment || '';

  const handleToggleTag = (tag: string) => {
    const nextTags = presetTags.includes(tag)
      ? presetTags.filter((t) => t !== tag)
      : [...presetTags, tag];
    setAnnotation(currentPhoto.id, {
      ...annotation,
      presetTags: nextTags,
    });
  };

  const handleCommentChange = (text: string) => {
    setAnnotation(currentPhoto.id, {
      ...annotation,
      comment: text,
    });
  };

  const handleUpdatePin = (pinId: string, updates: Partial<VisualPin>) => {
    const nextPins = pins.map((pin) => (pin.id === pinId ? { ...pin, ...updates } : pin));
    setAnnotation(currentPhoto.id, {
      ...annotation,
      pins: nextPins,
    });
  };

  const handleDeletePin = (pinId: string) => {
    const remaining = pins.filter((pin) => pin.id !== pinId);
    // 重新编号
    const reindexed = remaining.map((pin, idx) => ({ ...pin, pinIndex: idx + 1 }));
    setAnnotation(currentPhoto.id, {
      ...annotation,
      pins: reindexed,
    });
    if (activePinId === pinId) {
      setActivePinId(null);
    }
  };

  const handleAddCenterPin = () => {
    const nextIndex = pins.length + 1;
    const newPin = createPin(0.5, 0.5, nextIndex, undefined, '');
    setAnnotation(currentPhoto.id, {
      ...annotation,
      pins: [...pins, newPin],
    });
    setActivePinId(newPin.id);
  };

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((curr) => (curr === key ? null : curr));
      }, 1800);
    } catch (err) {
      console.error('复制失败', err);
    }
  };

  const handleAdoptAdvice = () => {
    if (!advice) return;

    // 1. 合并推荐标签
    const nextTags = Array.from(new Set([...presetTags, ...advice.recommendedTags]));

    // 2. 格式化 AI 修图结构化建议
    const suggestionsList = advice.suggestions
      .map((s) => `• [${CATEGORY_MAP[s.category]?.label || s.category}] ${s.title}: ${s.detail}`)
      .join('\n');
    const lrParamStr = `[LR基准] 曝光:${advice.lightroomParams.exposure} 高光:${advice.lightroomParams.highlights} 阴影:${advice.lightroomParams.shadows} 纹理:+${advice.lightroomParams.texture} 清晰度:+${advice.lightroomParams.clarity}`;

    const aiNote = `【AI 修图建议 · ${advice.summary}】\n${suggestionsList}\n${lrParamStr}`;

    let nextComment = comment.trim();
    if (!nextComment) {
      nextComment = aiNote;
    } else if (nextComment.includes('【AI 修图建议')) {
      nextComment = nextComment.replace(/【AI 修图建议[\s\S]*?(?=\n\n|$)/, aiNote);
    } else {
      nextComment = `${nextComment}\n\n${aiNote}`;
    }

    setAnnotation(currentPhoto.id, {
      ...annotation,
      presetTags: nextTags,
      comment: nextComment,
    });

    setAdoptedFeedback(true);
    setTimeout(() => setAdoptedFeedback(false), 2000);
  };

  return (
    <aside
      role="dialog"
      aria-label="修图与批注要求"
      className="relative z-30 flex h-full w-[clamp(19rem,26vw,25rem)] max-w-[45%] shrink-0 flex-col overflow-hidden border-l border-dark-700 bg-dark-900 text-slate-200 shadow-2xl font-sans animate-in slide-in-from-right-4 duration-200"
    >
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-750 bg-dark-850/90 shrink-0">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100">修图与批注要求</h3>
            <p className="text-[10px] text-slate-400 font-mono truncate max-w-[160px]">
              {currentPhoto.filename}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-700 transition-colors cursor-pointer"
          title="关闭面板 (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
        {/* === ✨ AI 智能修图顾问卡片 === */}
        {advice && (
          <div className="rounded-2xl border border-indigo-500/30 bg-gradient-to-b from-indigo-950/40 via-dark-850/90 to-dark-850/70 p-3 shadow-md space-y-2.5 transition-all">
            {/* 卡片头部 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-md bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 shadow-inner">
                  <Sparkles className="w-3.5 h-3.5" />
                </span>
                <span className="font-bold text-xs bg-gradient-to-r from-indigo-200 via-indigo-100 to-violet-300 bg-clip-text text-transparent">
                  AI 智能修图顾问
                </span>
              </div>
              <button
                onClick={() => setIsAiAdviceOpen(!isAiAdviceOpen)}
                className="p-1 text-slate-400 hover:text-slate-200 hover:bg-dark-750 rounded-lg transition-colors cursor-pointer"
                title={isAiAdviceOpen ? '收起建议' : '展开建议'}
              >
                {isAiAdviceOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {isAiAdviceOpen && (
              <div className="space-y-2.5 pt-0.5">
                {/* 智能诊断核心摘要 */}
                <div className="p-2 rounded-xl bg-dark-900/70 border border-indigo-500/20 text-[11px] text-slate-300 leading-relaxed">
                  <p>{advice.summary}</p>
                </div>

                {/* 标签栏切换：建议清单 / AI 创成式提示词 / LR 参数 */}
                <div className="flex rounded-lg bg-dark-900/90 p-0.5 border border-dark-750 text-[11px]">
                  <button
                    onClick={() => setAiTab('suggestions')}
                    className={clsx(
                      'flex-1 py-1 px-1.5 rounded-md font-medium transition-all text-center cursor-pointer',
                      aiTab === 'suggestions'
                        ? 'bg-indigo-600/40 text-indigo-200 border border-indigo-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200',
                    )}
                  >
                    建议清单
                  </button>
                  <button
                    onClick={() => setAiTab('prompts')}
                    className={clsx(
                      'flex-1 py-1 px-1.5 rounded-md font-medium transition-all text-center cursor-pointer',
                      aiTab === 'prompts'
                        ? 'bg-indigo-600/40 text-indigo-200 border border-indigo-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200',
                    )}
                  >
                    AI 提示词
                  </button>
                  <button
                    onClick={() => setAiTab('lightroom')}
                    className={clsx(
                      'flex-1 py-1 px-1.5 rounded-md font-medium transition-all text-center cursor-pointer',
                      aiTab === 'lightroom'
                        ? 'bg-indigo-600/40 text-indigo-200 border border-indigo-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200',
                    )}
                  >
                    LR 基准
                  </button>
                </div>

                {/* 子视图 1：建议清单 */}
                {aiTab === 'suggestions' && (
                  <div className="space-y-2">
                    <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-0.5">
                      {advice.suggestions.map((s, idx) => {
                        const meta = CATEGORY_MAP[s.category] || CATEGORY_MAP.lighting;
                        const CategoryIcon = meta.icon;
                        return (
                          <div
                            key={idx}
                            className="p-2 rounded-xl bg-dark-900/60 border border-dark-750 text-[11px] space-y-1"
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center space-x-1.5">
                                <span
                                  className={clsx(
                                    'px-1.5 py-0.5 rounded text-[9px] font-semibold border flex items-center space-x-1',
                                    meta.color,
                                  )}
                                >
                                  <CategoryIcon className="w-2.5 h-2.5 inline mr-0.5" />
                                  {meta.label}
                                </span>
                                <span className="font-semibold text-slate-200">{s.title}</span>
                              </div>
                              {s.recommendedTag && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/25 shrink-0">
                                  +{s.recommendedTag}
                                </span>
                              )}
                            </div>
                            <p className="text-slate-400 leading-relaxed text-[10.5px] pl-1">
                              {s.detail}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {/* 一键采纳按钮 */}
                    <button
                      onClick={handleAdoptAdvice}
                      className={clsx(
                        'w-full py-1.5 px-3 rounded-xl font-medium text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm',
                        adoptedFeedback
                          ? 'bg-emerald-600 text-white'
                          : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white active:scale-[0.99]',
                      )}
                    >
                      {adoptedFeedback ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>已采纳建议至标签与附注 ✓</span>
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-3.5 h-3.5" />
                          <span>一键采纳到修图要求清单</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* 子视图 2：AI 创成式提示词 (Photoshop / Midjourney / Stable Diffusion) */}
                {aiTab === 'prompts' && (
                  <div className="space-y-2.5 text-[11px]">
                    {/* Photoshop 创成式填充 */}
                    <div className="p-2 rounded-xl bg-dark-900/70 border border-dark-750 space-y-1.5">
                      <div className="flex items-center justify-between text-slate-300 font-semibold">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-sky-400" />
                          Photoshop 创成式填充指令
                        </span>
                      </div>
                      <div className="space-y-1 text-[10px]">
                        <div className="p-1.5 rounded-lg bg-dark-950/80 border border-dark-800 text-slate-300 flex justify-between items-start gap-2">
                          <p className="flex-1 leading-relaxed">
                            {advice.aiPrompts.photoshopInstruction}
                          </p>
                          <button
                            onClick={() =>
                              handleCopy(advice.aiPrompts.photoshopInstruction, 'ps_zh')
                            }
                            className="p-1 rounded bg-dark-800 hover:bg-dark-700 text-slate-300 hover:text-white shrink-0 cursor-pointer"
                            title="复制中文指令"
                          >
                            {copiedKey === 'ps_zh' ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        <div className="p-1.5 rounded-lg bg-dark-950/80 border border-dark-800 text-slate-400 flex justify-between items-start gap-2 font-mono">
                          <p className="flex-1 leading-relaxed truncate">
                            {advice.aiPrompts.photoshopInstructionEn}
                          </p>
                          <button
                            onClick={() =>
                              handleCopy(advice.aiPrompts.photoshopInstructionEn, 'ps_en')
                            }
                            className="p-1 rounded bg-dark-800 hover:bg-dark-700 text-slate-300 hover:text-white shrink-0 cursor-pointer"
                            title="复制英文指令"
                          >
                            {copiedKey === 'ps_en' ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Midjourney v6 */}
                    <div className="p-2 rounded-xl bg-dark-900/70 border border-dark-750 space-y-1.5">
                      <div className="flex items-center justify-between text-slate-300 font-semibold">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-amber-400" />
                          Midjourney v6 提示词
                        </span>
                        <button
                          onClick={() => handleCopy(advice.aiPrompts.midjourneyPrompt, 'mj')}
                          className="px-2 py-0.5 rounded bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-300 text-[10px] flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === 'mj' ? (
                            <>
                              <Check className="w-2.5 h-2.5 text-emerald-400" />
                              <span>已复制</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-2.5 h-2.5" />
                              <span>复制 MJ 词</span>
                            </>
                          )}
                        </button>
                      </div>
                      <div className="p-1.5 rounded-lg bg-dark-950/80 border border-dark-800 text-[10px] text-slate-300 font-mono line-clamp-3 leading-relaxed">
                        {advice.aiPrompts.midjourneyPrompt}
                      </div>
                    </div>

                    {/* Stable Diffusion / ComfyUI */}
                    <div className="p-2 rounded-xl bg-dark-900/70 border border-dark-750 space-y-1.5">
                      <div className="flex items-center justify-between text-slate-300 font-semibold">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-purple-400" />
                          SD / ComfyUI 正反向词
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() =>
                              handleCopy(advice.aiPrompts.sdPositivePrompt, 'sd_pos')
                            }
                            className="px-1.5 py-0.5 rounded bg-dark-800 hover:bg-dark-700 text-slate-300 text-[10px] flex items-center gap-1 cursor-pointer"
                            title="复制正向 Prompt"
                          >
                            {copiedKey === 'sd_pos' ? (
                              <Check className="w-2.5 h-2.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-2.5 h-2.5" />
                            )}
                            <span>正向</span>
                          </button>
                          <button
                            onClick={() =>
                              handleCopy(advice.aiPrompts.sdNegativePrompt, 'sd_neg')
                            }
                            className="px-1.5 py-0.5 rounded bg-dark-800 hover:bg-dark-700 text-slate-300 text-[10px] flex items-center gap-1 cursor-pointer"
                            title="复制反向 Prompt"
                          >
                            {copiedKey === 'sd_neg' ? (
                              <Check className="w-2.5 h-2.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-2.5 h-2.5" />
                            )}
                            <span>反向</span>
                          </button>
                        </div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-dark-950/80 border border-dark-800 text-[10px] text-slate-300 font-mono truncate leading-relaxed">
                        {advice.aiPrompts.sdPositivePrompt}
                      </div>
                    </div>
                  </div>
                )}

                {/* 子视图 3：Lightroom / Camera Raw 基准调色参数 */}
                {aiTab === 'lightroom' && (
                  <div className="space-y-2 text-[11px]">
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="p-2 rounded-xl bg-dark-900/80 border border-dark-750 flex items-center justify-between">
                        <span className="text-slate-400 text-[10px]">曝光补偿</span>
                        <span className="font-mono font-bold text-slate-200">
                          {advice.lightroomParams.exposure}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-dark-900/80 border border-dark-750 flex items-center justify-between">
                        <span className="text-slate-400 text-[10px]">高光压暗</span>
                        <span className="font-mono font-bold text-rose-400">
                          {advice.lightroomParams.highlights}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-dark-900/80 border border-dark-750 flex items-center justify-between">
                        <span className="text-slate-400 text-[10px]">阴影提亮</span>
                        <span className="font-mono font-bold text-amber-400">
                          +{advice.lightroomParams.shadows}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-dark-900/80 border border-dark-750 flex items-center justify-between">
                        <span className="text-slate-400 text-[10px]">白色色阶</span>
                        <span className="font-mono font-bold text-slate-200">
                          +{advice.lightroomParams.whites}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-dark-900/80 border border-dark-750 flex items-center justify-between">
                        <span className="text-slate-400 text-[10px]">黑色色阶</span>
                        <span className="font-mono font-bold text-slate-200">
                          {advice.lightroomParams.blacks}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-dark-900/80 border border-dark-750 flex items-center justify-between">
                        <span className="text-slate-400 text-[10px]">纹理质感</span>
                        <span className="font-mono font-bold text-emerald-400">
                          +{advice.lightroomParams.texture}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-dark-900/80 border border-dark-750 flex items-center justify-between">
                        <span className="text-slate-400 text-[10px]">清晰度</span>
                        <span className="font-mono font-bold text-emerald-400">
                          +{advice.lightroomParams.clarity}
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-dark-900/80 border border-dark-750 flex items-center justify-between">
                        <span className="text-slate-400 text-[10px]">镜头校正</span>
                        <span className="font-mono font-bold text-indigo-400">已开启</span>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        const lrText = `Lightroom 基准值: 曝光 ${advice.lightroomParams.exposure}, 高光 ${advice.lightroomParams.highlights}, 阴影 +${advice.lightroomParams.shadows}, 纹理 +${advice.lightroomParams.texture}, 清晰度 +${advice.lightroomParams.clarity}, 镜头校正开启`;
                        handleCopy(lrText, 'lr');
                      }}
                      className="w-full py-1.5 rounded-xl bg-dark-900 hover:bg-dark-800 border border-dark-700 text-slate-300 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                    >
                      {copiedKey === 'lr' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>已复制 LR 参数文本</span>
                        </>
                      ) : (
                        <>
                          <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                          <span>复制 LR 参数基准</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 照片标签与需求 */}
        <div>
          <div className="flex items-center justify-between mb-2 text-slate-300 font-semibold">
            <div className="flex items-center space-x-1.5">
              <Tag className="w-3.5 h-3.5 text-indigo-400" />
              <span>照片标签 (点击勾选)</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {availableTags.map((tag) => {
              const isSelected = presetTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => handleToggleTag(tag)}
                  className={clsx(
                    'px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer',
                    isSelected
                      ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300 shadow-sm'
                      : 'bg-dark-800/80 border-dark-700 text-slate-400 hover:text-slate-200 hover:border-dark-600',
                  )}
                >
                  {tag}
                </button>
              );
            })}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = newTagInput.trim();
              if (trimmed) {
                addCustomTag(trimmed);
                handleToggleTag(trimmed);
                setNewTagInput('');
              }
            }}
            className="flex items-center gap-1.5"
          >
            <input
              type="text"
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              placeholder="添加自定义标签..."
              className="flex-1 px-2.5 py-1 bg-dark-900 border border-dark-700 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={!newTagInput.trim()}
              className="p-1 rounded-lg bg-dark-800 hover:bg-dark-750 border border-dark-700 text-slate-300 disabled:opacity-30 text-xs font-medium cursor-pointer"
              title="添加新标签"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>

        {/* 局部图上标注点 */}
        <div className="border-t border-dark-750 pt-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-1.5 text-slate-300 font-semibold">
              <MapPin className="w-3.5 h-3.5 text-rose-400" />
              <span>图上标注点 ({pins.length})</span>
            </div>
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setIsAddingPin(!isAddingPin)}
                className={clsx(
                  'px-2 py-0.5 rounded text-[10px] font-medium border transition-all cursor-pointer',
                  isAddingPin
                    ? 'bg-rose-500 text-white border-rose-400 animate-pulse'
                    : 'bg-dark-800 text-slate-300 border-dark-700 hover:border-dark-650',
                )}
                title="开启后直接在画面点击添加"
              >
                {isAddingPin ? '点击画面落点...' : '点图落针'}
              </button>
              <button
                onClick={handleAddCenterPin}
                className="p-1 rounded bg-dark-800 text-slate-400 hover:text-slate-200 border border-dark-700 cursor-pointer"
                title="在画面中心添加标注针"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>

          {pins.length === 0 ? (
            <div className="p-3 rounded-xl bg-dark-800/40 border border-dark-750 border-dashed text-center text-[11px] text-slate-500">
              暂未添加图上标记点。
              <br />
              点击“点图落针”后在画面具体部位点一下即可精确指示！
            </div>
          ) : (
            <div className="space-y-2">
              {pins.map((pin) => (
                <div
                  key={pin.id}
                  className={clsx(
                    'p-2.5 rounded-xl border transition-all text-[11px]',
                    activePinId === pin.id
                      ? 'bg-dark-800 border-rose-500/50 shadow-sm'
                      : 'bg-dark-850/80 border-dark-700 hover:border-dark-650',
                  )}
                  onClick={() => setActivePinId(pin.id)}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center space-x-1.5">
                      <span className="w-4 h-4 rounded-full bg-rose-500 text-white font-extrabold text-[9px] flex items-center justify-center shrink-0">
                        {pin.pinIndex}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ({(pin.x * 100).toFixed(0)}%, {(pin.y * 100).toFixed(0)}%)
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePin(pin.id);
                      }}
                      className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors cursor-pointer"
                      title="删除该标注点"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* 针对该点的具体要求 */}
                  <input
                    type="text"
                    value={pin.comment || ''}
                    placeholder="如：擦除背景电线 / 修掉碎发..."
                    onChange={(e) => handleUpdatePin(pin.id, { comment: e.target.value })}
                    className="w-full px-2 py-1 bg-dark-900 border border-dark-700 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:border-rose-500 text-xs"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 综合文字附注 */}
        <div className="border-t border-dark-750 pt-3">
          <div className="flex items-center space-x-1.5 mb-1.5 text-slate-300 font-semibold">
            <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
            <span>通用附注与说明</span>
          </div>
          <textarea
            value={comment}
            onChange={(e) => handleCommentChange(e.target.value)}
            rows={4}
            placeholder="写给修图师的整体要求（如：喜欢这张色调、整体偏胶片风等，或点击上方“一键采纳”填充）..."
            className="w-full p-2.5 bg-dark-900 border border-dark-700 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-xs resize-none leading-relaxed"
          />
        </div>
      </div>

      {/* 底部说明栏 */}
      <div className="px-4 py-2.5 border-t border-dark-750 bg-dark-850/80 text-[10px] text-slate-400 flex items-center justify-between shrink-0">
        <span className="flex items-center text-emerald-400">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          保存在项目内 · 原片不变
        </span>
        <span className="font-mono text-slate-500">按 R 快捷开关</span>
      </div>
    </aside>
  );
};
