<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# SUPEREV 营销分析助手

这是一个可在本地运行的 `Vite + React + Express + OpenAI-compatible / Gemini / SiliconFlow` 分析工具。

当前版本的对外主口径已经冻结为：

> `闭环分析工作台（首版）`

当前主流程口径已经冻结为：

```text
统一上传
-> 后台识别与分析
-> 进入对应分析页 / 看板
```

当前需要统一理解的产品边界：

1. `闭环分析` 是当前主方向，也是这版真正要交付的核心能力
2. `营销诊断` 继续保留，但属于兼容能力，不作为当前首页主产品单独对外讲
3. `销售跟进诊断`、`投放数据转化诊断`、`内容传播诊断` 已接入统一分流，但当前仍属于兼容链路下的诊断视角，不单独定义为完整独立产品

当前产品在执行层仍包含两类链路：

1. `闭环分析链`：导入工作台 -> 复核队列 -> 闭环分析 -> 经营驾驶舱
2. `营销诊断兼容链`：识别 -> 数据匹配 -> 分析报告

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

## Railway 生产部署（当前主口径）

当前正式生产口径统一按 Railway 执行。  
当前线上服务：

- `superev-marketing-assistant`
- 公网域名：`https://superev-marketing-assistant-production.up.railway.app`

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
- `DATABASE_URL=你的生产 Postgres`
- `CLOSED_LOOP_API_TOKEN=闭环接口令牌`
- `CLOSED_LOOP_REQUIRE_AUTH=0`
- `CLOSED_LOOP_READ_ROLES=operator,admin`
- `CLOSED_LOOP_REVIEW_ROLES=operator,admin`
- `CLOSED_LOOP_WRITE_ROLES=operator,admin`
- `VITE_CLOSED_LOOP_API_TOKEN=与 CLOSED_LOOP_API_TOKEN 保持一致`
- `VITE_CLOSED_LOOP_USER_ROLE=operator`

说明：

- 当前 Railway 线上记录的是 `CLOSED_LOOP_REQUIRE_AUTH=0`
- 只要 `CLOSED_LOOP_API_TOKEN` 已配置，闭环接口仍会继续校验 token 和角色
- `CLOSED_LOOP_REQUIRE_AUTH=1` 更适合本地 / staging 想在缺少 token 时也强制拦截的场景

线上默认优先级：

- 最终分析：`云雾(claude-sonnet-4-5-20250929-thinking)` -> `Gemini` -> `SiliconFlow`
- 图片 / PDF 识别：`云雾(claude-sonnet-4-5-20250929-thinking)` -> `Gemini`

Railway 线上链路约定：

- 启动命令走 `npm start`
- 服务端接口由 `server.ts` 承载
- 生产环境变量统一在 Railway 服务里维护
- `DATABASE_URL` 是闭环生产链唯一数据库入口
- 闭环接口鉴权依赖 `CLOSED_LOOP_*` 与 `VITE_CLOSED_LOOP_*`

## Vercel 兼容说明

仓库仍保留 Vercel 所需的 `api/**` 与 `vercel.json`，用于兼容或预览。  
但当前版本里，Vercel 不作为正式生产口径，也不作为默认验收目标。

## 发版放行标准

重新进入发版评审前，至少同时满足：

1. `npm run release:check`
2. `npm run lint`
3. `npm run build`
4. `node --import tsx --test tests/*.test.ts`
5. `npx playwright test tests/e2e/closed-loop-v2-entry.spec.ts`
7. 线上平台口径唯一，且当前版本按 Railway 验收

当前版本先按闭环链路做发版评审；旧模式回归放到下一个统一迭代里再一起收口。

`release:check` 默认只检查当前 release candidate（`HEAD` 与 staged changes）。  
如果要把本地未暂存改动也纳入审计，执行：

`RELEASE_INCLUDE_WORKTREE=1 npm run release:check`

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

说明：

- 当前 E2E 默认启动生产态 `npm start`
- 建议先执行一次 `npm run build`，再跑浏览器回归
