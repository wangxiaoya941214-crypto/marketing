import * as XLSX from "xlsx";
import type {
  ClosedLoopImportBundle,
  ClosedLoopParserMeta,
  ContentTouchpointRecord,
  CrmLeadRecord,
  LeadJourneyRecord,
  LeadLinkRecord,
  OrderRecord,
  XhsLeadRecord,
} from "./types.ts";

type SheetRequirement = {
  label: string;
  aliases: readonly string[];
};

type ParsedSheet = {
  headers: string[];
  rows: Array<Record<string, unknown>>;
};

type SheetMap = Record<string, ParsedSheet>;

const SHEET_NAMES = {
  summary: "闭环总览",
  crmBase: "统一主线索底座",
  xhsLeadDetails: "XHS线索明细_打通",
  noteAnalysis: "XHS内容分析_按笔记",
  planAnalysis: "XHS计划分析_按计划",
  dailyAnalysis: "XHS日分析_打通",
  lowConfidenceQueue: "低置信匹配待核查",
} as const;

const FIELD_ALIASES = {
  summaryMetric: ["指标"],
  summaryValue: ["数值"],
  crmLeadId: ["主线索ID"],
  crmLeadDate: ["线索日期"],
  customerIdentity: ["客户手机号/微信", "客户手机号微信", "客户标识"],
  crmPhone: ["主线索_手机号1", "联系方式"],
  crmWechat: ["主线索_微信1", "客户微信号"],
  city: ["用车城市"],
  vehicleIntent: ["意向车型", "车型"],
  salesOwner: ["跟进销售"],
  channel: ["线索来源"],
  channelDetail: ["线索来源_原始"],
  businessType: ["业务类型"],
  sourceType: ["来源类型"],
  province: ["所属省份"],
  addedWechat: ["加微成功", "是否成功加微"],
  addedWechatAt: ["加微时间"],
  intentGrade: ["意向等级（SABCF）", "意向等级SABCF"],
  aiHighIntent: ["AI外呼意向客户（是为1）"],
  notOrderedReason: ["未下单原因"],
  lossReason: ["未成交归因", "未成功原因"],
  orderStatus: ["是否下单"],
  orderProgress: ["订单进度"],
  orderedFlag: ["已下单_flag", "是否下单（下单为1）"],
  externalOrderId: ["订单号"],
  orderedAt: ["下单时间"],
  dealDate: ["成交/小订日期"],
  orderSource: ["订单来源_原始"],
  orderSourceStandardized: ["订单来源_标准化"],
  orderMatchMethod: ["订单匹配方式"],
  orderMatchNote: ["订单匹配备注"],
  xhsLeadId: ["小红书线索ID"],
  xhsLeadDate: ["线索生成时间"],
  account: ["归属账号"],
  noteTitle: ["来源笔记"],
  noteTitleNormalized: ["来源笔记_标准化", "来源笔记"],
  noteId: ["来源笔记ID"],
  trafficType: ["流量类型"],
  creativeName: ["创意名称"],
  creativeNameNormalized: ["创意名称_标准化", "创意名称标准化", "创意名称"],
  creativeId: ["创意ID"],
  conversionType: ["转化方式"],
  xhsPhone: ["手机号"],
  xhsWechat: ["微信号"],
  contactKey: ["联络主键"],
  region: ["地区"],
  matchKey: ["匹配主键", "联络主键"],
  matchDaysDelta: ["匹配时间差_天", "匹配时间差天"],
  matchConfidence: ["匹配置信度"],
  noteTouchpointKey: ["来源笔记"],
  planTouchpointKey: ["计划名称_标准化"],
  dailyTouchpointKey: ["日期"],
} as const satisfies Record<string, readonly string[]>;

