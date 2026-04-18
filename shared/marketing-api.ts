import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import {
  appendInsightsToReportPrompt,
  createEmptyInsightResult,
  generateInsights,
} from "./ai-insight-engine.ts";
import { getCriticalAnalysisReadiness } from "./analysis-readiness.ts";
import {
  isTimeoutError,
  summarizeError,
  withTimeout,
} from "./async-utils.ts";
import { auditOrderConsistency } from "./adapters/lead-sheet/audit-order-consistency.ts";
import {
  buildMarketingInputFromLeads,
  type LeadSheetAdapterSidecar,
} from "./adapters/lead-sheet/build-marketing-input-from-leads.ts";
import {
  detectLeadSheet,
  type TabularSheet,
} from "./adapters/lead-sheet/detect-lead-sheet.ts";
import { normalizeLeadRows } from "./adapters/lead-sheet/normalize-lead-row.ts";
import { buildClosedLoopMarketingInput } from "./closed-loop/marketing-input.ts";
import {
  looksLikeClosedLoopWorkbook,
  parseClosedLoopWorkbook,
} from "./closed-loop/workbook.ts";
import {
  analyzeMarketingInput,
  auditMarketingInput,
  buildAiPrompt,
  createEmptyInput,
  mergeMarketingInput,
  parseMarketingInputText,
  parseTemplateCsv,
  type MarketingInput,
} from "./marketing-engine.ts";
import { buildLeadSheetModeSummary } from "./lead-sheet-mode.ts";
import type {
  RecognitionAudit,
  RecognitionExtractor,
  RecognitionSourceType,
} from "./recognition-audit.ts";
import type { AnalyzeRequestBody, UploadedFileInfo } from "./http-contracts.ts";

type ParsedUploadResult = {
  patch: Partial<MarketingInput>;
  rawText: string;
  sidecar?: LeadSheetAdapterSidecar;
  mode?: string;
  structuredWorkbookType?: "lead_sheet" | "closed_loop_workbook";
};

type RecognizedIntakeResult = {
  patch: Partial<MarketingInput>;
  rawText: string;
  mode: string;
  sidecar?: LeadSheetAdapterSidecar;
  recognitionAudit?: RecognitionAudit;
  structuredWorkbookType?: "lead_sheet" | "closed_loop_workbook";
};

export type AnalyzeResponsePayload = {
  analysis: string;
  dashboard: ReturnType<typeof analyzeMarketingInput>["dashboard"];
  normalizedInput: MarketingInput;
  insights: ReturnType<typeof createEmptyInsightResult>;
  engineMode: string;
};

export type AnalyzeResponseDependencies = {
  generateInsightsImpl?: typeof generateInsights;
  generateAiEnhancedReportImpl?: typeof generateAiEnhancedReport;
};

const DEFAULT_LOCAL_OPENAI_MODEL = "gpt-5.4";
const DEFAULT_PRODUCTION_OPENAI_MODEL = "claude-sonnet-4-5-20250929-thinking";
const DEFAULT_PRODUCTION_OPENAI_BASE_URL = "https://yunwu.ai/v1";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1";
const DEFAULT_SILICONFLOW_MODEL = "Qwen/Qwen3.5-397B-A17B";

const readEnv = (value?: string) => value?.trim() || undefined;

const getRuntimeConfig = () => {
  const isProduction = process.env.NODE_ENV === "production";
  const openAiApiKey = isProduction
    ? readEnv(process.env.YUNWU_API_KEY) || readEnv(process.env.OPENAI_API_KEY)
    : readEnv(process.env.OPENAI_API_KEY);

  return {
    isProduction,
    openAiApiKey,
    openAiModel: isProduction
      ? readEnv(process.env.YUNWU_MODEL) ||
        readEnv(process.env.OPENAI_MODEL) ||
        DEFAULT_PRODUCTION_OPENAI_MODEL
      : readEnv(process.env.OPENAI_MODEL) || DEFAULT_LOCAL_OPENAI_MODEL,
    openAiBaseUrl: isProduction
      ? readEnv(process.env.YUNWU_BASE_URL) ||
        readEnv(process.env.OPENAI_BASE_URL) ||
        DEFAULT_PRODUCTION_OPENAI_BASE_URL
      : readEnv(process.env.OPENAI_BASE_URL),
    geminiModel: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    aiInsightsTimeoutMs: Number(process.env.AI_INSIGHTS_TIMEOUT_MS) || 12_000,
    aiReportTimeoutMs: Number(process.env.AI_REPORT_TIMEOUT_MS) || 30_000,
    siliconFlowBaseUrl:
      process.env.SILICONFLOW_BASE_URL || DEFAULT_SILICONFLOW_BASE_URL,
    siliconFlowModel: process.env.SILICONFLOW_MODEL || DEFAULT_SILICONFLOW_MODEL,
  };
};

