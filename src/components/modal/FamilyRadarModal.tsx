import React, { useMemo, useState } from 'react';
import { useAlbumStore } from '../../store/albumStore';
import { useSelectionStore } from '../../store/selectionStore';
import { WorkflowScene } from '../../types/photo';
import { getAllStorylinePresets, getStorylinePreset } from '../../utils/storylinePresets';
import {
  Users2,
  X,
  AlertTriangle,
  CheckCircle2,
  Camera,
  Sparkles,
} from 'lucide-react';
import clsx from 'clsx';

interface FamilyRadarModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROLE_LABEL_ALIASES: Record<string, string[]> = {
  bride: ['新娘', 'bride'],
  groom: ['新郎', 'groom'],
  parents: ['父母', '长辈', '妈妈', '爸爸', '母亲', '父亲', 'parent'],
  baby: ['宝宝', '婴儿', '孩子', 'baby'],
  mom: ['妈妈', '母亲', 'mom', 'mother'],
  dad: ['爸爸', '父亲', 'dad', 'father'],
  grandparents: ['爷爷', '奶奶', '外公', '外婆', '祖父', '祖母', 'grandparent'],
  speaker: ['主讲', '演讲', 'speaker'],
  vip: ['vip', '高管', '领导'],
  lead_singer: ['主唱', '歌手', 'singer'],
  guitar_bass: ['吉他', '贝斯', 'guitar', 'bass'],
  protagonist: ['主角', 'protagonist'],
  companion: ['同行', '伴侣', 'companion'],
};

