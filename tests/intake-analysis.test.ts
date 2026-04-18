import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { buildIntakeAnalysisResponse } from "../shared/routing/intake-api.ts";
import { buildIntakeExecutionResponse } from "../shared/routing/intake-execute.ts";

process.env.NODE_ENV = "test";

const leadSheetFixturePath = path.resolve(
  process.cwd(),
  "tests/fixtures/lead-sheet-real-structure.xlsx",
);
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
    XLSX.utils.json_to_sheet([
      {
        来源笔记: "测试笔记",
        XHS线索数: 1,
        广告流量线索数: 1,
        自然流量线索数: 0,
        高置信打通主线索数: 1,
        高置信打通率: 1,
        加微成功数: 1,
        加微成功率: 1,
        下单数: 1,
        下单率: 1,
      },
    ]),
    "XHS内容分析_按笔记",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        计划名称_标准化: "3月24日获客号-超级订阅萤火虫",
        消费: 500,
        展现量: 1000,
        点击量: 100,
        互动量: 10,
        私信进线数: 10,
        私信开口数: 5,
        私信留资数: 1,
        XHS线索数: 1,
        高置信打通主线索数: 1,
        加微成功数: 1,
        下单数: 1,
        点击率: 0.1,
        投放表留资率: 0.1,
        按打通主线索重算留资成本: 500,
        按打通下单重算获客成本: 500,
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
        投放展现量: 1000,
        投放点击量: 100,
        投放私信进线数: 10,
        投放私信开口数: 5,
        投放私信留资数: 1,
        私信进线人数: 10,
        私信开口人数: 5,
        私信留资总人数: 1,
        XHS线索列表条数: 1,
        XHS广告流量线索数: 1,
        XHS自然流量线索数: 0,
        高置信打通主线索数: 1,
        加微成功数: 1,
        下单数: 1,
        投放点击率: 0.1,
        投放留资率: 0.1,
        高置信打通率: 1,
        下单率: 1,
      },
    ]),
    "XHS日分析_打通",
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
        转化方式: "私信留资",
        手机号: "13800000000",
        微信号: "wechat001",
        联络主键: "13800000000",
        匹配状态: "已匹配",
        匹配主键: "13800000000",
        匹配时间差天: 0,
        匹配置信度: "低置信待核查",
        主线索ID: "M001",
        主线索日期: "2026-03-31",
        业务类型: "超级订阅",
      },
    ]),
    "低置信匹配待核查",
  );

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

const buildCampaignWorkbookBuffer = () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        计划名称_标准化: "投放计划A",
        消费: 5000,
        展现量: 100000,
        点击量: 1200,
        私信留资数: 38,
      },
    ]),
    "计划报表",
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

const buildLeadListWorkbookBuffer = () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        小红书线索ID: "X001",
        线索生成时间: "2026-03-31 10:00:00",
        来源笔记: "测试笔记",
        流量类型: "广告流量",
        手机号: "13800000000",
      },
    ]),
    "线索列表",
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

const buildDailyWorkbookBuffer = () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        日期: "2026-03-31",
        投放消费: 500,
        投放展现量: 1000,
        投放点击量: 100,
        投放私信留资数: 10,
      },
    ]),
    "日维度报表",
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

test("统一入口会把闭环底座工作簿路由到闭环分析", async () => {
  const response = await buildIntakeAnalysisResponse({
    fileInfo: {
      name: "闭环底座.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildClosedLoopWorkbookBuffer().toString("base64"),
    },
  });

  assert.equal(response.sourceType, "closed_loop_workbook");
  assert.equal(response.diagnosisRoute, "closed_loop_analysis");
  assert.equal(response.confidence, "high");
  assert.deepEqual(Object.keys(response).sort(), [
    "confidence",
    "diagnosisRoute",
    "reason",
    "sourceType",
  ]);
});

test("统一入口会把主线索表路由到销售跟进诊断", async () => {
  const response = await buildIntakeAnalysisResponse({
    fileInfo: {
      name: "lead-sheet-real-structure.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: fs.readFileSync(leadSheetFixturePath).toString("base64"),
    },
  });

  assert.equal(response.sourceType, "crm_lead_sheet");
  assert.equal(response.diagnosisRoute, "sales_followup_diagnosis");
});

test("统一入口会把投放计划报表路由到投放转化诊断", async () => {
  const response = await buildIntakeAnalysisResponse({
    fileInfo: {
      name: "campaign-report.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildCampaignWorkbookBuffer().toString("base64"),
    },
  });

  assert.equal(response.sourceType, "xhs_campaign_report");
  assert.equal(response.diagnosisRoute, "campaign_conversion_diagnosis");
});

test("统一入口会把小红书线索列表路由到内容传播诊断", async () => {
  const response = await buildIntakeAnalysisResponse({
    fileInfo: {
      name: "xhs-leads.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildLeadListWorkbookBuffer().toString("base64"),
    },
  });

  assert.equal(response.sourceType, "xhs_lead_list");
  assert.equal(response.diagnosisRoute, "content_to_lead_diagnosis");
});

