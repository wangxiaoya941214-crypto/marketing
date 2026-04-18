# 产品经理项目交接说明

## 1. 这是什么项目

这是一个正在从“单次营销诊断工具”升级为“闭环分析产品”的项目。

当前产品名称：

- **SUPEREV 营销分析助手**

当前产品要解决的核心问题不是只看一张表，而是要回答：

1. 什么内容 / 什么计划带来了线索
2. 这些线索后续被谁承接
3. 用户旅程走到了哪一步
4. 最终哪些内容、计划、渠道真的带来了成交

也就是说，这个项目的核心是建立一条完整的闭环：

```text
内容传播效果
-> 线索进入
-> 用户旅程
-> 最终成交
```

---

## 2. 当前项目处于什么阶段

项目当前处于：

### **V2 第一阶段：闭环底座产品化**

这一阶段的目标是：

- 先把“闭环底座工作簿”真正做成产品能力
- 先支持导入、复核、分析、驾驶舱总览
- 暂时不追求把所有原始表自动打通

所以当前阶段更准确的目标是：

> **把闭环分析工作台做成可交付的首版产品。**

而不是：

- 完整经营驾驶舱正式版
- 全自动多表打通平台

---

## 3. 当前已经完成了什么

## 3.1 已完成的产品能力

目前项目已经有两类能力：

### A. 营销诊断能力（旧模式 / 兼容模式）

已可用，支持：

- 文本 / CSV / Word / PDF / 图片 / XLSX 导入
- 主线索表识别
- 数据匹配页人工确认
- 结果页营销诊断
- PDF 导出

### B. 闭环分析能力（V2 主方向）

已搭好骨架，支持：

- 导入闭环底座工作簿
- 生成导入任务
- 生成低置信复核队列
- 生成分析快照
- 生成驾驶舱摘要数据
- 闭环工作台骨架

## 3.2 已完成的工程能力

已落地：

- `shared/closed-loop/*` 闭环底座模块
- `api/closed-loop/*` 闭环 API
- `src/components/v2-workspace.tsx` V2 看板工作区
- 真实闭环底座文件导入验证
- Vercel 线上部署链路
- 文档体系

## 3.3 当前产品入口状态

这是现在最重要的产品现状判断：

- 首页单入口上传已经在前端落地
- 后端已经具备统一入口识别、分析和执行能力
- V2 默认入口、后台识别、直达看板规则已经冻结
- 但整条执行链还没有完全收口到最终产品体验

也就是说，当前已经具备：

```text
上传
-> 后台识别与分析
-> 进入对应分析页
```

但当前还没有完全做到：

- 首页主链和兼容链在所有文档里完全统一
- 五条分析方向都形成清晰一致的产品能力边界
- 主线索表模式不再被误讲成完整经营复盘

所以接下来产品经理的一个关键任务，就是把这层逻辑收口。

## 3.4 当前发版口径

当前需要统一成一个口径：

- 唯一生产口径：`Railway`
- Vercel 仅保留为兼容/预览链路，不作为当前正式发版目标
- 当前版本对外定义为：
  - `闭环分析工作台（首版）`
- `经营驾驶舱` 当前仍属于这套工作台里的视图，不单独定义成正式成品

## 3.5 当前首版支持矩阵

这张表是当前版本必须统一使用的产品支持矩阵。

| 分析方向 | 当前状态 | 对外口径 | 说明 |
|---|---|---|---|
| `closed_loop_analysis` 闭环分析 | 正式首版能力 | 可作为当前主产品对外表达 | 已有独立导入、复核、快照、闭环分析、经营驾驶舱 |
| `marketing_diagnosis` 营销诊断 | 兼容能力 | 可以说明仍保留，但不是当前主产品 | 继续沿旧识别、匹配、报告链路运行 |
| `sales_followup_diagnosis` 销售跟进诊断 | 已接入分流的诊断视角 | 当前不单独定义为完整成品 | 当前仍复用兼容链路，主要差异是分流口径和页面话术 |
| `campaign_conversion_diagnosis` 投放数据转化诊断 | 已接入分流的诊断视角 | 当前不单独定义为完整成品 | 当前仍复用兼容链路，主要差异是分流口径和页面话术 |
| `content_to_lead_diagnosis` 内容传播诊断 | 已接入分流的诊断视角 | 当前不单独定义为完整成品 | 当前仍复用兼容链路，主要差异是分流口径和页面话术 |