const REQUIRED_SHEET_RULES: Record<string, readonly SheetRequirement[]> = {
  [SHEET_NAMES.summary]: [
    { label: "指标", aliases: FIELD_ALIASES.summaryMetric },
    { label: "数值", aliases: FIELD_ALIASES.summaryValue },
  ],
  [SHEET_NAMES.crmBase]: [
    { label: "主线索ID", aliases: FIELD_ALIASES.crmLeadId },
    { label: "线索日期", aliases: FIELD_ALIASES.crmLeadDate },
    { label: "客户标识", aliases: FIELD_ALIASES.customerIdentity },
    { label: "跟进销售", aliases: FIELD_ALIASES.salesOwner },
    { label: "线索来源", aliases: FIELD_ALIASES.channel },
  ],
  [SHEET_NAMES.xhsLeadDetails]: [
    { label: "小红书线索ID", aliases: FIELD_ALIASES.xhsLeadId },
    { label: "线索生成时间", aliases: FIELD_ALIASES.xhsLeadDate },
    { label: "来源笔记", aliases: FIELD_ALIASES.noteTitle },
    { label: "流量类型", aliases: FIELD_ALIASES.trafficType },
    { label: "联络主键", aliases: FIELD_ALIASES.contactKey },
  ],
  [SHEET_NAMES.noteAnalysis]: [
    { label: "来源笔记", aliases: FIELD_ALIASES.noteTouchpointKey },
  ],
  [SHEET_NAMES.planAnalysis]: [
    { label: "计划名称_标准化", aliases: FIELD_ALIASES.planTouchpointKey },
  ],
  [SHEET_NAMES.dailyAnalysis]: [
    { label: "日期", aliases: FIELD_ALIASES.dailyTouchpointKey },
  ],
  [SHEET_NAMES.lowConfidenceQueue]: [
    { label: "小红书线索ID", aliases: FIELD_ALIASES.xhsLeadId },
  ],
};

const CLOSED_LOOP_REQUIRED_SHEETS = Object.keys(REQUIRED_SHEET_RULES);

export const looksLikeClosedLoopWorkbook = (sheetNames: string[]) => {
  const nameSet = new Set(sheetNames);
  const matchedCount = CLOSED_LOOP_REQUIRED_SHEETS.filter((sheet) =>
    nameSet.has(sheet),
  ).length;

  return (
    matchedCount >= 3 &&
    nameSet.has(SHEET_NAMES.crmBase) &&
    nameSet.has(SHEET_NAMES.xhsLeadDetails)
  );
};

const normalizeCell = (value: unknown) =>
  String(value ?? "")
    .replace(/\r?\n/g, " ")
    .trim();

const pickRawValue = (
  row: Record<string, unknown>,
  aliases: readonly string[],
) => aliases.find((alias) => Object.prototype.hasOwnProperty.call(row, alias))
  ? row[aliases.find((alias) => Object.prototype.hasOwnProperty.call(row, alias)) as string]
  : "";

const readText = (row: Record<string, unknown>, aliases: readonly string[]) =>
  normalizeCell(pickRawValue(row, aliases));

const toIsoDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  const raw = normalizeCell(value);
  if (!raw || raw === "-") return null;

  const normalized = raw
    .replace(/[年/.]/g, "-")
    .replace(/月/g, "-")
    .replace(/日/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const readIsoDate = (row: Record<string, unknown>, aliases: readonly string[]) =>
  toIsoDate(pickRawValue(row, aliases));

const toNumber = (value: unknown) => {
  const raw = normalizeCell(value).replace(/[%，,]/g, "");
  if (!raw || raw === "-" || raw.toLowerCase() === "none") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const readNumber = (row: Record<string, unknown>, aliases: readonly string[]) =>
  toNumber(pickRawValue(row, aliases));

const toBoolean = (value: unknown) => {
  const raw = normalizeCell(value).toLowerCase();
  if (!raw || raw === "-") return false;
  return (
    raw === "1" ||
    raw === "true" ||
    raw === "yes" ||
    raw === "已下单" ||
    raw === "已成交" ||
    raw === "已通过" ||
    raw === "已添加" ||
    raw === "已通过其他方式沟通"
  );
};

const readBoolean = (row: Record<string, unknown>, aliases: readonly string[]) =>
  toBoolean(pickRawValue(row, aliases));

const inferProduct = (...values: Array<unknown>) => {
  const joined = values.map(normalizeCell).join(" ");
  if (joined.includes("灵活")) return "flexible" as const;
  if (joined.includes("超级")) return "super" as const;
  return "unknown" as const;
};

const slug = (value: string) =>
  normalizeCell(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "unknown";

const readSheetHeaders = (worksheet: XLSX.WorkSheet) => {
  const [headerRow = []] = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });
  return headerRow.map((cell) => normalizeCell(cell)).filter(Boolean);
};

const jsonRows = (worksheet: XLSX.WorkSheet) =>
  XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    raw: false,
    defval: "",
  });

