export type ProductKey = "flexible" | "super";
export type StatusTone = "🟢" | "🟡" | "🔴" | "——";

export const PRODUCT_ORDER: ProductKey[] = ["flexible", "super"];

export const PRODUCT_META: Record<
  ProductKey,
  { label: string; shortLabel: string; lifeStyle: string; commitment: string }
> = {
  flexible: {
    label: "灵活订阅",
    shortLabel: "灵活",
    lifeStyle: "短期需求、先试后买、阶段性过渡",
    commitment: "用户更在意随时可停、试错成本低",
  },
  super: {
    label: "超级订阅",
    shortLabel: "超级",
    lifeStyle: "轻负担、更灵活的长期用车生活方式",
    commitment: "用户更在意全新车、长期履约、算总账是否划算",
  },
};

export type NullableNumber = number | null;

export interface SplitNumberInput {
  total: NullableNumber;
  flexible: NullableNumber;
  super: NullableNumber;
}

export interface MarketingContentInput {
  id: string;
  name: string;
  link: string;
  product: ProductKey | "";
  board: string;
  views: NullableNumber;
  intentComments: NullableNumber;
  privateMessages: NullableNumber;
  leads: NullableNumber;
  spend: NullableNumber;
  highIntent: NullableNumber;
  deals: NullableNumber;
  creativeSummary: string;
}

export interface PreviousMetricsInput {
  totalDeals: NullableNumber;
  flexibleDeals: NullableNumber;
  superDeals: NullableNumber;
  overallCps: NullableNumber;
  flexibleCps: NullableNumber;
  superCps: NullableNumber;
  cpl: NullableNumber;
  overallConversionRate: NullableNumber;
  totalSpend: NullableNumber;
}

export interface MarketingInput {
  periodStart: string;
  periodEnd: string;
  targets: Record<ProductKey, NullableNumber>;
  cpsRedlines: Record<ProductKey, NullableNumber>;
  spend: {
    flexible: NullableNumber;
    super: NullableNumber;
    brand: NullableNumber;
    total: NullableNumber;
  };
  funnel: {
    leads: SplitNumberInput;
    privateDomain: SplitNumberInput;
    highIntent: SplitNumberInput;
    deals: SplitNumberInput;
  };
  contents: MarketingContentInput[];
  previous: PreviousMetricsInput;
  creativeNotes: string;
  anomalyNotes: string;
  benchmarkLinks: string;
  rawInput: string;
}

export interface AuditInfo {
  completenessPercent: number;
  missingFields: string[];
  warnings: string[];
  anomalies: string[];
  redlineAlerts: string[];
}

export interface DisplayMetric {
  label: string;
  target: string;
  actual: string;
  delta: string;
  mom: string;
  status: StatusTone;
}

export interface FunnelStageData {
  key: string;
  label: string;
  value: NullableNumber;
}

export interface FunnelStepDiagnostic {
  fromLabel: string;
  toLabel: string;
  fromValue: NullableNumber;
  toValue: NullableNumber;
  lossCount: NullableNumber;
  lossShare: NullableNumber;
  conversionRate: NullableNumber;
}

export interface FunnelInsight {
  stages: FunnelStageData[];
  steps: FunnelStepDiagnostic[];
  largestLossStep: FunnelStepDiagnostic | null;
  weakestConversionStep: FunnelStepDiagnostic | null;
  notes: string[];
}

export interface ProductMetrics {
  product: ProductKey;
  label: string;
  spend: NullableNumber;
  leads: NullableNumber;
  privateDomain: NullableNumber;
  highIntent: NullableNumber;
  deals: NullableNumber;
  targetDeals: NullableNumber;
  cpsRedline: NullableNumber;
  cpl: NullableNumber;
  cps: NullableNumber;
  targetCompletionRate: NullableNumber;
  leadToPrivateRate: NullableNumber;
  privateToHighIntentRate: NullableNumber;
  highIntentToDealRate: NullableNumber;
  overallConversionRate: NullableNumber;
  dealStatus: StatusTone;
  cpsStatus: StatusTone;
}

export interface ContentRankingItem {
  medal: string;
  rank: number;
  name: string;
  product: string;
  leads: NullableNumber;
  leadShare: NullableNumber;
  cpl: NullableNumber;
  qualityScore: NullableNumber;
  views: NullableNumber;
  recommendation: string;
  reason: string;
}

export interface BudgetRecommendation {
  action: string;
  target: string;
  currentSpend: NullableNumber;
  suggestedSpend: NullableNumber;
  changePercent: NullableNumber;
  reason: string;
}

export interface ActionItem {
  owner: string;
  task: string;
  expectation: string;
  validation: string;
}

export interface ProblemDiagnosis {
  product: ProductKey;
  largestLossTitle: string;
  intuition: string;
  rationale: string;
  productSpecific: string;
  validationAction: string;
}

export interface ReliabilityInfo {
  dataIntegrityText: string;
  sampleText: string;
  reliabilityText: string;
  reviewDays: number;
  reviewFocus: string;
  moreDataSuggestions: string[];
}

export interface MarketingDashboardData {
  engineLabel: string;
  activeExpertLenses: string[];
  metricsTable: DisplayMetric[];
  overallRating: StatusTone;
  overallRatingLabel: string;
  audit: AuditInfo;
  products: Record<ProductKey, ProductMetrics>;
  funnels: Record<ProductKey, FunnelInsight>;
  diagnosis: Record<ProductKey, ProblemDiagnosis>;
  contentRanking: ContentRankingItem[];
  contentInsights: {
    best: string;
    bestReason: string;
    worst: string;
    worstAction: string;
  };
  budgetComparison: Array<{
    product: string;
    spend: NullableNumber;
    spendShare: NullableNumber;
    deals: NullableNumber;
    dealShare: NullableNumber;
    worthIt: string;
  }>;
  budgetRecommendations: BudgetRecommendation[];
  actionPlan: {
    urgent: ActionItem[];
    thisWeek: ActionItem[];
    nextReview: ActionItem[];
  };
  scalePlan: {
    enabled: boolean;
    effectiveTraits: Array<{
      dimension: string;
      trait: string;
      evidence: string;
      product: string;
    }>;
    comboFlexible: string;
    comboSuper: string;
    steps: string[];
    stopLoss: string;
  };
  reliability: ReliabilityInfo;
}

export interface MarketingAnalysisResult {
  normalizedInput: MarketingInput;
  dashboard: MarketingDashboardData;
  fallbackReport: string;
}

const EMPTY_SPLIT = (): SplitNumberInput => ({
  total: null,
  flexible: null,
  super: null,
});

const EMPTY_PREVIOUS = (): PreviousMetricsInput => ({
  totalDeals: null,
  flexibleDeals: null,
  superDeals: null,
  overallCps: null,
  flexibleCps: null,
  superCps: null,
  cpl: null,
  overallConversionRate: null,
  totalSpend: null,
});

export const createEmptyContent = (index: number): MarketingContentInput => ({
  id: `content-${index}-${Date.now()}`,
  name: "",
  link: "",
  product: "",
  board: "",
  views: null,
  intentComments: null,
  privateMessages: null,
  leads: null,
  spend: null,
  highIntent: null,
  deals: null,
  creativeSummary: "",
});

export const createEmptyInput = (): MarketingInput => ({
  periodStart: "",
  periodEnd: "",
  targets: {
    flexible: null,
    super: null,
  },
  cpsRedlines: {
    flexible: null,
    super: null,
  },
  spend: {
    flexible: null,
    super: null,
    brand: null,
    total: null,
  },
  funnel: {
    leads: EMPTY_SPLIT(),
    privateDomain: EMPTY_SPLIT(),
    highIntent: EMPTY_SPLIT(),
    deals: EMPTY_SPLIT(),
  },
  contents: [createEmptyContent(1), createEmptyContent(2), createEmptyContent(3)],
  previous: EMPTY_PREVIOUS(),
  creativeNotes: "",
  anomalyNotes: "",
  benchmarkLinks: "",
  rawInput: "",
});

const FIELD_NOTES: Array<[string, string]> = [
  ["统计周期开始", "格式建议 YYYY-MM-DD"],
  ["统计周期结束", "格式建议 YYYY-MM-DD"],
  ["目标成交台数_灵活订阅", "必填"],
  ["目标成交台数_超级订阅", "必填"],
  ["CPS红线_灵活订阅", "单位：元/台"],
  ["CPS红线_超级订阅", "单位：元/台"],
  ["投放金额_灵活订阅", "单位：元"],
  ["投放金额_超级订阅", "单位：元"],
  ["投放金额_品牌号其他", "单位：元"],
  ["投放金额_总计", "单位：元"],
  ["第一层留资总数_总计", "单位：条"],
  ["第一层留资总数_灵活订阅", "单位：条"],
  ["第一层留资总数_超级订阅", "单位：条"],
  ["第二层转私域数_总计", "单位：人"],
  ["第二层转私域数_灵活订阅", "可选，建议填写"],
  ["第二层转私域数_超级订阅", "可选，建议填写"],
  ["第三层高意向数_总计", "单位：人"],
  ["第三层高意向数_灵活订阅", "可选，建议填写"],
  ["第三层高意向数_超级订阅", "可选，建议填写"],
  ["第四层成交台数_总计", "单位：台"],
  ["第四层成交台数_灵活订阅", "单位：台"],
  ["第四层成交台数_超级订阅", "单位：台"],
  ["上期成交量", "选填，聚合口径"],
  ["上期成交台数_灵活订阅", "选填"],
  ["上期成交台数_超级订阅", "选填"],
  ["上期CPS", "选填，聚合口径，单位元/台"],
  ["上期CPS_灵活订阅", "选填"],
  ["上期CPS_超级订阅", "选填"],
  ["上期每条客资花费", "选填"],
  ["上期整体成交率", "选填，填百分比或小数都可"],
  ["上期总投放费用", "选填"],
  ["素材描述", "选填，可写封面、文案、卖点"],
  ["异常说明", "选填"],
  ["优秀案例链接", "选填"],
];

