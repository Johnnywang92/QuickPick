import React from 'react';
import { usePhotoStore } from '../../store/photoStore';
import { Star, Check, X, Ban, ArrowRightLeft } from 'lucide-react';

export const TriageControls: React.FC = () => {
  const {
    photos,
    currentIndex,
    setRating,
    setColorLabel,
    setPickStatus,
    autoAdvance,
    toggleAutoAdvance,
  } = usePhotoStore();

  const currentPhoto = photos[currentIndex];
  if (!currentPhoto) return null;

  return (
    <div className="flex items-center space-x-3 bg-dark-800/90 backdrop-blur border border-dark-700/80 px-3 py-1.5 rounded-xl shadow-xl">
      {/* 采纳 / 排除 标记 */}
      <div className="flex items-center space-x-1 border-r border-dark-700 pr-2">
        <button
          onClick={() => setPickStatus('Pick')}
          title="采纳 [P]"
          className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
            currentPhoto.pick_status === 'Pick'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
              : 'hover:bg-dark-700 text-slate-300'
          }`}
        >
          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>采纳 (P)</span>
        </button>

        <button
          onClick={() => setPickStatus('Reject')}
          title="排除 [X]"
          className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
            currentPhoto.pick_status === 'Reject'
              ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
              : 'hover:bg-dark-700 text-slate-300'
          }`}
        >
          <X className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>排除 (X)</span>
        </button>

        <button
          onClick={() => setPickStatus('None')}
          title="取消标记 [U]"
          className="p-1 hover:bg-dark-700 text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
        >
          <Ban className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 1 ~ 5 星级快速评选 */}
      <div className="flex items-center space-x-0.5 border-r border-dark-700 pr-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => setRating(currentPhoto.rating === star ? 0 : star)}
            title={`评 ${star} 星 [${star}]`}
            className={`p-1 rounded transition-colors ${
              star <= currentPhoto.rating
                ? 'text-amber-400 hover:text-amber-300'
                : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            <Star className="w-4 h-4 fill-current" />
          </button>
        ))}
      </div>

      {/* 色标 */}
      <div className="flex items-center space-x-1 border-r border-dark-700 pr-2">
        {[
          { name: 'Red', color: 'bg-rose-500' },
          { name: 'Yellow', color: 'bg-amber-400' },
          { name: 'Green', color: 'bg-emerald-500' },
          { name: 'Blue', color: 'bg-blue-500' },
        ].map((item) => (
          <button
            key={item.name}
            onClick={() =>
              setColorLabel(currentPhoto.color_label === item.name ? '' : item.name)
            }
            title={`色标: ${item.name}`}
            className={`w-4 h-4 rounded-full ${item.color} transition-transform ${
              currentPhoto.color_label === item.name
                ? 'ring-2 ring-white scale-110'
                : 'opacity-60 hover:opacity-100'
            }`}
          />
        ))}
      </div>

      {/* 自动跳张切换 */}
      <button
        onClick={toggleAutoAdvance}
        title="标记后自动翻至下一张 (Caps Lock 选片模式)"
        className={`flex items-center space-x-1.5 px-2 py-1 rounded-lg text-xs font-mono transition-all ${
          autoAdvance
            ? 'bg-brand-600/20 text-brand-400 border border-brand-500/40'
            : 'text-slate-400 hover:bg-dark-700'
        }`}
      >
        <ArrowRightLeft className="w-3 h-3" />
        <span>自动跳张: {autoAdvance ? 'ON' : 'OFF'}</span>
      </button>
    </div>
  );
};
