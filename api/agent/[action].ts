import { analyzeV2Agent, followupV2Agent } from "../_lib/v2-agent-service.ts";
import type { V2DashboardType } from "../../shared/v2/types.ts";

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

export default async function handler(request: any, response: any) {
  const action = String(request.query?.action || "").trim();

  try {
    if (action === "analyze") {
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        response.status(405).json({ error: "Method Not Allowed" });
        return;
      }
      const body = parseBody(request) as {
        snapshotId?: string;
        dashboardType?: V2DashboardType;
      };
      if (!body.snapshotId || !body.dashboardType) {
        response.status(400).json({ error: "缺少 snapshotId 或 dashboardType。" });
        return;
      }
      response.status(200).json(await analyzeV2Agent(body.snapshotId, body.dashboardType));
      return;
    }

    if (action === "followup") {
      if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        response.status(405).json({ error: "Method Not Allowed" });
        return;
      }
      const body = parseBody(request) as {
        sessionId?: string;
        userQuestion?: string;
      };
      if (!body.sessionId || !body.userQuestion?.trim()) {
        response.status(400).json({ error: "缺少 sessionId 或追问内容。" });
        return;
      }
      response.status(200).json(
        await followupV2Agent(body.sessionId, body.userQuestion.trim()),
      );
      return;
    }

    response.status(404).json({ error: "未找到该 Agent 接口。" });
  } catch (error: any) {
    console.error(error);
    response.status(error?.statusCode || 500).json({
      error: error?.message || (action === "analyze" ? "运行 V2 Agent 失败。" : "继续追问失败。"),
    });
  }
}