export const buildTemplateCsv = (rowCount = 8) => {
  const rows = [["字段", "值", "说明"], ...FIELD_NOTES.map(([field, note]) => [field, "", note])];

  for (let index = 1; index <= rowCount; index += 1) {
    rows.push([`内容${index}_名称`, "", "必填，写链接或内容标题"]);
    rows.push([`内容${index}_链接`, "", "选填"]);
    rows.push([`内容${index}_产品`, "", "填写：灵活订阅 / 超级订阅"]);
    rows.push([`内容${index}_所属板块`, "", "必填"]);
    rows.push([`内容${index}_浏览量`, "", "必填"]);
    rows.push([`内容${index}_意向评论`, "", "必填"]);
    rows.push([`内容${index}_私信进线`, "", "必填"]);
    rows.push([`内容${index}_留资`, "", "必填"]);
    rows.push([`内容${index}_投放花费`, "", "建议填写，便于算内容CPL"]);
    rows.push([`内容${index}_高意向贡献`, "", "建议填写，便于判断质量"]);
    rows.push([`内容${index}_成交贡献`, "", "建议填写，便于判断质量"]);
    rows.push([`内容${index}_素材描述`, "", "选填"]);
  }

  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell ?? "");
          if (text.includes(",") || text.includes('"') || text.includes("\n")) {
            return `"${text.replace(/"/g, '""')}"`;
          }
          return text;
        })
        .join(","),
    )
    .join("\n");
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const roundTo = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const roundInt = (value: number) => Math.round(value);

const safeNumber = (value: unknown): NullableNumber => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const raw = String(value).trim();
  if (!raw) {
    return null;
  }
  const normalized = raw
    .replace(/[，,]/g, "")
    .replace(/[＋+]/g, "")
    .replace(/元\/台|元|台|条|人/g, "")
    .trim();

  if (!normalized) {
    return null;
  }

  const multiplier = normalized.includes("万") ? 10000 : 1;
  const core = normalized.replace(/万/g, "").replace(/%/g, "");
  const parsed = Number(core);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed * multiplier;
};

const parsePercentLike = (value: unknown): NullableNumber => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const raw = String(value).trim();
  if (!raw) {
    return null;
  }
  const number = safeNumber(raw);
  if (number === null) {
    return null;
  }
  if (raw.includes("%")) {
    return number / 100;
  }
  if (number > 1 && number <= 100) {
    return number / 100;
  }
  return number;
};

const formatMoney = (value: NullableNumber) => {
  if (value === null) return "[待补充]";
  return `${roundTo(value, value >= 100 ? 0 : 2)}元`;
};

const formatMoneyShort = (value: NullableNumber) => {
  if (value === null) return "——";
  return `${roundTo(value, value >= 100 ? 0 : 2)}元`;
};

const formatCount = (value: NullableNumber, unit = "人") => {
  if (value === null) return "[待补充]";
  return `${roundTo(value, value >= 100 ? 0 : 2)}${unit}`;
};

const formatPlainNumber = (value: NullableNumber) => {
  if (value === null) return "——";
  return `${roundTo(value, value >= 100 ? 0 : 2)}`;
};

const formatRate = (value: NullableNumber) => {
  if (value === null) return "——";
  return `${roundTo(value * 100, 1)}%`;
};

const formatPerPeople = (rate: NullableNumber) => {
  if (rate === null || rate <= 0) {
    return "[待补充]";
  }
  return `每100人里有${roundTo(rate * 100, 1)}人`;
};

const formatDelta = (current: NullableNumber, target: NullableNumber, unit = "") => {
  if (current === null || target === null) return "——";
  const delta = roundTo(current - target, unit === "%" ? 1 : 0);
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${delta}${unit}`;
};

const formatMoM = (current: NullableNumber, previous: NullableNumber) => {
  if (current === null || previous === null || previous === 0) return "——";
  const delta = ((current - previous) / previous) * 100;
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${roundTo(delta, 1)}%`;
};

const safeDivide = (numerator: NullableNumber, denominator: NullableNumber) => {
  if (numerator === null || denominator === null || denominator === 0) {
    return null;
  }
  return numerator / denominator;
};

const sumNumbers = (...values: NullableNumber[]) => {
  const valid = values.filter((value): value is number => value !== null);
  if (!valid.length) return null;
  return valid.reduce((total, value) => total + value, 0);
};

const normalizeSplit = (input: SplitNumberInput): SplitNumberInput => {
  let total = safeNumber(input.total);
  let flexible = safeNumber(input.flexible);
  let superValue = safeNumber(input.super);

  if (total === null && flexible !== null && superValue !== null) {
    total = flexible + superValue;
  }

  if (flexible === null && total !== null && superValue !== null) {
    const derived = total - superValue;
    flexible = derived >= 0 ? derived : null;
  }

  if (superValue === null && total !== null && flexible !== null) {
    const derived = total - flexible;
    superValue = derived >= 0 ? derived : null;
  }

  return {
    total,
    flexible,
    super: superValue,
  };
};

const normalizeProduct = (value: string): ProductKey | "" => {
  const raw = value.trim();
  if (!raw) return "";
  if (raw.includes("灵活")) return "flexible";
  if (raw.includes("超级")) return "super";
  return "";
};

const normalizeContents = (contents: MarketingContentInput[]) =>
  contents
    .map((content, index) => ({
      ...content,
      id: content.id || `content-${index + 1}-${Date.now()}`,
      name: content.name.trim(),
      link: content.link.trim(),
      product: content.product ? normalizeProduct(content.product) : "",
      board: content.board.trim(),
      views: safeNumber(content.views),
      intentComments: safeNumber(content.intentComments),
      privateMessages: safeNumber(content.privateMessages),
      leads: safeNumber(content.leads),
      spend: safeNumber(content.spend),
      highIntent: safeNumber(content.highIntent),
      deals: safeNumber(content.deals),
      creativeSummary: content.creativeSummary.trim(),
    }))
    .filter((content) =>
      Boolean(
        content.name ||
          content.link ||
          content.board ||
          content.views !== null ||
          content.leads !== null ||
          content.intentComments !== null,
      ),
    );

export const sanitizeMarketingInput = (input: MarketingInput): MarketingInput => {
  const normalized: MarketingInput = {
    ...createEmptyInput(),
    ...input,
    periodStart: input.periodStart?.trim() || "",
    periodEnd: input.periodEnd?.trim() || "",
    targets: {
      flexible: safeNumber(input.targets?.flexible),
      super: safeNumber(input.targets?.super),
    },
    cpsRedlines: {
      flexible: safeNumber(input.cpsRedlines?.flexible),
      super: safeNumber(input.cpsRedlines?.super),
    },
    spend: {
      flexible: safeNumber(input.spend?.flexible),
      super: safeNumber(input.spend?.super),
      brand: safeNumber(input.spend?.brand),
      total: safeNumber(input.spend?.total),
    },
    funnel: {
      leads: normalizeSplit(input.funnel?.leads || EMPTY_SPLIT()),
      privateDomain: normalizeSplit(input.funnel?.privateDomain || EMPTY_SPLIT()),
      highIntent: normalizeSplit(input.funnel?.highIntent || EMPTY_SPLIT()),
      deals: normalizeSplit(input.funnel?.deals || EMPTY_SPLIT()),
    },
    contents: normalizeContents(input.contents || []),
    previous: {
      totalDeals: safeNumber(input.previous?.totalDeals),
      flexibleDeals: safeNumber(input.previous?.flexibleDeals),
      superDeals: safeNumber(input.previous?.superDeals),
      overallCps: safeNumber(input.previous?.overallCps),
      flexibleCps: safeNumber(input.previous?.flexibleCps),
      superCps: safeNumber(input.previous?.superCps),
      cpl: safeNumber(input.previous?.cpl),
      overallConversionRate: parsePercentLike(input.previous?.overallConversionRate),
      totalSpend: safeNumber(input.previous?.totalSpend),
    },
    creativeNotes: input.creativeNotes?.trim() || "",
    anomalyNotes: input.anomalyNotes?.trim() || "",
    benchmarkLinks: input.benchmarkLinks?.trim() || "",
    rawInput: input.rawInput?.trim() || "",
  };

  if (normalized.spend.total === null) {
    normalized.spend.total = sumNumbers(
      normalized.spend.flexible,
      normalized.spend.super,
      normalized.spend.brand,
    );
  }

  if (normalized.funnel.deals.total === null) {
    normalized.funnel.deals.total = sumNumbers(
      normalized.funnel.deals.flexible,
      normalized.funnel.deals.super,
    );
  }

  return normalized;
};

export const mergeMarketingInput = (
  base: MarketingInput,
  patch: Partial<MarketingInput>,
): MarketingInput => {
  const mergedContents = (() => {
    const current = [...(base.contents || [])];
    const updates = patch.contents || [];
    updates.forEach((update, index) => {
      if (!current[index]) {
        current[index] = createEmptyContent(index + 1);
      }
      current[index] = {
        ...current[index],
        ...update,
      };
    });
    return current;
  })();

  return sanitizeMarketingInput({
    ...base,
    ...patch,
    targets: {
      ...base.targets,
      ...patch.targets,
    },
    cpsRedlines: {
      ...base.cpsRedlines,
      ...patch.cpsRedlines,
    },
    spend: {
      ...base.spend,
      ...patch.spend,
    },
    funnel: {
      leads: {
        ...base.funnel.leads,
        ...patch.funnel?.leads,
      },
      privateDomain: {
        ...base.funnel.privateDomain,
        ...patch.funnel?.privateDomain,
      },
      highIntent: {
        ...base.funnel.highIntent,
        ...patch.funnel?.highIntent,
      },
      deals: {
        ...base.funnel.deals,
        ...patch.funnel?.deals,
      },
    },
    previous: {
      ...base.previous,
      ...patch.previous,
    },
    contents: mergedContents,
  });
};

const csvToRows = (csv: string) => {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let insideQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      current = "";
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += char;
  }

  row.push(current);
  if (row.some((cell) => cell.trim() !== "")) {
    rows.push(row);
  }

  return rows;
};

const setContentField = (
  contents: MarketingContentInput[],
  rowIndex: number,
  field: keyof MarketingContentInput,
  value: string,
) => {
  while (contents.length <= rowIndex) {
    contents.push(createEmptyContent(contents.length + 1));
  }

  const target = contents[rowIndex];
  const numericFields: Array<keyof MarketingContentInput> = [
    "views",
    "intentComments",
    "privateMessages",
    "leads",
    "spend",
    "highIntent",
    "deals",
  ];

  if (field === "product") {
    target.product = normalizeProduct(value);
    return;
  }

  if (numericFields.includes(field)) {
    target[field] = safeNumber(value) as never;
    return;
  }

  target[field] = value as never;
};

