/* screens.js — Window Management API + Permissions API 屏幕枚举与降级 */
const ScreenManager = (() => {
  const state = {
    supported: 'getScreenDetails' in window,
    permission: 'unknown',   // granted | denied | prompt | unsupported | unknown
    screens: [],             // 统一结构 {left, top, width, height, isPrimary, devicePixelRatio, label, internal}
    screenDetails: null,     // getScreenDetails() 返回对象（用于监听 change）
    listeners: { change: [] }
  };

  function onChange(fn) { state.listeners.change.push(fn); }
  function emitChange() { state.listeners.change.forEach(fn => fn(state.screens)); }

  /* 将 ScreenDetailed / Screen 归一化为统一结构 */
  function normalize(s, isPrimaryFallback) {
    const detailed = 'availLeft' in s;
    return {
      left: detailed ? s.availLeft : (s.availLeft !== undefined ? s.availLeft : 0),
      top: detailed ? s.availTop : (s.availTop !== undefined ? s.availTop : 0),
      width: detailed ? s.availWidth : (s.availWidth || s.width),
      height: detailed ? s.availHeight : (s.availHeight || s.height),
      isPrimary: detailed ? s.isPrimary : !!isPrimaryFallback,
      devicePixelRatio: detailed ? s.devicePixelRatio : (window.devicePixelRatio || 1),
      label: s.label || (detailed ? '未命名屏幕' : '当前屏幕（降级模式）'),
      internal: detailed ? s : null
    };
  }

  /* 降级：仅使用 window.screen 的单屏幕信息 */
  function fallbackScreens() {
    state.screens = [normalize(window.screen, true)];
    state.screenDetails = null;
    emitChange();
    return state.screens;
  }

  async function queryPermission() {
    if (!state.supported) {
      state.permission = 'unsupported';
      return state.permission;
    }
    try {
      const status = await navigator.permissions.query({ name: 'window-management' });
      state.permission = status.state; // granted | denied | prompt
      status.onchange = () => {
        state.permission = status.state;
        if (status.state === 'granted') refresh();
        else fallbackScreens();
      };
    } catch (e) {
      // 某些浏览器不认识该权限名，尝试直接调用 getScreenDetails 触发
      state.permission = 'prompt';
    }
    return state.permission;
  }

  /* 申请权限并枚举屏幕。注意：getScreenDetails 需要用户手势触发 */
  async function requestAndEnumerate() {
    if (!state.supported) {
      state.permission = 'unsupported';
      fallbackScreens();
      return { granted: false, screens: state.screens };
    }
    try {
      const details = await window.getScreenDetails();
      state.permission = 'granted';
      state.screenDetails = details;
      state.screens = details.screens.map(s => normalize(s));
      // 多屏变化（插拔显示器、分辨率变化）
      details.onscreenschange = () => {
        state.screens = details.screens.map(s => normalize(s));
        emitChange();
      };
      emitChange();
      return { granted: true, screens: state.screens };
    } catch (e) {
      // 用户拒绝或策略阻止
      state.permission = 'denied';
      fallbackScreens();
      return { granted: false, error: e, screens: state.screens };
    }
  }

  /* 已授权情况下的静默刷新 */
  async function refresh() {
    if (state.permission === 'granted') return requestAndEnumerate();
    fallbackScreens();
    return { granted: false, screens: state.screens };
  }

  /* 屏幕签名：用于恢复布局时判断屏幕环境是否变化 */
  function signature(screens) {
    return (screens || state.screens)
      .map(s => `${s.left},${s.top},${s.width},${s.height}`)
      .sort()
      .join('|');
  }

  return { state, queryPermission, requestAndEnumerate, refresh, fallbackScreens, signature, onChange };
})();
