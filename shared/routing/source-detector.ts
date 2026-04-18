import * as XLSX from "xlsx";
import {
  auditMarketingInput,
  createEmptyInput,
  mergeMarketingInput,
  parseMarketingInputText,
  parseTemplateCsv,
} from "../marketing-engine.ts";
import type { AnalyzeRequestBody, UploadedFileInfo } from "../http-contracts.ts";
import {
  detectLeadSheet,
  type TabularSheet,
} from "../adapters/lead-sheet/detect-lead-sheet.ts";
import { looksLikeClosedLoopWorkbook } from "../closed-loop/workbook.ts";
import type { SourceDetectionResult } from "./types.ts";

type SheetSummary = {
  name: string;
  headers: string[];
  headerCandidates: string[][];
  rows: number;
};

const XHS_CAMPAIGN_HEADERS = ["计划名称_标准化", "消费", "展现量", "点击量", "私信留资数"] as const;
const XHS_LEAD_LIST_HEADERS = ["小红书线索ID", "线索生成时间", "来源笔记", "流量类型", "手机号"] as const;
const XHS_DAILY_HEADERS = ["日期", "投放消费", "投放展现量", "投放点击量", "投放私信留资数"] as const;
const MARKETING_TEMPLATE_HEADERS = ["字段", "值", "说明"] as const;
const HEADER_SCAN_LIMIT = 6;

const normalizeCell = (value: unknown) =>
  String(value ?? "")
    .replace(/\r?\n/g, " ")
    .trim();

const isWordDocument = (fileInfo: UploadedFileInfo) =>
  fileInfo.mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
  fileInfo.name?.toLowerCase().endsWith(".docx");

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
        blankrows: false,
      })
      .map((row) => row.map((cell) => normalizeCell(cell)));

    return {
      name: sheetName,
      rows,
    };
  });
};

const buildWorkbookSummary = (tabularSheets: TabularSheet[]) => {
  const sheets = tabularSheets.map((sheet) => {
    const headerCandidates = sheet.rows
      .slice(0, HEADER_SCAN_LIMIT)
      .map((row) => row.map((cell) => normalizeCell(cell)).filter(Boolean))
      .filter((headers) => headers.length > 0);

    return {
      name: sheet.name,
      headers: headerCandidates[0] || [],
      headerCandidates,
      rows: sheet.rows.length,
    } satisfies SheetSummary;
  });

  return {
    sheetNames: tabularSheets.map((sheet) => sheet.name),
    sheets,
  };
};

const matchHeaders = (headers: string[], requiredHeaders: readonly string[]) =>
  requiredHeaders.filter((header) => headers.includes(header)).length;

const findBestSheetMatch = (
  sheets: SheetSummary[],
  requiredHeaders: readonly string[],
) =>
  sheets
    .map((sheet) => ({
      sheet,
      matchedCount: Math.max(
        ...sheet.headerCandidates.map((headers) => matchHeaders(headers, requiredHeaders)),
        matchHeaders(sheet.headers, requiredHeaders),
      ),
    }))
    .sort((left, right) => right.matchedCount - left.matchedCount)[0];

const hasTemplateSignals = (text: string) =>
  /(统计周期开始|投放金额_总计|第一层留资总数_总计|内容1_名称)/.test(text);