export const parseTemplateCsv = (csv: string): Partial<MarketingInput> => {
  const rows = csvToRows(csv);
  const contents: MarketingContentInput[] = [];
  const patch: Partial<MarketingInput> = {
    targets: {
      flexible: null,
      super: null,
    },
    cpsRedlines: {
      flexible: null,
      super: null,
    },
    spend: {
      flexible: null,
      super: null,
      brand: null,
      total: null,
    },
    funnel: {
      leads: EMPTY_SPLIT(),
      privateDomain: EMPTY_SPLIT(),
      highIntent: EMPTY_SPLIT(),
      deals: EMPTY_SPLIT(),
    },
    previous: EMPTY_PREVIOUS(),
    contents,
  };

  rows.slice(1).forEach((row) => {
    const field = (row[0] || "").trim();
    const value = (row[1] || "").trim();
    if (!field || !value) return;

    const contentMatch = field.match(/^内容(\d+)_(.+)$/);
    if (contentMatch) {
      const index = Number(contentMatch[1]) - 1;
      const suffix = contentMatch[2];
      const contentMap: Record<string, keyof MarketingContentInput> = {
        名称: "name",
        链接: "link",
        产品: "product",
        所属板块: "board",
        浏览量: "views",
        意向评论: "intentComments",
        私信进线: "privateMessages",
        留资: "leads",
        投放花费: "spend",
        高意向贡献: "highIntent",
        成交贡献: "deals",
        素材描述: "creativeSummary",
      };
      const mappedField = contentMap[suffix];
      if (mappedField) {
        setContentField(contents, index, mappedField, value);
      }
      return;
    }

    const setters: Record<string, () => void> = {
      统计周期开始: () => {
        patch.periodStart = value;
      },
      统计周期结束: () => {
        patch.periodEnd = value;
      },
      目标成交台数_灵活订阅: () => {
        patch.targets!.flexible = safeNumber(value);
      },
      目标成交台数_超级订阅: () => {
        patch.targets!.super = safeNumber(value);
      },
      CPS红线_灵活订阅: () => {
        patch.cpsRedlines!.flexible = safeNumber(value);
      },
      CPS红线_超级订阅: () => {
        patch.cpsRedlines!.super = safeNumber(value);
      },
      投放金额_灵活订阅: () => {
        patch.spend!.flexible = safeNumber(value);
      },
      投放金额_超级订阅: () => {
        patch.spend!.super = safeNumber(value);
      },
      投放金额_品牌号其他: () => {
        patch.spend!.brand = safeNumber(value);
      },
      投放金额_总计: () => {
        patch.spend!.total = safeNumber(value);
      },
      第一层留资总数_总计: () => {
        patch.funnel!.leads.total = safeNumber(value);
      },
      第一层留资总数_灵活订阅: () => {
        patch.funnel!.leads.flexible = safeNumber(value);
      },
      第一层留资总数_超级订阅: () => {
        patch.funnel!.leads.super = safeNumber(value);
      },
      第二层转私域数_总计: () => {
        patch.funnel!.privateDomain.total = safeNumber(value);
      },
      第二层转私域数_灵活订阅: () => {
        patch.funnel!.privateDomain.flexible = safeNumber(value);
      },
      第二层转私域数_超级订阅: () => {
        patch.funnel!.privateDomain.super = safeNumber(value);
      },
      第三层高意向数_总计: () => {
        patch.funnel!.highIntent.total = safeNumber(value);
      },
      第三层高意向数_灵活订阅: () => {
        patch.funnel!.highIntent.flexible = safeNumber(value);
      },
      第三层高意向数_超级订阅: () => {
        patch.funnel!.highIntent.super = safeNumber(value);
      },
      第四层成交台数_总计: () => {
        patch.funnel!.deals.total = safeNumber(value);
      },
      第四层成交台数_灵活订阅: () => {
        patch.funnel!.deals.flexible = safeNumber(value);
      },
      第四层成交台数_超级订阅: () => {
        patch.funnel!.deals.super = safeNumber(value);
      },
      上期成交量: () => {
        patch.previous!.totalDeals = safeNumber(value);
      },
      上期成交台数_灵活订阅: () => {
        patch.previous!.flexibleDeals = safeNumber(value);
      },
      上期成交台数_超级订阅: () => {
        patch.previous!.superDeals = safeNumber(value);
      },
      上期CPS: () => {
        patch.previous!.overallCps = safeNumber(value);
      },
      上期CPS_灵活订阅: () => {
        patch.previous!.flexibleCps = safeNumber(value);
      },
      上期CPS_超级订阅: () => {
        patch.previous!.superCps = safeNumber(value);
      },
      上期每条客资花费: () => {
        patch.previous!.cpl = safeNumber(value);
      },
      上期整体成交率: () => {
        patch.previous!.overallConversionRate = parsePercentLike(value);
      },
      上期总投放费用: () => {
        patch.previous!.totalSpend = safeNumber(value);
      },
      素材描述: () => {
        patch.creativeNotes = value;
      },
      异常说明: () => {
        patch.anomalyNotes = value;
      },
      优秀案例链接: () => {
        patch.benchmarkLinks = value;
      },
    };

    setters[field]?.();
  });

  return patch;
};

const extractText = (text: string, pattern: RegExp) => {
  const match = text.match(pattern);
  if (!match) return "";
  return (match[1] || "").trim();
};

const extractNumber = (text: string, labels: string[]) => {
  for (const label of labels) {
    const pattern = new RegExp(`${escapeRegExp(label)}\\s*[：:]\\s*([^\\n]+)`);
    const raw = extractText(text, pattern);
    const value = safeNumber(raw);
    if (value !== null) {
      return value;
    }
  }
  return null;
};

const extractNumberByPatterns = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = safeNumber(match[1]);
    if (value !== null) {
      return value;
    }
  }
  return null;
};

const extractNumberInSection = (
  text: string,
  headings: string[],
  patterns: RegExp[],
  stopHeadings: string[] = [],
  maxWindow = 400,
) => {
  for (const heading of headings) {
    const headingPattern = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(heading)}\\s*(?=\\n|$)`, "g");
    let match: RegExpExecArray | null;
    while ((match = headingPattern.exec(text))) {
      const start = match.index + match[0].length;
      let end = Math.min(text.length, start + maxWindow);

      for (const stopHeading of stopHeadings) {
        const stopPattern = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(stopHeading)}\\s*(?=\\n|$)`, "g");
        stopPattern.lastIndex = start;
        const stopMatch = stopPattern.exec(text);
        if (stopMatch && stopMatch.index < end) {
          end = stopMatch.index;
        }
      }

      const windowText = text.slice(start, end);
      const value = extractNumberByPatterns(windowText, patterns);
      if (value !== null) {
        return value;
      }
    }
  }
  return null;
};

const extractRange = (text: string) => {
  const match = text.match(/统计周期\s*[：:]\s*([^\n~～]+)\s*[~～]\s*([^\n]+)/);
  if (!match) {
    return {
      periodStart: "",
      periodEnd: "",
    };
  }
  return {
    periodStart: match[1].trim(),
    periodEnd: match[2].trim(),
  };
};

const extractSplitLine = (text: string, labels: string[]) => {
  for (const label of labels) {
    const pattern = new RegExp(`${escapeRegExp(label)}\\s*[：:]\\s*([^\\n]+)`);
    const raw = extractText(text, pattern);
    if (!raw) continue;
    const totalMatch = raw.match(/([\d.,万+]+)/);
    const flexibleMatch = raw.match(/灵活[^\\d]*([\d.,万+]+)/);
    const superMatch = raw.match(/超级[^\\d]*([\d.,万+]+)/);
    return {
      total: totalMatch ? safeNumber(totalMatch[1]) : null,
      flexible: flexibleMatch ? safeNumber(flexibleMatch[1]) : null,
      super: superMatch ? safeNumber(superMatch[1]) : null,
    };
  }
  return EMPTY_SPLIT();
};

