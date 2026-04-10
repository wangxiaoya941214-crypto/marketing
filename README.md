<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# SUPEREV 营销分析助手

这是一个可在本地运行的 `Vite + React + Express + Gemini/OpenAI` 分析工具。
现在的页面流程是：

1. 首页继续保留“上传 / 粘贴数据”的主入口
2. 用户点击“数据分析”后，先进入“数据匹配页”确认识别结果
3. 确认后再生成最终分析报告和可视化看板

## 本地启动

前置要求：`Node.js`

1. 安装依赖
   `npm install`
2. 新建 `.env.local` 并配置至少一个密钥
   `GEMINI_API_KEY=你的 Gemini Key`
3. 可选：指定 Gemini 模型
   `GEMINI_MODEL=gemini-2.5-flash`
4. 启动本地服务
   `npm run dev`
5. 打开浏览器访问
   [http://localhost:3000](http://localhost:3000)

## Railway 部署

这个项目已经适配 Railway：

- 服务端会优先读取 Railway 注入的 `PORT`
- 生产启动命令使用 `npm start`
- 构建命令使用 `npm run build`

如果你通过 GitHub 连接 Railway，常用配置就是：

- Build Command: `npm run build`
- Start Command: `npm start`

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