const detectStructuredWorkbookSource = (buffer: Buffer): SourceDetectionResult | null => {
  const tabularSheets = readWorkbookSheets(buffer);
  const { sheetNames, sheets } = buildWorkbookSummary(tabularSheets);

  if (looksLikeClosedLoopWorkbook(sheetNames)) {
    return {
      sourceType: "closed_loop_workbook",
      confidence: "high",
      reason: "检测到闭环总览、统一主线索底座和小红书打通分析工作表。",
    };
  }

  const leadSheetDetection = detectLeadSheet(tabularSheets);
  if (leadSheetDetection.kind === "lead_detail_sheet") {
    return {
      sourceType: "crm_lead_sheet",
      confidence: leadSheetDetection.confidence >= 0.85 ? "high" : "medium",
      reason: "检测到主线索表字段和销售跟进过程字段。",
    };
  }

  const campaignMatch = findBestSheetMatch(sheets, XHS_CAMPAIGN_HEADERS);
  if (campaignMatch?.matchedCount >= 4) {
    return {
      sourceType: "xhs_campaign_report",
      confidence: "high",
      reason: `检测到 ${campaignMatch.sheet.name} 包含计划投放消耗与转化字段。`,
    };
  }

  const leadListMatch = findBestSheetMatch(sheets, XHS_LEAD_LIST_HEADERS);
  if (leadListMatch?.matchedCount >= 4) {
    return {
      sourceType: "xhs_lead_list",
      confidence: "high",
      reason: `检测到 ${leadListMatch.sheet.name} 包含小红书线索明细字段。`,
    };
  }

  const dailyMatch = findBestSheetMatch(sheets, XHS_DAILY_HEADERS);
  if (dailyMatch?.matchedCount >= 4) {
    return {
      sourceType: "xhs_daily_report",
      confidence: "high",
      reason: `检测到 ${dailyMatch.sheet.name} 包含按天投放转化字段。`,
    };
  }

  const templateMatch = findBestSheetMatch(sheets, MARKETING_TEMPLATE_HEADERS);
  if (templateMatch?.matchedCount >= 2) {
    return {
      sourceType: "marketing_template",
      confidence: "medium",
      reason: `检测到 ${templateMatch.sheet.name} 使用营销诊断模板字段结构。`,
    };
  }

  const workbookRawText = tabularSheets
    .map((sheet) => sheet.rows.slice(0, 60).map((row) => row.join(",")).join("\n"))
    .join("\n");

  if (hasTemplateSignals(workbookRawText)) {
    return {
      sourceType: "marketing_template",
      confidence: "medium",
      reason: "工作簿中包含营销诊断模板关键字段。",
    };
  }

  return null;
};

const detectTextLikeSource = (text: string): SourceDetectionResult => {
  const parsedCsv = mergeMarketingInput(createEmptyInput(), parseTemplateCsv(text));
  const csvAudit = auditMarketingInput(parsedCsv);
  if (hasTemplateSignals(text) || csvAudit.completenessPercent >= 35) {
    return {
      sourceType: "marketing_template",
      confidence: csvAudit.completenessPercent >= 65 ? "high" : "medium",
      reason: "检测到营销诊断模板字段与漏斗指标。",
    };
  }

  const parsedText = mergeMarketingInput(createEmptyInput(), parseMarketingInputText(text));
  const textAudit = auditMarketingInput(parsedText);
  if (textAudit.completenessPercent >= 35) {
    return {
      sourceType: "marketing_template",
      confidence: "medium",
      reason: "文本中包含可解析的营销诊断结构化字段。",
    };
  }

  return {
    sourceType: "unstructured_document",
    confidence: "low",
    reason: "未识别为标准结构化模板，建议先走通用营销诊断。",
  };
};

export const detectSourceType = async (
  body: AnalyzeRequestBody,
): Promise<SourceDetectionResult> => {
  if (body.fileInfo?.data) {
    const buffer = Buffer.from(body.fileInfo.data, "base64");

    if (isExcelFile(body.fileInfo)) {
      return (
        detectStructuredWorkbookSource(buffer) || {
          sourceType: "unstructured_document",
          confidence: "low",
          reason: "Excel 工作簿未识别为标准诊断数据结构。",
        }
      );
    }

    if (isCsvFile(body.fileInfo)) {
      return detectTextLikeSource(buffer.toString("utf8"));
    }

    if (isWordDocument(body.fileInfo) || isPdfFile(body.fileInfo) || isImageFile(body.fileInfo)) {
      return {
        sourceType: "unstructured_document",
        confidence: "medium",
        reason: "当前上传内容属于文档或图片，系统将按非结构化材料处理。",
      };
    }

    return detectTextLikeSource(buffer.toString("utf8"));
  }

  if (body.rawText?.trim()) {
    return detectTextLikeSource(body.rawText);
  }

  return {
    sourceType: "unstructured_document",
    confidence: "low",
    reason: "当前没有足够的数据内容可供识别。",
  };
};