export const parseMarketingInputText = (text: string): Partial<MarketingInput> => {
  const trimmed = text.trim();
  if (!trimmed) return {};

  if (trimmed.includes("字段,值,说明")) {
    return parseTemplateCsv(trimmed);
  }

  const contents: MarketingContentInput[] = [];
  const range = extractRange(trimmed);
  const sectionStops = [
    "品牌号",
    "灵活订阅",
    "灵活订阅来源统计",
    "超级订阅",
    "超级订阅来源统计",
    "未达成项说明",
    "下月改进计划",
  ];
  const flexibleSpend =
    extractNumber(trimmed, ["灵活订阅投放金额"]) ??
    extractNumberInSection(trimmed, ["灵活订阅"], [/投放\s*[：:]\s*([\d.,万+]+)/], sectionStops);
  const superSpend =
    extractNumber(trimmed, ["超级订阅投放金额"]) ??
    extractNumberInSection(trimmed, ["超级订阅"], [/投放\s*[：:]\s*([\d.,万+]+)/], sectionStops);
  const brandSpend =
    extractNumber(trimmed, ["品牌号/其他"]) ??
    extractNumberInSection(trimmed, ["品牌号"], [/投放\s*[：:]\s*([\d.,万+]+)/], sectionStops);
  const totalSpend =
    extractNumber(trimmed, ["总投放金额"]) ??
    extractNumberByPatterns(trimmed, [
      /小红书平台投放总计(?:共计)?\s*[：:]\s*([\d.,万+]+)/,
      /平台投放总计(?:共计)?\s*[：:]\s*([\d.,万+]+)/,
      /投放总计(?:共计)?\s*[：:]\s*([\d.,万+]+)/,
    ]);
  const flexibleTarget =
    extractNumber(trimmed, ["目标成交台数（灵活订阅）", "目标成交台数（灵活）"]) ??
    extractNumberByPatterns(trimmed, [/灵活订阅目标\s*[：:]\s*([\d.,万+]+)/, /灵活订阅成交目标\s*[：:]\s*([\d.,万+]+)/]);
  const superTarget =
    extractNumber(trimmed, ["目标成交台数（超级订阅）", "目标成交台数（超级）"]) ??
    extractNumberByPatterns(trimmed, [/超级订阅目标\s*[：:]\s*([\d.,万+]+)/, /超级订阅成交目标\s*[：:]\s*([\d.,万+]+)/]);
  const flexibleCpsRedline =
    extractNumber(trimmed, ["CPS红线（灵活订阅）", "CPS红线（灵活）"]) ??
    extractNumberByPatterns(trimmed, [/灵活订阅\s*[：:]\s*CPS\s*[<＜]\s*([\d.,万+]+)/i]);
  const flexibleLeads =
    extractNumberByPatterns(trimmed, [
      /带来灵活订阅客资\s*[：:]\s*([\d.,万+]+)/,
      /灵活订阅实际获客线索\s*[：:]\s*([\d.,万+]+)/,
      /灵活订阅投放获客线索\s*[：:]\s*([\d.,万+]+)/,
      /灵活订阅客资\s*[：:]\s*([\d.,万+]+)/,
    ]) ??
    extractNumberInSection(trimmed, ["灵活订阅"], [
      /带来[^。\n]*?客资\s*[：:]\s*([\d.,万+]+)/,
      /投放获客线索\s*([\d.,万+]+)/,
    ], sectionStops);
  const superLeads =
    extractNumberByPatterns(trimmed, [
      /带来超级订阅客资\s*[：:]\s*([\d.,万+]+)/,
      /超级订阅实际获客线索\s*[：:]\s*([\d.,万+]+)/,
      /超级订阅投放获客线索\s*[：:]\s*([\d.,万+]+)/,
    ]) ??
    extractNumberInSection(trimmed, ["超级订阅"], [
      /带来[^。\n]*?客资\s*[：:]\s*([\d.,万+]+)/,
      /投放获客线索\s*([\d.,万+]+)/,
    ], sectionStops);
  const flexibleDeals =
    extractNumberInSection(trimmed, ["灵活订阅来源统计", "灵活订阅"], [
      /其中[，,]?\s*([\d.,万+]+)单小红书渠道成交/,
      /成交\s*[：:]\s*([\d.,万+]+)/,
    ], sectionStops) ??
    extractNumberByPatterns(trimmed, [/其中[，,]?\s*([\d.,万+]+)单小红书渠道成交/]);
  const superDeals =
    extractNumberInSection(trimmed, ["超级订阅来源统计", "超级订阅"], [
      /成交\s*[：:]\s*([\d.,万+]+)/,
      /超级订阅小红书成单\s*([\d.,万+]+)/,
    ], sectionStops) ??
    extractNumberByPatterns(trimmed, [/超级订阅小红书成单\s*([\d.,万+]+)/]);
  const superHighIntent =
    extractNumberInSection(trimmed, ["超级订阅来源统计", "超级订阅"], [/高意向\s*[：:]\s*([\d.,万+]+)/], sectionStops) ??
    extractNumberByPatterns(trimmed, [/高意向\s*[：:]\s*([\d.,万+]+)/]);
  const superCpsRedline =
    extractNumber(trimmed, ["CPS红线（超级订阅）", "CPS红线（超级）"]) ??
    extractNumberByPatterns(trimmed, [/目标\d*[：:]\s*超级订阅\s*[：:]\s*CPS\s*[<＜]\s*([\d.,万+]+)/i]);

  trimmed.split(/\n+/).forEach((line) => {
    const contentMatch = line.match(
      /内容\d*(?:（链接\/名称）)?\s*[：:]\s*([^|]+)\|\s*浏览量\s*([^|]+)\|\s*意向评论\s*([^|]+)\|\s*私信进线\s*([^|]+)\|\s*留资\s*([^|]+)\|\s*所属板块\s*([^|]+)/,
    );

    if (!contentMatch) return;

    const index = contents.length;
    const content = createEmptyContent(index + 1);
    content.name = contentMatch[1].trim();
    content.views = safeNumber(contentMatch[2]);
    content.intentComments = safeNumber(contentMatch[3]);
    content.privateMessages = safeNumber(contentMatch[4]);
    content.leads = safeNumber(contentMatch[5]);
    content.board = contentMatch[6].trim();
    contents.push(content);
  });

  return {
    periodStart: range.periodStart,
    periodEnd: range.periodEnd,
    targets: {
      flexible: flexibleTarget,
      super: superTarget,
    },
    cpsRedlines: {
      flexible: flexibleCpsRedline,
      super: superCpsRedline,
    },
    spend: {
      flexible: flexibleSpend,
      super: superSpend,
      brand: brandSpend,
      total: totalSpend,
    },
    funnel: {
      leads: (() => {
        const split = extractSplitLine(trimmed, ["第一层 留资总数", "第一层留资总数"]);
        return {
          total: split.total,
          flexible: split.flexible ?? flexibleLeads,
          super: split.super ?? superLeads,
        };
      })(),
      privateDomain: extractSplitLine(trimmed, ["第二层 转私域数", "第二层转私域数"]),
      highIntent: (() => {
        const split = extractSplitLine(trimmed, ["第三层 高意向数", "第三层高意向数"]);
        return {
          total: split.total,
          flexible: split.flexible,
          super: split.super ?? superHighIntent,
        };
      })(),
      deals: (() => {
        const split = extractSplitLine(trimmed, ["第四层 成交台数", "第四层成交台数"]);
        return {
          total: split.total,
          flexible: split.flexible ?? flexibleDeals,
          super: split.super ?? superDeals,
        };
      })(),
    },
    contents,
    creativeNotes: extractText(trimmed, /素材描述\s*[：:]\s*([^\n]+)/),
    anomalyNotes: extractText(trimmed, /异常说明\s*[：:]\s*([^\n]+)/),
    benchmarkLinks: extractText(trimmed, /优秀案例链接\s*[：:]\s*([^\n]+)/),
    rawInput: trimmed,
  };
};

const buildAudit = (input: MarketingInput): AuditInfo => {
  const missingFields: string[] = [];
  const warnings: string[] = [];
  const anomalies: string[] = [];
  const redlineAlerts: string[] = [];

  const pushIfMissing = (label: string, value: unknown) => {
    if (value === null || value === undefined || value === "") {
      missingFields.push(label);
    }
  };

  pushIfMissing("统计周期开始", input.periodStart);
  pushIfMissing("统计周期结束", input.periodEnd);
  pushIfMissing("目标成交台数（灵活订阅）", input.targets.flexible);
  pushIfMissing("目标成交台数（超级订阅）", input.targets.super);
  pushIfMissing("CPS红线（灵活订阅）", input.cpsRedlines.flexible);
  pushIfMissing("CPS红线（超级订阅）", input.cpsRedlines.super);
  pushIfMissing("灵活订阅投放金额", input.spend.flexible);
  pushIfMissing("超级订阅投放金额", input.spend.super);
  pushIfMissing("品牌号/其他投放金额", input.spend.brand);
  pushIfMissing("总投放金额", input.spend.total);
  pushIfMissing("第一层留资总数", input.funnel.leads.total);
  pushIfMissing("第二层转私域数", input.funnel.privateDomain.total);
  pushIfMissing("第三层高意向数", input.funnel.highIntent.total);
  pushIfMissing("第四层成交台数", input.funnel.deals.total);
  pushIfMissing("灵活订阅留资", input.funnel.leads.flexible);
  pushIfMissing("超级订阅留资", input.funnel.leads.super);
  pushIfMissing("灵活订阅成交", input.funnel.deals.flexible);
  pushIfMissing("超级订阅成交", input.funnel.deals.super);

  const validContents = input.contents.filter((content) => content.name || content.leads !== null);
  if (!validContents.length) {
    missingFields.push("至少填写1条内容数据");
  }

  validContents.forEach((content, index) => {
    pushIfMissing(`内容${index + 1}名称`, content.name);
    pushIfMissing(`内容${index + 1}浏览量`, content.views);
    pushIfMissing(`内容${index + 1}意向评论`, content.intentComments);
    pushIfMissing(`内容${index + 1}私信进线`, content.privateMessages);
    pushIfMissing(`内容${index + 1}留资`, content.leads);
    pushIfMissing(`内容${index + 1}所属板块`, content.board);
  });

  const totalLeads = input.funnel.leads.total;
  if (totalLeads !== null && totalLeads < 30) {
    warnings.push("⚠️ 样本量不足，当前留资少于30条，结论仅供参考。");
  }

  if (
    input.funnel.leads.total !== null &&
    input.funnel.leads.total > 0 &&
    input.funnel.deals.total === 0
  ) {
    anomalies.push("🚨 已有留资但成交为0，需核查成交口径、跟进节奏或统计遗漏。");
  }

  if (
    input.funnel.highIntent.total !== null &&
    input.funnel.highIntent.total > 0 &&
    input.funnel.deals.total === 0
  ) {
    anomalies.push("🚨 已有高意向用户但最终成交为0，成交环节可能存在严重阻断。");
  }

  if (
    input.spend.total !== null &&
    input.spend.flexible !== null &&
    input.spend.super !== null &&
    input.spend.brand !== null
  ) {
    const partSum = input.spend.flexible + input.spend.super + input.spend.brand;
    if (Math.abs(partSum - input.spend.total) > 1) {
      anomalies.push("🚨 分产品投放金额之和与总投放金额不一致，请人工核查。");
    }
  }

  const splitWarnings: Array<[string, SplitNumberInput]> = [
    ["第二层转私域", input.funnel.privateDomain],
    ["第三层高意向", input.funnel.highIntent],
  ];

  splitWarnings.forEach(([label, split]) => {
    if (split.total !== null && (split.flexible === null || split.super === null)) {
      warnings.push(`⚠️ ${label}只填了总数，产品拆分不完整，分产品漏斗会显示 [待补充]。`);
    }
  });

  const redlineSource = `${input.rawInput}\n${input.creativeNotes}\n${input.contents
    .map((content) => `${content.name} ${content.creativeSummary}`)
    .join("\n")}`;
  const redlineChecks: Array<[RegExp, string]> = [
    [/比\s*4S店/i, "⛔ 检测到“比4S店便宜”类表述，需改成“一价全包、按月更轻松”。"],
    [/4S店.*便宜|官方渠道.*便宜/i, "⛔ 检测到直接渠道价格对比，请改成灵活性和生活方式表达。"],
    [/明日车库/i, "⛔ 检测到“明日车库”表述，不能对外传播。"],
  ];
  redlineChecks.forEach(([pattern, message]) => {
    if (pattern.test(redlineSource)) {
      redlineAlerts.push(message);
    }
  });

  const requiredCount = 18 + Math.max(validContents.length, 1) * 6;
  const completenessPercent = Math.max(
    0,
    Math.min(100, roundTo(((requiredCount - missingFields.length) / requiredCount) * 100, 0)),
  );

  return {
    completenessPercent,
    missingFields,
    warnings,
    anomalies,
    redlineAlerts,
  };
};

