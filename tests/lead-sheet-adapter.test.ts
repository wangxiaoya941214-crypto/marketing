import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { detectLeadSheet, type TabularSheet } from "../shared/adapters/lead-sheet/detect-lead-sheet.ts";
import {
  normalizeLeadRows,
  type NormalizedLeadRow,
} from "../shared/adapters/lead-sheet/normalize-lead-row.ts";
import { auditOrderConsistency } from "../shared/adapters/lead-sheet/audit-order-consistency.ts";
import { buildMarketingInputFromLeads } from "../shared/adapters/lead-sheet/build-marketing-input-from-leads.ts";

const fixturePath = path.resolve(process.cwd(), "tests/fixtures/lead-sheet-real-structure.xlsx");

const loadSheets = (): TabularSheet[] => {
  const buffer = fs.readFileSync(fixturePath);
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

  return workbook.SheetNames.map((sheetName) => ({
    name: sheetName,
    rows: XLSX.utils
      .sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
        header: 1,
        raw: false,
        defval: "",
      })
      .map((row) => row.map((cell) => String(cell ?? "").trim())),
  }));
};

test("真实结构主线索表适配器能识别、审计并聚合漏斗", () => {
  const sheets = loadSheets();
  const detection = detectLeadSheet(sheets);

  assert.equal(detection.kind, "lead_detail_sheet");
  assert.equal(detection.sheetName, "主线索表");
  assert.ok(detection.columnMap.salesOwner !== undefined);
  assert.ok(detection.columnMap.addedWechat !== undefined);
  assert.ok(detection.columnMap.highIntent !== undefined);
  assert.ok(detection.columnMap.orderId !== undefined);

  const normalized = normalizeLeadRows(sheets, detection);
  assert.equal(normalized.rows.length, 5);
  assert.equal(normalized.rows[0]?.salesOwner, "项溪萌");
  assert.equal(normalized.rows[0]?.businessType, "flexible");
  assert.equal(normalized.rows[1]?.highIntent, "yes");
  assert.equal(normalized.rows[4]?.hasStrongIntentSignal, true);
  assert.equal(normalized.rows[4]?.highIntent, "yes");

  const orderAudit = auditOrderConsistency(normalized.rows);
  assert.ok(orderAudit.conflictCount > 0);
  assert.match(orderAudit.summary, /订单口径冲突/);

  const built = buildMarketingInputFromLeads({
    detection,
    rows: normalized.rows,
    rawText: "fixture",
    orderAudit,
    missingFields: normalized.missingFields,
  });

  assert.equal(built.sidecar.sheetType, "lead_detail_sheet");
  assert.ok(built.sidecar.orderConflictCount > 0);
  assert.match(built.sidecar.orderConflictSamples[0]?.leadName || "", /\*+/);
  assert.ok(!built.sidecar.orderConflictSamples[0]?.leadName.includes("13900000003"));
  assert.equal(built.sidecar.countedDeals, 2);
  assert.equal(built.sidecar.excludedConflictDealCount, 1);
  assert.match(
    built.sidecar.warnings.join(" "),
    /成交漏斗已按保守口径剔除/,
  );
  assert.equal(built.input.funnel?.leads.total, 5);
  assert.equal(built.input.funnel?.privateDomain.total, 5);
  assert.equal(built.input.funnel?.highIntent.total, 3);
  assert.equal(built.input.funnel?.deals.total, 2);
});

test("成交日期本身可以作为成交证据，不应被误判为订单冲突", () => {
  const row: NormalizedLeadRow = {
    sheetName: "主线索表",
    rowNumber: 2,
    leadDate: "2026-03-20 10:00:00",
    channel: "抖音-品牌号",
    channelDetail: "超级电动老孙-抖音",
    channelGroup: "抖音-品牌号",
    businessTypeRaw: "超级订阅",
    businessType: "super",
    leadName: "测试客户",
    phone: "13800000000",
    salesOwner: "测试销售",
    addedWechatRaw: "已通过",
    addedWechat: "yes",
    highIntentRaw: "A",
    highIntent: "yes",
    dealStatusRaw: "已下单",
    dealStatus: "yes",
    orderId: "",
    orderDate: "",
    dealDate: "2026-03-31 00:00:00",
    orderProgress: "",
    orderCount: 1,
    hasStrongIntentSignal: false,
    hasExplicitDealEvidence: true,
    noOrderReason: "",
    lossAttribution: "",
    dealSignals: [{ field: "是否下单", rawValue: "已下单", normalized: "yes" }],
    orderCountSignals: [],
    needsManualDealReview: false,
    rawRow: {},
  };

  const audit = auditOrderConsistency([row]);
  assert.equal(audit.conflictCount, 0);
  assert.equal(audit.manualReviewCount, 0);
  assert.match(audit.summary, /未发现明确的订单口径冲突/);
  assert.match(audit.summary, /没有额外需要人工确认的成交/);
});

