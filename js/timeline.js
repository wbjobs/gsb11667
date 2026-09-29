/* timeline.js — 24 小时时间轴 Canvas 可视化
   绘制：小时刻度、DND 时段蓝色弧带（支持跨天）、当前时刻红色刻度。
   按 devicePixelRatio 适配清晰度；窗口尺寸变化与系统时区变化后重绘。 */
const Timeline = (() => {
  const PADDING = 44;
  const TRACK_H = 26;

  let canvas = null;
  let ctx = null;
  let settings = null;
  let resizeObserver = null;

  function roundRectPath(c, x, y, w, h, r) {
    const rr = Math.min(r, h / 2, w / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  /* 由设置生成一个或两个时段段（跨天时拆成两段） */
  function segments(s) {
    if (!s || !s.enabled) return [];
    const start = DND.toMinutes(s.start);
    const end = DND.toMinutes(s.end);
    if (start === null || end === null || start === end) return [];
    if (start < end) return [{ from: start, to: end }];
    return [{ from: start, to: 24 * 60 }, { from: 0, to: end }];
  }

  function resizeForDpr() {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 860;
    const cssHeight = canvas.clientHeight || 96;
    const w = Math.round(cssWidth * dpr);
    const h = Math.round(cssHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { cssWidth, cssHeight };
  }

  function draw() {
    if (!ctx) return;
    const { cssWidth, cssHeight } = resizeForDpr();
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const left = PADDING;
    const right = cssWidth - PADDING;
    const width = right - left;
    const xOf = minutes => left + (minutes / (24 * 60)) * width;
    const trackY = 34;

    /* 底槽 */
    ctx.fillStyle = '#1d2740';
    roundRectPath(ctx, left, trackY, width, TRACK_H, TRACK_H / 2);
    ctx.fill();

    /* 小时刻度 */
    ctx.strokeStyle = '#33406a';
    ctx.fillStyle = '#6b7494';
    ctx.font = '10px Consolas, Menlo, monospace';
    ctx.textAlign = 'center';
    for (let h = 0; h <= 24; h += 3) {
      const x = xOf(h * 60);
      ctx.beginPath();
      ctx.moveTo(x, trackY - 4);
      ctx.lineTo(x, trackY + TRACK_H + 4);
      ctx.lineWidth = 1;
      ctx.stroke();
      if (h < 24) ctx.fillText(String(h).padStart(2, '0') + ':00', x, trackY + TRACK_H + 18);
    }

    /* DND 弧带 */
    const segs = segments(settings);
    if (segs.length) {
      const grad = ctx.createLinearGradient(left, 0, right, 0);
      grad.addColorStop(0, 'rgba(47,107,255,.85)');
      grad.addColorStop(1, 'rgba(99,102,241,.85)');
      ctx.fillStyle = grad;
      segs.forEach(seg => {
        const x = xOf(seg.from);
        const w = Math.max(3, xOf(seg.to) - x);
        roundRectPath(ctx, x, trackY, w, TRACK_H, TRACK_H / 2);
        ctx.fill();
      });

      /* 起止时刻标签 */
      const startMin = DND.toMinutes(settings.start);
      const endMin = DND.toMinutes(settings.end);
      ctx.fillStyle = '#9db4ff';
      ctx.font = '600 10px "Segoe UI", sans-serif';
      [[startMin, settings.start], [endMin, settings.end]].forEach(([min, label]) => {
        const x = Math.min(right - 8, Math.max(left + 8, xOf(min)));
        ctx.fillText(label, x, trackY - 9);
      });
    } else {
      ctx.fillStyle = '#7c85a3';
      ctx.font = '11px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(settings && settings.enabled ? '时段未正确设置（开始=结束 或 时间非法）' : '免打扰未启用',
        (left + right) / 2, trackY + TRACK_H / 2 + 4);
    }

    /* 当前时刻红刻度 */
    const now = new Date();
    const curMin = DND.minutesOf(now);
    const curX = xOf(curMin);
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(curX, trackY - 7);
    ctx.lineTo(curX, trackY + TRACK_H + 7);
    ctx.stroke();
    ctx.fillStyle = '#f87171';
    ctx.beginPath();
    ctx.arc(curX, trackY - 10, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '600 10px "Segoe UI", sans-serif';
    const label = '现在 ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let tx = curX;
    if (curX - left < 34) tx = left + 34;
    if (right - curX < 34) tx = right - 34;
    ctx.fillText(label, tx, trackY - 17);
  }

  let rafPending = false;
  function scheduleDraw() {
    if (rafPending || !canvas) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; draw(); });
  }

  function mount(el, initialSettings) {
    canvas = el;
    ctx = canvas.getContext('2d');
    settings = initialSettings || null;
    scheduleDraw();
    window.addEventListener('resize', scheduleDraw);
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleDraw);
      resizeObserver.observe(canvas);
    }
  }

  function update(newSettings) {
    settings = newSettings || null;
    scheduleDraw();
  }

  function redraw() { scheduleDraw(); }

  return { mount, update, redraw, segments };
})();