function labelMatchesRole(label: string | undefined, roleId: string, roleName: string): boolean {
  if (!label || /^人物\s*#?\d+$/i.test(label.trim())) return false;
  const normalized = label.toLocaleLowerCase();
  const nameParts = roleName
    .split(/[\/／]/)
    .map((part) => part.trim().toLocaleLowerCase())
    .filter((part) => part.length >= 2);
  const aliases = ROLE_LABEL_ALIASES[roleId] || [];
  return [...aliases, ...nameParts, roleId].some((keyword) =>
    normalized.includes(keyword.toLocaleLowerCase()),
  );
}

export const FamilyRadarModal: React.FC<FamilyRadarModalProps> = ({ isOpen, onClose }) => {
  const { photos, selectIndex, activePresetId } = useAlbumStore();
  const { selections } = useSelectionStore();

  const [currentGenre, setCurrentGenre] = useState<WorkflowScene>(activePresetId || 'wedding');
  const presets = getAllStorylinePresets();
  const activePreset = getStorylinePreset(currentGenre);

  // 汇总统计整组照片中的人脸与出场情况
  const { roleStats, totalSelectedCount, warningRoles, warningMessage, hasReliableRoleData } = useMemo(() => {
    let totalSelected = 0;

    // 从预设中获取当前题材的角色清单
    const rolesMap: Record<
      string,
      {
        id: string;
        name: string;
        icon: string;
        description: string;
        selectedCount: number;
        totalAppearances: number;
        minWarningCount?: number;
        samplePhotoId?: string;
        samplePhotoIndex?: number;
      }
    > = {};

    activePreset.roles.forEach((r) => {
      rolesMap[r.id] = {
        id: r.id,
        name: r.name,
        icon: r.icon,
        description: r.description,
        selectedCount: 0,
        totalAppearances: 0,
        minWarningCount: r.minWarningCount,
      };
    });

    let reliableMatches = 0;

    photos.forEach((photo, idx) => {
      const isSelected = selections[photo.id]?.state === 'selected';
      if (isSelected) totalSelected++;

      const faces = photo.faces || [];
      const faceCount = faces.length;

      const matchedRoleKeys = new Set<string>();
      for (const face of faces) {
        for (const role of activePreset.roles) {
          if (labelMatchesRole(face.label, role.id, role.name)) matchedRoleKeys.add(role.id);
        }
      }

      // 多人合影可以从人数可靠判断；具体人物身份只接受明确的人脸标签。
      const groupThreshold = currentGenre === 'conference' ? 8 : currentGenre === 'wedding' ? 6 : 4;
      if (faceCount >= groupThreshold) {
        const groupRole = activePreset.roles.find((role) =>
          ['group', 'family_group', 'stage_full'].includes(role.id),
        );
        if (groupRole) matchedRoleKeys.add(groupRole.id);
      }
      reliableMatches += matchedRoleKeys.size;

      // 累加数据与关联样张
      matchedRoleKeys.forEach((k) => {
        if (rolesMap[k]) {
          rolesMap[k].totalAppearances++;
          if (isSelected) rolesMap[k].selectedCount++;
          if (!rolesMap[k].samplePhotoId) {
            rolesMap[k].samplePhotoId = photo.id;
            rolesMap[k].samplePhotoIndex = idx;
          }
        }
      });
    });

    const roleList = Object.values(rolesMap);

    // 智能防漏预警
    const warnings = roleList.filter((r) => {
      if (
        totalSelected >= 15 &&
        r.totalAppearances > 0 &&
        r.minWarningCount !== undefined &&
        r.selectedCount <= r.minWarningCount
      ) {
        return true;
      }
      return false;
    });

    let message = '';
    if (warnings.length > 0) {
      if (currentGenre === 'family') {
        message = `已挑选 ${totalSelected} 张照片，但「爸爸」或「全家福大合影」入选不足 2 张。家庭摄影中爸爸常常容易被遗漏，建议排查亲子互动合影！`;
      } else if (currentGenre === 'conference') {
        message = `已挑选 ${totalSelected} 张照片，但「主讲嘉宾」或「VIP全体大合影」入选不足。峰会交付中主讲人与集体大合照是重点考核项！`;
      } else {
        message = `当前已选入 ${totalSelected} 张照片，但「父母长辈」或「大合影」入选不足 2 张。重要互动画面建议特别留心检查！`;
      }
    }

    return {
      roleStats: roleList,
      totalSelectedCount: totalSelected,
      warningRoles: warnings,
      warningMessage: message,
      hasReliableRoleData: reliableMatches > 0,
    };
  }, [photos, selections, currentGenre, activePreset]);

  if (!isOpen) return null;

  const handleJumpToSample = (idx?: number) => {
    if (idx !== undefined && idx >= 0) {
      selectIndex(idx);
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
      <div className="w-full max-w-2xl bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] text-slate-200">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-dark-750 bg-dark-850/80 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Users2 className="w-4 h-4" />
            </div>
            <div>
              <h2 id="family-radar-title" className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>角色与主体出场均衡雷达</span>
                <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {activePreset.name}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                根据明确人物标签与多人构图汇总 · 未标注身份时不会猜测具体角色
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
        <div className="px-5 py-2.5 bg-dark-800/60 border-b border-dark-750 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          <span className="text-[11px] text-slate-400 font-medium shrink-0 mr-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>题材模式:</span>
          </span>
          {presets.map((preset) => {
            const isCurrent = currentGenre === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => setCurrentGenre(preset.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0 cursor-pointer ${
                  isCurrent
                    ? 'bg-purple-600/30 border border-purple-400/50 text-purple-200'
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
          {/* 温馨预警横幅 */}
          {!hasReliableRoleData ? (
            <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/25 text-blue-900 dark:text-blue-200 space-y-1">
              <div className="flex items-center space-x-1.5 font-semibold text-blue-800 dark:text-blue-300">
                <AlertTriangle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>暂无可靠的人物身份数据</span>
              </div>
              <p className="text-[11px] text-blue-950/80 dark:text-blue-200/80 leading-relaxed">
                人脸数量不能证明人物身份，因此不会自动把单人照猜成新娘、爸爸或主讲嘉宾。请先为核心人物设置明确标签后再参考本统计。
              </p>
            </div>
          ) : warningRoles.length > 0 ? (
            <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-950 dark:text-amber-200 space-y-1">
              <div className="flex items-center space-x-1.5 font-semibold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>防漏提示：发现核心角色入选偏少</span>
              </div>
              <p className="text-[11px] text-amber-950/85 dark:text-amber-200/80 leading-relaxed">
                {warningMessage}
              </p>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 text-emerald-950 dark:text-emerald-300 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>当前有可靠标签的角色中，暂未发现低于预警阈值的情况。</span>
            </div>
          )}

          {/* 角色出场卡片网格 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {roleStats.map((role) => {
              const hasWarning = warningRoles.some((w) => w.id === role.id);
              const ratio =
                totalSelectedCount > 0
                  ? Math.round((role.selectedCount / totalSelectedCount) * 100)
                  : 0;

              return (
                <div
                  key={role.id}
                  className={clsx(
                    'p-4 rounded-xl border transition-all flex flex-col justify-between bg-dark-850/80',
                    hasWarning
                      ? 'border-amber-500/50 shadow-sm shadow-amber-500/10'
                      : 'border-dark-700 hover:border-dark-650',
                  )}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-xl">{role.icon}</span>
                      <div>
                        <div className="font-bold text-slate-200">{role.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {role.totalAppearances > 0
                            ? `识别镜头 ${role.totalAppearances} 次 · 选片占比 ${ratio}%`
                            : '尚无明确身份标签'}
                        </div>
                      </div>
                    </div>
                    {hasWarning && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold border border-amber-500/30">
                        入选偏少
                      </span>
                    )}
                  </div>

                  {/* 进度条 */}
                  <div className="space-y-1 mb-3">
                    <div className="flex justify-between text-[11px] font-mono">
                      <span className="text-slate-400">已入选</span>
                      <span className="font-bold text-slate-200">{role.selectedCount} 张</span>
                    </div>
                    <div className="w-full h-1.5 bg-dark-750 rounded-full overflow-hidden">
                      <div
                        className={clsx(
                          'h-full rounded-full transition-all duration-300',
                          hasWarning ? 'bg-amber-500' : 'bg-purple-500',
                        )}
                        style={{ width: `${Math.min(100, (role.selectedCount / 15) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* 角色说明与跳转按钮 */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-slate-500 truncate max-w-[140px]" title={role.description}>
                      {role.description}
                    </span>
                    <button
                      disabled={role.samplePhotoIndex === undefined}
                      onClick={() => handleJumpToSample(role.samplePhotoIndex)}
                      className="flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-dark-800 hover:bg-dark-700 disabled:opacity-30 text-slate-300 hover:text-purple-300 border border-dark-700 text-[10px] font-medium transition-colors cursor-pointer"
                    >
                      <Camera className="w-3 h-3" />
                      <span>定位照片</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3 bg-dark-950/60 rounded-xl border border-dark-750 text-[11px] text-slate-400 leading-relaxed">
            💡 <strong>配置指引</strong>：系统会自动根据人像检测与场景模式估算人物分布。点击「定位照片」可快速跳转到包含该角色的原片，避免在几千张照片中肉眼翻找。
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="px-5 py-3 border-t border-dark-750 bg-dark-850/80 flex justify-end shrink-0">
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