const createOpenAiClient = () => {
  const runtime = getRuntimeConfig();
  return new OpenAI({
    apiKey: runtime.openAiApiKey,
    baseURL: runtime.openAiBaseUrl,
  });
};

const roundDuration = (startedAt: number) =>
  Math.round((globalThis.performance?.now?.() ?? Date.now()) - startedAt);

const createRequestTimer = (requestId: string) => {
  const requestStartedAt = globalThis.performance?.now?.() ?? Date.now();

  return {
    logStage: (
      stage: string,
      startedAt: number,
      status: "success" | "error" | "timeout" | "fallback",
      details: Record<string, unknown> = {},
    ) => {
      console.info(
        "[api/analyze]",
        JSON.stringify({
          requestId,
          stage,
          status,
          durationMs: roundDuration(startedAt),
          ...details,
        }),
      );
    },
    logTotal: (engineMode: string) => {
      console.info(
        "[api/analyze]",
        JSON.stringify({
          requestId,
          stage: "total",
          status: "success",
          durationMs: roundDuration(requestStartedAt),
          engineMode,
        }),
      );
    },
  };
};

const buildRecognitionPrompt = () => `
你是一个营销数据识别助手。
请从用户上传的截图、PDF、图片、文档或 Excel 导出的表格内容中识别 SUPEREV 营销分析所需字段，并且只返回 JSON，不要加解释。

总原则：
1. 只提取文件中明确出现的数据，不能估算、不能反推、不能脑补。
2. 如果数值看不清、单位不明确、归属不明确，数字填 null；文本填 ""。
3. 优先识别表格和带表头区域；同一页如果既有表格又有文字说明，数值以表格为准，说明归到 notes 类字段。
4. 不要根据总数反推 flexible/super，也不要根据分项相加反推 total。
5. 如果只看到总数，没有明确产品拆分，就只填 total，flexible/super 保持 null。
6. product 字段只能填 "flexible"、"super" 或 ""；如果文件里出现“灵活订阅”“超级订阅”相关内容，请按产品拆分。
7. 同义词映射：
   - 留资 / 客资 / 线索 -> leads
   - 转私域 / 加微 / 加微信 / 私域沉淀 -> privateDomain
   - 高意向 / 强意向 / A类意向 -> highIntent
   - 成交 / 签单 / 成单 / 交车 -> deals
8. contents 里每个内容对象，只保留真正识别到的条目。没有 name、link、creativeSummary 且没有关键数值的内容不要保留。
9. 如果两条内容的 name 和 link 都相同，视为同一条；同名但没有 link 时，只有文件里明确是同一素材才合并。
10. creativeNotes 只放素材/创意/卖点说明；anomalyNotes 只放异常说明；benchmarkLinks 只放优秀案例或参考链接。
11. previous 是上期数据（选填）。如果文件中出现“上期 / 上月 / 前一周期”相关指标，请按字段填写。
12. 百分比字段如果原文写“5%”，请在 JSON 里填 5。

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
  "previous": {
    "totalDeals": null,
    "flexibleDeals": null,
    "superDeals": null,
    "overallCps": null,
    "flexibleCps": null,
    "superCps": null,
    "cpl": null,
    "overallConversionRate": null,
    "totalSpend": null
  },
  "creativeNotes": "",
  "anomalyNotes": "",
  "benchmarkLinks": "",
  "rawInput": ""
}
`;

const isWordDocument = (fileInfo: UploadedFileInfo) =>
  fileInfo.mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
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
  fileInfo.mimeType ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
  fileInfo.mimeType === "application/vnd.ms-excel" ||
  fileInfo.name?.toLowerCase().endsWith(".xlsx") ||
  fileInfo.name?.toLowerCase().endsWith(".xls");

const isPdfFile = (fileInfo: UploadedFileInfo) =>
  fileInfo.mimeType === "application/pdf" ||
  fileInfo.name?.toLowerCase().endsWith(".pdf");

const isImageFile = (fileInfo: UploadedFileInfo) =>
  fileInfo.mimeType?.startsWith("image/") ||
  /\.(png|jpe?g|webp|bmp|gif)$/i.test(fileInfo.name || "");

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
        mode: "主线索表识别（XLSX）",
        structuredWorkbookType: "lead_sheet",
      };
    }

    if (looksLikeClosedLoopWorkbook(sheets.map((sheet) => sheet.name))) {
      const bundle = parseClosedLoopWorkbook(buffer, "__recognize_closed_loop__");
      return {
        patch: buildClosedLoopMarketingInput(bundle),
        rawText,
        mode: "闭环底座识别（XLSX）",
        structuredWorkbookType: "closed_loop_workbook",
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

  throw new Error(
    "新版分析引擎建议上传模板文本、CSV 或 Word(.docx) 文件。图片/PDF 请先整理成模板数据后再导入。",
  );
}

const safeJsonParse = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    const fenced =
      text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1]);
    }
    throw new Error("识别结果不是有效 JSON。");
  }
};

