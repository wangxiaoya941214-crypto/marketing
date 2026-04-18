import type { LeadSheetAdapterSidecar } from "./adapters/lead-sheet/build-marketing-input-from-leads.ts";
import {
  getCriticalAnalysisReadiness,
  type AnalysisCriticalGap,
} from "./analysis-readiness.ts";
import type { MarketingInput } from "./marketing-engine.ts";

export const LEAD_SHEET_REVIEW_PRIORITIES = [
  "先看订单冲突",
  "再看人工确认成交",
  "再补目标、花费、CPS 红线",
  "最后再生成最终分析",
] as const;

export const LEAD_SHEET_TRUSTED_METRICS = [
  "主线索总量",
  "加微人数",
  "高意向人数",
  "按保守口径计入的成交",
  "订单冲突数",
  "人工确认成交数",
] as const;

export const LEAD_SHEET_REFERENCE_METRICS = [
  "内容表现聚合",
  "渠道 / 来源归因",
  "完整经营判断",
] as const;

export const LEAD_SHEET_PENDING_METRICS = [
  "目标成交台数",
  "投放金额",
  "CPS 红线",
  "完整经营结论",
] as const;

export interface LeadSheetModeSummary {
  recognitionPercent: number;
  businessSupplementGroups: AnalysisCriticalGap[];
  businessSupplementFields: string[];
  reviewPriorities: string[];
  trustedMetrics: string[];
  referenceMetrics: string[];
  pendingMetrics: string[];
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const getCoreFunnelSignalRatio = (input: MarketingInput) => {
  const signals = [
    input.funnel.leads.total,
    input.funnel.privateDomain.total,
    input.funnel.highIntent.total,
    input.funnel.deals.total,
    input.funnel.leads.flexible,
    input.funnel.leads.super,
    input.funnel.deals.flexible,
    input.funnel.deals.super,
  ];

  return signals.filter((value) => value !== null).length / signals.length;
};

const getFieldCoverage = (sidecar: LeadSheetAdapterSidecar) =>
  Math.max(0, 1 - sidecar.missingFields.length / 6);

const getRiskScore = (sidecar: LeadSheetAdapterSidecar) => {
  const conflictPenalty = Math.min(24, sidecar.orderConflictCount * 8);
  const manualPenalty = Math.min(11, sidecar.manualReviewDealCount * 5);
  return Math.max(0, 35 - conflictPenalty - manualPenalty);
};

export const buildLeadSheetModeSummary = (
  input: MarketingInput,
  sidecar: LeadSheetAdapterSidecar,
): LeadSheetModeSummary => {
  const readiness = getCriticalAnalysisReadiness(input);
  const recognitionPercent =
    sidecar.rowCount === 0
      ? 0
      : clampPercent(
          sidecar.detectionConfidence * 25 +
            getFieldCoverage(sidecar) * 20 +
            getCoreFunnelSignalRatio(input) * 20 +
            getRiskScore(sidecar),
        );

  return {
    recognitionPercent,
    businessSupplementGroups: readiness.missingGroups,
    businessSupplementFields: readiness.missingFields,
    reviewPriorities: [...LEAD_SHEET_REVIEW_PRIORITIES],
    trustedMetrics: [...LEAD_SHEET_TRUSTED_METRICS],
    referenceMetrics: [...LEAD_SHEET_REFERENCE_METRICS],
    pendingMetrics: [...LEAD_SHEET_PENDING_METRICS],
  };
};
