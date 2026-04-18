import type { InsightResult } from "../ai-insight-engine.ts";
import type { ClosedLoopAnalysisSnapshot, ClosedLoopCockpitSummary } from "./types.ts";

type Tone = "positive" | "warning" | "neutral";

export interface ClosedLoopInsightStatus {
  label: string;
  tone: Tone;
}

export interface ClosedLoopManagerConclusion {
  label: string;
  text: string;
}

export interface ClosedLoopJourneyMetric {
  label: string;
  value: string;
  hint: string;
}

export interface ClosedLoopPresentationSummary {
  insightStatus: ClosedLoopInsightStatus;
  managerConclusions: ClosedLoopManagerConclusion[];
  contentSummary: string;
  planSummary: string;
  journeyMetrics: ClosedLoopJourneyMetric[];
  journeySummary: string;
  resultSummary: string;
}

const hasInsightContent = (insights: InsightResult) =>
  insights.topFindings.length > 0 ||
  insights.anomalies.length > 0 ||
  insights.opportunities.length > 0 ||
  insights.risks.length > 0;

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const formatPercent = (value: number) => `${Math.round(value * 10000) / 100}%`;

const buildInsightStatus = (insights: InsightResult): ClosedLoopInsightStatus =>
  hasInsightContent(insights)
    ? { label: "AI 洞察已完成", tone: "positive" }
    : { label: "AI 洞察未补充 / 已降级", tone: "warning" };

const getTopContentNote = (cockpit: ClosedLoopCockpitSummary) =>
  [...cockpit.contentNotes]
    .map((item) => ({
      note: String(item.note || item.noteTitle || "未命名笔记"),
      xhsLeads: toNumber(item.xhsLeads),
      adLeads: toNumber(item.adLeads),
      organicLeads: toNumber(item.organicLeads),
      matchedLeads: toNumber(item.matchedLeads),
      ordered: toNumber(item.ordered),
      orderedRate: toNumber(item.orderedRate),
    }))
    .sort((left, right) => {
      if (right.ordered !== left.ordered) return right.ordered - left.ordered;
      if (right.matchedLeads !== left.matchedLeads) return right.matchedLeads - left.matchedLeads;
      return right.xhsLeads - left.xhsLeads;
    })[0];

const getPlanStats = (cockpit: ClosedLoopCockpitSummary) => {
  const plans = [...cockpit.plans].map((item) => ({
    plan: String(item.plan || "未命名计划"),
    spend: toNumber(item.spend),
    matchedLeads: toNumber(item.matchedLeads),
    ordered: toNumber(item.ordered),
  }));

  const mostExpensive = [...plans].sort((left, right) => right.spend - left.spend)[0];
  const mostOrders = [...plans].sort((left, right) => right.ordered - left.ordered)[0];
  const weakest =
    [...plans]
      .filter((item) => item.spend > 0 && item.ordered === 0)
      .sort((left, right) => right.spend - left.spend)[0] ||
    [...plans]
      .filter((item) => item.spend > 0)
      .sort((left, right) => {
        const leftRatio = left.ordered > 0 ? left.ordered / Math.max(left.matchedLeads, 1) : 0;
        const rightRatio = right.ordered > 0 ? right.ordered / Math.max(right.matchedLeads, 1) : 0;
        if (leftRatio !== rightRatio) return leftRatio - rightRatio;
        return right.spend - left.spend;
      })[0];

  return { mostExpensive, mostOrders, weakest };
};

const buildContentSummary = (cockpit: ClosedLoopCockpitSummary) => {
  const totalAd = cockpit.contentNotes.reduce((sum, item) => sum + toNumber(item.adLeads), 0);
  const totalOrganic = cockpit.contentNotes.reduce((sum, item) => sum + toNumber(item.organicLeads), 0);
  const topNote = getTopContentNote(cockpit);
  const trafficBias =
    totalAd > totalOrganic
      ? "当前传播更偏广告拉动"
      : totalOrganic > totalAd
        ? "当前传播更偏自然扩散"
        : "当前传播的广告与自然线索占比接近";

  if (!topNote) {
    return `${trafficBias}，但还缺少足够的笔记级数据沉淀。`;
  }

  return `${trafficBias}。当前最强笔记是 ${topNote.note}，带来 ${topNote.xhsLeads} 条小红书线索、${topNote.matchedLeads} 条高置信打通、${topNote.ordered} 个闭环下单。`;
};

const buildPlanSummary = (cockpit: ClosedLoopCockpitSummary) => {
  const { mostExpensive, mostOrders, weakest } = getPlanStats(cockpit);

  if (!mostExpensive && !mostOrders && !weakest) {
    return "当前还没有足够的计划级数据，暂时无法判断投放效率。";
  }

  return [
    mostExpensive
      ? `花费最高的是 ${mostExpensive.plan}（${Math.round(mostExpensive.spend)} 元）`
      : "",
    mostOrders
      ? `闭环下单最多的是 ${mostOrders.plan}（${mostOrders.ordered} 单）`
      : "",
    weakest
      ? `优先复盘 ${weakest.plan}，当前花费 ${Math.round(weakest.spend)} 元但闭环结果偏弱`
      : "",
  ]
    .filter(Boolean)
    .join("；");
};

