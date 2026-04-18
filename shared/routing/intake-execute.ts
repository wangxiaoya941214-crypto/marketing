import { dispatchDiagnosisRoute } from "./route-dispatcher.ts";
import { routeDiagnosis } from "./diagnosis-router.ts";
import { detectSourceType } from "./source-detector.ts";
import type {
  DiagnosisRoute,
  IntakeExecuteRequestBody,
  IntakeExecuteResponse,
  SourceType,
} from "./types.ts";

const NON_CLOSED_LOOP_ROUTES: DiagnosisRoute[] = [
  "marketing_diagnosis",
  "sales_followup_diagnosis",
  "campaign_conversion_diagnosis",
  "content_to_lead_diagnosis",
];

const createBadRequestError = (message: string) => {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = 400;
  return error;
};

const getAvailableRoutes = (sourceType: SourceType): DiagnosisRoute[] =>
  sourceType === "closed_loop_workbook"
    ? ["closed_loop_analysis"]
    : NON_CLOSED_LOOP_ROUTES;

const resolveDiagnosisRoute = (
  body: IntakeExecuteRequestBody,
  recommendedDiagnosisRoute: DiagnosisRoute,
  availableRoutes: DiagnosisRoute[],
) => {
  const preferredDiagnosisRoute = body.diagnosisRoute?.trim() as
    | DiagnosisRoute
    | undefined;

  if (!preferredDiagnosisRoute) {
    return {
      diagnosisRoute: recommendedDiagnosisRoute,
      routeOverrideApplied: false,
    };
  }

  if (!availableRoutes.includes(preferredDiagnosisRoute)) {
    throw createBadRequestError("当前上传内容不支持切换到这个分析方向。");
  }

  return {
    diagnosisRoute: preferredDiagnosisRoute,
    routeOverrideApplied: preferredDiagnosisRoute !== recommendedDiagnosisRoute,
  };
};

export const buildIntakeExecutionResponse = async (
  body: IntakeExecuteRequestBody,
): Promise<IntakeExecuteResponse> => {
  const detection = await detectSourceType(body);
  const recommended = routeDiagnosis(detection);
  const availableRoutes = getAvailableRoutes(recommended.sourceType);
  const resolved = resolveDiagnosisRoute(
    body,
    recommended.diagnosisRoute,
    availableRoutes,
  );

  return {
    ...recommended,
    diagnosisRoute: resolved.diagnosisRoute,
    routeOverrideApplied: resolved.routeOverrideApplied,
    routeContext: await dispatchDiagnosisRoute(body, resolved.diagnosisRoute),
  };
};
