import { randomUUID } from "node:crypto";
import type { Buffer } from "node:buffer";
import { createEmptyInsightResult, generateInsights } from "../ai-insight-engine.ts";
import {
  analyzeMarketingInput,
  buildTemplateCsv,
  type MarketingInput,
} from "../marketing-engine.ts";
import { buildClosedLoopMarketingInput } from "./marketing-input.ts";
import { parseClosedLoopWorkbook } from "./workbook.ts";
import {
  buildReviewQueueSummary,
  filterReviewQueue,
  getClosedLoopStore,
} from "./store.ts";
import {
  buildAiSyncedSummary,
  buildImportJobSummary,
  buildImportProgressSummary,
} from "./import-summary.ts";
import type {
  ClosedLoopAiStatus,
  ClosedLoopAnalysisSnapshot,
  ClosedLoopCockpitSummary,
  ClosedLoopImportBundle,
  ImportJobRecord,
  ReviewDecisionType,
  ReviewQueueFilters,
  ReviewQueueSummary,
  ReviewSearchCandidate,
  ReviewQueueItem,
} from "./types.ts";

const CLOSED_LOOP_AI_STALE_MS = 10 * 60 * 1000;
const CLOSED_LOOP_DATABASE_ERROR =
  "闭环分析模式未配置数据库，请联系管理员补充 DATABASE_URL。";

class ClosedLoopStorageUnavailableError extends Error {
  statusCode: number;

  constructor() {
    super(CLOSED_LOOP_DATABASE_ERROR);
    this.name = "ClosedLoopStorageUnavailableError";
    this.statusCode = 503;
  }
}

const hasClosedLoopDatabase = () =>
  Boolean(process.env.DATABASE_URL);

const isClosedLoopMemoryStoreAllowed = () =>
  process.env.NODE_ENV === "test";

const ensureClosedLoopStoreReady = async () => {
  if (!hasClosedLoopDatabase() && !isClosedLoopMemoryStoreAllowed()) {
    throw new ClosedLoopStorageUnavailableError();
  }

  const store = getClosedLoopStore();
  await store.ensureSchema();
  return store;
};

const toDisplayValue = (value: unknown, fallback: number | string) => {
  const parsed = Number(value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Number.isFinite(parsed)) return parsed;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
};

const isoToDate = (value: string | null) => (value ? new Date(value) : null);

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const sortDescByMetric = (items: Array<Record<string, unknown>>, key: string) =>
  [...items].sort((a, b) => (toNumber(b[key]) || 0) - (toNumber(a[key]) || 0));

const buildReasonBreakdown = (items: string[]) =>
  Object.entries(
    items.reduce<Record<string, number>>((acc, item) => {
      if (!item) return acc;
      acc[item] = (acc[item] || 0) + 1;
      return acc;
    }, {}),
  )
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

const buildDimensionBreakdown = <
  T extends Record<string, unknown>,
  U extends { leads: number } & Record<string, unknown>,
>(
  items: T[],
  key: keyof T,
  valueBuilder: (rows: T[]) => U,
) =>
  Object.entries(
    items.reduce<Record<string, T[]>>((acc, item) => {
      const groupKey = String(item[key] || "未标记");
      (acc[groupKey] ||= []).push(item);
      return acc;
    }, {}),
  )
    .map(([label, rows]): U & { label: string } => ({
      label,
      ...valueBuilder(rows),
    }))
    .sort((left, right) => right.leads - left.leads)
    .slice(0, 12);

