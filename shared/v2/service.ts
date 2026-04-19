import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import { buildRecognizeInputResponse } from "../marketing-api.ts";
import { importClosedLoopWorkbook } from "../closed-loop/service.ts";
import { buildClosedLoopPresentationSummary } from "../closed-loop/presentation.ts";
import type { UploadedFileInfo } from "../http-contracts.ts";
import { buildV2CanonicalFacts } from "./canonical-facts.ts";
import { detectV2SourceForFile } from "./source-mapping.ts";
import {
  createUploadSessionRecord,
  getAlertConfigRecord,
  getSnapshotRecord,
  getUploadSessionRecord,
  listSnapshotRecords,
  saveAlertConfigRecord,
  saveAnalysisSessionRecord,
  saveSnapshotRecord,
  saveUploadSessionRecord,
} from "./store.ts";
import type {
  V2AlertConfig,
  V2AlertListResponse,
  V2AlertItem,
  V2AnalysisSessionRecord,
  V2AnalyzeResponse,
  V2BusinessLine,
  V2BuildSessionResponse,
  V2CanonicalFacts,
  V2DashboardCard,
  V2DashboardBusinessFilter,
  V2DashboardFilterMeta,
  V2DashboardFilters,
  V2DashboardMap,
  V2DashboardResponse,
  V2DashboardTable,
  V2DashboardTimeScope,
  V2DashboardType,
  V2DashboardView,
  V2ReclassifyResponse,
  V2SnapshotRecord,
  V2SourceType,
  V2UploadResponse,
  V2UploadFileRecord,
  V2UploadSessionRecord,
} from "./types.ts";
import { V2_DASHBOARD_TYPES, V2_SOURCE_TYPES } from "./types.ts";

type DashboardArtifact = {
  kind: "closed_loop" | "recognized" | "tabular";
  file: V2UploadFileRecord;
  sourceType: V2SourceType;
  closedLoop?:
    | Awaited<ReturnType<typeof importClosedLoopWorkbook>>
    | null;
  recognized?:
    | Awaited<ReturnType<typeof buildRecognizeInputResponse>>
    | null;
  tabularSummary?: {
    rowCount: number;
    columns: string[];
    rows: string[][];
  } | null;
};

const nowIso = () => new Date().toISOString();
const DAY_MS = 24 * 60 * 60 * 1000;
const DASHBOARD_DEFAULT_TIME_SCOPE: V2DashboardTimeScope = "current_snapshot";
const DASHBOARD_DEFAULT_BUSINESS_FILTER: V2DashboardBusinessFilter = "all";
const INVALID_SNAPSHOT_MESSAGE = "当前快照数据不完整，请重新生成分析会话。";

const DASHBOARD_FALLBACK_COPY: Record<
  V2DashboardType,
  { title: string; summary: string }
> = {
  overview: {
    title: "总览驾驶舱",
    summary: "当前快照暂时缺少总览摘要，系统先按空态返回。",
  },
  content: {
    title: "内容获客看板",
    summary: "当前快照暂时缺少内容摘要，系统先按空态返回。",
  },
  ads: {
    title: "投放效果看板",
    summary: "当前快照暂时缺少投放摘要，系统先按空态返回。",
  },
  sales: {
    title: "销售跟进看板",
    summary: "当前快照暂时缺少销售摘要，系统先按空态返回。",
  },
  super_subscription: {
    title: "超级订阅漏斗看板",
    summary: "当前快照暂时缺少超级订阅摘要，系统先按空态返回。",
  },
  flexible_subscription: {
    title: "灵活订阅漏斗看板",
    summary: "当前快照暂时缺少灵活订阅摘要，系统先按空态返回。",
  },
};

const formatNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  }
  return String(value);
};

const toneByStatus = (status: V2DashboardView["status"]) =>
  status === "ready" ? "positive" : status === "partial" ? "warning" : "neutral";

const makeCard = (
  label: string,
  value: unknown,
  hint: string,
  tone?: V2DashboardCard["tone"],
): V2DashboardCard => ({
  label,
  value: formatNumber(value),
  hint,
  tone,
});

const makeTable = (columns: string[], rows: string[][]): V2DashboardTable | undefined =>
  rows.length > 0 ? { columns, rows } : undefined;

const cloneDashboard = (dashboard: V2DashboardView): V2DashboardView =>
  JSON.parse(JSON.stringify(dashboard)) as V2DashboardView;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const isDashboardStatus = (value: unknown): value is V2DashboardView["status"] =>
  value === "ready" || value === "partial" || value === "missing";

const isTone = (value: unknown): value is V2DashboardCard["tone"] =>
  value === "neutral" ||
  value === "positive" ||
  value === "warning" ||
  value === "danger";

const normalizeDashboardTable = (value: unknown): V2DashboardTable | undefined => {
  if (!isRecord(value)) return undefined;
  const columns = Array.isArray(value.columns)
    ? value.columns.filter((item): item is string => typeof item === "string")
    : [];
  const rows = Array.isArray(value.rows)
    ? value.rows
        .filter((row): row is unknown[] => Array.isArray(row))
        .map((row) => row.map((cell) => String(cell ?? "")))
    : [];

  if (!columns.length || !rows.length) {
    return undefined;
  }

  return { columns, rows };
};

const normalizeDashboardView = (
  dashboardType: V2DashboardType,
  value: unknown,
): V2DashboardView => {
  const fallback = DASHBOARD_FALLBACK_COPY[dashboardType];
  const record = isRecord(value) ? value : {};

  return {
    type: dashboardType,
    title:
      typeof record.title === "string" && record.title.trim()
        ? record.title
        : fallback.title,
    summary:
      typeof record.summary === "string" && record.summary.trim()
        ? record.summary
        : fallback.summary,
    status: isDashboardStatus(record.status) ? record.status : "missing",
    cards: Array.isArray(record.cards)
      ? record.cards
          .filter((item): item is Record<string, unknown> => isRecord(item))
          .map((item) => ({
            label: typeof item.label === "string" ? item.label : "待补数据",
            value: typeof item.value === "string" ? item.value : "—",
            hint: typeof item.hint === "string" ? item.hint : fallback.summary,
            tone: isTone(item.tone) ? item.tone : undefined,
          }))
      : [],
    notices: toStringArray(record.notices),
    table: normalizeDashboardTable(record.table),
    agentContext: isRecord(record.agentContext) ? record.agentContext : {},
  };
};

const normalizeSourceCoverage = (
  value: unknown,
  confirmedFiles: V2SnapshotRecord["confirmedFiles"],
): V2SnapshotRecord["sourceCoverage"] => {
  const coverage = Object.fromEntries(
    V2_SOURCE_TYPES.map((sourceType) => [
      sourceType,
      {
        fileCount: 0,
        names: [] as string[],
      },
    ]),
  ) as V2SnapshotRecord["sourceCoverage"];

  if (confirmedFiles.length > 0) {
    for (const file of confirmedFiles) {
      const slot = coverage[file.sourceType];
      slot.fileCount += 1;
      if (!slot.names.includes(file.name)) {
        slot.names.push(file.name);
      }
    }

    return coverage;
  }

  if (isRecord(value)) {
    for (const sourceType of V2_SOURCE_TYPES) {
      const item = value[sourceType];
      if (!isRecord(item)) continue;
      coverage[sourceType] = {
        fileCount:
          typeof item.fileCount === "number" && Number.isFinite(item.fileCount)
            ? item.fileCount
            : 0,
        names: Array.isArray(item.names)
          ? item.names.filter((name): name is string => typeof name === "string")
          : [],
      };
    }
  }

  return coverage;
};

const normalizeCanonicalFacts = (value: unknown): V2CanonicalFacts => {
  const record = isRecord(value) ? value : {};
  const leads = Array.isArray(record.leads)
    ? (record.leads as V2CanonicalFacts["leads"])
    : [];
  const touchpoints = Array.isArray(record.touchpoints)
    ? (record.touchpoints as V2CanonicalFacts["touchpoints"])
    : [];
  const orders = Array.isArray(record.orders)
    ? (record.orders as V2CanonicalFacts["orders"])
    : [];

  return {
    leads,
    touchpoints,
    orders,
    summary: buildCanonicalFactsSummary(leads, touchpoints, orders),
  };
};

