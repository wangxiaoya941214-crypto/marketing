<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# SUPEREV 营销分析助手

这是一个可在本地运行的 `Vite + React + Express + OpenAI / Gemini / SiliconFlow` 分析工具。
现在的页面流程是：

1. 首页继续保留“上传 / 粘贴数据”的主入口
2. 用户点击“数据分析”后，先进入“数据匹配页”确认识别结果
3. 确认后再生成最终分析报告和可视化看板

## 本地启动

前置要求：`Node.js`

1. 安装依赖
   `npm install`
2. 新建 `.env.local`
3. 本地如果希望优先走 OpenAI / gpt-5.4，配置：
   `OPENAI_API_KEY=你的 OpenAI Key`
   `OPENAI_MODEL=gpt-5.4`
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

线上推荐使用 SiliconFlow 接千问 3.5：

- `SILICONFLOW_API_KEY=你的硅基流 key`
- `SILICONFLOW_MODEL=Qwen/Qwen3.5-397B-A17B`
- 可选：`SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1`

如果线上也要支持图片 / PDF 智能识别，再额外补一个：

- `OPENAI_API_KEY=你的 OpenAI key`
或
- `GEMINI_API_KEY=你的 Gemini key`

线上默认优先级：

- 最终分析：`SiliconFlow(Qwen/Qwen3.5-397B-A17B)` -> `Gemini` -> `OpenAI`
- 图片 / PDF 识别：`Gemini` -> `OpenAI`
 
这个项目已经适配 Railway：

- 服务端会优先读取 Railway 注入的 `PORT`
- 生产启动命令使用 `npm start`
- 构建命令使用 `npm run build`
- AI Provider 支持 `OPENAI_API_KEY`、`GEMINI_API_KEY`、`SILICONFLOW_API_KEY`

如果你通过 GitHub 连接 Railway，常用配置就是：

- Build Command: `npm run build`
- Start Command: `npm start`
- Variables:
  - `SILICONFLOW_API_KEY=你的硅基流 key`
  - `SILICONFLOW_MODEL=Qwen/Qwen3.5-397B-A17B`
  - 可选：`SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1`

## 当前支持的输入

- 直接粘贴文本数据
- 图片
- PDF
- Word（`.docx`）
- TXT / CSV / Markdown

说明：

- 首页提供了一个可下载的 `CSV` 数据模板，方便团队回填更标准的数据结构，但不是强制要求。
- 如果你手里是 Excel 文件，建议先导出为 `CSV` 再上传。
- 图片 / PDF 的智能识别依赖 `GEMINI_API_KEY` 或 `OPENAI_API_KEY`，没有密钥时仍可用文本 / CSV / Word 走规则识别。
