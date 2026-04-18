# 文档导航 README

## 1. 这套文档是做什么的

这套文档服务于 `SUPEREV 营销分析助手` 的持续迭代，用来把「产品目标、提示词、设计规范、背景知识、项目结构、任务台账」从代码里抽出来，变成团队可复用的工作底稿。

建议把这里当成导航地图：

- 想知道当前版本到底是什么：先看 `产品说明.md`
- 想看正式需求边界：先看 `PRD.md`
- 想理解业务术语和红线：先看 `BACKGROUND.md`
- 想看首页入口和 V2 跳转：先看 `V2.0_入口与跳转规则.md`
- 想查最近做了什么：先看 `CHANGELOG.md`

另外，项目根目录还保留了一份更偏代码审计视角的报告：

- `../代码信息提取报告.md`

它适合做代码排查和需求拆分时参考。

---

## 2. 文档目录

| 文件 | 用途 | 什么时候看 |
|---|---|---|
| `产品说明.md` | 当前版本产品说明，统一对外口径、定位、主流程、能力边界 | 要对内对外介绍产品时 |
| `PRD.md` | 当前真实版本需求文档，明确主产品、兼容链、成功标准 | 新需求讨论、产品方向对齐 |
| `PM_项目交接说明.md` | PM 视角的项目交接、推进顺序和风险说明 | 新 PM / 新 owner 接手时 |
| `V2.0_入口与跳转规则.md` | V2 默认首页、后台识别、直达对应看板规则 | 调整首页入口和 V2 跳转时 |
| `V2.0_总控清单.md` | V2.0 换代的总控、阶段顺序和团队协作方法 | 正式推进 V2.0 时 |
| `V2.0_后端A任务单.md` | 后端 A 的 V2.0 任务单 | 分配上传、识别、build-session 时 |
| `V2.0_后端B任务单.md` | 后端 B 的 V2.0 任务单 | 分配 snapshot、六看板读模型、Agent、预警时 |
| `V2.0_前端任务单.md` | 前端的 V2.0 任务单 | 分配原首页上传入口、V2 工作区、快照切换时 |
| `V2.0_UI任务单.md` | UI 的 V2.0 任务单 | 分配 V2 页面与六看板设计时 |
| `V2.0_测试任务单.md` | 测试的 V2.0 任务单 | 分配主链、六看板、Agent、预警测试时 |
| `PROMPTS.md` | 当前项目所有关键提示词、模型路由、调优原则 | AI 识别/分析输出不稳定时 |
| `六大看板_Agent角色设定.md` | 六大看板的 Agent 角色设定与长 Prompt 模板设计稿 | 设计多 Agent 能力时 |
| `DESIGN.md` | 界面设计规范、交互流、视觉风格、组件原则 | 做前端改版、新模块设计时 |
| `BACKGROUND.md` | 业务术语、分析口径、品牌红线、参考资料清单 | 理解业务背景、补知识时 |
| `发版验收单.md` | 当前唯一生产口径（Railway）、放行标准和 Go/No-go 清单 | 发版前、做上线评审时 |
| `ERROR_GUARDS.md` | 错误判定规则、已修改点记录、防重复清单 | 复盘 bug、开发前自检时 |
| `CHANGELOG.md` | 更新日志总览，管理每日归档 | 每次迭代结束后补档、回看每天做了什么 |
| `tasks/YYYY-MM-DD/*` | 每日总控、产品、研发、测试任务台账 | 跟当天工作、做交接时 |
| `archive/` | 历史阶段实施稿、旧任务单、已下线方案归档 | 查旧决策、做追溯时 |

---

## 3. 项目结构速览

```text
superev-营销分析助手/
├─ server.ts                    # Express 服务与 API
├─ shared/marketing-engine.ts   # 兼容诊断核心分析引擎
├─ shared/v2/*                  # V2 主链、snapshot、看板与 Agent 数据
├─ src/App.tsx                  # 首页上传、兼容链校对、结果页
├─ src/components/              # 结果模块、主线索表审计、V2 工作区
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

当前产品只保留一个首页入口，但执行层有两条链：

### V2 主链

```text
首页上传
-> 后台识别与分析
-> build-session / snapshot
-> 进入对应看板
```

### 兼容链

```text
首页上传
-> 后台识别
-> 数据校对页
-> 生成分析报告
```

对应代码入口：

- 首页上传：`src/App.tsx`
- V2 主链：`api/intake/*` + `shared/v2/*` + `src/components/v2-workspace.tsx`
- 兼容识别：`api/recognize-input.ts` / `api/analyze.ts`
- 兼容结果页：`src/App.tsx`

---

## 6. 文档之间的关系

可以按下面顺序理解：

```text
BACKGROUND.md
  ↓ 提供业务上下文和术语口径
产品说明.md
  ↓ 说明当前真实产品是什么
PRD.md
  ↓ 定义当前版本需求边界和成功标准
V2.0_入口与跳转规则.md
  ↓ 冻结首页入口、后台识别、直达看板规则
DESIGN.md / 各角色任务单
  ↓ 把产品目标落到页面、接口和协作分工
PROMPTS.md
  ↓ 沉淀 AI 识别与分析策略
ERROR_GUARDS.md
  ↓ 记录踩过的坑和防重复规则
CHANGELOG.md / tasks/
  ↓ 记录每天做了什么，形成连续归档
代码信息提取报告.md
  ↓ 对照真实代码，判断哪些已实现、哪些待补
```

---

## 7. 后续工作建议

如果下一步要继续升级项目，建议按下面顺序推进：

1. 先读 `产品说明.md`，确认当前版本到底怎么讲
2. 再读 `PRD.md`，确认需求边界没有跑偏
3. 再读 `V2.0_入口与跳转规则.md`，确认首页主链不回退
4. 开始前端工作前读 `DESIGN.md`
5. 调 AI 输出时同步维护 `PROMPTS.md`
6. 开发前先过一遍 `ERROR_GUARDS.md`
7. 每完成一轮功能升级，补一次当天的 `docs/changelog/YYYY-MM-DD.md`

---

## 8. 文档维护原则

- 产品能力变化时，优先更新 `产品说明.md` 和 `PRD.md`
- 首页入口或跳转逻辑变化时，优先更新 `V2.0_入口与跳转规则.md`
- Prompt 或模型路由变化时，优先更新 `PROMPTS.md`
- UI 结构或交互逻辑变化时，优先更新 `DESIGN.md`
- 新的业务术语、限制、内部共识出现时，优先更新 `BACKGROUND.md`
- 任何已经出现过的 bug、误判、字段遗漏，都优先更新 `ERROR_GUARDS.md`
- 每天有实际迭代时，必须补当天的 `docs/changelog/YYYY-MM-DD.md`
- 同一天的角色任务和总控，统一补到 `docs/tasks/YYYY-MM-DD/`
