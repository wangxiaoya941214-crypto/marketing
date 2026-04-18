import { getV2Dashboard } from "../../shared/v2/service.ts";
import type { V2DashboardResponse, V2DashboardType } from "../../shared/v2/types.ts";

const DASHBOARD_MAP: Record<string, V2DashboardType> = {
  overview: "overview",
  content: "content",
  ads: "ads",
  sales: "sales",
  "super-subscription": "super_subscription",
  "flexible-subscription": "flexible_subscription",
};

const resolveDashboardErrorMessage = (error: any) => {
  const message = typeof error?.message === "string" ? error.message.trim() : "";
  const statusCode =
    typeof error?.statusCode === "number" ? Number(error.statusCode) : 500;

  if (statusCode < 500 && message) {
    return message;
  }

  if (
    message.includes("Cannot read properties") ||
    message.includes("Unexpected token") ||
    message.includes("summary")
  ) {
    return "当前快照数据不完整，请重新生成分析会话。";
  }

  return "读取 V2 看板失败，请刷新后重试。";
};

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const dashboardParam = String(request.query?.dashboard || "").trim();
    const dashboardType = DASHBOARD_MAP[dashboardParam];
    if (!dashboardType) {
      response.status(404).json({ error: "未找到该看板。" });
      return;
    }

    const snapshotId = String(request.query?.snapshotId || "").trim();
    if (!snapshotId) {
      response.status(400).json({ error: "缺少 snapshotId。" });
      return;
    }

    const payload = await getV2Dashboard(snapshotId, dashboardType, {
      timeScope: String(request.query?.timeScope || "").trim() || undefined,
      businessFilter:
        String(request.query?.businessFilter || "").trim() || undefined,
    });

    response.status(200).json(payload satisfies V2DashboardResponse);
  } catch (error: any) {
    console.error(error);
    response.status(error?.statusCode || 500).json({
      error: resolveDashboardErrorMessage(error),
    });
  }
}
