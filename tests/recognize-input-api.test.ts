import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { buildRecognizeInputResponse } from "../shared/marketing-api.ts";

const fixturePath = path.resolve(process.cwd(), "tests/fixtures/lead-sheet-real-structure.xlsx");

const buildClosedLoopWorkbookBuffer = () => {
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
        点击量: 100,
        私信留资数: 1,
        高置信打通主线索数: 1,
        加微成功数: 1,
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
        私信进线人数: 10,
        私信开口人数: 5,
        私信留资总人数: 1,
        高置信打通主线索数: 1,
        下单数: 1,
        高置信打通率: 1,
      },
    ]),
    "XHS日分析_打通",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        小红书线索ID: "X001",
      },
    ]),
    "低置信匹配待核查",
  );

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

test("API 识别响应会返回主线索表审计和漏斗数据", async () => {
  const data = fs.readFileSync(fixturePath).toString("base64");

  const response = await buildRecognizeInputResponse({
    fileInfo: {
      name: "lead-sheet-real-structure.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data,
    },
  });

  assert.notEqual(response.recognitionMode, "工作簿读取（XLSX）");
  assert.equal(response.importAudit?.sheetType, "lead_detail_sheet");
  assert.ok(response.importAudit?.orderAuditSummary);
  assert.equal(response.importAudit?.countedDeals, 2);
  assert.equal(response.importAudit?.excludedConflictDealCount, 1);
  assert.ok((response.importAudit?.orderConflictCount || 0) > 0);
  assert.match(response.importAudit?.orderConflictSamples[0]?.leadName || "", /\*+/);
  assert.ok(!response.importAudit?.orderConflictSamples[0]?.leadName.includes("13900000003"));
  assert.match(
    response.importAudit?.warnings.join(" ") || "",
    /成交漏斗已按保守口径剔除/,
  );
  assert.match(
    response.recognitionAudit?.reviewReasons.join(" ") || "",
    /目标成交台数、CPS红线、投放金额/,
  );
  assert.ok(
    response.recognitionAudit?.recommendedFocus.includes("目标成交台数"),
  );
  assert.ok((response.recognitionAudit?.completenessPercent || 0) >= 70);
  assert.equal(response.recognizedInput.funnel.leads.total, 5);
  assert.equal(response.recognizedInput.funnel.privateDomain.total, 5);
  assert.equal(response.recognizedInput.funnel.highIntent.total, 3);
  assert.equal(response.recognizedInput.funnel.deals.total, 2);
});

test("API 识别响应能识别闭环底座工作簿", async () => {
  const data = buildClosedLoopWorkbookBuffer().toString("base64");

  const response = await buildRecognizeInputResponse({
    fileInfo: {
      name: "内容传播_线索_用户旅程_闭环底座.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data,
    },
  });

  assert.equal(response.recognitionMode, "闭环底座识别（XLSX）");
  assert.equal(response.recognizedInput.funnel.leads.total, 1);
  assert.equal(response.recognizedInput.funnel.privateDomain.total, 1);
  assert.equal(response.recognizedInput.funnel.highIntent.total, 1);
  assert.equal(response.recognizedInput.funnel.deals.total, 1);
  assert.match(
    response.recognitionAudit?.reviewReasons.join(" ") || "",
    /闭环底座工作簿/,
  );
});