const buildCockpit = (
  bundle: ClosedLoopImportBundle,
  snapshot: MarketingInput,
): ClosedLoopCockpitSummary => {
  const summary = bundle.importSummary;
  const noteTouchpoints = bundle.contentTouchpoints
    .filter((item) => item.touchpointType === "note")
    .map((item) => ({
      note: item.touchpointKey,
      xhsLeads: toNumber(item.metrics["XHS线索数"]) || 0,
      adLeads: toNumber(item.metrics["广告流量线索数"]) || 0,
      organicLeads: toNumber(item.metrics["自然流量线索数"]) || 0,
      matchedLeads: toNumber(item.metrics["高置信打通主线索数"]) || 0,
      addedWechat: toNumber(item.metrics["加微成功数"]) || 0,
      ordered: toNumber(item.metrics["下单数"]) || 0,
      matchRate: toNumber(item.metrics["高置信打通率"]) || 0,
      orderedRate: toNumber(item.metrics["下单率"]) || 0,
    }));
  const planTouchpoints = bundle.contentTouchpoints
    .filter((item) => item.touchpointType === "plan")
    .map((item) => ({
      plan: item.touchpointKey,
      spend: toNumber(item.metrics["消费"]) || 0,
      clicks: toNumber(item.metrics["点击量"]) || 0,
      clickRate: toNumber(item.metrics["点击率"]) || 0,
      privateLeads: toNumber(item.metrics["私信留资数"]) || 0,
      matchedLeads: toNumber(item.metrics["高置信打通主线索数"]) || 0,
      addedWechat: toNumber(item.metrics["加微成功数"]) || 0,
      ordered: toNumber(item.metrics["下单数"]) || 0,
      leadCost: toNumber(item.metrics["按打通主线索重算留资成本"]),
      acquireCost: toNumber(item.metrics["按打通下单重算获客成本"]),
    }));
  const dailyTouchpoints = bundle.contentTouchpoints
    .filter((item) => item.touchpointType === "daily")
    .map((item) => ({
      date: item.touchpointKey,
      spend: toNumber(item.metrics["投放消费"]) || 0,
      inquiries: toNumber(item.metrics["私信进线人数"]) || 0,
      opens: toNumber(item.metrics["私信开口人数"]) || 0,
      leads: toNumber(item.metrics["私信留资总人数"]) || 0,
      matchedLeads: toNumber(item.metrics["高置信打通主线索数"]) || 0,
      ordered: toNumber(item.metrics["下单数"]) || 0,
      matchRate: toNumber(item.metrics["高置信打通率"]) || 0,
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const pendingCount = bundle.leadLinks.filter((item) => item.reviewStatus === "pending").length;
  const unmatchedCount = bundle.leadLinks.filter((item) => item.reviewStatus === "unmatched").length;
  const confirmedCount = bundle.leadLinks.filter((item) => item.reviewStatus === "confirmed").length;
  const planCoverage = Number(summary["计划级可归因覆盖率"] || 0);
  const crmLeadMap = new Map(bundle.crmLeads.map((item) => [item.id, item]));
  const orderedLeadSet = new Set(bundle.orders.filter((item) => item.ordered).map((item) => item.crmLeadId));
  const matchedLeadIds = new Set(
    bundle.leadLinks
      .filter((item) => item.reviewStatus !== "unmatched" && item.crmLeadId)
      .map((item) => item.crmLeadId as string),
  );
  const matchedCrmLeads = bundle.crmLeads.filter((item) => matchedLeadIds.has(item.id));
  const enrichedMatchedLeads = matchedCrmLeads.map((lead) => ({
    ...lead,
    ordered: orderedLeadSet.has(lead.id),
  }));

  const breakdowns = {
    channels: buildDimensionBreakdown(enrichedMatchedLeads, "channel", (rows) => ({
      leads: rows.length,
      ordered: rows.filter((item) => item.ordered).length,
    })),
    salesOwners: buildDimensionBreakdown(enrichedMatchedLeads, "salesOwner", (rows) => ({
      leads: rows.length,
      ordered: rows.filter((item) => item.ordered).length,
    })),
    cities: buildDimensionBreakdown(enrichedMatchedLeads, "city", (rows) => ({
      leads: rows.length,
      ordered: rows.filter((item) => item.ordered).length,
    })),
    sourceTypes: buildDimensionBreakdown(enrichedMatchedLeads, "sourceType", (rows) => ({
      leads: rows.length,
      ordered: rows.filter((item) => item.ordered).length,
    })),
  };

  return {
    cards: [
      {
        key: "crmLeads",
        label: "主线索总量",
        value: toDisplayValue(summary["主线索总量"], snapshot.funnel.leads.total || 0),
        hint: "主线索池总记录",
      },
      {
        key: "xhsLeads",
        label: "小红书线索",
        value: toDisplayValue(summary["小红书线索总量"], bundle.xhsLeads.length),
        hint: "线索列表明细总量",
      },
      {
        key: "matchedLeads",
        label: "高置信打通",
        value: toDisplayValue(summary["高置信打通主线索"], 0),
        hint: "已进入闭环归因的线索",
      },
      {
        key: "ordered",
        label: "高置信下单",
        value: toDisplayValue(summary["高置信下单"], bundle.orders.filter((item) => item.ordered).length),
        hint: "闭环内已确认成交",
      },
    ],
    review: {
      pendingCount,
      confirmedCount,
      unmatchedCount,
      planCoverageRate: planCoverage,
    },
    contentNotes: sortDescByMetric(noteTouchpoints, "xhsLeads").slice(0, 12),
    plans: sortDescByMetric(planTouchpoints, "spend").slice(0, 12),
    daily: dailyTouchpoints.slice(-14),
    reasons: {
      notOrdered: buildReasonBreakdown(bundle.leadJourneys.map((item) => item.notOrderedReason)),
      lost: buildReasonBreakdown(bundle.leadJourneys.map((item) => item.lossReason)),
    },
    breakdowns,
  };
};

const buildClosedLoopSnapshot = (
  importJobId: string,
  bundle: ClosedLoopImportBundle,
  version: number,
  aiStatus: ClosedLoopAiStatus = "pending",
  aiError: string | null = null,
): ClosedLoopAnalysisSnapshot => {
  const marketingInput = buildClosedLoopMarketingInput(bundle);
  const result = analyzeMarketingInput(marketingInput);

  return {
    id: randomUUID(),
    importJobId,
    version,
    generatedAt: new Date().toISOString(),
    marketingInput: result.normalizedInput,
    dashboard: result.dashboard,
    analysis: result.fallbackReport,
    insights: createEmptyInsightResult(),
    aiStatus,
    aiUpdatedAt: null,
    aiError,
    cockpit: buildCockpit(bundle, result.normalizedInput),
  };
};

const refreshClosedLoopSnapshotAi = async (importJobId: string) => {
  const store = await ensureClosedLoopStoreReady();
  const staleBeforeIso = new Date(Date.now() - CLOSED_LOOP_AI_STALE_MS).toISOString();
  const claimed = await store.claimAiRefreshLock(importJobId, staleBeforeIso);

  if (!claimed) {
    return;
  }

  const snapshot = await store.getSnapshot(importJobId);
  if (!snapshot) {
    return;
  }

  try {
    const insights = await generateInsights(snapshot.dashboard, snapshot.marketingInput, {
      requestId: `closed-loop-${importJobId}`,
      timeoutMs: 12_000,
    } as Parameters<typeof generateInsights>[2]);

    const nextSnapshot: ClosedLoopAnalysisSnapshot = {
      ...snapshot,
      insights,
      aiStatus: "ready",
      aiUpdatedAt: new Date().toISOString(),
      aiError: null,
    };

    await store.saveSnapshot(importJobId, nextSnapshot);
    const job = await store.getImportJob(importJobId);
    await store.updateImportJob(importJobId, {
      currentSnapshotId: nextSnapshot.id,
      aiStatus: "ready",
      aiFinishedAt: nextSnapshot.aiUpdatedAt,
      aiError: null,
      summary: buildAiSyncedSummary({
        summary: job?.summary || {},
        snapshot: nextSnapshot,
        status: job?.status,
      }),
    });
  } catch (error: any) {
    console.error("closed loop insight generation failed:", error);
    const nextSnapshot: ClosedLoopAnalysisSnapshot = {
      ...snapshot,
      insights: createEmptyInsightResult(),
      aiStatus: "degraded",
      aiUpdatedAt: new Date().toISOString(),
      aiError: error?.message || "闭环 AI 洞察补充失败",
    };

    await store.saveSnapshot(importJobId, nextSnapshot);
    const job = await store.getImportJob(importJobId);
    await store.updateImportJob(importJobId, {
      currentSnapshotId: nextSnapshot.id,
      aiStatus: "degraded",
      aiFinishedAt: nextSnapshot.aiUpdatedAt,
      aiError: nextSnapshot.aiError,
      summary: buildAiSyncedSummary({
        summary: job?.summary || {},
        snapshot: nextSnapshot,
        status: job?.status,
      }),
    });
  }
};

export const importClosedLoopWorkbook = async (input: {
  fileName: string;
  buffer: Buffer;
}) => {
  const store = await ensureClosedLoopStoreReady();
  const job = await store.createImportJob({
    fileName: input.fileName,
    sourceType: "closed_loop_workbook",
    summary: buildImportProgressSummary({
      fileName: input.fileName,
      status: "queued",
      aiStatus: "pending",
    }),
  });
  let bundle: ClosedLoopImportBundle | null = null;
  let snapshot: ClosedLoopAnalysisSnapshot | null = null;

  try {
    await store.updateImportJob(job.id, {
      status: "parsing",
      summary: buildImportProgressSummary({
        fileName: input.fileName,
        status: "parsing",
        aiStatus: "pending",
      }, job.summary),
      errorMessage: null,
    });
    bundle = parseClosedLoopWorkbook(input.buffer, job.id);
    await store.saveImportBundle(job.id, bundle);
    const reviewQueue = await store.listReviewQueue(job.id);
    snapshot = buildClosedLoopSnapshot(job.id, bundle, 1, "pending");
    await store.saveSnapshot(job.id, snapshot);
    await store.updateImportJob(job.id, {
      status: reviewQueue.length > 0 ? "review_required" : "ready",
      currentSnapshotId: snapshot.id,
      aiStatus: "pending",
      aiStartedAt: null,
      aiFinishedAt: null,
      aiError: null,
      summary: buildImportJobSummary({
        fileName: input.fileName,
        status: reviewQueue.length > 0 ? "review_required" : "ready",
        bundle,
        reviewQueue,
        snapshot,
      }),
      errorMessage: null,
    });
    void refreshClosedLoopSnapshotAi(job.id);

    return {
      job: (await store.getImportJob(job.id))!,
      reviewQueue,
      snapshot,
    };
  } catch (error: any) {
    await store.updateImportJob(job.id, {
      status: "failed",
      errorMessage: error?.message || "闭环底座导入失败",
      summary: buildImportProgressSummary(
        {
          fileName: input.fileName,
          status: "failed",
          aiStatus: snapshot?.aiStatus || "pending",
          currentSnapshotId: snapshot?.id || null,
          currentSnapshotVersion: snapshot?.version || null,
          lastError: error?.message || "闭环底座导入失败",
          workbookSheetCount: bundle?.parserMeta?.workbookSheetCount ?? null,
          parsedSheetCount: bundle?.parserMeta?.parsedSheetCount ?? null,
          parsedRowCount: bundle?.parserMeta?.parsedRowCount ?? null,
        },
        bundle?.importSummary || job.summary,
      ),
    });
    throw error;
  }
};

export const listClosedLoopJobs = async () => {
  const store = await ensureClosedLoopStoreReady();
  return store.listImportJobs();
};

export const getClosedLoopSnapshot = async (importJobId: string) => {
  const store = await ensureClosedLoopStoreReady();
  const snapshot = await store.getSnapshot(importJobId);
  if (!snapshot) {
    throw new Error("未找到该导入任务的分析快照。");
  }
  const job = await store.getImportJob(importJobId);
  if (job && (job.aiStatus === "pending" || job.aiStatus === "degraded")) {
    void refreshClosedLoopSnapshotAi(importJobId);
  }
  return snapshot;
};

export const getClosedLoopReviewQueue = async (importJobId: string) => {
  const store = await ensureClosedLoopStoreReady();
  return store.listReviewQueue(importJobId);
};

export const getClosedLoopReviewWorkspaceData = async (
  importJobId: string,
  filters: ReviewQueueFilters = {},
): Promise<{ reviewQueue: ReviewQueueItem[]; summary: ReviewQueueSummary }> => {
  const store = await ensureClosedLoopStoreReady();
  const reviewQueue = await store.listReviewQueue(importJobId);
  const filteredQueue = filterReviewQueue(reviewQueue, filters);
  return {
    reviewQueue: filteredQueue,
    summary: buildReviewQueueSummary(reviewQueue),
  };
};

export const searchClosedLoopReviewCandidates = async (
  importJobId: string,
  query: string,
): Promise<ReviewSearchCandidate[]> => {
  const store = await ensureClosedLoopStoreReady();
  return store.searchReviewCandidates(importJobId, query);
};

export const applyClosedLoopReviewDecision = async (input: {
  importJobId: string;
  xhsLeadId: string;
  decisionType: ReviewDecisionType;
  actor?: string;
  note?: string;
  nextCrmLeadId?: string | null;
}) => {
  const store = await ensureClosedLoopStoreReady();
  await store.applyReviewDecision({
    ...input,
    actor: input.actor || "产品内复核",
  });

  const bundle = await store.getImportBundle(input.importJobId);
  if (!bundle) {
    throw new Error("未找到导入任务数据。");
  }

  const currentSnapshot = await store.getSnapshot(input.importJobId);
  const nextVersion = (currentSnapshot?.version || 0) + 1;
  const job = await store.getImportJob(input.importJobId);
  const snapshot = buildClosedLoopSnapshot(input.importJobId, {
    importSummary: bundle.importSummary,
    contentTouchpoints: bundle.contentTouchpoints,
    xhsLeads: bundle.xhsLeads,
    crmLeads: bundle.crmLeads,
    leadJourneys: bundle.leadJourneys,
    orders: bundle.orders,
    leadLinks: bundle.leadLinks,
  }, nextVersion, "pending");
  await store.saveSnapshot(input.importJobId, snapshot);

  const reviewQueue = await store.listReviewQueue(input.importJobId);
  await store.updateImportJob(input.importJobId, {
    status: reviewQueue.length > 0 ? "review_required" : "ready",
    currentSnapshotId: snapshot.id,
    aiStatus: "pending",
    aiStartedAt: null,
    aiFinishedAt: null,
    aiError: null,
    summary: buildImportProgressSummary(
      {
        fileName: job?.fileName || "",
        status: reviewQueue.length > 0 ? "review_required" : "ready",
        aiStatus: "pending",
        currentSnapshotId: snapshot.id,
        currentSnapshotVersion: snapshot.version,
        highConfidenceMatchedCount: bundle.leadLinks.filter(
          (item) =>
            item.reviewStatus === "confirmed" &&
            item.confidence === "high" &&
            Boolean(item.crmLeadId),
        ).length,
        reviewQueueCount: reviewQueue.length,
      },
      buildAiSyncedSummary({
        summary: job?.summary || {},
        snapshot,
        status: reviewQueue.length > 0 ? "review_required" : "ready",
        reviewQueueCount: reviewQueue.length,
      }),
    ),
  });
  void refreshClosedLoopSnapshotAi(input.importJobId);

  return {
    reviewQueue,
    snapshot,
    job: await store.getImportJob(input.importJobId),
  };
};