当前统一结论只有一条：

> 当前这版真正对外交付的是 `闭环分析工作台（首版）`；其他四条方向里，`营销诊断` 是兼容能力，另外三条是已经接入分流的诊断视角，不单独对外承诺为完整独立产品。

---

## 4. 当前还没完成什么

下面这些是当前最重要的未完成项：

### 4.1 数据库正式接通

现在闭环模式虽然已经按数据库架构设计，但当前仍保留了本地内存 fallback。  
正式环境需要切到真实数据库。

### 4.2 复核工作台还不够产品化

当前已经有：

- 搜索
- 筛选
- 候选主线索搜索
- 基础确认 / 改绑 / 标记未匹配

但还不够像正式工作台，当前还差：

- 候选主线索更友好的选择方式
- 更清晰的状态反馈
- 页面层级和业务可读性

### 4.3 驾驶舱还是骨架

它现在已经有数据，但还没有真正达到管理层可读、可汇报、可持续使用的程度。

### 4.4 统一上传与智能分流还没有完全产品化

虽然：

- 后端已经开始具备统一上传识别基础
- 前端首页和直达对应分析页主链已经落地
- 智能分流相关文档也已建立

但现在还没完全收口成最终产品体验：

```text
上传 -> 后台识别与分析 -> 进入对应分析页
```

当前还差：

- 首页主链、兼容链、主线索表模式的说法继续统一
- 五条分析方向的能力边界与对外口径完全统一
- 页面默认状态和兼容链路表达进一步收口

### 4.5 原始四类表自动打通还没开始

这一阶段不做：

- 主线索表自动入底座
- 小红书投放表自动入底座
- 小红书线索列表自动入底座
- 每日汇总自动入底座

这些属于下一阶段。

---

## 5. 当前产品边界

这个阶段不要把它理解成：

- 完整经营驾驶舱成品
- 多表全自动打通平台
- ROI/ROAS 已经完成
- 历史趋势和预警已经可用

更准确的定位应该是：

> **一个已经具备闭环分析底座和工作台骨架，并正在收口为“统一上传 + 智能分流”产品入口的产品原型。**

---

## 6. 当前你最重要的工作

如果你是新加入的产品经理，你现在最重要的工作有 5 件：

### 6.1 锁定 V2 首版边界

你要明确：

- 这一版到底对外怎么定义
- 哪些能力能讲
- 哪些能力不能讲

当前建议定义：

> 闭环分析工作台（首版）

而不是：

- 经营驾驶舱正式版
- 智能经营平台完整版

### 6.2 锁定统一上传与智能分流逻辑

这件事现在必须先拍板：

- 首页不再让用户先选模式
- 用户只上传数据
- 系统自动识别数据源
- 系统在后台直接进入对应分析页

这一步是当前产品收口的核心。

### 6.3 帮团队统一表达

你要统一对外和对内语言：

- 闭环分析（主方向）
- 营销诊断（兼容能力）

避免用户和团队都把它理解成两个并列产品。

### 6.4 承接低置信复核规则

这不是纯技术问题，也是产品规则问题。

你需要帮团队定义：

- 什么样本必须人工确认
- 什么样本可以自动通过
- 什么样本应标记未匹配

### 6.5 对齐团队推进顺序

你需要帮助团队按顺序推进：

1. 产品冻结统一上传逻辑
2. 数据库
3. 复核工作台
4. 驾驶舱正式化
5. 测试介入

而不是大家各做各的。

---

## 7. 当前开发分工结构

当前建议的开发分工有两层：

## 7.1 闭环 V2 主线

### 后端 A

负责：

- 数据底座
- 导入链路
- 状态机
- summary

文档：

- [V2_闭环分析_后端A开发清单.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/archive/v2-closed-loop-phase1/V2_闭环分析_后端A开发清单.md)

### 后端 B

负责：

- 复核队列
- review-search
- review-decision
- snapshot
- AI 异步刷新

文档：

- [V2_闭环分析_后端B开发清单.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/archive/v2-closed-loop-phase1/V2_闭环分析_后端B开发清单.md)

### 前端

负责：

- 闭环工作台
- 导入页
- 复核页
- 结果页
- 驾驶舱

文档：

