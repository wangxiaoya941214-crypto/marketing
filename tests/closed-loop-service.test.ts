import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  applyClosedLoopReviewDecision,
  getClosedLoopReviewWorkspaceData,
  getClosedLoopReviewQueue,
  getClosedLoopSnapshot,
  importClosedLoopWorkbook,
  listClosedLoopJobs,
  searchClosedLoopReviewCandidates,
} from "../shared/closed-loop/service.ts";

process.env.NODE_ENV = "test";

const VALID_JOB_AI_STATUSES = new Set(["pending", "running", "ready", "degraded"]);
const VALID_SNAPSHOT_AI_STATUSES = new Set(["pending", "ready", "degraded"]);

const buildWorkbookBuffer = () => {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      { 指标: "主线索总量", 数值: 1, 说明: "测试" },
      { 指标: "小红书线索总量", 数值: 1, 说明: "测试" },
      { 指标: "高置信打通主线索", 数值: 1, 说明: "测试" },
      { 指标: "高置信下单", 数值: 1, 说明: "测试" },
      { 指标: "计划级可归因覆盖率", 数值: 0.5, 说明: "测试" },
    ]),
    "闭环总览",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        主线索ID: "M001",
        线索日期: "2026-03-31",
        客户手机号微信: "13800000000",
        用车城市: "上海",
        意向车型: "萤火虫",
        跟进销售: "销售A",
        是否成功加微: "已通过",
        加微时间: "2026-03-31",
        是否下单: "已下单",
        线索来源: "小红书-品牌号",
        业务类型: "超级订阅",
        意向等级SABCF: "A",
        订单号: "O001",
        下单时间: "2026-04-02",
        来源类型: "平台客资",
      },
      {
        主线索ID: "M002",
        线索日期: "2026-03-31",
        客户手机号微信: "13900000000",
        用车城市: "上海",
        意向车型: "萤火虫",
        跟进销售: "销售B",
        是否成功加微: "未通过",
        加微时间: "",
        是否下单: "未下单",
        线索来源: "小红书-品牌号",
        业务类型: "超级订阅",
        意向等级SABCF: "B",
        订单号: "",
        下单时间: "",
        来源类型: "平台客资",
      },
    ]),
    "统一主线索底座",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        小红书线索ID: "X001",
        用户小红书昵称: "测试用户",
        线索生成时间: "2026-03-31 10:00:00",
        归属账号: "超级电动",
        来源笔记: "测试笔记",
        流量类型: "广告流量",
        创意名称: "3月24日获客号-超级订阅萤火虫",
        创意名称标准化: "3月24日获客号-超级订阅萤火虫",
        转化方式: "私信留资",
        手机号: "13800000000",
        微信号: "wechat001",
        联络主键: "13800000000",
        地区: "上海市",
        匹配状态: "已匹配",
        匹配主键: "13800000000",
        匹配时间差天: 0,
        匹配置信度: "低置信待核查",
        主线索ID: "M001",
      },
    ]),
    "XHS线索明细_打通",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ 来源笔记: "测试笔记", XHS线索数: 1, 广告流量线索数: 1, 自然流量线索数: 0, 高置信打通主线索数: 1, 高置信打通率: 1, 加微成功数: 1, 加微成功率: 1, 下单数: 1, 下单率: 1 }]),
    "XHS内容分析_按笔记",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ 计划名称_标准化: "3月24日获客号-超级订阅萤火虫", 消费: 500, 展现量: 1000, 点击量: 100, 互动量: 10, 私信进线数: 10, 私信开口数: 5, 私信留资数: 1, XHS线索数: 1, 高置信打通主线索数: 1, 加微成功数: 1, 下单数: 1, 点击率: 0.1, 投放表留资率: 0.1, 按打通主线索重算留资成本: 500, 按打通下单重算获客成本: 500 }]),
    "XHS计划分析_按计划",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ 日期: "2026-03-31", 投放消费: 500, 投放展现量: 1000, 投放点击量: 100, 投放私信进线数: 10, 投放私信开口数: 5, 投放私信留资数: 1, 私信进线人数: 10, 私信开口人数: 5, 私信留资总人数: 1, XHS线索列表条数: 1, XHS广告流量线索数: 1, XHS自然流量线索数: 0, 高置信打通主线索数: 1, 加微成功数: 1, 下单数: 1, 投放点击率: 0.1, 投放留资率: 0.1, 高置信打通率: 1, 下单率: 1 }]),
    "XHS日分析_打通",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ 小红书线索ID: "X001", 用户小红书昵称: "测试用户", 线索生成时间: "2026-03-31 10:00:00", 归属账号: "超级电动", 来源笔记: "测试笔记", 流量类型: "广告流量", 创意名称: "3月24日获客号-超级订阅萤火虫", 转化方式: "私信留资", 手机号: "13800000000", 微信号: "wechat001", 联络主键: "13800000000", 匹配状态: "已匹配", 匹配主键: "13800000000", 匹配时间差天: 0, 匹配置信度: "低置信待核查", 主线索ID: "M001", 主线索日期: "2026-03-31", 业务类型: "超级订阅" }]),
    "低置信匹配待核查",
  );

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

