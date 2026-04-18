import * as XLSX from "xlsx";
import type { UploadedFileInfo } from "../http-contracts.ts";
import type { SourceType as LegacySourceType } from "../routing/types.ts";
import { detectSourceType } from "../routing/source-detector.ts";
import {
  detectLeadSheet,
  type TabularSheet,
} from "../adapters/lead-sheet/detect-lead-sheet.ts";
import { normalizeLeadRows } from "../adapters/lead-sheet/normalize-lead-row.ts";
import type { V2Confidence, V2SourceType } from "./types.ts";

type DetectionMatch = {
  sourceType: V2SourceType | null;
  legacySourceType: LegacySourceType | null;
  confidence: V2Confidence;
  reason: string;
  candidates: V2SourceType[];
  v2Eligible: boolean;
  lowConfidenceNotes: string[];
};

const VIDEO_HEADERS = [
  "视频标题",
  "内容标题",
  "播放量",
  "完播率",
  "互动量",
] as const;
const DAILY_REGISTER_HEADERS = [
  "日期",
  "注册量",
  "注册人数",
  "小程序注册",
] as const;
const ORDER_SOURCE_HEADERS = [
  "订单号",
  "订单来源",
  "来源核查",
  "归因渠道",
] as const;

const normalizeCell = (value: unknown) =>
  String(value ?? "")
    .replace(/\r?\n/g, " ")
    .trim();

const isExcelLike = (fileInfo: UploadedFileInfo) =>
  fileInfo.mimeType ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
  fileInfo.mimeType === "application/vnd.ms-excel" ||
  fileInfo.name?.toLowerCase().endsWith(".xlsx") ||
  fileInfo.name?.toLowerCase().endsWith(".xls") ||
  fileInfo.mimeType === "text/csv" ||
  fileInfo.name?.toLowerCase().endsWith(".csv");