const normalizeSnapshotRecord = (snapshot: V2SnapshotRecord) => {
  const confirmedFiles = Array.isArray(snapshot.confirmedFiles)
    ? snapshot.confirmedFiles.filter(
        (
          item,
        ): item is V2SnapshotRecord["confirmedFiles"][number] =>
          Boolean(item) &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.sourceType === "string" &&
          V2_SOURCE_TYPES.includes(item.sourceType as V2SourceType),
      )
    : [];
  const normalizedCanonicalFacts = normalizeCanonicalFacts(snapshot.canonicalFacts);
  const normalizedDashboards = Object.fromEntries(
    V2_DASHBOARD_TYPES.map((dashboardType) => [
      dashboardType,
      normalizeDashboardView(dashboardType, snapshot.dashboards?.[dashboardType]),
    ]),
  ) as V2DashboardMap;
  const issues: string[] = [];

  if (!Array.isArray(snapshot.confirmedFiles) || confirmedFiles.length === 0) {
    issues.push("confirmedFiles 缺失");
  }

  return {
    snapshot: {
      ...snapshot,
      sourceCoverage: normalizeSourceCoverage(snapshot.sourceCoverage, confirmedFiles),
      confirmedFiles,
      legacyFiles: Array.isArray(snapshot.legacyFiles)
        ? snapshot.legacyFiles.filter((item): item is string => typeof item === "string")
        : [],
      canonicalFacts: normalizedCanonicalFacts,
      alerts: Array.isArray(snapshot.alerts)
        ? (snapshot.alerts as V2SnapshotRecord["alerts"])
        : [],
      agentContexts: isRecord(snapshot.agentContexts)
        ? (snapshot.agentContexts as V2SnapshotRecord["agentContexts"])
        : ({
            overview: {},
            content: {},
            ads: {},
            sales: {},
            super_subscription: {},
            flexible_subscription: {},
          } satisfies V2SnapshotRecord["agentContexts"]),
      dashboards: normalizedDashboards,
    },
    invalid: issues.length > 0,
  };
};

const createInvalidSnapshotError = () => {
  const error = new Error(INVALID_SNAPSHOT_MESSAGE) as Error & {
    statusCode?: number;
  };
  error.statusCode = 409;
  return error;
};

const createDashboardQueryError = (message: string) => {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = 400;
  return error;
};

const resolveEffectiveSourceType = (
  file: Pick<V2UploadFileRecord, "manualOverrideApplied" | "manualSourceType" | "sourceType">,
) => (file.manualOverrideApplied ? file.manualSourceType : file.sourceType);

const normalizeUploadInputFiles = (files: UploadedFileInfo[]) => {
  if (!Array.isArray(files) || files.length === 0) {
    throw createDashboardQueryError("至少上传一个文件。");
  }

  return files.map((file) => {
    const name = file.name?.trim() || "unnamed-file";
    const mimeType = file.mimeType?.trim() || "application/octet-stream";
    const data = String(file.data || "");
    const size = Buffer.from(data, "base64").byteLength;

    if (!data || size <= 0) {
      throw createDashboardQueryError(`文件 ${name} 为空，无法创建上传会话。`);
    }

    return {
      name,
      mimeType,
      size,
      data,
    };
  });
};

const validateTimeScope = (
  timeScope: string | undefined,
): V2DashboardTimeScope => {
  if (!timeScope) return DASHBOARD_DEFAULT_TIME_SCOPE;
  if (
    timeScope === "current_snapshot" ||
    timeScope === "last_7_days" ||
    timeScope === "current_cycle"
  ) {
    return timeScope;
  }
  throw createDashboardQueryError("timeScope 不合法。");
};

const validateBusinessFilter = (
  businessFilter: string | undefined,
): V2DashboardBusinessFilter => {
  if (!businessFilter) return DASHBOARD_DEFAULT_BUSINESS_FILTER;
  if (
    businessFilter === "all" ||
    businessFilter === "super" ||
    businessFilter === "flexible"
  ) {
    return businessFilter;
  }
  throw createDashboardQueryError("businessFilter 不合法。");
};

const resolveAppliedBusinessFilter = (
  dashboardType: V2DashboardType,
  requestedBusinessFilter: V2DashboardBusinessFilter,
) => {
  if (dashboardType === "super_subscription") {
    return {
      appliedBusinessFilter: "super" as const,
      businessFilterForced: requestedBusinessFilter !== "super",
      notes:
        requestedBusinessFilter !== "super"
          ? ["超级订阅看板固定使用 super 业务线过滤。"]
          : ([] as string[]),
    };
  }

  if (dashboardType === "flexible_subscription") {
    return {
      appliedBusinessFilter: "flexible" as const,
      businessFilterForced: requestedBusinessFilter !== "flexible",
      notes:
        requestedBusinessFilter !== "flexible"
          ? ["灵活订阅看板固定使用 flexible 业务线过滤。"]
          : ([] as string[]),
    };
  }

  return {
    appliedBusinessFilter: requestedBusinessFilter,
    businessFilterForced: false,
    notes: [] as string[],
  };
};

const supportsLast7Days = (dashboardType: V2DashboardType) =>
  dashboardType !== "content";

