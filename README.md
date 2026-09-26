# 多窗口布局管理器

基于 Window Management API + Permissions API + IndexedDB + Canvas 的多屏幕、多窗口布局管理工具。

## 运行

静态站点，无构建步骤。需要通过 HTTP(S) 访问（Window Management API 要求安全上下文）：

```bash
npx serve .        # 或 python3 -m http.server
```

浏览器要求：Chrome / Edge 100+（Window Management API 仅 Chromium 系支持）。

## 功能

- **权限申请**：点击按钮触发 `getScreenDetails()` 授权弹窗；Permissions API 查询并展示当前权限状态。
- **屏幕枚举**：列出所有屏幕的分辨率、可用区域、原点坐标、缩放比、主屏标记；监听 `screenschange` 自动更新。
- **窗口管理**：打开/关闭子窗口，周期检测手动关闭的窗口并更新布局与预览。
- **布局算法**：网格、瀑布（级联回绕）、主次（2/3 主区 + 右侧均分）。
- **保存/恢复**：布局以相对屏幕可用区域的坐标存入 IndexedDB；恢复时按目标屏幕等比缩放适配，窗口数不一致时按原布局类型重新计算。
- **布局预览**：Canvas 按比例绘制所有屏幕与窗口目标矩形，越界窗口红色高亮。

## 验收标准对照

| 标准 | 实现 |
| --- | --- |
| 屏幕枚举准确 | `js/screens.js` 统一模型，含 avail 区域与 scaleFactor |
| 三种布局正确 | `js/layouts.js`，纯函数可单测 |
| 布局保存恢复 | `js/db.js` IndexedDB，相对坐标 + 跨屏缩放适配 |
| 权限被拒提示 | banner 提示并降级单屏 |
| 不支持时降级 | 检测 `getScreenDetails`，降级 `window.screen` 单屏 |
| 多屏幕差异 | 负坐标原点、不同分辨率/缩放在布局与预览中正确处理 |
| 窗口关闭更新 | 1s 轮询 `win.closed` + 手动关闭回调 |
| 越界提示 | `findOutOfBounds` 检测，提示并自动钳制 |
| 布局预览准确 | Canvas 按屏幕联合包围盒等比缩放绘制 |

## 文件结构

- `index.html` / `styles.css` — 页面与样式
- `js/main.js` — 状态管理与交互编排
- `js/screens.js` — 权限与屏幕枚举（含降级）
- `js/layouts.js` — 布局算法与越界处理
- `js/db.js` — IndexedDB 持久化
- `js/preview.js` — Canvas 预览渲染
