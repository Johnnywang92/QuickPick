import React, { useState } from 'react';
import {
  usePhotoStore,
  getFilteredProgress,
  getPhotoUncertainty,
  WorkflowScene,
  getCurrentPhotoChapter,
  getChapterStats,
} from '../../store/photoStore';
import { Camera, Aperture, Timer, Gauge, Calendar, ChevronDown, ChevronUp, Layers } from 'lucide-react';

const sceneBadges: Record<WorkflowScene, { label: string; tagClass: string }> = {
  general: { label: '通用', tagClass: 'bg-slate-700/40 text-slate-300 border-slate-600/40' },
  concert: { label: '🎤 演出', tagClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
  cosplay: { label: '🎀 Cos', tagClass: 'bg-pink-500/20 text-pink-300 border-pink-500/40' },
  conference: { label: '🏢 会议', tagClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  wedding: { label: '💍 婚礼', tagClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
};

export const PhotoInfoHud: React.FC = () => {
  const photos = usePhotoStore((state) => state.photos);
  const currentIndex = usePhotoStore((state) => state.currentIndex);
  const activeFilter = usePhotoStore((state) => state.activeFilter);
  const selectedCamera = usePhotoStore((state) => state.selectedCamera);
  const selectedLens = usePhotoStore((state) => state.selectedLens);
  const reviewOnlyUnadjudicated = usePhotoStore((state) => state.reviewOnlyUnadjudicated);
  const activeWorkflowScene = usePhotoStore((state) => state.activeWorkflowScene);
  const chapters = usePhotoStore((state) => state.chapters);
  const selectedChapterId = usePhotoStore((state) => state.selectedChapterId);
  const setChaptersModalOpen = usePhotoStore((state) => state.setChaptersModalOpen);
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const currentPhoto = photos[currentIndex];
  if (!currentPhoto) return null;

  const filterProgress = React.useMemo(() => {
    return getFilteredProgress(
      photos,
      currentIndex,
      activeFilter,
      selectedCamera,
      selectedLens,
      reviewOnlyUnadjudicated,
      activeWorkflowScene,
      selectedChapterId,
      chapters,
    );
  }, [
    photos,
    currentIndex,
    activeFilter,
    selectedCamera,
    selectedLens,
    reviewOnlyUnadjudicated,
    activeWorkflowScene,
    selectedChapterId,
    chapters,
  ]);

  const uncertainty = React.useMemo(() => {
    return currentPhoto ? getPhotoUncertainty(currentPhoto, activeWorkflowScene) : null;
  }, [currentPhoto, activeWorkflowScene]);

  const currentChapter = React.useMemo(() => {
    return getCurrentPhotoChapter(photos, currentIndex, chapters);
  }, [photos, currentIndex, chapters]);

  const chapterStats = React.useMemo(() => {
    return currentChapter ? getChapterStats(currentChapter, photos, activeWorkflowScene) : null;
  }, [currentChapter, photos, activeWorkflowScene]);

  const burstInfo = React.useMemo(() => {
    if (!currentPhoto?.burst_group_id) return null;
    const burstPhotos = photos.filter((p) => p.burst_group_id === currentPhoto.burst_group_id);
    const idx = burstPhotos.findIndex((p) => p.path === currentPhoto.path);
    return {
      index: idx >= 0 ? idx + 1 : 1,
      total: burstPhotos.length,
    };
  }, [photos, currentPhoto?.path, currentPhoto?.burst_group_id]);

  const exif = currentPhoto.exif;
  // 如果完全没有拍摄参数，显示简洁的文件名胶囊
  if (!exif || (!exif.camera_model && !exif.lens_model && !exif.aperture && !exif.shutter_speed && !exif.iso)) {
    return (
      <div className="flex items-center space-x-2 bg-dark-900/80 backdrop-blur border border-dark-700/60 px-2.5 py-1 rounded-lg text-[11px] font-mono text-slate-400 shadow-md">
        <span>{currentPhoto.filename}</span>
        {currentPhoto.is_raw && (
          <span className="text-[10px] bg-brand-600/30 text-brand-300 px-1 py-0.2 rounded font-sans">RAW</span>
        )}
        {activeWorkflowScene !== 'general' && (
          <span
            className={`text-[9px] px-1 py-0.2 rounded border font-sans font-medium shrink-0 ${sceneBadges[activeWorkflowScene].tagClass}`}
            title={`当前场景模式：${sceneBadges[activeWorkflowScene].label}`}
          >
            {sceneBadges[activeWorkflowScene].label}
          </span>
        )}
        {currentChapter && (
          <button
            onClick={() => setChaptersModalOpen(true)}
            className={`text-[9px] px-1 py-0.2 rounded border font-sans font-medium shrink-0 flex items-center space-x-0.5 cursor-pointer hover:opacity-80 transition-opacity ${
              chapterStats?.status === 'met'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                : chapterStats?.status === 'empty_warning'
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
            }`}
            title={`当前环节：${currentChapter.name} (已选 ${chapterStats?.pickedCount || 0}/${currentChapter.targetQuota} 张) - 点击打开交付配额看板`}
          >
            <span>📖 {currentChapter.name} [{chapterStats?.pickedCount || 0}/{currentChapter.targetQuota}]</span>
          </button>
        )}
        {uncertainty?.isUncertain && (
          <span
            className="text-[9px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1 py-0.2 rounded font-sans font-medium shrink-0"
            title={`争议待复核: ${uncertainty.reasons.join(' · ')}`}
          >
            待复核 [{uncertainty.reasons[0] || '争议'}]
          </span>
        )}
        {filterProgress.isFiltered && (
          <span
            className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1 py-0.2 rounded font-mono font-medium shrink-0"
            title="当前筛选条件下的相对序号与匹配总数"
          >
            筛选 [{filterProgress.filteredIndex >= 0 ? filterProgress.filteredIndex + 1 : '-'}/{filterProgress.filteredTotal}]
          </span>
        )}
        {burstInfo && burstInfo.total > 1 && (
          <span className="text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1 py-0.2 rounded font-mono font-medium">
            连拍 [{burstInfo.index}/{burstInfo.total}]
          </span>
        )}
      </div>
    );
  }

  const cameraDisplay = [exif.camera_make, exif.camera_model].filter(Boolean).join(' ');
  const lensDisplay = exif.lens_model || exif.lens_make;

  return (
    <div className="bg-dark-900/85 backdrop-blur border border-dark-700/80 rounded-xl p-2.5 text-xs text-slate-200 shadow-xl transition-all select-none max-w-sm">
      {/* 顶部机身与镜头标头 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center space-x-1.5 min-w-0">
          <Camera className="w-3.5 h-3.5 text-brand-400 shrink-0" />
          <span className="font-semibold text-slate-100 truncate text-[11px]" title={cameraDisplay || '未知机身'}>
            {cameraDisplay || '相机型号未记录'}
          </span>
          {currentPhoto.is_raw && (
            <span className="text-[9px] bg-brand-500/20 text-brand-300 border border-brand-500/30 px-1 py-0.2 rounded font-mono font-medium shrink-0">
              RAW
            </span>
          )}
          {activeWorkflowScene !== 'general' && (
            <span
              className={`text-[9px] px-1 py-0.2 rounded border font-sans font-medium shrink-0 ${sceneBadges[activeWorkflowScene].tagClass}`}
              title={`当前场景模式：${sceneBadges[activeWorkflowScene].label}`}
            >
              {sceneBadges[activeWorkflowScene].label}
            </span>
          )}
          {currentChapter && (
            <button
              onClick={() => setChaptersModalOpen(true)}
              className={`text-[9px] px-1 py-0.2 rounded border font-sans font-medium shrink-0 flex items-center space-x-0.5 cursor-pointer hover:opacity-80 transition-opacity ${
                chapterStats?.status === 'met'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : chapterStats?.status === 'empty_warning'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
              }`}
              title={`当前环节：${currentChapter.name} (已选 ${chapterStats?.pickedCount || 0}/${currentChapter.targetQuota} 张) - 点击打开交付配额看板`}
            >
              <span>📖 {currentChapter.name} [{chapterStats?.pickedCount || 0}/{currentChapter.targetQuota}]</span>
            </button>
          )}
          {uncertainty?.isUncertain && (
            <span
              className="text-[9px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1 py-0.2 rounded font-sans font-medium shrink-0"
              title={`争议待复核: ${uncertainty.reasons.join(' · ')}`}
            >
              待复核 [{uncertainty.reasons[0] || '争议'}]
            </span>
          )}
          {filterProgress.isFiltered && (
            <span
              className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1 py-0.2 rounded font-mono font-medium shrink-0"
              title="当前筛选条件下的相对序号与匹配总数"
            >
              筛选 [{filterProgress.filteredIndex >= 0 ? filterProgress.filteredIndex + 1 : '-'}/{filterProgress.filteredTotal}]
            </span>
          )}
          {burstInfo && burstInfo.total > 1 && (
            <span
              className="text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1 py-0.2 rounded font-mono font-medium shrink-0"
              title="连拍组内位置与总张数"
            >
              连拍 [{burstInfo.index}/{burstInfo.total}]
            </span>
          )}
        </div>

        <button
          onClick={() => setIsExpanded((prev) => !prev)}
          className="p-0.5 hover:bg-dark-700/70 text-slate-400 hover:text-slate-200 rounded transition-colors cursor-pointer"
          title={isExpanded ? '收起拍摄参数' : '展开拍摄参数'}
        >
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* 镜头型号行 */}
      {lensDisplay && (
        <div className="mt-1 flex items-center space-x-1.5 text-[11px] text-slate-300 pl-0.5 truncate" title={lensDisplay}>
          <Layers className="w-3 h-3 text-sky-400 shrink-0" />
          <span className="truncate font-medium">{lensDisplay}</span>
        </div>
      )}

      {/* 展开状态：曝光三要素与拍摄时间 */}
      {isExpanded && (
        <div className="mt-2 pt-2 border-t border-dark-700/60 flex flex-wrap items-center gap-1.5 text-[11px]">
          {/* 焦段 */}
          {exif.focal_length != null && !isNaN(exif.focal_length) && isFinite(exif.focal_length) && (
            <div className="flex items-center space-x-1 bg-dark-800/90 border border-dark-700 px-1.5 py-0.5 rounded font-mono text-slate-200" title="物理焦距">
              <span>{Math.round(exif.focal_length)}mm</span>
              {exif.focal_length_35mm && Math.abs(exif.focal_length_35mm - Math.round(exif.focal_length)) > 1 && (
                <span className="text-slate-400 text-[10px]">({exif.focal_length_35mm}mm等效)</span>
              )}
            </div>
          )}

          {/* 光圈 */}
          {exif.aperture != null && !isNaN(exif.aperture) && isFinite(exif.aperture) && (
            <div className="flex items-center space-x-1 bg-dark-800/90 border border-dark-700 px-1.5 py-0.5 rounded font-mono text-amber-300" title="光圈值">
              <Aperture className="w-3 h-3 text-amber-400" />
              <span>f/{exif.aperture.toFixed(exif.aperture < 10 && exif.aperture % 1 !== 0 ? 1 : 0)}</span>
            </div>
          )}

          {/* 快门 */}
          {exif.shutter_speed && (
            <div className="flex items-center space-x-1 bg-dark-800/90 border border-dark-700 px-1.5 py-0.5 rounded font-mono text-blue-300" title="快门曝光速度">
              <Timer className="w-3 h-3 text-blue-400" />
              <span>{exif.shutter_speed}</span>
            </div>
          )}

          {/* ISO */}
          {exif.iso != null && (
            <div className="flex items-center space-x-1 bg-dark-800/90 border border-dark-700 px-1.5 py-0.5 rounded font-mono text-emerald-300" title="感光度 ISO">
              <Gauge className="w-3 h-3 text-emerald-400" />
              <span>ISO {exif.iso}</span>
            </div>
          )}

          {/* 拍摄时间 */}
          {exif.date_time_original && (
            <div className="w-full mt-1 flex items-center space-x-1 text-[10px] text-slate-400 font-mono">
              <Calendar className="w-3 h-3 text-slate-500 shrink-0" />
              <span className="truncate">{exif.date_time_original}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
