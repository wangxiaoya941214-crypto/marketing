import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { detectLeadSheet, type TabularSheet } from "../shared/adapters/lead-sheet/detect-lead-sheet";
import { normalizeLeadRows } from "../shared/adapters/lead-sheet/normalize-lead-row";
import { auditOrderConsistency } from "../shared/adapters/lead-sheet/audit-order-consistency";
import { buildMarketingInputFromLeads } from "../shared/adapters/lead-sheet/build-marketing-input-from-leads";

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
  assert.equal(built.input.funnel?.leads.total, 5);
  assert.equal(built.input.funnel?.privateDomain.total, 5);
  assert.equal(built.input.funnel?.highIntent.total, 2);
  assert.equal(built.input.funnel?.deals.total, 3);
});
