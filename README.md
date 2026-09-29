# 通知与免打扰时段

基于 **Notification API + Permissions API + IndexedDB + DOM + Canvas** 的通知演示应用，不使用任何框架。

## 运行

需要通过 HTTP(S) 访问（`file://` 下 Notification / IndexedDB 受限）：

```bash
cd A
python3 -m http.server 8080
# 打开 http://localhost:8080
```

Chrome / Edge / Firefox 均支持系统通知；不支持或非安全上下文时自动降级为页内卡片通知。

## 功能与验收对照

| 验收标准 | 实现 |
| --- | --- |
| 权限状态准确 | 启动时读取 `Notification.permission`，并用 Permissions API（`name:'notifications'`）查询；权限申请仅在真实用户点击手势中触发，`requestPermission` 回调/Promise 双兼容且整体 try/catch，未交互时绝不自动申请、不会崩 |
| 权限被拒有提示 | 拒绝后显示红色警告条与地址栏站点设置重新授权指引；按钮禁用并给出 `title` 说明 |
| 权限被撤销后状态更新 | 监听 PermissionStatus 的 `change` 事件，并以 4s 轮询 `Notification.permission` 兜底，撤销后徽标/警告立即更新 |
| 浏览器不支持 / 非安全上下文 | 分别检测并在环境面板中独立展示（支持性、`window.isSecureContext`、Permissions API、IndexedDB、当前时区）；发送时自动降级为右下角页内卡片，历史仍完整记录 |
| 通知发送正确 | 支持标题、正文、图标（Canvas 生成默认铃铛 dataURL，也可关闭图标）；点击通知触发回调（聚焦窗口 + 更新历史为“已点击”） |
| 发送失败重试 | `new Notification()` 构造抛错或 150ms 内 `onerror` 时，按 500ms、1000ms 指数退避重试最多 3 次；最终失败后降级展示页内卡片并记录错误 |
| 免打扰时段内被拦截 | 发送时按本地时间判断，命中时段且未勾选“强制发送”则不弹系统通知，历史标记“DND 已拦截” |
| 跨天时段判断正确 | `end <= start` 视为跨天（如 22:00–08:00：`cur >= start || cur < end`）；`start === end` 视为 0 时长不拦截 |
| 时区变化后正确 | 同时比较时区偏移与 IANA 标签（覆盖同偏移改名与夏令时），`visibilitychange`/`focus` 立即复核 + 10s 轮询；变化后重算倒计时并重绘 Canvas |
| 通知历史可查 | IndexedDB 持久化（上限 200 条，自动淘汰最旧），按时间倒序展示，点击列表项触发点击回调；IndexedDB 不可用时降级内存存储 |
| 时段可视化准确 | Canvas 24 小时时间轴：小时刻度、蓝色弧带（跨天自动拆两段）、起止时刻标签、红色“当前时刻”刻度；按 devicePixelRatio 渲染，窗口缩放自动重绘 |

## 使用流程

1. 查看“权限与运行环境”面板确认支持性与安全上下文；点击「申请通知权限」（必须用户手势）。
2. 填写标题/正文，点击「发送通知」；在系统通知上点击可触发回调并回写历史状态。
3. 设置免打扰起止时间（如 22:00–08:00 跨天），时间轴实时显示弧带与当前时刻；切换系统时区后页面自动重算。
4. 在“通知历史”中查看每条通知的状态（已送达 / 已点击 / DND 已拦截 / 失败 / 降级），点击条目触发回调。

## 文件结构

- `index.html` — 页面结构
- `css/style.css` — 样式
- `js/store.js` — IndexedDB 通知历史与免打扰设置存取（失败降级内存）
- `js/dnd.js` — 免打扰时段判断（含跨天、下次切换倒计时）与时区变化监测
- `js/notifier.js` — Notification API 封装：环境/权限检测、手势内申请、重试发送、权限撤销监听、页内卡片降级
- `js/timeline.js` — Canvas 24 小时时段可视化
- `js/app.js` — 主逻辑与 UI 绑定
