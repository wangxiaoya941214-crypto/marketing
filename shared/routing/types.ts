import type { LeadSheetAdapterSidecar } from "../adapters/lead-sheet/build-marketing-input-from-leads.ts";
import type {
  ClosedLoopAnalysisSnapshot,
  ImportJobRecord,
  ReviewQueueItem,
} from "../closed-loop/types.ts";
import type { AnalyzeRequestBody } from "../http-contracts.ts";
import type { MarketingDashboardData, MarketingInput } from "../marketing-engine.ts";
import type { RecognitionAudit } from "../recognition-audit.ts";

export const SOURCE_TYPES = [
  "closed_loop_workbook",
  "crm_lead_sheet",
  "xhs_campaign_report",
  "xhs_lead_list",
  "xhs_daily_report",
  "marketing_template",
  "unstructured_document",
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export const DIAGNOSIS_ROUTES = [
  "closed_loop_analysis",
  "marketing_diagnosis",
  "sales_followup_diagnosis",
  "campaign_conversion_diagnosis",
  "content_to_lead_diagnosis",
] as const;

export type DiagnosisRoute = (typeof DIAGNOSIS_ROUTES)[number];

export type RoutingConfidence = "high" | "medium" | "low";

export type SourceDetectionResult = {
  sourceType: SourceType;
  confidence: RoutingConfidence;
  reason: string;
};

export type DiagnosisRoutingResult = {
  sourceType: SourceType;
  diagnosisRoute: DiagnosisRoute;
  confidence: RoutingConfidence;
  reason: string;
};

export type RecognizedDiagnosisRouteContext = {
  kind: "recognized_input";
  recognizedInput: MarketingInput;
  dashboardPreview: MarketingDashboardData;
  recognitionMode: string;
  importAudit: LeadSheetAdapterSidecar | null;
  recognitionAudit: RecognitionAudit;
};

export type ClosedLoopDiagnosisRouteContext = {
  kind: "closed_loop_import";
  job: ImportJobRecord;
  reviewQueue: ReviewQueueItem[];
  snapshot: ClosedLoopAnalysisSnapshot;
};

export type DiagnosisRouteContext =
  | RecognizedDiagnosisRouteContext
  | ClosedLoopDiagnosisRouteContext;

export type IntakeAnalyzeRequestBody = AnalyzeRequestBody;

export type IntakeAnalyzeResponse = DiagnosisRoutingResult;

export type IntakeExecuteRequestBody = AnalyzeRequestBody & {
  diagnosisRoute?: DiagnosisRoute | null;
};

export type IntakeExecuteResponse = DiagnosisRoutingResult & {
  routeContext: DiagnosisRouteContext;
  routeOverrideApplied: boolean;
};