const isStructuredSourceType = (sourceType: RecognitionSourceType) =>
  sourceType !== "image" && sourceType !== "pdf";

const getRecognitionSourceType = (
  body: AnalyzeRequestBody,
): RecognitionSourceType => {
  if (body.fileInfo?.data) {
    if (isCsvFile(body.fileInfo)) return "csv";
    if (isExcelFile(body.fileInfo)) return "xlsx";
    if (isWordDocument(body.fileInfo)) return "docx";
    if (isPdfFile(body.fileInfo)) return "pdf";
    if (isImageFile(body.fileInfo)) return "image";
    return "text";
  }
  return "rawText";
};

const buildRecognitionTextPrompt = (
  text: string,
  sourceType: RecognitionSourceType,
) => `
${buildRecognitionPrompt()}

【当前识别来源】
${sourceType}

【待识别内容】
${text}
`;

const stripSignalPrefix = (value: string) =>
  value.replace(/^[⚠️🚨⛔📌💡]+\s*/u, "").trim();

const hasRecognitionAiProvider = () => {
  const runtime = getRuntimeConfig();
  return Boolean(runtime.openAiApiKey || process.env.GEMINI_API_KEY);
};

const hasMeaningfulContentIdentity = (
  content: MarketingInput["contents"][number],
) =>
  Boolean(content.name.trim() || content.link.trim() || content.creativeSummary.trim());

const normalizeIdentity = (value: string) => value.trim().toLowerCase();

const fillMissingText = (current: string, incoming: string) =>
  current.trim() || !incoming.trim() ? current : incoming;

const fillMissingNumber = (current: number | null, incoming: number | null) =>
  current === null && incoming !== null ? incoming : current;

const fillMissingContentFields = (
  current: MarketingInput["contents"][number],
  incoming: MarketingInput["contents"][number],
) => {
  current.name = fillMissingText(current.name, incoming.name);
  current.link = fillMissingText(current.link, incoming.link);
  current.product = current.product || incoming.product;
  current.board = fillMissingText(current.board, incoming.board);
  current.views = fillMissingNumber(current.views, incoming.views);
  current.intentComments = fillMissingNumber(
    current.intentComments,
    incoming.intentComments,
  );
  current.privateMessages = fillMissingNumber(
    current.privateMessages,
    incoming.privateMessages,
  );
  current.leads = fillMissingNumber(current.leads, incoming.leads);
  current.spend = fillMissingNumber(current.spend, incoming.spend);
  current.highIntent = fillMissingNumber(current.highIntent, incoming.highIntent);
  current.deals = fillMissingNumber(current.deals, incoming.deals);
  current.creativeSummary = fillMissingText(
    current.creativeSummary,
    incoming.creativeSummary,
  );
};

