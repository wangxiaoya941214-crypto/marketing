import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { pathToFileURL } from "url";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import {
  appendInsightsToReportPrompt,
  generateInsights,
} from "./shared/ai-insight-engine";
import { auditOrderConsistency } from "./shared/adapters/lead-sheet/audit-order-consistency";
import {
  buildMarketingInputFromLeads,
  type LeadSheetAdapterSidecar,
} from "./shared/adapters/lead-sheet/build-marketing-input-from-leads";
import {
  detectLeadSheet,
  type TabularSheet,
} from "./shared/adapters/lead-sheet/detect-lead-sheet";
import { normalizeLeadRows } from "./shared/adapters/lead-sheet/normalize-lead-row";
import {
  analyzeMarketingInput,
  buildAiPrompt,
  createEmptyInput,
  mergeMarketingInput,
  parseMarketingInputText,
  parseTemplateCsv,
  type MarketingInput,
} from "./shared/marketing-engine";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const DEFAULT_LOCAL_OPENAI_MODEL = "gpt-5.4";
const DEFAULT_PRODUCTION_OPENAI_MODEL = "claude-sonnet-4-5-20250929-thinking";
const DEFAULT_PRODUCTION_OPENAI_BASE_URL = "https://yunwu.ai/v1";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const SILICONFLOW_BASE_URL = process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1";
const SILICONFLOW_MODEL = process.env.SILICONFLOW_MODEL || "Qwen/Qwen3.5-397B-A17B";
const readEnv = (value?: string) => value?.trim() || undefined;
const OPENAI_API_KEY = IS_PRODUCTION
  ? readEnv(process.env.YUNWU_API_KEY) || readEnv(process.env.OPENAI_API_KEY)
  : readEnv(process.env.OPENAI_API_KEY);
const OPENAI_MODEL = IS_PRODUCTION
  ? readEnv(process.env.YUNWU_MODEL) ||
    readEnv(process.env.OPENAI_MODEL) ||
    DEFAULT_PRODUCTION_OPENAI_MODEL
  : readEnv(process.env.OPENAI_MODEL) || DEFAULT_LOCAL_OPENAI_MODEL;
const OPENAI_BASE_URL = IS_PRODUCTION
  ? readEnv(process.env.YUNWU_BASE_URL) ||
    readEnv(process.env.OPENAI_BASE_URL) ||
    DEFAULT_PRODUCTION_OPENAI_BASE_URL
  : readEnv(process.env.OPENAI_BASE_URL);

const createOpenAiClient = () =>
  new OpenAI({
    apiKey: OPENAI_API_KEY,
    baseURL: OPENAI_BASE_URL,
  });

export type UploadedFileInfo = {
  name?: string;
  mimeType?: string;
  data?: string;
};

export type AnalyzeRequestBody = {
  input?: MarketingInput;
  rawText?: string;
  fileInfo?: UploadedFileInfo;
};

type ParsedUploadResult = {
  patch: Partial<MarketingInput>;
  rawText: string;
  sidecar?: LeadSheetAdapterSidecar;
};

type RecognizedIntakeResult = {
  patch: Partial<MarketingInput>;
  rawText: string;
  mode: string;
  sidecar?: LeadSheetAdapterSidecar;
};

const buildRecognitionPrompt = () => `
你是一个营销数据识别助手。
请从用户上传的文件中识别 SUPEREV 营销分析所需字段，并且只返回 JSON，不要加解释。

规则：
1. 只提取文件中明确出现的数据，不能估算。
2. 没有出现的数字用 null，文本用 ""。
3. product 字段只能填 "flexible"、"super" 或 ""。
4. 如果文件里出现“灵活订阅”“超级订阅”相关内容，请按产品拆分。
5. contents 里每个内容对象，只保留真正识别到的条目。

JSON 结构：
{
  "periodStart": "",
  "periodEnd": "",
  "targets": {
    "flexible": null,
    "super": null
  },
  "cpsRedlines": {
    "flexible": null,
    "super": null
  },
  "spend": {
    "flexible": null,
    "super": null,
    "brand": null,
    "total": null
  },
  "funnel": {
    "leads": { "total": null, "flexible": null, "super": null },
    "privateDomain": { "total": null, "flexible": null, "super": null },
    "highIntent": { "total": null, "flexible": null, "super": null },
    "deals": { "total": null, "flexible": null, "super": null }
  },
  "contents": [
    {
      "name": "",
      "link": "",
      "product": "",
      "board": "",
      "views": null,
      "intentComments": null,
      "privateMessages": null,
      "leads": null,
      "spend": null,
      "highIntent": null,
      "deals": null,
      "creativeSummary": ""
    }
  ],
  "creativeNotes": "",
  "anomalyNotes": "",
  "benchmarkLinks": "",
  "rawInput": ""
}
`;

