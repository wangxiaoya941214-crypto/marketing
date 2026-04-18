import {
  isDealLeadRow,
  type NormalizedLeadRow,
} from "./normalize-lead-row.ts";
import { maskLeadIdentifier } from "./mask-sensitive.ts";

export interface OrderConflictSample {
  rowNumber: number;
  leadName: string;
  channel: string;
  businessType: string;
  issue: string;
  dealStatus: string;
  orderCount: number | null;
}

export interface OrderConsistencyAudit {
  conflictCount: number;
  manualReviewCount: number;
  summary: string;
  samples: OrderConflictSample[];
}

const buildLeadLabel = (row: NormalizedLeadRow) =>
  maskLeadIdentifier(row.leadName || row.phone || `第 ${row.rowNumber} 行`);

export const getOrderConflictIssue = (row: NormalizedLeadRow) => {
  const positiveDealSignals = row.dealSignals.filter(
    (signal) => signal.normalized === "yes",
  ).length;
  const negativeDealSignals = row.dealSignals.filter(
    (signal) => signal.normalized === "no",
  ).length;
  const hasDealIdOrDate = Boolean(row.orderId || row.orderDate || row.dealDate);
  const hasPositiveOrderCount = row.orderCountSignals.some(
    (signal) => (signal.count || 0) > 0,
  );

  if (positiveDealSignals > 0 && negativeDealSignals > 0) {
    return "同一行出现相互冲突的成交状态";
  }
  if (row.dealStatus === "no" && (hasDealIdOrDate || hasPositiveOrderCount)) {
    return "是否下单显示未下单，但存在订单号/下单时间/成交日期/下单数";
  }
  if (row.dealStatus === "yes" && !hasDealIdOrDate && !hasPositiveOrderCount) {
    return "是否下单显示已下单，但缺少订单号/下单时间/成交日期/下单数";
  }

  return "";
};

export const auditOrderConsistency = (
  rows: NormalizedLeadRow[],
): OrderConsistencyAudit => {
  const samples: OrderConflictSample[] = [];
  let manualReviewCount = 0;

  rows.forEach((row) => {
    const issue = getOrderConflictIssue(row);
    const hasNoOrderReason = Boolean(row.noOrderReason);

    if (issue) {
      samples.push({
        rowNumber: row.rowNumber,
        leadName: buildLeadLabel(row),
        channel: row.channelGroup,
        businessType:
          row.businessType === "unknown" ? row.businessTypeRaw || "待确认" : row.businessType,
        issue,
        dealStatus: row.dealStatusRaw || row.dealStatus,
        orderCount: row.orderCount,
      });
      return;
    }

    if (
      row.needsManualDealReview ||
      (isDealLeadRow(row) && row.businessType === "unknown") ||
      (row.hasStrongIntentSignal && !row.hasExplicitDealEvidence) ||
      (row.dealStatus === "no" && row.orderProgress) ||
      (row.dealStatus === "yes" && hasNoOrderReason)
    ) {
      manualReviewCount += 1;
    }
  });

  const conflictCount = samples.length;
  const summaryParts = [
    conflictCount
      ? `发现 ${conflictCount} 条订单口径冲突`
      : "未发现明确的订单口径冲突",
    manualReviewCount
      ? `另有 ${manualReviewCount} 条成交需要人工确认`
      : "没有额外需要人工确认的成交",
  ];

  return {
    conflictCount,
    manualReviewCount,
    summary: summaryParts.join("，"),
    samples: samples.slice(0, 6),
  };
};
