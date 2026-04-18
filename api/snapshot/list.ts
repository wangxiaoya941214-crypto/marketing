import { listV2Snapshots } from "../../shared/v2/service.ts";
import type { V2SnapshotListResponse } from "../../shared/v2/types.ts";

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    response.status(200).json({
      snapshots: await listV2Snapshots(),
    } satisfies V2SnapshotListResponse);
  } catch (error: any) {
    console.error(error);
    response.status(error?.statusCode || 500).json({
      error: error?.message || "读取 V2 快照列表失败。",
    });
  }
}