const isWordDocument = (fileInfo: UploadedFileInfo) =>
  fileInfo.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
  fileInfo.name?.toLowerCase().endsWith(".docx");

const isTextLikeMimeType = (mimeType: string) =>
  mimeType.startsWith("text/") ||
  mimeType === "application/json" ||
  mimeType === "application/csv" ||
  mimeType === "text/csv";

const isCsvFile = (fileInfo: UploadedFileInfo) =>
  fileInfo.mimeType === "text/csv" ||
  fileInfo.mimeType === "application/csv" ||
  fileInfo.name?.toLowerCase().endsWith(".csv");

const isExcelFile = (fileInfo: UploadedFileInfo) =>
  fileInfo.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
  fileInfo.mimeType === "application/vnd.ms-excel" ||
  fileInfo.name?.toLowerCase().endsWith(".xlsx") ||
  fileInfo.name?.toLowerCase().endsWith(".xls");

const readWorkbookSheets = (buffer: Buffer): TabularSheet[] => {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
  });

  return workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils
      .sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        raw: false,
        defval: "",
      })
      .map((row) => row.map((cell) => String(cell ?? "").trim()));

    return {
      name: sheetName,
      rows,
    };
  });
};

const buildWorkbookRawText = (sheets: TabularSheet[]) =>
  sheets
    .map((sheet) => {
      const visibleRows = sheet.rows.slice(0, 400);
      const lines = visibleRows.map((row) => row.join("\t")).join("\n");
      const suffix =
        sheet.rows.length > visibleRows.length
          ? `\n... 其余 ${sheet.rows.length - visibleRows.length} 行已省略`
          : "";
      return `### Sheet: ${sheet.name}\n${lines}${suffix}`;
    })
    .join("\n\n");

export async function parseUploadedFile(
  fileInfo?: UploadedFileInfo,
): Promise<ParsedUploadResult> {
  if (!fileInfo?.data) {
    return { patch: {}, rawText: "" };
  }

  const mimeType = fileInfo.mimeType || "application/octet-stream";
  const buffer = Buffer.from(fileInfo.data, "base64");

  if (isWordDocument(fileInfo)) {
    const result = await mammoth.extractRawText({ buffer });
    return {
      patch: parseMarketingInputText(result.value),
      rawText: result.value,
    };
  }

  if (isCsvFile(fileInfo)) {
    const text = buffer.toString("utf8");
    return {
      patch: parseTemplateCsv(text),
      rawText: text,
    };
  }

  if (isExcelFile(fileInfo)) {
    const sheets = readWorkbookSheets(buffer);
    const rawText = buildWorkbookRawText(sheets);
    const detection = detectLeadSheet(sheets);

    if (detection.kind === "lead_detail_sheet") {
      const normalized = normalizeLeadRows(sheets, detection);
      const orderAudit = auditOrderConsistency(normalized.rows);
      const built = buildMarketingInputFromLeads({
        detection,
        rows: normalized.rows,
        rawText,
        orderAudit,
        missingFields: normalized.missingFields,
      });

      return {
        patch: built.input,
        rawText,
        sidecar: built.sidecar,
      };
    }

    return {
      patch: parseMarketingInputText(rawText),
      rawText,
    };
  }

  if (isTextLikeMimeType(mimeType)) {
    const text = buffer.toString("utf8");
    return {
      patch: parseMarketingInputText(text),
      rawText: text,
    };
  }

  throw new Error("新版分析引擎建议上传模板文本、CSV 或 Word(.docx) 文件。图片/PDF 请先整理成模板数据后再导入。");
}