export const auditMarketingInput = (incoming: MarketingInput) =>
  buildAudit(sanitizeMarketingInput(incoming));

const getTargetStatus = (actual: NullableNumber, target: NullableNumber): StatusTone => {
  if (actual === null || target === null || target === 0) return "——";
  if (actual >= target) return "🟢";
  const gap = (target - actual) / target;
  if (gap <= 0.2) return "🟡";
  return "🔴";
};

const getCpsStatus = (actual: NullableNumber, redline: NullableNumber): StatusTone => {
  if (actual === null || redline === null || redline === 0) return "——";
  if (actual <= redline) return "🟢";
  const exceed = (actual - redline) / redline;
  if (exceed <= 0.2) return "🟡";
  return "🔴";
};

const buildProductMetrics = (input: MarketingInput, product: ProductKey): ProductMetrics => {
  const spend = input.spend[product];
  const leads = input.funnel.leads[product];
  const privateDomain = input.funnel.privateDomain[product];
  const highIntent = input.funnel.highIntent[product];
  const deals = input.funnel.deals[product];
  const targetDeals = input.targets[product];
  const cpsRedline = input.cpsRedlines[product];

  const cpl = safeDivide(spend, leads);
  const cps = safeDivide(spend, deals);
  const targetCompletionRate = safeDivide(deals, targetDeals);
  const leadToPrivateRate = safeDivide(privateDomain, leads);
  const privateToHighIntentRate = safeDivide(highIntent, privateDomain);
  const highIntentToDealRate = safeDivide(deals, highIntent);
  const overallConversionRate = safeDivide(deals, leads);

  return {
    product,
    label: PRODUCT_META[product].label,
    spend,
    leads,
    privateDomain,
    highIntent,
    deals,
    targetDeals,
    cpsRedline,
    cpl,
    cps,
    targetCompletionRate,
    leadToPrivateRate,
    privateToHighIntentRate,
    highIntentToDealRate,
    overallConversionRate,
    dealStatus: getTargetStatus(deals, targetDeals),
    cpsStatus: getCpsStatus(cps, cpsRedline),
  };
};

const buildFunnelInsight = (metrics: ProductMetrics): FunnelInsight => {
  const stages: FunnelStageData[] = [
    { key: "leads", label: "留下联系方式", value: metrics.leads },
    { key: "privateDomain", label: "加微信/进私域", value: metrics.privateDomain },
    { key: "highIntent", label: "明确有意向", value: metrics.highIntent },
    { key: "deals", label: "最终成交", value: metrics.deals },
  ];

  const steps: FunnelStepDiagnostic[] = stages.slice(0, -1).map((stage, index) => {
    const nextStage = stages[index + 1];
    const lossCount =
      stage.value !== null && nextStage.value !== null ? Math.max(stage.value - nextStage.value, 0) : null;
    const firstStageValue = stages[0]?.value ?? null;
    const lastStageValue = stages[stages.length - 1]?.value ?? null;
    const totalLossBase =
      firstStageValue !== null && lastStageValue !== null
        ? Math.max(firstStageValue - lastStageValue, 0)
        : null;

    return {
      fromLabel: stage.label,
      toLabel: nextStage.label,
      fromValue: stage.value,
      toValue: nextStage.value,
      lossCount,
      lossShare: safeDivide(lossCount, totalLossBase),
      conversionRate: safeDivide(nextStage.value, stage.value),
    };
  });

  const completeSteps = steps.filter((step) => step.lossCount !== null && step.conversionRate !== null);
  const largestLossStep =
    completeSteps.length > 0
      ? [...completeSteps].sort((a, b) => (b.lossCount ?? 0) - (a.lossCount ?? 0))[0]
      : null;
  const weakestConversionStep =
    completeSteps.length > 0
      ? [...completeSteps].sort((a, b) => (a.conversionRate ?? 1) - (b.conversionRate ?? 1))[0]
      : null;

  const notes: string[] = [];
  if (!completeSteps.length) {
    notes.push("当前分产品漏斗缺少关键拆分数据，建议补齐转私域和高意向的产品归属。");
  }
  if (
    largestLossStep &&
    weakestConversionStep &&
    (largestLossStep.fromLabel !== weakestConversionStep.fromLabel ||
      largestLossStep.toLabel !== weakestConversionStep.toLabel)
  ) {
    notes.push("流失人数最多的那一步，和转化最差的那一步不是同一个问题，先救流失人数最多的环节。");
  }

  return {
    stages,
    steps,
    largestLossStep,
    weakestConversionStep,
    notes,
  };
};

const buildProblemDiagnosis = (
  product: ProductKey,
  metrics: ProductMetrics,
  funnel: FunnelInsight,
): ProblemDiagnosis => {
  const largest = funnel.largestLossStep;
  if (!largest) {
    return {
      product,
      largestLossTitle: "缺少足够的分产品漏斗数据",
      intuition: "现在还不能准确判断用户在哪一步最容易退缩。",
      rationale: "因为转私域和高意向没有完整拆开，用户到底卡在咨询、比较还是成交前一步，还不能下强结论。",
      productSpecific: `先补齐 ${PRODUCT_META[product].label} 的转私域和高意向拆分，再判断真正的堵点。`,
      validationAction: "先让投放和私域团队在未来3天按产品记录每一步人数，再复盘。",
    };
  }

  const title = `第${funnel.steps.indexOf(largest) + 1}步（${largest.fromLabel} → ${largest.toLabel}）`;
  const isFlexible = product === "flexible";
  const stepKey = `${largest.fromLabel}-${largest.toLabel}`;

  if (stepKey.includes("留下联系方式-加微信")) {
    return {
      product,
      largestLossTitle: title,
      intuition: isFlexible
        ? "用户刚留完资料，最本能的反应是“我不想马上被销售追着聊”。"
        : "用户刚留完资料，最本能的反应是“长期方案还没想好，不想这么快进入深聊”。",
      rationale: isFlexible
        ? "用户不知道加微信后能拿到什么具体价值，所以就停在“先看看再说”。"
        : "用户对长期订阅的总账、履约和交付细节还没算清楚，缺少继续沟通的理由。",
      productSpecific: isFlexible
        ? "灵活订阅的决策更快，用户要的是“马上知道适不适合我”，而不是被动等销售追问。"
        : "超级订阅本身承诺周期更长，用户如果没看到“为什么值得锁定”，就更容易在这一步退掉。",
      validationAction:
        "把“加微信了解详情”改成“加微信领取你的专属订阅方案 + 本周可提车清单”，3天后对比加微信率。",
    };
  }

  if (stepKey.includes("加微信/进私域-明确有意向")) {
    return {
      product,
      largestLossTitle: title,
      intuition: "用户愿意聊，但聊到中途会本能地觉得麻烦，怕自己花时间却没得到明确答案。",
      rationale: isFlexible
        ? "私域沟通没有把“什么时候能提车、怎么停、月付怎么算”讲清楚，用户很难继续推进。"
        : "私域沟通没有把“长期锁价值不值、全新车交付有什么确定性”讲透，所以用户卡在比较阶段。",
      productSpecific: isFlexible
        ? "灵活订阅需要快速给用户一个低风险试用理由，不然他们会继续观望。"
        : "超级订阅必须帮用户把两年总账讲清楚，不然用户会拿买车成本做错对比。",
      validationAction:
        "把私域首轮沟通改成固定三步：先问需求、再给一页方案、最后给一条案例，3天后看高意向人数是否上升。",
    };
  }

  return {
    product,
    largestLossTitle: title,
    intuition: isFlexible
      ? "用户已经很接近下单，但最后本能上担心“现在订会不会后悔”。"
      : "用户已经有兴趣，但最后还是会怕“签了长期方案之后不灵活”。",
    rationale: isFlexible
      ? "最后一公里里，用户缺少足够明确的提车、停订和总花费确认。"
      : "最后一公里里，用户还没完全理解全新车、一价全包和长期锁价到底替他省了哪些麻烦。",
    productSpecific: isFlexible
      ? "灵活订阅的成交关键是降低决策压力，让用户知道“先用起来也安全”。"
      : "超级订阅的成交关键是把“长期承诺”从压力改成“更省心、更确定”。",
    validationAction:
      "针对最后一公里用户补一张“下单前常见问题卡片”，并由销售统一发送，7天后看最终成交率。",
  };
};

const buildContentRanking = (input: MarketingInput, products: Record<ProductKey, ProductMetrics>) => {
  const totalLeads = sumNumbers(...input.contents.map((content) => content.leads)) || input.funnel.leads.total;
  const totalDeals = input.funnel.deals.total;

  const items = input.contents
    .map((content) => {
      const productKey = content.product || "flexible";
      const productMetrics = products[productKey];
      const leadShare = safeDivide(content.leads, totalLeads);
      const cpl = safeDivide(content.spend, content.leads);
      const dealShare = safeDivide(content.deals, totalDeals);
      const qualityScore =
        leadShare !== null && dealShare !== null && leadShare > 0 ? dealShare / leadShare : null;

      let recommendation = "优化后加量";
      let reason = "当前内容能带来线索，但还需要补齐成本或成交贡献数据。";

      if ((qualityScore !== null && qualityScore > 1) || (cpl !== null && cpl <= (productMetrics.cpl || Number.POSITIVE_INFINITY))) {
        recommendation = "立刻加量";
        reason = "这条内容带来的线索更值钱，花同样的钱，更接近成交。";
      } else if ((qualityScore !== null && qualityScore < 0.8) || (cpl !== null && productMetrics.cpl !== null && cpl > productMetrics.cpl * 1.2)) {
        recommendation = "建议暂停";
        reason = "这条内容要么线索贵，要么后续成交弱，继续放量容易拖累整体效率。";
      }

      return {
        name: content.name || content.link || "未命名内容",
        product: content.product ? PRODUCT_META[content.product].label : "[待补充]",
        leads: content.leads,
        leadShare,
        cpl,
        qualityScore,
        views: content.views,
        recommendation,
        reason,
      };
    })
    .filter((item) => item.leads !== null)
    .sort((a, b) => (b.leads ?? 0) - (a.leads ?? 0))
    .slice(0, 6)
    .map((item, index) => ({
      medal: ["🥇", "🥈", "🥉"][index] || "•",
      rank: index + 1,
      ...item,
    }));

  return items;
};

