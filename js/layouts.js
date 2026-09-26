// 布局算法：输入屏幕可用区域与窗口数量，输出每个窗口的目标矩形。
// rect: { left, top, width, height }

const GAP = 8;

export function computeLayout(type, area, count) {
  if (count <= 0) return [];
  switch (type) {
    case 'grid':
      return gridLayout(area, count);
    case 'waterfall':
      return waterfallLayout(area, count);
    case 'primary-secondary':
      return primarySecondaryLayout(area, count);
    default:
      throw new Error(`未知布局类型: ${type}`);
  }
}

function gridLayout(area, count) {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cellW = Math.floor((area.width - GAP * (cols - 1)) / cols);
  const cellH = Math.floor((area.height - GAP * (rows - 1)) / rows);
  const rects = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    rects.push({
      left: area.left + col * (cellW + GAP),
      top: area.top + row * (cellH + GAP),
      width: cellW,
      height: cellH,
    });
  }
  return rects;
}

// 瀑布（级联）布局：窗口等大，依次错位排列，越界后回绕。
function waterfallLayout(area, count) {
  const width = Math.floor(area.width * 0.6);
  const height = Math.floor(area.height * 0.6);
  const offset = 32;
  const maxX = area.left + area.width - width;
  const maxY = area.top + area.height - height;
  const rects = [];
  let left = area.left;
  let top = area.top;
  for (let i = 0; i < count; i++) {
    rects.push({ left, top, width, height });
    left += offset;
    top += offset;
    if (left > maxX || top > maxY) {
      left = area.left;
      top = area.top;
    }
  }
  return rects;
}

// 主次布局：第一个窗口占左侧 2/3，其余在右侧纵向均分。
function primarySecondaryLayout(area, count) {
  if (count === 1) {
    return [{ left: area.left, top: area.top, width: area.width, height: area.height }];
  }
  const primaryW = Math.floor((area.width - GAP) * 2 / 3);
  const secondaryW = area.width - GAP - primaryW;
  const secondaryCount = count - 1;
  const secondaryH = Math.floor((area.height - GAP * (secondaryCount - 1)) / secondaryCount);
  const rects = [{
    left: area.left,
    top: area.top,
    width: primaryW,
    height: area.height,
  }];
  for (let i = 0; i < secondaryCount; i++) {
    rects.push({
      left: area.left + primaryW + GAP,
      top: area.top + i * (secondaryH + GAP),
      width: secondaryW,
      height: secondaryH,
    });
  }
  return rects;
}

// 检查矩形是否完全落在屏幕可用区域内，返回越界窗口的下标列表。
export function findOutOfBounds(rects, area) {
  const out = [];
  rects.forEach((r, i) => {
    if (
      r.left < area.left ||
      r.top < area.top ||
      r.left + r.width > area.left + area.width ||
      r.top + r.height > area.top + area.height
    ) {
      out.push(i);
    }
  });
  return out;
}

// 将越界矩形钳制回屏幕可用区域。
export function clampToArea(rect, area) {
  const width = Math.min(rect.width, area.width);
  const height = Math.min(rect.height, area.height);
  return {
    width,
    height,
    left: Math.min(Math.max(rect.left, area.left), area.left + area.width - width),
    top: Math.min(Math.max(rect.top, area.top), area.top + area.height - height),
  };
}
