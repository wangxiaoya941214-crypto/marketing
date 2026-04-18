import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildAnalyzeResponse } from "../shared/marketing-api.ts";
import { TimeoutError } from "../shared/async-utils.ts";
import { createEmptyInsightResult } from "../shared/ai-insight-engine.ts";

const fixturePath = path.resolve(process.cwd(), "tests/fixtures/daily-smoke.csv");

test("analyze 超时降级后仍能稳定返回", async () => {
  const rawText = fs.readFileSync(fixturePath, "utf8");

  const response = await buildAnalyzeResponse(
    { rawText },
    {
      generateInsightsImpl: async () => {
        throw new TimeoutError("generateInsights:mock", 12_000);
      },
      generateAiEnhancedReportImpl: async () => {
        throw new TimeoutError("generateAiEnhancedReport:mock", 30_000);
      },
    },
  );

  assert.equal(response.insights.topFindings.length, createEmptyInsightResult().topFindings.length);
  assert.match(response.engineMode, /超时降级/);
  assert.ok(response.analysis.includes("模块一"));
  assert.ok(response.dashboard.metricsTable.length > 0);
});
