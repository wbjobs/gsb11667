// 免打扰时段判断。时段以本地「HH:MM」墙钟时间存储，
// 判断时取当前本地时间分量，因此时区变化后结果自动正确。

// 'HH:MM' -> 分钟数（0-1439），非法输入返回 null
export function parseTime(str) {
  if (typeof str !== 'string') return null;
  const parts = str.split(':');
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

// 单个时段是否生效。start === end 视为无效时段（不生效）。
// start > end 为跨天时段（如 22:00 - 07:00）。
export function isPeriodActive(period, date = new Date()) {
  const start = parseTime(period.start);
  const end = parseTime(period.end);
  if (start === null || end === null || start === end) return false;
  const mins = date.getHours() * 60 + date.getMinutes();
  if (start < end) return mins >= start && mins < end;
  return mins >= start || mins < end; // 跨天
}

export function isCrossDay(period) {
  const start = parseTime(period.start);
  const end = parseTime(period.end);
  return start !== null && end !== null && start > end;
}

// 当前是否处于任一时段内，返回命中的时段或 null
export function activePeriod(periods, date = new Date()) {
  return periods.find(p => isPeriodActive(p, date)) || null;
}

export function isInDnd(periods, date = new Date()) {
  return activePeriod(periods, date) !== null;
}
