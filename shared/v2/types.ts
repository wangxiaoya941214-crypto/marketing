import type { SourceType as LegacySourceType } from "../routing/types.ts";

export const V2_SOURCE_TYPES = [
  "video_performance",
  "ad_plan_spend",
  "xhs_lead_list",
  "daily_register",
  "super_subscription_followup",
  "flexible_subscription_followup",
  "order_source_check",
  "closed_loop_workbook",
] as const;

export type V2SourceType = (typeof V2_SOURCE_TYPES)[number];

export const V2_DASHBOARD_TYPES = [
  "overview",
  "content",
  "ads",
  "sales",
  "super_subscription",
  "flexible_subscription",
] as const;

export type V2DashboardType = (typeof V2_DASHBOARD_TYPES)[number];

export type V2Tone = "neutral" | "positive" | "warning" | "danger";
export type V2Confidence = "high" | "medium" | "low";
export type V2UploadFileStatus = "uploaded" | "analyzed" | "confirmed";
export type V2UploadSessionStatus = "uploaded" | "analyzed" | "built";
export type V2DashboardStatus = "ready" | "partial" | "missing";
export type V2BusinessLine = "super" | "flexible" | "unknown";
export type V2PhoneMatchType = "exact" | "fuzzy" | "unmatched";
export type V2AttributionRule = "creative_id" | "note_id" | "channel" | "unknown";

export type V2UploadFileRecord = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  data: string;
  status: V2UploadFileStatus;
  legacySourceType: LegacySourceType | null;
  sourceType: V2SourceType | null;
  manualSourceType: V2SourceType | null;
  confidence: V2Confidence;
  reason: string;
  candidates: V2SourceType[];
  v2Eligible: boolean;
  lowConfidenceNotes: string[];
};

export type V2UploadSessionRecord = {
  id: string;
  status: V2UploadSessionStatus;
  files: V2UploadFileRecord[];
  createdAt: string;
  updatedAt: string;
};

export type V2UploadResponse = {
  uploadId: string;
  files: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    status: V2UploadFileStatus;
  }>;
  upload: V2UploadSessionRecord;
};

export type V2AnalyzeResponse = {
  uploadId: string;
  v2Eligible: boolean;
  entryDashboard?: V2DashboardType;
  entryReason?: string;
  files: Array<{
    id: string;
    name: string;
    sourceType: V2SourceType | null;
    confidence: V2Confidence;
    reason: string;
    v2Eligible: boolean;
    lowConfidenceNotes: string[];
    candidates: V2SourceType[];
  }>;
  upload: V2UploadSessionRecord;
};

export type V2ReclassifyResponse = {
  uploadId: string;
  fileId: string;
  sourceType: V2SourceType | null;
  upload: V2UploadSessionRecord;
};

export type V2DashboardCard = {
  label: string;
  value: string;
  hint: string;
  tone?: V2Tone;
};

export type V2DashboardTable = {
  columns: string[];
  rows: string[][];
};

export type V2DashboardView = {
  type: V2DashboardType;
  title: string;
  summary: string;
  status: V2DashboardStatus;
  cards: V2DashboardCard[];
  notices: string[];
  table?: V2DashboardTable;
  agentContext: Record<string, unknown>;
};

export type V2AlertItem = {
  level: "red" | "yellow";
  title: string;
  description: string;
  metric: string;
  currentValue: string;
  threshold: string;
};

export type V2CanonicalLeadFact = {
  id: string;
  sourceType: V2SourceType;
  sourceFileName: string;
  leadKind: "traffic" | "followup";
  businessLine: V2BusinessLine;
  phone: string;
  phoneLast8: string;
  city: string;
  leadDate: string;
  channel: string;
  accountType: string;
  salesOwner: string;
  noteId: string;
  creativeId: string;
  planName: string;
  matchType: V2PhoneMatchType;
  matchConfidence: V2Confidence;
  matchedLeadId: string | null;
  attributionRule: V2AttributionRule;
  attributionTarget: string;
};

export type V2CanonicalTouchpointFact = {
  id: string;
  sourceType: V2SourceType;
  sourceFileName: string;
  touchpointType: "video" | "ad_plan" | "note" | "daily" | "register";
  businessLine: V2BusinessLine;
  eventDate: string;
  channel: string;
  accountType: string;
  noteId: string;
  creativeId: string;
  planName: string;
  spend: number;
  leads: number;
  registrations: number;
  orders: number;
  attributionRule: V2AttributionRule;
  attributionTarget: string;
};

