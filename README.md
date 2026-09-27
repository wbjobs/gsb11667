# 通知与免打扰管理

基于 Notification API + Permissions API + IndexedDB + Canvas 的通知发送与免打扰时段管理工具，无框架、无构建步骤。

## 运行

静态站点。系统通知要求安全上下文（HTTPS 或 localhost）。

```bash
npx serve .        # 或 python3 -m http.server
```

## 功能

- **权限申请**：点击按钮触发 `Notification.requestPermission()`；Permissions API 查询并监听权限变化（撤销后状态自动更新）。
- **发送通知**：共 3 次尝试（首次 + 重试 2 次），退避延迟 600ms / 1200ms；支持标题、正文、图标；点击回调更新历史为「已点击」。
- **免打扰时段**：可添加多个时段，支持跨天（如 22:00 - 07:00）；时段内发送被拦截并记录「已拦截（免打扰）」。
- **通知历史**：IndexedDB 持久化，记录 已发送 / 拦截 / 降级 / 失败 / 点击 状态，可清空。
- **时段可视化**：Canvas 24 小时时间轴，免打扰段橙色高亮，当前时间红线，跨天时段拆成两段绘制。

## 边界与异常处理

| 场景 | 处理 |
| --- | --- |
| 浏览器不支持 | 检测 `window.Notification`，banner 提示并降级为页面内 toast |
| 非安全上下文 | isSecureContext 检测，同样降级 |
| 权限被拒 | banner 提示去站点设置开启；发送时降级 toast |
| 用户未交互 | `navigator.userActivation.isActive` 判断，无手势不调用申请，页面内提示 |
| 免打扰跨天 | `start > end` 时按 `mins >= start \|\| mins < end` 判断 |
| 时区变化 | 判断基于本地时间分量天然正确；每 30s 检测 `getTimezoneOffset()` 刷新可视化与状态 |
| 发送失败 | 自动重试 2 次仍失败则记录「发送失败（已重试）」 |
| 权限被撤销 | Permissions API `change` 事件，状态标签与 banner 实时更新 |

## 文件结构

- `index.html` / `styles.css` — 页面与样式
- `js/main.js` — 状态管理与交互编排
- `js/permissions.js` — 环境检测、权限申请与撤销监听
- `js/dnd.js` — 免打扰时段判断（纯函数，含跨天）
- `js/notify.js` — 通知发送与失败重试
- `js/db.js` — IndexedDB 持久化（历史 + 设置）

- `js/timeline.js` — Canvas 24 小时时段可视化
