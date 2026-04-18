import { routeDiagnosis } from "./diagnosis-router.ts";
import { detectSourceType } from "./source-detector.ts";
import type { IntakeAnalyzeRequestBody, IntakeAnalyzeResponse } from "./types.ts";

export const buildIntakeAnalysisResponse = async (
  body: IntakeAnalyzeRequestBody,
): Promise<IntakeAnalyzeResponse> => {
  const detection = await detectSourceType(body);
  return routeDiagnosis(detection);
};