const mergeRuleFirstWithAiPatch = (
  ruleInput: MarketingInput,
  aiPatch: Partial<MarketingInput>,
  options?: { lockLeadSheetCore?: boolean },
) => {
  const next = mergeMarketingInput(createEmptyInput(), ruleInput);
  const aiInput = mergeMarketingInput(createEmptyInput(), aiPatch);
  const lockLeadSheetCore = Boolean(options?.lockLeadSheetCore);

  if (!lockLeadSheetCore) {
    next.periodStart = fillMissingText(next.periodStart, aiInput.periodStart);
    next.periodEnd = fillMissingText(next.periodEnd, aiInput.periodEnd);
    next.funnel = {
      leads: {
        total: fillMissingNumber(
          next.funnel.leads.total,
          aiInput.funnel.leads.total,
        ),
        flexible: fillMissingNumber(
          next.funnel.leads.flexible,
          aiInput.funnel.leads.flexible,
        ),
        super: fillMissingNumber(
          next.funnel.leads.super,
          aiInput.funnel.leads.super,
        ),
      },
      privateDomain: {
        total: fillMissingNumber(
          next.funnel.privateDomain.total,
          aiInput.funnel.privateDomain.total,
        ),
        flexible: fillMissingNumber(
          next.funnel.privateDomain.flexible,
          aiInput.funnel.privateDomain.flexible,
        ),
        super: fillMissingNumber(
          next.funnel.privateDomain.super,
          aiInput.funnel.privateDomain.super,
        ),
      },
      highIntent: {
        total: fillMissingNumber(
          next.funnel.highIntent.total,
          aiInput.funnel.highIntent.total,
        ),
        flexible: fillMissingNumber(
          next.funnel.highIntent.flexible,
          aiInput.funnel.highIntent.flexible,
        ),
        super: fillMissingNumber(
          next.funnel.highIntent.super,
          aiInput.funnel.highIntent.super,
        ),
      },
      deals: {
        total: fillMissingNumber(
          next.funnel.deals.total,
          aiInput.funnel.deals.total,
        ),
        flexible: fillMissingNumber(
          next.funnel.deals.flexible,
          aiInput.funnel.deals.flexible,
        ),
        super: fillMissingNumber(
          next.funnel.deals.super,
          aiInput.funnel.deals.super,
        ),
      },
    };
  }

  next.targets = {
    flexible: fillMissingNumber(next.targets.flexible, aiInput.targets.flexible),
    super: fillMissingNumber(next.targets.super, aiInput.targets.super),
  };
  next.cpsRedlines = {
    flexible: fillMissingNumber(
      next.cpsRedlines.flexible,
      aiInput.cpsRedlines.flexible,
    ),
    super: fillMissingNumber(next.cpsRedlines.super, aiInput.cpsRedlines.super),
  };
  next.spend = {
    flexible: fillMissingNumber(next.spend.flexible, aiInput.spend.flexible),
    super: fillMissingNumber(next.spend.super, aiInput.spend.super),
    brand: fillMissingNumber(next.spend.brand, aiInput.spend.brand),
    total: fillMissingNumber(next.spend.total, aiInput.spend.total),
  };
  next.previous = {
    totalDeals: fillMissingNumber(
      next.previous.totalDeals,
      aiInput.previous.totalDeals,
    ),
    flexibleDeals: fillMissingNumber(
      next.previous.flexibleDeals,
      aiInput.previous.flexibleDeals,
    ),
    superDeals: fillMissingNumber(
      next.previous.superDeals,
      aiInput.previous.superDeals,
    ),
    overallCps: fillMissingNumber(
      next.previous.overallCps,
      aiInput.previous.overallCps,
    ),
    flexibleCps: fillMissingNumber(
      next.previous.flexibleCps,
      aiInput.previous.flexibleCps,
    ),
    superCps: fillMissingNumber(
      next.previous.superCps,
      aiInput.previous.superCps,
    ),
    cpl: fillMissingNumber(next.previous.cpl, aiInput.previous.cpl),
    overallConversionRate: fillMissingNumber(
      next.previous.overallConversionRate,
      aiInput.previous.overallConversionRate,
    ),
    totalSpend: fillMissingNumber(
      next.previous.totalSpend,
      aiInput.previous.totalSpend,
    ),
  };
  next.creativeNotes = fillMissingText(
    next.creativeNotes,
    aiInput.creativeNotes,
  );
  next.anomalyNotes = fillMissingText(next.anomalyNotes, aiInput.anomalyNotes);
  next.benchmarkLinks = fillMissingText(
    next.benchmarkLinks,
    aiInput.benchmarkLinks,
  );

  const mergedContents = [...next.contents];
  aiInput.contents
    .filter(hasMeaningfulContentIdentity)
    .forEach((incoming) => {
      const targetIndex = mergedContents.findIndex((current) => {
        const sameNameLink =
          normalizeIdentity(current.name) &&
          normalizeIdentity(current.link) &&
          normalizeIdentity(current.name) === normalizeIdentity(incoming.name) &&
          normalizeIdentity(current.link) === normalizeIdentity(incoming.link);
        const sameLink =
          normalizeIdentity(current.link) &&
          normalizeIdentity(current.link) === normalizeIdentity(incoming.link);
        return Boolean(sameNameLink || sameLink);
      });

      if (targetIndex >= 0) {
        fillMissingContentFields(mergedContents[targetIndex], incoming);
        return;
      }

      mergedContents.push(incoming);
    });

  next.contents = mergedContents;
  next.rawInput = ruleInput.rawInput;

  return mergeMarketingInput(createEmptyInput(), next);
};

const hasValidContentRows = (input: MarketingInput) =>
  input.contents.some((content) =>
    Boolean(
      content.name ||
        content.link ||
        content.creativeSummary ||
        content.leads !== null ||
        content.spend !== null ||
        content.highIntent !== null ||
        content.deals !== null,
    ),
  );

const hasCoreFunnelData = (input: MarketingInput) =>
  [
    input.funnel.leads.total,
    input.funnel.privateDomain.total,
    input.funnel.highIntent.total,
    input.funnel.deals.total,
  ].some((value) => value !== null);

const hasPreviousMetrics = (input: MarketingInput) =>
  Object.values(input.previous).some((value) => value !== null);

