export interface TabularSheet {
  name: string;
  rows: string[][];
}

export type LeadSheetColumnKey =
  | "leadDate"
  | "channel"
  | "channelDetail"
  | "businessType"
  | "city"
  | "leadName"
  | "wechatId"
  | "phone"
  | "salesOwner"
  | "addedWechat"
  | "highIntent"
  | "dealStatus"
  | "orderCount"
  | "orderId"
  | "orderDate"
  | "dealDate"
  | "orderProgress"
  | "noOrderReason";

export interface LeadSheetDetectionResult {
  kind: "lead_detail_sheet" | "unknown";
  sheetName: string;
  headerRowIndex: number;
  header: string[];
  columnMap: Partial<Record<LeadSheetColumnKey, number>>;
  matchedSignals: string[];
  missingSignals: string[];
  rowCount: number;
  columnCount: number;
  confidence: number;
}

type HeaderRule = {
  label: string;
  patterns: RegExp[];
};

type CandidateDetection = LeadSheetDetectionResult & {
  requiredMatched: number;
  supportMatched: number;
  score: number;
};

const HEADER_SCAN_LIMIT = 6;

const REQUIRED_BASIC_KEYS: LeadSheetColumnKey[] = [
  "leadDate",
  "channel",
  "businessType",
  "salesOwner",
  "addedWechat",
];

const HIGH_INTENT_KEYS: LeadSheetColumnKey[] = ["highIntent"];

const DEAL_KEYS: LeadSheetColumnKey[] = [
  "dealStatus",
  "orderCount",
  "orderId",
  "orderDate",
  "dealDate",
];

const OPTIONAL_BOOST_KEYS: LeadSheetColumnKey[] = [
  "city",
  "leadName",
  "wechatId",
  "phone",
  "channelDetail",
  "orderProgress",
  "noOrderReason",
];