test("闭环导入和复核决策会刷新快照与待复核队列", async () => {
  const payload = await importClosedLoopWorkbook({
    fileName: "闭环底座.xlsx",
    buffer: buildWorkbookBuffer(),
  });

  assert.equal(payload.job.status, "review_required");
  assert.equal(payload.snapshot.version, 1);
  assert.equal(payload.reviewQueue.length, 1);
  assert.equal(payload.snapshot.cockpit.review.pendingCount, 1);
  assert.equal(payload.job.currentSnapshotId, payload.snapshot.id);
  assert.equal(payload.job.summary["源文件名"], "闭环底座.xlsx");
  assert.equal(payload.job.summary["当前状态"], "review_required");
  assert.equal(payload.job.summary["解析表数"], 7);
  assert.equal(payload.job.summary["解析行数"], 12);
  assert.equal(payload.job.summary["待复核数"], 1);
  assert.equal(payload.job.summary["当前快照ID"], payload.snapshot.id);
  assert.equal(payload.job.summary["当前快照版本"], 1);
  assert.equal(payload.job.summary["AI状态"], "pending");

  await applyClosedLoopReviewDecision({
    importJobId: payload.job.id,
    xhsLeadId: "X001",
    decisionType: "confirm_match",
    actor: "test",
  });

  const reviewQueue = await getClosedLoopReviewQueue(payload.job.id);
  const snapshot = await getClosedLoopSnapshot(payload.job.id);

  assert.equal(reviewQueue.length, 0);
  assert.equal(snapshot.cockpit.review.pendingCount, 0);
  assert.equal(snapshot.marketingInput.funnel.deals.total, 1);
  assert.equal(snapshot.version, 2);

  const jobs = await listClosedLoopJobs();
  const updatedJob = jobs.find((item) => item.id === payload.job.id);
  assert.equal(updatedJob?.currentSnapshotId, snapshot.id);
  assert.equal(updatedJob?.summary["当前状态"], "ready");
  assert.equal(updatedJob?.summary["待复核数"], 0);
  assert.equal(updatedJob?.summary["当前快照版本"], 2);
  assert.equal(updatedJob?.summary["高置信打通数"], 1);
  assert.ok(VALID_JOB_AI_STATUSES.has(String(updatedJob?.aiStatus || "")));
  assert.equal(updatedJob?.summary["AI状态"], updatedJob?.aiStatus);
  assert.ok(snapshot.cockpit.breakdowns.channels.length > 0);
  assert.ok(snapshot.cockpit.breakdowns.salesOwners.length > 0);
  assert.equal(snapshot.id, updatedJob?.currentSnapshotId);
});