const requireSheets = (sheetNames: string[]) => {
  const missing = CLOSED_LOOP_REQUIRED_SHEETS.filter(
    (sheet) => !sheetNames.includes(sheet),
  );
  if (missing.length > 0) {
    throw new Error(`闭环底座缺少必要工作表：${missing.join("、")}`);
  }
};

const validateSheetHeaders = (sheetName: string, sheet: ParsedSheet) => {
  const requirements = REQUIRED_SHEET_RULES[sheetName] || [];
  const missing = requirements.filter(
    (requirement) =>
      !requirement.aliases.some((alias) => sheet.headers.includes(alias)),
  );

  if (missing.length > 0) {
    throw new Error(
      `工作表 ${sheetName} 缺少必要字段：${missing.map((item) => item.label).join("、")}`,
    );
  }
};

const buildParserMeta = (sheets: SheetMap): ClosedLoopParserMeta => ({
  workbookSheetCount: Object.keys(sheets).length,
  parsedSheetCount: CLOSED_LOOP_REQUIRED_SHEETS.length,
  parsedRowCount: CLOSED_LOOP_REQUIRED_SHEETS.reduce(
    (total, sheetName) => total + (sheets[sheetName]?.rows.length || 0),
    0,
  ),
});

const buildSummary = (rows: Array<Record<string, unknown>>) =>
  rows.reduce<Record<string, unknown>>((acc, row) => {
    const metric = readText(row, FIELD_ALIASES.summaryMetric);
    if (metric) {
      acc[metric] = pickRawValue(row, FIELD_ALIASES.summaryValue);
    }
    return acc;
  }, {});

const buildCrmLeadRecord = (
  importJobId: string,
  row: Record<string, unknown>,
): CrmLeadRecord => {
  const crmLeadId = readText(row, FIELD_ALIASES.crmLeadId);
  const customerIdentity = readText(row, FIELD_ALIASES.customerIdentity);
  const phone = readText(row, FIELD_ALIASES.crmPhone);
  const wechat = readText(row, FIELD_ALIASES.crmWechat);
  const contactKey = phone || wechat || customerIdentity;

  return {
    id: crmLeadId,
    importJobId,
    leadDate: readIsoDate(row, FIELD_ALIASES.crmLeadDate),
    contactKey,
    customerIdentity,
    city: readText(row, FIELD_ALIASES.city),
    vehicleIntent: readText(row, FIELD_ALIASES.vehicleIntent),
    salesOwner: readText(row, FIELD_ALIASES.salesOwner),
    channel: readText(row, FIELD_ALIASES.channel),
    channelDetail: readText(row, FIELD_ALIASES.channelDetail),
    businessType: inferProduct(readText(row, FIELD_ALIASES.businessType)),
    sourceType: readText(row, FIELD_ALIASES.sourceType),
    province: readText(row, FIELD_ALIASES.province),
    raw: row,
  };
};

const buildJourneyRecord = (
  importJobId: string,
  row: Record<string, unknown>,
): LeadJourneyRecord => {
  const crmLeadId = readText(row, FIELD_ALIASES.crmLeadId);
  const intentGrade = readText(row, FIELD_ALIASES.intentGrade);
  const highIntent =
    readBoolean(row, FIELD_ALIASES.aiHighIntent) ||
    ["S", "A", "B"].includes(intentGrade.toUpperCase());

  return {
    id: crmLeadId,
    importJobId,
    crmLeadId,
    addedWechat: readBoolean(row, FIELD_ALIASES.addedWechat),
    addedWechatAt: readIsoDate(row, FIELD_ALIASES.addedWechatAt),
    highIntent,
    intentGrade,
    notOrderedReason: readText(row, FIELD_ALIASES.notOrderedReason),
    lossReason: readText(row, FIELD_ALIASES.lossReason),
    orderStatus: readText(row, FIELD_ALIASES.orderStatus),
    orderProgress: readText(row, FIELD_ALIASES.orderProgress),
    raw: row,
  };
};

