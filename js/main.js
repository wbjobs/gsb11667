import { saveLayout, getLayout, listLayouts, deleteLayout } from './db.js';
import { computeLayout, findOutOfBounds, clampToArea } from './layouts.js';
import {
  isWindowManagementSupported,
  queryPermission,
  requestPermission,
  normalizeScreens,
  screenArea,
} from './screens.js';
import { renderPreview } from './preview.js';

const $ = id => document.getElementById(id);
const els = {
  banner: $('support-banner'),
  permissionStatus: $('permission-status'),
  screensList: $('screens-list'),
  windowsList: $('windows-list'),
  windowCount: $('window-count'),
  layoutType: $('layout-type'),
  targetScreen: $('target-screen'),
  layoutMessage: $('layout-message'),
  savedLayouts: $('saved-layouts'),
  layoutName: $('layout-name'),
  preview: $('preview'),
};

const state = {
  supported: isWindowManagementSupported(),
  permission: 'unknown',
  screenDetails: null,
  screens: [],
  childWindows: [], // { id, label, win }
  placements: [],   // 预览用 { label, rect, outOfBounds }
  nextWindowId: 1,
};

// ---------- 消息提示 ----------

let messageTimer = null;
function showMessage(text, kind = 'warn') {
  els.layoutMessage.textContent = text;
  els.layoutMessage.className = `message ${kind === 'error' ? 'error' : kind === 'ok' ? 'ok' : ''}`;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => els.layoutMessage.classList.add('hidden'), 6000);
}

function showBanner(text, kind = 'warn') {
  els.banner.textContent = text;
  els.banner.className = `banner ${kind === 'info' ? 'info' : ''}`;
}

// ---------- 权限 ----------

async function refreshPermission() {
  state.permission = await queryPermission();
  const map = {
    granted: ['已授权', 'granted'],
    denied: ['已拒绝', 'denied'],
    prompt: ['待申请', ''],
    unknown: ['无法查询', ''],
    unsupported: ['不支持', 'denied'],
  };
  const [text, cls] = map[state.permission] || ['未知', ''];
  els.permissionStatus.textContent = text;
  els.permissionStatus.className = `tag ${cls}`;
}

async function handleRequestPermission() {
  if (!state.supported) {
    showBanner('当前浏览器不支持 Window Management API，已降级为单屏模式。', 'warn');
    return;
  }
  const result = await requestPermission();
  if (result.state === 'granted') {
    state.screenDetails = result.details;
    watchScreenChanges(result.details);
    refreshScreens();
    showMessage('权限已授予，屏幕枚举已更新。', 'ok');
  } else {
    state.permission = 'denied';
    showBanner('Window Management 权限被拒绝：仅能使用当前屏幕，多屏布局不可用。', 'warn');
    refreshScreens(); // 降级到单屏
  }
  await refreshPermission();
}

function watchScreenChanges(details) {
  details.addEventListener('screenschange', () => {
    refreshScreens();
    showMessage('检测到屏幕变化（插拔/分辨率调整），屏幕列表与预览已更新。', 'ok');
  });
}

// ---------- 屏幕枚举 ----------

function refreshScreens() {
  state.screens = normalizeScreens(state.screenDetails);
  renderScreens();
  renderTargetScreenOptions();
  updatePreview();
}

function renderScreens() {
  els.screensList.innerHTML = '';
  state.screens.forEach(s => {
    const div = document.createElement('div');
    div.className = 'screen-item';
    div.innerHTML =
      `<span class="${s.isPrimary ? 'primary' : ''}">${s.label}${s.isPrimary ? '（主屏）' : ''}</span><br>` +
      `分辨率 ${s.width}×${s.height}，可用 ${s.availWidth}×${s.availHeight}，` +
      `原点 (${s.left}, ${s.top})，缩放 ${s.scaleFactor}x`;
    els.screensList.appendChild(div);
  });
}

function renderTargetScreenOptions() {
  els.targetScreen.innerHTML = '';
  state.screens.forEach(s => {
    const opt = document.createElement('option');
    opt.value = String(s.id);
    opt.textContent = `${s.label}${s.isPrimary ? '（主屏）' : ''}`;
    els.targetScreen.appendChild(opt);
  });
}

