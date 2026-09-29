/* app.js — 通知与免打扰：主逻辑与 UI 绑定
   权限管理 / 发送（重试）/ 免打扰拦截 / 历史（IndexedDB）/ 时区变化重绘 */
(() => {
  const $ = id => document.getElementById(id);
  const els = {
    permBtn: $('btn-request-permission'),
    permStatus: $('permission-status'),
    envWarnings: $('env-warnings'),
    envNotification: $('env-notification'),
    envSecure: $('env-secure'),
    envPermissions: $('env-permissions'),
    envIdb: $('env-idb'),
    envTimezone: $('env-timezone'),
    title: $('notif-title'),
    body: $('notif-body'),
    icon: $('notif-icon'),
    force: $('notif-force'),
    sendBtn: $('btn-send'),
    dndEnabled: $('dnd-enabled'),
    dndStart: $('dnd-start'),
    dndEnd: $('dnd-end'),
    dndStatus: $('dnd-status'),
    canvas: $('dnd-canvas'),
    clearHistoryBtn: $('btn-clear-history'),
    historyList: $('history-list'),
    log: $('log')
  };

  const DEFAULT_SETTINGS = { enabled: true, start: '22:00', end: '08:00' };
  let settings = { ...DEFAULT_SETTINGS };
  let permStatusObj = null; // Permissions API 的 PermissionStatus（若可用）

  /* ---------- 日志 ---------- */
  function log(msg, cls = 'info') {
    const line = document.createElement('div');
    line.className = 'log-' + cls;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    els.log.prepend(line);
  }

  /* ---------- 环境信息 ---------- */
  function kv(el, text, cls) {
    el.textContent = text;
    el.className = 'kv' + (cls ? ' ' + cls : '');
  }

  function renderEnv() {
    kv(els.envNotification,
      Notifier.supported ? '支持' : '不支持',
      Notifier.supported ? 'ok' : 'bad');
    kv(els.envSecure,
      Notifier.isSecureContext ? '是' : '否（Notification 在非安全上下文不可用）',
      Notifier.isSecureContext ? 'ok' : 'bad');
    kv(els.envPermissions,
      Notifier.permissionsApiSupported ? '支持（可监听权限被撤销）' : '不支持（将轮询 Notification.permission）',
      Notifier.permissionsApiSupported ? 'ok' : '');
    kv(els.envIdb,
      Store.indexedDBAvailable() ? '支持' : '不可用（历史将仅保存在内存）',
      Store.indexedDBAvailable() ? 'ok' : 'bad');
    kv(els.envTimezone, DND.timezoneLabel() +
      `（UTC${formatOffset(-new Date().getTimezoneOffset())}）`);

    const warnings = [];
    if (!Notifier.supported) {
      warnings.push(['当前浏览器不支持 Notification API，已自动降级为页内卡片通知（右下角弹窗）。', 'warn']);
    } else if (!Notifier.isSecureContext) {
      warnings.push(['当前不是安全上下文（需 HTTPS 或 localhost）。系统通知不可用，已降级为页内卡片通知。', 'warn']);
    }
    if (!Store.indexedDBAvailable()) {
      warnings.push(['IndexedDB 不可用（隐私模式或 file:// 访问），通知历史仅保留在当前页面内存中。', 'info']);
    }
    els.envWarnings.innerHTML = '';
    warnings.forEach(([text, kind]) => {
      const div = document.createElement('div');
      div.className = 'warning ' + (kind === 'info' ? 'info' : '');
      div.textContent = text;
      els.envWarnings.appendChild(div);
    });
  }

  function formatOffset(minutes) {
    const sign = minutes >= 0 ? '+' : '-';
    const abs = Math.abs(minutes);
    return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  }

  /* ---------- 权限状态 ---------- */
  function renderPermission(state) {
    const p = state || Notifier.permissionState();
    const map = {
      granted: ['已授权', 'badge-granted'],
      denied: ['已被拒绝', 'badge-denied'],
      prompt: ['待申请', 'badge-prompt'],
      unsupported: ['浏览器不支持', 'badge-denied'],
      insecure: ['非安全上下文', 'badge-denied'],
      unknown: ['未知', 'badge-unknown']
    };
    const [text, cls] = map[p] || map.unknown;
    els.permStatus.textContent = text;
    els.permStatus.className = 'badge ' + cls;

    els.permBtn.disabled = !Notifier.supported ||
      (p === 'granted' || p === 'denied' || p === 'unsupported' || p === 'insecure');
    if (p === 'denied') {
      els.permBtn.title = '浏览器已记录拒绝决定。可在地址栏左侧的站点设置中重新允许通知权限，本页会自动检测到变更。';
    } else if (p === 'insecure') {
      els.permBtn.title = 'Notification 仅在安全上下文（HTTPS 或 localhost）中可用，请更换访问方式后刷新。';
    } else {
      els.permBtn.title = '';
    }

    if (p === 'denied') {
      addWarning('通知权限已被拒绝。请点击地址栏左侧的站点信息图标，将“通知”改为允许；状态会自动刷新，无需重载页面。');
      log('通知权限被拒绝：系统通知不可用，发送时将降级为页内卡片', 'warn');
    } else {
      removeWarning('perm-denied');
    }
  }

  function addWarning(text) {
    if (document.getElementById('warning-perm-denied')) return;
    const div = document.createElement('div');
    div.id = 'warning-perm-denied';
    div.className = 'warning';
    div.textContent = text;
    els.envWarnings.appendChild(div);
  }

  function removeWarning(id) {
    const div = document.getElementById('warning-' + id);
    if (div) div.remove();
  }

  /* ---------- 免打扰设置 ---------- */
  function isValidHHMM(v) { return DND.toMinutes(v) !== null; }

  function readSettingsFromUI() {
    return {
      enabled: els.dndEnabled.checked,
      start: els.dndStart.value || '00:00',
      end: els.dndEnd.value || '00:00'
    };
  }

  async function saveSettings(next) {
    settings = next;
    Timeline.update(settings);
    renderDndStatus();
    try {
      await Store.saveSettings(settings);
    } catch (e) {
      log(`免打扰设置持久化失败（仅本次生效）：${e.message}`, 'warn');
    }
  }

  function renderDndStatus() {
    const now = new Date();
    const within = DND.isWithin(settings, now);
    const transition = DND.nextTransition(settings, now);

    if (!settings.enabled) {
      els.dndStatus.textContent = '免打扰已关闭';
      els.dndStatus.className = 'badge badge-unknown';
    } else if (!isValidHHMM(settings.start) || !isValidHHMM(settings.end) ||
               settings.start === settings.end) {
      els.dndStatus.textContent = '时段设置无效（开始与结束相同或时间非法）';
      els.dndStatus.className = 'badge badge-prompt';
    } else if (within) {
      els.dndStatus.textContent = '免打扰中' +
        (transition ? `，还有 ${DND.describeCountdown(transition.at, now)} 结束` : '');
      els.dndStatus.className = 'badge badge-denied';
    } else {
      els.dndStatus.textContent = '通知正常发送' +
        (transition ? `，${DND.describeCountdown(transition.at, now)}后进入免打扰` : '');
      els.dndStatus.className = 'badge badge-granted';
    }
  }

  /* ---------- 通知历史 ---------- */
  const STATUS_META = {
    sent: { text: '已送达', cls: 'badge-granted' },
    clicked: { text: '已点击', cls: 'badge-granted' },
    blocked: { text: 'DND 已拦截', cls: 'badge-prompt' },
    failed: { text: '发送失败（已重试）', cls: 'badge-denied' },
    unsupported: { text: '页内卡片降级', cls: 'badge-unsupported' },
    denied: { text: '权限未授予', cls: 'badge-denied' }
  };

  async function renderHistory() {
    let items = [];
    try {
      items = await Store.getAllHistory();
    } catch (e) {
      log(`读取历史失败：${e.message}`, 'err');
      return;
    }
    els.historyList.innerHTML = '';
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'meta-empty';
      li.textContent = '暂无通知记录';
      els.historyList.appendChild(li);
      return;
    }
    items.forEach(item => {
      const li = document.createElement('li');
      li.className = 'history-item' + (item.status === 'clicked' ? ' clicked' : '');

      if (item.icon) {
        const img = document.createElement('img');
        img.className = 'history-icon';
        img.alt = '';
        img.src = item.icon;
        img.onerror = () => img.remove();
        li.appendChild(img);
      }

      const main = document.createElement('div');
      main.className = 'history-main';
      const title = document.createElement('div');
      title.className = 'history-title';
      title.textContent = item.title || '（无标题）';
      const body = document.createElement('div');
      body.className = 'history-body';
      body.textContent = item.body || '';
      const meta = document.createElement('div');
      meta.className = 'history-meta';
      const metaInfo = STATUS_META[item.status] || { text: item.status, cls: 'badge-unknown' };
      meta.textContent = `${new Date(item.createdAt).toLocaleString()} · 尝试 ${item.attempts || 0} 次` +
        (item.error ? ` · ${item.error}` : '');
      main.append(title, body, meta);

      const badge = document.createElement('span');
      badge.className = 'badge ' + metaInfo.cls;
      badge.textContent = metaInfo.text;

      li.append(main, badge);
      li.addEventListener('click', () => activateHistoryItem(item));
      els.historyList.appendChild(li);
    });
  }

  /* 点击历史项：触发点击回调并更新状态 */
  async function activateHistoryItem(item) {
    log(`触发通知点击回调：「${item.title}」`, 'ok');
    if (typeof item.data === 'object' && item.data && item.data.url) {
      log(`回调数据中包含 url=${item.data.url}（演示环境不自动跳转）`);
    }
    if (item.status !== 'clicked') {
      try {
        await Store.updateHistory(item.id, { status: 'clicked', clickedAt: Date.now() });
      } catch (e) { /* ignore */ }
      renderHistory();
    }
  }

  /* ---------- 发送通知 ---------- */
  function buildRecord(title, body, icon) {
    return {
      id: Notifier.uid(),
      title, body, icon,
      tag: 'app-notification',
      data: { source: 'notification-dnd-demo', url: '#callback-demo', createdAt: Date.now() },
      createdAt: Date.now(),
      status: 'sent',
      attempts: 0
    };
  }

  function persistRecord(record, patch) {
    Object.assign(record, patch || {});
    return Store.addHistory(record).catch(e => log(`历史写入失败：${e.message}`, 'warn'))
      .then(() => renderHistory());
  }

  async function handleSend() {
    const title = els.title.value.trim();
    const body = els.body.value.trim();
    if (!title) { log('请填写通知标题', 'err'); return; }

    const force = els.force.checked;
    const now = new Date();
    const within = DND.isWithin(settings, now);

    if (within && !force) {
      const record = buildRecord(title, body, getIcon());
      await persistRecord(record, { status: 'blocked', attempts: 0 });
      log(`当前处于免打扰时段，通知「${title}」已拦截（勾选“免打扰时段内也发送”可强制发送）`, 'warn');
      return;
    }
    if (within && force) {
      log('免打扰时段内强制发送（已覆盖拦截）', 'warn');
    }

    /* 不支持 / 非安全上下文：降级页内卡片 */
    if (!Notifier.supported || !Notifier.isSecureContext) {
      const record = buildRecord(title, body, getIcon());
      Notifier.showFallback(title, body, () => activateHistoryItem(record));
      await persistRecord(record, { status: 'unsupported', attempts: 0 });
      log('系统通知不可用，已通过页内卡片展示', 'warn');
      return;
    }

    /* 无权限：不自动弹窗申请（必须由明确手势），引导用户点击申请按钮 */
    if (Notifier.permissionState() !== 'granted') {
      const record = buildRecord(title, body, getIcon());
      Notifier.showFallback(title, body, () => activateHistoryItem(record));
      await persistRecord(record, { status: 'denied', attempts: 0 });
      log('通知权限未授予，已通过页内卡片展示；请点击“申请通知权限”按钮', 'err');
      renderPermission();
      return;
    }

    const record = buildRecord(title, body, getIcon());
    els.sendBtn.disabled = true;
    log(`发送通知「${title}」…`);
    const result = await Notifier.send({
      title: record.title, body: record.body, icon: record.icon,
      tag: record.tag, data: record.data
    }, {
      onClick: n => {
        log(`系统通知被点击：「${record.title}」`, 'ok');
        Store.updateHistory(record.id, { status: 'clicked', clickedAt: Date.now() })
          .then(renderHistory);
        if (n) try { n.close(); } catch (e) { /* ignore */ }
      },
      lateError: err => {
        log(`通知展示后发生错误：${err.message}`, 'err');
        Store.updateHistory(record.id, { status: 'failed', error: err.message })
          .then(renderHistory);
      }
    });
    els.sendBtn.disabled = false;

    if (result.ok) {
      await persistRecord(record, { status: 'sent', attempts: result.attempts });
      log(result.attempts > 1
        ? `通知发送成功（第 ${result.attempts} 次重试后成功）` : '通知已发送', 'ok');
    } else {
      Notifier.showFallback(title, body, () => activateHistoryItem(record));
      await persistRecord(record, {
        status: 'failed', attempts: result.attempts,
        error: result.error ? result.error.message : '未知错误'
      });
      log(`通知发送失败，已重试 ${result.attempts} 次；为避免遗漏，已展示页内卡片`, 'err');
    }
  }

  function getIcon() {
    return els.icon.checked ? Notifier.defaultIcon() : '';
  }

  /* ---------- 事件绑定 ---------- */
  els.permBtn.addEventListener('click', async ev => {
    /* 权限申请必须在用户手势内调用；requestPermission 内部已兜底异常，不会崩 */
    if (!ev || !ev.isTrusted) {
      log('权限申请需要真实的用户点击手势，已忽略非用户触发', 'warn');
      return;
    }
    log('正在申请通知权限…');
    const result = await Notifier.requestPermission();
    renderPermission(result);
    if (result === 'granted') log('通知权限已授予', 'ok');
    else if (result === 'denied') log('通知权限被拒绝', 'err');
    else if (result === 'unsupported') log('当前浏览器不支持 Notification API', 'err');
    else log('权限申请未完成（浏览器未返回授权决定）', 'warn');
  });

  els.sendBtn.addEventListener('click', handleSend);

  let settingsTimer = 0;
  function scheduleSettingsSave() {
    clearTimeout(settingsTimer);
    settingsTimer = setTimeout(() => {
      const next = readSettingsFromUI();
      if (!isValidHHMM(next.start) || !isValidHHMM(next.end)) {
        log('时间格式无效，已忽略本次修改', 'err');
        return;
      }
      saveSettings(next);
    }, 150);
  }
  els.dndEnabled.addEventListener('change', () => {
    const next = readSettingsFromUI();
    saveSettings(next);
    log(next.enabled ? '免打扰已启用' : '免打扰已关闭');
  });
  els.dndStart.addEventListener('input', scheduleSettingsSave);
  els.dndEnd.addEventListener('input', scheduleSettingsSave);

  els.clearHistoryBtn.addEventListener('click', async () => {
    try {
      await Store.clearHistory();
      renderHistory();
      log('通知历史已清空');
    } catch (e) {
      log(`清空历史失败：${e.message}`, 'err');
    }
  });

  /* 时区 / 夏令时变化：重算判断、重绘时间轴 */
  DND.watchTimezone(info => {
    kv(els.envTimezone,
      `${info.timezone}（UTC${formatOffset(-info.newOffset)}）`);
    renderDndStatus();
    Timeline.redraw();
    log(`检测到时区变化：${info.oldTimezone} → ${info.timezone}，已重新计算免打扰判断与时间轴`, 'warn');
  });

  /* 权限被撤销 / 重新授予：自动更新 UI（Permissions API change + 内部轮询兜底） */
  Notifier.watchPermission(state => {
    renderPermission(state);
    log(`通知权限状态变化：${state}`, state === 'granted' ? 'ok' : 'warn');
  }).then(stop => { window.addEventListener('pagehide', stop); });

  /* 每秒刷新免打扰倒计时 / 当前时刻刻度；跨时段边界时自动切换状态 */
  setInterval(() => {
    renderDndStatus();
    Timeline.redraw();
  }, 1000);

  /* ---------- 初始化 ---------- */
  (async function init() {
    renderEnv();

    /* 读取持久化的 DND 设置 */
    try {
      const saved = await Store.getSettings();
      if (saved && typeof saved === 'object') {
        settings = {
          enabled: saved.enabled !== false,
          start: isValidHHMM(saved.start) ? saved.start : DEFAULT_SETTINGS.start,
          end: isValidHHMM(saved.end) ? saved.end : DEFAULT_SETTINGS.end
        };
      }
    } catch (e) {
      log(`读取免打扰设置失败，使用默认值：${e.message}`, 'warn');
    }
    els.dndEnabled.checked = settings.enabled;
    els.dndStart.value = settings.start;
    els.dndEnd.value = settings.end;

    Timeline.mount(els.canvas, settings);
    renderDndStatus();
    renderPermission();
    renderHistory();

    if (Store.isMemoryMode()) {
      log('IndexedDB 不可用，历史与设置仅保存在内存中', 'warn');
    }
    if (!Notifier.supported) {
      log('浏览器不支持 Notification API，将使用页内卡片降级', 'err');
    } else if (!Notifier.isSecureContext) {
      log('非安全上下文，Notification 不可用，将使用页内卡片降级（请通过 HTTPS 或 localhost 访问）', 'err');
    } else {
      log('点击“申请通知权限”开始（需要用户手势，页面加载不会自动申请）');
    }
  })();
})();
