import React, { useMemo, useState } from 'react';
import { useAlbumStore } from '../../store/albumStore';
import { useSelectionStore } from '../../store/selectionStore';
import { WorkflowScene } from '../../types/photo';
import { getAllStorylinePresets, getStorylinePreset } from '../../utils/storylinePresets';
import {
  computeRadarAnalysis,
  getPolygonCoordinates,
  pointsToSvgPath,
  RoleStatistic,
} from '../../utils/radarUtils';
import {
  Users2,
  X,
  AlertTriangle,
  CheckCircle2,
  Camera,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Tag,
} from 'lucide-react';
import clsx from 'clsx';

interface FamilyRadarModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 可视化极坐标多边形雷达图 (SVG Spider/Radar Chart)
 */
interface RadarChartProps {
  roleStats: RoleStatistic[];
  highlightedRoleId: string | null;
  onHoverRole: (id: string | null) => void;
}

const SvgRadarChart: React.FC<RadarChartProps> = ({
  roleStats,
  highlightedRoleId,
  onHoverRole,
}) => {
  const width = 280;
  const height = 240;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = 78;

  const count = roleStats.length;
  if (count < 3) return null;

  // 最大拍摄出场基准（至少为 5，避免数据量小时雷达过分扁平）
  const maxVal = Math.max(5, ...roleStats.map((r) => r.totalAppearances));

  // 背景同心圆多边形网格 (25%, 50%, 75%, 100%)
  const gridLevels = [0.25, 0.5, 0.75, 1.0];
  const gridPolygons = gridLevels.map((level) => {
    const points = getPolygonCoordinates(
      Array(count).fill(level),
      1.0,
      centerX,
      centerY,
      radius,
    );
    return pointsToSvgPath(points);
  });

  // 拍摄总出场次数多边形 (轮廓线)
  const appearancesValues = roleStats.map((r) => r.totalAppearances);
  const appearancesPoints = getPolygonCoordinates(
    appearancesValues,
    maxVal,
    centerX,
    centerY,
    radius,
  );
  const appearancesPath = pointsToSvgPath(appearancesPoints);

  // 精选入选次数多边形 (紫色渐变发光填充)
  const selectedValues = roleStats.map((r) => r.selectedCount);
  const selectedPoints = getPolygonCoordinates(
    selectedValues,
    maxVal,
    centerX,
    centerY,
    radius,
  );
  const selectedPath = pointsToSvgPath(selectedPoints);

  // 角色轴向射线与外周标签位置
  const outerCoords = getPolygonCoordinates(
    Array(count).fill(1.0),
    1.0,
    centerX,
    centerY,
    radius,
  );

  const labelCoords = getPolygonCoordinates(
    Array(count).fill(1.0),
    1.0,
    centerX,
    centerY,
    radius + 20,
  );

  return (
    <div className="relative flex flex-col items-center justify-center p-2 rounded-2xl bg-dark-950/60 border border-dark-750">
      <svg width={width} height={height} className="overflow-visible select-none">
        <defs>
          {/* 雷达面填充渐变 */}
          <radialGradient id="radarFillGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#9333ea" stopOpacity="0.15" />
          </radialGradient>
        </defs>

        {/* 同心网格层 */}
        {gridPolygons.map((path, idx) => (
          <path
            key={idx}
            d={path}
            fill="none"
            stroke="currentColor"
            className="text-dark-700/70"
            strokeWidth="1"
          />
        ))}

        {/* 轴向射线 */}
        {outerCoords.map((pt, idx) => (
          <line
            key={idx}
            x1={centerX}
            y1={centerY}
            x2={pt.x}
            y2={pt.y}
            stroke="currentColor"
            className="text-dark-750"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
        ))}

        {/* 拍摄总出场区域轮廓 (虚线灰蓝) */}
        {appearancesPath && (
          <path
            d={appearancesPath}
            fill="none"
            stroke="#64748b"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            opacity={0.65}
          />
        )}

        {/* 已入选区域 (紫色实线渐变面) */}
        {selectedPath && (
          <path
            d={selectedPath}
            fill="url(#radarFillGradient)"
            stroke="#c084fc"
            strokeWidth="2"
            className="transition-all duration-300"
          />
        )}

        {/* 顶点数据圆点与交互触发 */}
        {selectedPoints.map((pt, idx) => {
          const role = roleStats[idx];
          const isHighlighted = highlightedRoleId === role.id;
          const hasWarning =
            role.minWarningCount !== undefined &&
            role.totalAppearances > 0 &&
            role.selectedCount <= role.minWarningCount;

          return (
            <g
              key={role.id}
              className="cursor-pointer"
              onMouseEnter={() => onHoverRole(role.id)}
              onMouseLeave={() => onHoverRole(null)}
            >
              {/* 顶点外圈 (若预警则高亮报警色) */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isHighlighted ? 6 : hasWarning ? 5 : 4}
                fill={hasWarning ? '#f59e0b' : '#c084fc'}
                stroke="#0f172a"
                strokeWidth="2"
                className={clsx('transition-all duration-200', hasWarning && 'animate-pulse')}
              />
            </g>
          );
        })}

        {/* 外圈角色图标与标签 */}
        {labelCoords.map((pt, idx) => {
          const role = roleStats[idx];
          const isHighlighted = highlightedRoleId === role.id;
          const shortName = role.name.split('/')[0].trim();

          return (
            <g
              key={role.id}
              transform={`translate(${pt.x}, ${pt.y})`}
              className="cursor-pointer transition-all duration-150"
              onMouseEnter={() => onHoverRole(role.id)}
              onMouseLeave={() => onHoverRole(null)}
            >
              <text
                textAnchor="middle"
                dominantBaseline="central"
                className={clsx(
                  'text-[10px] font-medium transition-colors select-none',
                  isHighlighted ? 'fill-purple-300 font-bold text-[11px]' : 'fill-slate-400',
                )}
              >
                {role.icon} {shortName}
              </text>
            </g>
          );
        })}
      </svg>

      {/* 图例 */}
      <div className="flex items-center gap-4 text-[10px] text-slate-400 mt-1">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-slate-500 border-b border-dashed border-slate-400" />
          <span>拍摄镜头 ({maxVal}次基准)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-purple-500/30 border border-purple-400" />
          <span>已选入片量</span>
        </span>
      </div>
    </div>
  );
};