// ---------- 子窗口管理 ----------

function liveWindows() {
  return state.childWindows.filter(w => !w.win.closed);
}

function openChildWindow() {
  const id = state.nextWindowId++;
  const win = window.open('', `layout-win-${id}`,
    'popup=yes,width=480,height=320');
  if (!win) {
    showMessage('弹窗被浏览器拦截，请允许本站弹出窗口后重试。', 'error');
    return;
  }
  win.document.title = `子窗口 ${id}`;
  win.document.body.innerHTML =
    `<h1 style="font-family:sans-serif">子窗口 ${id}</h1>`;
  state.childWindows.push({ id, label: `子窗口 ${id}`, win });
  renderWindows();
  updatePreview();
}

function renderWindows() {
  // 清理已关闭窗口
  const closed = state.childWindows.filter(w => w.win.closed);
  if (closed.length > 0) {
    state.childWindows = liveWindows();
    showMessage(`检测到 ${closed.length} 个窗口被关闭，布局与预览已更新。`, 'warn');
  }
  els.windowCount.textContent = `${state.childWindows.length} 个子窗口`;
  els.windowsList.innerHTML = '';
  state.childWindows.forEach(w => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = w.label;
    const btn = document.createElement('button');
    btn.textContent = '关闭';
    btn.onclick = () => {
      w.win.close();
      renderWindows();
      updatePreview();
    };
    li.append(span, btn);
    els.windowsList.appendChild(li);
  });
}

// 周期检测窗口被手动关闭
setInterval(() => {
  const before = state.childWindows.length;
  state.childWindows = liveWindows();
  if (state.childWindows.length !== before) {
    renderWindows();
    updatePreview();
  }
}, 1000);

// ---------- 布局应用 ----------

function currentTargets() {
  // 无子窗口时降级为对当前窗口自身布局（单窗口模式）
  const children = liveWindows();
  if (children.length === 0) {
    return [{ label: '当前窗口', win: window, isSelf: true }];
  }
  return children.map(w => ({ label: w.label, win: w.win, isSelf: false }));
}

function applyLayout() {
  const type = els.layoutType.value;
  const screen = state.screens[Number(els.targetScreen.value)] || state.screens[0];
  if (!screen) {
    showMessage('没有可用屏幕。', 'error');
    return;
  }
  const targets = currentTargets();
  const area = screenArea(screen);
  const rects = computeLayout(type, area, targets.length);
  const outIdx = findOutOfBounds(rects, area);

  if (targets.length === 1 && targets[0].isSelf) {
    showMessage('当前为单窗口降级模式：布局已应用于本窗口。', 'warn');
  }
  if (outIdx.length > 0) {
    showMessage(
      `有 ${outIdx.length} 个窗口超出「${screen.label}」可用区域，已自动钳制回屏幕内。`,
      'error'
    );
  }

  state.placements = rects.map((rect, i) => {
    const finalRect = outIdx.includes(i) ? clampToArea(rect, area) : rect;
    const t = targets[i];
    try {
      t.win.moveTo(finalRect.left, finalRect.top);
      t.win.resizeTo(finalRect.width, finalRect.height);
    } catch {
      showMessage(`无法移动「${t.label}」（可能已被关闭或浏览器限制）。`, 'error');
    }
    return {
      label: t.label,
      rect: finalRect,
      outOfBounds: outIdx.includes(i),
    };
  });
  updatePreview();
}

// ---------- 布局保存 / 恢复 ----------

async function handleSave() {
  const name = els.layoutName.value.trim();
  if (!name) {
    showMessage('请先输入布局名称。', 'error');
    return;
  }
  const screen = state.screens[Number(els.targetScreen.value)] || state.screens[0];
  const type = els.layoutType.value;
  const area = screenArea(screen);
  const targets = currentTargets();
  const rects = computeLayout(type, area, targets.length);
  // 以相对屏幕可用区域的坐标保存，恢复时可适配不同屏幕
  const layout = {
    name,
    type,
    windowCount: targets.length,
    screen: { label: screen.label, availWidth: area.width, availHeight: area.height },
    rects: rects.map(r => ({
      left: r.left - area.left,
      top: r.top - area.top,
      width: r.width,
      height: r.height,
    })),
  };
  await saveLayout(layout);
  await refreshSavedLayouts();
  showMessage(`布局「${name}」已保存。`, 'ok');
}

