import type { InsightResult } from "../ai-insight-engine.ts";
import type { MarketingDashboardData, MarketingInput } from "../marketing-engine.ts";

export type SourceType =
  | "closed_loop_workbook"
  | "crm_lead_sheet"
  | "xhs_campaign_report"
  | "xhs_lead_list"
  | "xhs_daily_report";

export type ImportJobStatus =
  | "queued"
  | "parsing"
  | "review_required"
  | "ready"
  | "failed";

export type ClosedLoopAiStatus = "pending" | "running" | "ready" | "degraded";

export type LinkConfidence = "high" | "low" | "manual";

export type LinkReviewStatus = "pending" | "confirmed" | "unmatched";

export type ReviewDecisionType =
  | "confirm_match"
  | "change_match"
  | "mark_unmatched"
  | "override_field";

export interface ImportJobRecord {
  id: string;
  sourceType: SourceType;
  fileName: string;
  status: ImportJobStatus;
  currentSnapshotId: string | null;
  aiStatus: ClosedLoopAiStatus;
  aiStartedAt: string | null;
  aiFinishedAt: string | null;
  aiAttempts: number;
  aiError: string | null;
  errorMessage: string | null;
  summary: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ContentTouchpointRecord {
  id: string;
  importJobId: string;
  touchpointType: "plan" | "note" | "daily";
  touchpointKey: string;
  productType: "flexible" | "super" | "unknown";
  channel: string;
  channelDetail: string;
  noteTitle: string;
  noteId: string;
  planName: string;
  creativeName: string;
  occurredAt: string | null;
  metrics: Record<string, number | string | null>;
  raw: Record<string, unknown>;
}

export interface XhsLeadRecord {
  id: string;
  importJobId: string;
  leadDate: string | null;
  account: string;
  noteTitle: string;
  noteId: string;
  trafficType: string;
  creativeName: string;
  creativeId: string;
  conversionType: string;
  phone: string;
  wechat: string;
  contactKey: string;
  region: string;
  raw: Record<string, unknown>;
}

export interface CrmLeadRecord {
  id: string;
  importJobId: string;
  leadDate: string | null;
  contactKey: string;
  customerIdentity: string;
  city: string;
  vehicleIntent: string;
  salesOwner: string;
  channel: string;
  channelDetail: string;
  businessType: "flexible" | "super" | "unknown";
  sourceType: string;
  province: string;
  raw: Record<string, unknown>;
}

export interface LeadJourneyRecord {
  id: string;
  importJobId: string;
  crmLeadId: string;
  addedWechat: boolean;
  addedWechatAt: string | null;
  highIntent: boolean;
  intentGrade: string;
  notOrderedReason: string;
  lossReason: string;
  orderStatus: string;
  orderProgress: string;
  raw: Record<string, unknown>;
}

export interface OrderRecord {
  id: string;
  importJobId: string;
  crmLeadId: string;
  externalOrderId: string;
  ordered: boolean;
  orderedAt: string | null;
  dealDate: string | null;
  orderSource: string;
  orderSourceStandardized: string;
  matchMethod: string;
  matchNote: string;
  raw: Record<string, unknown>;
}

export interface LeadLinkRecord {
  id: string;
  importJobId: string;
  xhsLeadId: string;
  crmLeadId: string | null;
  matchKey: string;
  confidence: LinkConfidence;
  reviewStatus: LinkReviewStatus;
  matchDaysDelta: number | null;
  issue: string;
  noteTitle: string;
  planName: string;
  raw: Record<string, unknown>;
}

export interface ReviewDecisionRecord {
  id: string;
  importJobId: string;
  xhsLeadId: string;
  previousCrmLeadId: string | null;
  nextCrmLeadId: string | null;
  decisionType: ReviewDecisionType;
  note: string;
  actor: string;
  createdAt: string;
}

export interface ClosedLoopReasonItem {
  label: string;
  count: number;
}

export interface ClosedLoopCockpitSummary {
  cards: Array<{
    key: string;
    label: string;
    value: number | string;
    hint: string;
  }>;
  review: {
    pendingCount: number;
    confirmedCount: number;
    unmatchedCount: number;
    planCoverageRate: number;
  };
  contentNotes: Array<Record<string, unknown>>;
  plans: Array<Record<string, unknown>>;
  daily: Array<Record<string, unknown>>;
  reasons: {
    notOrdered: ClosedLoopReasonItem[];
    lost: ClosedLoopReasonItem[];
  };
  breakdowns: {
    channels: Array<Record<string, unknown>>;
    salesOwners: Array<Record<string, unknown>>;
    cities: Array<Record<string, unknown>>;
    sourceTypes: Array<Record<string, unknown>>;
  };
}

export interface ClosedLoopAnalysisSnapshot {
  id: string;
  importJobId: string;
  version: number;
  generatedAt: string;
  marketingInput: MarketingInput;
  dashboard: MarketingDashboardData;
  analysis: string;
  insights: InsightResult;
  aiStatus: ClosedLoopAiStatus;
  aiUpdatedAt: string | null;
  aiError: string | null;
  cockpit: ClosedLoopCockpitSummary;
}

export interface ClosedLoopParserMeta {
  workbookSheetCount: number;
  parsedSheetCount: number;
  parsedRowCount: number;
}

export interface ClosedLoopImportBundle {
  importSummary: Record<string, unknown>;
  parserMeta?: ClosedLoopParserMeta;
  contentTouchpoints: ContentTouchpointRecord[];
  xhsLeads: XhsLeadRecord[];
  crmLeads: CrmLeadRecord[];
  leadJourneys: LeadJourneyRecord[];
  orders: OrderRecord[];
  leadLinks: LeadLinkRecord[];
}

export interface ReviewQueueItem {
  xhsLeadId: string;
  nickname: string;
  contactKey: string;
  phone: string;
  wechat: string;
  noteTitle: string;
  planName: string;
  trafficType: string;
  region: string;
  matchedCrmLeadId: string | null;
  matchedConfidence: LinkConfidence;
  reviewStatus: LinkReviewStatus;
  matchDaysDelta: number | null;
  issue: string;
  salesOwner: string;
  businessType: string;
  matchedCrmLeadSummary: string;
}

export interface ReviewQueueSummary {
  totalPending: number;
  byBusinessType: Array<{
    businessType: string;
    count: number;
  }>;
  byIssue: Array<{
    issue: string;
    count: number;
  }>;
}

export interface ReviewQueueFilters {
  query?: string;
  businessType?: "flexible" | "super" | "unknown" | "all";
}

export interface ReviewSearchCandidate {
  crmLeadId: string;
  customerIdentity: string;
  contactKey: string;
  salesOwner: string;
  city: string;
  businessType: "flexible" | "super" | "unknown";
  leadDate: string | null;
  reason: string;
}
