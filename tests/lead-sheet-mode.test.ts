import test from "node:test";
import assert from "node:assert/strict";
import type { LeadSheetAdapterSidecar } from "../shared/adapters/lead-sheet/build-marketing-input-from-leads.ts";
import { buildLeadSheetModeSummary } from "../shared/lead-sheet-mode.ts";
import { createEmptyInput } from "../shared/marketing-engine.ts";

const createLeadSheetSidecar = (): LeadSheetAdapterSidecar => ({
  adapter: "lead-sheet",
  sheetType: "lead_detail_sheet",
  sheetName: "主线索表",
  rowCount: 5,
  columnCount: 12,
  detectionConfidence: 0.92,
  matchedSignals: ["主线索", "加微", "高意向", "订单号"],
  missingFields: [],
  countedDeals: 2,
  excludedConflictDealCount: 1,
  excludedConflictDealReason:
    "订单口径冲突的记录不会自动计入成交，包括“未下单但带订单信息”和“已下单但缺少订单证据”。",
  orderConflictCount: 2,
  orderConflictSamples: [],
  orderAuditSummary: "发现 2 条订单口径冲突，另有 1 条成交需要人工确认",
  manualReviewDealCount: 1,
  warnings: [],
});

test("主线索表识别覆盖不再因为预算字段缺失被误判为识别失败", () => {
  const input = createEmptyInput();
  input.funnel.leads.total = 5;
  input.funnel.leads.flexible = 2;
  input.funnel.leads.super = 3;
  input.funnel.privateDomain.total = 5;
  input.funnel.highIntent.total = 3;
  input.funnel.deals.total = 2;
  input.funnel.deals.flexible = 1;
  input.funnel.deals.super = 1;

  const summary = buildLeadSheetModeSummary(input, createLeadSheetSidecar());

  assert.ok(summary.recognitionPercent >= 70);
  assert.deepEqual(summary.businessSupplementGroups, [
    "目标成交台数",
    "CPS红线",
    "投放金额",
  ]);
  assert.deepEqual(summary.pendingMetrics, [
    "目标成交台数",
    "投放金额",
    "CPS 红线",
    "完整经营结论",
  ]);
});