- [V2_闭环分析_前端开发清单.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/archive/v2-closed-loop-phase1/V2_闭环分析_前端开发清单.md)

### UI

负责：

- 闭环工作台与驾驶舱的页面设计

文档：

- [V2_闭环分析_UI设计需求.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/archive/v2-closed-loop-phase1/V2_闭环分析_UI设计需求.md)

### 测试

负责：

- 导入
- 复核
- 快照一致性
- 旧模式回归
- 线上验证

文档：

- [V2_闭环分析_测试清单.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/archive/v2-closed-loop-phase1/V2_闭环分析_测试清单.md)

## 7.2 统一上传与智能分流专项

这部分是当前新增的关键方向。

文档：

- [V2_统一上传与智能分流_总控清单.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/V2_统一上传与智能分流_总控清单.md)
- [V2_统一上传与智能分流_产品需求.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/V2_统一上传与智能分流_产品需求.md)
- [V2_统一上传与智能分流_后端A开发清单.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/V2_统一上传与智能分流_后端A开发清单.md)
- [V2_统一上传与智能分流_后端B开发清单.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/V2_统一上传与智能分流_后端B开发清单.md)
- [V2_统一上传与智能分流_前端开发清单.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/V2_统一上传与智能分流_前端开发清单.md)
- [V2_统一上传与智能分流_UI设计需求.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/V2_统一上传与智能分流_UI设计需求.md)
- [V2_统一上传与智能分流_测试清单.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/V2_统一上传与智能分流_测试清单.md)

---

## 8. 你要先看的文档

如果你今天刚接这个项目，建议按这个顺序看：

### 第一层：先理解产品

1. [PRD.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/PRD.md)
2. [BACKGROUND.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/BACKGROUND.md)
3. [产品说明.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/产品说明.md)

### 第二层：再理解当前版本要做什么

4. [V2_闭环分析开发清单.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/archive/v2-closed-loop-phase1/V2_闭环分析开发清单.md)
5. [V2_闭环分析执行计划_评审版.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/archive/v2-closed-loop-phase1/V2_闭环分析执行计划_评审版.md)

### 第三层：再看统一上传与智能分流

6. [V2_统一上传与智能分流_总控清单.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/V2_统一上传与智能分流_总控清单.md)
7. [V2_统一上传与智能分流_产品需求.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/V2_统一上传与智能分流_产品需求.md)

### 第四层：如果正式启动 V2.0 大换代

8. [V2.0_总控清单.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/V2.0_总控清单.md)
9. [V2.0_后端A任务单.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/V2.0_后端A任务单.md)
10. [V2.0_后端B任务单.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/V2.0_后端B任务单.md)
11. [V2.0_前端任务单.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/V2.0_前端任务单.md)
12. [V2.0_UI任务单.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/V2.0_UI任务单.md)
13. [V2.0_测试任务单.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/V2.0_测试任务单.md)

### 第五层：再看角色分工

14. 后端 A / 后端 B / 前端 / UI / 测试 拆分文档
15. 智能分流专项的对应角色拆分文档

### 第六层：再看最近发生了什么

16. [CHANGELOG.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/CHANGELOG.md)
17. [2026-04-13.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/changelog/2026-04-13.md)
18. [2026-04-14.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/changelog/2026-04-14.md)

---

## 9. 当前存在的关键风险

你需要重点关注这几件事：

### 风险 1：数据库未正式接通

这会影响：

- 数据持久化
- 历史复盘
- 线上闭环稳定性

### 风险 2：低置信复核还不够产品化

如果这一步没做好，用户虽然能导入，但不一定能顺利完成闭环确认。

### 风险 3：驾驶舱还不够可交付

如果现在就把它当“管理层成品”去讲，会有预期过高的问题。

### 风险 4：统一上传与智能分流还未完全成型

当前正在从“模式入口”切向“系统自动分流”，但还没完全完成。  
这是当前产品收口的重点风险。

---

## 10. 协作方式说明

从现在开始，这个项目默认采用下面的协作方式：

1. 先由我完成产品经理职责
2. 我先做产品逻辑收口
3. 我先冻结关键边界、映射规则、顺序与分工
4. 再把任务拆给后端、前端、UI、测试

也就是说：

- 先有产品与总控文档
- 再有角色拆分文档
- 再进入开发执行

这已经是当前项目默认的协作方法。

---

## 11. 最新同步状态（2026-04-14）

