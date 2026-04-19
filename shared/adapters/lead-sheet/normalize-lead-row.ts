import {
  detectLeadSheet,
  normalizeHeaderText,
  type LeadSheetDetectionResult,
  type TabularSheet,
} from "./detect-lead-sheet.ts";

export type LeadProduct = "flexible" | "super" | "unknown";
export type LeadFlag = "yes" | "no" | "unknown";

export interface LeadFlagSignal {
  field: string;
  rawValue: string;
  normalized: LeadFlag;
}

export interface LeadCountSignal {
  field: string;
  rawValue: string;
  count: number | null;
}

export interface NormalizedLeadRow {
  sheetName: string;
  rowNumber: number;
  leadDate: string;
  channel: string;
  channelDetail: string;
  channelGroup: string;
  businessTypeRaw: string;
  businessType: LeadProduct;
  city: string;
  leadName: string;
  phone: string;
  salesOwner: string;
  addedWechatRaw: string;
  addedWechat: LeadFlag;
  highIntentRaw: string;
  highIntent: LeadFlag;
  dealStatusRaw: string;
  dealStatus: LeadFlag;
  orderId: string;
  orderDate: string;
  dealDate: string;
  orderProgress: string;
  orderCount: number | null;
  hasStrongIntentSignal: boolean;
  hasExplicitDealEvidence: boolean;
  noOrderReason: string;
  lossAttribution: string;
  dealSignals: LeadFlagSignal[];
  orderCountSignals: LeadCountSignal[];
  needsManualDealReview: boolean;
  rawRow: Record<string, string>;
}

export interface NormalizeLeadRowsResult {
  rows: NormalizedLeadRow[];
  missingFields: string[];
}

const ORDER_STATUS_FIELD_PATTERNS = [
  /^成交状态$/,
  /^是否成交$/,
  /^是否下单$/,
  /^下单状态$/,
  /^订单状态$/,
  /^签约状态$/,
  /^是否锁单$/,
  /^成交$/,
  /^下单$/,
];

const ORDER_COUNT_FIELD_PATTERNS = [
  /^是否下单下单为1$/,
  /^下单为1$/,
  /^成交为1$/,
  /^订单数$/,
  /^下单数$/,
  /^成交单数$/,
  /^成交量$/,
  /^成交台数$/,
  /^锁单数$/,
  /^下订数$/,
];

const normalizeCell = (value: unknown) =>
  String(value ?? "")
    .replace(/\r?\n/g, " ")
    .trim();

