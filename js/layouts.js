/* layouts.js — 网格 / 瀑布 / 主次布局算法 + 越界检测 */
const Layouts = (() => {
  const GAP = 8;

  /**
   * 网格布局：n 个窗口均分屏幕为接近正方形的行列网格。
   * 返回 [{x, y, w, h, role}]
   */
  function grid(count, screen) {
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const cellW = Math.floor((screen.width - GAP * (cols + 1)) / cols);
    const cellH = Math.floor((screen.height - GAP * (rows + 1)) / rows);
    const rects = [];
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      // 最后一行居中（可选美观处理：保持左对齐即可）
      rects.push({
        x: screen.left + GAP + col * (cellW + GAP),
        y: screen.top + GAP + row * (cellH + GAP),
        w: cellW,
        h: cellH,
        role: `grid-${i + 1}`
      });
    }
    return rects;
  }

  /**
   * 瀑布布局：固定列数，每个窗口放入当前累计高度最小的列。
   * 窗口高度按伪随机比例错开，形成瀑布流观感。
   */
  function waterfall(count, screen) {
    const cols = Math.min(count, Math.max(2, Math.round(Math.sqrt(count))));
    const colW = Math.floor((screen.width - GAP * (cols + 1)) / cols);
    const colHeights = new Array(cols).fill(screen.top + GAP);
    const maxH = screen.top + screen.height - GAP;
    const rects = [];
    for (let i = 0; i < count; i++) {
      // 找最短的列
      let col = 0;
      for (let c = 1; c < cols; c++) {
        if (colHeights[c] < colHeights[col]) col = c;
      }
      // 高度在屏幕高度的 30%~55% 之间按序错开
      const ratio = 0.3 + ((i * 7) % 5) * 0.0625;
      const h = Math.floor(screen.height * ratio);
      let y = colHeights[col];
      // 列内放不下则整体收敛到可用区域内
      if (y + h > maxH) {
        y = Math.max(screen.top + GAP, maxH - h);
      }
      rects.push({
        x: screen.left + GAP + col * (colW + GAP),
        y,
        w: colW,
        h,
        role: `waterfall-${i + 1}`
      });
      colHeights[col] = y + h + GAP;
    }
    return rects;
  }

  /**
   * 主次布局：第 1 个窗口占左侧约 62% 主区，其余在右侧纵向均分。
   */
  function primarySecondary(count, screen) {
    const rects = [];
    const mainW = Math.floor((screen.width - GAP * 3) * 0.62);
    const sideW = screen.width - mainW - GAP * 3;
    rects.push({
      x: screen.left + GAP,
      y: screen.top + GAP,
      w: mainW,
      h: screen.height - GAP * 2,
      role: 'primary'
    });
    const rest = count - 1;
    if (rest > 0) {
      const eachH = Math.floor((screen.height - GAP * (rest + 1)) / rest);
      for (let i = 0; i < rest; i++) {
        rects.push({
          x: screen.left + mainW + GAP * 2,
          y: screen.top + GAP + i * (eachH + GAP),
          w: sideW,
          h: eachH,
          role: `secondary-${i + 1}`
        });
      }
    }
    return rects;
  }

  const ALGORITHMS = { grid, waterfall, 'primary-secondary': primarySecondary };

  function compute(type, count, screen) {
    const fn = ALGORITHMS[type];
    if (!fn) throw new Error(`未知布局类型: ${type}`);
    return fn(count, screen);
  }

  /**
   * 越界检测：窗口矩形必须完整落在某块屏幕的可用区域内。
   * 返回 { ok, violations: [{index, rect, reason}] }
   */
  function checkBounds(rects, screens) {
    const violations = [];
    rects.forEach((r, index) => {
      const fits = screens.some(s =>
        r.x >= s.left &&
        r.y >= s.top &&
        r.x + r.w <= s.left + s.width &&
        r.y + r.h <= s.top + s.height
      );
      if (!fits) {
        violations.push({ index, rect: r, reason: '窗口未完整落在任何屏幕的可用区域内' });
      }
    });
    return { ok: violations.length === 0, violations };
  }

  /**
   * 越界修正：把矩形钳制到与其重叠面积最大的屏幕内。
   */
  function clampToScreens(rect, screens) {
    let best = screens[0];
    let bestArea = -1;
    for (const s of screens) {
      const overlapW = Math.max(0, Math.min(rect.x + rect.w, s.left + s.width) - Math.max(rect.x, s.left));
      const overlapH = Math.max(0, Math.min(rect.y + rect.h, s.top + s.height) - Math.max(rect.y, s.top));
      const area = overlapW * overlapH;
      if (area > bestArea) { bestArea = area; best = s; }
    }
    const w = Math.min(rect.w, best.width - GAP * 2);
    const h = Math.min(rect.h, best.height - GAP * 2);
    const x = Math.min(Math.max(rect.x, best.left + GAP), best.left + best.width - w - GAP);
    const y = Math.min(Math.max(rect.y, best.top + GAP), best.top + best.height - h - GAP);
    return { ...rect, x, y, w, h };
  }

  return { compute, checkBounds, clampToScreens, GAP };
})();
