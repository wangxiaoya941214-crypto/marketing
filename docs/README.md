# 文档导航 README

## 1. 这套文档是做什么的

这套文档服务于 `SUPEREV 营销分析助手` 的后续持续迭代，用来把「产品目标、提示词、设计规范、背景知识、项目结构」从代码里抽出来，变成团队可复用的工作底稿。

建议把这里当成后续工作的导航地图：

- 想知道产品是什么、要解决什么问题：先看 `PRD.md`
- 想优化 AI 输出效果：先看 `PROMPTS.md`
- 想改页面或新增模块：先看 `DESIGN.md`
- 想理解业务术语和分析口径：先看 `BACKGROUND.md`
- 想快速熟悉项目和文档关系：先看本文件

另外，项目根目录还保留了一份更偏代码审计视角的报告：

- `../代码信息提取报告.md`

它适合做代码排查和需求拆分时参考。

---

## 2. 文档目录

| 文件 | 用途 | 什么时候看 |
|---|---|---|
| `PRD.md` | 产品需求文档，定义产品定位、目标用户、核心问题、核心功能和阶段目标 | 新需求讨论、产品方向对齐 |
| `PROMPTS.md` | 当前项目所有关键提示词、模型路由、调优原则 | AI 识别/分析输出不稳定时 |
| `DESIGN.md` | 界面设计规范、交互流、视觉风格、组件原则 | 做前端改版、新模块设计时 |
| `BACKGROUND.md` | 业务术语、分析口径、品牌红线、参考资料清单 | 理解业务背景、补知识时 |
| `ERROR_GUARDS.md` | 错误判定规则、已修改点记录、防重复清单 | 复盘 bug、开发前自检时 |
| `README.md` | 当前文档体系导航 | 初次进入项目或切换上下文时 |

---

## 3. 项目结构速览

```text
superev-营销分析助手/
├─ server.ts                    # Express 服务与 API
├─ shared/marketing-engine.ts   # 核心分析引擎
├─ src/App.tsx                  # 主应用：输入、匹配、结果页
├─ src/components/              # 结果模块、上期数据模块
├─ README.md                    # 运行与部署说明
├─ 代码信息提取报告.md          # 代码层面的结构化分析报告
└─ docs/                        # 本文档目录
```

---

## 4. 当前运行方式

### 本地开发

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

参考根目录 `.env.example`，常用项：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `YUNWU_API_KEY`
- `YUNWU_BASE_URL`
- `YUNWU_MODEL`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `SILICONFLOW_API_KEY`
- `SILICONFLOW_MODEL`

3. 启动开发服务

```bash
npm run dev
```

4. 打开浏览器

- [http://localhost:3000](http://localhost:3000)

### 生产构建

```bash
npm run build
npm start
```

---

## 5. 业务流程导航

当前产品的主流程是：

1. 首页导入数据
2. 系统自动识别
3. 数据匹配页人工确认
4. 生成结构化分析
5. 展示结果页并导出 PDF

对应代码入口：

- 数据导入：首页 `src/App.tsx`
- 识别 API：`server.ts` -> `/api/recognize-input`
- 分析引擎：`shared/marketing-engine.ts` -> `analyzeMarketingInput`
- 结果页：`src/App.tsx`

---

## 6. 文档之间的关系

可以按下面顺序理解：

```text
BACKGROUND.md
  ↓ 提供业务上下文和术语口径
PRD.md
  ↓ 定义产品目标、问题和功能边界
DESIGN.md
  ↓ 把产品目标落到界面和交互
PROMPTS.md
  ↓ 把识别与分析输出的 AI 策略沉淀下来
ERROR_GUARDS.md
  ↓ 记录已经踩过的坑和防重复规则
代码信息提取报告.md
  ↓ 对照真实代码，判断哪些已实现、哪些待补
```

---

## 7. 后续工作建议

如果下一步要继续升级项目，建议按下面顺序推进：

1. 先读 `PRD.md`，确认需求目标没有跑偏
2. 再读 `BACKGROUND.md`，确认分析口径与品牌红线
3. 开始前端工作前读 `DESIGN.md`
4. 调 AI 输出时同步维护 `PROMPTS.md`
5. 开发前先过一遍 `ERROR_GUARDS.md`
6. 每完成一轮功能升级，补一次 `代码信息提取报告.md` 或在 PRD 中更新版本说明

---

## 8. 文档维护原则

- 产品能力变化时，优先更新 `PRD.md`
- Prompt 或模型路由变化时，优先更新 `PROMPTS.md`
- UI 结构或交互逻辑变化时，优先更新 `DESIGN.md`
- 新的业务术语、限制、内部共识出现时，优先更新 `BACKGROUND.md`
- 任何已经出现过的 bug、误判、字段遗漏，都优先更新 `ERROR_GUARDS.md`
- 文档尽量写“当前真实实现 + 下一步建议”，不要只写理想状态