const parseCount = (value: string) => {
  const raw = normalizeCell(value);
  if (!raw) return null;
  const normalized = raw
    .replace(/[，,]/g, "")
    .replace(/台|单|个|辆|人/g, "")
    .trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeBusinessType = (value: string): LeadProduct => {
  const raw = normalizeCell(value);
  if (!raw) return "unknown";
  if (/flexible/i.test(raw)) return "flexible";
  if (/super/i.test(raw)) return "super";
  if (/灵活/.test(raw)) return "flexible";
  if (/超级/.test(raw)) return "super";
  return "unknown";
};

const inferBusinessTypeFromSheetName = (sheetName: string): LeadProduct =>
  normalizeBusinessType(sheetName);

const toNormalizedRawRow = (rawRow: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(rawRow).map(([field, value]) => [normalizeHeaderText(field), value]),
  ) as Record<string, string>;

const getFirstNonEmptyValue = (...values: Array<string | null | undefined>) =>
  values.map((value) => normalizeCell(value)).find(Boolean) || "";

const getRawValue = (
  normalizedRawRow: Record<string, string>,
  aliases: string[],
) => {
  for (const alias of aliases) {
    const value = normalizedRawRow[normalizeHeaderText(alias)];
    if (normalizeCell(value)) {
      return normalizeCell(value);
    }
  }
  return "";
};

const normalizeFlag = (
  value: string,
  positivePatterns: RegExp[],
  negativePatterns: RegExp[],
  unknownPatterns: RegExp[] = [],
): LeadFlag => {
  const raw = normalizeCell(value);
  if (!raw) return "unknown";
  if (unknownPatterns.some((pattern) => pattern.test(raw))) {
    return "unknown";
  }
  if (negativePatterns.some((pattern) => pattern.test(raw))) {
    return "no";
  }
  if (positivePatterns.some((pattern) => pattern.test(raw))) {
    return "yes";
  }
  return "unknown";
};

const normalizeAddedWechat = (value: string) =>
  normalizeFlag(
    value,
    [
      /已通过/,
      /已加微/,
      /已加微信/,
      /加微成功/,
      /已转私域/,
      /已进私域/,
      /已通过其他方式沟通/,
      /已添加/,
      /成功/,
      /^是$/,
      /^已$/,
      /^1$/,
    ],
    [
      /未通过/,
      /未成功/,
      /未加微/,
      /未加微信/,
      /未转私域/,
      /未进私域/,
      /搜不到/,
      /搜索不到/,
      /失败/,
      /^否$/,
      /^0$/,
      /^无$/,
    ],
    [/待加/, /待跟进/, /跟进中/, /待处理/],
  );

const normalizeHighIntent = (value: string) =>
  (() => {
    const raw = normalizeCell(value).toUpperCase();
    if (!raw) return "unknown";
    if (raw === "S" || raw === "A") return "yes";
    if (["S", "B", "C", "F", "无"].includes(raw)) return "no";
    return normalizeFlag(
      raw,
      [
        /高意向/,
        /强意向/,
        /A类/i,
        /^高$/,
        /^A$/i,
        /已报价/,
        /已邀约/,
        /^是$/,
        /^1$/,
      ],
      [
        /低意向/,
        /无意向/,
        /非高意向/,
        /^低$/,
        /^B$/i,
        /^C$/i,
        /^F$/i,
        /^否$/,
        /^0$/,
        /流失/,
        /无效/,
      ],
      [/待确认/, /待跟进/, /跟进中/],
    );
  })();

const normalizeDealStatus = (value: string) =>
  normalizeFlag(
    value,
    [
      /已成交/,
      /成交/,
      /已下单/,
      /已签约/,
      /已锁单/,
      /已转化/,
      /已提车/,
      /支付定金/,
      /^是$/,
      /^1$/,
    ],
    [
      /未成交/,
      /未下单/,
      /流失/,
      /退单/,
      /取消/,
      /^否$/,
      /^0$/,
      /^无$/,
    ],
    [/待确认/, /审核中/, /审批中/, /跟进中/],
  );

const buildRawRow = (header: string[], row: string[]) => {
  const record: Record<string, string> = {};
  header.forEach((field, index) => {
    const key = normalizeCell(field) || `column_${index + 1}`;
    record[key] = normalizeCell(row[index]);
  });
  return record;
};

const classifyChannelGroup = (channel: string, channelDetail: string) => {
  const joined = `${channel} ${channelDetail}`.trim();
  const isPrivateDomain = /私域|老客|老客户|复购|转介绍|微信|企微/i.test(joined);
  if (isPrivateDomain) {
    return "私域-老客户";
  }

  const isIpAccount = /老孙|IP/i.test(joined);
  const isDouyin = /抖音|douyin/i.test(joined);
  const isXhs = /小红书|xhs|red/i.test(joined);
  const isVideo = /视频号|微信视频号/i.test(joined);

  if (isDouyin) {
    return isIpAccount ? "抖音-IP号" : "抖音-品牌号";
  }
  if (isXhs) {
    return isIpAccount ? "小红书-IP号" : "小红书-品牌号";
  }
  if (isVideo) {
    return isIpAccount ? "视频号-IP号" : "视频号-品牌号";
  }

  return isIpAccount ? "其他-IP号" : "其他 / 待确认";
};

const isMeaningfulDataRow = (
  row: string[],
  columnMap: Partial<Record<keyof NormalizedLeadRow, number>>,
) => {
  const indexes = [
    columnMap.leadDate,
    columnMap.channel,
    columnMap.businessType,
    columnMap.leadName,
    columnMap.phone,
    columnMap.salesOwner,
    columnMap.addedWechat,
    columnMap.highIntent,
    columnMap.dealStatus,
  ].filter((value): value is number => typeof value === "number");

  if (!indexes.length) {
    return row.some((cell) => normalizeCell(cell));
  }

  return indexes.some((index) => normalizeCell(row[index]));
};

const buildDealSignals = (rawRow: Record<string, string>) =>
  Object.entries(rawRow)
    .filter(([field]) =>
      ORDER_STATUS_FIELD_PATTERNS.some((pattern) =>
        pattern.test(normalizeHeaderText(field)),
      ),
    )
    .map(([field, rawValue]) => ({
      field,
      rawValue,
      normalized: normalizeDealStatus(rawValue),
    }));

const buildOrderCountSignals = (rawRow: Record<string, string>) =>
  Object.entries(rawRow)
    .filter(([field]) =>
      ORDER_COUNT_FIELD_PATTERNS.some((pattern) =>
        pattern.test(normalizeHeaderText(field)),
      ),
    )
    .map(([field, rawValue]) => ({
      field,
      rawValue,
      count: parseCount(rawValue),
    }));

export const isDealLeadRow = (row: NormalizedLeadRow) => {
  if (row.dealStatus === "yes") {
    return row.hasExplicitDealEvidence;
  }

  if (row.dealStatus === "no") {
    return false;
  }

  return row.hasExplicitDealEvidence;
};

export const normalizeLeadRows = (
  sheets: TabularSheet[],
  detection?: LeadSheetDetectionResult,
): NormalizeLeadRowsResult => {
  const activeDetection = detection || detectLeadSheet(sheets);
  if (activeDetection.kind !== "lead_detail_sheet") {
    return {
      rows: [],
      missingFields: activeDetection.missingSignals,
    };
  }

  const sheet = sheets.find((item) => item.name === activeDetection.sheetName);
  if (!sheet) {
    return {
      rows: [],
      missingFields: activeDetection.missingSignals,
    };
  }

  const header = activeDetection.header;
  const rows = sheet.rows.slice(activeDetection.headerRowIndex + 1);
  const normalizedRows: NormalizedLeadRow[] = [];

  rows.forEach((row, offset) => {
    const normalizedRow = row.map(normalizeCell);
    if (!isMeaningfulDataRow(normalizedRow, activeDetection.columnMap as any)) {
      return;
    }

    const rawRow = buildRawRow(header, normalizedRow);
    const normalizedRawRow = toNormalizedRawRow(rawRow);
    const leadDate =
      normalizeCell(
        normalizedRow[activeDetection.columnMap.leadDate ?? -1],
      ) || "";
    const channel =
      normalizeCell(normalizedRow[activeDetection.columnMap.channel ?? -1]) || "";
    const channelDetail =
      getFirstNonEmptyValue(
        normalizeCell(normalizedRow[activeDetection.columnMap.channelDetail ?? -1]),
        getRawValue(normalizedRawRow, ["线索来源_原始", "来源原始", "渠道原始"]),
      );
    const businessTypeRaw =
      normalizeCell(
        normalizedRow[activeDetection.columnMap.businessType ?? -1],
      ) ||
      inferBusinessTypeFromSheetName(activeDetection.sheetName) ||
      "";
    const city = getFirstNonEmptyValue(
      normalizeCell(normalizedRow[activeDetection.columnMap.city ?? -1]),
      getRawValue(normalizedRawRow, ["用车城市", "城市", "地区"]),
    );
    const leadName =
      getFirstNonEmptyValue(
        normalizeCell(normalizedRow[activeDetection.columnMap.leadName ?? -1]),
        getRawValue(normalizedRawRow, ["用户姓名", "客户姓名", "客户微信号", "微信号"]),
      );
    const phone =
      getFirstNonEmptyValue(
        normalizeCell(normalizedRow[activeDetection.columnMap.phone ?? -1]),
        getRawValue(normalizedRawRow, ["客户手机号/微信", "联系方式"]),
      );
    const salesOwner =
      getFirstNonEmptyValue(
        normalizeCell(normalizedRow[activeDetection.columnMap.salesOwner ?? -1]),
        getRawValue(normalizedRawRow, ["跟进销售", "销售", "销售顾问"]),
      );
    const addedWechatRaw =
      getFirstNonEmptyValue(
        normalizeCell(normalizedRow[activeDetection.columnMap.addedWechat ?? -1]),
        getRawValue(normalizedRawRow, ["是否成功加微", "是否成功加微信", "是否添加成功微信", "是否加微"]),
      );
    const highIntentRaw =
      getFirstNonEmptyValue(
        normalizeCell(normalizedRow[activeDetection.columnMap.highIntent ?? -1]),
        getRawValue(normalizedRawRow, ["意向等级（SABCF）", "意向等级", "高意向", "高意向状态"]),
      );
    const dealStatusRaw =
      getFirstNonEmptyValue(
        normalizeCell(normalizedRow[activeDetection.columnMap.dealStatus ?? -1]),
        getRawValue(normalizedRawRow, ["是否下单", "是否成交", "是否下订"]),
      );
    const orderId = getFirstNonEmptyValue(
      normalizeCell(normalizedRow[activeDetection.columnMap.orderId ?? -1]),
      getRawValue(normalizedRawRow, ["订单号"]),
    );
    const orderDate = getFirstNonEmptyValue(
      normalizeCell(normalizedRow[activeDetection.columnMap.orderDate ?? -1]),
      getRawValue(normalizedRawRow, ["下单时间", "订单时间"]),
    );
    const dealDate = getFirstNonEmptyValue(
      normalizeCell(normalizedRow[activeDetection.columnMap.dealDate ?? -1]),
      getRawValue(normalizedRawRow, ["成交/小订日期", "成交日期", "小订日期"]),
    );
    const orderProgress = getFirstNonEmptyValue(
      normalizeCell(normalizedRow[activeDetection.columnMap.orderProgress ?? -1]),
      getRawValue(normalizedRawRow, ["订单进度"]),
    );
    const noOrderReason = [
      normalizeCell(normalizedRow[activeDetection.columnMap.noOrderReason ?? -1]),
      getRawValue(normalizedRawRow, ["未下单原因"]),
    ]
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index)
      .join("；");
    const lossAttribution = [
      getRawValue(normalizedRawRow, ["未成交归因"]),
    ]
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index)
      .join("；");

    const dealSignals = buildDealSignals(rawRow);
    const orderCountSignals = buildOrderCountSignals(rawRow);
    const hasStrongIntentSignal = normalizeCell(highIntentRaw).toUpperCase() === "S";
    const dealStatus = (() => {
      if (dealStatusRaw) {
        return normalizeDealStatus(dealStatusRaw);
      }
      return "unknown";
    })();
    const hasExplicitDealEvidence =
      Boolean(orderId) ||
      Boolean(orderDate) ||
      Boolean(dealDate) ||
      orderCountSignals.some((signal) => (signal.count || 0) > 0);
    const hasAnyDealSignal =
      Boolean(dealStatusRaw) ||
      Boolean(orderId) ||
      Boolean(orderDate) ||
      Boolean(dealDate) ||
      activeDetection.columnMap.orderCount !== undefined;
    const derivedOrderCount = hasExplicitDealEvidence ? 1 : hasAnyDealSignal ? 0 : null;
    const positiveDealSignals = dealSignals.filter(
      (signal) => signal.normalized === "yes",
    ).length;
    const negativeDealSignals = dealSignals.filter(
      (signal) => signal.normalized === "no",
    ).length;
    const needsManualDealReview =
      (positiveDealSignals > 0 && negativeDealSignals > 0) ||
      (hasExplicitDealEvidence && normalizeBusinessType(businessTypeRaw) === "unknown") ||
      (dealStatus === "unknown" && hasExplicitDealEvidence) ||
      (hasStrongIntentSignal && !hasExplicitDealEvidence);

    normalizedRows.push({
      sheetName: activeDetection.sheetName,
      rowNumber: activeDetection.headerRowIndex + offset + 2,
      leadDate,
      channel,
      channelDetail,
      channelGroup: classifyChannelGroup(channel, channelDetail),
      businessTypeRaw,
      businessType: normalizeBusinessType(businessTypeRaw),
      city,
      leadName,
      phone,
      salesOwner,
      addedWechatRaw,
      addedWechat: normalizeAddedWechat(addedWechatRaw),
      highIntentRaw,
      highIntent: normalizeHighIntent(highIntentRaw),
      dealStatusRaw,
      dealStatus,
      orderId,
      orderDate,
      dealDate,
      orderProgress,
      orderCount: derivedOrderCount,
      hasStrongIntentSignal,
      hasExplicitDealEvidence,
      noOrderReason,
      lossAttribution,
      dealSignals,
      orderCountSignals,
      needsManualDealReview,
      rawRow,
    });
  });

  return {
    rows: normalizedRows,
    missingFields: activeDetection.missingSignals,
  };
};