### 11.1 统一上传与智能分流底层后端接口已在本地补齐

当前本地已经补齐：

- 统一入口接口：`POST /api/intake/analyze`
- 统一入口执行接口：`POST /api/intake/execute`
- 数据源识别：`SourceType`
- 分析方向推荐：`DiagnosisRoute`
- 固定返回结构：
  - `sourceType`
  - `diagnosisRoute`
  - `confidence`
  - `reason`
- 闭环数据库连接口径：只认 `DATABASE_URL`

当前本地后端已支持识别并分流：

- `closed_loop_workbook`
- `crm_lead_sheet`
- `xhs_campaign_report`
- `xhs_lead_list`
- `xhs_daily_report`
- `marketing_template`
- `unstructured_document`

对应推荐方向已固定为：

- `closed_loop_workbook` -> `closed_loop_analysis`
- `crm_lead_sheet` -> `sales_followup_diagnosis`
- `xhs_campaign_report` -> `campaign_conversion_diagnosis`
- `xhs_lead_list` -> `content_to_lead_diagnosis`
- `xhs_daily_report` -> `campaign_conversion_diagnosis`
- `marketing_template` -> `marketing_diagnosis`
- `unstructured_document` -> `marketing_diagnosis`

### 11.2 当前本地已落地的关键文件

- [shared/routing/source-detector.ts](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/shared/routing/source-detector.ts)
- [shared/routing/diagnosis-router.ts](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/shared/routing/diagnosis-router.ts)
- [shared/routing/intake-api.ts](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/shared/routing/intake-api.ts)
- [shared/routing/intake-execute.ts](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/shared/routing/intake-execute.ts)
- [shared/routing/route-dispatcher.ts](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/shared/routing/route-dispatcher.ts)
- [shared/routing/types.ts](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/shared/routing/types.ts)
- [shared/closed-loop/service.ts](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/shared/closed-loop/service.ts)
- [shared/closed-loop/store.ts](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/shared/closed-loop/store.ts)
- [api/_lib/closed-loop-auth.ts](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/api/_lib/closed-loop-auth.ts)
- [api/intake/analyze.ts](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/api/intake/analyze.ts)
- [api/intake/execute.ts](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/api/intake/execute.ts)
- [api/closed-loop/import.ts](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/api/closed-loop/import.ts)
- [api/closed-loop/jobs.ts](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/api/closed-loop/jobs.ts)
- [api/closed-loop/review-queue.ts](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/api/closed-loop/review-queue.ts)
- [api/closed-loop/review-decision.ts](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/api/closed-loop/review-decision.ts)
- [api/closed-loop/review-search.ts](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/api/closed-loop/review-search.ts)
- [api/closed-loop/snapshot.ts](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/api/closed-loop/snapshot.ts)
- [server.ts](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/server.ts)
- [tests/closed-loop-api-auth.test.ts](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/tests/closed-loop-api-auth.test.ts)
- [tests/intake-analysis.test.ts](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/tests/intake-analysis.test.ts)
- [tests/closed-loop-service.test.ts](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/tests/closed-loop-service.test.ts)

### 11.3 当前验证结果

本地已通过：

- `tests/intake-analysis.test.ts`
- `tests/recognize-input-api.test.ts`
- `tests/closed-loop-workbook.test.ts`
- `tests/closed-loop-service.test.ts`

说明：

- 统一入口后端现在按正式口径只负责：
  - 识别来源
  - 判断进入哪条分析链
  - 返回固定识别结构
- 当前前端已经落地：
  - 首页单入口上传
  - 后台识别后直达对应分析页 / 看板
- PM 已新增当前版本产品说明文档：
  - 对外主口径
  - 主流程
  - 能力边界
  - 当前支持矩阵
- PM 已按 V2.0 大换代重新拆出团队任务单：
  - V2.0 总控
  - 后端 A 任务单
  - 后端 B 任务单
  - 前端任务单
  - UI 任务单
  - 测试任务单
- PM 已按最新代码状态重写角色任务单：
  - 后端 A
  - 后端 B
  - 前端
  - UI
  - 测试
- 当前本地已能稳定接到：
  - 闭环分析
  - 营销诊断
  - 销售跟进诊断
  - 投放转化诊断
  - 内容传播诊断
