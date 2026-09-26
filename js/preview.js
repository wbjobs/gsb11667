// Canvas 布局预览：按比例绘制所有屏幕及每个窗口的目标矩形。

const SCREEN_COLORS = ['#1f2937', '#111827', '#0f172a', '#18181b'];
const WINDOW_FILL = 'rgba(59, 130, 246, 0.55)';
const WINDOW_STROKE = '#93c5fd';
const OUT_FILL = 'rgba(239, 68, 68, 0.55)';
const OUT_STROKE = '#fca5a5';

export function renderPreview(canvas, screens, placements) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.width;
  const cssH = canvas.clientHeight || canvas.height;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  if (!screens.length) return;

  // 所有屏幕的联合包围盒 -> 等比缩放到画布
  const minL = Math.min(...screens.map(s => s.left));
  const minT = Math.min(...screens.map(s => s.top));
  const maxR = Math.max(...screens.map(s => s.left + s.width));
  const maxB = Math.max(...screens.map(s => s.top + s.height));
  const pad = 12;
  const scale = Math.min(
    (cssW - pad * 2) / (maxR - minL),
    (cssH - pad * 2) / (maxB - minT)
  );
  const toX = v => pad + (v - minL) * scale;
  const toY = v => pad + (v - minT) * scale;

  // 画屏幕
  screens.forEach((s, i) => {
    ctx.fillStyle = SCREEN_COLORS[i % SCREEN_COLORS.length];
    ctx.strokeStyle = s.isPrimary ? '#3b82f6' : '#4b5563';
    ctx.lineWidth = s.isPrimary ? 2 : 1;
    const x = toX(s.left), y = toY(s.top);
    const w = s.width * scale, h = s.height * scale;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '11px sans-serif';
    ctx.fillText(
      `${s.label} ${s.width}×${s.height} @${s.scaleFactor}x`,
      x + 4, y + 14
    );
  });

  // 画窗口矩形
  placements.forEach((p, i) => {
    const x = toX(p.rect.left), y = toY(p.rect.top);
    const w = p.rect.width * scale, h = p.rect.height * scale;
    ctx.fillStyle = p.outOfBounds ? OUT_FILL : WINDOW_FILL;
    ctx.strokeStyle = p.outOfBounds ? OUT_STROKE : WINDOW_STROKE;
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#fff';
    ctx.font = '11px sans-serif';
    ctx.fillText(p.label || `窗口 ${i + 1}`, x + 4, y + 13);
  });
}