const safeJsonParse = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1]);
    }
    throw new Error("识别结果不是有效 JSON。");
  }
};

async function recognizeUploadedFileWithAi(
  fileInfo: UploadedFileInfo,
): Promise<RecognizedIntakeResult> {
  const mimeType = fileInfo.mimeType || "application/octet-stream";

  const tryOpenAiRecognition = async () => {
    const openai = createOpenAiClient();
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildRecognitionPrompt() },
            {
              type: "input_file",
              file_data: `data:${mimeType};base64,${fileInfo.data}`,
              filename: fileInfo.name || "upload",
            } as any,
          ] as any,
        },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("OpenAI 没有返回识别结果。");
    }

    return {
      patch: safeJsonParse(text) as Partial<MarketingInput>,
      rawText: text,
      mode: `AI识别（${OPENAI_MODEL}）`,
      sidecar: undefined,
    };
  };

  const tryGeminiRecognition = async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const parts: any[] = [{ text: buildRecognitionPrompt() }];
    parts.push({
      inlineData: {
        data: fileInfo.data,
        mimeType,
      },
    });

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
      } as any,
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error("Gemini 没有返回识别结果。");
    }

    return {
      patch: safeJsonParse(text) as Partial<MarketingInput>,
      rawText: text,
      mode: `AI识别（${GEMINI_MODEL}）`,
      sidecar: undefined,
    };
  };

  let lastError: unknown = null;

  if (OPENAI_API_KEY) {
    try {
      return await tryOpenAiRecognition();
    } catch (error) {
      lastError = error;
    }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      return await tryGeminiRecognition();
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error(
    IS_PRODUCTION
      ? "图片 / PDF 智能识别目前需要先配置 YUNWU_API_KEY（或 OPENAI_API_KEY）或 GEMINI_API_KEY。"
      : "图片 / PDF 智能识别目前需要先配置 OPENAI_API_KEY 或 GEMINI_API_KEY。",
  );
}

export async function recognizeIntake(body: AnalyzeRequestBody): Promise<RecognizedIntakeResult> {
  if (body.fileInfo?.data) {
    const mimeType = body.fileInfo.mimeType || "application/octet-stream";
    if (
      isWordDocument(body.fileInfo) ||
      isCsvFile(body.fileInfo) ||
      isExcelFile(body.fileInfo) ||
      isTextLikeMimeType(mimeType)
    ) {
      const parsed = await parseUploadedFile(body.fileInfo);
      return {
        patch: parsed.patch,
        rawText: parsed.rawText,
        sidecar: parsed.sidecar,
        mode: (() => {
          if (parsed.sidecar?.sheetType === "lead_detail_sheet") {
            return "主线索表识别（XLSX）";
          }
          if (isCsvFile(body.fileInfo)) {
            return "模板识别（CSV）";
          }
          if (isExcelFile(body.fileInfo)) {
            return "工作簿读取（XLSX）";
          }
          return "规则识别";
        })(),
      };
    }
    return recognizeUploadedFileWithAi(body.fileInfo);
  }

  if (body.rawText?.trim()) {
    return {
      patch: parseMarketingInputText(body.rawText),
      rawText: body.rawText,
      mode: "规则识别",
      sidecar: undefined,
    };
  }

  return {
    patch: {},
    rawText: "",
    mode: "无识别输入",
    sidecar: undefined,
  };
}