- `SourceType` 与 `DiagnosisRoute` 已冻结为正式类型
- 闭环数据库连接当前只认 `DATABASE_URL`
- 生产语义上闭环模式已不再依赖 `POSTGRES_URL` / `POSTGRES_PRISMA_URL` / 运行时 fallback
- `/api/intake/analyze` 当前是识别与推荐接口口径
- `/api/intake/execute` 当前已能把统一入口正式接到现有分析链：
  - 闭环分析
  - 营销诊断
  - 销售跟进诊断
  - 投放转化诊断
  - 内容传播诊断
- 本地开发态 `server.ts` 也已挂载 `/api/intake/execute`，不再只有 Vercel handler 可用
- `/api/intake/execute` 的 `routeContext` 当前已稳定分成两类：
  - 闭环链路返回 `job / reviewQueue / snapshot`
  - 兼容链路返回 `recognizedInput / dashboardPreview / recognitionMode / importAudit / recognitionAudit`
- `api/closed-loop/*` 当前已补底层鉴权与角色校验：
  - 支持 `Authorization: Bearer <token>`
  - 也兼容 `x-api-key` / `x-closed-loop-token`
  - 角色从 `x-user-role` / `x-user-roles` 读取
- 当前闭环接口角色口径已分层：
  - `read`：任务、快照
  - `review`：复核队列、候选搜索、复核提交
  - `write`：闭环导入
- 当前环境变量已补说明：
  - `CLOSED_LOOP_API_TOKEN`
  - `CLOSED_LOOP_REQUIRE_AUTH`
  - `CLOSED_LOOP_READ_ROLES`
  - `CLOSED_LOOP_REVIEW_ROLES`
  - `CLOSED_LOOP_WRITE_ROLES`
- 本地开发态 `server.ts` 下的 `/api/closed-loop/*` 也已镜像同口径鉴权，不再只保护 Vercel handler
- `review-queue` 当前已补后端支撑：
  - 服务端 `q` 过滤
  - `businessType` 过滤
  - `summary` 汇总返回
- 复核链当前已补回归覆盖：
  - `confirm_match`
  - `change_match`
  - `mark_unmatched`
- 每次复核后都会校验：
  - `snapshot.version` 递增
  - `currentSnapshotId` 切换到新快照
  - `getClosedLoopSnapshot(importJobId)` 读取的就是当前生效快照
- `AI状态` 当前已和 `job.aiStatus` 同步收口，进入 `running / ready / degraded` 时 summary 不再滞后
- 驾驶舱后端数据当前已补正式 breakdown：
  - 渠道
  - 销售
  - 地区
  - 来源类型
- 每日浏览器巡检脚本当前已补运行环境兼容：
  - 不再只会强绑 `127.0.0.1:3101`
  - 优先复用 `PLAYWRIGHT_BASE_URL` / `APP_URL` / `PLAYWRIGHT_FALLBACK_BASE_URLS`
  - 本地端口启动失败时，如存在可访问服务，会自动改为复用
- 今日已确认：
  - 在受限沙箱内，daily 巡检仍会被本地端口与浏览器权限阻断
  - 在允许启动本地服务与系统 Chrome 的 runner 里，`npm run test:e2e:daily` 已实际通过
  - 巡检报告会输出到：
    - `reports/browser-check/runs/<时间戳>/测试报告.md`
- 当前仅完成本地实现，**没有发版**
- 本轮后端 B 已重新确认：
  - `tests/closed-loop-api-auth.test.ts`
  - `tests/intake-analysis.test.ts`
  - `tests/recognize-input-api.test.ts`
  - `tests/closed-loop-service.test.ts`
  - `node --import tsx -e "import('./server.ts')"`
  - `node --import tsx -e "import('./api/intake/execute.ts')"`
