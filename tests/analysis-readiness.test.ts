import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyInput } from "../shared/marketing-engine.ts";
import { getCriticalAnalysisReadiness } from "../shared/analysis-readiness.ts";

test("主线索表关键决策字段未补齐时会阻止直接生成最终分析", () => {
  const input = createEmptyInput();
  input.targets.flexible = 1;
  input.targets.super = 2;

  const readiness = getCriticalAnalysisReadiness(input);

  assert.equal(readiness.shouldBlock, true);
  assert.deepEqual(readiness.missingGroups, ["CPS红线", "投放金额"]);
  assert.match(readiness.missingFields.join(" "), /灵活订阅CPS红线/);
  assert.match(readiness.missingFields.join(" "), /总投放金额/);
});

test("关键决策字段齐全时不拦截最终分析", () => {
  const input = createEmptyInput();
  input.targets.flexible = 1;
  input.targets.super = 2;
  input.cpsRedlines.flexible = 1000;
  input.cpsRedlines.super = 1200;
  input.spend.flexible = 2000;
  input.spend.super = 3000;
  input.spend.brand = 500;
  input.spend.total = 5500;

  const readiness = getCriticalAnalysisReadiness(input);

  assert.equal(readiness.shouldBlock, false);
  assert.deepEqual(readiness.missingGroups, []);
  assert.deepEqual(readiness.missingFields, []);
});
