import type {
  DiagnosisRoute,
  DiagnosisRoutingResult,
  SourceDetectionResult,
  SourceType,
} from "./types.ts";

const ROUTE_BY_SOURCE: Record<SourceType, DiagnosisRoute> = {
  closed_loop_workbook: "closed_loop_analysis",
  crm_lead_sheet: "sales_followup_diagnosis",
  xhs_campaign_report: "campaign_conversion_diagnosis",
  xhs_lead_list: "content_to_lead_diagnosis",
  xhs_daily_report: "campaign_conversion_diagnosis",
  marketing_template: "marketing_diagnosis",
  unstructured_document: "marketing_diagnosis",
};

const ROUTE_LABEL: Record<DiagnosisRoute, string> = {
  closed_loop_analysis: "闭环分析",
  marketing_diagnosis: "营销诊断",
  sales_followup_diagnosis: "销售跟进诊断",
  campaign_conversion_diagnosis: "投放数据转化诊断",
  content_to_lead_diagnosis: "内容传播诊断",
};

export const routeDiagnosis = (
  detection: SourceDetectionResult,
): DiagnosisRoutingResult => {
  const diagnosisRoute = ROUTE_BY_SOURCE[detection.sourceType];

  return {
    sourceType: detection.sourceType,
    diagnosisRoute,
    confidence: detection.confidence,
    reason: `${detection.reason} 系统建议进入${ROUTE_LABEL[diagnosisRoute]}。`,
  };
};