async function generateAiEnhancedReport(prompt: string) {
  const tryOpenAiReport = async () => {
    const openai = createOpenAiClient();
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.choices[0]?.message?.content?.trim();
    if (text && text.includes("模块一") && text.includes("模块六")) {
      return {
        mode: `AI增强（${OPENAI_MODEL}）`,
        report: text,
      };
    }
    throw new Error("OpenAI 返回内容不完整。");
  };

  const tryGeminiReport = async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ text: prompt }],
    });
    const text = response.text?.trim();
    if (text && text.includes("模块一") && text.includes("模块六")) {
      return {
        mode: `AI增强（${GEMINI_MODEL}）`,
        report: text,
      };
    }
    throw new Error("Gemini 返回内容不完整。");
  };

  const trySiliconFlowReport = async () => {
    const siliconflow = new OpenAI({
      apiKey: process.env.SILICONFLOW_API_KEY,
      baseURL: SILICONFLOW_BASE_URL,
    });
    const response = await siliconflow.chat.completions.create({
      model: SILICONFLOW_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });
    const text = response.choices[0]?.message?.content?.trim();
    if (text && text.includes("模块一") && text.includes("模块六")) {
      return {
        mode: `AI增强（${SILICONFLOW_MODEL} @ SiliconFlow）`,
        report: text,
      };
    }
    throw new Error("SiliconFlow 返回内容不完整。");
  };

  let lastError: unknown = null;

  if (OPENAI_API_KEY) {
    try {
      return await tryOpenAiReport();
    } catch (error) {
      lastError = error;
    }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      return await tryGeminiReport();
    } catch (error) {
      lastError = error;
    }
  }

  if (process.env.SILICONFLOW_API_KEY) {
    try {
      return await trySiliconFlowReport();
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return null;
}

export const buildRecognizeInputResponse = async (body: AnalyzeRequestBody) => {
  const recognized = await recognizeIntake(body);
  let merged = createEmptyInput();
  merged = mergeMarketingInput(merged, recognized.patch);
  if (body.input) {
    merged = mergeMarketingInput(merged, body.input);
  }
  merged.rawInput = [recognized.rawText, body.rawText, body.input?.rawInput]
    .filter(Boolean)
    .join("\n\n");

  const result = analyzeMarketingInput(merged);

  return {
    recognizedInput: result.normalizedInput,
    dashboardPreview: result.dashboard,
    recognitionMode: recognized.mode,
    importAudit: recognized.sidecar || null,
  };
};

export async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "50mb" }));

  app.use((err: any, req: any, res: any, next: any) => {
    if (err.type === "entity.too.large") {
      res.status(413).json({ error: "请求体过大，请减少上传内容后重试。" });
    } else {
      next(err);
    }
  });

  app.post("/api/analyze", async (req, res) => {
    const body = (req.body || {}) as AnalyzeRequestBody;

    try {
      const parsedFile = await parseUploadedFile(body.fileInfo);
      const parsedRawText = body.rawText ? parseMarketingInputText(body.rawText) : {};

      let merged = createEmptyInput();
      merged = mergeMarketingInput(merged, parsedFile.patch);
      merged = mergeMarketingInput(merged, parsedRawText);
      if (body.input) {
        merged = mergeMarketingInput(merged, body.input);
      }

      merged.rawInput = [parsedFile.rawText, body.rawText, body.input?.rawInput]
        .filter(Boolean)
        .join("\n\n");

      const result = analyzeMarketingInput(merged);
      const insights = await generateInsights(result.dashboard, result.normalizedInput);
      let analysis = result.fallbackReport;
      let engineMode = "规则保底引擎";

      try {
        const aiResult = await generateAiEnhancedReport(
          appendInsightsToReportPrompt(buildAiPrompt(result), insights),
        );
        if (aiResult) {
          analysis = aiResult.report;
          engineMode = aiResult.mode;
        }
      } catch (error) {
        console.error("AI enhancement failed, using fallback report:", error);
      }

      res.json({
        analysis,
        dashboard: result.dashboard,
        normalizedInput: result.normalizedInput,
        insights,
        engineMode,
      });
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
      res.json(await buildRecognizeInputResponse(body));
    } catch (error: any) {
      console.error(error);
      res.status(500).json({
        error: error.message || "文件识别失败，请换一个文件格式或改用手动补录。",
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

  const server = app.listen(PORT, "0.0.0.0", (error?: Error) => {
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

if (isDirectExecution) {
  startServer();
}