const buildOrderRecord = (
  importJobId: string,
  row: Record<string, unknown>,
): OrderRecord | null => {
  const crmLeadId = readText(row, FIELD_ALIASES.crmLeadId);
  const externalOrderId = readText(row, FIELD_ALIASES.externalOrderId);
  const ordered =
    readBoolean(row, FIELD_ALIASES.orderedFlag) ||
    readBoolean(row, FIELD_ALIASES.orderStatus) ||
    Boolean(externalOrderId) ||
    Boolean(readIsoDate(row, FIELD_ALIASES.orderedAt)) ||
    Boolean(readIsoDate(row, FIELD_ALIASES.dealDate));

  if (!ordered && !externalOrderId) {
    return null;
  }

  return {
    id: `${crmLeadId || "unknown"}:${externalOrderId || "ordered"}`,
    importJobId,
    crmLeadId,
    externalOrderId,
    ordered,
    orderedAt: readIsoDate(row, FIELD_ALIASES.orderedAt),
    dealDate: readIsoDate(row, FIELD_ALIASES.dealDate),
    orderSource: readText(row, FIELD_ALIASES.orderSource),
    orderSourceStandardized: readText(
      row,
      FIELD_ALIASES.orderSourceStandardized,
    ),
    matchMethod: readText(row, FIELD_ALIASES.orderMatchMethod),
    matchNote: readText(row, FIELD_ALIASES.orderMatchNote),
    raw: row,
  };
};

const buildXhsLeadRecord = (
  importJobId: string,
  row: Record<string, unknown>,
): XhsLeadRecord => {
  const xhsLeadId = readText(row, FIELD_ALIASES.xhsLeadId);
  const phone = readText(row, FIELD_ALIASES.xhsPhone);
  const wechat = readText(row, FIELD_ALIASES.xhsWechat);

  return {
    id: xhsLeadId,
    importJobId,
    leadDate: readIsoDate(row, FIELD_ALIASES.xhsLeadDate),
    account: readText(row, FIELD_ALIASES.account),
    noteTitle: readText(row, FIELD_ALIASES.noteTitle),
    noteId: readText(row, FIELD_ALIASES.noteId),
    trafficType: readText(row, FIELD_ALIASES.trafficType),
    creativeName: readText(row, FIELD_ALIASES.creativeName),
    creativeId: readText(row, FIELD_ALIASES.creativeId),
    conversionType: readText(row, FIELD_ALIASES.conversionType),
    phone,
    wechat,
    contactKey: readText(row, FIELD_ALIASES.contactKey) || phone || wechat,
    region: readText(row, FIELD_ALIASES.region),
    raw: row,
  };
};

const buildLeadLinkRecord = (
  importJobId: string,
  row: Record<string, unknown>,
): LeadLinkRecord => {
  const xhsLeadId = readText(row, FIELD_ALIASES.xhsLeadId);
  const crmLeadId = readText(row, FIELD_ALIASES.crmLeadId) || null;
  const confidenceRaw = readText(row, FIELD_ALIASES.matchConfidence);
  const confidence = confidenceRaw.includes("低")
    ? "low"
    : crmLeadId
      ? "high"
      : "manual";
  const reviewStatus =
    confidence === "low"
      ? "pending"
      : crmLeadId
        ? "confirmed"
        : "unmatched";

  return {
    id: xhsLeadId,
    importJobId,
    xhsLeadId,
    crmLeadId,
    matchKey: readText(row, FIELD_ALIASES.matchKey),
    confidence,
    reviewStatus,
    matchDaysDelta: readNumber(row, FIELD_ALIASES.matchDaysDelta),
    issue: confidence === "low" ? "低置信待核查" : crmLeadId ? "" : "未匹配",
    noteTitle: readText(row, FIELD_ALIASES.noteTitleNormalized),
    planName: readText(row, FIELD_ALIASES.creativeNameNormalized),
    raw: row,
  };
};

