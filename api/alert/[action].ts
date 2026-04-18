import { getV2Alerts, getV2AlertConfig, updateV2AlertConfig } from "../../shared/v2/service.ts";
import type { V2AlertListResponse } from "../../shared/v2/types.ts";

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
    if (action === "config") {
      if (request.method === "GET") {
        response.status(200).json({
          config: await getV2AlertConfig(),
        });
        return;
      }

      if (request.method === "POST") {
        const body = parseBody(request);
        response.status(200).json({
          config: await updateV2AlertConfig(body || {}),
        });
        return;
      }

      response.setHeader("Allow", "GET, POST");
      response.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    if (action === "list") {
      if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        response.status(405).json({ error: "Method Not Allowed" });
        return;
      }
      const snapshotId = String(request.query?.snapshotId || "").trim();
      if (!snapshotId) {
        response.status(400).json({ error: "缺少 snapshotId。" });
        return;
      }
      response.status(200).json(
        (await getV2Alerts(snapshotId)) satisfies V2AlertListResponse,
      );
      return;
    }

    response.status(404).json({ error: "未找到该预警接口。" });
  } catch (error: any) {
    console.error(error);
    response.status(error?.statusCode || 500).json({
      error: error?.message || (action === "list" ? "读取 V2 预警结果失败。" : "读取预警配置失败。"),
    });
  }
}