- 今日额外确认的发布阻断：
  - 当前实际生产链路已按 Railway 口径验证
  - Railway 当前线上默认域名：
    - `https://superev-marketing-assistant-production.up.railway.app`
  - Railway 生产环境当前已补齐：
    - `DATABASE_URL`
    - `YUNWU_API_KEY`
    - `YUNWU_BASE_URL`
    - `YUNWU_MODEL`
    - `CLOSED_LOOP_REQUIRE_AUTH=0`
    - `APP_URL=https://superev-marketing-assistant-production.up.railway.app`
  - Railway 生产当前验证结果：
    - `POST /api/recognize-input` -> `200`
    - `GET /api/closed-loop/jobs` -> `200`
    - `POST /api/closed-loop/import` -> `200`
    - `GET /api/closed-loop/review-queue` -> `200`
    - `APP_URL` 已切到 Railway 公网域名
  - 这说明：
    - 主线索表识别线上已恢复
    - 闭环链基础读写链路已恢复
    - 当前剩余发布动作主要变成“是否要再补一个自定义正式域名”
  - 之前 Vercel Hobby 的 `12 Serverless Functions` 限制，已通过 API 路由合并在代码层收口
  - 但如果当前正式生产口径是 Railway，那么这个限制不再是主发布阻断
- 今日 V2.0 后端 A 已补齐本地主链：
  - `POST /api/intake/upload`
  - `POST /api/intake/analyze`
  - `POST /api/intake/reclassify`
  - `POST /api/intake/build-session`
- 当前 V2.0 store 已不再只是内存态：
  - `shared/v2/store.ts` 已补双实现
  - 测试环境默认走内存
  - 本地开发在存在 `DATABASE_URL` 时已走 Postgres 持久化
- 当前 V2.0 主链接口状态：
  - `/api/intake/upload`：返回 `uploadId`、文件列表与基础状态
  - `/api/intake/analyze`：当输入 `uploadId` 时，返回每个文件的 `sourceType / confidence / reason / v2Eligible / lowConfidenceNotes / candidates`
  - `/api/intake/analyze`：当前已固定补顶层入口字段：
    - `v2Eligible`
    - `entryDashboard`
    - `entryReason`
    - 纯 Legacy 上传只返回 `v2Eligible = false`，不返回 `entryDashboard`
  - `/api/intake/reclassify`：支持人工修正单文件类型，后续构建以人工结果为准
  - `/api/intake/build-session`：返回 `sessionId / snapshotId / v2Files / legacyFiles`
  - `/api/intake/build-session`：当前也固定补：
    - `v2Eligible`
    - `entryDashboard`
    - `entryReason`
  - 当前口径已经明确：
    - 前端不再自行猜“多文件应该先落到哪个看板”
    - 同看板多文件由后端统一计算 `entryDashboard`
    - 跨业务线跟进表由后端统一给 `entryDashboard = sales`
- 当前 V2.0 后端 B 已补齐的结构：
  - `snapshot` 结构已先冻结为：
    - `sourceCoverage`
    - `confirmedFiles`
    - `legacyFiles`
    - `canonicalFacts`
    - `alerts`
    - `agentContexts`
    - `dashboards`
    - `closedLoopImportJobId`
    - `closedLoopSnapshotId`
  - 六看板接口已补：
    - `/api/dashboard/overview`
    - `/api/dashboard/content`
    - `/api/dashboard/ads`
    - `/api/dashboard/sales`
    - `/api/dashboard/super-subscription`
    - `/api/dashboard/flexible-subscription`
  - 六看板过滤 contract 已冻结：
    - `snapshotId`
    - `timeScope`
    - `businessFilter`
  - 六看板响应当前固定补：
    - `appliedFilters`
    - `filterMeta`
  - 当前过滤语义已确认：
    - `current_cycle` 不算 fallback
    - 只有 `last_7_days` 在无日维裁剪能力时才 fallback
    - 专属订阅看板会强制覆盖 `businessFilter`
  - Agent 运行时已补：
    - `/api/agent/analyze`
    - `/api/agent/followup`
  - 预警结果已补：
    - `/api/alert/list`
    - `/api/alert/config`
- 当前 V2.0 source adapter 已覆盖：
  - `video_performance`
  - `ad_plan_spend`
  - `xhs_lead_list`
  - `daily_register`
  - `super_subscription_followup`
  - `flexible_subscription_followup`
  - `order_source_check`
  - `closed_loop_workbook`
- 当前本地已通过：
  - `npm run lint`
  - `npm run build`
  - `tests/v2-intake-chain.test.ts`
  - `tests/v2-backend-b.test.ts`
  - `tests/intake-analysis.test.ts`
  - `tests/recognize-input-api.test.ts`
  - `tests/closed-loop-service.test.ts`
  - `tests/closed-loop-workbook.test.ts`
