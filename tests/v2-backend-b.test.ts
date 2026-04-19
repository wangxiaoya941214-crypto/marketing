import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import {
  analyzeV2Agent,
  followupV2Agent,
} from "../api/_lib/v2-agent-service.ts";
import {
  analyzeV2UploadSession,
  buildV2AnalysisSession,
  getV2Alerts,
  getV2Dashboard,
  listV2Snapshots,
  reclassifyV2UploadFile,
  updateV2AlertConfig,
  uploadV2Files,
} from "../shared/v2/service.ts";
import { saveSnapshotRecord } from "../shared/v2/store.ts";
import { V2_DASHBOARD_TYPES } from "../shared/v2/types.ts";
import type { V2DashboardType } from "../shared/v2/types.ts";

process.env.NODE_ENV = "test";

const marketingTemplateFixturePath = path.resolve(
  process.cwd(),
  "tests/fixtures/daily-smoke.csv",
);

const buildClosedLoopWorkbookBuffer = () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ 指标: "主线索总量", 数值: 1 }]),
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
        线索来源: "小红书-品牌号",
        业务类型: "超级订阅",
        是否成功加微: "已通过",
        是否下单: "已下单",
        订单号: "O001",
        下单时间: "2026-04-02",
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
        线索生成时间: "2026-03-31 10:00:00",
        来源笔记: "测试笔记",
        流量类型: "广告流量",
        手机号: "13800000000",
        归属账号: "小红书-品牌号",
        用户小红书昵称: "测试用户",
        创意名称: "计划A",
        创意名称标准化: "计划A",
        转化方式: "私信留资",
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
    XLSX.utils.json_to_sheet([
      {
        来源笔记: "测试笔记",
        XHS线索数: 1,
        广告流量线索数: 1,
        自然流量线索数: 0,
        高置信打通主线索数: 1,
        下单数: 1,
      },
    ]),
    "XHS内容分析_按笔记",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        计划名称_标准化: "计划A",
        消费: 500,
        点击量: 100,
        私信留资数: 1,
        高置信打通主线索数: 1,
        下单数: 1,
      },
    ]),
    "XHS计划分析_按计划",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        日期: "2026-03-31",
        投放消费: 500,
        私信留资总人数: 1,
        高置信打通主线索数: 1,
        下单数: 1,
      },
    ]),
    "XHS日分析_打通",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ 小红书线索ID: "X001" }]),
    "低置信匹配待核查",
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

