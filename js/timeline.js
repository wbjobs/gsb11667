// Canvas 免打扰可视化：24 小时横条，时段高亮，当前时间竖线。

import { parseTime, isCrossDay } from './dnd.js';

const BAR_COLOR = '#1f2937';
const DND_COLOR = 'rgba(245, 158, 11, 0.85)';
const NOW_COLOR = '#ef4444';

export function renderTimeline(canvas, periods, now = new Date()) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.width;
  const cssH = canvas.clientHeight || canvas.height;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  const padL = 34;
  const padR = 12;
  const barY = Math.floor(cssH / 2) - 14;
  const barH = 28;
  const width = cssW - padL - padR;
  const toX = mins => padL + (mins / 1440) * width;

  // 底条
  ctx.fillStyle = BAR_COLOR;
  ctx.fillRect(padL, barY, width, barH);

  // 免打扰段（跨天拆成两段绘制）
  ctx.fillStyle = DND_COLOR;
  periods.forEach(p => {
    const start = parseTime(p.start);
    const end = parseTime(p.end);
    if (start === null || end === null || start === end) return;
    if (isCrossDay(p)) {
      ctx.fillRect(toX(start), barY, toX(1440) - toX(start), barH);
      ctx.fillRect(toX(0), barY, toX(end) - toX(0), barH);
    } else {
      ctx.fillRect(toX(start), barY, toX(end) - toX(start), barH);
    }
  });

  // 刻度与小时标签
  ctx.strokeStyle = '#6b7280';
  ctx.fillStyle = '#9ca3af';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  for (let h = 0; h <= 24; h += 2) {
    const x = toX(h * 60);
    ctx.beginPath();
    ctx.moveTo(x, barY + barH);
    ctx.lineTo(x, barY + barH + 4);
    ctx.stroke();
    if (h < 24) ctx.fillText(`${h}:00`, x, barY + barH + 15);
  }

  // 当前时间竖线
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const nowX = toX(nowMins);
  ctx.strokeStyle = NOW_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(nowX, barY - 6);
  ctx.lineTo(nowX, barY + barH + 6);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.fillStyle = NOW_COLOR;
  ctx.textAlign = nowX > cssW - 40 ? 'right' : 'left';
  ctx.fillText(
    `现在 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    Math.min(Math.max(nowX + 4, padL), cssW - 4),
    barY - 10
  );
}