test("统一入口会把日维度投放报表路由到投放转化诊断", async () => {
  const response = await buildIntakeAnalysisResponse({
    fileInfo: {
      name: "daily-report.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildDailyWorkbookBuffer().toString("base64"),
    },
  });

  assert.equal(response.sourceType, "xhs_daily_report");
  assert.equal(response.diagnosisRoute, "campaign_conversion_diagnosis");
});

test("统一入口会把营销模板路由到营销诊断", async () => {
  const response = await buildIntakeAnalysisResponse({
    fileInfo: {
      name: "daily-smoke.csv",
      mimeType: "text/csv",
      data: fs.readFileSync(marketingTemplateFixturePath).toString("base64"),
    },
  });

  assert.equal(response.sourceType, "marketing_template");
  assert.equal(response.diagnosisRoute, "marketing_diagnosis");
});

test("统一入口会把非结构化文本路由到营销诊断", async () => {
  const response = await buildIntakeAnalysisResponse({
    rawText: "这是一份会议纪要，主要讨论下周投放预算和渠道反馈，没有结构化字段。",
  });

  assert.equal(response.sourceType, "unstructured_document");
  assert.equal(response.diagnosisRoute, "marketing_diagnosis");
  assert.equal(response.confidence, "low");
});

test("统一入口执行接口会把闭环底座送进闭环链路", async () => {
  const response = await buildIntakeExecutionResponse({
    fileInfo: {
      name: "闭环底座.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildClosedLoopWorkbookBuffer().toString("base64"),
    },
  });

  assert.equal(response.diagnosisRoute, "closed_loop_analysis");
  assert.equal(response.routeOverrideApplied, false);
  assert.equal(response.routeContext.kind, "closed_loop_import");
  assert.ok(response.routeContext.job.id);
  assert.ok(response.routeContext.snapshot.id);
});

test("统一入口执行接口允许兼容链路手动改分析方向", async () => {
  const response = await buildIntakeExecutionResponse({
    diagnosisRoute: "content_to_lead_diagnosis",
    fileInfo: {
      name: "daily-smoke.csv",
      mimeType: "text/csv",
      data: fs.readFileSync(marketingTemplateFixturePath).toString("base64"),
    },
  });

  assert.equal(response.sourceType, "marketing_template");
  assert.equal(response.diagnosisRoute, "content_to_lead_diagnosis");
  assert.equal(response.routeOverrideApplied, true);
  assert.equal(response.routeContext.kind, "recognized_input");
});

test("统一入口执行接口会把主线索表送进销售跟进诊断上下文", async () => {
  const response = await buildIntakeExecutionResponse({
    fileInfo: {
      name: "lead-sheet-real-structure.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: fs.readFileSync(leadSheetFixturePath).toString("base64"),
    },
  });

  assert.equal(response.diagnosisRoute, "sales_followup_diagnosis");
  assert.equal(response.routeOverrideApplied, false);
  assert.equal(response.routeContext.kind, "recognized_input");
  assert.equal(response.routeContext.importAudit?.sheetType, "lead_detail_sheet");
  assert.equal(response.routeContext.recognitionAudit.sourceType, "xlsx");
});

test("统一入口执行接口会把投放和内容报表送进兼容诊断上下文", async () => {
  const campaignResponse = await buildIntakeExecutionResponse({
    fileInfo: {
      name: "campaign-report.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildCampaignWorkbookBuffer().toString("base64"),
    },
  });

  const contentResponse = await buildIntakeExecutionResponse({
    fileInfo: {
      name: "xhs-leads.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildLeadListWorkbookBuffer().toString("base64"),
    },
  });

  assert.equal(campaignResponse.diagnosisRoute, "campaign_conversion_diagnosis");
  assert.equal(campaignResponse.routeContext.kind, "recognized_input");
  assert.ok(campaignResponse.routeContext.recognitionMode.length > 0);
  assert.equal(contentResponse.diagnosisRoute, "content_to_lead_diagnosis");
  assert.equal(contentResponse.routeContext.kind, "recognized_input");
  assert.ok(contentResponse.routeContext.recognitionMode.length > 0);
});

test("统一入口执行接口不允许把闭环底座强行切到兼容链路", async () => {
  await assert.rejects(
    () =>
      buildIntakeExecutionResponse({
        diagnosisRoute: "marketing_diagnosis",
        fileInfo: {
          name: "闭环底座.xlsx",
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          data: buildClosedLoopWorkbookBuffer().toString("base64"),
        },
      }),
    (error: any) => {
      assert.equal(error?.statusCode, 400);
      assert.equal(error?.message, "当前上传内容不支持切换到这个分析方向。");
      return true;
    },
  );
});
