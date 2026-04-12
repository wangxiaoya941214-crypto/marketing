import {
  buildRecognizeInputResponse,
  type AnalyzeRequestBody,
} from "../server";

const parseBody = (request: { body?: unknown }) => {
  if (typeof request.body === "string") {
    try {
      return JSON.parse(request.body);
    } catch {
      return {};
    }
  }
  return (request.body || {}) as AnalyzeRequestBody;
};

export const config = {
  maxDuration: 60,
};

export default async function handler(request: any, response: any) {
  if (request.method === "OPTIONS") {
    response.setHeader("Allow", "POST, OPTIONS");
    response.status(204).end();
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    response.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const body = parseBody(request);
    const payload = await buildRecognizeInputResponse(body);
    response.status(200).json(payload);
  } catch (error: any) {
    console.error(error);
    response.status(500).json({
      error: error?.message || "文件识别失败，请换一个文件格式或改用手动补录。",
    });
  }
}