const buildJourneyMetrics = (snapshot: ClosedLoopAnalysisSnapshot): ClosedLoopJourneyMetric[] => {
  const funnel = snapshot.marketingInput.funnel;
  const leads = toNumber(funnel.leads.total);
  const privateDomain = toNumber(funnel.privateDomain.total);
  const highIntent = toNumber(funnel.highIntent.total);
  const deals = toNumber(funnel.deals.total);
  const pendingReview = snapshot.cockpit.review.pendingCount;

  const safeRate = (numerator: number, denominator: number) =>
    denominator > 0 ? numerator / denominator : 0;

  return [
    {
      label: "加微成功率",
      value: formatPercent(safeRate(privateDomain, leads)),
      hint: `${privateDomain}/${leads}`,
    },
    {
      label: "高意向率",
      value: formatPercent(safeRate(highIntent, privateDomain || leads)),
      hint: `${highIntent}/${privateDomain || leads}`,
    },
    {
      label: "下单率",
      value: formatPercent(safeRate(deals, leads)),
      hint: `${deals}/${leads}`,
    },
    {
      label: "待复核占比",
      value: formatPercent(safeRate(pendingReview, leads)),
      hint: `${pendingReview}/${leads}`,
    },
  ];
};

const buildJourneySummary = (snapshot: ClosedLoopAnalysisSnapshot) => {
  const weakestProduct = [...Object.values(snapshot.dashboard.products)]
    .sort((left, right) => {
      const leftRate = left.overallConversionRate ?? Infinity;
      const rightRate = right.overallConversionRate ?? Infinity;
      return leftRate - rightRate;
    })[0];

  if (!weakestProduct || weakestProduct.overallConversionRate === null) {
    return "当前旅程数据还不足以给出明确的转化结论。";
  }

  return `${weakestProduct.label} 当前整体成交率只有 ${formatPercent(
    weakestProduct.overallConversionRate,
  )}，需要优先盯住 ${snapshot.dashboard.diagnosis[weakestProduct.product].largestLossTitle}。`;
};

const buildResultSummary = (snapshot: ClosedLoopAnalysisSnapshot) => {
  const topNote = getTopContentNote(snapshot.cockpit);
  const highConfidenceOrders =
    snapshot.cockpit.cards.find((card) => card.key === "ordered")?.value ??
    snapshot.marketingInput.funnel.deals.total ??
    0;

  if (!topNote) {
    return `当前高置信下单 ${highConfidenceOrders} 个，但还缺少足够的内容归因样本。`;
  }

  return `当前高置信下单 ${highConfidenceOrders} 个，成交主要由 ${topNote.note} 这类内容带动，后续放大和复盘都应优先围绕这类笔记展开。`;
};

const buildManagerConclusions = (snapshot: ClosedLoopAnalysisSnapshot): ClosedLoopManagerConclusion[] => {
  const topNote = getTopContentNote(snapshot.cockpit);
  const { mostExpensive, weakest } = getPlanStats(snapshot.cockpit);
  const pendingCount = snapshot.cockpit.review.pendingCount;
  const unmatchedCount = snapshot.cockpit.review.unmatchedCount;
  const coverageRate = snapshot.cockpit.review.planCoverageRate;
  const topLostReason = snapshot.cockpit.reasons.notOrdered[0];

  return [
    {
      label: "当前最值得看的增长点",
      text: topNote
        ? `${topNote.note} 目前带来 ${topNote.ordered} 个闭环下单、${topNote.matchedLeads} 条高置信打通，最值得优先复盘。`
        : "当前还没有足够的内容数据沉淀，暂时不能判断最强增长点。",
    },
    {
      label: "当前最大的风险点",
      text:
        pendingCount > 0
          ? `还有 ${pendingCount} 条待复核、${unmatchedCount} 条未匹配，当前闭环结论仍会受低置信样本影响。`
          : mostExpensive && weakest
            ? `${weakest.plan} 花费 ${Math.round(weakest.spend)} 元但闭环结果偏弱，是当前最需要止损的计划。`
            : `计划归因覆盖率当前为 ${formatPercent(coverageRate)}，需要持续盯紧覆盖率变化。`,
    },
    {
      label: "当前最先要补的口径 / 复核项",
      text:
        pendingCount > 0
          ? "先把待复核样本处理干净，再看驾驶舱结论是否稳定。"
          : coverageRate < 0.8
            ? `先补计划归因覆盖率，目前只有 ${formatPercent(coverageRate)}，这会直接影响投放判断。`
            : topLostReason
              ? `先把“${topLostReason.label}”这类未下单原因定义和应对动作补齐，避免原因归因只停留在描述层。`
              : "当前关键口径已基本齐，优先继续沉淀高置信样本。",
    },
  ];
};

export const buildClosedLoopPresentationSummary = (
  snapshot: ClosedLoopAnalysisSnapshot,
): ClosedLoopPresentationSummary => ({
  insightStatus: buildInsightStatus(snapshot.insights),
  managerConclusions: buildManagerConclusions(snapshot),
  contentSummary: buildContentSummary(snapshot.cockpit),
  planSummary: buildPlanSummary(snapshot.cockpit),
  journeyMetrics: buildJourneyMetrics(snapshot),
  journeySummary: buildJourneySummary(snapshot),
  resultSummary: buildResultSummary(snapshot),
});
