import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import mammoth from "mammoth";
import {
  analyzeMarketingInput,
  buildAiPrompt,
  createEmptyInput,
  mergeMarketingInput,
  parseMarketingInputText,
  parseTemplateCsv,
  type MarketingInput,
} from "./shared/marketing-engine";

dotenv.config({ path: ".env.local" });
dotenv.config();

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const SILICONFLOW_BASE_URL = process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1";
const SILICONFLOW_MODEL = process.env.SILICONFLOW_MODEL || "Qwen/Qwen3.5-397B-A17B";
const OPENAI_MODEL = process.env.OPENAI_MODEL || (IS_PRODUCTION ? "gpt-4.1-mini" : "gpt-5.4");

type UploadedFileInfo = {
  name?: string;
  mimeType?: string;
  data?: string;
};

type AnalyzeRequestBody = {
  input?: MarketingInput;
  rawText?: string;
  fileInfo?: UploadedFileInfo;
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

async function parseUploadedFile(
  fileInfo?: UploadedFileInfo,
): Promise<{ patch: Partial<MarketingInput>; rawText: string }> {
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

async function recognizeUploadedFileWithAi(fileInfo: UploadedFileInfo) {
  const mimeType = fileInfo.mimeType || "application/octet-stream";

  const tryOpenAiRecognition = async () => {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
    };
  };

  if (!IS_PRODUCTION && process.env.OPENAI_API_KEY) {
    return tryOpenAiRecognition();
  }

  if (process.env.GEMINI_API_KEY) {
    return tryGeminiRecognition();
  }

  if (process.env.OPENAI_API_KEY) {
    return tryOpenAiRecognition();
  }

  throw new Error("图片 / PDF 智能识别目前需要先配置 GEMINI_API_KEY 或 OPENAI_API_KEY。SiliconFlow 当前用于文本分析增强。");
}

async function recognizeIntake(body: AnalyzeRequestBody) {
  if (body.fileInfo?.data) {
    const mimeType = body.fileInfo.mimeType || "application/octet-stream";
    if (isWordDocument(body.fileInfo) || isCsvFile(body.fileInfo) || isTextLikeMimeType(mimeType)) {
      const parsed = await parseUploadedFile(body.fileInfo);
      return {
        patch: parsed.patch,
        rawText: parsed.rawText,
        mode: isCsvFile(body.fileInfo) ? "模板识别（CSV）" : "规则识别",
      };
    }
    return recognizeUploadedFileWithAi(body.fileInfo);
  }

  if (body.rawText?.trim()) {
    return {
      patch: parseMarketingInputText(body.rawText),
      rawText: body.rawText,
      mode: "规则识别",
    };
  }

  return {
    patch: {},
    rawText: "",
    mode: "无识别输入",
  };
}

async function generateAiEnhancedReport(prompt: string) {
  const tryOpenAiReport = async () => {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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

  if (!IS_PRODUCTION && process.env.OPENAI_API_KEY) {
    return tryOpenAiReport();
  }

  if (IS_PRODUCTION && process.env.SILICONFLOW_API_KEY) {
    return trySiliconFlowReport();
  }

  if (process.env.GEMINI_API_KEY) {
    return tryGeminiReport();
  }

  if (process.env.SILICONFLOW_API_KEY) {
    return trySiliconFlowReport();
  }

  if (process.env.OPENAI_API_KEY) {
    return tryOpenAiReport();
  }

  return null;
}

async function startServer() {
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
      let analysis = result.fallbackReport;
      let engineMode = "规则保底引擎";

      try {
        const aiResult = await generateAiEnhancedReport(buildAiPrompt(result));
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

      res.json({
        recognizedInput: result.normalizedInput,
        dashboardPreview: result.dashboard,
        recognitionMode: recognized.mode,
      });
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
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