export const FamilyRadarModal: React.FC<FamilyRadarModalProps> = ({ isOpen, onClose }) => {
  const { photos, scenes, selectIndex, activePresetId } = useAlbumStore();
  const { selections } = useSelectionStore();

  const [currentGenre, setCurrentGenre] = useState<WorkflowScene>(activePresetId || 'wedding');
  const [highlightedRoleId, setHighlightedRoleId] = useState<string | null>(null);

  const presets = getAllStorylinePresets();
  const activePreset = getStorylinePreset(currentGenre);

  // 建立照片与章节场景的归属映射
  const photoChapterNames = useMemo(() => {
    const map: Record<string, string> = {};
    scenes.forEach((scene) => {
      for (let i = scene.startIndex; i <= scene.endIndex && i < photos.length; i++) {
        const photo = photos[i];
        if (photo) {
          map[photo.id] = scene.name;
        }
      }
    });
    return map;
  }, [photos, scenes]);

  // 全量多源雷达分析
  const {
    roleStats,
    totalSelectedCount,
    hasReliableRoleData,
    warningRoles,
    warningMessage,
    balanceScore,
    balanceLevel,
    balanceText,
  } = useMemo(() => {
    return computeRadarAnalysis(
      photos,
      selections,
      activePreset,
      currentGenre,
      photoChapterNames,
    );
  }, [photos, selections, activePreset, currentGenre, photoChapterNames]);

  if (!isOpen) return null;

  // 智能照片定位：优先跳至该角色尚未入选的照片，辅助快速补选
  const handleJumpToRolePhoto = (role: RoleStatistic) => {
    const targetIdx =
      role.unselectedPhotoIndices.length > 0
        ? role.unselectedPhotoIndices[0]
        : role.matchingPhotoIndices.length > 0
        ? role.matchingPhotoIndices[0]
        : role.samplePhotoIndex;

    if (targetIdx !== undefined && targetIdx >= 0) {
      selectIndex(targetIdx);
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="family-radar-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm select-none animate-in fade-in duration-150 font-sans"
    >
      <div className="w-full max-w-3xl bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-200">
        {/* 顶部标题栏与均衡度评分徽标 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-dark-750 bg-dark-850/80 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Users2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="family-radar-title" className="text-sm font-bold text-slate-100">
                  角色与主体出场均衡雷达
                </h2>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {activePreset.name}
                </span>

                {/* 出场均衡度综合评分 */}
                <div
                  className={clsx(
                    'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors',
                    balanceLevel === 'excellent' &&
                      'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
                    balanceLevel === 'good' &&
                      'bg-blue-500/15 text-blue-300 border-blue-500/30',
                    balanceLevel === 'warning' &&
                      'bg-amber-500/15 text-amber-300 border-amber-500/30',
                    balanceLevel === 'critical' &&
                      'bg-rose-500/15 text-rose-300 border-rose-500/30',
                  )}
                  title={balanceText}
                >
                  <ShieldCheck className="w-3 h-3" />
                  <span>均衡度 {balanceScore}分</span>
                  <span className="text-[9px] font-normal opacity-85">· {balanceText}</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                整合照片标签、人脸特写识别与多人合影构图 · 杜绝核心关键人物遗漏
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-750 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 题材切换选项卡 */}
        <div className="px-5 py-2 bg-dark-800/60 border-b border-dark-750 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          <span className="text-[11px] text-slate-400 font-medium shrink-0 mr-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>题材预设:</span>
          </span>
          {presets.map((preset) => {
            const isCurrent = currentGenre === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => {
                  setCurrentGenre(preset.id);
                  setHighlightedRoleId(null);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer ${
                  isCurrent
                    ? 'bg-purple-600/30 border border-purple-400/50 text-purple-200 shadow-sm shadow-purple-500/10'
                    : 'bg-dark-800/80 border border-dark-700 text-slate-400 hover:text-slate-200 hover:border-dark-600'
                }`}
              >
                <span>{preset.icon} </span>
                <span>{preset.name}</span>
              </button>
            );
          })}
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* 温馨提示与预警横幅 */}
          {!hasReliableRoleData ? (
            <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-200 space-y-1">
              <div className="flex items-center space-x-1.5 font-semibold text-blue-300">
                <Tag className="w-4 h-4 text-blue-400" />
                <span>快速标记人物：只需打标签或在人脸特写中设置</span>
              </div>
              <p className="text-[11px] text-blue-200/80 leading-relaxed">
                系统支持在工作台使用快捷标签（如打上「新娘」、「爸爸」、「主讲」等），或在人脸特写抽屉中命名人物。多人大合影会自动基于人数识别，无需繁琐人工标记。
              </p>
            </div>
          ) : warningRoles.length > 0 ? (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-1 animate-in fade-in duration-200">
              <div className="flex items-center space-x-1.5 font-semibold text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>防漏检视：发现关键主体入选偏少</span>
              </div>
              <p className="text-[11px] text-amber-200/85 leading-relaxed">
                {warningMessage}
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>当前题材的各核心角色出场均已充足入选，分布健康。</span>
            </div>
          )}

          {/* 上半部：雷达图 + 概览统计面板 */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            <div className="md:col-span-5 flex justify-center">
              <SvgRadarChart
                roleStats={roleStats}
                highlightedRoleId={highlightedRoleId}
                onHoverRole={setHighlightedRoleId}
              />
            </div>

            <div className="md:col-span-7 space-y-2.5">
              <div className="p-3.5 rounded-xl bg-dark-850/80 border border-dark-750 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-purple-400" />
                    <span>选片交付概览</span>
                  </span>
                  <span className="font-mono text-[11px] text-purple-300 font-bold">
                    已精选 {totalSelectedCount} 张
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  雷达将根据题材关键主体权重实时计算出场均衡度。点击下方各角色的「定位照片」可直接跳转到包含该人物的原片，支持优先跳转尚未入选的照片进行挑选。
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 rounded-lg bg-dark-800/60 border border-dark-750">
                  <div className="text-slate-400 text-[10px]">有明确角色照片</div>
                  <div className="text-sm font-bold text-slate-200 mt-0.5">
                    {roleStats.reduce((sum, r) => sum + r.totalAppearances, 0)} 镜头
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-dark-800/60 border border-dark-750">
                  <div className="text-slate-400 text-[10px]">待复核预警项</div>
                  <div className="text-sm font-bold text-amber-400 mt-0.5">
                    {warningRoles.length} 个角色
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 下半部：各角色出场指标卡片网格 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {roleStats.map((role) => {
              const isWarning = warningRoles.some((w) => w.id === role.id);
              const isHighlighted = highlightedRoleId === role.id;
              const conversionRate =
                role.totalAppearances > 0
                  ? Math.round((role.selectedCount / role.totalAppearances) * 100)
                  : 0;
              const shareRate =
                totalSelectedCount > 0
                  ? Math.round((role.selectedCount / totalSelectedCount) * 100)
                  : 0;

              return (
                <div
                  key={role.id}
                  onMouseEnter={() => setHighlightedRoleId(role.id)}
                  onMouseLeave={() => setHighlightedRoleId(null)}
                  className={clsx(
                    'p-3.5 rounded-xl border transition-all flex flex-col justify-between bg-dark-850/80',
                    isHighlighted
                      ? 'border-purple-400 ring-2 ring-purple-500/20 shadow-lg shadow-purple-500/10'
                      : isWarning
                      ? 'border-amber-500/50 shadow-sm shadow-amber-500/10'
                      : 'border-dark-700 hover:border-dark-650',
                  )}
                >
                  <div>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-xl shrink-0">{role.icon}</span>
                        <div>
                          <div className="font-bold text-slate-200 flex items-center gap-1.5">
                            <span>{role.name}</span>
                            {isWarning && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 text-[9px] font-bold border border-amber-500/30">
                                入选偏少
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            {role.totalAppearances > 0
                              ? `拍摄 ${role.totalAppearances} 镜头 · 占精选 ${shareRate}%`
                              : '暂无打标照片'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 进度条与指标 */}
                    <div className="space-y-1 mb-3">
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-slate-400">已入选 / 拍摄出场</span>
                        <span className="font-bold text-slate-200">
                          {role.selectedCount} / {role.totalAppearances} 张 ({conversionRate}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-dark-750 rounded-full overflow-hidden">
                        <div
                          className={clsx(
                            'h-full rounded-full transition-all duration-300',
                            isWarning ? 'bg-amber-500' : 'bg-purple-500',
                          )}
                          style={{
                            width: `${
                              role.totalAppearances > 0
                                ? Math.min(100, (role.selectedCount / role.totalAppearances) * 100)
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 卡片底栏：角色说明与智能定位按钮 */}
                  <div className="flex items-center justify-between pt-1 border-t border-dark-800">
                    <span
                      className="text-[10px] text-slate-500 truncate max-w-[150px]"
                      title={role.description}
                    >
                      {role.description}
                    </span>
                    <button
                      disabled={role.totalAppearances === 0}
                      onClick={() => handleJumpToRolePhoto(role)}
                      className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-dark-800 hover:bg-dark-700 disabled:opacity-30 text-slate-300 hover:text-purple-300 border border-dark-700 text-[10px] font-medium transition-colors cursor-pointer shrink-0"
                      title={
                        role.unselectedPhotoIndices.length > 0
                          ? `优先跳转至未入选的候选照片（待选 ${role.unselectedPhotoIndices.length} 张）`
                          : `定位至该角色的样张照片`
                      }
                    >
                      <Camera className="w-3 h-3 shrink-0" />
                      <span>定位照片</span>
                      {role.unselectedPhotoIndices.length > 0 && (
                        <span className="text-amber-400 font-bold ml-0.5">
                          ({role.unselectedPhotoIndices.length}未选)
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 底部按钮栏 */}
        <div className="px-5 py-3 border-t border-dark-750 bg-dark-850/80 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-400">
            💡 提示：按空格键 [Space] 可快速对当前定位照片执行精选入库
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer"
          >
            完成核对
          </button>
        </div>
      </div>
    </div>
  );
};