async function handleRestore() {
  const name = els.savedLayouts.value;
  if (!name) {
    showMessage('请先选择要恢复的布局。', 'error');
    return;
  }
  const layout = await getLayout(name);
  if (!layout) {
    showMessage(`布局「${name}」不存在。`, 'error');
    return;
  }
  const targets = currentTargets();
  const screen = state.screens[Number(els.targetScreen.value)] || state.screens[0];
  const area = screenArea(screen);

  let rects;
  if (layout.windowCount !== targets.length) {
    // 窗口数量不一致：按保存的布局类型对当前窗口数重新计算
    rects = computeLayout(layout.type, area, targets.length);
    showMessage(
      `保存时为 ${layout.windowCount} 个窗口，当前为 ${targets.length} 个，已按「${layout.type}」重新计算布局。`,
      'warn'
    );
  } else {
    // 相对坐标映射到当前目标屏幕；屏幕尺寸不同则等比缩放
    const scaleX = area.width / layout.screen.availWidth;
    const scaleY = area.height / layout.screen.availHeight;
    rects = layout.rects.map(r => ({
      left: area.left + Math.round(r.left * scaleX),
      top: area.top + Math.round(r.top * scaleY),
      width: Math.round(r.width * scaleX),
      height: Math.round(r.height * scaleY),
    }));
    if (layout.screen.label !== screen.label) {
      showMessage(
        `布局保存于「${layout.screen.label}」，已适配到当前屏幕「${screen.label}」。`,
        'warn'
      );
    }
  }

  const outIdx = findOutOfBounds(rects, area);
  if (outIdx.length > 0) {
    showMessage(`恢复的布局有 ${outIdx.length} 个窗口越界，已自动钳制回屏幕内。`, 'error');
  }

  state.placements = rects.map((rect, i) => {
    const finalRect = outIdx.includes(i) ? clampToArea(rect, area) : rect;
    const t = targets[i];
    try {
      t.win.moveTo(finalRect.left, finalRect.top);
      t.win.resizeTo(finalRect.width, finalRect.height);
    } catch {
      showMessage(`无法移动「${t.label}」。`, 'error');
    }
    return { label: t.label, rect: finalRect, outOfBounds: outIdx.includes(i) };
  });
  els.layoutType.value = layout.type;
  updatePreview();
  if (outIdx.length === 0) showMessage(`布局「${name}」已恢复。`, 'ok');
}

async function handleDelete() {
  const name = els.savedLayouts.value;
  if (!name) return;
  await deleteLayout(name);
  await refreshSavedLayouts();
  showMessage(`布局「${name}」已删除。`, 'ok');
}

async function refreshSavedLayouts() {
  const layouts = await listLayouts();
  els.savedLayouts.innerHTML = '';
  layouts.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l.name;
    opt.textContent = `${l.name}（${l.type}，${l.windowCount} 窗口）`;
    els.savedLayouts.appendChild(opt);
  });
}

// ---------- 预览 ----------

function updatePreview() {
  renderPreview(els.preview, state.screens, state.placements);
}

// ---------- 初始化 ----------

async function init() {
  if (!state.supported) {
    showBanner(
      '当前浏览器不支持 Window Management API（getScreenDetails）。已降级为单屏模式，仅可对当前屏幕上的窗口布局。',
      'warn'
    );
  }
  await refreshPermission();
  if (state.supported && state.permission === 'granted') {
    try {
      state.screenDetails = await window.getScreenDetails();
      watchScreenChanges(state.screenDetails);
    } catch { /* 忽略，保持单屏 */ }
  }
  refreshScreens();
  await refreshSavedLayouts();

  $('btn-permission').addEventListener('click', handleRequestPermission);
  $('btn-open-window').addEventListener('click', openChildWindow);
  $('btn-apply').addEventListener('click', applyLayout);
  $('btn-save').addEventListener('click', handleSave);
  $('btn-restore').addEventListener('click', handleRestore);
  $('btn-delete').addEventListener('click', handleDelete);
  els.layoutType.addEventListener('change', updatePreview);
  window.addEventListener('resize', updatePreview);
}

init();
