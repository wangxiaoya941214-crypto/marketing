import type {
  ClosedLoopAiStatus,
  ClosedLoopAnalysisSnapshot,
  ClosedLoopImportBundle,
  ReviewQueueItem,
} from "./types.ts";

type BaseImportSummaryInput = {
  fileName: string;
  status: string;
  aiStatus: ClosedLoopAiStatus;
  currentSnapshotId?: string | null;
  currentSnapshotVersion?: number | null;
  lastError?: string | null;
  parsedSheetCount?: number | null;
  parsedRowCount?: number | null;
  workbookSheetCount?: number | null;
  highConfidenceMatchedCount?: number | null;
  reviewQueueCount?: number | null;
};

const toNullableNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const readPreviousNumber = (
  summary: Record<string, unknown>,
  zhKey: string,
  enKey: string,
) => toNullableNumber(summary[zhKey] ?? summary[enKey]);

const readPreviousText = (
  summary: Record<string, unknown>,
  zhKey: string,
  enKey: string,
) => {
  const value = summary[zhKey] ?? summary[enKey];
  return value === undefined ? null : String(value || "");
};

const countHighConfidenceMatched = (bundle: ClosedLoopImportBundle) =>
  bundle.leadLinks.filter(
    (item) =>
      item.reviewStatus === "confirmed" &&
      item.confidence === "high" &&
      Boolean(item.crmLeadId),
  ).length;

export const buildImportProgressSummary = (
  input: BaseImportSummaryInput,
  previousSummary: Record<string, unknown> = {},
) => ({
  ...previousSummary,
  源文件名: input.fileName,
  当前状态: input.status,
  工作簿表数:
    input.workbookSheetCount !== undefined
      ? input.workbookSheetCount
      : readPreviousNumber(previousSummary, "工作簿表数", "workbookSheetCount"),
  解析表数:
    input.parsedSheetCount !== undefined
      ? input.parsedSheetCount
      : readPreviousNumber(previousSummary, "解析表数", "parsedSheetCount"),
  解析行数:
    input.parsedRowCount !== undefined
      ? input.parsedRowCount
      : readPreviousNumber(previousSummary, "解析行数", "parsedRowCount"),
  高置信打通数:
    input.highConfidenceMatchedCount !== undefined
      ? input.highConfidenceMatchedCount
      : readPreviousNumber(previousSummary, "高置信打通数", "highConfidenceMatchedCount"),
  待复核数:
    input.reviewQueueCount !== undefined
      ? input.reviewQueueCount
      : readPreviousNumber(previousSummary, "待复核数", "reviewQueueCount"),
  当前快照ID:
    input.currentSnapshotId !== undefined
      ? input.currentSnapshotId
      : readPreviousText(previousSummary, "当前快照ID", "currentSnapshotId"),
  当前快照版本:
    input.currentSnapshotVersion !== undefined
      ? input.currentSnapshotVersion
      : readPreviousNumber(previousSummary, "当前快照版本", "currentSnapshotVersion"),
  AI状态: input.aiStatus,
  最近错误摘要:
    input.lastError !== undefined
      ? input.lastError
      : readPreviousText(previousSummary, "最近错误摘要", "lastError"),
  sourceFileName: input.fileName,
  status: input.status,
  workbookSheetCount:
    input.workbookSheetCount !== undefined
      ? input.workbookSheetCount
      : readPreviousNumber(previousSummary, "工作簿表数", "workbookSheetCount"),
  parsedSheetCount:
    input.parsedSheetCount !== undefined
      ? input.parsedSheetCount
      : readPreviousNumber(previousSummary, "解析表数", "parsedSheetCount"),
  parsedRowCount:
    input.parsedRowCount !== undefined
      ? input.parsedRowCount
      : readPreviousNumber(previousSummary, "解析行数", "parsedRowCount"),
  highConfidenceMatchedCount:
    input.highConfidenceMatchedCount !== undefined
      ? input.highConfidenceMatchedCount
      : readPreviousNumber(previousSummary, "高置信打通数", "highConfidenceMatchedCount"),
  reviewQueueCount:
    input.reviewQueueCount !== undefined
      ? input.reviewQueueCount
      : readPreviousNumber(previousSummary, "待复核数", "reviewQueueCount"),
  currentSnapshotId:
    input.currentSnapshotId !== undefined
      ? input.currentSnapshotId
      : readPreviousText(previousSummary, "当前快照ID", "currentSnapshotId"),
  currentSnapshotVersion:
    input.currentSnapshotVersion !== undefined
      ? input.currentSnapshotVersion
      : readPreviousNumber(previousSummary, "当前快照版本", "currentSnapshotVersion"),
  aiStatus: input.aiStatus,
  lastError:
    input.lastError !== undefined
      ? input.lastError
      : readPreviousText(previousSummary, "最近错误摘要", "lastError"),
});

export const buildImportJobSummary = (input: {
  fileName: string;
  status: string;
  bundle: ClosedLoopImportBundle;
  reviewQueue: ReviewQueueItem[];
  snapshot: ClosedLoopAnalysisSnapshot;
  lastError?: string | null;
}) =>
  buildImportProgressSummary(
    {
      fileName: input.fileName,
      status: input.status,
      aiStatus: input.snapshot.aiStatus,
      currentSnapshotId: input.snapshot.id,
      currentSnapshotVersion: input.snapshot.version,
      lastError: input.lastError ?? input.snapshot.aiError ?? null,
      workbookSheetCount: input.bundle.parserMeta?.workbookSheetCount ?? null,
      parsedSheetCount: input.bundle.parserMeta?.parsedSheetCount ?? null,
      parsedRowCount: input.bundle.parserMeta?.parsedRowCount ?? null,
      highConfidenceMatchedCount: countHighConfidenceMatched(input.bundle),
      reviewQueueCount: input.reviewQueue.length,
    },
    input.bundle.importSummary,
  );

export const buildAiSyncedSummary = (input: {
  summary: Record<string, unknown>;
  snapshot: ClosedLoopAnalysisSnapshot;
  status?: string;
  reviewQueueCount?: number;
}) =>
  buildImportProgressSummary(
    {
      fileName: String(input.summary["源文件名"] || input.summary["sourceFileName"] || ""),
      status: String(input.status || input.summary["当前状态"] || input.summary["status"] || ""),
      aiStatus: input.snapshot.aiStatus,
      currentSnapshotId: input.snapshot.id,
      currentSnapshotVersion: input.snapshot.version,
      lastError: input.snapshot.aiError ?? null,
      workbookSheetCount: toNullableNumber(
        input.summary["工作簿表数"] ?? input.summary["workbookSheetCount"],
      ),
      parsedSheetCount: toNullableNumber(
        input.summary["解析表数"] ?? input.summary["parsedSheetCount"],
      ),
      parsedRowCount: toNullableNumber(
        input.summary["解析行数"] ?? input.summary["parsedRowCount"],
      ),
      highConfidenceMatchedCount: toNullableNumber(
        input.summary["高置信打通数"] ?? input.summary["highConfidenceMatchedCount"],
      ),
      reviewQueueCount:
        input.reviewQueueCount ??
        toNullableNumber(input.summary["待复核数"] ?? input.summary["reviewQueueCount"]),
    },
    input.summary,
  );