const readTabularSheets = (fileInfo: UploadedFileInfo): TabularSheet[] => {
  const workbook = XLSX.read(Buffer.from(fileInfo.data || "", "base64"), {
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

const bestHeaderMatch = (rows: string[][], required: readonly string[]) => {
  const candidates = rows
    .slice(0, 6)
    .map((row) => row.filter(Boolean))
    .filter((row) => row.length > 0);

  return candidates.reduce(
    (best, headers) => {
      const matched = required.filter((header) => headers.includes(header)).length;
      if (matched > best.matched) {
        return { matched, headers };
      }
      return best;
    },
    { matched: 0, headers: [] as string[] },
  );
};

const detectDirectV2Source = (fileInfo: UploadedFileInfo): DetectionMatch | null => {
  if (!fileInfo.data || !isExcelLike(fileInfo)) {
    return null;
  }

  try {
    const sheets = readTabularSheets(fileInfo);
    const bestVideo = sheets
      .map((sheet) => ({
        name: sheet.name,
        ...bestHeaderMatch(sheet.rows, VIDEO_HEADERS),
      }))
      .sort((left, right) => right.matched - left.matched)[0];
    if (bestVideo?.matched >= 3) {
      return {
        sourceType: "video_performance",
        legacySourceType: null,
        confidence: "medium",
        reason: `检测到 ${bestVideo.name} 包含视频表现字段。`,
        candidates: ["video_performance"],
        v2Eligible: true,
        lowConfidenceNotes: [],
      };
    }

    const bestRegister = sheets
      .map((sheet) => ({
        name: sheet.name,
        ...bestHeaderMatch(sheet.rows, DAILY_REGISTER_HEADERS),
      }))
      .sort((left, right) => right.matched - left.matched)[0];
    if (bestRegister?.matched >= 2) {
      return {
        sourceType: "daily_register",
        legacySourceType: null,
        confidence: "medium",
        reason: `检测到 ${bestRegister.name} 包含注册统计字段。`,
        candidates: ["daily_register"],
        v2Eligible: true,
        lowConfidenceNotes: [],
      };
    }

    const bestOrder = sheets
      .map((sheet) => ({
        name: sheet.name,
        ...bestHeaderMatch(sheet.rows, ORDER_SOURCE_HEADERS),
      }))
      .sort((left, right) => right.matched - left.matched)[0];
    if (bestOrder?.matched >= 2) {
      return {
        sourceType: "order_source_check",
        legacySourceType: null,
        confidence: "medium",
        reason: `检测到 ${bestOrder.name} 包含订单来源核查字段。`,
        candidates: ["order_source_check"],
        v2Eligible: true,
        lowConfidenceNotes: [],
      };
    }
  } catch {
    return null;
  }

  return null;
};

const inferLeadSheetBusinessType = (fileInfo: UploadedFileInfo) => {
  if (!fileInfo.data || !isExcelLike(fileInfo)) {
    return null;
  }

  try {
    const sheets = readTabularSheets(fileInfo);
    const detection = detectLeadSheet(sheets);
    if (detection.kind !== "lead_detail_sheet") {
      return null;
    }

    const normalized = normalizeLeadRows(sheets, detection).rows;
    const superCount = normalized.filter((row) => row.businessType === "super").length;
    const flexibleCount = normalized.filter(
      (row) => row.businessType === "flexible",
    ).length;

    if (superCount > 0 && flexibleCount === 0) {
      return {
        sourceType: "super_subscription_followup" as const,
        confidence: "high" as const,
        reason: "主线索表里的业务类型稳定指向超级订阅。",
      };
    }
    if (flexibleCount > 0 && superCount === 0) {
      return {
        sourceType: "flexible_subscription_followup" as const,
        confidence: "high" as const,
        reason: "主线索表里的业务类型稳定指向灵活订阅。",
      };
    }
    if (superCount > flexibleCount * 2 && superCount > 0) {
      return {
        sourceType: "super_subscription_followup" as const,
        confidence: "medium" as const,
        reason: "主线索表里以超级订阅为主，但仍存在少量其他业务线。",
      };
    }
    if (flexibleCount > superCount * 2 && flexibleCount > 0) {
      return {
        sourceType: "flexible_subscription_followup" as const,
        confidence: "medium" as const,
        reason: "主线索表里以灵活订阅为主，但仍存在少量其他业务线。",
      };
    }
  } catch {
    return null;
  }

  return null;
};

export const detectV2SourceForFile = async (
  fileInfo: UploadedFileInfo,
): Promise<DetectionMatch> => {
  const directMatch = detectDirectV2Source(fileInfo);
  if (directMatch) {
    return directMatch;
  }

  const detection = await detectSourceType({ fileInfo });

  if (detection.sourceType === "closed_loop_workbook") {
    return {
      sourceType: "closed_loop_workbook",
      legacySourceType: detection.sourceType,
      confidence: detection.confidence,
      reason: detection.reason,
      candidates: ["closed_loop_workbook"],
      v2Eligible: true,
      lowConfidenceNotes: [],
    };
  }

  if (detection.sourceType === "xhs_campaign_report") {
    return {
      sourceType: "ad_plan_spend",
      legacySourceType: detection.sourceType,
      confidence: detection.confidence,
      reason: detection.reason,
      candidates: ["ad_plan_spend"],
      v2Eligible: true,
      lowConfidenceNotes: [],
    };
  }

  if (detection.sourceType === "xhs_daily_report") {
    return {
      sourceType: "ad_plan_spend",
      legacySourceType: detection.sourceType,
      confidence: detection.confidence,
      reason: `${detection.reason} 当前会先归入投放消耗数据源。`,
      candidates: ["ad_plan_spend"],
      v2Eligible: true,
      lowConfidenceNotes: [],
    };
  }

  if (detection.sourceType === "xhs_lead_list") {
    return {
      sourceType: "xhs_lead_list",
      legacySourceType: detection.sourceType,
      confidence: detection.confidence,
      reason: detection.reason,
      candidates: ["xhs_lead_list"],
      v2Eligible: true,
      lowConfidenceNotes: [],
    };
  }

  if (detection.sourceType === "crm_lead_sheet") {
    const inferred = inferLeadSheetBusinessType(fileInfo);
    if (inferred) {
      return {
        sourceType: inferred.sourceType,
        legacySourceType: detection.sourceType,
        confidence: inferred.confidence,
        reason: `${detection.reason} ${inferred.reason}`,
        candidates: [
          "super_subscription_followup",
          "flexible_subscription_followup",
        ],
        v2Eligible: true,
        lowConfidenceNotes:
          inferred.confidence === "high"
            ? []
            : ["这份主线索表业务线不够纯，建议人工确认是超级订阅还是灵活订阅。"],
      };
    }

    return {
      sourceType: null,
      legacySourceType: detection.sourceType,
      confidence: "low",
      reason: `${detection.reason} 但当前无法稳定判断这份主线索表属于超级订阅还是灵活订阅。`,
      candidates: [
        "super_subscription_followup",
        "flexible_subscription_followup",
      ],
      v2Eligible: true,
      lowConfidenceNotes: ["请人工确认这份主线索表的业务线归属。"],
    };
  }

  return {
    sourceType: null,
    legacySourceType: detection.sourceType,
    confidence: detection.confidence,
    reason: `${detection.reason} 这份内容当前只进入 Legacy，不进入 V2 六大看板主链。`,
    candidates: [],
    v2Eligible: false,
    lowConfidenceNotes: [],
  };
};
