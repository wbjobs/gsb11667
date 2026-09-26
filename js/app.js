/* app.js — 应用主逻辑：权限、布局应用、保存恢复、日志 */
(() => {
  const $ = id => document.getElementById(id);
  const els = {
    permBtn: $('btn-request-permission'),
    permStatus: $('permission-status'),
    supportWarning: $('support-warning'),
    screenList: $('screen-list'),
    windowCount: $('window-count'),
    targetScreen: $('target-screen'),
    boundsWarning: $('bounds-warning'),
    closeAll: $('btn-close-all'),
    layoutName: $('layout-name'),
    saveBtn: $('btn-save-layout'),
    savedList: $('saved-layouts'),
    log: $('log')
  };

  let lastAppliedRects = []; // 最近一次应用/预览的窗口矩形

  /* ---------- 日志 ---------- */
  function log(msg, cls = 'info') {
    const line = document.createElement('div');
    line.className = cls;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    els.log.prepend(line);
  }

  /* ---------- 权限状态 UI ---------- */
  function renderPermission() {
    const p = ScreenManager.state.permission;
    const map = {
      granted: ['已授权', 'badge-granted'],
      denied: ['已被拒绝', 'badge-denied'],
      prompt: ['待用户确认', 'badge-prompt'],
      unsupported: ['浏览器不支持', 'badge-denied'],
      unknown: ['未查询', 'badge-unknown']
    };
    const [text, cls] = map[p] || map.unknown;
    els.permStatus.textContent = text;
    els.permStatus.className = `badge ${cls}`;

    if (!ScreenManager.state.supported) {
      els.supportWarning.textContent =
        '当前浏览器不支持 Window Management API（getScreenDetails）。\n' +
        '已降级为单窗口模式：仅使用 window.screen 的当前屏幕信息，布局仍可在此屏幕内排列。\n' +
        '建议使用 Chrome / Edge 100+ 并通过 HTTPS 或 localhost 访问。';
      els.supportWarning.classList.remove('hidden');
    } else if (p === 'denied') {
      els.supportWarning.textContent =
        'Window Management 权限被拒绝，无法枚举多屏幕。\n' +
        '已降级为单窗口模式。可在浏览器地址栏左侧的站点设置中重新允许“窗口管理”权限后刷新。';
      els.supportWarning.classList.remove('hidden');
    } else {
      els.supportWarning.classList.add('hidden');
    }
  }

  /* ---------- 屏幕列表 UI ---------- */
  function renderScreens() {
    const screens = ScreenManager.state.screens;
    els.screenList.innerHTML = '';
    els.targetScreen.innerHTML = '';
    screens.forEach((s, i) => {
      const item = document.createElement('div');
      item.className = 'screen-item';
      item.innerHTML =
        `<span class="label">屏幕 ${i + 1}${s.isPrimary ? ' <span class="primary-tag">主屏</span>' : ''}</span>` +
        `<span>名称：${s.label}</span>` +
        `<span>可用区域：${s.width}×${s.height} @ (${s.left}, ${s.top})</span>` +
        `<span>缩放：${s.devicePixelRatio}x</span>`;
      els.screenList.appendChild(item);

      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = `屏幕 ${i + 1}${s.isPrimary ? '（主屏）' : ''}`;
      els.targetScreen.appendChild(opt);
    });
    log(`屏幕枚举更新：共 ${screens.length} 块屏幕` +
      (screens.length > 1
        ? `，多屏坐标系跨度 (${Math.min(...screens.map(s => s.left))}, ${Math.min(...screens.map(s => s.top))}) ~ ` +
          `(${Math.max(...screens.map(s => s.left + s.width))}, ${Math.max(...screens.map(s => s.top + s.height))})`
        : '（单屏/降级模式）'));
  }

  /* ---------- 预览刷新 ---------- */
  function refreshPreview(violations = []) {
    const openRects = WindowManager.getOpenWindows().map(m => m.rect);
    const rects = lastAppliedRects.length ? lastAppliedRects : openRects;
    Preview.update(ScreenManager.state.screens, rects, violations);
  }

  /* ---------- 应用布局 ---------- */
  function applyLayout(type) {
    const screens = ScreenManager.state.screens;
    if (!screens.length) { log('没有可用屏幕信息', 'err'); return; }
    const count = Math.max(1, Math.min(12, parseInt(els.windowCount.value, 10) || 1));
    const screenIdx = Math.min(parseInt(els.targetScreen.value, 10) || 0, screens.length - 1);
    const screen = screens[screenIdx];

    let rects;
    try {
      rects = Layouts.compute(type, count, screen);
    } catch (e) {
      log(e.message, 'err');
      return;
    }

    // 越界检测（理论上算法不会越界，但多屏负坐标/缩放差异下仍做防御）
    const check = Layouts.checkBounds(rects, screens);
    if (!check.ok) {
      els.boundsWarning.textContent =
        `检测到 ${check.violations.length} 个窗口越界，已自动钳制到最近屏幕内。`;
      els.boundsWarning.classList.remove('hidden');
      log(`布局越界：${check.violations.length} 个窗口被钳制`, 'err');
      rects = rects.map(r => Layouts.clampToScreens(r, screens));
    } else {
      els.boundsWarning.classList.add('hidden');
    }

    const result = WindowManager.applyLayout(rects);
    lastAppliedRects = rects;
    refreshPreview(check.ok ? [] : check.violations.map(v => v.index));

    log(`应用${typeName(type)}：目标屏幕 ${screenIdx + 1}，新开 ${result.opened}，移动 ${result.moved}，关闭 ${result.closed}` +
      (result.failed ? `，失败 ${result.failed}（可能被弹窗拦截，请允许本站弹窗）` : ''),
      result.failed ? 'err' : 'ok');
    if (result.failed) {
      els.boundsWarning.textContent = '部分窗口打开失败：浏览器可能拦截了弹窗，请在地址栏允许本站的弹出式窗口后重试。';
      els.boundsWarning.classList.remove('hidden');
    }
  }

  function typeName(t) {
    return { grid: '网格布局', waterfall: '瀑布布局', 'primary-secondary': '主次布局' }[t] || t;
  }

  /* ---------- 保存 / 恢复 ---------- */
  async function saveLayout() {
    const name = els.layoutName.value.trim();
    if (!name) { log('请先输入布局名称', 'err'); return; }
    const rects = WindowManager.getOpenWindows().map(m => m.rect);
    if (!rects.length) { log('当前没有打开的窗口，无法保存布局', 'err'); return; }
    const layout = {
      name,
      createdAt: Date.now(),
      screenSignature: ScreenManager.signature(),
      screens: ScreenManager.state.screens.map(({ internal, ...rest }) => rest),
      windows: rects
    };
    try {
      await LayoutStore.save(layout);
      log(`布局「${name}」已保存（${rects.length} 个窗口）`, 'ok');
      els.layoutName.value = '';
      renderSavedLayouts();
    } catch (e) {
      log(`保存失败：${e.message}`, 'err');
    }
  }

  async function restoreLayout(name) {
    let layout;
    try {
      layout = await LayoutStore.get(name);
    } catch (e) {
      log(`读取失败：${e.message}`, 'err');
      return;
    }
    if (!layout) { log(`布局「${name}」不存在`, 'err'); return; }

    const screens = ScreenManager.state.screens;
    let rects = layout.windows;
    const sameEnv = layout.screenSignature === ScreenManager.signature();
    if (!sameEnv) {
      log('当前屏幕环境与保存时不同（屏幕数量/分辨率/排列变化），窗口将钳制到最近屏幕', 'err');
      els.boundsWarning.textContent =
        '屏幕环境与保存该布局时不一致，部分窗口位置已自动适配到当前屏幕。';
      els.boundsWarning.classList.remove('hidden');
    }
    // 无论环境是否一致都做越界检测与钳制，保证恢复结果可用
    const check = Layouts.checkBounds(rects, screens);
    if (!check.ok) {
      els.boundsWarning.textContent =
        `恢复的布局中有 ${check.violations.length} 个窗口越界，已自动钳制到屏幕内。`;
      els.boundsWarning.classList.remove('hidden');
      rects = rects.map(r => Layouts.clampToScreens(r, screens));
    }

    const result = WindowManager.applyLayout(rects);
    lastAppliedRects = rects;
    refreshPreview();
    log(`恢复布局「${name}」：新开 ${result.opened}，移动 ${result.moved}` +
      (result.failed ? `，失败 ${result.failed}（请允许弹窗）` : ''), result.failed ? 'err' : 'ok');
  }

  async function renderSavedLayouts() {
    els.savedList.innerHTML = '';
    let items = [];
    try {
      items = await LayoutStore.list();
    } catch (e) {
      log(e.message, 'err');
      return;
    }
    if (!items.length) {
      els.savedList.innerHTML = '<li class="meta">暂无已保存的布局</li>';
      return;
    }
    for (const item of items) {
      const li = document.createElement('li');
      const envMatch = item.screenSignature === ScreenManager.signature();
      li.innerHTML =
        `<strong>${item.name}</strong>` +
        `<span class="meta">${item.windows.length} 窗口 · ${new Date(item.createdAt).toLocaleString()}` +
        `${envMatch ? '' : ' · ⚠ 屏幕环境已变化'}</span>`;
      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'small';
      restoreBtn.textContent = '恢复';
      restoreBtn.onclick = () => restoreLayout(item.name);
      const delBtn = document.createElement('button');
      delBtn.className = 'small danger';
      delBtn.textContent = '删除';
      delBtn.onclick = async () => {
        await LayoutStore.remove(item.name);
        log(`布局「${item.name}」已删除`);
        renderSavedLayouts();
      };
      li.append(restoreBtn, delBtn);
      els.savedList.appendChild(li);
    }
  }

  /* ---------- 事件绑定 ---------- */
  els.permBtn.addEventListener('click', async () => {
    log('正在申请 Window Management 权限…');
    const { granted, error } = await ScreenManager.requestAndEnumerate();
    renderPermission();
    renderScreens();
    refreshPreview();
    renderSavedLayouts();
    if (granted) log('权限已授予，多屏幕枚举成功', 'ok');
    else log(`权限未授予${error ? `（${error.message}）` : ''}，已降级为单窗口模式`, 'err');
  });

  document.querySelectorAll('.layout-btn').forEach(btn => {
    btn.addEventListener('click', () => applyLayout(btn.dataset.layout));
  });

  els.closeAll.addEventListener('click', () => {
    const n = WindowManager.closeAll();
    lastAppliedRects = [];
    refreshPreview();
    log(`已关闭 ${n} 个窗口`);
  });

  els.saveBtn.addEventListener('click', saveLayout);

  /* 屏幕变化（插拔显示器等）→ 重绘并提示 */
  ScreenManager.onChange(() => {
    renderScreens();
    // 屏幕变化后现有窗口可能越界，重新检测
    const openRects = WindowManager.getOpenWindows().map(m => m.rect);
    const check = Layouts.checkBounds(openRects, ScreenManager.state.screens);
    if (!check.ok) {
      els.boundsWarning.textContent =
        `屏幕环境变化后，${check.violations.length} 个窗口已越界，请重新应用布局。`;
      els.boundsWarning.classList.remove('hidden');
      refreshPreview(check.violations.map(v => v.index));
    } else {
      refreshPreview();
    }
    renderSavedLayouts();
  });

  /* 窗口被手动关闭 → 更新预览与提示 */
  WindowManager.onChange(openWins => {
    lastAppliedRects = openWins.map(m => m.rect);
    refreshPreview();
    log(`窗口状态更新：当前打开 ${openWins.length} 个窗口`);
  });

  /* ---------- 初始化 ---------- */
  (async function init() {
    await ScreenManager.queryPermission();
    if (ScreenManager.state.permission === 'granted') {
      await ScreenManager.requestAndEnumerate();
    } else {
      ScreenManager.fallbackScreens();
    }
    renderPermission();
    renderScreens();
    refreshPreview();
    renderSavedLayouts();
    if (!ScreenManager.state.supported) {
      log('浏览器不支持 Window Management API，已进入单窗口降级模式', 'err');
    } else if (ScreenManager.state.permission === 'granted') {
      log('权限已授予，屏幕枚举完成', 'ok');
    } else {
      log('请点击“申请 Window Management 权限”按钮以枚举多屏幕（需要用户手势）');
    }
  })();
})();