const HEADER_RULES: Record<LeadSheetColumnKey, HeaderRule> = {
  leadDate: {
    label: "线索日期",
    patterns: [
      /^(线索|创建|录入|提交|进线)?(日期|时间)$/,
      /线索日期/,
      /创建时间/,
      /录入时间/,
      /提交时间/,
      /进线时间/,
    ],
  },
  channel: {
    label: "来源渠道",
    patterns: [
      /^(来源)?渠道$/,
      /^用户来源$/,
      /^客户来源$/,
      /^线索来源$/,
      /^来源平台$/,
      /^投放平台$/,
      /^渠道来源$/,
    ],
  },
  channelDetail: {
    label: "渠道明细",
    patterns: [
      /^渠道明细$/,
      /^来源明细$/,
      /^线索来源原始$/,
      /^来源原始$/,
      /^渠道原始$/,
      /^账号$/,
      /^矩阵号$/,
      /^媒介账号$/,
      /^内容来源$/,
    ],
  },
  businessType: {
    label: "业务类型",
    patterns: [
      /^业务类型$/,
      /^产品类型$/,
      /^订阅类型$/,
      /^业务归属$/,
      /^车型业务$/,
    ],
  },
  city: {
    label: "用车城市",
    patterns: [
      /^用车城市$/,
      /^城市$/,
      /^地区$/,
      /^所在城市$/,
    ],
  },
  leadName: {
    label: "客户姓名",
    patterns: [
      /^用户姓名$/,
      /^客户姓名$/,
      /^线索姓名$/,
      /^姓名$/,
      /^昵称$/,
    ],
  },
  wechatId: {
    label: "客户微信号",
    patterns: [
      /^客户微信号$/,
      /^微信号$/,
      /^微信昵称$/,
      /^客户微信$/,
      /^微信$/,
    ],
  },
  phone: {
    label: "手机号",
    patterns: [
      /^客户手机号微信$/,
      /^手机号微信$/,
      /^客户手机号$/,
      /^手机号$/,
      /^手机号码$/,
      /^电话$/,
      /^联系方式$/,
    ],
  },
  salesOwner: {
    label: "销售负责人",
    patterns: [
      /^跟进销售$/,
      /^负责销售$/,
      /^跟单销售$/,
      /^销售$/,
      /^销售顾问$/,
      /^跟进人$/,
      /^负责人$/,
      /^顾问$/,
      /^归属销售$/,
    ],
  },
  addedWechat: {
    label: "加微状态",
    patterns: [
      /^是否成功加微$/,
      /^是否成功加微信$/,
      /^是否成功添加微信$/,
      /^是否添加成功微信$/,
      /^加微结果$/,
      /^加微是否成功$/,
      /^加微$/,
      /^加微信$/,
      /^加微状态$/,
      /^是否加微$/,
      /^添加微信$/,
      /^添加企微$/,
      /^进私域$/,
      /^转私域$/,
    ],
  },
  highIntent: {
    label: "高意向状态",
    patterns: [
      /^意向等级$/,
      /^意向等级[a-z]+$/,
      /^意向评级$/,
      /^意向客户$/,
      /^高意向$/,
      /^高意向状态$/,
      /^是否高意向$/,
      /^强意向$/,
      /^意向度$/,
    ],
  },
  dealStatus: {
    label: "成交状态",
    patterns: [
      /^是否下单$/,
      /^是否下订$/,
      /^成交状态$/,
      /^是否成交$/,
      /^下单状态$/,
      /^订单状态$/,
      /^签约状态$/,
      /^是否锁单$/,
      /^成交$/,
      /^下单$/,
    ],
  },
  orderCount: {
    label: "订单数量",
    patterns: [
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
    ],
  },
  orderId: {
    label: "订单号",
    patterns: [
      /^订单号$/,
      /^关联订单号$/,
      /^匹配订单号$/,
    ],
  },
  orderDate: {
    label: "下单时间",
    patterns: [
      /^下单时间$/,
      /^订单时间$/,
      /^下订时间$/,
      /^成交时间$/,
    ],
  },
  dealDate: {
    label: "成交日期",
    patterns: [
      /^成交小订日期$/,
      /^成交日期$/,
      /^小订日期$/,
    ],
  },
  orderProgress: {
    label: "订单进度",
    patterns: [
      /^订单进度$/,
      /^下单进度$/,
      /^订单流程$/,
    ],
  },
  noOrderReason: {
    label: "未成交原因",
    patterns: [
      /^未下单原因$/,
      /^未成交归因$/,
      /^未成交原因$/,
      /^流失原因$/,
      /^失单原因$/,
      /^未成单原因$/,
    ],
  },
};

const normalizeCell = (value: unknown) =>
  String(value ?? "")
    .replace(/\r?\n/g, " ")
    .trim();

export const normalizeHeaderText = (value: string) =>
  normalizeCell(value)
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, "")
    .replace(/[()（）【】\[\]{}:：_\-\\/]/g, "");

const isMeaningfulRow = (row: string[]) => row.some((cell) => normalizeCell(cell) !== "");

const findColumnIndex = (header: string[], rules: RegExp[]) => {
  for (let index = 0; index < header.length; index += 1) {
    const normalized = normalizeHeaderText(header[index]);
    if (!normalized) continue;
    if (rules.some((pattern) => pattern.test(normalized))) {
      return index;
    }
  }
  return -1;
};

