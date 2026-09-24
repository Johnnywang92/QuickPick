import React, { useState } from 'react';
import { useAlbumStore } from '../../store/albumStore';
import { Camera, ChevronDown, ChevronUp } from 'lucide-react';
import { isDisplayP3Supported } from '../../utils/colorSpace';

export const PhotoInfoHud: React.FC = () => {
  const { photos, currentIndex, scenes, setScenesModalOpen } = useAlbumStore();

  const [showAdvanced, setShowAdvanced] = useState(false);

  const currentPhoto = photos[currentIndex];
  if (!currentPhoto) return null;

  const exif = currentPhoto.exif;

  const currentScene = scenes.find(
    (s) => currentIndex >= s.startIndex && currentIndex <= s.endIndex,
  );

  const cameraDisplay = [exif?.camera_make, exif?.camera_model].filter(Boolean).join(' ');
  const lensDisplay = exif?.lens_model || exif?.lens_make;

  const burstPhotos = currentPhoto.burstGroupId
    ? photos.filter((p) => p.burstGroupId === currentPhoto.burstGroupId)
    : [];
  const burstIndex = currentPhoto.burstGroupId
    ? burstPhotos.findIndex((p) => p.id === currentPhoto.id) + 1
    : 1;

  return (
    <div className="flex flex-col items-start gap-1 select-none text-xs">
      {/* 默认极简 HUD 胶囊 */}
      <div className="flex items-center space-x-2 bg-dark-900/85 backdrop-blur border border-dark-700/80 px-2.5 py-1 rounded-xl shadow-lg text-[11px] font-mono text-slate-300">
        <span className="font-semibold text-slate-100">{currentPhoto.filename}</span>
        <span className="text-[9px] bg-dark-750 text-slate-400 px-1 py-0.2 rounded font-sans">
          {currentPhoto.isRaw ? 'RAW' : 'JPG'}
        </span>
        {isDisplayP3Supported() && (
          <span
            className="text-[9px] bg-rose-500/15 border border-rose-500/30 text-rose-300 px-1 py-0.2 rounded font-sans font-medium"
            title="当前屏幕已启用 Apple Display P3 广色域色彩空间"
          >
            P3
          </span>
        )}

        {currentPhoto.isRaw && (
          <span
            className="rounded bg-amber-500/15 px-1.5 py-0.2 font-sans text-[9px] text-amber-700 dark:text-amber-300 font-medium"
            title="当前显示相机写入 RAW 文件的内嵌预览，不是完整 RAW 传感器像素；请勿据此判断最终可输出分辨率"
          >
            内嵌预览
            {currentPhoto.previewWidth && currentPhoto.previewHeight
              ? ` ${currentPhoto.previewWidth}×${currentPhoto.previewHeight}`
              : ''}
            {' · 非完整 RAW 像素'}
          </span>
        )}

        {currentScene && (
          <button
            onClick={() => setScenesModalOpen(true)}
            className="text-[9px] px-1.5 py-0.2 rounded font-sans font-medium flex items-center space-x-1 cursor-pointer hover:opacity-80 transition-opacity"
            style={{ backgroundColor: `${currentScene.color}25`, color: currentScene.color }}
            title={`所属场景：${currentScene.name} (点击打开场景管理)`}
          >
            <span>{currentScene.name}</span>
          </button>
        )}

        {burstPhotos.length > 1 && (
          <span className="text-[9px] bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 px-1 py-0.2 rounded font-mono font-medium">
            连拍 [{burstIndex}/{burstPhotos.length}]
          </span>
        )}

        {/* 高级信息折叠开关 */}
        {exif && (cameraDisplay || lensDisplay || exif.aperture || exif.shutter_speed) && (
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="p-0.5 text-slate-500 hover:text-slate-300 rounded cursor-pointer ml-1"
            title={showAdvanced ? '收起拍摄参数' : '展开相机与拍摄参数 (高级信息)'}
          >
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {/* 展开的高级信息 (相机型号、镜头、曝光参数) */}
      {showAdvanced && exif && (
        <div className="bg-dark-900/90 backdrop-blur border border-dark-700/80 rounded-xl p-2.5 text-[11px] text-slate-300 shadow-xl space-y-1.5 max-w-xs animate-in fade-in slide-in-from-top-1">
          {cameraDisplay && (
            <div className="flex items-center space-x-1.5 truncate text-slate-200">
              <Camera className="w-3 h-3 text-brand-400 shrink-0" />
              <span className="font-medium truncate">{cameraDisplay}</span>
            </div>
          )}

          {lensDisplay && (
            <div className="text-slate-400 truncate pl-4 text-[10px]">
              {lensDisplay}
            </div>
          )}

          {/* 拍摄曝光四参数 */}
          <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-dark-750 font-mono text-[10px] text-slate-400 text-center">
            <div className="bg-dark-800/80 p-1 rounded">
              <div className="text-[9px] text-slate-500">焦距</div>
              <div className="font-semibold text-slate-200">{exif.focal_length ? `${Math.round(exif.focal_length)}mm` : '-'}</div>
            </div>
            <div className="bg-dark-800/80 p-1 rounded">
              <div className="text-[9px] text-slate-500">光圈</div>
              <div className="font-semibold text-slate-200">{exif.aperture ? `f/${exif.aperture}` : '-'}</div>
            </div>
            <div className="bg-dark-800/80 p-1 rounded">
              <div className="text-[9px] text-slate-500">快门</div>
              <div className="font-semibold text-slate-200">{exif.shutter_speed || '-'}</div>
            </div>
            <div className="bg-dark-800/80 p-1 rounded">
              <div className="text-[9px] text-slate-500">ISO</div>
              <div className="font-semibold text-slate-200">{exif.iso || '-'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