const buildBudgetRecommendations = (
  input: MarketingInput,
  products: Record<ProductKey, ProductMetrics>,
  overallRating: StatusTone,
) => {
  const productSpendTotal = sumNumbers(input.spend.flexible, input.spend.super);
  const totalDeals = input.funnel.deals.total;

  if (productSpendTotal === null || totalDeals === null || totalDeals === 0) {
    return [
      {
        action: "先补数据",
        target: "投放预算",
        currentSpend: productSpendTotal,
        suggestedSpend: null,
        changePercent: null,
        reason: "当前没有足够的成交或预算拆分数据，先补齐再做预算重分配更稳。",
      },
    ];
  }

  const budgetComparison = PRODUCT_ORDER.map((product) => {
    const spend = input.spend[product];
    const deals = input.funnel.deals[product];
    return {
      product,
      spend,
      deals,
      spendShare: safeDivide(spend, input.spend.total),
      dealShare: safeDivide(deals, totalDeals),
      score:
        (safeDivide(deals, totalDeals) ?? 0) -
        (safeDivide(spend, input.spend.total) ?? 0),
    };
  }).sort((a, b) => b.score - a.score);

  const better = budgetComparison[0];
  const worse = budgetComparison[budgetComparison.length - 1];
  const worseSpend = worse.spend || 0;
  const reallocateAmount =
    roundInt(
      Math.max(
        productSpendTotal * (overallRating === "🔴" ? 0.15 : 0.08),
        worseSpend * 0.12,
      ),
    ) || 0;

  if (!reallocateAmount) {
    return [
      {
        action: "维持",
        target: "投放预算",
        currentSpend: productSpendTotal,
        suggestedSpend: productSpendTotal,
        changePercent: 0,
        reason: "当前预算结构没有明显失衡，先盯紧内容和私域转化。",
      },
    ];
  }

  return [
    {
      action: "加钱",
      target: PRODUCT_META[better.product].label,
      currentSpend: better.spend,
      suggestedSpend: (better.spend || 0) + reallocateAmount,
      changePercent: safeDivide(reallocateAmount, better.spend || productSpendTotal),
      reason: `${PRODUCT_META[better.product].label} 当前花费占比 ${formatRate(
        better.spendShare,
      )}，但成交占比 ${formatRate(better.dealShare)}，说明它更值得继续放大。`,
    },
    {
      action: "减钱",
      target: PRODUCT_META[worse.product].label,
      currentSpend: worse.spend,
      suggestedSpend: Math.max((worse.spend || 0) - reallocateAmount, 0),
      changePercent: safeDivide(-reallocateAmount, worse.spend || productSpendTotal),
      reason: `${PRODUCT_META[worse.product].label} 当前花费占比 ${formatRate(
        worse.spendShare,
      )}，但成交占比只有 ${formatRate(worse.dealShare)}，继续原配比投放会拖累整体CPS。`,
    },
  ];
};

const buildActionPlan = (
  products: Record<ProductKey, ProductMetrics>,
  diagnosis: Record<ProductKey, ProblemDiagnosis>,
  contentRanking: ContentRankingItem[],
  budgetRecommendations: BudgetRecommendation[],
) => {
  const bestContent = contentRanking[0];
  const worstContent = contentRanking.find((item) => item.recommendation === "建议暂停") || contentRanking[contentRanking.length - 1];
  const worstProduct = PRODUCT_ORDER.find((product) => products[product].cpsStatus === "🔴") || "super";
  const betterProduct = PRODUCT_ORDER.find((product) => products[product].dealStatus === "🟢") || "flexible";

  const urgent: ActionItem[] = [
    {
      owner: "投放运营",
      task: `${budgetRecommendations[0]?.target || PRODUCT_META[betterProduct].label} 预算今天内按建议重排，并同步停掉最贵的低效计划。`,
      expectation: "先把预算往更能出成交的产品和内容上推，24小时内让新增留资更集中。",
      validation: "1天后看分产品留资、3天后看分产品CPS是否回落。",
    },
    {
      owner: "私域运营",
      task: `${PRODUCT_META[worstProduct].label} 先把首轮跟进话术改成“方案 + 具体利益点 + 一个真实案例”三段式发送。`,
      expectation: "减少用户在关键流失步里的犹豫，让更多人愿意继续往下聊。",
      validation: "3天后看该产品从上一层走到下一层的人数是否增加。",
    },
  ];

  if (bestContent) {
    urgent.push({
      owner: "内容团队",
      task: `把 ${bestContent.name} 的封面结构、标题钩子和卖点组合复制出2条新内容，今晚排期上线。`,
      expectation: "尽快复制当前最能带来留资的内容打法，拉高本周新增线索。",
      validation: "3天后看这2条新内容的留资数是否达到当前优胜内容的70%以上。",
    });
  }

  const thisWeek: ActionItem[] = [
    {
      owner: "销售主管",
      task: `${PRODUCT_META[betterProduct].label} 输出一张统一答疑卡，明确价格构成、交付节奏和退出/履约说明。`,
      expectation: "让一线在关键问题上回答一致，减少因为信息不清造成的流失。",
      validation: "5天后看高意向到成交的转化率是否提升。",
    },
  ];

  if (worstContent) {
    thisWeek.push({
      owner: "内容负责人",
      task: `把 ${worstContent.name} 暂停放量，拆解它的问题是卖点不对、评论不够还是私信承接差。`,
      expectation: "避免预算继续消耗在低质线索上，把钱留给更高效的内容。",
      validation: "5天后看整体每条客资花费是否下降。",
    });
  }

  const nextReview: ActionItem[] = [
    {
      owner: "复盘负责人",
      task: `下次复盘时重点看 ${diagnosis[worstProduct].largestLossTitle} 这一环是否被修复，同时核对产品拆分数据是否完整。`,
      expectation: "把“感觉问题很多”变成“明确知道哪一步变好了”。",
      validation: "7天后看最大流失步的流失人数和转化率是否同时改善。",
    },
  ];

  return { urgent, thisWeek, nextReview };
};

const buildReliability = (audit: AuditInfo, input: MarketingInput, focus: string): ReliabilityInfo => {
  const totalDeals = input.funnel.deals.total || 0;
  const totalLeads = input.funnel.leads.total || 0;

  let sampleText = "够用";
  if (totalLeads < 30 || totalDeals < 2) {
    sampleText = "不够";
  } else if (totalLeads < 80 || totalDeals < 5) {
    sampleText = "勉强够";
  }

  let reliabilityText = "高";
  if (audit.completenessPercent < 65 || sampleText === "不够") {
    reliabilityText = "低";
  } else if (audit.completenessPercent < 85 || sampleText === "勉强够") {
    reliabilityText = "中";
  }

  const reviewDays = reliabilityText === "低" ? 3 : reliabilityText === "中" ? 5 : 7;

  const moreDataSuggestions = [
    "补充每条内容的投放花费：补了之后可以判断到底是内容不行，还是投放配比不对。",
    "补充分产品的转私域和高意向人数：补了之后可以准确定位灵活订阅和超级订阅分别卡在哪一步。",
  ];

  if (!input.contents.some((content) => content.deals !== null)) {
    moreDataSuggestions.push("补充每条内容的成交贡献：补了之后才能判断哪个内容真正带来成交，而不只是带来留资。");
  }

  return {
    dataIntegrityText: `${audit.completenessPercent}%（缺了什么：${
      audit.missingFields.length ? audit.missingFields.slice(0, 6).join("、") : "核心必填项基本完整"
    }）`,
    sampleText,
    reliabilityText,
    reviewDays,
    reviewFocus: focus,
    moreDataSuggestions: moreDataSuggestions.slice(0, 3),
  };
};

const buildMetricTable = (
  input: MarketingInput,
  products: Record<ProductKey, ProductMetrics>,
  audit: AuditInfo,
): DisplayMetric[] => {
  const totalDeals = input.funnel.deals.total;
  const totalLeads = input.funnel.leads.total;
  const totalSpend = input.spend.total;
  const overallCpl = safeDivide(totalSpend, totalLeads);
  const overallConversion = safeDivide(totalDeals, totalLeads);

  return [
    {
      label: "成交台数（灵活）",
      target: products.flexible.targetDeals !== null ? `${products.flexible.targetDeals}台` : "[待补充]",
      actual: products.flexible.deals !== null ? `${products.flexible.deals}台` : "[待补充]",
      delta: formatDelta(products.flexible.deals, products.flexible.targetDeals, "台"),
      mom: formatMoM(products.flexible.deals, input.previous.flexibleDeals),
      status: products.flexible.dealStatus,
    },
    {
      label: "成交台数（超级）",
      target: products.super.targetDeals !== null ? `${products.super.targetDeals}台` : "[待补充]",
      actual: products.super.deals !== null ? `${products.super.deals}台` : "[待补充]",
      delta: formatDelta(products.super.deals, products.super.targetDeals, "台"),
      mom: formatMoM(products.super.deals, input.previous.superDeals),
      status: products.super.dealStatus,
    },
    {
      label: "CPS（灵活）",
      target: products.flexible.cpsRedline !== null ? `≤${products.flexible.cpsRedline}元` : "[待补充]",
      actual: formatMoneyShort(products.flexible.cps),
      delta:
        products.flexible.cps !== null && products.flexible.cpsRedline !== null
          ? `${products.flexible.cps - products.flexible.cpsRedline > 0 ? "+" : ""}${roundTo(
              products.flexible.cps - products.flexible.cpsRedline,
              0,
            )}元`
          : "——",
      mom: formatMoM(products.flexible.cps, input.previous.flexibleCps),
      status: products.flexible.cpsStatus,
    },
    {
      label: "CPS（超级）",
      target: products.super.cpsRedline !== null ? `≤${products.super.cpsRedline}元` : "[待补充]",
      actual: formatMoneyShort(products.super.cps),
      delta:
        products.super.cps !== null && products.super.cpsRedline !== null
          ? `${products.super.cps - products.super.cpsRedline > 0 ? "+" : ""}${roundTo(
              products.super.cps - products.super.cpsRedline,
              0,
            )}元`
          : "——",
      mom: formatMoM(products.super.cps, input.previous.superCps),
      status: products.super.cpsStatus,
    },
    {
      label: "每条客资花了多少钱",
      target: "——",
      actual: formatMoneyShort(overallCpl),
      delta: "——",
      mom: formatMoM(overallCpl, input.previous.cpl),
      status: input.previous.cpl !== null ? getCpsStatus(overallCpl, input.previous.cpl) : "——",
    },
    {
      label: "整体成交率",
      target: "——",
      actual: formatRate(overallConversion),
      delta: "——",
      mom: formatMoM(overallConversion, input.previous.overallConversionRate),
      status: input.previous.overallConversionRate !== null ? getTargetStatus(overallConversion, input.previous.overallConversionRate) : "——",
    },
    {
      label: "总投放费用",
      target: totalSpend !== null ? formatMoneyShort(totalSpend) : "[待补充]",
      actual: formatMoneyShort(totalSpend),
      delta: formatDelta(totalSpend, input.previous.totalSpend, "元"),
      mom: "——",
      status: "——",
    },
  ];
};

