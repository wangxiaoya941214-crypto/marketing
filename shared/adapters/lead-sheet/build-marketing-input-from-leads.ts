import type {
  MarketingInput,
  ProductKey,
} from "../../marketing-engine";
import type { OrderConsistencyAudit } from "./audit-order-consistency";
import type { LeadSheetDetectionResult } from "./detect-lead-sheet";
import {
  isDealLeadRow,
  type NormalizedLeadRow,
} from "./normalize-lead-row";

export interface LeadSheetAdapterSidecar {
  adapter: "lead-sheet";
  sheetType: "lead_detail_sheet";
  sheetName: string;
  rowCount: number;
  columnCount: number;
  detectionConfidence: number;
  matchedSignals: string[];
  missingFields: string[];
  orderConflictCount: number;
  orderConflictSamples: OrderConsistencyAudit["samples"];
  orderAuditSummary: string;
  manualReviewDealCount: number;
  warnings: string[];
}

export interface BuildMarketingInputFromLeadsOptions {
  detection: LeadSheetDetectionResult;
  rows: NormalizedLeadRow[];
  rawText: string;
  orderAudit: OrderConsistencyAudit;
  missingFields?: string[];
}

export interface BuildMarketingInputFromLeadsResult {
  input: Partial<MarketingInput>;
  sidecar: LeadSheetAdapterSidecar;
}

type ProductCounter = Record<ProductKey, number>;

const countByProduct = (
  rows: NormalizedLeadRow[],
  predicate: (row: NormalizedLeadRow) => boolean,
): ProductCounter =>
  rows.reduce<ProductCounter>(
    (totals, row) => {
      if (!predicate(row)) {
        return totals;
      }
      if (row.businessType === "flexible" || row.businessType === "super") {
        totals[row.businessType] += 1;
      }
      return totals;
    },
    { flexible: 0, super: 0 },
  );

const parseDateValue = (value: string) => {
  const raw = value.trim();
  if (!raw) return null;

  const normalized = raw.replace(/[.年/]/g, "-").replace(/月/g, "-").replace(/日/g, "");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const buildPeriodRange = (rows: NormalizedLeadRow[]) => {
  const dates = rows
    .map((row) =>
      parseDateValue(row.leadDate) ||
      parseDateValue(row.orderDate) ||
      parseDateValue(row.dealDate),
    )
    .filter((value): value is Date => value instanceof Date);

  if (!dates.length) {
    return {
      periodStart: "",
      periodEnd: "",
    };
  }

  dates.sort((left, right) => left.getTime() - right.getTime());
  return {
    periodStart: formatDate(dates[0]),
    periodEnd: formatDate(dates[dates.length - 1]),
  };
};

export const buildMarketingInputFromLeads = ({
  detection,
  rows,
  rawText,
  orderAudit,
  missingFields = [],
}: BuildMarketingInputFromLeadsOptions): BuildMarketingInputFromLeadsResult => {
  const periodRange = buildPeriodRange(rows);
  const leadsByProduct = countByProduct(rows, () => true);
  const privateDomainByProduct = countByProduct(
    rows,
    (row) => row.addedWechat === "yes",
  );
  const highIntentByProduct = countByProduct(
    rows,
    (row) => row.highIntent === "yes",
  );
  const dealsByProduct = countByProduct(rows, isDealLeadRow);
  const unknownBusinessTypeCount = rows.filter(
    (row) => row.businessType === "unknown",
  ).length;
  const warnings = [
    "当前内容分析来自主线索表聚合，不等于真实内容表现。",
    "目标、花费、CPS 红线仍需结合预算表或手动补齐。",
  ];

  if (unknownBusinessTypeCount > 0) {
    warnings.push(
      `有 ${unknownBusinessTypeCount} 条线索缺少可识别的业务类型，分产品漏斗可能低于总量。`,
    );
  }

  if (missingFields.length > 0) {
    warnings.push(`表头缺少：${missingFields.join("、")}。`);
  }

  const anomalyNotes = [
    `主线索表已聚合，共识别 ${rows.length} 条线索。`,
    orderAudit.summary,
    unknownBusinessTypeCount > 0
      ? `其中 ${unknownBusinessTypeCount} 条线索业务类型待确认。`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    input: {
      periodStart: periodRange.periodStart,
      periodEnd: periodRange.periodEnd,
      funnel: {
        leads: {
          total: rows.length,
          flexible: leadsByProduct.flexible,
          super: leadsByProduct.super,
        },
        privateDomain: {
          total: rows.filter((row) => row.addedWechat === "yes").length,
          flexible: privateDomainByProduct.flexible,
          super: privateDomainByProduct.super,
        },
        highIntent: {
          total: rows.filter((row) => row.highIntent === "yes").length,
          flexible: highIntentByProduct.flexible,
          super: highIntentByProduct.super,
        },
        deals: {
          total: rows.filter(isDealLeadRow).length,
          flexible: dealsByProduct.flexible,
          super: dealsByProduct.super,
        },
      },
      anomalyNotes,
      rawInput: rawText,
    },
    sidecar: {
      adapter: "lead-sheet",
      sheetType: "lead_detail_sheet",
      sheetName: detection.sheetName,
      rowCount: rows.length,
      columnCount: detection.columnCount,
      detectionConfidence: detection.confidence,
      matchedSignals: detection.matchedSignals,
      missingFields,
      orderConflictCount: orderAudit.conflictCount,
      orderConflictSamples: orderAudit.samples,
      orderAuditSummary: orderAudit.summary,
      manualReviewDealCount: orderAudit.manualReviewCount,
      warnings,
    },
  };
};