const deriveRecognitionConfidence = (
  sourceType: RecognitionSourceType,
  input: MarketingInput,
  sidecar?: LeadSheetAdapterSidecar,
) => {
  const audit = auditMarketingInput(input);

  if (sourceType === "xlsx" && sidecar?.sheetType === "lead_detail_sheet") {
    if (
      sidecar.detectionConfidence >= 0.85 &&
      sidecar.missingFields.length === 0 &&
      sidecar.orderConflictCount === 0 &&
      sidecar.manualReviewDealCount === 0
    ) {
      return "high" as const;
    }

    if (
      sidecar.detectionConfidence < 0.7 ||
      sidecar.orderConflictCount > 0 ||
      sidecar.manualReviewDealCount > 0 ||
      sidecar.missingFields.length > 0
    ) {
      return "low" as const;
    }

    return "medium" as const;
  }

  if (sourceType === "csv") {
    if (audit.completenessPercent >= 85 && audit.anomalies.length === 0) {
      return "high" as const;
    }
    if (audit.completenessPercent < 65 || audit.anomalies.length > 0) {
      return "low" as const;
    }
    return "medium" as const;
  }

  if (sourceType === "image" || sourceType === "pdf") {
    if (
      audit.completenessPercent >= 75 &&
      audit.anomalies.length === 0 &&
      audit.warnings.length === 0
    ) {
      return "high" as const;
    }
    if (audit.completenessPercent < 45 || audit.anomalies.length > 0) {
      return "low" as const;
    }
    return "medium" as const;
  }

  if (
    audit.completenessPercent >= 75 &&
    (hasCoreFunnelData(input) || hasValidContentRows(input))
  ) {
    return "high" as const;
  }
  if (
    audit.completenessPercent < 45 ||
    (!hasCoreFunnelData(input) && !hasValidContentRows(input))
  ) {
    return "low" as const;
  }
  return "medium" as const;
};

const buildRecognitionAudit = (options: {
  sourceType: RecognitionSourceType;
  extractor: RecognitionExtractor;
  input: MarketingInput;
  fallbackUsed: boolean;
  sidecar?: LeadSheetAdapterSidecar;
  structuredWorkbookType?: "lead_sheet" | "closed_loop_workbook";
  extraReasons?: string[];
}) => {
  const {
    sourceType,
    extractor,
    input,
    fallbackUsed,
    sidecar,
    structuredWorkbookType,
    extraReasons = [],
  } = options;
  const audit = auditMarketingInput(input);
  const leadSheetSummary =
    sourceType === "xlsx" &&
    structuredWorkbookType === "lead_sheet" &&
    sidecar?.sheetType === "lead_detail_sheet"
      ? buildLeadSheetModeSummary(input, sidecar)
      : null;
  const confidence = deriveRecognitionConfidence(sourceType, input, sidecar);
  const reviewReasons: string[] = [];
  const recommendedFocus: string[] = [];

  if (fallbackUsed) {
    reviewReasons.push("规则抽取置信度偏低，已启用 AI 补全空白字段。");
  }

  if (
    sourceType === "xlsx" &&
    structuredWorkbookType === "lead_sheet" &&
    sidecar?.sheetType === "lead_detail_sheet"
  ) {
    const readiness =
      leadSheetSummary || {
        businessSupplementGroups: getCriticalAnalysisReadiness(input).missingGroups,
      };

    reviewReasons.push(
      `主线索表识别覆盖 ${leadSheetSummary?.recognitionPercent ?? 0}%，目标、花费、CPS 红线已改到业务补充项，不再计入识别分。`,
    );
    reviewReasons.push(
      `当前自动计入成交 ${sidecar.countedDeals} 条，保守剔除 ${sidecar.excludedConflictDealCount} 条订单冲突记录。`,
    );

    if (sidecar.detectionConfidence < 0.85) {
      reviewReasons.push(
        `表头识别置信度 ${Math.round(sidecar.detectionConfidence * 100)}%。`,
      );
    }
    if (readiness.businessSupplementGroups.length > 0) {
      reviewReasons.push(
        `业务补充项还缺 ${readiness.businessSupplementGroups.join("、")}，补齐后再生成最终分析。`,
      );
      recommendedFocus.push(...readiness.businessSupplementGroups);
    }
    if (sidecar.missingFields.length > 0) {
      reviewReasons.push(`主线索表缺少字段：${sidecar.missingFields.join("、")}。`);
      recommendedFocus.push(...sidecar.missingFields.slice(0, 3));
    }
    if (sidecar.orderConflictCount > 0) {
      reviewReasons.push(`存在 ${sidecar.orderConflictCount} 条订单冲突样本。`);
      recommendedFocus.push("订单冲突样本");
    }
    if (sidecar.manualReviewDealCount > 0) {
      reviewReasons.push(`有 ${sidecar.manualReviewDealCount} 条成交需要人工确认。`);
      recommendedFocus.push("人工确认成交");
    }
  }

  if (sourceType === "xlsx" && structuredWorkbookType === "closed_loop_workbook") {
    reviewReasons.push("已按闭环底座工作簿规则完成结构化识别。");
  }

  if (
    sourceType === "xlsx" &&
    structuredWorkbookType !== "closed_loop_workbook" &&
    !sidecar
  ) {
    reviewReasons.push("工作簿未识别为标准主线索表，当前按文本规则读取。");
    recommendedFocus.push("工作表结构");
  }

  if (!leadSheetSummary && audit.completenessPercent < 85) {
    reviewReasons.push(`字段完整度 ${audit.completenessPercent}%。`);
  }

  reviewReasons.push(...audit.warnings.map(stripSignalPrefix));
  reviewReasons.push(...audit.anomalies.map(stripSignalPrefix));
  reviewReasons.push(...extraReasons);

  if (!leadSheetSummary) {
    recommendedFocus.push(...audit.missingFields.slice(0, 3));
  }

  if (!hasValidContentRows(input)) {
    recommendedFocus.push("内容条目");
  }

  if (
    input.funnel.privateDomain.total !== null &&
    (input.funnel.privateDomain.flexible === null ||
      input.funnel.privateDomain.super === null)
  ) {
    recommendedFocus.push("分产品拆分");
  }

  if (audit.warnings.some((item) => item.includes("样本量不足"))) {
    recommendedFocus.push("样本量");
  }

  if (!hasPreviousMetrics(input)) {
    recommendedFocus.push("上期数据");
  }

  const uniqueReasons = [...new Set(reviewReasons.filter(Boolean))].slice(0, 6);
  const uniqueFocus = [...new Set(recommendedFocus.filter(Boolean))].slice(0, 5);

  return {
    extractor,
    sourceType,
    confidence,
    completenessPercent: leadSheetSummary?.recognitionPercent ?? audit.completenessPercent,
    fallbackUsed,
    reviewReasons: uniqueReasons,
    recommendedFocus: uniqueFocus,
    adapterAudit: sidecar || null,
  } satisfies RecognitionAudit;
};

