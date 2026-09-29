/* dnd.js — 免打扰时段判断（含跨天）与系统时区变化监测
   纯本地时间比较：start/end 为 "HH:MM"。end <= start 视为跨天。 */
const DND = (() => {
  function toMinutes(hhmm) {
    if (typeof hhmm !== 'string') return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  function minutesOf(date) {
    return date.getHours() * 60 + date.getMinutes();
  }

  /* 当前是否处于免打扰时段
     - 未启用 / 起止时间非法 → false
     - start === end 视为"未设置时段"（0 时长），不拦截
     - start < end：同日区间 [start, end)
     - start > end：跨天区间（start→24:00 与 00:00→end） */
  function isWithin(settings, now) {
    if (!settings || !settings.enabled) return false;
    const start = toMinutes(settings.start);
    const end = toMinutes(settings.end);
    if (start === null || end === null) return false;
    if (start === end) return false;
    const cur = minutesOf(now);
    if (start < end) return cur >= start && cur < end;
    return cur >= start || cur < end;
  }

  /* 距离下一次状态切换的时刻：{ at: Date, state: 'active'|'inactive' }
     - active → 下一次变 inactive（end）
     - inactive → 下一次变 active（start） */
  function nextTransition(settings, now) {
    if (!settings || !settings.enabled) return null;
    const start = toMinutes(settings.start);
    const end = toMinutes(settings.end);
    if (start === null || end === null || start === end) return null;

    const active = isWithin(settings, now);
    const boundaryMin = active ? end : start;
    const next = new Date(now);
    next.setSeconds(0, 0);
    next.setHours(0, 0, 0, 0);
    next.setMinutes(boundaryMin);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    return { at: next, state: active ? 'inactive' : 'active' };
  }

  function describeCountdown(target, now) {
    let diff = Math.max(0, target.getTime() - now.getTime());
    const mins = Math.floor(diff / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h} 小时 ${m} 分钟` : `${m} 分钟`;
  }

  /* 当前 IANA 时区标签，拿不到时退化为 UTC 偏移描述 */
  function timezoneLabel() {
    try {
      if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz) return tz;
      }
    } catch (e) { /* ignore */ }
    const off = -new Date().getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    const abs = Math.abs(off);
    return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  }

  /* 监测系统时区变化（用户修改系统时区 / 夏令时切换）。
     页面 visibilitychange / focus 时立即复核；另起 10s 轮询兜底。 */
  function watchTimezone(onChange) {
    let offset = new Date().getTimezoneOffset();
    let label = timezoneLabel();
    function check() {
      const current = new Date().getTimezoneOffset();
      const currentLabel = timezoneLabel();
      if (current !== offset || currentLabel !== label) {
        const prevOffset = offset;
        const prevLabel = label;
        offset = current;
        label = currentLabel;
        try {
          onChange({ oldOffset: prevOffset, newOffset: current,
                     oldTimezone: prevLabel, timezone: currentLabel });
        } catch (e) { console.error(e); }
      }
    }
    const timer = setInterval(check, 10000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return function stop() {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }

  return { toMinutes, minutesOf, isWithin, nextTransition, describeCountdown, timezoneLabel, watchTimezone };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = DND;
