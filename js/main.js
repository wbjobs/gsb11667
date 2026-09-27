import {
  checkEnvironment,
  currentPermission,
  requestPermission,
  watchPermission,
} from './permissions.js';
import { parseTime, isCrossDay, activePeriod } from './dnd.js';
import {
  addHistory,
  updateHistory,
  listHistory,
  clearHistory,
  saveSetting,
  getSetting,
} from './db.js';
import { sendNotification } from './notify.js';
import { renderTimeline } from './timeline.js';

const $ = id => document.getElementById(id);
const els = {
  banner: $('support-banner'),
  permissionStatus: $('permission-status'),
  permissionHint: $('permission-hint'),
  dndNow: $('dnd-now'),
  title: $('notif-title'),
  body: $('notif-body'),
  icon: $('notif-icon'),
  sendMessage: $('send-message'),
  dndStart: $('dnd-start'),
  dndEnd: $('dnd-end'),
  dndList: $('dnd-list'),
  canvas: $('dnd-canvas'),
  historyList: $('history-list'),
  toastContainer: $('toast-container'),
};

const state = {
  env: checkEnvironment(),   // 'ok' | 'unsupported' | 'insecure'
  permission: 'default',
  dndPeriods: [],            // [{ start, end }]
  tzOffset: new Date().getTimezoneOffset(),
};

// ---------- 消息提示 ----------

let messageTimer = null;
function showMessage(text, kind = 'warn') {
  els.sendMessage.textContent = text;
  els.sendMessage.className = `message ${kind === 'error' ? 'error' : kind === 'ok' ? 'ok' : ''}`;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => els.sendMessage.classList.add('hidden'), 6000);
}

function showBanner(text, kind = 'warn') {
  els.banner.textContent = text;
  els.banner.className = `banner ${kind === 'info' ? 'info' : ''}`;
}

// 页面内降级通知（浏览器不支持 / 非安全上下文 / 权限被拒时使用）
function showToast(title, body) {
  const div = document.createElement('div');
  div.className = 'toast';
  div.innerHTML = `<strong></strong><span></span>`;
  div.querySelector('strong').textContent = title;
  div.querySelector('span').textContent = body || '';
  els.toastContainer.appendChild(div);
  setTimeout(() => div.remove(), 5000);
}

// ---------- 权限 ----------

async function refreshPermission() {
  state.permission = currentPermission();
  const map = {
    granted: ['已授权', 'granted'],
    denied: ['已拒绝', 'denied'],
    default: ['待申请', ''],
    unsupported: ['浏览器不支持', 'denied'],
    insecure: ['非安全上下文', 'denied'],
  };
  const [text, cls] = map[state.permission] || ['未知', ''];
  els.permissionStatus.textContent = text;
  els.permissionStatus.className = `tag ${cls}`;
}

async function handleRequestPermission() {
  const result = await requestPermission();
  if (result === 'unsupported') {
    showBanner('当前浏览器不支持 Notification API，通知将降级为页面内提示。', 'warn');
  } else if (result === 'insecure') {
    showBanner('当前为非安全上下文（需 HTTPS 或 localhost），系统通知不可用，已降级为页面内提示。', 'warn');
  } else if (result === 'no-gesture') {
    els.permissionHint.textContent = '浏览器要求通过点击等用户操作来申请权限，请点击「申请通知权限」按钮。';
    els.permissionHint.classList.remove('hidden');
    return;
  } else if (result === 'denied') {
    showBanner('通知权限被拒绝：请在浏览器站点设置中重新允许。发送时将降级为页面内提示。', 'warn');
  } else if (result === 'granted') {
    els.permissionHint.classList.add('hidden');
    showMessage('通知权限已授予。', 'ok');
  }
  await refreshPermission();
}

// 权限被撤销（浏览器设置中改动）时更新状态
function handlePermissionRevoked(permission) {
  refreshPermission();
  if (permission === 'denied') {
    showBanner('通知权限已被撤销：后续通知将降级为页面内提示。', 'warn');
  } else if (permission === 'granted') {
    showMessage('通知权限已恢复。', 'ok');
  }
}

// ---------- 发送通知 ----------

async function recordHistory(entry) {
  const id = await addHistory(entry);
  await renderHistory();
  return id;
}

async function handleSend() {
  const title = els.title.value.trim() || '未命名通知';
  const body = els.body.value.trim();
  const icon = els.icon.value.trim();

  // 免打扰拦截
  const hit = activePeriod(state.dndPeriods);
  if (hit) {
    await recordHistory({ title, body, icon, status: '已拦截（免打扰）', clicked: false });
    showMessage(`当前处于免打扰时段（${hit.start} - ${hit.end}），通知已被拦截并记录。`, 'warn');
    return;
  }

  // 降级路径：不支持 / 非安全上下文 / 未授权
  if (state.permission !== 'granted') {
    showToast(title, body);
    const reason = state.permission === 'denied'
      ? '权限被拒，已降级'
      : state.env !== 'ok' ? '环境不支持，已降级' : '未授权，已降级';
    await recordHistory({ title, body, icon, status: `${reason}为页面内提示`, clicked: false });
    showMessage(`系统通知不可用（${reason}），已改为页面内提示。`, 'warn');
    return;
  }

  // 系统通知（失败自动重试）
  let historyId = null;
  try {
    historyId = await recordHistory({ title, body, icon, status: '已发送', clicked: false });
    await sendNotification(
      { title, body, icon },
      {
        retries: 2,
        onClick: async () => {
          // 点击回调：更新历史记录
          const all = await listHistory();
          const entry = all.find(e => e.id === historyId);
          if (entry) {
            entry.clicked = true;
            entry.status = '已点击';
            await updateHistory(entry);
            await renderHistory();
          }
          showMessage(`通知「${title}」被点击。`, 'ok');
        },
      }
    );
    showMessage('通知已发送。', 'ok');
  } catch (err) {
    const all = await listHistory();
    const entry = all.find(e => e.id === historyId);
    if (entry) {
      entry.status = '发送失败（已重试）';
      await updateHistory(entry);
      await renderHistory();
    }
    showMessage(`通知发送失败，已自动重试仍不成功：${err && err.message ? err.message : err}`, 'error');
  }
}