const withAiDisabled = async (fn: () => Promise<void> | void) => {
  const previous = {
    openai: process.env.OPENAI_API_KEY,
    yunwu: process.env.YUNWU_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
  };

  delete process.env.OPENAI_API_KEY;
  delete process.env.YUNWU_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    await fn();
  } finally {
    if (previous.openai === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous.openai;
    if (previous.yunwu === undefined) delete process.env.YUNWU_API_KEY;
    else process.env.YUNWU_API_KEY = previous.yunwu;
    if (previous.gemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous.gemini;
  }
};

const buildAlertCsv = () =>
  fs
    .readFileSync(marketingTemplateFixturePath, "utf8")
    .replace("第四层成交台数_总计,23", "第四层成交台数_总计,10")
    .replace("第四层成交台数_灵活订阅,15", "第四层成交台数_灵活订阅,6")
    .replace("第四层成交台数_超级订阅,8", "第四层成交台数_超级订阅,4")
    .replace("上期成交量,18", "上期成交量,20")
    .replace("上期成交台数_灵活订阅,12", "上期成交台数_灵活订阅,12")
    .replace("上期成交台数_超级订阅,6", "上期成交台数_超级订阅,8");

const readCardValue = (dashboard: Awaited<ReturnType<typeof getV2Dashboard>>["dashboard"], label: string) =>
  dashboard.cards.find((item) => item.label === label)?.value || "";

test("V2 snapshot 会产出 canonical facts、agentContexts 和六看板同一 snapshot", async () => {
  const upload = await uploadV2Files([
    {
      name: "closed-loop.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildClosedLoopWorkbookBuffer().toString("base64"),
    },
  ]);

  await analyzeV2UploadSession(upload.id);
  const built = await buildV2AnalysisSession(upload.id);
  const snapshot = built.snapshot;
  const expectedSnapshotKeys = [
    "agentContexts",
    "alerts",
    "canonicalFacts",
    "closedLoopImportJobId",
    "closedLoopSnapshotId",
    "confirmedFiles",
    "createdAt",
    "dashboards",
    "id",
    "legacyFiles",
    "sessionId",
    "sourceCoverage",
    "uploadId",
  ];

  assert.ok(snapshot.canonicalFacts.summary.totalLeads > 0);
  assert.ok(snapshot.canonicalFacts.summary.totalOrders > 0);
  assert.equal(snapshot.agentContexts.overview.snapshotId, snapshot.id);
  assert.equal(snapshot.agentContexts.sales.snapshotId, snapshot.id);

  for (const dashboardType of V2_DASHBOARD_TYPES) {
    const payload = await getV2Dashboard(snapshot.id, dashboardType);
    assert.equal(payload.snapshot.id, snapshot.id);
    assert.deepEqual(Object.keys(payload.snapshot).sort(), expectedSnapshotKeys);
  }

  const overviewPayload = await getV2Dashboard(snapshot.id, "overview");
  const salesPayload = await getV2Dashboard(snapshot.id, "sales");
  const superPayload = await getV2Dashboard(snapshot.id, "super_subscription");
  assert.equal(
    Number(readCardValue(overviewPayload.dashboard, "总线索")),
    snapshot.canonicalFacts.summary.totalLeads,
  );
  assert.equal(
    Number(readCardValue(salesPayload.dashboard, "跟进线索")),
    snapshot.canonicalFacts.summary.byBusinessLine.all.followupLeads,
  );
  assert.equal(
    Number(readCardValue(superPayload.dashboard, "订单")),
    snapshot.canonicalFacts.summary.byBusinessLine.super.orders,
  );
});

test("V2 六套 Agent 按固定角色绑定并支持 followup", async () => {
  const upload = await uploadV2Files([
    {
      name: "closed-loop.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildClosedLoopWorkbookBuffer().toString("base64"),
    },
  ]);

  await analyzeV2UploadSession(upload.id);
  const built = await buildV2AnalysisSession(upload.id);
  const snapshotId = built.snapshot.id;

  await withAiDisabled(async () => {
    const dashboards: Array<[V2DashboardType, string]> = [
      ["overview", "Alex"],
      ["content", "Nova"],
      ["ads", "Rex"],
      ["sales", "Morgan"],
      ["super_subscription", "Sage"],
      ["flexible_subscription", "Iris"],
    ];

    for (const [dashboardType, agentName] of dashboards) {
      const result = await analyzeV2Agent(snapshotId, dashboardType);
      assert.equal(result.agentName, agentName);
      assert.ok(result.content.length > 0);
      assert.equal(result.fallback, true);
    }

    const first = await analyzeV2Agent(snapshotId, "overview");
    const followup = await followupV2Agent(first.sessionId, "继续说最重要的风险。");
    assert.equal(followup.sessionId, first.sessionId);
    assert.equal(followup.agentName, "Alex");
    assert.ok(followup.content.length > 0);

    const filtered = await analyzeV2Agent(snapshotId, "flexible_subscription", {
      timeScope: "last_7_days",
      businessFilter: "super",
    });
    assert.equal(filtered.agentName, "Iris");
    assert.ok(filtered.content.length > 0);

    const filteredFollowup = await followupV2Agent(
      filtered.sessionId,
      "继续按当前筛选解释风险。",
      {
        timeScope: "current_cycle",
        businessFilter: "flexible",
      },
    );
    assert.equal(filteredFollowup.sessionId, filtered.sessionId);
    assert.equal(filteredFollowup.agentName, "Iris");
    assert.ok(filteredFollowup.content.length > 0);
  });
});

test("V2 预警结果会进入 snapshot 并可单独读取", async () => {
  await updateV2AlertConfig({
    enabled: false,
    feishuWebhook: "",
    redTargetCompletionThreshold: 0.8,
    yellowMomDropThreshold: 0.2,
  });

  const upload = await uploadV2Files([
    {
      name: "alert-source.csv",
      mimeType: "text/csv",
      data: Buffer.from(buildAlertCsv(), "utf8").toString("base64"),
    },
  ]);

  await analyzeV2UploadSession(upload.id);
  const fileId = upload.files[0]?.id;
  assert.ok(fileId);
  await reclassifyV2UploadFile(upload.id, fileId!, "super_subscription_followup");
  const built = await buildV2AnalysisSession(upload.id);
  const alertsPayload = await getV2Alerts(built.snapshot.id);

  assert.equal(alertsPayload.snapshotId, built.snapshot.id);
  assert.ok(alertsPayload.alerts.some((item) => item.level === "red"));
  assert.ok(alertsPayload.alerts.some((item) => item.level === "yellow"));
});

test("V2 看板过滤 contract 会回传 appliedFilters 与 filterMeta", async () => {
  const upload = await uploadV2Files([
    {
      name: "closed-loop.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildClosedLoopWorkbookBuffer().toString("base64"),
    },
  ]);

  await analyzeV2UploadSession(upload.id);
  const built = await buildV2AnalysisSession(upload.id);

  const overview = await getV2Dashboard(built.snapshot.id, "overview", {
    timeScope: "current_cycle",
    businessFilter: "super",
  });

  assert.equal(overview.appliedFilters.snapshotId, built.snapshot.id);
  assert.equal(overview.appliedFilters.timeScope, "current_cycle");
  assert.equal(overview.appliedFilters.businessFilter, "super");
  assert.equal(overview.filterMeta.requestedTimeScope, "current_cycle");
  assert.equal(overview.filterMeta.appliedTimeScope, "current_cycle");
  assert.equal(overview.filterMeta.timeScopeFallbackApplied, false);
  assert.equal(overview.filterMeta.businessFilterForced, false);
});

test("content 看板请求 last_7_days 时会明确 fallback", async () => {
  const upload = await uploadV2Files([
    {
      name: "closed-loop.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildClosedLoopWorkbookBuffer().toString("base64"),
    },
  ]);

  await analyzeV2UploadSession(upload.id);
  const built = await buildV2AnalysisSession(upload.id);

  const content = await getV2Dashboard(built.snapshot.id, "content", {
    timeScope: "last_7_days",
    businessFilter: "all",
  });

  assert.equal(content.filterMeta.requestedTimeScope, "last_7_days");
  assert.equal(content.filterMeta.appliedTimeScope, "current_snapshot");
  assert.equal(content.filterMeta.timeScopeFallbackApplied, true);
  assert.match(content.filterMeta.notes.join(" "), /回退为当前快照视角/);
});

test("专属订阅看板会强制覆盖业务线过滤", async () => {
  const upload = await uploadV2Files([
    {
      name: "closed-loop.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildClosedLoopWorkbookBuffer().toString("base64"),
    },
  ]);

  await analyzeV2UploadSession(upload.id);
  const built = await buildV2AnalysisSession(upload.id);

  const superDashboard = await getV2Dashboard(
    built.snapshot.id,
    "super_subscription",
    {
      businessFilter: "all",
      timeScope: "current_snapshot",
    },
  );
  const flexibleDashboard = await getV2Dashboard(
    built.snapshot.id,
    "flexible_subscription",
    {
      businessFilter: "super",
      timeScope: "current_snapshot",
    },
  );

  assert.equal(superDashboard.filterMeta.requestedBusinessFilter, "all");
  assert.equal(superDashboard.filterMeta.appliedBusinessFilter, "super");
  assert.equal(superDashboard.filterMeta.businessFilterForced, true);
  assert.match(superDashboard.filterMeta.notes.join(" "), /超级订阅看板固定使用 super/);

  assert.equal(flexibleDashboard.filterMeta.requestedBusinessFilter, "super");
  assert.equal(flexibleDashboard.filterMeta.appliedBusinessFilter, "flexible");
  assert.equal(flexibleDashboard.filterMeta.businessFilterForced, true);
  assert.match(
    flexibleDashboard.filterMeta.notes.join(" "),
    /灵活订阅看板固定使用 flexible/,
  );
});

test("非法 dashboard 过滤参数会返回 400 语义", async () => {
  const upload = await uploadV2Files([
    {
      name: "closed-loop.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildClosedLoopWorkbookBuffer().toString("base64"),
    },
  ]);

  await analyzeV2UploadSession(upload.id);
  const built = await buildV2AnalysisSession(upload.id);

  await assert.rejects(
    () =>
      getV2Dashboard(built.snapshot.id, "overview", {
        timeScope: "bad-scope" as any,
      }),
    (error: any) => {
      assert.equal(error?.statusCode, 400);
      assert.equal(error?.message, "timeScope 不合法。");
      return true;
    },
  );

  await assert.rejects(
    () =>
      getV2Dashboard(built.snapshot.id, "overview", {
        businessFilter: "bad-filter" as any,
      }),
    (error: any) => {
      assert.equal(error?.statusCode, 400);
      assert.equal(error?.message, "businessFilter 不合法。");
      return true;
    },
  );
});

test("坏 snapshot 缺少 dashboard summary 时会自动降级为空态而不是抛 500", async () => {
  const snapshotId = randomUUID();
  await saveSnapshotRecord({
    id: snapshotId,
    sessionId: randomUUID(),
    uploadId: randomUUID(),
    createdAt: new Date().toISOString(),
    sourceCoverage: {
      video_performance: { fileCount: 0, names: [] },
      ad_plan_spend: { fileCount: 0, names: [] },
      xhs_lead_list: { fileCount: 0, names: [] },
      daily_register: { fileCount: 0, names: [] },
      super_subscription_followup: { fileCount: 1, names: ["bad.xlsx"] },
      flexible_subscription_followup: { fileCount: 0, names: [] },
      order_source_check: { fileCount: 0, names: [] },
      closed_loop_workbook: { fileCount: 0, names: [] },
    },
    confirmedFiles: [
      {
        id: randomUUID(),
        name: "bad.xlsx",
        sourceType: "super_subscription_followup",
      },
    ],
    legacyFiles: [],
    canonicalFacts: {
      leads: [],
      touchpoints: [],
      orders: [],
    } as any,
    alerts: [],
    agentContexts: {} as any,
    dashboards: {
      overview: {
        type: "overview",
        title: "总览驾驶舱",
      },
    } as any,
    closedLoopImportJobId: null,
    closedLoopSnapshotId: null,
  });

  const payload = await getV2Dashboard(snapshotId, "overview");

  assert.equal(payload.snapshot.id, snapshotId);
  assert.equal(payload.dashboard.title, "总览驾驶舱");
  assert.match(payload.dashboard.summary, /当前快照暂时缺少总览摘要/);
  assert.equal(payload.dashboard.status, "missing");
});

test("无 confirmedFiles 的坏 snapshot 不会进入快照列表，并返回中文错误", async () => {
  const snapshotId = randomUUID();
  await saveSnapshotRecord({
    id: snapshotId,
    sessionId: randomUUID(),
    uploadId: randomUUID(),
    createdAt: new Date().toISOString(),
    sourceCoverage: {
      video_performance: { fileCount: 0, names: [] },
      ad_plan_spend: { fileCount: 0, names: [] },
      xhs_lead_list: { fileCount: 0, names: [] },
      daily_register: { fileCount: 0, names: [] },
      super_subscription_followup: { fileCount: 0, names: [] },
      flexible_subscription_followup: { fileCount: 0, names: [] },
      order_source_check: { fileCount: 0, names: [] },
      closed_loop_workbook: { fileCount: 0, names: [] },
    },
    confirmedFiles: [],
    legacyFiles: [],
    canonicalFacts: {
      leads: [],
      touchpoints: [],
      orders: [],
    } as any,
    alerts: [],
    agentContexts: {} as any,
    dashboards: {} as any,
    closedLoopImportJobId: null,
    closedLoopSnapshotId: null,
  });

  const snapshots = await listV2Snapshots();
  assert.equal(
    snapshots.some((item) => item.id === snapshotId),
    false,
  );

  await assert.rejects(
    () => getV2Dashboard(snapshotId, "overview"),
    (error: any) => {
      assert.equal(error?.statusCode, 409);
      assert.equal(error?.message, "当前快照数据不完整，请重新生成分析会话。");
      return true;
    },
  );
});