- 当前已额外做过一次跨进程持久化验证：
  - 先创建 `uploadId`
  - 再在新进程里读取同一 `uploadId`
  - 再继续执行 `analyze` 与 `build-session`
  - 结果确认：`uploadId` 可持续、`sessionId / snapshotId` 可生成
- 本轮为了修复 `lint`，我做过一处最小 UI 文本转义修改：
  - [src/components/v2-workspace.tsx](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/src/components/v2-workspace.tsx)
  - 仅把 `->` 改成 JSX 可解析写法，不涉及页面逻辑或样式改造
- 新的 PM 冻结规则已经补齐：
  - 默认入口必须回到原首页
  - 识别分析在后台完成
  - 进入 V2 时直接落到对应看板
  - `V2Workspace` 不再作为默认首页
  - 不再给用户暴露识别确认页
- 规则文档：
  - [V2.0_入口与跳转规则.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/V2.0_入口与跳转规则.md)
- 今日已补一轮 V2 坏快照保护：
  - 后端会先归一化 `snapshot`，缺少 `dashboard.summary` 时降级为空态，不再直接抛 500
  - 无 `confirmedFiles` 的坏快照会被判定为无效，不再进入 `/api/snapshot/list`
  - `/api/dashboard/*` 的 500 级异常已统一脱敏，不再把 `Cannot read properties...` 这类技术原文直接返回给前端
  - 本地旧 Postgres 的 `v2_snapshots` 老 schema 已补自动迁移：
    - 自动补 `canonical_facts_json`
    - 自动补 `agent_contexts_json`
    - 旧库现在可直接继续 `upload -> analyze -> build-session -> dashboard`
  - `server.ts` 本地 Express 与 `api/dashboard/*` 的看板错误语义已重新对齐
  - 当前本地已补通过：
    - `坏 snapshot 缺少 dashboard summary 时会自动降级为空态而不是抛 500`
    - `无 confirmedFiles 的坏 snapshot 不会进入快照列表，并返回中文错误`
    - 真实 `DATABASE_URL` 下的 `upload -> analyze -> build-session -> dashboard`
- 本轮这次**补了最小 UI 兜底**
  - 文件：
    - [src/components/v2-workspace.tsx](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/src/components/v2-workspace.tsx)
  - 范围：
    - 坏快照场景下展示中文空态/友好错误
    - 不再透出技术异常原文
- V2.0 后端 B 当前已额外确认：
  - 同一 `snapshotId` 下六看板响应一致
  - 六张看板返回的 `snapshot` key 集完全一致
  - `canonicalFacts` 已包含标准化 leads / touchpoints / orders 与 matching / attribution summary
  - overview 卡片 totals 与子看板使用同一份 canonical summary
  - 六套 Agent 固定绑定：
    - Alex / Nova / Rex / Morgan / Sage / Iris
  - 预警结果已进入 snapshot，并可单独读取
- 当前前端 V2 工作区已补一条页面边界：
  - 上传、识别、开始分析入口已收口到首页
  - `V2Workspace` 不再重复展示上传入口区
  - 当前工作区只保留快照、看板、预警和 Agent 相关内容

### 11.4 当前明确未做

这轮没有做：

- 前端把 `/api/intake/execute` 接成唯一主执行入口
- 前端或网关把闭环 token / role header 注入到 `/api/closed-loop/*`
- Vercel 当前部署额度会拦住新的预览部署完成
- 驾驶舱正式版
- 闭环 PDF 正式版
- V2.0 前端把 `/api/snapshot/list`、`/api/dashboard/*`、`/api/agent/*`、`/api/alert/list` 完整接成正式交互
- 每日巡检真正接到允许开端口的 runner 或可访问服务
- 生产发布
- 自定义正式域名切换（如果后续不满足于 Railway 默认公网域名）

当前还需要继续收口的不是“有没有入口页”，而是“主链是不是已经真正执行到底”。

---

## 12. 交接手册同步要求

从现在开始，新增一个硬性要求：

1. 每次完成一个明确动作后，都要同步更新交接手册
2. 每个任务完成后，都要再次同步更新交接手册
3. 交接手册里的内容必须以仓库当前真实代码状态为准
4. 不能只更新“做了什么”，还要同步更新“现在要做的事”
5. “现在要做的事”必须跟随最新动作滚动维护，不能保留过期待办

默认更新目标文档：

- [PM_项目交接说明.md](/Users/Zhuanz/Desktop/AI编程/superev-营销分析助手/docs/PM_项目交接说明.md)

