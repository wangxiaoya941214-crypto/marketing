import { importClosedLoopWorkbook } from "../closed-loop/service.ts";
import { buildRecognizeInputResponse } from "../marketing-api.ts";
import type {
  DiagnosisRoute,
  DiagnosisRouteContext,
  IntakeAnalyzeRequestBody,
} from "./types.ts";

const createDispatchError = (message: string, statusCode = 400) => {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  return error;
};

export const dispatchDiagnosisRoute = async (
  body: IntakeAnalyzeRequestBody,
  diagnosisRoute: DiagnosisRoute,
): Promise<DiagnosisRouteContext> => {
  if (diagnosisRoute === "closed_loop_analysis") {
    if (!body.fileInfo?.data) {
      throw createDispatchError("闭环分析需要上传闭环底座工作簿。");
    }

    const payload = await importClosedLoopWorkbook({
      fileName: body.fileInfo.name?.trim() || "closed-loop-workbook.xlsx",
      buffer: Buffer.from(body.fileInfo.data, "base64"),
    });

    return {
      kind: "closed_loop_import",
      job: payload.job,
      reviewQueue: payload.reviewQueue,
      snapshot: payload.snapshot,
    };
  }

  const payload = await buildRecognizeInputResponse(body);
  return {
    kind: "recognized_input",
    recognizedInput: payload.recognizedInput,
    dashboardPreview: payload.dashboardPreview,
    recognitionMode: payload.recognitionMode,
    importAudit: payload.importAudit,
    recognitionAudit: payload.recognitionAudit,
  };
};
