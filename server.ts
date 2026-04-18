import path from "path";
import { pathToFileURL } from "url";
import {
  applyClosedLoopReviewDecision,
  getClosedLoopReviewQueue,
  getClosedLoopReviewWorkspaceData,
  getClosedLoopSnapshot,
  importClosedLoopWorkbook,
  listClosedLoopJobs,
  searchClosedLoopReviewCandidates,
} from "./shared/closed-loop/service.ts";
import type {
  AnalyzeRequestBody,
  UploadedFileInfo,
} from "./shared/http-contracts.ts";
import { ensureClosedLoopApiAccess } from "./api/_lib/closed-loop-auth.ts";
import {
  runAnalyzeRequest,
  runRecognizeInputRequest,
} from "./shared/api-runtime.ts";
import { buildIntakeAnalysisResponse } from "./shared/routing/intake-api.ts";
import {
  analyzeV2UploadSession,
  buildV2AnalyzeResponse,
  buildV2BuildSessionResponse,
  buildV2ReclassifyResponse,
  buildV2UploadResponse,
  buildV2AnalysisSession,
  getV2Dashboard,
  listV2Snapshots,
  reclassifyV2UploadFile,
  uploadV2Files,
} from "./shared/v2/service.ts";
import type { V2DashboardType, V2SourceType } from "./shared/v2/types.ts";
import { resetV2StoreForTests } from "./shared/v2/store.ts";
import { buildIntakeExecutionResponse } from "./shared/routing/intake-execute.ts";
import type { IntakeExecuteRequestBody } from "./shared/routing/types.ts";
import { analyzeV2Agent, followupV2Agent } from "./api/_lib/v2-agent-service.ts";

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

