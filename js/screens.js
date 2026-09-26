// 屏幕枚举与权限管理（Window Management API + Permissions API）。

export function isWindowManagementSupported() {
  return typeof window.getScreenDetails === 'function';
}

export async function queryPermission() {
  if (!('permissions' in navigator)) return 'unknown';
  try {
    const status = await navigator.permissions.query({ name: 'window-management' });
    return status.state; // 'granted' | 'denied' | 'prompt'
  } catch {
    return 'unknown';
  }
}

// 申请权限：通过一次用户手势调用 getScreenDetails 触发授权弹窗。
export async function requestPermission() {
  if (!isWindowManagementSupported()) {
    return { state: 'unsupported', details: null };
  }
  try {
    const details = await window.getScreenDetails();
    return { state: 'granted', details };
  } catch (err) {
    return { state: 'denied', error: err, details: null };
  }
}

// 统一屏幕模型，兼容多屏 API 与单屏降级。
export function normalizeScreens(details) {
  if (details && details.screens && details.screens.length > 0) {
    return details.screens.map((s, i) => ({
      id: i,
      label: s.label || `屏幕 ${i + 1}`,
      isPrimary: s.isPrimary,
      left: s.left,
      top: s.top,
      width: s.width,
      height: s.height,
      availLeft: s.availLeft,
      availTop: s.availTop,
      availWidth: s.availWidth,
      availHeight: s.availHeight,
      scaleFactor: s.devicePixelRatio,
      raw: s,
    }));
  }
  // 降级：仅当前屏幕
  const s = window.screen;
  return [{
    id: 0,
    label: '当前屏幕（降级模式）',
    isPrimary: true,
    left: s.left ?? 0,
    top: s.top ?? 0,
    width: s.width,
    height: s.height,
    availLeft: s.availLeft ?? 0,
    availTop: s.availTop ?? 0,
    availWidth: s.availWidth,
    availHeight: s.availHeight,
    scaleFactor: window.devicePixelRatio || 1,
    raw: null,
  }];
}

export function screenArea(screen) {
  return {
    left: screen.availLeft,
    top: screen.availTop,
    width: screen.availWidth,
    height: screen.availHeight,
  };
}
