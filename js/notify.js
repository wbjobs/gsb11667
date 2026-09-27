// 通知发送：构造 Notification，失败时指数退避重试，支持点击回调。

export async function sendNotification(
  { title, body, icon },
  { retries = 2, baseDelayMs = 600, onClick } = {}
) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const options = {};
      if (body) options.body = body;
      if (icon) options.icon = icon;
      const notification = new Notification(title, options);
      if (onClick) {
        notification.onclick = () => {
          try { window.focus(); } catch { /* 忽略 */ }
          onClick();
        };
      }
      return notification;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, baseDelayMs * (attempt + 1)));
      }
    }
  }
  throw lastError;
}