const toTimestamp = (value: string) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const toNumericValue = (value: string | undefined) => {
  if (!value || value === "—" || value === "[待补数据]") return null;
  const normalized = value.replace(/[%元台,]/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const upsertDashboardCard = (
  dashboard: V2DashboardView,
  label: string,
  value: unknown,
  hint: string,
  tone?: V2DashboardCard["tone"],
) => {
  const nextCard = makeCard(label, value, hint, tone);
  const index = dashboard.cards.findIndex((item) => item.label === label);
  if (index >= 0) {
    dashboard.cards[index] = nextCard;
    return;
  }
  dashboard.cards.unshift(nextCard);
};

const syncDashboardCardsWithCanonicalFacts = (
  dashboards: V2DashboardMap,
  canonicalFacts: V2CanonicalFacts,
) => {
  const all = canonicalFacts.summary.byBusinessLine.all;
  const superLine = canonicalFacts.summary.byBusinessLine.super;
  const flexibleLine = canonicalFacts.summary.byBusinessLine.flexible;

  upsertDashboardCard(
    dashboards.overview,
    "总线索",
    canonicalFacts.summary.totalLeads,
    "canonical facts 汇总后的总线索数",
    "neutral",
  );
  upsertDashboardCard(
    dashboards.overview,
    "总订单",
    canonicalFacts.summary.totalOrders,
    "canonical facts 汇总后的总订单数",
    "positive",
  );
  upsertDashboardCard(
    dashboards.overview,
    "精确匹配",
    canonicalFacts.summary.matching.exact,
    "手机号完全一致的打通数量",
    "positive",
  );
  upsertDashboardCard(
    dashboards.overview,
    "模糊匹配",
    canonicalFacts.summary.matching.fuzzy,
    "后8位 + 城市 + 时间窗口命中的打通数量",
    canonicalFacts.summary.matching.fuzzy > 0 ? "warning" : "neutral",
  );

  upsertDashboardCard(
    dashboards.content,
    "内容触点",
    canonicalFacts.touchpoints.filter((item) => item.touchpointType === "note").length,
    "已进入 canonical facts 的内容触点数",
    "neutral",
  );
  upsertDashboardCard(
    dashboards.content,
    "内容线索",
    canonicalFacts.summary.totalTrafficLeads,
    "由内容与线索表汇总出的流量线索",
    "neutral",
  );

  upsertDashboardCard(
    dashboards.ads,
    "投放触点",
    canonicalFacts.touchpoints.filter((item) => item.touchpointType === "ad_plan").length,
    "已进入 canonical facts 的投放计划触点数",
    "neutral",
  );
  upsertDashboardCard(
    dashboards.ads,
    "总消耗",
    canonicalFacts.summary.totalSpend,
    "canonical facts 汇总后的投放消耗",
    "positive",
  );

  upsertDashboardCard(
    dashboards.sales,
    "跟进线索",
    all.followupLeads,
    "进入销售跟进链的线索数",
    "neutral",
  );
  upsertDashboardCard(
    dashboards.sales,
    "精确匹配",
    canonicalFacts.summary.matching.exact,
    "完全命中的手机号打通",
    "positive",
  );
  upsertDashboardCard(
    dashboards.sales,
    "模糊匹配",
    canonicalFacts.summary.matching.fuzzy,
    "低置信但可追踪的手机号打通",
    canonicalFacts.summary.matching.fuzzy > 0 ? "warning" : "neutral",
  );
  upsertDashboardCard(
    dashboards.sales,
    "未匹配",
    canonicalFacts.summary.matching.unmatched,
    "还未打通到跟进线索的流量线索",
    canonicalFacts.summary.matching.unmatched > 0 ? "danger" : "neutral",
  );

  upsertDashboardCard(
    dashboards.super_subscription,
    "线索",
    superLine.leads,
    "超级订阅 canonical facts 线索数",
    "neutral",
  );
  upsertDashboardCard(
    dashboards.super_subscription,
    "订单",
    superLine.orders,
    "超级订阅 canonical facts 订单数",
    "positive",
  );

  upsertDashboardCard(
    dashboards.flexible_subscription,
    "线索",
    flexibleLine.leads,
    "灵活订阅 canonical facts 线索数",
    "neutral",
  );
  upsertDashboardCard(
    dashboards.flexible_subscription,
    "订单",
    flexibleLine.orders,
    "灵活订阅 canonical facts 订单数",
    "positive",
  );
};

const attachCanonicalContextToDashboards = (
  snapshotId: string,
  dashboards: V2DashboardMap,
  canonicalFacts: V2CanonicalFacts,
) => {
  Object.values(dashboards).forEach((dashboard) => {
    dashboard.agentContext = {
      snapshotId,
      canonicalFactsSummary: canonicalFacts.summary,
      matchingSummary: canonicalFacts.summary.matching,
      attributionSummary: canonicalFacts.summary.attribution,
      ...dashboard.agentContext,
    };
  });
};

const buildCanonicalFactsSummary = (
  leads: V2CanonicalFacts["leads"],
  touchpoints: V2CanonicalFacts["touchpoints"],
  orders: V2CanonicalFacts["orders"],
): V2CanonicalFacts["summary"] => {
  const matchingSummary = {
    exact: leads.filter(
      (lead) => lead.leadKind === "traffic" && lead.matchType === "exact",
    ).length,
    fuzzy: leads.filter(
      (lead) => lead.leadKind === "traffic" && lead.matchType === "fuzzy",
    ).length,
    unmatched: leads.filter(
      (lead) => lead.leadKind === "traffic" && lead.matchType === "unmatched",
    ).length,
    lowConfidence: leads.filter((lead) => lead.matchConfidence !== "high").length,
  };

  const attributionSummary = {
    creativeId:
      leads.filter((lead) => lead.attributionRule === "creative_id").length +
      touchpoints.filter((item) => item.attributionRule === "creative_id").length +
      orders.filter((item) => item.attributionRule === "creative_id").length,
    noteId:
      leads.filter((lead) => lead.attributionRule === "note_id").length +
      touchpoints.filter((item) => item.attributionRule === "note_id").length +
      orders.filter((item) => item.attributionRule === "note_id").length,
    channel:
      leads.filter((lead) => lead.attributionRule === "channel").length +
      touchpoints.filter((item) => item.attributionRule === "channel").length +
      orders.filter((item) => item.attributionRule === "channel").length,
    unknown:
      leads.filter((lead) => lead.attributionRule === "unknown").length +
      touchpoints.filter((item) => item.attributionRule === "unknown").length +
      orders.filter((item) => item.attributionRule === "unknown").length,
  };

  const buildBusinessSummary = (businessLine: V2BusinessLine | "all") => {
    const leadItems =
      businessLine === "all"
        ? leads
        : leads.filter((item) => item.businessLine === businessLine);
    const touchpointItems =
      businessLine === "all"
        ? touchpoints
        : touchpoints.filter((item) => item.businessLine === businessLine);
    const orderItems =
      businessLine === "all"
        ? orders
        : orders.filter((item) => item.businessLine === businessLine);

    return {
      leads: leadItems.length,
      trafficLeads: leadItems.filter((item) => item.leadKind === "traffic").length,
      followupLeads: leadItems.filter((item) => item.leadKind === "followup").length,
      touchpoints: touchpointItems.length,
      orders: orderItems.length,
      spend: touchpointItems.reduce((sum, item) => sum + item.spend, 0),
    };
  };

  return {
    totalLeads: leads.length,
    totalTrafficLeads: leads.filter((item) => item.leadKind === "traffic").length,
    totalFollowupLeads: leads.filter((item) => item.leadKind === "followup").length,
    totalTouchpoints: touchpoints.length,
    totalOrders: orders.length,
    totalSpend: touchpoints.reduce((sum, item) => sum + item.spend, 0),
    matching: matchingSummary,
    attribution: attributionSummary,
    byBusinessLine: {
      all: buildBusinessSummary("all"),
      super: buildBusinessSummary("super"),
      flexible: buildBusinessSummary("flexible"),
      unknown: buildBusinessSummary("unknown"),
    },
  };
};

const filterCanonicalFactsByBusinessLine = (
  canonicalFacts: V2CanonicalFacts,
  businessFilter: V2DashboardBusinessFilter,
): V2CanonicalFacts => {
  if (businessFilter === "all") {
    return canonicalFacts;
  }

  const leads = canonicalFacts.leads.filter(
    (item) => item.businessLine === businessFilter,
  );
  const touchpoints = canonicalFacts.touchpoints.filter(
    (item) => item.businessLine === businessFilter,
  );
  const orders = canonicalFacts.orders.filter(
    (item) => item.businessLine === businessFilter,
  );

  return {
    leads,
    touchpoints,
    orders,
    summary: buildCanonicalFactsSummary(leads, touchpoints, orders),
  };
};

const getDashboardRelevantDateCandidates = (
  canonicalFacts: V2CanonicalFacts,
  dashboardType: V2DashboardType,
) => {
  if (dashboardType === "overview") {
    return [
      ...canonicalFacts.leads.map((item) => item.leadDate),
      ...canonicalFacts.touchpoints.map((item) => item.eventDate),
      ...canonicalFacts.orders.map((item) => item.orderDate),
    ];
  }

  if (dashboardType === "ads") {
    return canonicalFacts.touchpoints.map((item) => item.eventDate);
  }

  if (dashboardType === "sales") {
    return [
      ...canonicalFacts.leads
        .filter((item) => item.leadKind === "followup")
        .map((item) => item.leadDate),
      ...canonicalFacts.orders.map((item) => item.orderDate),
    ];
  }

  if (
    dashboardType === "super_subscription" ||
    dashboardType === "flexible_subscription"
  ) {
    return [
      ...canonicalFacts.leads.map((item) => item.leadDate),
      ...canonicalFacts.touchpoints.map((item) => item.eventDate),
      ...canonicalFacts.orders.map((item) => item.orderDate),
    ];
  }

  return [];
};

const filterCanonicalFactsByTimeScope = (
  canonicalFacts: V2CanonicalFacts,
  dashboardType: V2DashboardType,
  requestedTimeScope: V2DashboardTimeScope,
) => {
  if (requestedTimeScope === "current_snapshot") {
    return {
      canonicalFacts,
      appliedTimeScope: "current_snapshot" as const,
      timeScopeFallbackApplied: false,
      notes: [] as string[],
    };
  }

  if (requestedTimeScope === "current_cycle") {
    return {
      canonicalFacts,
      appliedTimeScope: "current_cycle" as const,
      timeScopeFallbackApplied: false,
      notes: [] as string[],
    };
  }

  if (!supportsLast7Days(dashboardType)) {
    return {
      canonicalFacts,
      appliedTimeScope: "current_snapshot" as const,
      timeScopeFallbackApplied: true,
      notes: ["当前看板缺少最近 7 天的可裁剪数据，已回退为当前快照视角。"],
    };
  }

  const timestamps = getDashboardRelevantDateCandidates(canonicalFacts, dashboardType)
    .map(toTimestamp)
    .filter((value): value is number => value !== null);

  if (timestamps.length === 0) {
    return {
      canonicalFacts,
      appliedTimeScope: "current_snapshot" as const,
      timeScopeFallbackApplied: true,
      notes: ["当前看板缺少最近 7 天的可裁剪数据，已回退为当前快照视角。"],
    };
  }

  const end = Math.max(...timestamps);
  const start = end - 6 * DAY_MS;

  const leads = canonicalFacts.leads.filter((item) => {
    const ts = toTimestamp(item.leadDate);
    return ts !== null && ts >= start && ts <= end;
  });
  const touchpoints = canonicalFacts.touchpoints.filter((item) => {
    const ts = toTimestamp(item.eventDate);
    return ts !== null && ts >= start && ts <= end;
  });
  const orders = canonicalFacts.orders.filter((item) => {
    const ts = toTimestamp(item.orderDate);
    return ts !== null && ts >= start && ts <= end;
  });

  return {
    canonicalFacts: {
      leads,
      touchpoints,
      orders,
      summary: buildCanonicalFactsSummary(leads, touchpoints, orders),
    },
    appliedTimeScope: "last_7_days" as const,
    timeScopeFallbackApplied: false,
    notes: [] as string[],
  };
};

const readTargetCompletionCandidates = (artifacts: DashboardArtifact[]) => {
  const candidates: Array<{ label: string; rate: number }> = [];

  artifacts.forEach((artifact) => {
    if (artifact.kind === "closed_loop" && artifact.closedLoop) {
      const products = artifact.closedLoop.snapshot.dashboard.products;
      ([
        ["灵活订阅", products.flexible.targetCompletionRate],
        ["超级订阅", products.super.targetCompletionRate],
      ] as Array<[string, number | null]>).forEach(([label, rate]) => {
        if (typeof rate === "number" && Number.isFinite(rate)) {
          candidates.push({ label, rate });
        }
      });
    }

    if (artifact.kind === "recognized" && artifact.recognized) {
      const products = artifact.recognized.dashboardPreview.products;
      ([
        ["灵活订阅", products.flexible.targetCompletionRate],
        ["超级订阅", products.super.targetCompletionRate],
      ] as Array<[string, number | null]>).forEach(([label, rate]) => {
        if (typeof rate === "number" && Number.isFinite(rate)) {
          candidates.push({ label, rate });
        }
      });
    }
  });

  return candidates;
};

const readPreviousAndCurrentDealTotals = (
  artifacts: DashboardArtifact[],
  canonicalFacts: V2CanonicalFacts,
) => {
  const previousCandidates: number[] = [];
  const currentCandidates: number[] = [];

  artifacts.forEach((artifact) => {
    if (artifact.kind === "closed_loop" && artifact.closedLoop) {
      const previous = artifact.closedLoop.snapshot.marketingInput.previous.totalDeals;
      const current = artifact.closedLoop.snapshot.marketingInput.funnel.deals.total;
      if (typeof previous === "number" && Number.isFinite(previous)) {
        previousCandidates.push(previous);
      }
      if (typeof current === "number" && Number.isFinite(current)) {
        currentCandidates.push(current);
      }
    }

    if (artifact.kind === "recognized" && artifact.recognized) {
      const previous = artifact.recognized.recognizedInput.previous.totalDeals;
      const current = artifact.recognized.recognizedInput.funnel.deals.total;
      if (typeof previous === "number" && Number.isFinite(previous)) {
        previousCandidates.push(previous);
      }
      if (typeof current === "number" && Number.isFinite(current)) {
        currentCandidates.push(current);
      }
    }
  });

  const currentFromFacts = canonicalFacts.summary.totalOrders;

  return {
    previous:
      previousCandidates.find((value) => value > 0) ??
      null,
    current:
      currentFromFacts > 0
        ? currentFromFacts
        : currentCandidates.find((value) => value >= 0) ?? null,
  };
};

const readRowsFromFile = (file: V2UploadFileRecord) => {
  const workbook = XLSX.read(Buffer.from(file.data, "base64"), {
    type: "buffer",
    cellDates: true,
  });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils
    .sheet_to_json<unknown[]>(firstSheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    })
    .map((row) => row.map((cell) => String(cell ?? "").trim()))
    .filter((row) => row.some(Boolean));

  return rows;
};

const buildTabularSummary = (file: V2UploadFileRecord) => {
  try {
    const rows = readRowsFromFile(file);
    return {
      rowCount: Math.max(rows.length - 1, 0),
      columns: rows[0] || [],
      rows: rows.slice(1, 11),
    };
  } catch {
    return {
      rowCount: 0,
      columns: [],
      rows: [],
    };
  }
};

const buildSourceCoverage = (files: V2UploadFileRecord[]) => {
  const coverage = Object.fromEntries(
    [
      "video_performance",
      "ad_plan_spend",
      "xhs_lead_list",
      "daily_register",
      "super_subscription_followup",
      "flexible_subscription_followup",
      "order_source_check",
      "closed_loop_workbook",
    ].map((source) => [source, { fileCount: 0, names: [] as string[] }]),
  ) as Record<V2SourceType, { fileCount: number; names: string[] }>;

  files.forEach((file) => {
    const sourceType = resolveEffectiveSourceType(file);
    if (!sourceType) return;
    coverage[sourceType].fileCount += 1;
    coverage[sourceType].names.push(file.name);
  });

  return coverage;
};

const ENTRY_DASHBOARD_BY_SOURCE: Record<V2SourceType, V2DashboardType> = {
  closed_loop_workbook: "overview",
  daily_register: "overview",
  video_performance: "content",
  xhs_lead_list: "content",
  ad_plan_spend: "ads",
  order_source_check: "sales",
  super_subscription_followup: "super_subscription",
  flexible_subscription_followup: "flexible_subscription",
};

const ENTRY_DASHBOARD_LABEL: Record<V2DashboardType, string> = {
  overview: "总览驾驶舱",
  content: "内容获客看板",
  ads: "投放效果看板",
  sales: "销售跟进看板",
  super_subscription: "超级订阅漏斗看板",
  flexible_subscription: "灵活订阅漏斗看板",
};

const ENTRY_DASHBOARD_PRIORITY: V2DashboardType[] = [
  "overview",
  "sales",
  "super_subscription",
  "flexible_subscription",
  "ads",
  "content",
];

type V2EntryResolution = {
  v2Eligible: boolean;
  entryDashboard?: V2DashboardType;
  entryReason?: string;
};

const resolveV2EntryFromSources = (sourceTypes: V2SourceType[]): V2EntryResolution => {
  const activeSources = [...new Set(sourceTypes)];
  if (!activeSources.length) {
    return {
      v2Eligible: false,
    };
  }

  if (activeSources.includes("closed_loop_workbook")) {
    return {
      v2Eligible: true,
      entryDashboard: "overview",
      entryReason: "检测到闭环底座工作簿，优先进入总览驾驶舱查看整条闭环。",
    };
  }

  if (
    activeSources.includes("super_subscription_followup") &&
    activeSources.includes("flexible_subscription_followup")
  ) {
    return {
      v2Eligible: true,
      entryDashboard: "sales",
      entryReason:
        "同时识别到超级订阅和灵活订阅跟进表，优先进入销售跟进看板查看整体跟进漏斗。",
    };
  }

  const activeDashboards = [
    ...new Set(activeSources.map((sourceType) => ENTRY_DASHBOARD_BY_SOURCE[sourceType])),
  ];

  if (activeDashboards.length === 1) {
    return {
      v2Eligible: true,
      entryDashboard: activeDashboards[0],
      entryReason:
        activeSources.length === 1
          ? `检测到 ${activeSources[0]}，建议直接进入${ENTRY_DASHBOARD_LABEL[activeDashboards[0]]}。`
          : `当前识别到的 V2 文件都归到${ENTRY_DASHBOARD_LABEL[activeDashboards[0]]}，可以直接进入这张看板。`,
    };
  }

  if (
    activeDashboards.includes("sales") &&
    (activeDashboards.includes("super_subscription") ||
      activeDashboards.includes("flexible_subscription"))
  ) {
    return {
      v2Eligible: true,
      entryDashboard: "sales",
      entryReason:
        "当前文件同时覆盖跟进和订单核查链路，优先进入销售跟进看板查看整体转化情况。",
    };
  }

  const prioritizedDashboard = ENTRY_DASHBOARD_PRIORITY.find((dashboardType) =>
    activeDashboards.includes(dashboardType),
  );

  return prioritizedDashboard
    ? {
        v2Eligible: true,
        entryDashboard: prioritizedDashboard,
        entryReason: `当前识别到多个看板方向，按入口优先级先进入${ENTRY_DASHBOARD_LABEL[prioritizedDashboard]}。`,
      }
    : {
        v2Eligible: false,
      };
};

const resolveV2EntryFromUpload = (
  upload: Pick<V2UploadSessionRecord, "files">,
): V2EntryResolution =>
  resolveV2EntryFromSources(
    upload.files
      .filter((file) => file.v2Eligible && resolveEffectiveSourceType(file))
      .map((file) => resolveEffectiveSourceType(file) as V2SourceType),
  );

const resolveV2EntryFromConfirmedFiles = (
  files: V2SnapshotRecord["confirmedFiles"],
): V2EntryResolution =>
  resolveV2EntryFromSources(files.map((file) => file.sourceType));

const buildOverviewDashboard = (
  artifacts: DashboardArtifact[],
  coverage: Record<V2SourceType, { fileCount: number; names: string[] }>,
): V2DashboardView => {
  const closedLoop = artifacts.find((artifact) => artifact.kind === "closed_loop" && artifact.closedLoop);

  if (closedLoop?.closedLoop) {
    const snapshot = closedLoop.closedLoop.snapshot;
    const presentation = buildClosedLoopPresentationSummary(snapshot);
    return {
      type: "overview",
      title: "总览驾驶舱",
      summary: presentation.managerConclusions.map((item) => item.text).join(" "),
      status: "partial",
      cards: [
        ...(snapshot.cockpit.cards || []).slice(0, 4).map((card) =>
          makeCard(card.label, card.value, card.hint, "positive"),
        ),
        makeCard("待复核", snapshot.cockpit.review.pendingCount, "仍会影响经营判断", "warning"),
      ],
      notices: [
        "当前总览驾驶舱优先复用闭环快照数据。",
        "曝光层与注册层仍需等待 V2 专项数据源补齐后再升到完整五层漏斗。",
      ],
      table: makeTable(
        ["指标", "当前值"],
        [
          ["留资", formatNumber(snapshot.marketingInput.funnel.leads.total)],
          ["转私域", formatNumber(snapshot.marketingInput.funnel.privateDomain.total)],
          ["高意向", formatNumber(snapshot.marketingInput.funnel.highIntent.total)],
          ["成交", formatNumber(snapshot.marketingInput.funnel.deals.total)],
        ],
      ),
      agentContext: {
        time_range:
          snapshot.marketingInput.periodStart && snapshot.marketingInput.periodEnd
            ? `${snapshot.marketingInput.periodStart} 至 ${snapshot.marketingInput.periodEnd}`
            : "当前快照周期",
        business_type: "全部",
        impression: "[待补数据]",
        leads: formatNumber(snapshot.marketingInput.funnel.leads.total),
        register: "[待补数据]",
        follow_up: formatNumber(snapshot.marketingInput.funnel.privateDomain.total),
        conversion: formatNumber(snapshot.marketingInput.funnel.deals.total),
        conversion_rates: snapshot.dashboard.metricsTable,
        mom_changes: "[待补数据]",
        target_completion: snapshot.dashboard.metricsTable,
        alerts: [],
        channel_distribution: snapshot.cockpit.breakdowns.channels,
        ad_spend: formatNumber(snapshot.marketingInput.spend.total),
        cpl: "[待补数据]",
      },
    };
  }

  const sourceCards = Object.entries(coverage)
    .filter(([, value]) => value.fileCount > 0)
    .map(([source, value]) => makeCard(source, value.fileCount, value.names.join(" / "), "neutral"));

  return {
    type: "overview",
    title: "总览驾驶舱",
    summary: "当前还没有闭环底座工作簿，系统先按已上传数据展示 V2 会话覆盖情况。",
    status: sourceCards.length > 0 ? "partial" : "missing",
    cards: sourceCards.length
      ? sourceCards
      : [makeCard("暂无可用数据源", "0", "请先上传 V2 支持的数据文件。", "warning")],
    notices: [
      "当前总览以数据源覆盖情况为主。",
      "完整五层漏斗会在数据源齐全后自动升级。",
    ],
    agentContext: {
      time_range: "当前上传会话",
      business_type: "全部",
      impression: "[待补数据]",
      leads: "[待补数据]",
      register: "[待补数据]",
      follow_up: "[待补数据]",
      conversion: "[待补数据]",
      conversion_rates: "[待补数据]",
      mom_changes: "[待补数据]",
      target_completion: "[待补数据]",
      alerts: [],
      channel_distribution: coverage,
      ad_spend: "[待补数据]",
      cpl: "[待补数据]",
    },
  };
};

const buildRecognizedDashboard = (
  type: V2DashboardType,
  title: string,
  artifact: DashboardArtifact | undefined,
  fallbackNotice: string,
): V2DashboardView => {
  if (!artifact) {
    return {
      type,
      title,
      summary: fallbackNotice,
      status: "missing",
      cards: [makeCard("待补数据", "0", fallbackNotice, "warning")],
      notices: [fallbackNotice],
      agentContext: {},
    };
  }

  if (artifact.kind === "closed_loop" && artifact.closedLoop) {
    const snapshot = artifact.closedLoop.snapshot;
    if (type === "content") {
      return {
        type,
        title,
        summary: buildClosedLoopPresentationSummary(snapshot).contentSummary,
        status: "partial",
        cards: [
          makeCard("内容条目", snapshot.cockpit.contentNotes.length, "当前快照内容归因条目数", toneByStatus("partial")),
          makeCard("广告线索", snapshot.cockpit.contentNotes.reduce((sum, item) => sum + Number(item.adLeads || 0), 0), "广告带来的小红书线索", "neutral"),
          makeCard("自然线索", snapshot.cockpit.contentNotes.reduce((sum, item) => sum + Number(item.organicLeads || 0), 0), "自然扩散带来的线索", "neutral"),
        ],
        notices: ["当前内容获客看板优先复用闭环快照中的笔记级结果。"],
        table: makeTable(
          ["来源笔记", "线索", "高置信打通", "成交"],
          snapshot.cockpit.contentNotes.slice(0, 10).map((item) => [
            String(item.note || item.noteTitle || "未命名笔记"),
            formatNumber(item.xhsLeads),
            formatNumber(item.matchedLeads),
            formatNumber(item.ordered),
          ]),
        ),
        agentContext: {
          time_range: "当前快照周期",
          platform: "全部",
          total_content: snapshot.cockpit.contentNotes.length,
          total_impression: "[待补数据]",
          total_engagement: "[待补数据]",
          avg_engagement_rate: "[待补数据]",
          organic_leads: snapshot.cockpit.contentNotes.reduce((sum, item) => sum + Number(item.organicLeads || 0), 0),
          top5_content: snapshot.cockpit.contentNotes.slice(0, 5),
          zero_lead_content: snapshot.cockpit.contentNotes.filter((item) => Number(item.xhsLeads || 0) === 0).length,
          platform_distribution: "[待补数据]",
          content_type_distribution: "[待补数据]",
          recent_trend: snapshot.cockpit.daily.slice(-7),
        },
      };
    }

    if (type === "ads") {
      return {
        type,
        title,
        summary: buildClosedLoopPresentationSummary(snapshot).planSummary,
        status: "partial",
        cards: [
          makeCard("计划数", snapshot.cockpit.plans.length, "当前可读计划条目数", "neutral"),
          makeCard("总消耗", snapshot.cockpit.plans.reduce((sum, item) => sum + Number(item.spend || 0), 0), "来自闭环快照计划数据", "positive"),
          makeCard("闭环下单", snapshot.cockpit.plans.reduce((sum, item) => sum + Number(item.ordered || 0), 0), "计划归因成交数", "neutral"),
        ],
        notices: ["当前投放效果看板优先复用闭环快照里的计划归因。"],
        table: makeTable(
          ["计划", "消耗", "高置信打通", "下单"],
          snapshot.cockpit.plans.slice(0, 10).map((item) => [
            String(item.plan || "未命名计划"),
            formatNumber(item.spend),
            formatNumber(item.matchedLeads),
            formatNumber(item.ordered),
          ]),
        ),
        agentContext: {
          time_range: "当前快照周期",
          platform: "全部",
          total_spend: snapshot.cockpit.plans.reduce((sum, item) => sum + Number(item.spend || 0), 0),
          total_impression: "[待补数据]",
          total_click: snapshot.cockpit.plans.reduce((sum, item) => sum + Number(item.clicks || 0), 0),
          avg_ctr: "[待补数据]",
          avg_cpc: "[待补数据]",
          avg_cpl: "[待补数据]",
          total_plans: snapshot.cockpit.plans.length,
          high_eff_count: "[待补数据]",
          low_eff_count: "[待补数据]",
          top3_efficient: snapshot.cockpit.plans.slice(0, 3),
          top3_inefficient: snapshot.cockpit.plans.slice(-3),
          daily_spend_trend: snapshot.cockpit.daily.slice(-7),
          creative_comparison: "[待补数据]",
          anomaly_dates: [],
        },
      };
    }

    if (type === "sales") {
      return {
        type,
        title,
        summary: buildClosedLoopPresentationSummary(snapshot).journeySummary,
        status: "partial",
        cards: [
          makeCard("待复核", snapshot.cockpit.review.pendingCount, "仍需人工确认的样本", "warning"),
          makeCard("已确认", snapshot.cockpit.review.confirmedCount, "已经进入高置信闭环的样本", "positive"),
          makeCard("未匹配", snapshot.cockpit.review.unmatchedCount, "尚未打通来源的样本", "danger"),
        ],
        notices: ["当前销售跟进看板仍大量依赖闭环快照和主线索匹配质量。"],
        table: makeTable(
          ["维度", "值"],
          [
            ["线索", formatNumber(snapshot.marketingInput.funnel.leads.total)],
            ["转私域", formatNumber(snapshot.marketingInput.funnel.privateDomain.total)],
            ["高意向", formatNumber(snapshot.marketingInput.funnel.highIntent.total)],
            ["成交", formatNumber(snapshot.marketingInput.funnel.deals.total)],
          ],
        ),
        agentContext: {
          time_range: "当前快照周期",
          business_type: "全部",
          new_leads: formatNumber(snapshot.marketingInput.funnel.leads.total),
          wechat_rate: "[待补数据]",
          first_follow_rate: "[待补数据]",
          conversion_rate: "[待补数据]",
          avg_close_days: "[待补数据]",
          funnel_data: snapshot.marketingInput.funnel,
          sales_ranking: snapshot.cockpit.breakdowns.salesOwners,
          defeat_reasons: snapshot.cockpit.reasons,
          overdue_leads: snapshot.cockpit.review.pendingCount,
          city_data: snapshot.cockpit.breakdowns.cities,
          ai_call_data: "[待补数据]",
        },
      };
    }

    if (type === "super_subscription" || type === "flexible_subscription") {
      const productKey = type === "super_subscription" ? "super" : "flexible";
      const metrics = snapshot.dashboard.products[productKey];
      const funnel = snapshot.dashboard.funnels[productKey];
      return {
        type,
        title,
        summary: snapshot.dashboard.diagnosis[productKey].intuition,
        status: "partial",
        cards: [
          makeCard("线索", metrics.leads, `${metrics.label} 当前线索量`, "neutral"),
          makeCard("成交", metrics.deals, `${metrics.label} 当前成交量`, "positive"),
          makeCard("整体成交率", metrics.overallConversionRate === null ? "—" : `${Math.round(metrics.overallConversionRate * 1000) / 10}%`, "产品漏斗整体转化", "neutral"),
        ],
        notices: ["当前订阅看板优先复用现有产品级漏斗和 CPS 指标。"],
        table: makeTable(
          ["节点", "值"],
          funnel.stages.map((stage) => [stage.label, formatNumber(stage.value)]),
        ),
        agentContext: {
          time_range: "当前快照周期",
          cities: snapshot.cockpit.breakdowns.cities,
          car_models: metrics.label,
          duration: "[待补数据]",
          leads: formatNumber(metrics.leads),
          wechat: formatNumber(metrics.privateDomain),
          wechat_rate:
            metrics.leadToPrivateRate === null
              ? "[待补数据]"
              : `${Math.round(metrics.leadToPrivateRate * 1000) / 10}%`,
          small_order: "[待补数据]",
          small_order_rate: "[待补数据]",
          conversion: formatNumber(metrics.deals),
          conversion_rate:
            metrics.overallConversionRate === null
              ? "[待补数据]"
              : `${Math.round(metrics.overallConversionRate * 1000) / 10}%`,
          mom_changes: "[待补数据]",
          firefly_data: "[待补数据]",
          onvo_data: "[待补数据]",
          top5_leads_cities: snapshot.cockpit.breakdowns.cities,
          top5_conversion_cities: snapshot.cockpit.breakdowns.cities,
          "12m_ratio": "[待补数据]",
          "24m_ratio": "[待补数据]",
          channel_conversion: snapshot.cockpit.breakdowns.channels,
          defeat_reasons: snapshot.cockpit.reasons,
          channels: snapshot.cockpit.breakdowns.channels,
          ai_reach: "[待补数据]",
          ai_intent_rate: "[待补数据]",
          ai_conversion_rate: "[待补数据]",
          channel_distribution: snapshot.cockpit.breakdowns.channels,
          channel_conversion_comparison: snapshot.cockpit.breakdowns.channels,
          vs_super_subscription:
            type === "flexible_subscription"
              ? snapshot.dashboard.products.super
              : snapshot.dashboard.products.flexible,
          no_order_reasons: snapshot.cockpit.reasons.notOrdered,
        },
      };
    }
  }

  if (artifact.kind === "recognized" && artifact.recognized) {
    const dashboard = artifact.recognized.dashboardPreview;
    const metricsTable = dashboard.metricsTable.slice(0, 4).map((item) => [
      item.label,
      item.actual,
      item.status,
    ]);
    return {
      type,
      title,
      summary: `${artifact.file.name} 当前已能进入 ${title} 的预读状态。`,
      status: "partial",
      cards: [
        makeCard("综合评级", dashboard.overallRatingLabel, "当前识别结果生成的整体判断", "neutral"),
        makeCard("内容条数", dashboard.contentRanking.length, "当前可读内容条数", "neutral"),
        makeCard("预算建议", dashboard.budgetRecommendations.length, "当前可读预算建议数", "neutral"),
      ],
      notices: [
        "当前这张看板优先复用现有识别 + 预览结果。",
        "等 V2 专项数据源补齐后会再升级成完整六看板口径。",
      ],
      table: makeTable(["指标", "当前值", "状态"], metricsTable),
      agentContext: {
        time_range: "当前上传会话",
        platform: "全部",
        total_content: dashboard.contentRanking.length,
        total_impression: "[待补数据]",
        total_engagement: "[待补数据]",
        avg_engagement_rate: "[待补数据]",
        organic_leads: "[待补数据]",
        top5_content: dashboard.contentRanking.slice(0, 5),
        zero_lead_content: dashboard.contentRanking.filter((item) => (item.leads || 0) === 0).length,
        platform_distribution: "[待补数据]",
        content_type_distribution: "[待补数据]",
        recent_trend: "[待补数据]",
        dashboard_overall_rating: dashboard.overallRatingLabel,
        products: dashboard.products,
        funnels: dashboard.funnels,
        diagnosis: dashboard.diagnosis,
        contentRanking: dashboard.contentRanking,
        budgetRecommendations: dashboard.budgetRecommendations,
        actionPlan: dashboard.actionPlan,
      },
    };
  }

  if (artifact.kind === "tabular" && artifact.tabularSummary) {
    return {
      type,
      title,
      summary: `${artifact.file.name} 已进入 V2，但当前只完成基础表格摘要，详细指标还待专项建模。`,
      status: "partial",
      cards: [
        makeCard("数据行数", artifact.tabularSummary.rowCount, "当前表格识别到的有效行数", "neutral"),
        makeCard("字段数", artifact.tabularSummary.columns.length, "当前表格头字段数", "neutral"),
        makeCard("来源类型", artifact.sourceType, "当前 V2 数据源归类", "positive"),
      ],
      notices: ["当前这张看板先展示结构化摘要，后续会升级成完整业务指标。"],
      table: makeTable(artifact.tabularSummary.columns, artifact.tabularSummary.rows),
      agentContext: {
        time_range: "当前上传会话",
        source_type: artifact.sourceType,
        row_count: artifact.tabularSummary.rowCount,
        columns: artifact.tabularSummary.columns,
        sample_rows: artifact.tabularSummary.rows,
      },
    };
  }

  return {
    type,
    title,
    summary: fallbackNotice,
    status: "missing",
    cards: [makeCard("待补数据", "0", fallbackNotice, "warning")],
    notices: [fallbackNotice],
    agentContext: {},
  };
};

const buildAlerts = (
  config: V2AlertConfig,
  dashboards: V2DashboardMap,
  canonicalFacts: V2CanonicalFacts,
  artifacts: DashboardArtifact[],
): V2AlertItem[] => {
  const alerts: V2AlertItem[] = [];

  readTargetCompletionCandidates(artifacts)
    .filter((item) => item.rate < config.redTargetCompletionThreshold)
    .forEach((item) => {
      alerts.push({
        level: "red",
        title: `${item.label}目标完成率低于红线`,
        description: `${item.label} 当前目标完成率已低于 ${Math.round(
          config.redTargetCompletionThreshold * 100,
        )}%，需要立刻处理。`,
        metric: `${item.label}目标完成率`,
        currentValue: `${Math.round(item.rate * 1000) / 10}%`,
        threshold: `${Math.round(config.redTargetCompletionThreshold * 100)}%`,
      });
    });

  const momTotals = readPreviousAndCurrentDealTotals(artifacts, canonicalFacts);
  if (
    momTotals.previous !== null &&
    momTotals.previous > 0 &&
    momTotals.current !== null
  ) {
    const dropRate =
      (momTotals.previous - momTotals.current) / momTotals.previous;

    if (dropRate > config.yellowMomDropThreshold) {
      alerts.push({
        level: "yellow",
        title: "成交量环比下跌超过阈值",
        description: `当前成交量相对上期下跌超过 ${Math.round(
          config.yellowMomDropThreshold * 100,
        )}%，需要重点排查。`,
        metric: "成交量环比",
        currentValue: `-${Math.round(dropRate * 1000) / 10}%`,
        threshold: `>${Math.round(config.yellowMomDropThreshold * 100)}%`,
      });
    }
  }

  if (dashboards.overview.status === "missing") {
    alerts.push({
      level: "yellow",
      title: "总览驾驶舱数据不足",
      description: "当前还缺少足够的数据源来生成完整总览。",
      metric: "数据覆盖",
      currentValue: "不足",
      threshold: "需补充关键源",
    });
  }
  if (config.enabled && !config.feishuWebhook.trim()) {
    alerts.push({
      level: "yellow",
      title: "飞书预警未配置",
      description: "已打开预警功能，但还没有配置飞书 Webhook。",
      metric: "预警配置",
      currentValue: "未配置",
      threshold: "需要 Webhook",
    });
  }
  return alerts;
};

const setDashboardStatus = (
  dashboard: V2DashboardView,
  canonicalFacts: V2CanonicalFacts,
  dashboardType: V2DashboardType,
) => {
  const hasContent =
    dashboardType === "content"
      ? canonicalFacts.touchpoints.filter((item) => item.touchpointType === "note").length > 0 ||
        canonicalFacts.summary.totalTrafficLeads > 0
      : dashboardType === "ads"
        ? canonicalFacts.summary.totalTouchpoints > 0 || canonicalFacts.summary.totalSpend > 0
        : dashboardType === "sales"
          ? canonicalFacts.summary.totalFollowupLeads > 0 || canonicalFacts.summary.totalOrders > 0
          : canonicalFacts.summary.byBusinessLine[
              dashboardType === "super_subscription"
                ? "super"
                : dashboardType === "flexible_subscription"
                  ? "flexible"
                  : "all"
            ].leads > 0 ||
            canonicalFacts.summary.byBusinessLine[
              dashboardType === "super_subscription"
                ? "super"
                : dashboardType === "flexible_subscription"
                  ? "flexible"
                  : "all"
            ].orders > 0;

  dashboard.status = hasContent ? "partial" : "missing";
};

const buildFilteredDashboard = (
  snapshot: V2SnapshotRecord,
  dashboardType: V2DashboardType,
  filteredFacts: V2CanonicalFacts,
  appliedFilters: V2DashboardFilters,
  filterMeta: V2DashboardFilterMeta,
) => {
  const dashboard = cloneDashboard(
    normalizeDashboardView(dashboardType, snapshot.dashboards?.[dashboardType]),
  );

  if (filterMeta.notes.length > 0) {
    dashboard.notices = [...filterMeta.notes, ...dashboard.notices];
  }

  if (appliedFilters.businessFilter !== "all") {
    dashboard.summary = `${dashboard.summary} 当前按 ${
      appliedFilters.businessFilter === "super" ? "超级订阅" : "灵活订阅"
    } 业务线查看。`;
  }

  if (dashboardType === "overview") {
    dashboard.cards = [
      makeCard("总线索", filteredFacts.summary.totalLeads, "当前过滤条件下的总线索数", "neutral"),
      makeCard("总订单", filteredFacts.summary.totalOrders, "当前过滤条件下的总订单数", "positive"),
      makeCard("精确匹配", filteredFacts.summary.matching.exact, "当前过滤条件下的精确打通数", "positive"),
      makeCard("模糊匹配", filteredFacts.summary.matching.fuzzy, "当前过滤条件下的模糊打通数", filteredFacts.summary.matching.fuzzy > 0 ? "warning" : "neutral"),
    ];
    dashboard.table = makeTable(
      ["指标", "当前值"],
      [
        ["线索", formatNumber(filteredFacts.summary.totalLeads)],
        ["流量线索", formatNumber(filteredFacts.summary.totalTrafficLeads)],
        ["跟进线索", formatNumber(filteredFacts.summary.totalFollowupLeads)],
        ["订单", formatNumber(filteredFacts.summary.totalOrders)],
      ],
    );
  } else if (dashboardType === "content") {
    const contentTouchpoints = filteredFacts.touchpoints.filter(
      (item) => item.touchpointType === "note" || item.touchpointType === "video",
    );
    dashboard.cards = [
      makeCard("内容触点", contentTouchpoints.length, "当前过滤条件下的内容触点数", "neutral"),
      makeCard("内容线索", filteredFacts.summary.totalTrafficLeads, "当前过滤条件下的流量线索数", "neutral"),
      makeCard("内容订单", filteredFacts.summary.totalOrders, "当前过滤条件下关联订单数", "positive"),
    ];
    dashboard.table = makeTable(
      ["内容触点", "业务线", "线索", "订单"],
      contentTouchpoints.slice(0, 10).map((item) => [
        item.planName || item.noteId || item.id,
        item.businessLine,
        formatNumber(item.leads),
        formatNumber(item.orders),
      ]),
    );
  } else if (dashboardType === "ads") {
    const adTouchpoints = filteredFacts.touchpoints.filter(
      (item) => item.touchpointType !== "note" && item.touchpointType !== "video",
    );
    dashboard.cards = [
      makeCard("投放触点", adTouchpoints.length, "当前过滤条件下的投放触点数", "neutral"),
      makeCard("总消耗", filteredFacts.summary.totalSpend, "当前过滤条件下的投放消耗", "positive"),
      makeCard("关联订单", filteredFacts.summary.totalOrders, "当前过滤条件下的订单数", "neutral"),
    ];
    dashboard.table = makeTable(
      ["触点", "业务线", "消耗", "线索", "订单"],
      adTouchpoints.slice(0, 10).map((item) => [
        item.planName || item.id,
        item.businessLine,
        formatNumber(item.spend),
        formatNumber(item.leads),
        formatNumber(item.orders),
      ]),
    );
  } else if (dashboardType === "sales") {
    const salesLeads = filteredFacts.leads.filter((item) => item.leadKind === "followup");
    const salesRanking = Object.entries(
      salesLeads.reduce<Record<string, number>>((acc, item) => {
        const key = item.salesOwner || "未分配";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    ).slice(0, 10);
    dashboard.cards = [
      makeCard("跟进线索", filteredFacts.summary.totalFollowupLeads, "当前过滤条件下的跟进线索数", "neutral"),
      makeCard("精确匹配", filteredFacts.summary.matching.exact, "当前过滤条件下的精确打通数", "positive"),
      makeCard("未匹配", filteredFacts.summary.matching.unmatched, "当前过滤条件下的未匹配线索数", filteredFacts.summary.matching.unmatched > 0 ? "danger" : "neutral"),
    ];
    dashboard.table = makeTable(
      ["销售", "线索数"],
      salesRanking.map(([salesOwner, count]) => [salesOwner, formatNumber(count)]),
    );
  } else {
    dashboard.cards = [
      makeCard("线索", filteredFacts.summary.totalLeads, "当前业务线下的线索数", "neutral"),
      makeCard("订单", filteredFacts.summary.totalOrders, "当前业务线下的订单数", "positive"),
      makeCard("总消耗", filteredFacts.summary.totalSpend, "当前业务线下的消耗", "neutral"),
    ];
    dashboard.table = makeTable(
      ["归因渠道", "线索", "订单"],
      Object.entries(
        filteredFacts.leads.reduce<Record<string, { leads: number; orders: number }>>(
          (acc, item) => {
            const key = item.channel || "未知渠道";
            acc[key] ||= { leads: 0, orders: 0 };
            acc[key].leads += 1;
            return acc;
          },
          {},
        ),
      ).map(([channel, value]) => [
        channel,
        formatNumber(value.leads),
        formatNumber(
          filteredFacts.orders.filter((item) => item.orderSource === channel).length,
        ),
      ]),
    );
  }

  dashboard.agentContext = {
    ...dashboard.agentContext,
    appliedFilters,
    filterMeta,
    canonicalFactsSummary: filteredFacts.summary,
  };

  setDashboardStatus(dashboard, filteredFacts, dashboardType);
  if (dashboard.status === "missing") {
    dashboard.notices = [
      ...dashboard.notices,
      "当前过滤条件下没有足够数据，已按 missing 状态返回。",
    ];
  }

  return dashboard;
};

const buildArtifacts = async (files: V2UploadFileRecord[]): Promise<DashboardArtifact[]> => {
  const confirmedFiles = files.filter(
    (file) => file.v2Eligible && (file.manualSourceType || file.sourceType),
  );

  const artifacts: DashboardArtifact[] = [];

  for (const file of confirmedFiles) {
    const sourceType = (file.manualSourceType || file.sourceType)!;
    if (sourceType === "closed_loop_workbook") {
      const closedLoop = await importClosedLoopWorkbook({
        fileName: file.name,
        buffer: Buffer.from(file.data, "base64"),
      });
      artifacts.push({
        kind: "closed_loop",
        file,
        sourceType,
        closedLoop,
      });
      continue;
    }

    if (
      sourceType === "ad_plan_spend" ||
      sourceType === "xhs_lead_list" ||
      sourceType === "super_subscription_followup" ||
      sourceType === "flexible_subscription_followup"
    ) {
      const recognized = await buildRecognizeInputResponse({
        fileInfo: {
          name: file.name,
          mimeType: file.mimeType,
          data: file.data,
        },
      });
      artifacts.push({
        kind: "recognized",
        file,
        sourceType,
        recognized,
      });
      continue;
    }

    artifacts.push({
      kind: "tabular",
      file,
      sourceType,
      tabularSummary: buildTabularSummary(file),
    });
  }

  return artifacts;
};

export const uploadV2Files = async (files: UploadedFileInfo[]) =>
  createUploadSessionRecord(normalizeUploadInputFiles(files));

export const buildV2UploadResponse = (
  upload: V2UploadSessionRecord,
): V2UploadResponse => ({
  uploadId: upload.id,
  files: upload.files.map((file) => ({
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    status: file.status,
  })),
  upload,
});

export const analyzeV2UploadSession = async (uploadId: string) => {
  const upload = await getUploadSessionRecord(uploadId);
  if (!upload) {
    const error = new Error("未找到上传会话。") as Error & { statusCode?: number };
    error.statusCode = 404;
    throw error;
  }

  const nextFiles = await Promise.all(
    upload.files.map(async (file) => {
      const match = await detectV2SourceForFile({
        name: file.name,
        mimeType: file.mimeType,
        data: file.data,
      });
      if (file.manualOverrideApplied) {
        return {
          ...file,
          status: "confirmed" as const,
          legacySourceType: match.legacySourceType,
          sourceType: match.sourceType,
          confidence: match.confidence,
          candidates: match.candidates,
          lowConfidenceNotes: match.lowConfidenceNotes,
        };
      }
      return {
        ...file,
        status: "analyzed" as const,
        legacySourceType: match.legacySourceType,
        sourceType: match.sourceType,
        manualSourceType: file.manualSourceType,
        confidence: match.confidence,
        reason: match.reason,
        candidates: match.candidates,
        v2Eligible: match.v2Eligible,
        lowConfidenceNotes: match.lowConfidenceNotes,
      };
    }),
  );

  const nextUpload: V2UploadSessionRecord = {
    ...upload,
    status: "analyzed",
    files: nextFiles,
    updatedAt: nowIso(),
  };

  await saveUploadSessionRecord(nextUpload);
  return nextUpload;
};

export const buildV2AnalyzeResponse = (
  upload: V2UploadSessionRecord,
): V2AnalyzeResponse => {
  const entry = resolveV2EntryFromUpload(upload);

  return {
    uploadId: upload.id,
    v2Eligible: entry.v2Eligible,
    entryDashboard: entry.entryDashboard,
    entryReason: entry.entryReason,
    files: upload.files.map((file) => ({
      id: file.id,
      name: file.name,
      sourceType: resolveEffectiveSourceType(file),
      confidence: file.confidence,
      reason: file.reason,
      v2Eligible: file.v2Eligible,
      lowConfidenceNotes: file.lowConfidenceNotes,
      candidates: file.candidates,
    })),
    upload,
  };
};

export const reclassifyV2UploadFile = async (
  uploadId: string,
  fileId: string,
  sourceType: V2SourceType | null,
) => {
  const upload = await getUploadSessionRecord(uploadId);
  if (!upload) {
    const error = new Error("未找到上传会话。") as Error & { statusCode?: number };
    error.statusCode = 404;
    throw error;
  }

  if (sourceType !== null && !V2_SOURCE_TYPES.includes(sourceType)) {
    throw createDashboardQueryError("sourceType 不合法。");
  }

  const targetFile = upload.files.find((file) => file.id === fileId);
  if (!targetFile) {
    const error = new Error("未找到要修正的文件。") as Error & { statusCode?: number };
    error.statusCode = 404;
    throw error;
  }

  const nextFiles = upload.files.map((file) => {
    if (file.id !== fileId) return file;
    return {
      ...file,
      manualSourceType: sourceType,
      manualOverrideApplied: true,
      status: "confirmed" as const,
      v2Eligible: sourceType !== null,
      reason:
        sourceType === null
          ? `${file.reason} 当前已改为只保留在 Legacy。`
          : `${file.reason} 已人工确认进入 ${sourceType}。`,
    };
  });

  const nextUpload: V2UploadSessionRecord = {
    ...upload,
    files: nextFiles,
    updatedAt: nowIso(),
  };
  await saveUploadSessionRecord(nextUpload);
  return nextUpload;
};

export const buildV2ReclassifyResponse = (
  upload: V2UploadSessionRecord,
  fileId: string,
  sourceType: V2SourceType | null,
): V2ReclassifyResponse => ({
  uploadId: upload.id,
  fileId,
  sourceType,
  upload,
});

export const buildV2AnalysisSession = async (uploadId: string) => {
  const upload = await getUploadSessionRecord(uploadId);
  if (!upload) {
    const error = new Error("未找到上传会话。") as Error & { statusCode?: number };
    error.statusCode = 404;
    throw error;
  }

  const confirmedFiles = upload.files.filter(
    (file) => file.v2Eligible && resolveEffectiveSourceType(file),
  );
  if (!confirmedFiles.length) {
    const error = new Error(
      "当前上传内容还没有可进入 V2 六大看板的文件，请改用 Legacy 或先确认文件类型。",
    ) as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }

  const coverage = buildSourceCoverage(confirmedFiles);
  const artifacts = await buildArtifacts(confirmedFiles);
  const canonicalFacts = await buildV2CanonicalFacts(confirmedFiles);
  const dashboards: V2DashboardMap = {
    overview: buildOverviewDashboard(artifacts, coverage),
    content: buildRecognizedDashboard(
      "content",
      "内容获客看板",
      artifacts.find((item) =>
        item.sourceType === "xhs_lead_list" || item.sourceType === "closed_loop_workbook",
      ),
      "当前还缺少内容表现或线索明细数据。",
    ),
    ads: buildRecognizedDashboard(
      "ads",
      "投放效果看板",
      artifacts.find((item) =>
        item.sourceType === "ad_plan_spend" || item.sourceType === "closed_loop_workbook",
      ),
      "当前还缺少投放计划和消耗数据。",
    ),
    sales: buildRecognizedDashboard(
      "sales",
      "销售跟进看板",
      artifacts.find((item) =>
        item.sourceType === "super_subscription_followup" ||
        item.sourceType === "flexible_subscription_followup" ||
        item.sourceType === "closed_loop_workbook",
      ),
      "当前还缺少销售跟进表或闭环底座数据。",
    ),
    super_subscription: buildRecognizedDashboard(
      "super_subscription",
      "超级订阅漏斗看板",
      artifacts.find((item) =>
        item.sourceType === "super_subscription_followup" ||
        item.sourceType === "closed_loop_workbook",
      ),
      "当前还缺少超级订阅业务线数据。",
    ),
    flexible_subscription: buildRecognizedDashboard(
      "flexible_subscription",
      "灵活订阅漏斗看板",
      artifacts.find((item) =>
        item.sourceType === "flexible_subscription_followup" ||
        item.sourceType === "closed_loop_workbook",
      ),
      "当前还缺少灵活订阅业务线数据。",
    ),
  };
  syncDashboardCardsWithCanonicalFacts(dashboards, canonicalFacts);

  const session: V2AnalysisSessionRecord = {
    id: randomUUID(),
    uploadId,
    snapshotId: randomUUID(),
    createdAt: nowIso(),
  };
  attachCanonicalContextToDashboards(session.snapshotId, dashboards, canonicalFacts);

  const closedLoopArtifact = artifacts.find((item) => item.kind === "closed_loop" && item.closedLoop);
  const snapshot: V2SnapshotRecord = {
    id: session.snapshotId,
    sessionId: session.id,
    uploadId,
    createdAt: nowIso(),
    sourceCoverage: coverage,
    confirmedFiles: confirmedFiles.map((file) => ({
      id: file.id,
      name: file.name,
      sourceType: resolveEffectiveSourceType(file)!,
    })),
    legacyFiles: upload.files
      .filter((file) => !file.v2Eligible || !(file.manualSourceType || file.sourceType))
      .map((file) => file.name),
    canonicalFacts,
    alerts: buildAlerts(await getAlertConfigRecord(), dashboards, canonicalFacts, artifacts),
    agentContexts: {
      overview: dashboards.overview.agentContext,
      content: dashboards.content.agentContext,
      ads: dashboards.ads.agentContext,
      sales: dashboards.sales.agentContext,
      super_subscription: dashboards.super_subscription.agentContext,
      flexible_subscription: dashboards.flexible_subscription.agentContext,
    },
    dashboards,
    closedLoopImportJobId: closedLoopArtifact?.closedLoop?.job.id || null,
    closedLoopSnapshotId: closedLoopArtifact?.closedLoop?.snapshot.id || null,
  };

  await saveAnalysisSessionRecord(session);
  await saveSnapshotRecord(snapshot);
  const nextUpload: V2UploadSessionRecord = {
    ...upload,
    status: "built",
    updatedAt: nowIso(),
  };
  await saveUploadSessionRecord(nextUpload);

  return {
    upload: nextUpload,
    session,
    snapshot,
  };
};

export const buildV2BuildSessionResponse = (input: {
  upload: V2UploadSessionRecord;
  session: V2AnalysisSessionRecord;
  snapshot: V2SnapshotRecord;
}): V2BuildSessionResponse => {
  const entry = resolveV2EntryFromConfirmedFiles(input.snapshot.confirmedFiles);
  const entryDashboard = entry.entryDashboard || "overview";
  const entryReason =
    entry.entryReason ||
    `当前构建成功，默认进入${ENTRY_DASHBOARD_LABEL[entryDashboard]}。`;

  return {
    uploadId: input.upload.id,
    v2Eligible: entry.v2Eligible,
    entryDashboard,
    entryReason,
    sessionId: input.session.id,
    snapshotId: input.snapshot.id,
    v2Files: input.snapshot.confirmedFiles,
    legacyFiles: input.snapshot.legacyFiles,
    upload: input.upload,
    session: input.session,
    snapshot: input.snapshot,
  };
};

export const getV2Snapshot = async (snapshotId: string) => {
  const rawSnapshot = await getSnapshotRecord(snapshotId);
  if (!rawSnapshot) {
    const error = new Error("未找到 V2 快照。") as Error & { statusCode?: number };
    error.statusCode = 404;
    throw error;
  }
  const normalized = normalizeSnapshotRecord(rawSnapshot);
  if (normalized.invalid) {
    throw createInvalidSnapshotError();
  }
  return normalized.snapshot;
};

export const listV2Snapshots = async () =>
  (await listSnapshotRecords())
    .map(normalizeSnapshotRecord)
    .filter((item) => !item.invalid)
    .map((item) => item.snapshot);

export const getV2Alerts = async (
  snapshotId: string,
): Promise<V2AlertListResponse> => {
  const snapshot = await getV2Snapshot(snapshotId);
  return {
    snapshotId: snapshot.id,
    alerts: snapshot.alerts,
  };
};

export const getV2Dashboard = async (
  snapshotId: string,
  dashboardType: V2DashboardType,
  query: {
    timeScope?: string;
    businessFilter?: string;
  } = {},
): Promise<V2DashboardResponse> => {
  const snapshot = await getV2Snapshot(snapshotId);
  const requestedTimeScope = validateTimeScope(query.timeScope);
  const requestedBusinessFilter = validateBusinessFilter(query.businessFilter);
  const businessResolution = resolveAppliedBusinessFilter(
    dashboardType,
    requestedBusinessFilter,
  );
  const businessFilteredFacts = filterCanonicalFactsByBusinessLine(
    snapshot.canonicalFacts,
    businessResolution.appliedBusinessFilter,
  );
  const timeFilteredFacts = filterCanonicalFactsByTimeScope(
    businessFilteredFacts,
    dashboardType,
    requestedTimeScope,
  );

  const appliedFilters: V2DashboardFilters = {
    snapshotId: snapshot.id,
    timeScope: timeFilteredFacts.appliedTimeScope,
    businessFilter: businessResolution.appliedBusinessFilter,
  };

  const filterMeta: V2DashboardFilterMeta = {
    requestedTimeScope,
    requestedBusinessFilter,
    appliedTimeScope: timeFilteredFacts.appliedTimeScope,
    appliedBusinessFilter: businessResolution.appliedBusinessFilter,
    timeScopeFallbackApplied: timeFilteredFacts.timeScopeFallbackApplied,
    businessFilterForced: businessResolution.businessFilterForced,
    notes: [...businessResolution.notes, ...timeFilteredFacts.notes],
  };

  return {
    snapshot,
    dashboard: buildFilteredDashboard(
      snapshot,
      dashboardType,
      timeFilteredFacts.canonicalFacts,
      appliedFilters,
      filterMeta,
    ),
    appliedFilters,
    filterMeta,
  };
};

export const getV2AlertConfig = async () => getAlertConfigRecord();

export const updateV2AlertConfig = async (patch: Partial<V2AlertConfig>) =>
  await saveAlertConfigRecord(patch);