const buildCandidate = (
  sheet: TabularSheet,
  headerRowIndex: number,
): CandidateDetection => {
  const header = (sheet.rows[headerRowIndex] || []).map(normalizeCell);
  const columnMap: Partial<Record<LeadSheetColumnKey, number>> = {};
  const matchedSignals: string[] = [];
  const missingSignals: string[] = [];

  (Object.entries(HEADER_RULES) as Array<[LeadSheetColumnKey, HeaderRule]>).forEach(
    ([key, rule]) => {
      const columnIndex = findColumnIndex(header, rule.patterns);
      if (columnIndex >= 0) {
        columnMap[key] = columnIndex;
        matchedSignals.push(rule.label);
      } else {
        missingSignals.push(rule.label);
      }
    },
  );

  const basicMatched = REQUIRED_BASIC_KEYS.filter((key) => key in columnMap).length;
  const highIntentMatched = HIGH_INTENT_KEYS.filter((key) => key in columnMap).length;
  const dealMatched = DEAL_KEYS.filter((key) => key in columnMap).length;
  const optionalMatched = OPTIONAL_BOOST_KEYS.filter((key) => key in columnMap).length;
  const dataRows = sheet.rows
    .slice(headerRowIndex + 1)
    .filter(isMeaningfulRow)
    .length;
  const columnCount = header.filter(Boolean).length || header.length;
  const matchedCount = matchedSignals.length;
  const hasSheetNameHint = /主线索/.test(sheet.name);
  const hasBusinessTypeHint = /超级|灵活/.test(sheet.name);
  const confidence = Number(
    Math.min(
      1,
      basicMatched / REQUIRED_BASIC_KEYS.length * 0.45 +
        (highIntentMatched ? 0.15 : 0) +
        Math.min(dealMatched / 2, 1) * 0.2 +
        Math.min(optionalMatched / OPTIONAL_BOOST_KEYS.length, 1) * 0.1 +
        Math.min(columnCount / 41, 1) * 0.05 +
        (hasSheetNameHint ? 0.05 : 0) +
        (hasBusinessTypeHint ? 0.05 : 0),
    ).toFixed(2),
  );
  const basicSatisfied =
    basicMatched === REQUIRED_BASIC_KEYS.length ||
    (basicMatched === REQUIRED_BASIC_KEYS.length - 1 &&
      !("businessType" in columnMap) &&
      hasBusinessTypeHint);
  const intentSatisfied =
    highIntentMatched >= 1 ||
    (hasBusinessTypeHint && dealMatched >= 1);
  const isLeadSheet =
    basicSatisfied &&
    intentSatisfied &&
    dealMatched >= 1 &&
    columnCount >= 12 &&
    dataRows >= 3;

  return {
    kind: isLeadSheet ? "lead_detail_sheet" : "unknown",
    sheetName: sheet.name,
    headerRowIndex,
    header,
    columnMap,
    matchedSignals,
    missingSignals,
    rowCount: dataRows,
    columnCount,
    confidence,
    requiredMatched: basicMatched,
    supportMatched: optionalMatched + highIntentMatched + dealMatched,
    score:
      matchedCount * 80 +
      basicMatched * 120 +
      highIntentMatched * 60 +
      dealMatched * 50 +
      optionalMatched * 20 +
      (hasSheetNameHint ? 80 : 0) +
      (hasBusinessTypeHint ? 60 : 0) +
      Math.min(dataRows, 100) +
      Math.min(columnCount, 60),
  };
};

export const detectLeadSheet = (sheets: TabularSheet[]): LeadSheetDetectionResult => {
  const candidates: CandidateDetection[] = [];

  sheets.forEach((sheet) => {
    const rowsToScan = Math.min(sheet.rows.length, HEADER_SCAN_LIMIT);
    for (let headerRowIndex = 0; headerRowIndex < rowsToScan; headerRowIndex += 1) {
      const row = sheet.rows[headerRowIndex] || [];
      if (!isMeaningfulRow(row)) continue;
      candidates.push(buildCandidate(sheet, headerRowIndex));
    }
  });

  if (!candidates.length) {
    return {
      kind: "unknown",
      sheetName: "",
      headerRowIndex: 0,
      header: [],
      columnMap: {},
      matchedSignals: [],
      missingSignals: Object.values(HEADER_RULES).map((rule) => rule.label),
      rowCount: 0,
      columnCount: 0,
      confidence: 0,
    };
  }

  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0];

  return {
    kind: best.kind,
    sheetName: best.sheetName,
    headerRowIndex: best.headerRowIndex,
    header: best.header,
    columnMap: best.columnMap,
    matchedSignals: best.matchedSignals,
    missingSignals: best.missingSignals,
    rowCount: best.rowCount,
    columnCount: best.columnCount,
    confidence: best.confidence,
  };
};
