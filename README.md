# 多窗口布局管理器

基于 **Window Management API + Permissions API + IndexedDB + Canvas** 的多屏幕多窗口布局管理演示应用。

## 运行

需要通过 HTTP(S) 访问（`file://` 下 Window Management API 与 IndexedDB 受限）：

```bash
cd A
python3 -m http.server 8080
# 打开 http://localhost:8080
```

推荐 Chrome / Edge 100+。Firefox / Safari 不支持 Window Management API，会自动进入单窗口降级模式。

## 功能与验收对照

| 验收标准 | 实现 |
| --- | --- |
| 屏幕枚举准确 | `getScreenDetails()` 枚举所有屏幕的可用区域、主屏、缩放比；监听 `screenschange` |
| 网格 / 瀑布 / 主次布局 | `js/layouts.js` 三种算法，均基于屏幕可用区域计算 |
| 布局保存 / 恢复 | IndexedDB 持久化，含屏幕环境签名；恢复时环境不一致会提示并自动适配 |
| 权限被拒提示 | Permissions API 查询状态，拒绝后显示降级说明与重新授权指引 |
| 不支持时降级 | 无 `getScreenDetails` 时降级为 `window.screen` 单屏模式，布局功能仍可用 |
| 多屏幕差异处理 | 统一多屏坐标系（含负坐标），布局可指定目标屏幕，预览按比例绘制所有屏幕 |
| 窗口关闭后布局更新 | 500ms 轮询 `win.closed`，关闭后自动更新预览与日志 |
| 越界提示 | 应用/恢复/屏幕变化时检测越界，黄色警告条提示并自动钳制到最近屏幕 |
| 布局预览准确 | Canvas 按真实坐标比例绘制屏幕与窗口矩形，越界窗口红色高亮，点击可激活窗口 |

## 使用流程

1. 点击「申请 Window Management 权限」（需用户手势，故不自动触发）。
2. 选择窗口数量与目标屏幕，点击网格 / 瀑布 / 主次布局按钮。
3. 在 Canvas 预览中查看排列效果；手动关闭某个子窗口，预览会随之更新。
4. 输入名称保存布局；刷新页面或插拔显示器后可恢复，环境变化时自动钳制越界窗口 。

## 文件结构

- `index.html` — 页面结构
- `css/style.css` — 样式
- `js/screens.js` — 权限申请、屏幕枚举、降级
- `js/layouts.js` — 网格 / 瀑布 / 主次布局算法、越界检测与钳制
- `js/windows.js` — 子窗口打开 / 复用 / 关闭检测
- `js/store.js` — IndexedDB 布局存取
- `js/preview.js` — Canvas 预览与点击命中
- `js/app.js` — 主逻辑与 UI 绑定