// ---------- 免打扰时段 ----------

async function saveDnd() {
  await saveSetting('dndPeriods', state.dndPeriods);
}

async function handleAddDnd() {
  const start = els.dndStart.value;
  const end = els.dndEnd.value;
  if (parseTime(start) === null || parseTime(end) === null) {
    showMessage('请输入有效的起止时间。', 'error');
    return;
  }
  if (start === end) {
    showMessage('起止时间相同，时段无效。', 'error');
    return;
  }
  state.dndPeriods.push({ start, end });
  await saveDnd();
  renderDnd();
  showMessage(
    `已添加免打扰时段 ${start} - ${end}${isCrossDay({ start, end }) ? '（跨天）' : ''}。`,
    'ok'
  );
}

async function handleRemoveDnd(index) {
  state.dndPeriods.splice(index, 1);
  await saveDnd();
  renderDnd();
}

function renderDnd() {
  els.dndList.innerHTML = '';
  state.dndPeriods.forEach((p, i) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = `${p.start} - ${p.end}${isCrossDay(p) ? '（跨天）' : ''}`;
    const btn = document.createElement('button');
    btn.textContent = '删除';
    btn.onclick = () => handleRemoveDnd(i);
    li.append(span, btn);
    els.dndList.appendChild(li);
  });
  updateDndIndicator();
  renderTimeline(els.canvas, state.dndPeriods);
}

function updateDndIndicator() {
  const hit = activePeriod(state.dndPeriods);
  if (hit) {
    els.dndNow.textContent = `免打扰：生效中（${hit.start} - ${hit.end}）`;
    els.dndNow.className = 'tag denied';
  } else {
    els.dndNow.textContent = '免打扰：未生效';
    els.dndNow.className = 'tag granted';
  }
}

// ---------- 通知历史 ----------

async function renderHistory() {
  const all = await listHistory();
  els.historyList.innerHTML = '';
  if (all.length === 0) {
    const li = document.createElement('li');
    li.textContent = '暂无记录';
    li.className = 'muted';
    els.historyList.appendChild(li);
    return;
  }
  all.forEach(e => {
    const li = document.createElement('li');
    const time = new Date(e.time);
    const timeStr = `${time.toLocaleDateString()} ${time.toLocaleTimeString()}`;
    const main = document.createElement('span');
    main.textContent = `[${timeStr}] ${e.title}${e.body ? ` — ${e.body}` : ''}`;
    const status = document.createElement('span');
    status.className = 'tag';
    status.textContent = e.status;
    li.append(main, status);
    els.historyList.appendChild(li);
  });
}

async function handleClearHistory() {
  await clearHistory();
  await renderHistory();
  showMessage('通知历史已清空。', 'ok');
}

// ---------- 时区变化检测 ----------

// 判断基于本地时间分量，时区变化天然正确；此处检测变化以刷新可视化与状态。
function watchTimezone() {
  setInterval(() => {
    const offset = new Date().getTimezoneOffset();
    if (offset !== state.tzOffset) {
      state.tzOffset = offset;
      updateDndIndicator();
      renderTimeline(els.canvas, state.dndPeriods);
      showMessage('检测到时区变化，免打扰判断与可视化已按新时区更新。', 'ok');
    }
  }, 30000);
}

// ---------- 初始化 ----------

async function init() {
  if (state.env === 'unsupported') {
    showBanner('当前浏览器不支持 Notification API，通知将降级为页面内提示。', 'warn');
  } else if (state.env === 'insecure') {
    showBanner('当前为非安全上下文（需 HTTPS 或 localhost），系统通知不可用，已降级为页面内提示。', 'warn');
  }

  await refreshPermission();
  await watchPermission(handlePermissionRevoked);

  state.dndPeriods = (await getSetting('dndPeriods', [])) || [];
  renderDnd();
  await renderHistory();

  $('btn-permission').addEventListener('click', handleRequestPermission);
  $('btn-send').addEventListener('click', handleSend);
  $('btn-add-dnd').addEventListener('click', handleAddDnd);
  $('btn-clear-history').addEventListener('click', handleClearHistory);

  // 周期刷新：免打扰指示与时间线
  setInterval(() => {
    updateDndIndicator();
    renderTimeline(els.canvas, state.dndPeriods);
  }, 30000);
  window.addEventListener('resize', () => renderTimeline(els.canvas, state.dndPeriods));
  watchTimezone();
}

init();
