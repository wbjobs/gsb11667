/* notifier.js — Notification API 封装
   职责：环境检测（支持性 / 安全上下文 / 权限）、权限申请（仅在用户手势内）、
   带指数退避重试的通知发送、Permissions API 监听权限被撤销、不支持时页内卡片降级。 */
const Notifier = (() => {
  const MAX_RETRIES = 3;

  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const isSecureContext = (() => {
    try {
      if (typeof window.isSecureContext === 'boolean') return window.isSecureContext;
      return location.protocol === 'https:' || location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1' || location.protocol === 'file:';
    } catch (e) {
      return false;
    }
  })();
  const permissionsApiSupported = typeof navigator !== 'undefined' &&
    !!navigator.permissions && typeof navigator.permissions.query === 'function';

  function permissionState() {
    if (!supported) return 'unsupported';
    if (!isSecureContext) return 'insecure';
    try {
      const p = Notification.permission;
      return p === 'granted' || p === 'denied' ? p : 'prompt';
    } catch (e) {
      return 'unknown';
    }
  }

  /* 查询 Permissions API（可能抛错：部分浏览器不支持 name:'notifications'） */
  async function queryPermissionStatus() {
    if (!permissionsApiSupported) return null;
    try {
      return await navigator.permissions.query({ name: 'notifications' });
    } catch (e) {
      return null;
    }
  }

  /* 申请权限：必须在用户手势的同步任务链中调用。
     兼容 requestPermission(callback) 老接口与 Promise 接口。 */
  function requestPermission() {
    return new Promise(resolve => {
      if (!supported) { resolve('unsupported'); return; }
      if (Notification.permission === 'granted' || Notification.permission === 'denied') {
        resolve(Notification.permission);
        return;
      }
      let settled = false;
      const done = result => {
        if (settled) return;
        settled = true;
        resolve(result === 'granted' || result === 'denied' ? result : 'prompt');
      };
      try {
        const maybePromise = Notification.requestPermission(done);
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(done, () => done(Notification.permission || 'prompt'));
        }
      } catch (e) {
        done(Notification.permission || 'prompt');
      }
    });
  }

  function uid() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* 默认图标：Canvas 生成 96x92px dataURL（铃铛），无需外部资源 */
  let cachedIcon = null;
  function defaultIcon() {
    if (cachedIcon) return cachedIcon;
    try {
      const c = document.createElement('canvas');
      c.width = 96; c.height = 96;
      const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 0, 96);
      g.addColorStop(0, '#4278ff'); g.addColorStop(1, '#2f6bff');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(0, 0, 96, 96, 18) : ctx.rect(0, 0, 96, 96);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(48, 18);
      ctx.bezierCurveTo(36, 18, 31, 29, 31, 42);
      ctx.bezierCurveTo(31, 57, 26, 62, 24, 66);
      ctx.lineTo(72, 66);
      ctx.bezierCurveTo(70, 62, 65, 57, 65, 42);
      ctx.bezierCurveTo(65, 29, 60, 18, 48, 18);
      ctx.fill();
      ctx.fillRect(42, 70, 12, 5);
      ctx.beginPath();
      ctx.arc(48, 78, 5, 0, Math.PI * 2);
      ctx.fill();
      cachedIcon = c.toDataURL('image/png');
    } catch (e) {
      cachedIcon = '';
    }
    return cachedIcon;
  }

  /* 单次创建通知，150ms 内构造抛错 / onerror 视为失败（可重试）；
     150ms 之后才触发的 onerror 通过 lateError 回调上报（不再重试）。 */
  function createOnce(options, handlers) {
    const { title, body, icon, tag, data } = options;
    const nOptions = { body: body || '', tag, data };
    if (icon) nOptions.icon = icon;
    return new Promise((resolve, reject) => {
      let notification = null;
      let finished = false;
      const timer = setTimeout(() => {
        if (!finished) { finished = true; resolve(notification); }
      }, 150);

      try {
        notification = new Notification(title, nOptions);
      } catch (e) {
        if (!finished) { finished = true; clearTimeout(timer); reject(e); }
        return;
      }

      notification.onclick = () => {
        try { window.focus(); } catch (e) { /* ignore */ }
        if (typeof handlers.onClick === 'function') handlers.onClick(notification);
      };
      notification.onclose = () => { if (typeof handlers.onClose === 'function') handlers.onClose(notification); };
      notification.onshow = () => {
        if (!finished) { finished = true; clearTimeout(timer); resolve(notification); }
      };
      notification.onerror = e => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          reject(e instanceof Error ? e : new Error('Notification onerror'));
        } else if (typeof handlers.lateError === 'function') {
          handlers.lateError(e instanceof Error ? e : new Error('Notification onerror'));
        }
      };
    });
  }

  /* 带重试的发送。成功 / 最终失败都返回结果对象，不抛异常。 */
  async function send(options, handlers = {}) {
    const payload = Object.assign({ title: '', body: '', icon: '', tag: '', data: null }, options);
    if (!supported || !isSecureContext) {
      return { ok: false, status: 'unsupported', notification: null, attempts: 0, error: new Error('当前环境不支持系统通知') };
    }
    if (Notification.permission !== 'granted') {
      return { ok: false, status: 'denied', notification: null, attempts: 0, error: new Error('通知权限未授予') };
    }

    let lastError = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const notification = await createOnce(payload, handlers);
        return { ok: true, status: 'sent', notification, attempts: attempt, error: null };
      } catch (e) {
        lastError = e;
        if (attempt < MAX_RETRIES) await delay(500 * Math.pow(2, attempt - 1));
      }
    }
    return { ok: false, status: 'failed', notification: null, attempts: MAX_RETRIES, error: lastError };
  }

  /* 页内卡片降级通知 */
  function showFallback(title, body, onClick, autoCloseMs = 8000) {
    let container = document.getElementById('fallback-stack');
    if (!container) {
      container = document.createElement('div');
      container.id = 'fallback-stack';
      container.className = 'fallback-stack';
      document.body.appendChild(container);
    }
    const card = document.createElement('div');
    card.className = 'fallback-card';
    card.setAttribute('role', 'alert');

    const t = document.createElement('div');
    t.className = 'fb-title';
    t.textContent = title || '通知';
    const b = document.createElement('div');
    b.className = 'fb-body';
    b.textContent = body || '';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'small ghost fb-close';
    closeBtn.textContent = '关闭';

    function close() {
      if (card.parentNode) card.parentNode.removeChild(card);
    }
    function activate() {
      try { window.focus(); } catch (e) { /* ignore */ }
      if (typeof onClick === 'function') onClick();
      close();
    }
    card.addEventListener('click', e => { if (e.target !== closeBtn) activate(); });
    closeBtn.addEventListener('click', close);

    card.append(t, b, closeBtn);
    container.appendChild(card);
    if (autoCloseMs > 0) setTimeout(close, autoCloseMs);
    return { close, el: card };
  }

  /* 监听权限变化（用户在站点设置中撤销/授予）。返回停止函数。 */
  async function watchPermission(onChange) {
    const status = await queryPermissionStatus();
    if (!status) return () => {};
    const handler = () => {
      try { onChange(status.state); } catch (e) { console.error(e); }
    };
    status.addEventListener('change', handler);
    // 轮询兜底：个别浏览器撤销权限时不派发 Permissions change 事件
    const timer = setInterval(() => {
      const current = permissionState();
      if (current !== 'unsupported' && current !== status.state) handler();
    }, 4000);
    return function stop() {
      status.removeEventListener('change', handler);
      clearInterval(timer);
    };
  }

  return {
    supported, isSecureContext, permissionsApiSupported,
    permissionState, queryPermissionStatus, requestPermission,
    send, showFallback, watchPermission, defaultIcon, uid
  };
})();