const getOverallRating = (products: Record<ProductKey, ProductMetrics>): [StatusTone, string] => {
  const tones = PRODUCT_ORDER.flatMap((product) => [products[product].dealStatus, products[product].cpsStatus]);
  if (tones.every((tone) => tone === "🟢")) {
    return ["🟢", "🟢全面达标"];
  }
  if (tones.some((tone) => tone === "🔴")) {
    return ["🔴", "🔴需要立刻干预"];
  }
  return ["🟡", "🟡局部有问题"];
};

const buildScalePlan = (
  overallRating: StatusTone,
  contentRanking: ContentRankingItem[],
  products: Record<ProductKey, ProductMetrics>,
): MarketingDashboardData["scalePlan"] => {
  if (overallRating !== "🟢") {
    return {
      enabled: false,
      effectiveTraits: [],
      comboFlexible: "",
      comboSuper: "",
      steps: [],
      stopLoss: "",
    };
  }

  const bestFlexible = contentRanking.find((item) => item.product.includes("灵活"));
  const bestSuper = contentRanking.find((item) => item.product.includes("超级"));

  return {
    enabled: true,
    effectiveTraits: [
      {
        dimension: "开场钩子",
        trait: "先抛真实场景，再给具体方案",
        evidence: "高表现内容通常先让用户代入，再给可执行解法。",
        product: "双产品通用",
      },
      {
        dimension: "卖点表达",
        trait: "用“一价全包、月付轻松、流程简单”替代价格对打",
        evidence: "能带来线索的内容更强调轻负担和省心，而不是直接和别的渠道比价。",
        product: "双产品通用",
      },
      {
        dimension: "成交推进",
        trait: "把方案、案例、答疑卡打包发",
        evidence: "进入私域后能否快速回答“值不值、适不适合我”决定最终成交率。",
        product: "双产品通用",
      },
    ],
    comboFlexible: `灵活订阅：${bestFlexible?.name || "当前第一名内容"} × 快速转私域承接 = 预估每台成交花${formatMoneyShort(
      products.flexible.cps,
    )}`,
    comboSuper: `超级订阅：${bestSuper?.name || "当前第一名内容"} × 总账解释型私域话术 = 预估每台成交花${formatMoneyShort(
      products.super.cps,
    )}`,
    steps: [
      "第一步：先把当前优胜内容复制2-3条同结构新素材，再小步放量。",
      "第二步：每天盯新增线索和私域承接，如果线索贵了但成交没跟上，立刻停。 ",
    ],
    stopLoss: "如果连续3天每条客资花费上涨超过20%，或高意向到成交率跌到20%以下，立刻暂停放量。",
  };
};

const formatStatusLine = (status: StatusTone, text: string) => `${status} ${text}`;

const buildFallbackReport = (dashboard: MarketingDashboardData) => {
  const { products, funnels, contentRanking, budgetRecommendations, reliability, diagnosis } = dashboard;
  const overallCplRow = dashboard.metricsTable.find((row) => row.label === "每条客资花了多少钱");
  const overallConversionRow = dashboard.metricsTable.find((row) => row.label === "整体成交率");
  const totalSpendRow = dashboard.metricsTable.find((row) => row.label === "总投放费用");
  const lines: string[] = [];

  lines.push("═══ 📊 模块一：目标 vs 实际核心指标对比表 ═══");
  lines.push("这部分先看目标有没有完成，以及钱花得值不值。");
  lines.push("");
  lines.push("| 指标 | 目标值 | 实际值 | 差值 | 环比 | 状态 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  dashboard.metricsTable.forEach((row) => {
    lines.push(`| ${row.label} | ${row.target} | ${row.actual} | ${row.delta} | ${row.mom} | ${row.status} |`);
  });
  lines.push("");

  lines.push("═══ 🔽 模块二：客户从留资到成交，每一步走了多少人 ═══");
  lines.push("这部分看用户到底卡在哪一步，先找跑掉人数最多的地方。");
  lines.push("");
  PRODUCT_ORDER.forEach((product) => {
    const label = PRODUCT_META[product].label;
    const funnel = funnels[product];
    lines.push(`【${label}】`);
    funnel.stages.forEach((stage, index) => {
      const unit = index === 3 ? "台" : "人";
      lines.push(`${["①", "②", "③", "④"][index]} ${stage.label}：${formatCount(stage.value, unit)}`);
      if (index < funnel.steps.length) {
        const step = funnel.steps[index];
        lines.push(
          `↓ ${step.fromValue !== null && step.toValue !== null ? `每100人里有${roundTo((step.conversionRate || 0) * 100, 1)}人走到下一步（流失了${formatCount(step.lossCount, "人")}）` : "这一段缺少完整数据，建议补齐"}`,
        );
      }
    });
    lines.push(
      `🚨 流失最多的一步：${
        funnel.largestLossStep
          ? `${funnel.steps.indexOf(funnel.largestLossStep) + 1}步（${funnel.largestLossStep.fromLabel}到${funnel.largestLossStep.toLabel}），这一步跑掉了${formatCount(
              funnel.largestLossStep.lossCount,
              "人",
            )}，占总流失的${formatRate(funnel.largestLossStep.lossShare)}`
          : "[待补充]"
      }`,
    );
    lines.push(
      `⚠️ 转化最差的一步：${
        funnel.weakestConversionStep
          ? `${funnel.steps.indexOf(funnel.weakestConversionStep) + 1}步（${funnel.weakestConversionStep.fromLabel}到${funnel.weakestConversionStep.toLabel}），每100人里只有${roundTo(
              (funnel.weakestConversionStep.conversionRate || 0) * 100,
              1,
            )}人继续`
          : "[待补充]"
      }`,
    );
    lines.push("📌 两个不一样时，优先解决流失人数最多的那步");
    funnel.notes.forEach((note) => lines.push(note));
    lines.push("");
  });

  lines.push("═══ 🎯 模块三：这个月整体做得怎么样 ═══");
  lines.push("这部分讲结论，先看目标完成、花钱效率和整体转化。");
  lines.push("");
  PRODUCT_ORDER.forEach((product) => {
    const metrics = products[product];
    lines.push(`【${metrics.label}】`);
    lines.push(
      formatStatusLine(
        metrics.dealStatus,
        `成交目标：完成了${formatRate(metrics.targetCompletionRate)}${metrics.targetCompletionRate !== null ? "" : " [待补充目标]"}`,
      ),
    );
    lines.push(
      formatStatusLine(
        metrics.cpsStatus,
        `花钱效率：每台成交花了${formatMoneyShort(metrics.cps)}，${metrics.cps !== null && metrics.cpsRedline !== null && metrics.cps > metrics.cpsRedline ? "高于" : "低于"}红线${metrics.cpsRedline !== null ? `${roundTo(Math.abs((metrics.cps || 0) - metrics.cpsRedline), 0)}元` : "[待补充]"}`,
      ),
    );
    lines.push(
      formatStatusLine(
        metrics.overallConversionRate !== null && metrics.overallConversionRate >= 0.1 ? "🟢" : metrics.overallConversionRate !== null && metrics.overallConversionRate >= 0.03 ? "🟡" : "🔴",
        `整体转化：${metrics.overallConversionRate !== null && metrics.overallConversionRate > 0 ? `每${roundTo(1 / metrics.overallConversionRate, 0)}个留资成交1台` : "[待补充]"}`,
      ),
    );
    lines.push("");
  });
  lines.push(`综合评级：${dashboard.overallRatingLabel}`);
  lines.push("");

  lines.push("═══ 📝 模块四：哪些内容值得加大投入，哪些该停 ═══");
  lines.push("这部分按“带来多少留资、线索贵不贵、后续成交值不值”来看。");
  lines.push("");
  lines.push("| 排名 | 内容名称 | 产品 | 带来多少留资 | 占比 | 每条留资花多少钱 | 建议 |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  if (contentRanking.length) {
    contentRanking.forEach((item) => {
      lines.push(
        `| ${item.medal} ${item.rank} | ${item.name} | ${item.product} | ${formatCount(item.leads, "条")} | ${formatRate(item.leadShare)} | ${formatMoneyShort(item.cpl)} | ${item.recommendation} |`,
      );
    });
  } else {
    lines.push("| — | [待补充内容数据] | — | — | — | — | 先补内容数据 |");
  }
  lines.push("");
  lines.push(`💡 最值得放量的内容：${dashboard.contentInsights.best}，原因：${dashboard.contentInsights.bestReason}`);
  lines.push(`⚠️ 效率最差的内容：${dashboard.contentInsights.worst}，建议：${dashboard.contentInsights.worstAction}`);
  lines.push("");

  lines.push("═══ 🧭 模块五：问题出在哪，为什么，怎么解决 ═══");
  lines.push("这部分把问题拆开讲清楚：到底卡在哪、为什么卡、预算怎么调。");
  lines.push("");
  PRODUCT_ORDER.forEach((product) => {
    const item = diagnosis[product];
    lines.push(`【${PRODUCT_META[product].label}】`);
    lines.push("【5.1 流失最多的那步，用户为什么没走下去】");
    lines.push(`流失最多的是${item.largestLossTitle}：`);
    lines.push(`用户的直觉反应是什么：${item.intuition}`);
    lines.push(`用户理性思考后卡在哪：${item.rationale}`);
    lines.push(`结合SUPEREV产品的具体推断：${item.productSpecific}`);
    lines.push(`怎么验证这个判断：${item.validationAction}`);
    lines.push("");
  });
  lines.push("【5.2 钱花得值不值——两个产品对比】");
  lines.push("| 产品 | 花了多少钱 | 占总预算 | 成交多少台 | 占总成交 | 值不值 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  dashboard.budgetComparison.forEach((row) => {
    lines.push(
      `| ${row.product} | ${formatMoneyShort(row.spend)} | ${formatRate(row.spendShare)} | ${formatCount(row.deals, "台")} | ${formatRate(row.dealShare)} | ${row.worthIt} |`,
    );
  });
  lines.push("");
  lines.push("【5.3 预算怎么重新分配】");
  lines.push("| 操作 | 针对谁 | 现在花多少 | 建议改成多少 | 调整幅度 | 为什么这么调 |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  budgetRecommendations.forEach((item) => {
    lines.push(
      `| ${item.action} | ${item.target} | ${formatMoneyShort(item.currentSpend)} | ${formatMoneyShort(item.suggestedSpend)} | ${item.changePercent !== null ? `${item.changePercent > 0 ? "+" : ""}${roundTo(item.changePercent * 100, 1)}%` : "——"} | ${item.reason} |`,
    );
  });
  lines.push("");

  lines.push("═══ ⚡ 模块六：接下来具体怎么做 ═══");
  lines.push("这部分只给能马上执行的动作，每条都写清楚谁做、做什么、预期什么结果。");
  lines.push("");
  lines.push("【🔴 今天就要做】");
  lines.push("");
  dashboard.actionPlan.urgent.forEach((item) => {
    lines.push(`[${item.owner}]：${item.task} → 预计：${item.expectation} → ${item.validation}`);
    lines.push("");
  });
  lines.push("【🟡 这周内做（3-5天）】");
  lines.push("");
  dashboard.actionPlan.thisWeek.forEach((item) => {
    lines.push(`[${item.owner}]：${item.task} → 预计：${item.expectation} → ${item.validation}`);
    lines.push("");
  });
  lines.push("【🟢 下周复盘时确认】");
  lines.push("");
  dashboard.actionPlan.nextReview.forEach((item) => {
    lines.push(`要看的动作：${item.task} → 达标标准：${item.validation}`);
  });
  lines.push("");

  if (dashboard.scalePlan.enabled) {
    lines.push("═══ 🚀 模块七：如果整体达标，怎么继续放大成果 ═══");
    lines.push("这部分只在整体已经稳住时出现，告诉你怎么放大，不让结果回撤。");
    lines.push("");
    lines.push("有效内容的共同特点：");
    lines.push("| 维度 | 有效特征 | 数据依据 | 适用产品 |");
    lines.push("| --- | --- | --- | --- |");
    dashboard.scalePlan.effectiveTraits.forEach((item) => {
      lines.push(`| ${item.dimension} | ${item.trait} | ${item.evidence} | ${item.product} |`);
    });
    lines.push("");
    lines.push("最优放量组合：");
    lines.push(dashboard.scalePlan.comboFlexible);
    lines.push(dashboard.scalePlan.comboSuper);
    lines.push("");
    lines.push("放量步骤 + 什么情况下要踩刹车：");
    dashboard.scalePlan.steps.forEach((step) => lines.push(step));
    lines.push(`止损线：${dashboard.scalePlan.stopLoss}`);
    lines.push("");
  }

  lines.push("═══ 📌 最后：这份分析有多可靠 ═══");
  lines.push("这部分告诉你现在的结论有多稳，还差哪些数据能让判断更准。");
  lines.push("");
  lines.push(`数据完整度：${reliability.dataIntegrityText}`);
  lines.push(`样本量够不够：${reliability.sampleText}`);
  lines.push(`结论可靠程度：${reliability.reliabilityText}（原因：${dashboard.audit.warnings.concat(dashboard.audit.anomalies).slice(0, 2).join("；") || "核心数据较完整"}）`);
  lines.push(`建议复盘时间：${reliability.reviewDays}天后，重点看：${reliability.reviewFocus}`);
  lines.push("❓ 补充这些数据，分析会更准：");
  reliability.moreDataSuggestions.forEach((item) => lines.push(item));
  lines.push("");

  return lines.join("\n");
};

