import { buildIntakeAnalysisResponse } from "../../shared/routing/intake-api.ts";
import { buildIntakeExecutionResponse } from "../../shared/routing/intake-execute.ts";
import type {
  IntakeAnalyzeRequestBody,
  IntakeExecuteRequestBody,
} from "../../shared/routing/types.ts";
import type { UploadedFileInfo } from "../../shared/http-contracts.ts";
import {
  analyzeV2UploadSession,
  buildV2AnalyzeResponse,
  buildV2BuildSessionResponse,
  buildV2ReclassifyResponse,
  buildV2UploadResponse,
  buildV2AnalysisSession,
  reclassifyV2UploadFile,
  uploadV2Files,
} from "../../shared/v2/service.ts";
import type { V2SourceType } from "../../shared/v2/types.ts";

const parseBody = (request: { body?: unknown }) => {
  if (typeof request.body === "string") {
    try {
      return JSON.parse(request.body);
    } catch {
      return {};
    }
  }
  return (request.body || {}) as any;
};

export const config = {
  maxDuration: 60,
};

export default async function handler(request: any, response: any) {
  const action = String(request.query?.action || "").trim();

  try {
    if (action === "upload") {
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST, OPTIONS");
        response.status(405).json({ error: "Method Not Allowed" });
        return;
      }
      const body = parseBody(request) as { files?: UploadedFileInfo[] };
      const files = Array.isArray(body.files) ? body.files : [];
      if (!files.length) {
        response.status(400).json({ error: "至少上传一个文件。" });
        return;
      }
      const upload = await uploadV2Files(files);
      response.status(200).json(buildV2UploadResponse(upload));
      return;
    }

    if (action === "analyze") {
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST, OPTIONS");
        response.status(405).json({ error: "Method Not Allowed" });
        return;
      }
      const body = parseBody(request) as IntakeAnalyzeRequestBody & { uploadId?: string };
      if (body.uploadId) {
        const upload = await analyzeV2UploadSession(body.uploadId);
        response.status(200).json(buildV2AnalyzeResponse(upload));
        return;
      }
      response.status(200).json(await buildIntakeAnalysisResponse(body));
      return;
    }

    if (action === "execute") {
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST, OPTIONS");
        response.status(405).json({ error: "Method Not Allowed" });
        return;
      }
      const body = parseBody(request) as IntakeExecuteRequestBody;
      response.status(200).json(await buildIntakeExecutionResponse(body));
      return;
    }

    if (action === "reclassify") {
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST, OPTIONS");
        response.status(405).json({ error: "Method Not Allowed" });
        return;
      }
      const body = parseBody(request) as {
        uploadId?: string;
        fileId?: string;
        sourceType?: V2SourceType | null;
      };
      if (!body.uploadId || !body.fileId) {
        response.status(400).json({ error: "缺少 uploadId 或 fileId。" });
        return;
      }
      const upload = await reclassifyV2UploadFile(
        body.uploadId,
        body.fileId,
        body.sourceType ?? null,
      );
      response.status(200).json(
        buildV2ReclassifyResponse(upload, body.fileId, body.sourceType ?? null),
      );
      return;
    }

    if (action === "build-session") {
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST, OPTIONS");
        response.status(405).json({ error: "Method Not Allowed" });
        return;
      }
      const body = parseBody(request) as {
        uploadId?: string;
      };
      if (!body.uploadId) {
        response.status(400).json({ error: "缺少 uploadId。" });
        return;
      }
      const payload = await buildV2AnalysisSession(body.uploadId);
      response.status(200).json(buildV2BuildSessionResponse(payload));
      return;
    }

    response.status(404).json({ error: "未找到该 intake 接口。" });
  } catch (error: any) {
    console.error(error);
    response.status(error?.statusCode || 500).json({
      error:
        error?.message ||
        (action === "upload"
          ? "创建上传会话失败。"
          : action === "analyze"
            ? "统一入口识别失败，请稍后重试。"
            : action === "execute"
              ? "统一入口执行失败，请稍后重试。"
              : action === "reclassify"
                ? "人工修正文件类型失败。"
                : action === "build-session"
                  ? "构建 V2 分析会话失败。"
                  : "V2 intake 接口执行失败。"),
    });
  }
}
