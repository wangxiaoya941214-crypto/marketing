import {
  createEmptyInput,
  mergeMarketingInput,
  type MarketingContentInput,
  type MarketingInput,
} from "../marketing-engine.ts";
import type { ClosedLoopImportBundle } from "./types.ts";

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isoToDate = (value: string | null) => (value ? new Date(value) : null);

const buildContentItems = (bundle: ClosedLoopImportBundle): MarketingContentInput[] => {
  const noteTouchpoints = bundle.contentTouchpoints.filter(
    (item) => item.touchpointType === "note",
  );
  const leadLinks = bundle.leadLinks.filter(
    (item) => item.reviewStatus !== "unmatched" && item.crmLeadId,
  );
  const leadJourneyMap = new Map(
    bundle.leadJourneys.map((item) => [item.crmLeadId, item]),
  );
  const orderedLeadSet = new Set(
    bundle.orders.filter((item) => item.ordered).map((item) => item.crmLeadId),
  );

  return noteTouchpoints.map((touchpoint, index) => {
    const noteLinks = leadLinks.filter(
      (item) => item.noteTitle === touchpoint.touchpointKey,
    );
    const uniqueLeadIds = [
      ...new Set(noteLinks.map((item) => item.crmLeadId).filter(Boolean)),
    ] as string[];
    const highIntent = uniqueLeadIds.filter(
      (leadId) => leadJourneyMap.get(leadId)?.highIntent,
    ).length;
    const deals = uniqueLeadIds.filter((leadId) => orderedLeadSet.has(leadId)).length;
    return {
      id: `closed-loop-note-${index + 1}`,
      name: touchpoint.touchpointKey,
      link: touchpoint.noteId
        ? `https://www.xiaohongshu.com/explore/${touchpoint.noteId}`
        : "",
      product: touchpoint.productType === "unknown" ? "" : touchpoint.productType,
      board: "小红书内容",
      views: null,
      intentComments: null,
      privateMessages: toNumber(touchpoint.metrics["XHS线索数"]),
      leads:
        toNumber(touchpoint.metrics["高置信打通主线索数"]) ?? uniqueLeadIds.length,
      spend: null,
      highIntent,
      deals,
      creativeSummary: `广告流量 ${
        toNumber(touchpoint.metrics["广告流量线索数"]) ?? 0
      } / 自然流量 ${toNumber(touchpoint.metrics["自然流量线索数"]) ?? 0}`,
    };
  });
};

export const buildClosedLoopMarketingInput = (
  bundle: ClosedLoopImportBundle,
): MarketingInput => {
  const next = createEmptyInput();
  const crmLeads = bundle.crmLeads;
  const leadJourneys = bundle.leadJourneys;
  const orderedLeadIds = new Set(
    bundle.orders.filter((item) => item.ordered).map((item) => item.crmLeadId),
  );
  const planTouchpoints = bundle.contentTouchpoints.filter(
    (item) => item.touchpointType === "plan",
  );
  const summary = bundle.importSummary;

  const productCount = (predicate: (leadId: string, businessType: string) => boolean) => {
    let flexible = 0;
    let superCount = 0;
    crmLeads.forEach((lead) => {
      if (!predicate(lead.id, lead.businessType)) return;
      if (lead.businessType === "flexible") flexible += 1;
      if (lead.businessType === "super") superCount += 1;
    });
    return { flexible, super: superCount };
  };

  const addedWechatSet = new Set(
    leadJourneys.filter((item) => item.addedWechat).map((item) => item.crmLeadId),
  );
  const highIntentSet = new Set(
    leadJourneys.filter((item) => item.highIntent).map((item) => item.crmLeadId),
  );

  const totalLeads = crmLeads.length;
  const totalPrivate = addedWechatSet.size;
  const totalHighIntent = highIntentSet.size;
  const totalDeals = orderedLeadIds.size;

  const leadSplit = productCount(() => true);
  const privateSplit = productCount((leadId) => addedWechatSet.has(leadId));
  const highIntentSplit = productCount((leadId) => highIntentSet.has(leadId));
  const dealsSplit = productCount((leadId) => orderedLeadIds.has(leadId));

  const spend = planTouchpoints.reduce(
    (acc, item) => {
      const amount = toNumber(item.metrics["消费"]) || 0;
      if (item.productType === "flexible") acc.flexible += amount;
      else if (item.productType === "super") acc.super += amount;
      else acc.brand += amount;
      return acc;
    },
    { flexible: 0, super: 0, brand: 0 },
  );

  const contents = buildContentItems(bundle);
  const anomalyNotes = [
    `当前闭环底座已导入，主线索 ${summary["主线索总量"] || crmLeads.length} 条，小红书线索 ${summary["小红书线索总量"] || bundle.xhsLeads.length} 条。`,
    `高置信打通 ${summary["高置信打通主线索"] || 0} 条，低置信待核查 ${summary["低置信待核查"] || 0} 条。`,
    `计划归因覆盖率 ${Math.round(
      (Number(summary["计划级可归因覆盖率"] || 0) * 10000),
    ) / 100}% 。`,
  ]
    .filter(Boolean)
    .join("\n");

  return mergeMarketingInput(next, {
    periodStart:
      crmLeads
        .map((item) => isoToDate(item.leadDate))
        .filter((item): item is Date => Boolean(item))
        .sort((a, b) => a.getTime() - b.getTime())[0]
        ?.toISOString()
        .slice(0, 10) || "",
    periodEnd:
      crmLeads
        .map((item) => isoToDate(item.leadDate))
        .filter((item): item is Date => Boolean(item))
        .sort((a, b) => b.getTime() - a.getTime())[0]
        ?.toISOString()
        .slice(0, 10) || "",
    spend: {
      flexible: spend.flexible || null,
      super: spend.super || null,
      brand: spend.brand || null,
      total: spend.flexible + spend.super + spend.brand || null,
    },
    funnel: {
      leads: {
        total: totalLeads || null,
        flexible: leadSplit.flexible || null,
        super: leadSplit.super || null,
      },
      privateDomain: {
        total: totalPrivate || null,
        flexible: privateSplit.flexible || null,
        super: privateSplit.super || null,
      },
      highIntent: {
        total: totalHighIntent || null,
        flexible: highIntentSplit.flexible || null,
        super: highIntentSplit.super || null,
      },
      deals: {
        total: totalDeals || null,
        flexible: dealsSplit.flexible || null,
        super: dealsSplit.super || null,
      },
    },
    contents,
    anomalyNotes,
    rawInput: `闭环底座导入：主线索 ${crmLeads.length} / 小红书线索 ${bundle.xhsLeads.length} / 计划 ${planTouchpoints.length}`,
  });
};
