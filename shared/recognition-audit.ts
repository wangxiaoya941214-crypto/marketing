import type { LeadSheetAdapterSidecar } from "./adapters/lead-sheet/build-marketing-input-from-leads";

export type RecognitionExtractor = "rule" | "rule_then_ai" | "ai_primary";
export type RecognitionSourceType =
  | "csv"
  | "xlsx"
  | "docx"
  | "text"
  | "rawText"
  | "image"
  | "pdf";
export type RecognitionConfidence = "high" | "medium" | "low";

export interface RecognitionAudit {
  extractor: RecognitionExtractor;
  sourceType: RecognitionSourceType;
  confidence: RecognitionConfidence;
  completenessPercent: number;
  fallbackUsed: boolean;
  reviewReasons: string[];
  recommendedFocus: string[];
  adapterAudit?: LeadSheetAdapterSidecar | null;
}
