import React, { useEffect, useRef, useState } from 'react';
import { useAlbumStore } from '../../store/albumStore';
import { useInsightStore } from '../../store/insightStore';
import { usePreviewStore } from '../../store/previewStore';
import { FaceInfo } from '../../types/photo';
import { getStorylinePreset } from '../../utils/storylinePresets';
import {
  Users,
  Pin,
  Sparkles,
  AlertTriangle,
  Camera,
  Heart,
  ChevronDown,
  Tag,
  Check,
  X,
} from 'lucide-react';

interface FaceCropProps {
  face: FaceInfo;
  imageUrl: string;
  rank: number;
  isSelected: boolean;
  onFocus: () => void;
  onTogglePin: (e: React.MouseEvent) => void;
  onUpdateLabel: (newLabel: string) => void;
  suggestedRoles: { id: string; name: string; icon: string }[];
}

const FaceCropCard: React.FC<FaceCropProps> = ({
  face,
  imageUrl,
  rank,
  isSelected,
  onFocus,
  onTogglePin,
  onUpdateLabel,
  suggestedRoles,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [tempLabel, setTempLabel] = useState('');

  useEffect(() => {
    if (!canvasRef.current || !imageUrl) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => {
      const imgW = img.naturalWidth || 1600;
      const imgH = img.naturalHeight || 1066;

      // 增加 35% 边距，让肖像与眼神更自然自然
      const marginFactor = 0.35;
      const facePixelW = face.width * imgW;
      const facePixelH = face.height * imgH;

      const cropW = facePixelW * (1 + marginFactor * 2);
      const cropH = facePixelH * (1 + marginFactor * 2);
      const cropX = Math.max(0, face.x * imgW - facePixelW * marginFactor);
      const cropY = Math.max(0, face.y * imgH - facePixelH * marginFactor);

      canvas.width = 120;
      canvas.height = 120;

      ctx.clearRect(0, 0, 120, 120);
      ctx.drawImage(
        img,
        cropX,
        cropY,
        Math.min(cropW, imgW - cropX),
        Math.min(cropH, imgH - cropY),
        0,
        0,
        120,
        120
      );
    };
  }, [face, imageUrl]);

  // 眼睛开合度语义状态
  const isEyeClosed = face.eye_open_score < 0.35;
  const isEyeSquint = face.eye_open_score >= 0.35 && face.eye_open_score < 0.70;

  return (
    <div
      onClick={onFocus}
      className={`group relative flex flex-col items-center bg-dark-800/90 hover:bg-dark-750 p-2 rounded-xl border transition-all cursor-pointer select-none shrink-0 w-[128px] ${
        isSelected
          ? 'border-brand-500 ring-2 ring-brand-500/40 shadow-lg shadow-brand-500/20'
          : face.is_pinned
          ? 'border-amber-500/50 shadow-md shadow-amber-500/10'
          : isEyeClosed
          ? 'border-rose-500/60 shadow-md shadow-rose-500/10'
          : 'border-dark-700 hover:border-dark-600'
      }`}
    >
      {/* 顶部标签：排位与主角钉选 */}
      <div className="w-full flex items-center justify-between mb-1.5 px-0.5 text-[10px]">
        <span
          className={`font-mono font-bold px-1.5 py-0.2 rounded ${
            face.is_pinned
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : 'bg-dark-700 text-slate-400'
          }`}
        >
          #{rank}
        </span>

        <button
          onClick={onTogglePin}
          title={face.is_pinned ? '取消主角钉选' : '钉选为核心主角 (连拍自动记忆)'}
          className={`p-1 rounded transition-colors ${
            face.is_pinned
              ? 'text-amber-400 hover:text-amber-300'
              : 'text-slate-500 hover:text-amber-300'
          }`}
        >
          <Pin className={`w-3.5 h-3.5 ${face.is_pinned ? 'fill-amber-400' : ''}`} />
        </button>
      </div>

      {/* 1:1 人脸切片特写 Canvas */}
      <div className="relative w-[110px] h-[110px] rounded-lg overflow-hidden bg-dark-900 border border-dark-700/80 shadow-inner flex items-center justify-center">
        <canvas ref={canvasRef} className="w-full h-full object-cover" />

        {/* 闭眼高危警示光圈 */}
        {isEyeClosed && (
          <div className="absolute inset-0 border-2 border-rose-500 animate-pulse rounded-lg pointer-events-none" />
        )}
      </div>

      {/* 底部信息指标 */}
      <div className="w-full mt-2 space-y-1 relative">
        <div className="flex items-center justify-between text-[11px] gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsEditingLabel(true);
              setTempLabel(face.label && !/^人物\s*#?\d+$/i.test(face.label) ? face.label : '');
            }}
            title="点击标记或更改人物角色身份标签"
            className="flex items-center space-x-1 truncate font-medium text-[11px] text-slate-300 hover:text-brand-300 transition-colors cursor-pointer group/lbl text-left min-w-0"
          >
            <span className="truncate">{face.label || `人物 #${rank}`}</span>
            <Tag className="w-2.5 h-2.5 text-slate-500 opacity-60 group-hover/lbl:opacity-100 shrink-0" />
          </button>
          <span
            className={`font-mono text-[10px] px-1 rounded shrink-0 ${
              face.sharpness >= 80
                ? 'text-emerald-400 bg-emerald-500/10'
                : face.sharpness >= 50
                ? 'text-amber-400 bg-amber-500/10'
                : 'text-rose-400 bg-rose-500/10'
            }`}
          >
            锐度 {Math.round(face.sharpness)}
          </span>
        </div>

        {/* 快捷角色身份编辑气泡 */}
        {isEditingLabel && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-52 bg-dark-900 border border-dark-650 rounded-xl p-2.5 shadow-2xl space-y-2 text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400">设置人物身份</span>
              <button
                type="button"
                onClick={() => setIsEditingLabel(false)}
                className="text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            {/* 常用角色快捷气泡 */}
            <div className="flex flex-wrap gap-1">
              {suggestedRoles.slice(0, 5).map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => {
                    const cleanName = role.name.split('/')[0].trim();
                    onUpdateLabel(cleanName);
                    setIsEditingLabel(false);
                  }}
                  className="px-1.5 py-0.5 rounded bg-dark-800 hover:bg-brand-600/30 text-slate-300 hover:text-brand-200 border border-dark-700 text-[10px] transition-colors cursor-pointer"
                >
                  <span>{role.icon} {role.name.split('/')[0].trim()}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 pt-1 border-t border-dark-800">
              <input
                type="text"
                value={tempLabel}
                placeholder="自定义姓名/身份"
                onChange={(e) => setTempLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onUpdateLabel(tempLabel);
                    setIsEditingLabel(false);
                  } else if (e.key === 'Escape') {
                    setIsEditingLabel(false);
                  }
                }}
                className="flex-1 min-w-0 bg-dark-950 border border-dark-700 rounded px-1.5 py-0.5 text-[10px] text-slate-200 focus:outline-none focus:border-brand-500"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  onUpdateLabel(tempLabel);
                  setIsEditingLabel(false);
                }}
                className="p-1 rounded bg-brand-600 hover:bg-brand-500 text-white cursor-pointer"
                title="保存"
              >
                <Check className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* 睁闭眼状态指示器 */}
        <div
          className={`flex items-center justify-center space-x-1 py-0.5 rounded text-[10px] font-medium border ${
            isEyeClosed
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              : isEyeSquint
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isEyeClosed ? 'bg-rose-400' : isEyeSquint ? 'bg-amber-400' : 'bg-emerald-400'
            }`}
          />
          <span>
            {isEyeClosed
              ? `闭眼 (${Math.round(face.eye_open_score * 100)}%)`
              : isEyeSquint
              ? `微闭 (${Math.round(face.eye_open_score * 100)}%)`
              : `睁眼 (${Math.round(face.eye_open_score * 100)}%)`}
          </span>
        </div>
      </div>
    </div>
  );
};

