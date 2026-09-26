/* preview.js — Canvas 布局预览：绘制屏幕与窗口矩形 */
const Preview = (() => {
  const canvas = document.getElementById('preview');
  const ctx = canvas.getContext('2d');
  let screens = [];
  let windows = [];   // 已应用或待应用的窗口矩形
  let violations = []; // 越界窗口索引
  let transform = null; // {scale, offsetX, offsetY}

  function computeTransform() {
    if (!screens.length) { transform = null; return; }
    const minL = Math.min(...screens.map(s => s.left));
    const minT = Math.min(...screens.map(s => s.top));
    const maxR = Math.max(...screens.map(s => s.left + s.width));
    const maxB = Math.max(...screens.map(s => s.top + s.height));
    const pad = 24;
    const w = maxR - minL, h = maxB - minT;
    const scale = Math.min((canvas.width - pad * 2) / w, (canvas.height - pad * 2) / h);
    transform = {
      scale,
      offsetX: pad + (canvas.width - pad * 2 - w * scale) / 2 - minL * scale,
      offsetY: pad + (canvas.height - pad * 2 - h * scale) / 2 - minT * scale
    };
  }

  function toCanvas(x, y) {
    return [x * transform.scale + transform.offsetX, y * transform.scale + transform.offsetY];
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!transform) {
      ctx.fillStyle = '#8b93a7';
      ctx.font = '14px sans-serif';
      ctx.fillText('暂无屏幕信息', 20, 30);
      return;
    }
    // 屏幕
    screens.forEach((s, i) => {
      const [x, y] = toCanvas(s.left, s.top);
      const w = s.width * transform.scale;
      const h = s.height * transform.scale;
      ctx.fillStyle = 'rgba(47,107,255,0.10)';
      ctx.strokeStyle = s.isPrimary ? '#4a80ff' : '#33507f';
      ctx.lineWidth = s.isPrimary ? 2 : 1;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = '#9db4ff';
      ctx.font = '12px sans-serif';
      const tag = s.isPrimary ? '（主屏）' : '';
      ctx.fillText(`屏幕 ${i + 1}${tag} ${s.width}×${s.height} @${s.devicePixelRatio}x`, x + 6, y + 16);
    });
    // 窗口
    windows.forEach((r, i) => {
      const bad = violations.includes(i);
      const [x, y] = toCanvas(r.x, r.y);
      const w = r.w * transform.scale;
      const h = r.h * transform.scale;
      ctx.fillStyle = bad ? 'rgba(224,85,85,0.25)' : 'rgba(111,227,165,0.22)';
      ctx.strokeStyle = bad ? '#e05555' : '#6fe3a5';
      ctx.lineWidth = 1.5;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = bad ? '#ff9a9a' : '#b9f5d6';
      ctx.font = '11px sans-serif';
      ctx.fillText(r.role || `win-${i + 1}`, x + 4, y + 14);
    });
  }

  /* 点击命中检测：返回窗口矩形索引 */
  function hitTest(canvasX, canvasY) {
    if (!transform) return -1;
    const rect = canvas.getBoundingClientRect();
    const px = (canvasX - rect.left) * (canvas.width / rect.width);
    const py = (canvasY - rect.top) * (canvas.height / rect.height);
    for (let i = windows.length - 1; i >= 0; i--) {
      const r = windows[i];
      const [x, y] = toCanvas(r.x, r.y);
      const w = r.w * transform.scale;
      const h = r.h * transform.scale;
      if (px >= x && px <= x + w && py >= y && py <= y + h) return i;
    }
    return -1;
  }

  function update(newScreens, newWindows, newViolations) {
    screens = newScreens || [];
    windows = newWindows || [];
    violations = newViolations || [];
    computeTransform();
    draw();
  }

  canvas.addEventListener('click', e => {
    const idx = hitTest(e.clientX, e.clientY);
    if (idx >= 0 && windows[idx]) WindowManager.focusByRect(windows[idx]);
  });

  return { update, draw };
})();