test("闭环改绑后会重建新快照并切换 currentSnapshotId", async () => {
  const payload = await importClosedLoopWorkbook({
    fileName: "闭环底座.xlsx",
    buffer: buildWorkbookBuffer(),
  });

  const previousSnapshotId = payload.snapshot.id;

  await applyClosedLoopReviewDecision({
    importJobId: payload.job.id,
    xhsLeadId: "X001",
    decisionType: "change_match",
    nextCrmLeadId: "M002",
    actor: "test",
    note: "人工改绑到销售B",
  });

  const snapshot = await getClosedLoopSnapshot(payload.job.id);
  const jobs = await listClosedLoopJobs();
  const updatedJob = jobs.find((item) => item.id === payload.job.id);

  assert.notEqual(snapshot.id, previousSnapshotId);
  assert.equal(snapshot.version, 2);
  assert.ok(VALID_SNAPSHOT_AI_STATUSES.has(snapshot.aiStatus));
  assert.equal(updatedJob?.currentSnapshotId, snapshot.id);
  assert.equal(updatedJob?.summary["当前快照版本"], 2);
  assert.ok(VALID_JOB_AI_STATUSES.has(String(updatedJob?.aiStatus || "")));
  assert.equal(updatedJob?.summary["AI状态"], updatedJob?.aiStatus);
  assert.equal(snapshot.cockpit.review.pendingCount, 0);
});

test("闭环标记未匹配后会重建新快照并保留统一快照口径", async () => {
  const payload = await importClosedLoopWorkbook({
    fileName: "闭环底座.xlsx",
    buffer: buildWorkbookBuffer(),
  });

  const previousSnapshotId = payload.snapshot.id;

  await applyClosedLoopReviewDecision({
    importJobId: payload.job.id,
    xhsLeadId: "X001",
    decisionType: "mark_unmatched",
    actor: "test",
    note: "人工确认没有可用主线索",
  });

  const reviewQueue = await getClosedLoopReviewQueue(payload.job.id);
  const snapshot = await getClosedLoopSnapshot(payload.job.id);
  const jobs = await listClosedLoopJobs();
  const updatedJob = jobs.find((item) => item.id === payload.job.id);

  assert.equal(reviewQueue.length, 0);
  assert.notEqual(snapshot.id, previousSnapshotId);
  assert.equal(snapshot.version, 2);
  assert.ok(VALID_SNAPSHOT_AI_STATUSES.has(snapshot.aiStatus));
  assert.equal(snapshot.cockpit.review.pendingCount, 0);
  assert.equal(snapshot.cockpit.review.unmatchedCount, 1);
  assert.equal(updatedJob?.currentSnapshotId, snapshot.id);
  assert.equal(updatedJob?.summary["当前快照ID"], snapshot.id);
  assert.equal(updatedJob?.summary["当前快照版本"], 2);
  assert.ok(VALID_JOB_AI_STATUSES.has(String(updatedJob?.aiStatus || "")));
  assert.equal(updatedJob?.summary["AI状态"], updatedJob?.aiStatus);
});

test("闭环 review-search 只搜索当前任务里的主线索候选", async () => {
  const payload = await importClosedLoopWorkbook({
    fileName: "闭环底座.xlsx",
    buffer: buildWorkbookBuffer(),
  });

  const candidates = await searchClosedLoopReviewCandidates(payload.job.id, "13800000000");

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.crmLeadId, "M001");
  assert.match(candidates[0]?.reason || "", /联络主键/);
});

test("闭环 review-queue 工作台接口支持 summary 和服务端过滤", async () => {
  const payload = await importClosedLoopWorkbook({
    fileName: "闭环底座.xlsx",
    buffer: buildWorkbookBuffer(),
  });

  const workspaceData = await getClosedLoopReviewWorkspaceData(payload.job.id, {
    businessType: "super",
    query: "测试用户",
  });

  assert.equal(workspaceData.reviewQueue.length, 1);
  assert.equal(workspaceData.summary.totalPending, 1);
  assert.equal(workspaceData.summary.byBusinessType[0]?.businessType, "super");
});

test("本地无数据库且未开启测试 fallback 时会返回 503", { concurrency: false }, async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.NODE_ENV;

  try {
    await assert.rejects(
      () =>
        importClosedLoopWorkbook({
          fileName: "闭环底座.xlsx",
          buffer: buildWorkbookBuffer(),
        }),
      (error: any) => {
        assert.equal(error?.statusCode, 503);
        assert.equal(
          error?.message,
          "闭环分析模式未配置数据库，请联系管理员补充 DATABASE_URL。",
        );
        return true;
      },
    );
  } finally {
    process.env.NODE_ENV = previousNodeEnv || "test";
  }
});
