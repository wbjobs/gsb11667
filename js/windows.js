/* windows.js — 子窗口生命周期管理：打开、定位、关闭检测 */
const WindowManager = (() => {
  const managed = []; // { id, win, rect, role }
  let nextId = 1;
  const listeners = { change: [] };
  let pollTimer = null;

  function onChange(fn) { listeners.change.push(fn); }
  function emitChange() {
    listeners.change.forEach(fn => fn(getOpenWindows()));
  }

  function getOpenWindows() {
    return managed.filter(m => !m.win.closed);
  }

  function ensurePolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      const before = managed.length;
      // 移除已关闭的窗口
      for (let i = managed.length - 1; i >= 0; i--) {
        if (managed[i].win.closed) managed.splice(i, 1);
      }
      if (managed.length !== before) emitChange();
      if (managed.length === 0) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }, 500);
  }

  /**
   * 按矩形列表打开/排列窗口。
   * 策略：优先复用已打开的窗口（移动+缩放），不够则新开，多余则关闭。
   * 返回 { opened, moved, closed, failed }
   */
  function applyLayout(rects, urlFactory) {
    const open = getOpenWindows();
    let opened = 0, moved = 0, closed = 0, failed = 0;

    // 多余的窗口关闭
    for (let i = rects.length; i < open.length; i++) {
      open[i].win.close();
      const idx = managed.indexOf(open[i]);
      if (idx >= 0) managed.splice(idx, 1);
      closed++;
    }

    rects.forEach((rect, i) => {
      const features = `popup=yes,left=${rect.x},top=${rect.y},width=${rect.w},height=${rect.h}`;
      if (i < open.length) {
        // 复用现有窗口
        const entry = open[i];
        try {
          entry.win.moveTo(rect.x, rect.y);
          entry.win.resizeTo(rect.w, rect.h);
          entry.rect = rect;
          entry.role = rect.role;
          moved++;
        } catch (e) {
          failed++;
        }
      } else {
        const url = urlFactory ? urlFactory(rect, i) : childUrl(rect, i);
        const win = window.open(url, `wm_win_${nextId}`, features);
        if (win) {
          managed.push({ id: nextId++, win, rect, role: rect.role });
          opened++;
        } else {
          failed++;
        }
      }
    });

    ensurePolling();
    emitChange();
    return { opened, moved, closed, failed };
  }

  /* 内置子窗口页面（data URL，展示窗口角色信息，便于人工验收） */
  function childUrl(rect, i) {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${rect.role}</title>
<style>body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;
font-family:sans-serif;background:#1b2340;color:#dfe6ff;flex-direction:column}
h1{font-size:20px;margin:0 0 8px}p{color:#8b93a7;font-size:13px}</style></head>
<body><h1>${rect.role}</h1><p>${rect.w} × ${rect.h} @ (${rect.x}, ${rect.y})</p></body></html>`;
    return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
  }

  function closeAll() {
    let n = 0;
    for (let i = managed.length - 1; i >= 0; i--) {
      if (!managed[i].win.closed) { managed[i].win.close(); n++; }
      managed.splice(i, 1);
    }
    emitChange();
    return n;
  }

  function focusByRect(rect) {
    const entry = getOpenWindows().find(m =>
      m.rect.x === rect.x && m.rect.y === rect.y && m.rect.w === rect.w && m.rect.h === rect.h);
    if (entry) entry.win.focus();
  }

  return { applyLayout, closeAll, getOpenWindows, onChange, focusByRect };
})();