const buildTouchpointRecord = (
  importJobId: string,
  type: ContentTouchpointRecord["touchpointType"],
  row: Record<string, unknown>,
  keyAliases: readonly string[],
): ContentTouchpointRecord => {
  const key = readText(row, keyAliases);
  const metrics = Object.fromEntries(
    Object.entries(row).map(([field, value]) => [
      field,
      typeof value === "number" ? value : toNumber(value) ?? normalizeCell(value),
    ]),
  ) as Record<string, number | string | null>;

  return {
    id: `${type}:${slug(key)}`,
    importJobId,
    touchpointType: type,
    touchpointKey: key,
    productType: inferProduct(
      readText(row, FIELD_ALIASES.planTouchpointKey),
      readText(row, FIELD_ALIASES.noteTitle),
      readText(row, FIELD_ALIASES.businessType),
    ),
    channel: "小红书",
    channelDetail: readText(row, FIELD_ALIASES.trafficType),
    noteTitle: readText(row, FIELD_ALIASES.noteTitle),
    noteId: readText(row, FIELD_ALIASES.noteId),
    planName: readText(row, FIELD_ALIASES.planTouchpointKey),
    creativeName: readText(row, FIELD_ALIASES.creativeName),
    occurredAt:
      type === "daily" ? readIsoDate(row, FIELD_ALIASES.dailyTouchpointKey) : null,
    metrics,
    raw: row,
  };
};

export const parseClosedLoopWorkbook = (
  buffer: Buffer,
  importJobId: string,
): ClosedLoopImportBundle => {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
  });

  requireSheets(workbook.SheetNames);

  const sheets = Object.fromEntries(
    workbook.SheetNames.map((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      return [
        sheetName,
        {
          headers: readSheetHeaders(worksheet),
          rows: jsonRows(worksheet),
        },
      ];
    }),
  ) as SheetMap;

  CLOSED_LOOP_REQUIRED_SHEETS.forEach((sheetName) =>
    validateSheetHeaders(sheetName, sheets[sheetName]),
  );

  const summary = buildSummary(sheets[SHEET_NAMES.summary]?.rows || []);

  const crmRows = sheets[SHEET_NAMES.crmBase]?.rows || [];
  const crmLeads = crmRows
    .map((row) => buildCrmLeadRecord(importJobId, row))
    .filter((row) => row.id);
  const leadJourneys = crmRows
    .map((row) => buildJourneyRecord(importJobId, row))
    .filter((row) => row.crmLeadId);
  const orders = crmRows
    .map((row) => buildOrderRecord(importJobId, row))
    .filter((row): row is OrderRecord => Boolean(row));

  const xhsLeadRows = sheets[SHEET_NAMES.xhsLeadDetails]?.rows || [];
  const xhsLeads = xhsLeadRows
    .map((row) => buildXhsLeadRecord(importJobId, row))
    .filter((row) => row.id);

  const lowConfidenceIds = new Set(
    (sheets[SHEET_NAMES.lowConfidenceQueue]?.rows || [])
      .map((row) => readText(row, FIELD_ALIASES.xhsLeadId))
      .filter(Boolean),
  );

  const leadLinks = xhsLeadRows
    .map((row) => buildLeadLinkRecord(importJobId, row))
    .filter((row) => row.xhsLeadId)
    .map((row) =>
      lowConfidenceIds.has(row.xhsLeadId)
        ? {
            ...row,
            confidence: "low" as const,
            reviewStatus: "pending" as const,
            issue: "低置信待核查",
          }
        : row,
    );

  const noteTouchpoints = (sheets[SHEET_NAMES.noteAnalysis]?.rows || [])
    .map((row) =>
      buildTouchpointRecord(
        importJobId,
        "note",
        row,
        FIELD_ALIASES.noteTouchpointKey,
      ),
    )
    .filter((row) => row.touchpointKey);
  const planTouchpoints = (sheets[SHEET_NAMES.planAnalysis]?.rows || [])
    .map((row) =>
      buildTouchpointRecord(
        importJobId,
        "plan",
        row,
        FIELD_ALIASES.planTouchpointKey,
      ),
    )
    .filter((row) => row.touchpointKey);
  const dailyTouchpoints = (sheets[SHEET_NAMES.dailyAnalysis]?.rows || [])
    .map((row) =>
      buildTouchpointRecord(
        importJobId,
        "daily",
        row,
        FIELD_ALIASES.dailyTouchpointKey,
      ),
    )
    .filter((row) => row.touchpointKey);

  return {
    importSummary: summary,
    parserMeta: buildParserMeta(sheets),
    contentTouchpoints: [
      ...noteTouchpoints,
      ...planTouchpoints,
      ...dailyTouchpoints,
    ],
    xhsLeads,
    crmLeads,
    leadJourneys,
    orders,
    leadLinks,
  };
};