export const buildAiPrompt = (result: MarketingAnalysisResult) => `
<role>
你是 SUPEREV 超级电动的「全链路营销效果追踪与成交优化决策引擎」。
你需要同时使用三种思考方式：
1. 全链路归因：每个数字必须放在完整漏斗中看，不孤立解读。
2. 增长放大：每个建议都必须指向24小时内可执行的动作。
3. 用户决策心理：用用户的直觉反应和理性判断解释为什么卡住。
你的唯一目标：让实际CPS低于红线、让成交台数持续增长。
</role>

<硬性要求>
1. 严格按7个模块顺序输出，不得合并。
2. 灵活订阅、超级订阅必须分开写。
3. 所有数字只允许使用下方给你的结构化数据。
4. 如果数据缺失，写 [待补充]，不要编造。
5. 所有建议必须写清楚 [谁来做] + [做什么] + [预计有什么变化] + [几天后看什么数据]。
6. 用口语化中文，不要堆专业术语。
7. 不要触碰以下红线：不能和4S店或官方渠道直接比价；不能承诺超实际交付能力；不能传播“明日车库”；不能混用灵活订阅和超级订阅卖点。
</硬性要求>

<输出格式>
使用 Markdown 输出，并完整包含以下标题：
═══ 📊 模块一：目标 vs 实际核心指标对比表 ═══
═══ 🔽 模块二：客户从留资到成交，每一步走了多少人 ═══
═══ 🎯 模块三：这个月整体做得怎么样 ═══
═══ 📝 模块四：哪些内容值得加大投入，哪些该停 ═══
═══ 🧭 模块五：问题出在哪，为什么，怎么解决 ═══
═══ ⚡ 模块六：接下来具体怎么做 ═══
只有综合评级为🟢时，才输出：
═══ 🚀 模块七：如果整体达标，怎么继续放大成果 ═══
最后必须输出：
═══ 📌 最后：这份分析有多可靠 ═══
</输出格式>

<结构化数据>
${JSON.stringify(result.dashboard, null, 2)}
</结构化数据>

<原始输入>
${JSON.stringify(result.normalizedInput, null, 2)}
</原始输入>
`;

export const analyzeMarketingInput = (incoming: MarketingInput): MarketingAnalysisResult => {
  const normalizedInput = sanitizeMarketingInput(incoming);
  const audit = buildAudit(normalizedInput);
  const products = {
    flexible: buildProductMetrics(normalizedInput, "flexible"),
    super: buildProductMetrics(normalizedInput, "super"),
  };
  const funnels = {
    flexible: buildFunnelInsight(products.flexible),
    super: buildFunnelInsight(products.super),
  };
  const diagnosis = {
    flexible: buildProblemDiagnosis("flexible", products.flexible, funnels.flexible),
    super: buildProblemDiagnosis("super", products.super, funnels.super),
  };
  const metricsTable = buildMetricTable(normalizedInput, products, audit);
  const [overallRating, overallRatingLabel] = getOverallRating(products);
  const contentRanking = buildContentRanking(normalizedInput, products);
  const budgetRecommendations = buildBudgetRecommendations(normalizedInput, products, overallRating);
  const budgetComparison = PRODUCT_ORDER.map((product) => ({
    product: PRODUCT_META[product].label,
    spend: normalizedInput.spend[product],
    spendShare: safeDivide(normalizedInput.spend[product], normalizedInput.spend.total),
    deals: normalizedInput.funnel.deals[product],
    dealShare: safeDivide(normalizedInput.funnel.deals[product], normalizedInput.funnel.deals.total),
    worthIt:
      products[product].cpsStatus === "🟢" && products[product].dealStatus !== "🔴"
        ? "✅"
        : "❌",
  }));
  const actionPlan = buildActionPlan(products, diagnosis, contentRanking, budgetRecommendations);
  const contentInsights = {
    best: contentRanking[0]?.name || "[待补充]",
    bestReason: contentRanking[0]?.reason || "先补内容数据。",
    worst:
      contentRanking.find((item) => item.recommendation === "建议暂停")?.name ||
      contentRanking[contentRanking.length - 1]?.name ||
      "[待补充]",
    worstAction:
      contentRanking.find((item) => item.recommendation === "建议暂停")?.reason ||
      "先补内容成本和成交贡献，再判断是否暂停。",
  };
  const reviewFocus =
    diagnosis.super.largestLossTitle !== "缺少足够的分产品漏斗数据"
      ? `优先盯 ${PRODUCT_META.super.label}${diagnosis.super.largestLossTitle}`
      : `优先盯 ${PRODUCT_META.flexible.label}${diagnosis.flexible.largestLossTitle}`;
  const reliability = buildReliability(audit, normalizedInput, reviewFocus);
  const scalePlan = buildScalePlan(overallRating, contentRanking, products);

  const dashboard: MarketingDashboardData = {
    engineLabel: "结构化输入 + 三专家诊断引擎",
    activeExpertLenses: [
      "全链路归因：把所有数字放回完整漏斗里看",
      "增长放大：优先放大已验证有效的内容和预算",
      "用户决策：用用户直觉反应和理性顾虑解释卡点",
    ],
    metricsTable,
    overallRating,
    overallRatingLabel,
    audit,
    products,
    funnels,
    diagnosis,
    contentRanking,
    contentInsights,
    budgetComparison,
    budgetRecommendations,
    actionPlan,
    scalePlan,
    reliability,
  };

  const result: MarketingAnalysisResult = {
    normalizedInput,
    dashboard,
    fallbackReport: "",
  };

  result.fallbackReport = buildFallbackReport(result.dashboard);
  return result;
};

export { buildFallbackReport };