export async function startServer() {
  const [{ default: express }, { createServer: createViteServer }] =
    await Promise.all([import("express"), import("vite")]);
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || "0.0.0.0";

  app.use(express.json({ limit: "50mb" }));

  app.use((err: any, _req: any, res: any, next: any) => {
    if (err.type === "entity.too.large") {
      res.status(413).json({ error: "请求体过大，请减少上传内容后重试。" });
      return;
    }
    next(err);
  });

  app.post("/api/analyze", async (req, res) => {
    const body = (req.body || {}) as AnalyzeRequestBody;

    try {
      res.json(await runAnalyzeRequest(body));
    } catch (error: any) {
      console.error(error);
      res.status(500).json({
        error: error.message || "诊断引擎执行失败，请检查输入数据后重试。",
      });
    }
  });

  app.post("/api/recognize-input", async (req, res) => {
    const body = (req.body || {}) as AnalyzeRequestBody;

    try {
      res.json(await runRecognizeInputRequest(body));
    } catch (error: any) {
      console.error(error);
      res.status(500).json({
        error: error.message || "文件识别失败，请换一个文件格式或改用手动补录。",
      });
    }
  });

  app.post("/api/intake/analyze", async (req, res) => {
    const body = (req.body || {}) as AnalyzeRequestBody & { uploadId?: string };

    try {
      if (body.uploadId) {
        const upload = await analyzeV2UploadSession(body.uploadId);
        res.json(buildV2AnalyzeResponse(upload));
        return;
      }
      res.json(await buildIntakeAnalysisResponse(body));
    } catch (error: any) {
      console.error(error);
      res.status(500).json({
        error: error.message || "统一入口识别失败，请稍后重试。",
      });
    }
  });

  app.post("/api/intake/execute", async (req, res) => {
    const body = (req.body || {}) as IntakeExecuteRequestBody;

    try {
      res.json(await buildIntakeExecutionResponse(body));
    } catch (error: any) {
      console.error(error);
      res.status(error?.statusCode || 500).json({
        error: error.message || "统一入口执行失败，请稍后重试。",
      });
    }
  });

  app.post("/api/intake/upload", async (req, res) => {
    try {
      const files = Array.isArray(req.body?.files)
        ? (req.body.files as UploadedFileInfo[])
        : [];
      if (!files.length) {
        res.status(400).json({ error: "至少上传一个文件。" });
        return;
      }
      const upload = await uploadV2Files(files);
      res.json(buildV2UploadResponse(upload));
    } catch (error: any) {
      console.error(error);
      res.status(error?.statusCode || 500).json({
        error: error.message || "创建上传会话失败。",
      });
    }
  });

  if (process.env.V2_FORCE_MEMORY_STORE === "1") {
    app.post("/api/test/reset-v2", async (_req, res) => {
      try {
        await resetV2StoreForTests();
        res.json({ ok: true });
      } catch (error: any) {
        console.error(error);
        res.status(500).json({
          error: error.message || "重置 V2 测试状态失败。",
        });
      }
    });
  }

  app.post("/api/intake/reclassify", async (req, res) => {
    try {
      const body = (req.body || {}) as {
        uploadId?: string;
        fileId?: string;
        sourceType?: V2SourceType | null;
      };
      if (!body.uploadId || !body.fileId) {
        res.status(400).json({ error: "缺少 uploadId 或 fileId。" });
        return;
      }
      const upload = await reclassifyV2UploadFile(
        body.uploadId,
        body.fileId,
        body.sourceType ?? null,
      );
      res.json(
        buildV2ReclassifyResponse(upload, body.fileId, body.sourceType ?? null),
      );
    } catch (error: any) {
      console.error(error);
      res.status(error?.statusCode || 500).json({
        error: error.message || "人工修正文件类型失败。",
      });
    }
  });

  app.post("/api/intake/build-session", async (req, res) => {
    try {
      const body = (req.body || {}) as {
        uploadId?: string;
      };
      if (!body.uploadId) {
        res.status(400).json({ error: "缺少 uploadId。" });
        return;
      }
      const payload = await buildV2AnalysisSession(body.uploadId);
      res.json(buildV2BuildSessionResponse(payload));
    } catch (error: any) {
      console.error(error);
      res.status(error?.statusCode || 500).json({
        error: error.message || "构建 V2 分析会话失败。",
      });
    }
  });

  app.get("/api/snapshot/list", async (_req, res) => {
    try {
      res.json({
        snapshots: await listV2Snapshots(),
      });
    } catch (error: any) {
      console.error(error);
      res.status(error?.statusCode || 500).json({
        error: error.message || "读取 V2 快照列表失败。",
      });
    }
  });

  const dashboardRouteMap: Record<string, V2DashboardType> = {
    "/api/dashboard/overview": "overview",
    "/api/dashboard/content": "content",
    "/api/dashboard/ads": "ads",
    "/api/dashboard/sales": "sales",
    "/api/dashboard/super-subscription": "super_subscription",
    "/api/dashboard/flexible-subscription": "flexible_subscription",
  };

  Object.entries(dashboardRouteMap).forEach(([route, dashboardType]) => {
    app.get(route, async (req, res) => {
      try {
        const snapshotId = String(req.query?.snapshotId || "").trim();
        const timeScope = String(req.query?.timeScope || "").trim() || undefined;
        const businessFilter =
          String(req.query?.businessFilter || "").trim() || undefined;
        if (!snapshotId) {
          res.status(400).json({ error: "缺少 snapshotId。" });
          return;
        }
        res.json(
          await getV2Dashboard(snapshotId, dashboardType, {
            timeScope,
            businessFilter,
          }),
        );
      } catch (error: any) {
        console.error(error);
        res.status(error?.statusCode || 500).json({
          error: resolveDashboardErrorMessage(error),
        });
      }
    });
  });

  app.post("/api/agent/analyze", async (req, res) => {
    try {
      const body = (req.body || {}) as {
        snapshotId?: string;
        dashboardType?: V2DashboardType;
      };
      if (!body.snapshotId || !body.dashboardType) {
        res.status(400).json({ error: "缺少 snapshotId 或 dashboardType。" });
        return;
      }
      res.json(await analyzeV2Agent(body.snapshotId, body.dashboardType));
    } catch (error: any) {
      console.error(error);
      res.status(error?.statusCode || 500).json({
        error: error.message || "运行 V2 Agent 失败。",
      });
    }
  });

  app.post("/api/agent/followup", async (req, res) => {
    try {
      const body = (req.body || {}) as {
        sessionId?: string;
        userQuestion?: string;
      };
      if (!body.sessionId || !body.userQuestion?.trim()) {
        res.status(400).json({ error: "缺少 sessionId 或追问内容。" });
        return;
      }
      res.json(await followupV2Agent(body.sessionId, body.userQuestion.trim()));
    } catch (error: any) {
      console.error(error);
      res.status(error?.statusCode || 500).json({
        error: error.message || "继续追问失败。",
      });
    }
  });

  app.post("/api/closed-loop/import", async (req, res) => {
    if (!ensureClosedLoopApiAccess(req, res, "write")) {
      return;
    }

    try {
      const fileInfo = req.body?.fileInfo as UploadedFileInfo | undefined;
      if (!fileInfo?.data) {
        res.status(400).json({ error: "缺少闭环底座文件。" });
        return;
      }

      res.json(
        await importClosedLoopWorkbook({
          fileName: fileInfo.name || "closed-loop-workbook.xlsx",
          buffer: Buffer.from(fileInfo.data, "base64"),
        }),
      );
    } catch (error: any) {
      console.error(error);
      res.status(error?.statusCode || 500).json({
        error: error.message || "闭环底座导入失败。",
      });
    }
  });

  app.get("/api/closed-loop/jobs", async (_req, res) => {
    if (!ensureClosedLoopApiAccess(_req, res, "read")) {
      return;
    }

    try {
      res.json({ jobs: await listClosedLoopJobs() });
    } catch (error: any) {
      console.error(error);
      res.status(error?.statusCode || 500).json({
        error: error.message || "读取导入任务失败。",
      });
    }
  });

  app.get("/api/closed-loop/review-queue", async (req, res) => {
    if (!ensureClosedLoopApiAccess(req, res, "review")) {
      return;
    }

    try {
      const importJobId = String(req.query.importJobId || "").trim();
      const filters = {
        query: String(req.query.q || "").trim() || undefined,
        businessType: (String(req.query.businessType || "").trim() ||
          undefined) as
          | "flexible"
          | "super"
          | "unknown"
          | "all"
          | undefined,
      };
      if (!importJobId) {
        res.status(400).json({ error: "缺少 importJobId。" });
        return;
      }
      res.json(await getClosedLoopReviewWorkspaceData(importJobId, filters));
    } catch (error: any) {
      console.error(error);
      res.status(error?.statusCode || 500).json({
        error: error.message || "读取待复核队列失败。",
      });
    }
  });

  app.get("/api/closed-loop/review-search", async (req, res) => {
    if (!ensureClosedLoopApiAccess(req, res, "review")) {
      return;
    }

    try {
      const importJobId = String(req.query.importJobId || "").trim();
      const query = String(req.query.q || "").trim();
      if (!importJobId) {
        res.status(400).json({ error: "缺少 importJobId。" });
        return;
      }
      if (!query) {
        res.json({ candidates: [] });
        return;
      }
      res.json({
        candidates: await searchClosedLoopReviewCandidates(importJobId, query),
      });
    } catch (error: any) {
      console.error(error);
      res.status(error?.statusCode || 500).json({
        error: error.message || "搜索候选主线索失败。",
      });
    }
  });

  app.post("/api/closed-loop/review-decision", async (req, res) => {
    if (!ensureClosedLoopApiAccess(req, res, "review")) {
      return;
    }

    try {
      const body = (req.body || {}) as {
        importJobId?: string;
        xhsLeadId?: string;
        decisionType?: "confirm_match" | "change_match" | "mark_unmatched" | "override_field";
        actor?: string;
        note?: string;
        nextCrmLeadId?: string | null;
      };

      if (!body.importJobId || !body.xhsLeadId || !body.decisionType) {
        res.status(400).json({ error: "缺少复核参数。" });
        return;
      }

      res.json(
        await applyClosedLoopReviewDecision({
          importJobId: body.importJobId,
          xhsLeadId: body.xhsLeadId,
          decisionType: body.decisionType,
          actor: body.actor,
          note: body.note,
          nextCrmLeadId: body.nextCrmLeadId,
        }),
      );
    } catch (error: any) {
      console.error(error);
      res.status(error?.statusCode || 500).json({
        error: error.message || "复核写入失败。",
      });
    }
  });

  app.get("/api/closed-loop/snapshot", async (req, res) => {
    if (!ensureClosedLoopApiAccess(req, res, "read")) {
      return;
    }

    try {
      const importJobId = String(req.query.importJobId || "").trim();
      if (!importJobId) {
        res.status(400).json({ error: "缺少 importJobId。" });
        return;
      }
      res.json({ snapshot: await getClosedLoopSnapshot(importJobId) });
    } catch (error: any) {
      console.error(error);
      res.status(error?.statusCode || 500).json({
        error: error.message || "读取闭环分析快照失败。",
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, HOST, (error?: Error) => {
    if (error) {
      throw error;
    }

    const address = server.address();
    const port = typeof address === "object" && address ? address.port : PORT;
    console.log(`Server running on http://localhost:${port}`);
  });
}

const isDirectExecution =
  Boolean(process.argv[1]) &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

const loadLocalDotenv = async () => {
  const dotenvModuleName = "dotenv";
  const dotenv = await import(dotenvModuleName);
  dotenv.config({ path: ".env.local", override: true });
  dotenv.config();
};

if (isDirectExecution) {
  void (async () => {
    await loadLocalDotenv();
    await startServer();
  })();
}
