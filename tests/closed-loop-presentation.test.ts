import test from "node:test";
import assert from "node:assert/strict";
import { buildClosedLoopPresentationSummary } from "../shared/closed-loop/presentation.ts";
import type { ClosedLoopAnalysisSnapshot } from "../shared/closed-loop/types.ts";

const buildSnapshot = (): ClosedLoopAnalysisSnapshot => ({
  id: "snapshot-1",
  importJobId: "job-1",
  generatedAt: "2026-04-13T10:00:00.000Z",
  marketingInput: {
    periodStart: "2026-04-01",
    periodEnd: "2026-04-07",
    targets: { flexible: null, super: null },
    cpsRedlines: { flexible: null, super: null },
    spend: { flexible: null, super: null, brand: null, total: null },
    funnel: {
      leads: { total: 120, flexible: 20, super: 100 },
      privateDomain: { total: 72, flexible: 12, super: 60 },
      highIntent: { total: 18, flexible: 2, super: 16 },
      deals: { total: 6, flexible: 1, super: 5 },
    },
    contents: [],
    previous: {
      totalDeals: null,
      flexibleDeals: null,
      superDeals: null,
      overallCps: null,
      flexibleCps: null,
      superCps: null,
      cpl: null,
      overallConversionRate: null,
      totalSpend: null,
    },
    creativeNotes: "",
    anomalyNotes: "",
    benchmarkLinks: "",
    rawInput: "",
  },
  dashboard: {
    engineLabel: "test",
    activeExpertLenses: [],
    metricsTable: [],
    overallRating: "🟡",
    overallRatingLabel: "🟡局部有问题",
    audit: {
      completenessPercent: 92,
      missingFields: [],
      warnings: [],
      anomalies: [],
      redlineAlerts: [],
    },
    products: {
      flexible: {
        product: "flexible",
        label: "灵活订阅",
        spend: null,
        leads: 20,
        privateDomain: 12,
        highIntent: 2,
        deals: 1,
        targetDeals: null,
        cpsRedline: null,
        cpl: null,
        cps: null,
        targetCompletionRate: null,
        leadToPrivateRate: 0.6,
        privateToHighIntentRate: 0.16,
        highIntentToDealRate: 0.5,
        overallConversionRate: 0.05,
        dealStatus: "🟡",
        cpsStatus: "🟢",
      },
      super: {
        product: "super",
        label: "超级订阅",
        spend: null,
        leads: 100,
        privateDomain: 60,
        highIntent: 16,
        deals: 5,
        targetDeals: null,
        cpsRedline: null,
        cpl: null,
        cps: null,
        targetCompletionRate: null,
        leadToPrivateRate: 0.6,
        privateToHighIntentRate: 0.27,
        highIntentToDealRate: 0.31,
        overallConversionRate: 0.05,
        dealStatus: "🟡",
        cpsStatus: "🟢",
      },
    },
    funnels: {
      flexible: {
        stages: [],
        steps: [],
        largestLossStep: null,
        weakestConversionStep: null,
        notes: [],
      },
      super: {
        stages: [],
        steps: [],
        largestLossStep: null,
        weakestConversionStep: null,
        notes: [],
      },
    },
    diagnosis: {
      flexible: {
        product: "flexible",
        largestLossTitle: "加微信/进私域 -> 明确有意向",
        intuition: "",
        rationale: "",
        productSpecific: "",
        validationAction: "",
      },
      super: {
        product: "super",
        largestLossTitle: "明确有意向 -> 最终成交",
        intuition: "",
        rationale: "",
        productSpecific: "",
        validationAction: "",
      },
    },
    contentRanking: [],
    contentInsights: {
      best: "",
      bestReason: "",
      worst: "",
      worstAction: "",
    },
    budgetComparison: [],
    budgetRecommendations: [],
    actionPlan: {
      urgent: [],
      thisWeek: [],
      nextReview: [],
    },
    scalePlan: {
      enabled: false,
      effectiveTraits: [],
      comboFlexible: "",
      comboSuper: "",
      steps: [],
      stopLoss: "",
    },
    reliability: {
      dataIntegrityText: "92%",
      sampleText: "够用",
      reliabilityText: "高",
      reviewDays: 7,
      reviewFocus: "优先盯高意向转化",
      moreDataSuggestions: [],
    },
  },
  analysis: "fallback",
  insights: {
    anomalies: [],
    opportunities: [],
    risks: [],
    topFindings: [],
  },
  cockpit: {
    cards: [
      { key: "crmLeads", label: "主线索总量", value: 120, hint: "主线索池总记录" },
      { key: "xhsLeads", label: "小红书线索", value: 80, hint: "线索列表明细总量" },
      { key: "matchedLeads", label: "高置信打通", value: 30, hint: "已进入闭环归因的线索" },
      { key: "ordered", label: "高置信下单", value: 6, hint: "闭环内已确认成交" },
    ],
    review: {
      pendingCount: 4,
      confirmedCount: 26,
      unmatchedCount: 2,
      planCoverageRate: 0.62,
    },
    contentNotes: [
      {
        note: "品牌号-低月付通勤",
        xhsLeads: 32,
        adLeads: 26,
        organicLeads: 6,
        matchedLeads: 15,
        addedWechat: 11,
        ordered: 4,
        orderedRate: 0.27,
      },
    ],
    plans: [
      {
        plan: "超订-品牌号投流",
        spend: 5800,
        clicks: 1200,
        privateLeads: 32,
        matchedLeads: 15,
        ordered: 4,
        leadCost: 386,
        acquireCost: 1450,
      },
      {
        plan: "灵活-高成本实验计划",
        spend: 4200,
        clicks: 600,
        privateLeads: 8,
        matchedLeads: 3,
        ordered: 0,
        leadCost: 1400,
        acquireCost: null,
      },
    ],
    daily: [],
    reasons: {
      notOrdered: [{ label: "价格犹豫", count: 12 }],
      lost: [{ label: "持续未回复待跟进", count: 8 }],
    },
  },
});

test("闭环展示规则会生成管理结论和四视角摘要", () => {
  const summary = buildClosedLoopPresentationSummary(buildSnapshot());

  assert.equal(summary.insightStatus.label, "AI 洞察未补充 / 已降级");
  assert.equal(summary.managerConclusions.length, 3);
  assert.match(summary.managerConclusions[0]?.text || "", /品牌号-低月付通勤/);
  assert.match(summary.managerConclusions[1]?.text || "", /4 条待复核/);
  assert.match(summary.managerConclusions[2]?.text || "", /待复核样本处理干净/);
  assert.match(summary.contentSummary, /更偏广告拉动/);
  assert.match(summary.planSummary, /花费最高的是/);
  assert.equal(summary.journeyMetrics.length, 4);
  assert.match(summary.resultSummary, /高置信下单 6 个/);
});
