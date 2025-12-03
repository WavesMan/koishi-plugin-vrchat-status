# koishi-plugin-vrchat-status

[![npm](https://img.shields.io/npm/v/koishi-plugin-vrchat-status?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-vrchat-status)

## 简介
- 生成一张美观的 VRChat 系统状态图片，样式与 `external/vrchat-status/index.html` 模板保持一致。
- 自动抓取 VRChat 状态页最新数据，内嵌渐变与坐标轴刻度，确保数值与时间标签不被遮挡。
- 同时显示 UTC 与北京时间的最后更新时间，并在页脚展示插件版本号。

## 功能特点
- 抓取 VRChat 状态页并解析图表数据（可重试与超时控制）。
- 按模板动态渲染：`在线人数 (CCU)`、`API Latency`、`API Requests` 等图表。
- 内嵌 SVG 渐变与网格/坐标轴，视觉为浅色主题友好展示。
- 图片以 `data:image/png;base64,` 方式输出，兼容 Koishi 的最新规范。
  
## 预览图
![preview.png](src/preview.png)

## 安装
- 在 Koishi 控制台市场搜索 `koishi-plugin-vrchat-status` 并安装，或使用命令行：

```bash
yarn add koishi-plugin-vrchat-status@latest
```

## 依赖要求
- `koishi` ≥ `4.18.7`
- 建议启用 `puppeteer` 服务用于 HTML 截图渲染（无该服务将无法生成图片）。
- 可选：网络访问 `https://status.vrchat.com/` 及其数据接口。

## 配置项
- `url`：VRChat 状态页 URL，默认 `https://status.vrchat.com/`
- `timeoutMs`：抓取超时时间（毫秒），默认 `15000`
- `retries`：抓取失败重试次数，默认 `2`

在 Koishi 配置中添加插件并设置相应参数即可。

## 使用方法
- 在聊天中发送指令：

```text
vrcstatus
```

- 插件将返回一张状态图片，包含：
  - 最新在线人数（CCU），显示在“Online Users”卡片右上角；
  - `API Latency` 与 `API Requests` 图表；
  - “Last Updated” 同时显示 UTC 与北京时间；
  - 页脚展示插件版本号与数据来源。

## 渲染与模板说明
- 模板文件：`src/template.ts`，包含以下占位符：
  - `{{time-utc}}`：UTC 时间
  - `{{time-beijing}}`：北京时间（UTC+8）
  - `{{ccu}}`：最新在线人数（千位分隔）
  - `{{version}}`：插件版本号
  - `{{chart-users}}`、`{{chart-latency}}`、`{{chart-requests}}`：对应 SVG 图表内容
- 生成 SVG 时：
  - 内嵌 `<defs><linearGradient id="gradient-primary"/>` 渐变；
  - 折线显式 `fill="none"`，避免默认黑色填充；
  - 左/下坐标轴与网格线、刻度与标签均在视图范围内；
  - 安全边距：左 64、右 24、上 20、下 56，防止文本被裁切。

## 常见问题
- 图片为空或未生成：请确认已启用 `puppeteer` 服务，并确保外网可访问 VRChat 状态页。
- 数据不更新：受状态页接口限流或网络影响，可尝试调大 `timeoutMs` 或提高 `retries`。

## 开发与构建
- 源码位于 `src/` 目录，主要逻辑：
  - 抓取与解析：`src/index.ts` 内的 `fetch()`、`parseGraphs()` 与 `buildSvgs()`；
  - SVG 生成：`generateSvgChart()`；
  - HTML 渲染：`renderHtml()`；
  - 截图生成：`renderImage()`（依赖 Puppeteer）。
- 修改模板后执行`npx tsc -p tsconfig.json`

## 许可证
- [MIT](LICENSE)