export type V2CanonicalOrderFact = {
  id: string;
  sourceType: V2SourceType;
  sourceFileName: string;
  businessLine: V2BusinessLine;
  phone: string;
  phoneLast8: string;
  city: string;
  orderDate: string;
  orderSource: string;
  attributionRule: V2AttributionRule;
  attributionTarget: string;
};

export type V2CanonicalFactsSummary = {
  totalLeads: number;
  totalTrafficLeads: number;
  totalFollowupLeads: number;
  totalTouchpoints: number;
  totalOrders: number;
  totalSpend: number;
  matching: {
    exact: number;
    fuzzy: number;
    unmatched: number;
    lowConfidence: number;
  };
  attribution: {
    creativeId: number;
    noteId: number;
    channel: number;
    unknown: number;
  };
  byBusinessLine: Record<
    V2BusinessLine | "all",
    {
      leads: number;
      trafficLeads: number;
      followupLeads: number;
      touchpoints: number;
      orders: number;
      spend: number;
    }
  >;
};

export type V2CanonicalFacts = {
  leads: V2CanonicalLeadFact[];
  touchpoints: V2CanonicalTouchpointFact[];
  orders: V2CanonicalOrderFact[];
  summary: V2CanonicalFactsSummary;
};

export type V2DashboardMap = Record<V2DashboardType, V2DashboardView>;
export type V2AgentContextMap = Record<V2DashboardType, Record<string, unknown>>;
export type V2DashboardTimeScope =
  | "current_snapshot"
  | "last_7_days"
  | "current_cycle";
export type V2DashboardBusinessFilter = "all" | "super" | "flexible";

export type V2DashboardFilters = {
  snapshotId: string;
  timeScope: V2DashboardTimeScope;
  businessFilter: V2DashboardBusinessFilter;
};

export type V2DashboardFilterMeta = {
  requestedTimeScope: V2DashboardTimeScope;
  requestedBusinessFilter: V2DashboardBusinessFilter;
  appliedTimeScope: V2DashboardTimeScope;
  appliedBusinessFilter: V2DashboardBusinessFilter;
  timeScopeFallbackApplied: boolean;
  businessFilterForced: boolean;
  notes: string[];
};

export type V2DashboardQuery = {
  snapshotId: string;
  timeScope?: V2DashboardTimeScope;
  businessFilter?: V2DashboardBusinessFilter;
};

export type V2SnapshotRecord = {
  id: string;
  sessionId: string;
  uploadId: string;
  createdAt: string;
  sourceCoverage: Record<V2SourceType, { fileCount: number; names: string[] }>;
  confirmedFiles: Array<{
    id: string;
    name: string;
    sourceType: V2SourceType;
  }>;
  legacyFiles: string[];
  canonicalFacts: V2CanonicalFacts;
  alerts: V2AlertItem[];
  agentContexts: V2AgentContextMap;
  dashboards: V2DashboardMap;
  closedLoopImportJobId: string | null;
  closedLoopSnapshotId: string | null;
};

export type V2AnalysisSessionRecord = {
  id: string;
  uploadId: string;
  snapshotId: string;
  createdAt: string;
};

export type V2BuildSessionResponse = {
  uploadId: string;
  v2Eligible: boolean;
  entryDashboard?: V2DashboardType;
  entryReason?: string;
  sessionId: string;
  snapshotId: string;
  v2Files: Array<{
    id: string;
    name: string;
    sourceType: V2SourceType;
  }>;
  legacyFiles: string[];
  upload: V2UploadSessionRecord;
  session: V2AnalysisSessionRecord;
  snapshot: V2SnapshotRecord;
};

export type V2AlertConfig = {
  redTargetCompletionThreshold: number;
  yellowMomDropThreshold: number;
  feishuWebhook: string;
  enabled: boolean;
};

export type V2AgentDefinition = {
  dashboardType: V2DashboardType;
  agentName: string;
  roleLabel: string;
};

export type V2AgentMessage = {
  role: "user" | "assistant";
  content: string;
};

export type V2AgentThread = {
  id: string;
  dashboardType: V2DashboardType;
  snapshotId: string;
  agentName: string;
  messages: V2AgentMessage[];
  createdAt: string;
  updatedAt: string;
};

export type V2DashboardResponse = {
  snapshot: V2SnapshotRecord;
  dashboard: V2DashboardView;
  appliedFilters: V2DashboardFilters;
  filterMeta: V2DashboardFilterMeta;
};

export type V2SnapshotListResponse = {
  snapshots: V2SnapshotRecord[];
};

export type V2AlertListResponse = {
  snapshotId: string;
  alerts: V2AlertItem[];
};