export const FaceLoupe: React.FC = () => {
  const { photos, currentIndex, activePresetId } = useAlbumStore();
  const { currentPreviewUrl } = usePreviewStore();
  const {
    isFaceLoupeOpen,
    toggleFaceLoupe,
    faceReviewPreset,
    setFaceReviewPreset,
    focusedFace,
    focusFace,
    togglePinFace,
    setFaceLabel,
  } = useInsightStore();

  const activePreset = getStorylinePreset(activePresetId);
  const currentPhoto = photos[currentIndex];
  if (!currentPhoto) return null;

  const faces = currentPhoto.faces || [];
  if (faces.length === 0) return null;

  // 严格归一化优先级 Top 6
  const topFaces = faces.slice(0, 6);
  const backgroundFaces = faces.slice(6);
  const backgroundClosedEyeFace = backgroundFaces.find((f) => f.eye_open_score < 0.35);

  if (!isFaceLoupeOpen) {
    return (
      <button
        onClick={toggleFaceLoupe}
        className="flex items-center space-x-2 px-3 py-1.5 bg-dark-800/90 hover:bg-dark-750 text-slate-200 border border-dark-700/90 rounded-xl shadow-xl backdrop-blur-md transition-all cursor-pointer text-xs group"
        title="展开人脸联动特写抽屉 [F]"
      >
        <Users className="w-4 h-4 text-brand-400 group-hover:scale-110 transition-transform" />
        <span className="font-semibold">人脸特写 ({faces.length})</span>
        {faces.some((f) => f.eye_open_score < 0.35) && (
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
        )}
      </button>
    );
  }

  return (
    <div className="w-full max-w-4xl bg-dark-850/95 backdrop-blur-xl border border-dark-700/90 rounded-2xl shadow-2xl p-3 flex flex-col space-y-2.5 transition-all text-slate-200 select-none animate-in fade-in slide-in-from-bottom-2 duration-150">
      {/* 顶部控制栏与场景预设选择 */}
      <div className="flex items-center justify-between border-b border-dark-700/60 pb-2 px-1 text-xs">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 font-bold text-slate-100">
            <Users className="w-4 h-4 text-brand-400" />
            <span>Face Loupe 人脸特写联动</span>
            <span className="font-mono text-[11px] bg-dark-700 px-2 py-0.5 rounded-full text-slate-400">
              Top {topFaces.length} / 共 {faces.length} 人
            </span>
          </div>

          {/* 3 大场景预设微调切换 */}
          <div className="flex items-center space-x-1 bg-dark-800 p-0.5 rounded-lg border border-dark-700 text-[11px]">
            <button
              onClick={() => setFaceReviewPreset('group')}
              className={`flex items-center space-x-1 px-2 py-0.5 rounded transition-all ${
                faceReviewPreset === 'group'
                  ? 'bg-brand-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="大合影场景：全员睁眼一票否决制"
            >
              <Users className="w-3 h-3" />
              <span>大合影</span>
            </button>

            <button
              onClick={() => setFaceReviewPreset('candid')}
              className={`flex items-center space-x-1 px-2 py-0.5 rounded transition-all ${
                faceReviewPreset === 'candid'
                  ? 'bg-brand-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="婚礼抓拍场景：重抓取真情实感与生动表情"
            >
              <Heart className="w-3 h-3" />
              <span>婚礼抓拍</span>
            </button>

            <button
              onClick={() => setFaceReviewPreset('portrait')}
              className={`flex items-center space-x-1 px-2 py-0.5 rounded transition-all ${
                faceReviewPreset === 'portrait'
                  ? 'bg-brand-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="肖像摆拍场景：重瞳孔极限合焦锐度"
            >
              <Camera className="w-3 h-3" />
              <span>肖像摆拍</span>
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* 未入榜背景人脸闭眼报警浮动标签 */}
          {backgroundClosedEyeFace && (
            <button
              onClick={() => focusFace(backgroundClosedEyeFace)}
              className="flex items-center space-x-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] hover:bg-rose-500/30 transition-colors animate-pulse cursor-pointer"
              title="点击在画布中瞬间聚焦到该闭眼背景人物"
            >
              <AlertTriangle className="w-3 h-3" />
              <span>背景有闭眼 ({backgroundClosedEyeFace.label})</span>
            </button>
          )}

          <button
            onClick={toggleFaceLoupe}
            className="p-1 hover:bg-dark-750 rounded text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            title="收起特写抽屉 [F]"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Top 6 关键人脸切片横向滚动列表 */}
      <div className="flex items-center space-x-2.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-dark-700">
        {topFaces.map((face, index) => (
          <FaceCropCard
            key={face.id}
            face={face}
            imageUrl={currentPreviewUrl || ''}
            rank={index + 1}
            isSelected={focusedFace?.id === face.id}
            onFocus={() => focusFace(face)}
            onTogglePin={(e) => {
              e.stopPropagation();
              togglePinFace(currentPhoto.id, face.id);
            }}
            onUpdateLabel={(newLabel) => {
              setFaceLabel(currentPhoto.id, face.id, newLabel);
            }}
            suggestedRoles={activePreset.roles}
          />
        ))}
      </div>

      {/* 底部操作快捷提示 */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 px-1 pt-0.5 border-t border-dark-700/40">
        <span className="flex items-center space-x-1">
          <Sparkles className="w-3 h-3 text-brand-400" />
          <span>点击人名可直接设为新娘/主角等角色 • 点击 📌 钉选新人主角 (连拍自动继承)</span>
        </span>
        <span className="font-mono text-[10px]">快捷键 [F] 开关</span>
      </div>
    </div>
  );
};