async function recognizeTextWithAi(
  text: string,
  sourceType: RecognitionSourceType,
): Promise<RecognizedIntakeResult> {
  const prompt = buildRecognitionTextPrompt(text, sourceType);
  const runtime = getRuntimeConfig();

  const tryOpenAiRecognition = async () => {
    const openai = createOpenAiClient();
    const response = await openai.chat.completions.create({
      model: runtime.openAiModel,
      messages: [{ role: "user", content: prompt }],
    });
    const responseText = response.choices[0]?.message?.content?.trim();
    if (!responseText) {
      throw new Error("OpenAI 没有返回识别结果。");
    }
    return {
      patch: safeJsonParse(responseText) as Partial<MarketingInput>,
      rawText: responseText,
      mode: `AI补全（${runtime.openAiModel}）`,
      sidecar: undefined,
    };
  };

  const tryGeminiRecognition = async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: runtime.geminiModel,
      contents: [{ text: prompt }],
      config: {
        responseMimeType: "application/json",
      } as any,
    });
    const responseText = response.text?.trim();
    if (!responseText) {
      throw new Error("Gemini 没有返回识别结果。");
    }
    return {
      patch: safeJsonParse(responseText) as Partial<MarketingInput>,
      rawText: responseText,
      mode: `AI补全（${runtime.geminiModel}）`,
      sidecar: undefined,
    };
  };

  let lastError: unknown = null;

  if (runtime.openAiApiKey) {
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

  throw new Error("当前没有可用的 AI 补全模型。");
}