如果后续需要更细的专项交接，再补充到对应专项文档，但这里必须始终保留最新项目总状态。

---

## 11. 你现在最适合做的下一步

如果你今天就开始接这个项目，当前最需要盯住的不是泛泛而谈的“继续推进”，而是下面这几件硬任务：

### P0-1. 主流程彻底收口为“统一上传 + 智能分流”

当前判断：

- 首页单入口和后台直达对应分析页已经落地
- 但主流程和兼容链边界还要继续统一文档与页面表达

当前还差：

- 首页主链和兼容链说法仍有过渡期痕迹
- 销售跟进 / 投放转化 / 内容传播当前仍属于兼容链路下的诊断视角，不应被当作完整独立产品
- 主线索表模式还需要持续压回“销售跟进诊断”边界

### P0-2. 数据库正式接通生产

当前判断：

- 当前代码支持：
  - 有 `DATABASE_URL` -> Postgres
  - 没有 `DATABASE_URL` -> fallback（仅测试环境保留）

当前还差：

- 生产环境数据库真连通
- 表真实可写入
- 线上导入任务、快照、复核能持久化

说明：

- 本地 `DATABASE_URL` 已接通
- 代码口径已收紧到只认 `DATABASE_URL`
- 但线上真实数据库资源和生产环境变量还没有完成配置，所以这个问题**还没有完全解决**

### P0-3. 复核工作台产品化

当前判断：

- 已能展示低置信样本
- 已能确认 / 改绑 / 标记未匹配
- `review-search` 已有

当前还差：

- 候选主线索选择体验打磨
- 筛选 / 搜索收口（后端已补接口支撑，前端未接）
- 反馈提示收口
- 页面层级和业务可读性提升

### P1-1. 驾驶舱从骨架进入正式表达

当前判断：

- 数据已经能出
- 卡片和摘要已经有
- V2.0 后端六看板与 Agent runtime 已有稳定结构

当前还差：

- 管理层可读的层级结构（后端 breakdown 已补，前端未消费）
- 结论卡
- 渠道 / 销售 / 地区 / 来源类型的正式模块化展示（后端已补数据）
- 结果页与驾驶舱的表达统一

### P1-3. V2.0 前台把六看板 / Agent / 预警真正接完

当前判断：

- V2.0 后端已经能给：
  - 已冻结的 `snapshot` 结构
  - `snapshot`
  - 六看板
  - 六套 Agent
  - 预警结果

当前还差：

- 前端把 `/api/snapshot/list` 接成真实快照切换
- 前端把 `/api/dashboard/*` 六张看板全部接成正式展示
- 前端把 `/api/agent/*` 接成六套 Agent 抽屉主路径
- 前端把 `/api/alert/list` 接成预警入口

### P1-2. 闭环接口鉴权从“后端已支持”收口到“真实可用”

当前判断：

- `api/closed-loop/*` 已补 token 鉴权和角色校验
- `server.ts` 下的本地 / 自托管闭环路由也已补同口径鉴权
- 角色口径已经拆成 `read / review / write`

当前还差：

- 生产环境补齐 `CLOSED_LOOP_API_TOKEN`
- 前端或网关把 token / role header 真正注入请求
- 做完这两件事前，不要直接发当前版本到生产
- 同时还要先解决当前 Vercel 项目的 Serverless Functions 数量限制，否则新的预览部署也发不出去

### 仍需持续盯住：复核后快照重建稳定

必须持续盯住：

- 低置信复核后是否真的触发快照重建
- 新快照版本是否正确切到 `current_snapshot_id`
- 旧快照是否不会被工作台误读

### 仍需持续盯住：工作台、驾驶舱、PDF 都只读同一份快照

这是当前闭环链路最重要的产品约束之一。

必须保证：

- 工作台只读当前生效快照
- 驾驶舱只读当前生效快照
- PDF 导出只读当前生效快照

不能出现三个地方各自读“最新一条”的情况。

---

## 12. 一句话总结

> 你接手的不是一个从零开始的项目，而是一个已经完成方向确认、架构起步、真实数据验证、角色拆分，并正在进入“统一上传与智能分流”收口阶段的 V2 闭环分析产品。你现在最重要的工作，是帮团队把“能跑的骨架”收成“能交付的产品”。
