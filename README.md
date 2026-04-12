<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# SUPEREV 营销分析助手

这是一个可在本地运行的 `Vite + React + Express + OpenAI-compatible / Gemini / SiliconFlow` 分析工具。
现在的页面流程是：

1. 首页继续保留“上传 / 粘贴数据”的主入口
2. 用户点击“数据分析”后，先进入“数据匹配页”确认识别结果
3. 确认后再生成最终分析报告和可视化看板

## 本地启动

前置要求：`Node.js 20.19+` 或 `22.12+`

1. 安装依赖
   `npm install`
2. 新建 `.env.local`
3. 本地默认只测本地这条 AI 路径，不走线上云雾。配置：
   `OPENAI_API_KEY=你的本地 OpenAI / Codex 兼容 Key`
   `OPENAI_MODEL=gpt-5.4`
   只有在你明确要测线上识别或线上链路时，才临时补：
   `OPENAI_BASE_URL=你的线上兼容网关地址`
   `OPENAI_MODEL=你的线上模型`
4. 可选：补一个 Gemini 作为图片 / PDF 识别备用：
   `GEMINI_API_KEY=你的 Gemini Key`
   `GEMINI_MODEL=gemini-2.5-flash`
5. 启动本地服务
   `npm run dev`
6. 打开浏览器访问
   [http://localhost:3000](http://localhost:3000)

本地默认优先级：

- 最终分析：`OpenAI(gpt-5.4)` -> `Gemini` -> `SiliconFlow`
- 图片 / PDF 识别：`OpenAI(gpt-5.4)` -> `Gemini`

## Railway 部署

线上统一主路径改为云雾 OpenAI 兼容接口：

- `YUNWU_API_KEY=你的云雾 key`
- `YUNWU_BASE_URL=https://yunwu.ai/v1`
- `YUNWU_MODEL=claude-sonnet-4-5-20250929-thinking`

兼容写法也支持继续使用：

- `OPENAI_API_KEY=你的云雾 key`
- `OPENAI_BASE_URL=https://yunwu.ai/v1`
- `OPENAI_MODEL=claude-sonnet-4-5-20250929-thinking`

如果你希望在线上保留备用兜底，再额外补：

- `GEMINI_API_KEY=你的 Gemini key`
- `SILICONFLOW_API_KEY=你的硅基流 key`

线上默认优先级：

- 最终分析：`云雾(claude-sonnet-4-5-20250929-thinking)` -> `Gemini` -> `SiliconFlow`
- 图片 / PDF 识别：`云雾(claude-sonnet-4-5-20250929-thinking)` -> `Gemini`
 
这个项目已经适配 Railway：

- 服务端会优先读取 Railway 注入的 `PORT`
- 生产启动命令使用 `npm start`
- 构建命令使用 `npm run build`
- AI Provider 支持 `YUNWU_API_KEY`、`YUNWU_BASE_URL`、`YUNWU_MODEL`，也兼容 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`

如果你通过 GitHub 连接 Railway，常用配置就是：

- Build Command: `npm run build`
- Start Command: `npm start`
- Variables:
  - `YUNWU_API_KEY=你的云雾 key`
  - `YUNWU_BASE_URL=https://yunwu.ai/v1`
  - `YUNWU_MODEL=claude-sonnet-4-5-20250929-thinking`
  - 可选：`GEMINI_API_KEY=你的 Gemini key`

## 当前支持的输入

- 直接粘贴文本数据
- 图片
- PDF
- Word（`.docx`）
- TXT / CSV / Markdown

说明：

- 首页提供了一个可下载的 `CSV` 数据模板，方便团队回填更标准的数据结构，但不是强制要求。
- 如果你手里是 Excel 文件，建议先导出为 `CSV` 再上传。
- 图片 / PDF 的智能识别依赖 `YUNWU_API_KEY`（或 `OPENAI_API_KEY`）或 `GEMINI_API_KEY`，没有密钥时仍可用文本 / CSV / Word 走规则识别。
- 如果线上兼容网关对 `input_file` 支持不完整，系统会继续回退到 Gemini 备用链路。

## 每日浏览器巡检

仓库现在内置了一套 `Playwright + AI` 的每日巡检闭环。

首次使用前，先安装 Playwright 浏览器：

`npx playwright install chromium`

如果当天已经收到用户反馈，把内容追加到：

`reports/browser-check/用户反馈.md`

然后执行：

`npm run test:e2e:daily`

这个命令会自动完成：

- 启动本地服务
- 用 Playwright 自动上传模板数据并跑完整主流程
- 生成截图、JSON 报告、HTML 报告和中文 Markdown 总结
- 如果存在 `OPENAI_API_KEY`，额外生成一段 AI 判断
- 自动和上一次失败项做对比，标出新增失败、已恢复、持续失败
- 自动把用户反馈和本次结果放在一份报告里对照

产物默认输出到：

- `reports/browser-check/runs/<时间戳>/测试报告.md`
- `reports/browser-check/runs/<时间戳>/playwright-report/`
- `reports/browser-check/latest.md`

如果只想直接跑 Playwright，不生成日报：

`npm run test:e2e`
