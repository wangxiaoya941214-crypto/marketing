import {
  applyClosedLoopReviewDecision,
  getClosedLoopReviewWorkspaceData,
  getClosedLoopSnapshot,
  importClosedLoopWorkbook,
  listClosedLoopJobs,
  searchClosedLoopReviewCandidates,
} from "../../shared/closed-loop/service.ts";
import type { UploadedFileInfo } from "../../shared/http-contracts.ts";
import type { ReviewDecisionType, ReviewQueueFilters } from "../../shared/closed-loop/types.ts";
import { ensureClosedLoopApiAccess } from "../_lib/closed-loop-auth.ts";

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
    if (action === "import") {
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        response.status(405).json({ error: "Method Not Allowed" });
        return;
      }
      if (!ensureClosedLoopApiAccess(request, response, "write")) {
        return;
      }
      const body = parseBody(request) as { fileInfo?: UploadedFileInfo };
      if (!body.fileInfo?.data) {
        response.status(400).json({ error: "缺少闭环底座文件。" });
        return;
      }
      const payload = await importClosedLoopWorkbook({
        fileName: body.fileInfo.name || "closed-loop-workbook.xlsx",
        buffer: Buffer.from(body.fileInfo.data, "base64"),
      });
      response.status(200).json(payload);
      return;
    }

    if (action === "jobs") {
      if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        response.status(405).json({ error: "Method Not Allowed" });
        return;
      }
      if (!ensureClosedLoopApiAccess(request, response, "read")) {
        return;
      }
      response.status(200).json({ jobs: await listClosedLoopJobs() });
      return;
    }

    if (action === "review-queue") {
      if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        response.status(405).json({ error: "Method Not Allowed" });
        return;
      }
      if (!ensureClosedLoopApiAccess(request, response, "review")) {
        return;
      }
      const importJobId = String(request.query?.importJobId || "").trim();
      if (!importJobId) {
        response.status(400).json({ error: "缺少 importJobId。" });
        return;
      }
      const filters: ReviewQueueFilters = {
        query: String(request.query?.q || "").trim() || undefined,
        businessType:
          (String(request.query?.businessType || "").trim() as ReviewQueueFilters["businessType"]) ||
          undefined,
      };
      response.status(200).json(await getClosedLoopReviewWorkspaceData(importJobId, filters));
      return;
    }

    if (action === "review-search") {
      if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        response.status(405).json({ error: "Method Not Allowed" });
        return;
      }
      if (!ensureClosedLoopApiAccess(request, response, "review")) {
        return;
      }
      const importJobId = String(request.query?.importJobId || "").trim();
      const query = String(request.query?.q || "").trim();
      if (!importJobId) {
        response.status(400).json({ error: "缺少 importJobId。" });
        return;
      }
      if (!query) {
        response.status(200).json({ candidates: [] });
        return;
      }
      response.status(200).json({
        candidates: await searchClosedLoopReviewCandidates(importJobId, query),
      });
      return;
    }

    if (action === "review-decision") {
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        response.status(405).json({ error: "Method Not Allowed" });
        return;
      }
      if (!ensureClosedLoopApiAccess(request, response, "review")) {
        return;
      }
      const body = parseBody(request) as {
        importJobId?: string;
        xhsLeadId?: string;
        decisionType?: ReviewDecisionType;
        actor?: string;
        note?: string;
        nextCrmLeadId?: string | null;
      };
      if (!body.importJobId || !body.xhsLeadId || !body.decisionType) {
        response.status(400).json({ error: "缺少复核参数。" });
        return;
      }
      response.status(200).json(
        await applyClosedLoopReviewDecision({
          importJobId: body.importJobId,
          xhsLeadId: body.xhsLeadId,
          decisionType: body.decisionType,
          actor: body.actor,
          note: body.note,
          nextCrmLeadId: body.nextCrmLeadId,
        }),
      );
      return;
    }

    if (action === "snapshot") {
      if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        response.status(405).json({ error: "Method Not Allowed" });
        return;
      }
      if (!ensureClosedLoopApiAccess(request, response, "read")) {
        return;
      }
      const importJobId = String(request.query?.importJobId || "").trim();
      if (!importJobId) {
        response.status(400).json({ error: "缺少 importJobId。" });
        return;
      }
      response.status(200).json({
        snapshot: await getClosedLoopSnapshot(importJobId),
      });
      return;
    }

    response.status(404).json({ error: "未找到该闭环接口。" });
  } catch (error: any) {
    console.error(error);
    response.status(error?.statusCode || 500).json({
      error:
        error?.message ||
        (action === "import"
          ? "闭环底座导入失败。"
          : action === "jobs"
            ? "读取导入任务失败。"
            : action === "review-queue"
              ? "读取待复核队列失败。"
              : action === "review-search"
                ? "搜索候选主线索失败。"
                : action === "review-decision"
                  ? "复核写入失败。"
                  : action === "snapshot"
                    ? "读取闭环分析快照失败。"
                    : "闭环接口执行失败。"),
    });
  }
}