async function recognizeUploadedFileWithAi(
  fileInfo: UploadedFileInfo,
): Promise<RecognizedIntakeResult> {
  const mimeType = fileInfo.mimeType || "application/octet-stream";
  const runtime = getRuntimeConfig();

  const tryOpenAiRecognition = async () => {
    const openai = createOpenAiClient();
    const response = await openai.chat.completions.create({
      model: runtime.openAiModel,
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
      mode: `AI识别（${runtime.openAiModel}）`,
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
      model: runtime.geminiModel,
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
      mode: `AI识别（${runtime.geminiModel}）`,
      sidecar: undefined,
    };
  };

  let lastError: unknown = null;

  if (runtime.openAiApiKey) {
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
    runtime.isProduction
      ? "图片 / PDF 智能识别目前需要先配置 YUNWU_API_KEY（或 OPENAI_API_KEY）或 GEMINI_API_KEY。"
      : "图片 / PDF 智能识别目前需要先配置 OPENAI_API_KEY 或 GEMINI_API_KEY。",
  );
}

export async function recognizeIntake(
  body: AnalyzeRequestBody,
): Promise<RecognizedIntakeResult> {
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
        structuredWorkbookType: parsed.structuredWorkbookType,
        mode: (() => {
          if (parsed.mode) {
            return parsed.mode;
          }
          if (isCsvFile(body.fileInfo!)) {
            return "模板识别（CSV）";
          }
          if (isExcelFile(body.fileInfo!)) {
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

async function generateAiEnhancedReport(prompt: string, signal?: AbortSignal) {
  const runtime = getRuntimeConfig();

  const tryOpenAiReport = async () => {
    const openai = createOpenAiClient();
    const response = await openai.chat.completions.create(
      {
        model: runtime.openAiModel,
        messages: [{ role: "user", content: prompt }],
      },
      signal ? { signal } : undefined,
    );
    const text = response.choices[0]?.message?.content?.trim();
    if (text && text.includes("模块一") && text.includes("模块六")) {
      return {
        mode: `AI增强（${runtime.openAiModel}）`,
        report: text,
      };
    }
    throw new Error("OpenAI 返回内容不完整。");
  };

  const tryGeminiReport = async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: runtime.geminiModel,
      contents: [{ text: prompt }],
    });
    const text = response.text?.trim();
    if (text && text.includes("模块一") && text.includes("模块六")) {
      return {
        mode: `AI增强（${runtime.geminiModel}）`,
        report: text,
      };
    }
    throw new Error("Gemini 返回内容不完整。");
  };

  const trySiliconFlowReport = async () => {
    const siliconflow = new OpenAI({
      apiKey: process.env.SILICONFLOW_API_KEY,
      baseURL: runtime.siliconFlowBaseUrl,
    });
    const response = await siliconflow.chat.completions.create(
      {
        model: runtime.siliconFlowModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      },
      signal ? { signal } : undefined,
    );
    const text = response.choices[0]?.message?.content?.trim();
    if (text && text.includes("模块一") && text.includes("模块六")) {
      return {
        mode: `AI增强（${runtime.siliconFlowModel} @ SiliconFlow）`,
        report: text,
      };
    }
    throw new Error("SiliconFlow 返回内容不完整。");
  };

  let lastError: unknown = null;

  if (runtime.openAiApiKey) {
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

export const buildRecognizeInputResponse = async (
  body: AnalyzeRequestBody,
) => {
  const sourceType = getRecognitionSourceType(body);
  const recognized = await recognizeIntake(body);
  let merged = createEmptyInput();
  merged = mergeMarketingInput(merged, recognized.patch);
  if (body.input) {
    merged = mergeMarketingInput(merged, body.input);
  }
  merged.rawInput = [recognized.rawText, body.rawText, body.input?.rawInput]
    .filter(Boolean)
    .join("\n\n");

  const ruleResult = analyzeMarketingInput(merged);
  let finalResult = ruleResult;
  let finalMode = recognized.mode;
  let finalAudit = buildRecognitionAudit({
    sourceType,
        extractor: isStructuredSourceType(sourceType) ? "rule" : "ai_primary",
        input: ruleResult.normalizedInput,
        fallbackUsed: false,
        sidecar: recognized.sidecar,
        structuredWorkbookType: recognized.structuredWorkbookType,
      });
  const lowStructuredConfidence =
    isStructuredSourceType(sourceType) && finalAudit.confidence === "low";

  if (
    lowStructuredConfidence &&
    recognized.rawText.trim() &&
    hasRecognitionAiProvider()
  ) {
    try {
      const aiRecognition = await recognizeTextWithAi(
        recognized.rawText,
        sourceType,
      );
      const mergedWithAi = mergeRuleFirstWithAiPatch(
        ruleResult.normalizedInput,
        aiRecognition.patch,
        {
          lockLeadSheetCore: recognized.sidecar?.sheetType === "lead_detail_sheet",
        },
      );
      mergedWithAi.rawInput = merged.rawInput;
      finalResult = analyzeMarketingInput(mergedWithAi);
      finalMode = `${recognized.mode} + AI补全`;
      finalAudit = buildRecognitionAudit({
        sourceType,
        extractor: "rule_then_ai",
        input: finalResult.normalizedInput,
        fallbackUsed: true,
        sidecar: recognized.sidecar,
        structuredWorkbookType: recognized.structuredWorkbookType,
      });
    } catch (error) {
      console.error("AI fallback failed, keeping rule-first recognition:", error);
      finalAudit = buildRecognitionAudit({
        sourceType,
        extractor: "rule",
        input: ruleResult.normalizedInput,
        fallbackUsed: false,
        sidecar: recognized.sidecar,
        structuredWorkbookType: recognized.structuredWorkbookType,
        extraReasons: ["AI 补全未成功，当前保留规则抽取结果。"],
      });
    }
  } else if (lowStructuredConfidence && !recognized.rawText.trim()) {
    finalAudit = buildRecognitionAudit({
      sourceType,
      extractor: "rule",
      input: ruleResult.normalizedInput,
      fallbackUsed: false,
      sidecar: recognized.sidecar,
      structuredWorkbookType: recognized.structuredWorkbookType,
      extraReasons: ["规则结果缺少可送入 AI 的文本内容，当前保留规则抽取结果。"],
    });
  } else if (lowStructuredConfidence && !hasRecognitionAiProvider()) {
    finalAudit = buildRecognitionAudit({
      sourceType,
      extractor: "rule",
      input: ruleResult.normalizedInput,
      fallbackUsed: false,
      sidecar: recognized.sidecar,
      structuredWorkbookType: recognized.structuredWorkbookType,
      extraReasons: ["当前没有可用的 AI 补全模型，系统未执行兜底补全。"],
    });
  }

  return {
    recognizedInput: finalResult.normalizedInput,
    dashboardPreview: finalResult.dashboard,
    recognitionMode: finalMode,
    importAudit: recognized.sidecar || null,
    recognitionAudit: finalAudit,
  };
};

export const buildAnalyzeResponse = async (
  body: AnalyzeRequestBody,
  dependencies: AnalyzeResponseDependencies = {},
): Promise<AnalyzeResponsePayload> => {
  const runtime = getRuntimeConfig();
  const requestId = `analyze-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const timer = createRequestTimer(requestId);
  const generateInsightsImpl =
    dependencies.generateInsightsImpl || generateInsights;
  const generateAiEnhancedReportImpl =
    dependencies.generateAiEnhancedReportImpl || generateAiEnhancedReport;

  const parseStartedAt = globalThis.performance?.now?.() ?? Date.now();
  let merged = createEmptyInput();
  try {
    const parsedFile = await parseUploadedFile(body.fileInfo);
    const parsedRawText = body.rawText ? parseMarketingInputText(body.rawText) : {};

    merged = mergeMarketingInput(merged, parsedFile.patch);
    merged = mergeMarketingInput(merged, parsedRawText);
    if (body.input) {
      merged = mergeMarketingInput(merged, body.input);
    }

    merged.rawInput = [parsedFile.rawText, body.rawText, body.input?.rawInput]
      .filter(Boolean)
      .join("\n\n");
    timer.logStage("parse_input", parseStartedAt, "success");
  } catch (error) {
    timer.logStage("parse_input", parseStartedAt, "error", {
      reason: summarizeError(error),
    });
    throw error;
  }

  const analyzeStartedAt = globalThis.performance?.now?.() ?? Date.now();
  let result: ReturnType<typeof analyzeMarketingInput>;
  try {
    result = analyzeMarketingInput(merged);
    timer.logStage("analyze_marketing_input", analyzeStartedAt, "success");
  } catch (error) {
    timer.logStage("analyze_marketing_input", analyzeStartedAt, "error", {
      reason: summarizeError(error),
    });
    throw error;
  }

  let insights = createEmptyInsightResult();
  let insightTimeout = false;
  const insightStartedAt = globalThis.performance?.now?.() ?? Date.now();

  try {
    insights = await generateInsightsImpl(result.dashboard, result.normalizedInput, {
      requestId,
      timeoutMs: runtime.aiInsightsTimeoutMs,
    } as Parameters<typeof generateInsights>[2]);
    timer.logStage("generate_insights", insightStartedAt, "success", {
      topFindings: insights.topFindings.length,
      anomalies: insights.anomalies.length,
      opportunities: insights.opportunities.length,
      risks: insights.risks.length,
    });
  } catch (error) {
    insightTimeout = isTimeoutError(error);
    timer.logStage(
      "generate_insights",
      insightStartedAt,
      insightTimeout ? "timeout" : "fallback",
      {
        fallback: "empty_insights",
        reason: summarizeError(error),
      },
    );
  }

  let analysis = result.fallbackReport;
  let engineMode = "规则保底引擎";
  let reportTimeout = false;
  const reportStartedAt = globalThis.performance?.now?.() ?? Date.now();

  try {
    const aiResult = await withTimeout(
      "generateAiEnhancedReport",
      runtime.aiReportTimeoutMs,
      (signal: AbortSignal) =>
        generateAiEnhancedReportImpl(
          appendInsightsToReportPrompt(buildAiPrompt(result), insights),
          signal,
        ),
    );

    if (aiResult) {
      analysis = aiResult.report;
      engineMode = insightTimeout ? `${aiResult.mode}（洞察超时降级）` : aiResult.mode;
      timer.logStage("generate_ai_enhanced_report", reportStartedAt, "success", {
        engineMode,
      });
    } else {
      engineMode = insightTimeout ? "规则保底引擎（洞察超时降级）" : engineMode;
      timer.logStage("generate_ai_enhanced_report", reportStartedAt, "fallback", {
        fallback: "fallback_report",
        reason: "no_ai_provider",
        engineMode,
      });
    }
  } catch (error) {
    reportTimeout = isTimeoutError(error);
    engineMode = reportTimeout
      ? insightTimeout
        ? "规则保底引擎（AI超时降级）"
        : "规则保底引擎（AI增强超时降级）"
      : insightTimeout
        ? "规则保底引擎（洞察超时降级）"
        : "规则保底引擎";

    timer.logStage(
      "generate_ai_enhanced_report",
      reportStartedAt,
      reportTimeout ? "timeout" : "fallback",
      {
        fallback: "fallback_report",
        reason: summarizeError(error),
        engineMode,
      },
    );
  }

  timer.logTotal(engineMode);

  return {
    analysis,
    dashboard: result.dashboard,
    normalizedInput: result.normalizedInput,
    insights,
    engineMode,
  };
};
