import { LocalPhoto, SceneChapter, UserSelection } from '../types/photo';
import { parseAnnotation } from './annotationUtils';

export interface ReportPhotoItem {
  photo: LocalPhoto;
  selection: UserSelection;
  scene?: SceneChapter;
  previewUrl?: string;
}

export function generateRetouchHtmlReport(
  projectName: string,
  items: ReportPhotoItem[],
  generatedAt = new Date().toLocaleString('zh-CN', { hour12: false }),
): string {
  const totalCount = items.length;
  const itemsWithAnnotations = items.filter((item) => {
    const ann = parseAnnotation(item.selection.note);
    return (
      (ann.pins && ann.pins.length > 0) ||
      (ann.presetTags && ann.presetTags.length > 0) ||
      Boolean(ann.comment && ann.comment.trim().length > 0)
    );
  });

  const cardsHtml = items
    .map((item, idx) => {
      const ann = parseAnnotation(item.selection.note);
      const pins = ann.pins || [];
      const tags = ann.presetTags || [];
      const hasPins = pins.length > 0;
      const hasTags = tags.length > 0;
      const hasComment = Boolean(ann.comment && ann.comment.trim());
      const hasRequirement = hasPins || hasTags || hasComment;

      const exif = item.photo.exif;
      const exifList = [
        exif?.camera_model,
        exif?.lens_model,
        exif?.focal_length ? `${exif.focal_length}mm` : null,
        exif?.aperture ? `f/${exif.aperture}` : null,
        exif?.shutter_speed,
        exif?.iso ? `ISO ${exif.iso}` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      const sceneBadge = item.scene
        ? `<span class="badge scene-badge" style="background: ${item.scene.color}22; color: ${item.scene.color}; border: 1px solid ${item.scene.color}55;">${escapeHtml(item.scene.name)}</span>`
        : '';

      const tagsHtml = tags
        .map((tag) => `<span class="badge tag-badge">${escapeHtml(tag)}</span>`)
        .join(' ');

      const pinsHtml = pins
        .map(
          (pin) => `
          <div class="pin-item">
            <span class="pin-num">${pin.pinIndex}</span>
            <div class="pin-content">
              ${pin.tag ? `<strong class="pin-tag">[${escapeHtml(pin.tag)}]</strong>` : ''}
              <span>${escapeHtml(pin.comment || '无具体文字要求')}</span>
              <span class="pin-coord">(位置: ${(pin.x * 100).toFixed(0)}%, ${(pin.y * 100).toFixed(0)}%)</span>
            </div>
          </div>
        `,
        )
        .join('');

      const pinsOverlayHtml = pins
        .map(
          (pin) => `
          <div class="pin-marker" style="left: ${(pin.x * 100).toFixed(1)}%; top: ${(pin.y * 100).toFixed(1)}%;">
            ${pin.pinIndex}
          </div>
        `,
        )
        .join('');

      return `
      <article class="photo-card ${hasRequirement ? 'has-retouch' : ''}" data-has-req="${hasRequirement ? '1' : '0'}" data-scene="${escapeHtml(item.scene?.name || '全部')}">
        <header class="card-header">
          <div class="header-left">
            <span class="index-badge">#${idx + 1}</span>
            <span class="filename" title="${escapeHtml(item.photo.filename)}">${escapeHtml(item.photo.filename)}</span>
            <button class="copy-btn" data-copy-text="${escapeHtml(item.photo.filename)}" onclick="copyText(this.dataset.copyText || '')">复制文件名</button>
          </div>
          <div class="header-right">
            ${sceneBadge}
          </div>
        </header>

        <div class="card-body">
          <div class="thumb-container">
            <div class="thumb-placeholder">
              <span>${escapeHtml(item.photo.format.toUpperCase())} 原片</span>
              <span class="thumb-hint">${escapeHtml(item.photo.filename)}</span>
            </div>
            ${pinsOverlayHtml}
          </div>

          <div class="info-container">
            ${exifList ? `<div class="exif-row">${escapeHtml(exifList)}</div>` : ''}

            ${
              hasTags
                ? `
              <div class="tags-row">
                <span class="row-label">精修要求：</span>
                ${tagsHtml}
              </div>
            `
                : ''
            }

            ${
              hasPins
                ? `
              <div class="pins-section">
                <span class="row-label">局部标注点：</span>
                <div class="pins-list">${pinsHtml}</div>
              </div>
            `
                : ''
            }

            ${
              hasComment
                ? `
              <div class="comment-box">
                <span class="comment-label">客户附注：</span>
                <p class="comment-text">${escapeHtml(ann.comment || '')}</p>
              </div>
            `
                : ''
            }

            ${
              !hasRequirement
                ? `
              <div class="no-req-hint">
                <span>无特殊精修要求 · 正常标准调色与面部精修即可</span>
              </div>
            `
                : ''
            }
          </div>
        </div>
      </article>
      `;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QuickPick 精修指示单 - ${escapeHtml(projectName)}</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --accent: #f59e0b;
      --pin-bg: #ef4444;
    }
    @media print {
      :root {
        --bg: #ffffff;
        --card-bg: #ffffff;
        --border: #e2e8f0;
        --text: #0f172a;
        --text-muted: #64748b;
        --primary: #0284c7;
        --accent: #d97706;
      }
      .no-print { display: none !important; }
      body { padding: 0 !important; background: white !important; }
      .photo-card { break-inside: avoid; border: 1px solid #cbd5e1 !important; margin-bottom: 16px !important; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 24px;
      line-height: 1.5;
    }
    .container { max-width: 1040px; margin: 0 auto; }
    .header-banner {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    }
    .banner-top { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; }
    h1 { font-size: 22px; font-weight: 700; color: var(--text); }
    .subtitle { font-size: 13px; color: var(--text-muted); margin-top: 4px; }
    .stats-row { display: flex; gap: 16px; margin-top: 16px; flex-wrap: wrap; }
    .stat-pill {
      background: rgba(255,255,255,0.05);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 8px 14px;
      font-size: 13px;
    }
    .stat-num { font-weight: 700; color: var(--primary); margin-left: 4px; }
    .btn-group { display: flex; gap: 10px; }
    button {
      background: var(--primary);
      color: #0f172a;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    button:hover { opacity: 0.9; transform: translateY(-1px); }
    .filter-bar {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      align-items: center;
      flex-wrap: wrap;
    }
    .filter-btn {
      background: rgba(255,255,255,0.05);
      color: var(--text-muted);
      border: 1px solid var(--border);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
    }
    .filter-btn.active {
      background: var(--primary);
      color: #0f172a;
      border-color: var(--primary);
    }
    .photo-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 16px;
      overflow: hidden;
      transition: border-color 0.2s;
    }
    .photo-card.has-retouch {
      border-left: 4px solid var(--accent);
    }
    .card-header {
      padding: 12px 16px;
      background: rgba(0,0,0,0.15);
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-left { display: flex; align-items: center; gap: 10px; }
    .index-badge { font-size: 12px; font-weight: 700; color: var(--primary); }
    .filename { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 14px; font-weight: 600; }
    .copy-btn {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 6px;
    }
    .copy-btn:hover { background: rgba(255,255,255,0.1); color: var(--text); }
    .card-body {
      display: grid;
      grid-template-columns: 240px 1fr;
      gap: 16px;
      padding: 16px;
    }
    @media (max-width: 640px) {
      .card-body { grid-template-columns: 1fr; }
    }
    .thumb-container {
      position: relative;
      background: #020617;
      border-radius: 8px;
      overflow: hidden;
      aspect-ratio: 3 / 2;
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .thumb-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      color: var(--text-muted);
      font-size: 11px;
    }
    .thumb-hint { font-size: 9px; opacity: 0.7; }
    .pin-marker {
      position: absolute;
      transform: translate(-50%, -50%);
      width: 28px;
      height: 28px;
      background: var(--pin-bg);
      color: white;
      border: 3px solid white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 800;
      box-shadow: 0 0 0 5px rgba(239,68,68,0.28), 0 3px 10px rgba(0,0,0,0.7);
    }
    .info-container { display: flex; flex-direction: column; gap: 10px; }
    .exif-row { font-size: 12px; color: var(--text-muted); }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
    }
    .tag-badge {
      background: rgba(56, 189, 248, 0.15);
      color: var(--primary);
      border: 1px solid rgba(56, 189, 248, 0.3);
    }
    .row-label { font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px; display: block; }
    .pins-list { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
    .pin-item {
      display: flex;
      align-items: baseline;
      gap: 8px;
      background: rgba(255,255,255,0.03);
      border: 1px solid var(--border);
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 13px;
    }
    .pin-num {
      background: var(--pin-bg);
      color: white;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .pin-tag { color: var(--accent); margin-right: 4px; }
    .pin-coord { font-size: 11px; color: var(--text-muted); margin-left: 6px; }
    .comment-box {
      background: rgba(245, 158, 11, 0.08);
      border: 1px solid rgba(245, 158, 11, 0.25);
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 13px;
    }
    .comment-label { font-size: 11px; font-weight: 700; color: var(--accent); display: block; margin-bottom: 2px; }
    .comment-text { color: var(--text); }
    .no-req-hint {
      font-size: 12px;
      color: var(--text-muted);
      font-style: italic;
      padding: 6px 0;
    }
    .toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #10b981;
      color: white;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
    }
    .toast.show { opacity: 1; }
  </style>
</head>
<body>
  <div class="container">
    <header class="header-banner">
      <div class="banner-top">
        <div>
          <h1>QuickPick 精选照片修图指示书</h1>
          <p class="subtitle">项目：${escapeHtml(projectName)} · 生成时间：${escapeHtml(generatedAt)}</p>
        </div>
        <div class="btn-group no-print">
          <button onclick="window.print()">打印 / 保存为 PDF</button>
        </div>
      </div>
      <div class="stats-row">
        <div class="stat-pill">精选入选总数：<span class="stat-num">${totalCount} 张</span></div>
        <div class="stat-pill">包含精修具体要求：<span class="stat-num" style="color: var(--accent);">${itemsWithAnnotations.length} 张</span></div>
        <div class="stat-pill">标准基础修片：<span class="stat-num">${totalCount - itemsWithAnnotations.length} 张</span></div>
      </div>
    </header>

    <div class="filter-bar no-print">
      <button class="filter-btn active" onclick="filterCards('all', this)">全部已选 (${totalCount})</button>
      <button class="filter-btn" onclick="filterCards('req', this)">仅显示有修图要求的 (${itemsWithAnnotations.length})</button>
    </div>

    <main id="cards-container">
      ${cardsHtml}
    </main>
  </div>

  <div id="toast" class="toast">已复制到剪贴板</div>

  <script>
    function copyText(text) {
      navigator.clipboard.writeText(text).then(function() {
        const toast = document.getElementById('toast');
        toast.innerText = '已复制: ' + text;
        toast.classList.add('show');
        setTimeout(function() { toast.classList.remove('show'); }, 1800);
      });
    }

    function filterCards(type, btn) {
      document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      const cards = document.querySelectorAll('.photo-card');
      cards.forEach(function(card) {
        if (type === 'all') {
          card.style.display = '';
        } else if (type === 'req') {
          card.style.display = card.dataset.hasReq === '1' ? '' : 'none';
        }
      });
    }
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
