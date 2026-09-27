// 通知权限管理：区分不支持 / 非安全上下文 / 被拒 / 待申请，
// 并通过 Permissions API 监听权限被撤销。

// 返回 'ok' | 'unsupported' | 'insecure'
export function checkEnvironment() {
  if (!('Notification' in window)) return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  return 'ok';
}

// 返回 'granted' | 'denied' | 'default' | 'unsupported' | 'insecure'
export function currentPermission() {
  const env = checkEnvironment();
  if (env !== 'ok') return env;
  return Notification.permission;
}

// 申请权限。必须在用户手势中调用；无用户激活时直接返回 'no-gesture'，
// 避免部分浏览器自动拒绝或抛错导致崩溃。
export async function requestPermission() {
  const env = checkEnvironment();
  if (env !== 'ok') return env;
  if (navigator.userActivation && !navigator.userActivation.isActive) {
    return 'no-gesture';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    // 某些浏览器（旧版回调式）可能抛错，回退读取当前状态
    return Notification.permission;
  }
}

// 通过 Permissions API 监听权限变化（如用户在浏览器设置里撤销授权）。
// 返回 PermissionStatus 或 null（不支持查询时）。
export async function watchPermission(onChange) {
  if (!('permissions' in navigator)) return null;
  try {
    const status = await navigator.permissions.query({ name: 'notifications' });
    status.addEventListener('change', () => onChange(currentPermission()));
    return status;
  } catch {
    return null;
  }
}