test("已下单记录里的未成交归因备注不应误报为订单冲突", () => {
  const row: NormalizedLeadRow = {
    sheetName: "主线索表",
    rowNumber: 41,
    leadDate: "2026-03-20 10:00:00",
    channel: "抖音-品牌号",
    channelDetail: "超级电动老孙-抖音",
    channelGroup: "抖音-品牌号",
    businessTypeRaw: "超级订阅",
    businessType: "super",
    leadName: "测试客户",
    phone: "13800000000",
    salesOwner: "测试销售",
    addedWechatRaw: "已通过",
    addedWechat: "yes",
    highIntentRaw: "A",
    highIntent: "yes",
    dealStatusRaw: "已下单",
    dealStatus: "yes",
    orderId: "DY260331000001",
    orderDate: "2026-03-31 10:00:00",
    dealDate: "2026-03-31 00:00:00",
    orderProgress: "",
    orderCount: 1,
    hasStrongIntentSignal: false,
    hasExplicitDealEvidence: true,
    noOrderReason: "已转灵活订阅",
    lossAttribution: "",
    dealSignals: [{ field: "是否下单", rawValue: "已下单", normalized: "yes" }],
    orderCountSignals: [],
    needsManualDealReview: false,
    rawRow: {},
  };

  const audit = auditOrderConsistency([row]);
  assert.equal(audit.conflictCount, 0);
  assert.equal(audit.manualReviewCount, 1);
  assert.match(audit.summary, /未发现明确的订单口径冲突/);
  assert.match(audit.summary, /另有 1 条成交需要人工确认/);
});

test("已下单但缺少订单证据的记录不应继续计入保守口径成交", () => {
  const row: NormalizedLeadRow = {
    sheetName: "主线索表",
    rowNumber: 512,
    leadDate: "2026-03-18 00:00:00",
    channel: "私域-老客户",
    channelDetail: "私域池",
    channelGroup: "私域-老客户",
    businessTypeRaw: "超级订阅",
    businessType: "super",
    leadName: "测试客户",
    phone: "15914133100",
    salesOwner: "陆鑫涛",
    addedWechatRaw: "已通过",
    addedWechat: "yes",
    highIntentRaw: "S",
    highIntent: "yes",
    dealStatusRaw: "已下单",
    dealStatus: "yes",
    orderId: "",
    orderDate: "",
    dealDate: "",
    orderProgress: "",
    orderCount: 0,
    hasStrongIntentSignal: true,
    hasExplicitDealEvidence: false,
    noOrderReason: "",
    lossAttribution: "",
    dealSignals: [{ field: "是否下单", rawValue: "已下单", normalized: "yes" }],
    orderCountSignals: [{ field: "是否下单（下单为1）", rawValue: "", count: null }],
    needsManualDealReview: false,
    rawRow: {},
  };

  const audit = auditOrderConsistency([row]);
  assert.equal(audit.conflictCount, 1);
  assert.equal(audit.manualReviewCount, 0);
  assert.match(audit.summary, /发现 1 条订单口径冲突/);

  const built = buildMarketingInputFromLeads({
    detection: {
      kind: "lead_detail_sheet",
      sheetName: "主线索表",
      headerRowIndex: 0,
      header: [],
      columnMap: {},
      matchedSignals: [],
      missingSignals: [],
      rowCount: 1,
      columnCount: 0,
      confidence: 1,
    },
    rows: [row],
    rawText: "fixture",
    orderAudit: audit,
    missingFields: [],
  });

  assert.equal(built.sidecar.countedDeals, 0);
  assert.equal(built.sidecar.excludedConflictDealCount, 1);
  assert.equal(built.sidecar.orderConflictCount, 1);
  assert.equal(built.input.funnel?.deals.total, 0);
  assert.match(
    built.sidecar.warnings.join(" "),
    /订单冲突记录，成交漏斗已按保守口径剔除/,
  );
});
