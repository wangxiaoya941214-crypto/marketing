import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildRecognizeInputResponse } from "../server";

const fixturePath = path.resolve(process.cwd(), "tests/fixtures/lead-sheet-real-structure.xlsx");

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
  assert.ok((response.importAudit?.orderConflictCount || 0) > 0);
  assert.match(response.importAudit?.orderConflictSamples[0]?.leadName || "", /\*+/);
  assert.ok(!response.importAudit?.orderConflictSamples[0]?.leadName.includes("13900000003"));
  assert.equal(response.recognizedInput.funnel.leads.total, 5);
  assert.equal(response.recognizedInput.funnel.privateDomain.total, 5);
  assert.equal(response.recognizedInput.funnel.highIntent.total, 2);
  assert.equal(response.recognizedInput.funnel.deals.total, 3);
});
