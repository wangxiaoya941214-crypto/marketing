import React, { Suspense, lazy, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  ClipboardCheck,
  Download,
  FileText,
  Plus,
  RefreshCcw,
  Upload,
  X,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  PRODUCT_META,
  PRODUCT_ORDER,
  analyzeMarketingInput,
  auditMarketingInput,
  buildTemplateCsv,
  createEmptyContent,
  createEmptyInput,
  type MarketingContentInput,
  type MarketingDashboardData,
  type MarketingInput,
} from "../shared/marketing-engine";
import { getCriticalAnalysisReadiness } from "../shared/analysis-readiness";
import type { InsightResult } from "../shared/ai-insight-engine";
import { buildLeadSheetModeSummary } from "../shared/lead-sheet-mode";
import type { RecognitionAudit } from "../shared/recognition-audit";
import {
  ActionPlanSection,
  AnalysisReportSection,
  BudgetRecommendationsSection,
  ContentRankingSection,
  ReliabilitySection,
  ResultModuleNavigation,
  ScalePlanSection,
} from "./components/result-modules";
import {
  MoMOverviewSection,
  PreviousMetricsSection,
} from "./components/previous-period";
import {
  LeadImportAuditPanel,
  RecognitionAuditPanel,
} from "./components/lead-import-audit";
import type { LeadSheetAdapterSidecar } from "../shared/adapters/lead-sheet/build-marketing-input-from-leads";
import type {
  DiagnosisRoute,
  DiagnosisRoutingResult,
  RoutingConfidence,
  SourceType,
} from "../shared/routing/types";
import type {
  V2AnalyzeResponse,
  V2BuildSessionResponse,
  V2DashboardType,
  V2SnapshotRecord,
  V2UploadSessionRecord,
} from "../shared/v2/types";

const V2Workspace = lazy(async () => {
  const module = await import("./components/v2-workspace");
  return { default: module.V2Workspace };
});

const EMPTY_INSIGHTS: InsightResult = {
  anomalies: [],
  opportunities: [],
  risks: [],
  topFindings: [],
};

const SOURCE_META: Record<SourceType, { label: string; hint: string }> = {
  closed_loop_workbook: {
    label: "闭环底座工作簿",
    hint: "适合直接进入完整闭环分析。",
  },
  crm_lead_sheet: {
    label: "CRM 主线索表",
    hint: "更适合看销售跟进、打通与下单过程。",
  },
  xhs_campaign_report: {
    label: "小红书投放报表",
    hint: "更适合看计划花费、点击与转化效率。",
  },
  xhs_lead_list: {
    label: "小红书线索明细",
    hint: "更适合看内容到留资的传播效果。",
  },
  xhs_daily_report: {
    label: "小红书日报表",
    hint: "更适合看按天波动和投放表现。",
  },
  marketing_template: {
    label: "营销诊断模板",
    hint: "可以直接进入当前营销诊断流程。",
  },
  unstructured_document: {
    label: "非结构化材料",
    hint: "系统会先按通用营销诊断处理。",
  },
};

const ROUTE_META: Record<DiagnosisRoute, IntakeRouteMeta> = {
  closed_loop_analysis: {
    label: "完整闭环分析",
    shortLabel: "闭环分析",
    resultTitle: "闭环分析结果",
    matchingTitle: "闭环分析准备中",
    matchingDescription: "系统已识别为闭环底座，将直接进入闭环导入、审计、复核和驾驶舱。",
    summary: "把内容传播、线索、旅程和成交放到一条链路里看。",
    reviewFocus: [
      { title: "快照版本", description: "先确认当前结果来自哪一版快照，再判断结论能不能直接汇报。" },
      { title: "低置信样本", description: "如果还有待复核样本，先处理可信度，再看驾驶舱结论。" },
      { title: "导入摘要", description: "先看解析行数、打通数和待复核数，避免在错误底座上继续分析。" },
    ],
    resultFocus: [
      { title: "闭环可信度", description: "先看这版快照是否稳定，再看经营结论和动作建议。" },
      { title: "经营结论", description: "优先看最值得放大的增长点、最大风险和最该补的口径。" },
      { title: "驾驶舱视角", description: "内容、线索、旅程、成交要一起看，不能只看单点指标。" },
    ],
    caution: "完整闭环分析更重“版本”和“可信度”，不建议跳过复核直接汇报。",
  },
  marketing_diagnosis: {
    label: "营销诊断",
    shortLabel: "营销诊断",
    resultTitle: "营销效果诊断报告",
    matchingTitle: "营销诊断数据匹配",
    matchingDescription: "先确认识别结果，再生成最终诊断看板和报告。",
    summary: "适合模板、汇总表、非结构化复盘材料的单次诊断。",
    reviewFocus: [
      { title: "漏斗字段", description: "先确认留资、私域、高意向、成交四层数据有没有缺口。" },
      { title: "预算字段", description: "检查投放金额和 CPS 红线，避免结果页结论失真。" },
      { title: "内容明细", description: "至少把核心内容、花费和贡献字段补齐，再生成最终分析。" },
    ],
    resultFocus: [
      { title: "结果是否可信", description: "先看可靠性说明，再读完整报告和动作建议。" },
      { title: "问题在哪一层", description: "优先找流失最大和转化最差的环节，不要只看总体好坏。" },
      { title: "该怎么做", description: "重点阅读内容排名、预算建议和动作清单。" },
    ],
    caution: "如果预算、红线或内容明细没补齐，营销诊断的建议强度会明显下降。",
  },
  sales_followup_diagnosis: {
    label: "销售跟进诊断",
    shortLabel: "销售跟进",
    resultTitle: "销售跟进诊断报告",
    matchingTitle: "销售跟进诊断数据匹配",
    matchingDescription: "先确认这份主线索表能不能直接判断销售跟进，再决定是否进入后续诊断。",
    summary: "聚焦销售跟进质量、加微/高意向/成交漏斗和订单冲突。",
    reviewFocus: [
      { title: "主线索口径", description: "优先确认主线索字段、业务类型和成交状态是不是可信。" },
      { title: "销售跟进信息", description: "检查跟进销售、加微、下单等字段是否完整。" },
      { title: "冲突样本", description: "如果导入审计提示冲突，先看冲突样本，不要直接生成报告。" },
    ],
    resultFocus: [
      { title: "打通情况", description: "先看主线索打通和跟进链路是不是完整。" },
      { title: "流失节点", description: "重点判断卡在留资、加微、跟进还是下单。" },
      { title: "销售动作", description: "更适合拿来复盘销售跟进节奏，而不是看投放创意本身。" },
    ],
    caution: "主线索表模式不是完整经营复盘。它更适合看销售跟进质量和成交风险，不适合单靠这份表下完整投放结论。",
  },
  campaign_conversion_diagnosis: {
    label: "投放数据转化诊断",
    shortLabel: "投放转化",
    resultTitle: "投放数据转化诊断报告",
    matchingTitle: "投放数据转化诊断数据匹配",
    matchingDescription: "先确认识别结果，再沿当前统一框架进入后续诊断。",
    summary: "聚焦计划消耗、点击、留资和转化效率。",
    reviewFocus: [
      { title: "计划字段", description: "先确认计划名称、消耗、点击、留资字段能不能对齐。" },
      { title: "时间口径", description: "日报和计划报表要先确认时间范围，否则趋势判断会偏。" },
      { title: "转化字段", description: "把留资、加微、高意向、成交字段补齐，结果才有判断力。" },
    ],
    resultFocus: [
      { title: "投放效率", description: "优先看花费、点击、留资、转化之间的效率关系。" },
      { title: "计划差异", description: "重点找出花费高但结果差的计划，以及值得加量的计划。" },
      { title: "转化链路", description: "不要只看曝光和点击，还要看后链路有没有断。" },
    ],
    caution: "只有投放消耗没有后链路数据时，这类诊断会更偏前段转化判断。",
  },
  content_to_lead_diagnosis: {
    label: "内容传播诊断",
    shortLabel: "内容传播",
    resultTitle: "内容传播诊断报告",
    matchingTitle: "内容传播诊断数据匹配",
    matchingDescription: "先确认识别结果，再沿当前统一框架进入后续诊断。",
    summary: "聚焦笔记、线索、评论、留资和内容带线效率。",
    reviewFocus: [
      { title: "内容字段", description: "先确认来源笔记、流量类型、内容名称和产品归属。" },
      { title: "留资口径", description: "重点确认评论、私信、留资和成交贡献字段。" },
      { title: "内容归属", description: "先把内容归到正确产品和板块，再看排名和建议。" },
    ],
    resultFocus: [
      { title: "内容带线", description: "重点看哪类内容能带来更多线索和更高质量留资。" },
      { title: "流量质量", description: "不要只看浏览量，要一起看评论、私信和留资效率。" },
      { title: "内容动作", description: "这类诊断更适合指导选题、内容结构和加量方向。" },
    ],
    caution: "如果内容归属和贡献字段不完整，内容传播诊断会偏向表面热度。",
  },
};

const CONFIDENCE_META: Record<
  RoutingConfidence,
  { label: string; className: string; summary: string }
> = {
  high: {
    label: "高可信",
    className: "border-[#08E03B]/20 bg-[#08E03B]/10 text-[#067b21]",
    summary: "系统判断比较稳定，可以直接继续。",
  },
  medium: {
    label: "中可信",
    className: "border-yellow-200 bg-yellow-50 text-yellow-700",
    summary: "系统会直接进入当前流程，建议在数据校对页重点复核关键字段。",
  },
  low: {
    label: "低可信",
    className: "border-red-200 bg-red-50 text-red-700",
    summary: "系统已按最稳妥的兼容链继续，建议优先复核关键字段和业务边界。",
  },
};

type ResultPayload = {
  analysis: string;
  dashboard: MarketingDashboardData;
  normalizedInput: MarketingInput;
  insights: InsightResult;
  engineMode: string;
};

type RecognitionPayload = {
  recognizedInput?: MarketingInput;
  recognitionMode?: string;
  importAudit?: LeadSheetAdapterSidecar | null;
  recognitionAudit?: RecognitionAudit | null;
};

type Screen = "home" | "matching" | "result";
type ProductFunnel = MarketingDashboardData["funnels"]["flexible"];
type RouteFocusItem = {
  title: string;
  description: string;
};
type EnterV2Options = {
  initialDashboard: V2DashboardType;
  initialSnapshot: V2SnapshotRecord;
  initialUploadSession: V2UploadSessionRecord;
};
type IntakeRouteMeta = {
  label: string;
  shortLabel: string;
  resultTitle: string;
  matchingTitle: string;
  matchingDescription: string;
  summary: string;
  reviewFocus: RouteFocusItem[];
  resultFocus: RouteFocusItem[];
  caution: string;
};
type LocalUploadStatus =
  | "waiting"
  | "uploaded"
  | "analyzing"
  | "recognized"
  | "legacy_only"
  | "error";
type LocalUploadItem = {
  id: string;
  file: File;
  status: LocalUploadStatus;
  statusHint: string;
  v2Eligible: boolean | null;
};

const CARD_BG = "bg-white rounded-[2rem] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]";

const numberValue = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value));

const toNullableNumber = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(/[，,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const formatMoney = (value: number | null | undefined) =>
  value === null || value === undefined ? "——" : `${Math.round(value * 100) / 100}元`;

const formatCount = (value: number | null | undefined, unit = "人") =>
  value === null || value === undefined ? "——" : `${Math.round(value * 100) / 100}${unit}`;

const formatRate = (value: number | null | undefined) =>
  value === null || value === undefined ? "——" : `${Math.round(value * 1000) / 10}%`;

const formatLocalDateStamp = (date = new Date()) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round((size / 1024) * 10) / 10} KB`;
  return `${Math.round((size / (1024 * 1024)) * 10) / 10} MB`;
};

const buildLocalUploadId = (file: File) =>
  [file.name, file.size, file.lastModified, Math.random().toString(36).slice(2, 8)].join(":");

const createLocalUploadItem = (file: File): LocalUploadItem => ({
  id: buildLocalUploadId(file),
  file,
  status: "waiting",
  statusHint: "已加入本次上传，等待开始识别。",
  v2Eligible: null,
});

const LOCAL_UPLOAD_STATUS_META: Record<
  LocalUploadStatus,
  { label: string; className: string }
> = {
  waiting: {
    label: "等待识别",
    className: "border-gray-200 bg-gray-50 text-gray-600",
  },
  uploaded: {
    label: "已上传",
    className: "border-gray-200 bg-white text-gray-700",
  },
  analyzing: {
    label: "识别中",
    className: "border-yellow-200 bg-yellow-50 text-yellow-700",
  },
  recognized: {
    label: "已识别",
    className: "border-[#08E03B]/20 bg-[#08E03B]/10 text-[#067b21]",
  },
  legacy_only: {
    label: "兼容链",
    className: "border-gray-200 bg-gray-50 text-gray-600",
  },
  error: {
    label: "处理失败",
    className: "border-red-200 bg-red-50 text-red-700",
  },
};

const buildRecognitionMessage = (
  recognitionAudit?: RecognitionAudit | null,
  importAudit?: LeadSheetAdapterSidecar | null,
) => {
  if (importAudit?.sheetType === "lead_detail_sheet") {
    if (
      importAudit.orderConflictCount > 0 ||
      importAudit.manualReviewDealCount > 0 ||
      importAudit.excludedConflictDealCount > 0
    ) {
      const excludedSummary =
        importAudit.excludedConflictDealCount > 0
          ? `系统当前自动计入成交 ${importAudit.countedDeals} 条，已按保守口径剔除 ${importAudit.excludedConflictDealCount} 条订单冲突记录。`
          : `系统当前自动计入成交 ${importAudit.countedDeals} 条。`;

      return `当前按销售跟进诊断继续处理，这不是完整经营复盘。先别急着补预算，先看订单冲突和人工确认成交。${excludedSummary}`;
    }
  }

  if (!recognitionAudit) {
    return importAudit?.sheetType === "lead_detail_sheet"
      ? "已识别为主线索表，当前按销售跟进诊断进入数据校对页。主线索漏斗可先看，目标、花费和 CPS 红线仍需补齐。"
      : "已完成数据识别，当前页面下一步会呈现全部识别结果，请先确认和补充，再生成最终看板。";
  }

  if (recognitionAudit.confidence === "low") {
    return `本次识别置信度低，请优先复核：${recognitionAudit.recommendedFocus.join("、") || "关键漏斗和费用字段"}。`;
  }

  if (recognitionAudit.confidence === "medium") {
    return `当前识别可继续使用，但建议先复核：${recognitionAudit.recommendedFocus.join("、") || "关键字段"}。`;
  }

  if (importAudit?.sheetType === "lead_detail_sheet") {
    return recognitionAudit.fallbackUsed
      ? "已按主线索表完成规则抽取，并补充了 AI 空白字段。当前按销售跟进诊断继续，主线索漏斗可以先看，目标、花费和 CPS 红线仍需补齐。"
      : "已识别为主线索表，当前按销售跟进诊断进入数据校对页。主线索漏斗已自动填入匹配页，目标、花费和 CPS 红线仍需补齐。";
  }

  return recognitionAudit.fallbackUsed
    ? "规则抽取已完成，且已用 AI 补全部分空白字段，请确认后继续生成最终看板。"
    : "已完成数据识别，当前页面下一步会呈现全部识别结果，请先确认和补充，再生成最终看板。";
};

const downloadFile = (name: string, content: string, mimeType = "text/csv;charset=utf-8") => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const toFriendlyRequestErrorMessage = (
  error: unknown,
  fallback = "请求失败，请稍后重试。",
) => {
  const message =
    error instanceof Error ? error.message.trim() : typeof error === "string" ? error.trim() : "";

  if (!message) {
    return fallback;
  }

  if (message === "Failed to fetch" || /NetworkError|Load failed|fetch/i.test(message)) {
    return "网络请求失败，请确认服务已启动后重试。";
  }

  return message;
};

const Card = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => <div className={`${CARD_BG} ${className}`}>{children}</div>;

const RouteFocusCard = ({
  title,
  description,
}: RouteFocusItem) => (
  <div className="rounded-[1.5rem] border border-gray-100 bg-gray-50 px-5 py-5">
    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
      {title}
    </p>
    <p className="mt-3 text-sm font-medium leading-7 text-gray-700">
      {description}
    </p>
  </div>
);

const StatusPill = ({ status }: { status: string }) => {
  const className =
    status === "🟢"
      ? "bg-[#08E03B]/10 text-[#0c8c28] border-[#08E03B]/20"
      : status === "🟡"
        ? "bg-yellow-50 text-yellow-700 border-yellow-200"
        : status === "🔴"
          ? "bg-red-50 text-red-700 border-red-200"
          : "bg-gray-100 text-gray-500 border-gray-200";
  return <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${className}`}>{status === "——" ? "待补充" : status}</span>;
};

const FieldLabel = ({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) => (
  <label htmlFor={htmlFor} className="block text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
    {children}
  </label>
);

const TextInput = ({
  id,
  value,
  onChange,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) => (
  <input
    id={id}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    placeholder={placeholder}
    className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none transition focus:border-[#08E03B]"
  />
);

const NumberInput = ({
  id,
  value,
  onChange,
  placeholder,
}: {
  id?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
}) => (
  <input
    id={id}
    value={numberValue(value)}
    onChange={(event) => onChange(toNullableNumber(event.target.value))}
    placeholder={placeholder}
    inputMode="decimal"
    className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none transition focus:border-[#08E03B]"
  />
);

const TextArea = ({
  id,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) => (
  <textarea
    id={id}
    rows={rows}
    value={value}
    onChange={(event) => onChange(event.target.value)}
    placeholder={placeholder}
    className="mt-2 w-full rounded-3xl border border-gray-200 bg-white px-4 py-4 text-sm font-medium text-gray-900 outline-none transition focus:border-[#08E03B]"
  />
);

const SummaryCard = ({
  title,
  value,
  hint,
  status,
}: {
  title: string;
  value: string;
  hint: string;
  status: string;
}) => (
  <Card className="p-6">
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">{title}</p>
        <p className="text-3xl font-black tracking-tight text-gray-950">{value}</p>
        <p className="text-sm font-medium text-gray-500">{hint}</p>
      </div>
      <StatusPill status={status} />
    </div>
  </Card>
);

const formatFunnelStageValue = (stage: ProductFunnel["stages"][number]) =>
  formatCount(stage.value, stage.key === "deals" ? "台" : "人");

const getFunnelStageWidth = (
  stage: ProductFunnel["stages"][number],
  baseValue: number | null | undefined,
  index: number,
) => {
  if (stage.value === null || baseValue === null || baseValue === undefined || baseValue <= 0) {
    return `${Math.max(100 - index * 12, 58)}%`;
  }
  return `${Math.max((stage.value / baseValue) * 100, 46)}%`;
};

const ProductFunnelView = ({ funnel }: { funnel: ProductFunnel }) => {
  const baseValue = funnel.stages[0]?.value;

  return (
    <div className="mt-5 rounded-[1.75rem] border border-gray-100 bg-gray-50/70 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">漏斗视图</p>
        {funnel.weakestConversionStep && (
          <span className="rounded-full bg-red-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-red-700">
            最低转化 {formatRate(funnel.weakestConversionStep.conversionRate)}
          </span>
        )}
      </div>

      <div className="mt-4 space-y-1">
        {funnel.stages.map((stage, index) => {
          const step = funnel.steps[index];

          return (
            <React.Fragment key={stage.key}>
              <div className="mx-auto" style={{ width: getFunnelStageWidth(stage, baseValue, index) }}>
                <div className="rounded-[1.4rem] border border-gray-200 bg-white px-4 py-4 shadow-[0_6px_20px_rgb(0,0,0,0.03)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">{stage.label}</p>
                      <p className="mt-2 text-2xl font-black tracking-tight text-gray-950">{formatFunnelStageValue(stage)}</p>
                    </div>
                    {baseValue !== null && baseValue !== undefined && baseValue > 0 && stage.value !== null && (
                      <span className="rounded-full bg-black px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#08E03B]">
                        占首层 {formatRate(stage.value / baseValue)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {step && (
                <div className="flex flex-wrap items-center justify-center gap-2 py-2">
                  <div className="h-5 w-px bg-gray-200" />
                  <span className="rounded-full bg-[#08E03B]/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#067b21]">
                    转化率 {formatRate(step.conversionRate)}
                  </span>
                  <span className="rounded-full bg-gray-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-gray-500">
                    流失 {formatCount(step.lossCount)}
                  </span>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="mt-4 space-y-2">
        {funnel.largestLossStep && (
          <p className="text-sm font-medium leading-6 text-gray-600">
            流失最多：{funnel.largestLossStep.fromLabel}到{funnel.largestLossStep.toLabel}，流失
            {formatCount(funnel.largestLossStep.lossCount)}。
          </p>
        )}
        {funnel.notes.map((note) => (
          <p key={note} className="text-sm font-medium leading-6 text-gray-600">
            {note}
          </p>
        ))}
      </div>
    </div>
  );
};

function LegacyApp({
  onEnterV2,
}: {
  onEnterV2: (options: EnterV2Options) => void;
}) {
  const resultExportRef = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [form, setForm] = useState<MarketingInput>(() => createEmptyInput());
  const [rawInput, setRawInput] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<LocalUploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [routingLoading, setRoutingLoading] = useState(false);
  const [routingResult, setRoutingResult] = useState<DiagnosisRoutingResult | null>(null);
  const [activeDiagnosisRoute, setActiveDiagnosisRoute] =
    useState<DiagnosisRoute>("marketing_diagnosis");
  const [recognizing, setRecognizing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [recognitionMessage, setRecognitionMessage] = useState("");
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [engineMode, setEngineMode] = useState("");
  const [leadImportAudit, setLeadImportAudit] = useState<LeadSheetAdapterSidecar | null>(null);
  const [recognitionAudit, setRecognitionAudit] = useState<RecognitionAudit | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const audit = auditMarketingInput({
    ...form,
    rawInput,
  });

  const preview = analyzeMarketingInput({
    ...form,
    rawInput,
  }).dashboard;
  const leadSheetModeSummary =
    leadImportAudit?.sheetType === "lead_detail_sheet"
      ? buildLeadSheetModeSummary(
          {
            ...form,
            rawInput,
          },
          leadImportAudit,
        )
      : null;
  const leadSheetAnalysisReadiness =
    leadSheetModeSummary
      ? {
          shouldBlock: leadSheetModeSummary.businessSupplementGroups.length > 0,
          missingGroups: leadSheetModeSummary.businessSupplementGroups,
          missingFields: leadSheetModeSummary.businessSupplementFields,
        }
      : null;
  const finalAnalysisBlocked = Boolean(leadSheetAnalysisReadiness?.shouldBlock);

  const getMatchingFieldId = (...parts: Array<string | number>) =>
    ["matching", ...parts.map((part) => String(part))].join("-");

  const setSplitValue = (
    group: keyof MarketingInput["funnel"],
    key: keyof MarketingInput["funnel"]["leads"],
    value: number | null,
  ) => {
    setForm((current) => ({
      ...current,
      funnel: {
        ...current.funnel,
        [group]: {
          ...current.funnel[group],
          [key]: value,
        },
      },
    }));
  };

  const setContentValue = (
    index: number,
    field: keyof MarketingContentInput,
    value: string | number | null,
  ) => {
    setForm((current) => ({
      ...current,
      contents: current.contents.map((content, contentIndex) =>
        contentIndex === index
          ? {
              ...content,
              [field]: value,
            }
          : content,
      ),
    }));
  };

  const addContentRow = () => {
    setForm((current) => ({
      ...current,
      contents: [...current.contents, createEmptyContent(current.contents.length + 1)],
    }));
  };

  const removeContentRow = (index: number) => {
    setForm((current) => {
      const next = current.contents.filter((_, currentIndex) => currentIndex !== index);
      return {
        ...current,
        contents: next.length ? next : [createEmptyContent(1)],
      };
    });
  };

  const setPreviousValue = (patch: Partial<MarketingInput["previous"]>) => {
    setForm((current) => ({
      ...current,
      previous: {
        ...current.previous,
        ...patch,
      },
    }));
  };

  const resetUploadDerivedState = () => {
    setLeadImportAudit(null);
    setRecognitionAudit(null);
    setRecognitionMessage("");
    setRoutingResult(null);
  };

  const clearSelectedFiles = () => {
    setSelectedFiles([]);
    resetUploadDerivedState();
    setErrorMessage("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const updateSelectedFiles = (
    updater: (current: LocalUploadItem[]) => LocalUploadItem[],
  ) => {
    setSelectedFiles((current) => updater(current));
  };

  const removeSelectedFile = (fileId: string) => {
    updateSelectedFiles((current) => current.filter((item) => item.id !== fileId));
    resetUploadDerivedState();
    setErrorMessage("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const appendSelectedFiles = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const nextFiles = Array.from(files).map(createLocalUploadItem);
    updateSelectedFiles((current) => [...current, ...nextFiles]);
    resetUploadDerivedState();
    setErrorMessage("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const buildUploadRequestBody = async () => {
    const body: Record<string, unknown> = {};
    if (rawInput.trim()) {
      body.rawText = rawInput;
    }
    if (selectedFiles.length === 1) {
      const selectedFile = selectedFiles[0]!.file;
      body.fileInfo = {
        name: selectedFile.name,
        mimeType: selectedFile.type || "application/octet-stream",
        data: await fileToBase64(selectedFile),
      };
    }
    return body;
  };

  const tryEnterV2Workspace = async () => {
    if (!selectedFiles.length) {
      return false;
    }

    updateSelectedFiles((current) =>
      current.map((item) => ({
        ...item,
        status: "analyzing",
        statusHint: "正在创建上传会话并识别数据源。",
        v2Eligible: null,
      })),
    );

    const fileInfos = await Promise.all(
      selectedFiles.map(async (item) => ({
        id: item.id,
        name: item.file.name,
        mimeType: item.file.type || "application/octet-stream",
        data: await fileToBase64(item.file),
      })),
    );

    const uploadResponse = await fetch("/api/intake/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: fileInfos.map(({ name, mimeType, data }) => ({
          name,
          mimeType,
          data,
        })),
      }),
    });
    const uploadPayload = (await uploadResponse.json().catch(() => null)) as
      | { error?: string; upload?: V2UploadSessionRecord; uploadId?: string }
      | null;

    if (!uploadResponse.ok || !uploadPayload || !uploadPayload.uploadId) {
      updateSelectedFiles((current) =>
        current.map((item) => ({
          ...item,
          status: "error",
          statusHint: uploadPayload?.error || "上传会话创建失败，请稍后重试。",
          v2Eligible: null,
        })),
      );
      throw new Error(
        uploadPayload?.error || "V2 上传会话创建失败，请稍后重试。",
      );
    }

    updateSelectedFiles((current) =>
      current.map((item) => ({
        ...item,
        status: "uploaded",
        statusHint: "文件已上传，正在等待识别结果。",
        v2Eligible: null,
      })),
    );

    const analyzeResponse = await fetch("/api/intake/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uploadId: uploadPayload.uploadId }),
    });
    const analyzePayload = (await analyzeResponse.json().catch(() => null)) as
      | V2AnalyzeResponse
      | { error?: string }
      | null;

    if (!analyzeResponse.ok || !analyzePayload) {
      updateSelectedFiles((current) =>
        current.map((item) => ({
          ...item,
          status: "error",
          statusHint:
            analyzePayload && "error" in analyzePayload
              ? analyzePayload.error || "V2 识别失败。"
              : "V2 识别失败。",
          v2Eligible: null,
        })),
      );
      throw new Error(analyzePayload && "error" in analyzePayload ? analyzePayload.error || "V2 识别失败" : "V2 识别失败");
    }

    if ("files" in analyzePayload && Array.isArray(analyzePayload.files)) {
      updateSelectedFiles((current) =>
        current.map((item, index) => {
          const matched = analyzePayload.files[index];
          if (!matched) {
            return {
              ...item,
              status: "recognized",
              statusHint: "已收到识别结果。",
              v2Eligible: null,
            };
          }
          return {
            ...item,
            status: matched.v2Eligible ? "recognized" : "legacy_only",
            statusHint: matched.reason || (matched.v2Eligible ? "可进入 V2 主链。" : "当前只保留在兼容链。"),
            v2Eligible: matched.v2Eligible,
          };
        }),
      );
    }

    if (!("v2Eligible" in analyzePayload) || !analyzePayload.v2Eligible || !analyzePayload.entryDashboard) {
      return false;
    }

    const buildResponse = await fetch("/api/intake/build-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uploadId: analyzePayload.uploadId }),
    });
    const buildPayload = (await buildResponse.json().catch(() => null)) as
      | V2BuildSessionResponse
      | { error?: string }
      | null;

    if (!buildResponse.ok || !buildPayload || !("snapshot" in buildPayload) || !buildPayload.snapshot) {
      throw new Error(buildPayload && "error" in buildPayload ? buildPayload.error || "V2 会话构建失败" : "V2 会话构建失败");
    }

    onEnterV2({
      initialDashboard: buildPayload.entryDashboard,
      initialSnapshot: buildPayload.snapshot,
      initialUploadSession: buildPayload.upload,
    });
    return true;
  };

  const startIntakeRouting = async () => {
    if (!selectedFiles.length && !rawInput.trim()) return;
    setRoutingLoading(true);
    setErrorMessage("");
    setRecognitionMessage("");

    try {
      if (selectedFiles.length > 0) {
        const enteredV2 = await tryEnterV2Workspace();
        if (enteredV2) {
          return;
        }
        if (selectedFiles.length > 1) {
          setErrorMessage(
            "当前这组多文件还不能进入 V2 主链。多文件上传目前只支持 V2；如果要走兼容诊断，请改为单文件或直接粘贴文本。",
          );
          return;
        }
      }

      const response = await fetch("/api/intake/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(await buildUploadRequestBody()),
      });

      const payload = (await response.json().catch(() => null)) as
        | DiagnosisRoutingResult
        | { error?: string }
        | null;

      if (!response.ok || !payload || !("diagnosisRoute" in payload)) {
        throw new Error(payload && "error" in payload ? payload.error || "分流失败" : "分流失败");
      }

      setEngineMode("智能分流");
      if (selectedFiles.length === 1) {
        updateSelectedFiles((current) =>
          current.map((item) => ({
            ...item,
            status: "legacy_only",
            statusHint: `当前按 ${ROUTE_META[payload.diagnosisRoute].shortLabel} 兼容链进入数据校对页。`,
            v2Eligible: false,
          })),
        );
      }
      await startRecognition(payload);
    } catch (error: any) {
      setRoutingResult(null);
      updateSelectedFiles((current) =>
        current.map((item) => ({
          ...item,
          status: "error",
          statusHint: toFriendlyRequestErrorMessage(error, "分流失败。"),
          v2Eligible: item.v2Eligible,
        })),
      );
      setErrorMessage(toFriendlyRequestErrorMessage(error, "分流失败。"));
    } finally {
      setRoutingLoading(false);
    }
  };

  const startRecognition = async (
    routeContext?: DiagnosisRoutingResult | null,
  ) => {
    if (!selectedFiles.length && !rawInput.trim()) return;
    setRecognizing(true);
    setErrorMessage("");
    setRecognitionMessage("");
    setRecognitionAudit(null);

    try {
      if (routeContext) {
        setRoutingResult(routeContext);
        setActiveDiagnosisRoute(routeContext.diagnosisRoute);
      }

      const response = await fetch("/api/recognize-input", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(await buildUploadRequestBody()),
      });
      const payload = (await response.json().catch(() => null)) as
        | RecognitionPayload
        | { error?: string }
        | null;

      if (!response.ok || !payload || !("recognizedInput" in payload) || !payload.recognizedInput) {
        throw new Error(payload && "error" in payload ? payload.error || "识别失败" : "识别失败");
      }

      setForm(payload.recognizedInput);
      setRawInput(payload.recognizedInput.rawInput || rawInput);
      setEngineMode(payload.recognitionMode || "规则识别");
      setLeadImportAudit(payload.importAudit || null);
      setRecognitionAudit(payload.recognitionAudit || null);
      setRecognitionMessage(
        buildRecognitionMessage(payload.recognitionAudit || null, payload.importAudit || null),
      );
      setScreen("matching");
      setResult(null);
    } catch (error: any) {
      setLeadImportAudit(null);
      setRecognitionAudit(null);
      setErrorMessage(toFriendlyRequestErrorMessage(error, "识别失败。"));
    } finally {
      setRecognizing(false);
    }
  };

  const runFinalAnalysis = async () => {
    if (finalAnalysisBlocked) {
      setErrorMessage(
        `这份主线索表还缺 ${leadSheetAnalysisReadiness?.missingGroups.join("、")}，请先补齐再生成最终分析。`,
      );
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: {
            ...form,
            rawInput,
          },
          rawText: rawInput,
        }),
      });
      const payload = (await response.json().catch(() => null)) as ResultPayload | { error?: string } | null;
      if (!response.ok || !payload || !("analysis" in payload)) {
        throw new Error(payload && "error" in payload ? payload.error || "分析失败" : "分析失败");
      }
      const nextResult: ResultPayload = {
        ...payload,
        insights: "insights" in payload && payload.insights ? payload.insights : EMPTY_INSIGHTS,
      };
      setResult(nextResult);
      setEngineMode(nextResult.engineMode);
      setScreen("result");
    } catch (error: any) {
      setErrorMessage(error.message || "分析失败");
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setScreen("home");
    setForm(createEmptyInput());
    setRawInput("");
    clearSelectedFiles();
    setIsDragging(false);
    setRoutingLoading(false);
    setRoutingResult(null);
    setActiveDiagnosisRoute("marketing_diagnosis");
    setRecognizing(false);
    setLoading(false);
    setErrorMessage("");
    setRecognitionMessage("");
    setResult(null);
    setEngineMode("");
    setLeadImportAudit(null);
    setRecognitionAudit(null);
  };

  const exportPdfReport = async () => {
    if (!resultExportRef.current || !result) return;

    setExportingPdf(true);
    setErrorMessage("");

    try {
      if ("fonts" in document) {
        await document.fonts.ready;
      }

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(resultExportRef.current, {
        backgroundColor: "#ffffff",
        scale: Math.min(window.devicePixelRatio || 2, 2),
        useCORS: true,
        logging: false,
        onclone: (clonedDocument) => {
          clonedDocument
            .querySelectorAll<HTMLElement>("[data-pdf-exclude='true']")
            .forEach((element) => {
              element.style.display = "none";
            });
        },
      });

      const imageData = canvas.toDataURL("image/jpeg", 0.92);
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imageWidth = pageWidth;
      const imageHeight = (canvas.height * imageWidth) / canvas.width;
      let remainingHeight = imageHeight;
      let position = 0;

      pdf.addImage(imageData, "JPEG", 0, position, imageWidth, imageHeight, undefined, "FAST");
      remainingHeight -= pageHeight;

      while (remainingHeight > 0) {
        position = remainingHeight - imageHeight;
        pdf.addPage();
        pdf.addImage(imageData, "JPEG", 0, position, imageWidth, imageHeight, undefined, "FAST");
        remainingHeight -= pageHeight;
      }

      pdf.save(`SUPEREV_诊断报告_${formatLocalDateStamp()}.pdf`);
    } catch (error: any) {
      setErrorMessage(error.message || "PDF 导出失败，请稍后重试。");
    } finally {
      setExportingPdf(false);
    }
  };

  const highlights = [
    {
      title: "灵活订阅目标完成率",
      value: formatRate((result?.dashboard || preview).products.flexible.targetCompletionRate),
      hint: `目标 ${(result?.dashboard || preview).products.flexible.targetDeals ?? "待补充"} 台`,
      status: (result?.dashboard || preview).products.flexible.dealStatus,
    },
    {
      title: "灵活订阅实际CPS",
      value: formatMoney((result?.dashboard || preview).products.flexible.cps),
      hint: `红线 ${(result?.dashboard || preview).products.flexible.cpsRedline ?? "待补充"} 元`,
      status: (result?.dashboard || preview).products.flexible.cpsStatus,
    },
    {
      title: "超级订阅目标完成率",
      value: formatRate((result?.dashboard || preview).products.super.targetCompletionRate),
      hint: `目标 ${(result?.dashboard || preview).products.super.targetDeals ?? "待补充"} 台`,
      status: (result?.dashboard || preview).products.super.dealStatus,
    },
    {
      title: "超级订阅实际CPS",
      value: formatMoney((result?.dashboard || preview).products.super.cps),
      hint: `红线 ${(result?.dashboard || preview).products.super.cpsRedline ?? "待补充"} 元`,
      status: (result?.dashboard || preview).products.super.cpsStatus,
    },
  ];

  const budgetChartData = (result?.dashboard || preview).budgetComparison.map((item) => ({
    name: item.product.replace("订阅", ""),
    预算占比: item.spendShare ? Math.round(item.spendShare * 1000) / 10 : 0,
    成交占比: item.dealShare ? Math.round(item.dealShare * 1000) / 10 : 0,
  }));

  const activeRouteMeta = ROUTE_META[activeDiagnosisRoute];
  const routingConfidenceMeta = routingResult
    ? CONFIDENCE_META[routingResult.confidence]
    : CONFIDENCE_META.medium;
  const selectedFileCount = selectedFiles.length;
  const primarySelectedFile = selectedFiles[0]?.file || null;
  const hasUploadContent = Boolean(selectedFileCount || rawInput.trim());
  const uploadState = selectedFileCount
    ? {
        label: selectedFileCount === 1 ? "已选择 1 个文件" : `已选择 ${selectedFileCount} 个文件`,
        hint:
          selectedFileCount === 1
            ? primarySelectedFile?.name || "等待识别"
            : "多文件上传会优先尝试进入 V2 主链。",
        className: "border-[#08E03B]/20 bg-[#08E03B]/10 text-[#067b21]",
      }
    : rawInput.trim()
      ? {
          label: "已粘贴文本",
          hint: `已输入 ${rawInput.trim().length} 字内容`,
          className: "border-yellow-200 bg-yellow-50 text-yellow-700",
        }
      : {
          label: "未上传内容",
          hint: "拖拽多文件或直接粘贴内容后开始识别",
          className: "border-gray-200 bg-gray-50 text-gray-600",
        };
  return (
    <div className="min-h-screen bg-white text-[#1D1D1F] font-sans selection:bg-[#08E03B]/30 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none overflow-hidden z-0">
        <svg width="100%" height="100%">
          <pattern id="zigzag" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M0 20L10 10L20 20L30 10L40 20" fill="none" stroke="black" strokeWidth="2" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#zigzag)" />
        </svg>
      </div>

      <nav className="fixed top-0 z-50 flex w-full items-center justify-between border-b border-gray-100 bg-white/90 px-6 py-5 backdrop-blur-xl md:px-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-10 h-10 bg-black flex items-center justify-center rounded-sm">
              <span className="text-[#08E03B] font-black text-xl">[ ]</span>
            </div>
            <div className="flex flex-col -space-y-1">
              <span className="font-black text-xl tracking-tighter uppercase italic">SUPEREV</span>
              <span className="text-[10px] font-bold tracking-[0.2em] text-gray-400 uppercase">Marketing Assistant</span>
            </div>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-10 text-[11px] font-black tracking-widest uppercase text-gray-400">
          <span className="text-black">统一上传</span>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-gray-100 bg-gray-50 px-4 py-2">
          <div className="w-2 h-2 bg-[#08E03B] rounded-full animate-pulse shadow-[0_0_8px_#08E03B]" />
          <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">
            {engineMode || activeRouteMeta.shortLabel}
          </span>
        </div>
      </nav>

      <main className="relative z-10 pt-28 pb-20 max-w-7xl mx-auto px-6 md:px-8">
        {screen === "home" && (
          <div className="min-h-[calc(100vh-8rem)] grid grid-cols-1 xl:grid-cols-[0.88fr_1.12fr] gap-8 xl:gap-10 items-center py-4 xl:py-0 animate-in fade-in duration-700">
            <header className="space-y-5 text-center xl:text-left max-w-2xl xl:max-w-none mx-auto xl:mx-0">
              <div className="inline-block px-4 py-1 bg-black text-[#08E03B] text-[10px] font-black italic tracking-[0.3em] uppercase rounded-sm">
                Life is Try.
              </div>
              <h1 className="text-5xl sm:text-6xl xl:text-[5.4rem] font-black tracking-tight leading-[0.92] uppercase">
                还原成交链路
                <br />
                <span className="text-[#08E03B]">优化增长决策</span>
              </h1>
              <p className="text-base sm:text-lg xl:text-xl text-gray-400 font-medium max-w-2xl mx-auto xl:mx-0">
                上传一次，系统会在后台自动识别并进入对应分析页。
              </p>
            </header>

            <div
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsDragging(false);
                appendSelectedFiles(event.dataTransfer.files);
              }}
              className={`relative transition-all duration-500 rounded-[2.2rem] p-1 xl:self-center ${isDragging ? "bg-[#08E03B] shadow-[0_0_40px_rgba(8,224,59,0.2)]" : "bg-transparent"}`}
            >
              <Card className={`p-7 sm:p-8 xl:p-9 border-2 transition-all duration-500 ${isDragging ? "border-[#08E03B] bg-[#08E03B]/5 scale-[0.995]" : "border-black bg-white hover:shadow-2xl"}`}>
                <div className="flex flex-col items-center text-center space-y-6">
                  {hasUploadContent && (
                    <div className="flex w-full flex-wrap items-center justify-center gap-3">
                      <span className="rounded-full border border-black bg-black px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#08E03B]">
                        统一上传
                      </span>
                      <span className={`rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] ${uploadState.className}`}>
                        {uploadState.label}
                      </span>
                    </div>
                  )}

                  <div className={`w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center transition-all duration-500 ${isDragging ? "rotate-[360deg] scale-125" : ""}`}>
                    <svg width="64" height="64" viewBox="0 0 80 80" fill="none">
                      <path d="M45 5L15 45H35L25 75L55 35H35L45 5Z" stroke="black" strokeWidth="4" strokeLinejoin="round" fill={isDragging ? "#08E03B" : "none"} />
                    </svg>
                  </div>

                  <div className="space-y-2 pointer-events-none">
                    <h3 className="text-2xl sm:text-3xl font-black italic tracking-tight uppercase">
                      {isDragging ? "立即释放文件开始识别" : "统一上传"}
                    </h3>
                    <p className="text-sm font-medium leading-6 text-gray-500">
                      上传后开始识别。
                    </p>
                  </div>

                  <div className="w-full relative">
                    <TextArea
                      rows={6}
                      value={rawInput}
                      onChange={(value) => {
                        setRawInput(value);
                        resetUploadDerivedState();
                        setErrorMessage("");
                      }}
                      placeholder="也可以直接在这里粘贴原始数据、复盘文档或表格内容..."
                    />
                    {isDragging && (
                      <div className="absolute inset-0 bg-[#08E03B]/10 rounded-3xl z-20 backdrop-blur-[2px] flex items-center justify-center border-2 border-dashed border-[#08E03B]">
                        <span className="text-black font-black text-xl italic uppercase tracking-widest animate-pulse">释放以上传数据</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col md:flex-row items-center gap-3 w-full">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full md:flex-1 px-8 py-4 rounded-full border-2 border-black font-black text-[10px] uppercase tracking-widest hover:bg-black hover:text-white transition-all active:scale-95"
                    >
                      选择文件 BROWSE
                    </button>
                    <button
                      onClick={() => downloadFile("SUPEREV_营销分析模板.csv", buildTemplateCsv())}
                      className="w-full md:flex-1 px-8 py-4 rounded-full border-2 border-gray-200 font-black text-[10px] uppercase tracking-widest bg-gray-50 hover:bg-gray-100 transition-all active:scale-95"
                    >
                      下载模板 TEMPLATE
                    </button>
                    <button
                      onClick={startIntakeRouting}
                      disabled={routingLoading || (!rawInput.trim() && selectedFileCount === 0)}
                      className="w-full md:flex-[1.15] px-10 py-4 rounded-full bg-[#08E03B] text-black font-black text-[10px] uppercase tracking-widest hover:shadow-[0_10px_30px_rgba(8,224,59,0.3)] transition-all disabled:opacity-20 flex items-center justify-center gap-3 active:scale-95"
                    >
                      {routingLoading ? <RefreshCcw size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                      开始识别
                    </button>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".xlsx,.csv,.txt,.md,.docx,.pdf,image/*"
                    onChange={(event) => appendSelectedFiles(event.target.files)}
                    className="hidden"
                  />

                  {selectedFiles.length > 0 && (
                    <div className="w-full rounded-[1.75rem] border border-gray-100 bg-gray-50 px-5 py-5 text-left animate-in fade-in duration-300">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                            文件列表
                          </p>
                          <p className="mt-2 text-base font-black text-gray-950">
                            本次已加入 {selectedFiles.length} 个文件
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={clearSelectedFiles}
                          className="rounded-full border border-gray-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-gray-500 transition hover:border-red-200 hover:text-red-600"
                        >
                          清空全部
                        </button>
                      </div>

                      <div className="mt-4 space-y-3">
                        {selectedFiles.map((item) => {
                          const statusMeta = LOCAL_UPLOAD_STATUS_META[item.status];
                          return (
                            <div
                              key={item.id}
                              className="rounded-[1.25rem] border border-gray-200 bg-white px-4 py-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-500">
                                      <FileText size={14} />
                                    </span>
                                    <p className="truncate text-sm font-black text-gray-950">
                                      {item.file.name}
                                    </p>
                                  </div>
                                  <p className="mt-2 text-xs font-medium leading-6 text-gray-500">
                                    {item.file.type || "未知类型"} / {formatFileSize(item.file.size)}
                                  </p>
                                  <p className="mt-2 text-sm font-medium leading-6 text-gray-600">
                                    {item.statusHint}
                                  </p>
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                  <span
                                    className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] ${statusMeta.className}`}
                                  >
                                    {statusMeta.label}
                                  </span>
                                  <span
                                    className={`rounded-full border px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] ${
                                      item.v2Eligible === true
                                        ? "border-[#08E03B]/20 bg-[#08E03B]/10 text-[#067b21]"
                                        : item.v2Eligible === false
                                          ? "border-gray-200 bg-gray-50 text-gray-500"
                                          : "border-gray-200 bg-white text-gray-500"
                                    }`}
                                  >
                                    {item.v2Eligible === true
                                      ? "进入 V2"
                                      : item.v2Eligible === false
                                        ? "兼容链"
                                        : "待判断"}
                                  </span>
                                  <button
                                    type="button"
                                    aria-label={`移除当前文件 ${item.file.name}`}
                                    onClick={() => removeSelectedFile(item.id)}
                                    className="rounded-full border border-gray-200 p-2 text-gray-400 transition hover:border-red-200 hover:text-red-600"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {(errorMessage || recognitionMessage) && (
                    <div className={`w-full rounded-3xl px-6 py-5 text-left ${errorMessage ? "bg-red-50 text-red-700" : "bg-[#08E03B]/10 text-[#067b21]"}`}>
                      <p className="text-sm font-bold leading-7">{errorMessage || recognitionMessage}</p>
                    </div>
                  )}

                </div>
              </Card>
            </div>
          </div>
        )}

        {screen === "matching" && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-12 duration-700">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-l-8 border-[#08E03B] pl-8">
              <div className="space-y-2">
                <button
                  onClick={() => setScreen("home")}
                  className="text-[10px] font-black text-gray-400 hover:text-[#08E03B] transition-colors flex items-center gap-2 uppercase tracking-widest"
                >
                  <ArrowLeft size={14} /> 返回首页 BACK
                </button>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                  {activeRouteMeta.shortLabel}
                </p>
                <h1 className="text-5xl font-black italic tracking-tighter uppercase text-black">
                  {activeRouteMeta.matchingTitle}
                </h1>
                <p className="text-gray-500 font-medium max-w-3xl">
                  {activeRouteMeta.matchingDescription}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={runFinalAnalysis}
                  disabled={loading || finalAnalysisBlocked}
                  className="flex items-center gap-3 px-8 py-4 rounded-full bg-black text-white font-black text-[10px] uppercase tracking-widest hover:bg-[#08E03B] hover:text-black transition-all shadow-xl disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? <RefreshCcw size={18} className="animate-spin" /> : <ClipboardCheck size={18} />}
                  生成最终分析
                </button>
              </div>
            </header>

            {routingResult && (
              <Card className="p-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                      当前分析方向
                    </p>
                    <p className="mt-3 text-2xl font-black tracking-tight text-gray-950">
                      {activeRouteMeta.label}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                      识别到的数据
                    </p>
                    <p className="mt-3 text-base font-black text-gray-950">
                      {SOURCE_META[routingResult.sourceType].label}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                      分流可信度
                    </p>
                    <span className={`mt-3 inline-flex rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] ${routingConfidenceMeta.className}`}>
                      {routingConfidenceMeta.label}
                    </span>
                  </div>
                </div>
              </Card>
            )}

            <Card className="p-6">
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                  这一页优先确认
                </p>
                <h2 className="text-2xl font-black tracking-tight text-gray-950">
                  {activeRouteMeta.shortLabel}重点核对项
                </h2>
                <p className="text-sm font-medium leading-6 text-gray-500">
                  先把最影响结果的字段确认清楚，再往后生成诊断报告。
                </p>
              </div>
              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                {activeRouteMeta.reviewFocus.map((item) => (
                  <RouteFocusCard key={item.title} {...item} />
                ))}
              </div>
              <div className="mt-6 rounded-[1.5rem] border border-yellow-200 bg-yellow-50 px-5 py-5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-yellow-800">
                  使用边界
                </p>
                <p className="mt-3 text-sm font-medium leading-7 text-gray-700">
                  {activeRouteMeta.caution}
                </p>
              </div>
            </Card>

            <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-8">
              <div className="space-y-8">
                <Card className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <FieldLabel htmlFor={getMatchingFieldId("period-start")}>统计周期开始</FieldLabel>
                      <TextInput
                        id={getMatchingFieldId("period-start")}
                        value={form.periodStart}
                        onChange={(value) => setForm((current) => ({ ...current, periodStart: value }))}
                        placeholder="2026-04-01"
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor={getMatchingFieldId("period-end")}>统计周期结束</FieldLabel>
                      <TextInput
                        id={getMatchingFieldId("period-end")}
                        value={form.periodEnd}
                        onChange={(value) => setForm((current) => ({ ...current, periodEnd: value }))}
                        placeholder="2026-04-30"
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor={getMatchingFieldId("target-flexible")}>目标成交台数（灵活订阅）</FieldLabel>
                      <NumberInput
                        id={getMatchingFieldId("target-flexible")}
                        value={form.targets.flexible}
                        onChange={(value) => setForm((current) => ({ ...current, targets: { ...current.targets, flexible: value } }))}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor={getMatchingFieldId("target-super")}>目标成交台数（超级订阅）</FieldLabel>
                      <NumberInput
                        id={getMatchingFieldId("target-super")}
                        value={form.targets.super}
                        onChange={(value) => setForm((current) => ({ ...current, targets: { ...current.targets, super: value } }))}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor={getMatchingFieldId("cps-redline-flexible")}>CPS红线（灵活订阅）</FieldLabel>
                      <NumberInput
                        id={getMatchingFieldId("cps-redline-flexible")}
                        value={form.cpsRedlines.flexible}
                        onChange={(value) => setForm((current) => ({ ...current, cpsRedlines: { ...current.cpsRedlines, flexible: value } }))}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor={getMatchingFieldId("cps-redline-super")}>CPS红线（超级订阅）</FieldLabel>
                      <NumberInput
                        id={getMatchingFieldId("cps-redline-super")}
                        value={form.cpsRedlines.super}
                        onChange={(value) => setForm((current) => ({ ...current, cpsRedlines: { ...current.cpsRedlines, super: value } }))}
                      />
                    </div>
                  </div>
                </Card>

                <Card className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <FieldLabel htmlFor={getMatchingFieldId("spend-flexible")}>灵活订阅投放金额</FieldLabel>
                      <NumberInput
                        id={getMatchingFieldId("spend-flexible")}
                        value={form.spend.flexible}
                        onChange={(value) => setForm((current) => ({ ...current, spend: { ...current.spend, flexible: value } }))}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor={getMatchingFieldId("spend-super")}>超级订阅投放金额</FieldLabel>
                      <NumberInput
                        id={getMatchingFieldId("spend-super")}
                        value={form.spend.super}
                        onChange={(value) => setForm((current) => ({ ...current, spend: { ...current.spend, super: value } }))}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor={getMatchingFieldId("spend-brand")}>品牌号 / 其他</FieldLabel>
                      <NumberInput
                        id={getMatchingFieldId("spend-brand")}
                        value={form.spend.brand}
                        onChange={(value) => setForm((current) => ({ ...current, spend: { ...current.spend, brand: value } }))}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor={getMatchingFieldId("spend-total")}>总投放金额</FieldLabel>
                      <NumberInput
                        id={getMatchingFieldId("spend-total")}
                        value={form.spend.total}
                        onChange={(value) => setForm((current) => ({ ...current, spend: { ...current.spend, total: value } }))}
                      />
                    </div>
                  </div>
                </Card>

                <Card className="p-8 space-y-5">
                  {[
                    ["leads", "第一层 留资总数"],
                    ["privateDomain", "第二层 转私域数"],
                    ["highIntent", "第三层 高意向数"],
                    ["deals", "第四层 成交台数"],
                  ].map(([group, title]) => (
                    <div key={group} className="rounded-3xl border border-gray-100 p-5">
                      <p className="text-sm font-black text-gray-900">{title}</p>
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <FieldLabel htmlFor={getMatchingFieldId(group, "total")}>总计</FieldLabel>
                          <NumberInput
                            id={getMatchingFieldId(group, "total")}
                            value={form.funnel[group as keyof MarketingInput["funnel"]].total}
                            onChange={(value) => setSplitValue(group as keyof MarketingInput["funnel"], "total", value)}
                          />
                        </div>
                        <div>
                          <FieldLabel htmlFor={getMatchingFieldId(group, "flexible")}>灵活订阅</FieldLabel>
                          <NumberInput
                            id={getMatchingFieldId(group, "flexible")}
                            value={form.funnel[group as keyof MarketingInput["funnel"]].flexible}
                            onChange={(value) => setSplitValue(group as keyof MarketingInput["funnel"], "flexible", value)}
                          />
                        </div>
                        <div>
                          <FieldLabel htmlFor={getMatchingFieldId(group, "super")}>超级订阅</FieldLabel>
                          <NumberInput
                            id={getMatchingFieldId(group, "super")}
                            value={form.funnel[group as keyof MarketingInput["funnel"]].super}
                            onChange={(value) => setSplitValue(group as keyof MarketingInput["funnel"], "super", value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </Card>

                <Card className="p-8">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">内容数据</p>
                      <h2 className="text-2xl font-black tracking-tight text-gray-950">识别后的内容明细</h2>
                    </div>
                    <button
                      onClick={addContentRow}
                      className="px-5 py-3 rounded-full border border-black font-black text-[10px] uppercase tracking-widest hover:bg-black hover:text-white transition-all"
                    >
                      <Plus size={14} className="inline mr-2" />
                      增加内容
                    </button>
                  </div>

                  <div className="mt-6 space-y-4">
                    {form.contents.map((content, index) => {
                      const contentFieldId = (field: string) => getMatchingFieldId("content", index + 1, field);
                      return (
                        <div key={content.id} className="rounded-3xl border border-gray-100 p-5">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-sm font-black text-gray-900">内容 {index + 1}</p>
                            <button onClick={() => removeContentRow(index)} className="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-red-500">
                              删除
                            </button>
                          </div>
                          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <FieldLabel htmlFor={contentFieldId("name")}>内容名称</FieldLabel>
                              <TextInput id={contentFieldId("name")} value={content.name} onChange={(value) => setContentValue(index, "name", value)} />
                            </div>
                            <div>
                              <FieldLabel htmlFor={contentFieldId("link")}>内容链接</FieldLabel>
                              <TextInput id={contentFieldId("link")} value={content.link} onChange={(value) => setContentValue(index, "link", value)} />
                            </div>
                            <div>
                              <FieldLabel htmlFor={contentFieldId("product")}>产品归属</FieldLabel>
                              <select
                                id={contentFieldId("product")}
                                value={content.product}
                                onChange={(event) => setContentValue(index, "product", event.target.value)}
                                className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none transition focus:border-[#08E03B]"
                              >
                                <option value="">请选择</option>
                                <option value="flexible">灵活订阅</option>
                                <option value="super">超级订阅</option>
                              </select>
                            </div>
                            <div>
                              <FieldLabel htmlFor={contentFieldId("board")}>所属板块</FieldLabel>
                              <TextInput id={contentFieldId("board")} value={content.board} onChange={(value) => setContentValue(index, "board", value)} />
                            </div>
                            <div>
                              <FieldLabel htmlFor={contentFieldId("views")}>浏览量</FieldLabel>
                              <NumberInput id={contentFieldId("views")} value={content.views} onChange={(value) => setContentValue(index, "views", value)} />
                            </div>
                            <div>
                              <FieldLabel htmlFor={contentFieldId("intent-comments")}>意向评论</FieldLabel>
                              <NumberInput id={contentFieldId("intent-comments")} value={content.intentComments} onChange={(value) => setContentValue(index, "intentComments", value)} />
                            </div>
                            <div>
                              <FieldLabel htmlFor={contentFieldId("private-messages")}>私信进线</FieldLabel>
                              <NumberInput id={contentFieldId("private-messages")} value={content.privateMessages} onChange={(value) => setContentValue(index, "privateMessages", value)} />
                            </div>
                            <div>
                              <FieldLabel htmlFor={contentFieldId("leads")}>留资</FieldLabel>
                              <NumberInput id={contentFieldId("leads")} value={content.leads} onChange={(value) => setContentValue(index, "leads", value)} />
                            </div>
                            <div>
                              <FieldLabel htmlFor={contentFieldId("spend")}>内容花费</FieldLabel>
                              <NumberInput id={contentFieldId("spend")} value={content.spend} onChange={(value) => setContentValue(index, "spend", value)} />
                            </div>
                            <div>
                              <FieldLabel htmlFor={contentFieldId("high-intent")}>高意向贡献</FieldLabel>
                              <NumberInput id={contentFieldId("high-intent")} value={content.highIntent} onChange={(value) => setContentValue(index, "highIntent", value)} />
                            </div>
                            <div>
                              <FieldLabel htmlFor={contentFieldId("deals")}>成交贡献</FieldLabel>
                              <NumberInput id={contentFieldId("deals")} value={content.deals} onChange={(value) => setContentValue(index, "deals", value)} />
                            </div>
                            <div className="md:col-span-2">
                              <FieldLabel htmlFor={contentFieldId("creative-summary")}>素材描述</FieldLabel>
                              <TextArea
                                id={contentFieldId("creative-summary")}
                                value={content.creativeSummary}
                                onChange={(value) => setContentValue(index, "creativeSummary", value)}
                                rows={3}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                <Card className="p-8">
                  <div className="grid grid-cols-1 gap-5">
                    <div>
                      <FieldLabel htmlFor={getMatchingFieldId("creative-notes")}>素材补充说明</FieldLabel>
                      <TextArea
                        id={getMatchingFieldId("creative-notes")}
                        value={form.creativeNotes}
                        onChange={(value) => setForm((current) => ({ ...current, creativeNotes: value }))}
                        rows={3}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor={getMatchingFieldId("anomaly-notes")}>异常说明</FieldLabel>
                      <TextArea
                        id={getMatchingFieldId("anomaly-notes")}
                        value={form.anomalyNotes}
                        onChange={(value) => setForm((current) => ({ ...current, anomalyNotes: value }))}
                        rows={3}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor={getMatchingFieldId("benchmark-links")}>优秀案例链接</FieldLabel>
                      <TextArea
                        id={getMatchingFieldId("benchmark-links")}
                        value={form.benchmarkLinks}
                        onChange={(value) => setForm((current) => ({ ...current, benchmarkLinks: value }))}
                        rows={3}
                      />
                    </div>
                  </div>
                </Card>

                <PreviousMetricsSection previous={form.previous} onChange={setPreviousValue} />
              </div>

              <div className="space-y-8">
                {recognitionAudit && (
                  <Card className="p-8">
                    <RecognitionAuditPanel audit={recognitionAudit} />
                  </Card>
                )}

                {leadImportAudit && (
                  <Card className="p-8">
                    <LeadImportAuditPanel audit={leadImportAudit} />
                  </Card>
                )}

                {leadSheetModeSummary ? (
                  <SummaryCard
                    title="业务补充项"
                    value={leadSheetModeSummary.businessSupplementGroups.length ? `${leadSheetModeSummary.businessSupplementGroups.length}项` : "已齐"}
                    hint={
                      leadSheetModeSummary.businessSupplementGroups.length
                        ? `待补 ${leadSheetModeSummary.businessSupplementGroups.join("、")}`
                        : "目标、花费和 CPS 红线已经齐全"
                    }
                    status={leadSheetModeSummary.businessSupplementGroups.length ? "🟡" : "🟢"}
                  />
                ) : (
                  <SummaryCard
                    title="数据完整度"
                    value={`${audit.completenessPercent}%`}
                    hint={audit.missingFields.length ? `待补充 ${audit.missingFields.slice(0, 4).join("、")}` : "核心字段已经基本齐全"}
                    status={audit.completenessPercent >= 85 ? "🟢" : audit.completenessPercent >= 60 ? "🟡" : "🔴"}
                  />
                )}

                <Card className="p-8">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">识别提醒</p>
                  <div className="mt-4 space-y-3">
                    {recognitionMessage && <div className="rounded-2xl bg-[#08E03B]/10 px-4 py-4 text-sm font-bold text-[#067b21]">{recognitionMessage}</div>}
                    {audit.warnings.map((item) => (
                      <div key={item} className="rounded-2xl bg-yellow-50 px-4 py-4 text-sm font-bold text-yellow-700">
                        {item}
                      </div>
                    ))}
                    {audit.anomalies.map((item) => (
                      <div key={item} className="rounded-2xl bg-red-50 px-4 py-4 text-sm font-bold text-red-700">
                        {item}
                      </div>
                    ))}
                    {audit.redlineAlerts.map((item) => (
                      <div key={item} className="rounded-2xl bg-red-50 px-4 py-4 text-sm font-bold text-red-700">
                        {item}
                      </div>
                    ))}
                  </div>
                </Card>

                <div className="grid grid-cols-1 gap-4">
                  {highlights.map((item) => (
                    <SummaryCard key={item.title} {...item} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {screen === "result" && result && (
          <div ref={resultExportRef} data-pdf-root="true" className="space-y-12 animate-in fade-in slide-in-from-bottom-12 duration-1000">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-l-8 border-[#08E03B] pl-8">
              <div className="space-y-2">
                <button data-pdf-exclude="true" onClick={resetAll} className="text-[10px] font-black text-gray-400 hover:text-[#08E03B] transition-colors flex items-center gap-2 uppercase tracking-widest">
                  <Plus size={14} /> 开启新诊断 NEW SESSION
                </button>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                  {activeRouteMeta.shortLabel}
                </p>
                <h1 className="text-5xl font-black italic tracking-tighter uppercase text-black">
                  {activeRouteMeta.resultTitle}
                </h1>
              </div>
              <button
                data-pdf-exclude="true"
                onClick={exportPdfReport}
                disabled={exportingPdf}
                className="flex items-center gap-3 px-8 py-4 rounded-full bg-black text-white font-black text-[10px] uppercase tracking-widest hover:bg-[#08E03B] hover:text-black transition-all shadow-xl disabled:opacity-40"
              >
                {exportingPdf ? <RefreshCcw size={18} className="animate-spin" /> : <Download size={18} />}
                导出 PDF EXPORT
              </button>
            </header>

            {errorMessage && (
              <div data-pdf-exclude="true" className="rounded-3xl bg-red-50 px-6 py-5 text-sm font-bold text-red-700">
                {errorMessage}
              </div>
            )}

            {routingResult && (
              <Card className="p-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                      当前分析方向
                    </p>
                    <p className="mt-3 text-2xl font-black tracking-tight text-gray-950">
                      {activeRouteMeta.label}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                      识别到的数据
                    </p>
                    <p className="mt-3 text-base font-black text-gray-950">
                      {SOURCE_META[routingResult.sourceType].label}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                      系统判断
                    </p>
                    <span className={`mt-3 inline-flex rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] ${routingConfidenceMeta.className}`}>
                      {routingConfidenceMeta.label}
                    </span>
                  </div>
                </div>
              </Card>
            )}

            <Card className="p-6">
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                  当前诊断视角
                </p>
                <h2 className="text-2xl font-black tracking-tight text-gray-950">
                  这份报告主要回答什么
                </h2>
                <p className="text-sm font-medium leading-6 text-gray-500">
                  不同诊断方向看的重点不同，先按当前视角理解这份结果。
                </p>
              </div>
              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                {activeRouteMeta.resultFocus.map((item) => (
                  <RouteFocusCard key={item.title} {...item} />
                ))}
              </div>
              <div className="mt-6 rounded-[1.5rem] border border-yellow-200 bg-yellow-50 px-5 py-5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-yellow-800">
                  解读边界
                </p>
                <p className="mt-3 text-sm font-medium leading-7 text-gray-700">
                  {activeRouteMeta.caution}
                </p>
              </div>
            </Card>

            {leadImportAudit?.sheetType === "lead_detail_sheet" && (
              <div className="space-y-3">
                <div className="rounded-3xl bg-yellow-50 px-6 py-5 text-sm font-bold leading-7 text-yellow-800">
                  当前内容分析来自主线索表聚合，不等于真实内容表现。目标 / 花费 / 红线仍需结合预算表或手填补齐。
                </div>
                {leadSheetAnalysisReadiness?.shouldBlock && (
                  <div className="rounded-3xl border border-red-200 bg-red-50 px-6 py-5 text-sm font-bold leading-7 text-red-700">
                    当前还缺 {leadSheetAnalysisReadiness.missingGroups.join("、")}，系统已暂时阻止直接生成最终分析。先补齐这些决策字段，再看最终结论。
                  </div>
                )}
              </div>
            )}

            <div data-pdf-exclude="true">
              <ResultModuleNavigation />
            </div>

            <ReliabilitySection reliability={result.dashboard.reliability} />

            <MoMOverviewSection input={result.normalizedInput} />

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
              {highlights.map((item) => (
                <SummaryCard key={`${item.title}-result`} {...item} />
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-8">
              <Card className="p-8">
                <h2 className="text-2xl font-black mb-6">预算占比 vs 成交占比</h2>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={budgetChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 12 }} />
                      <YAxis tick={{ fill: "#6b7280", fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="预算占比" fill="#111827" radius={[10, 10, 0, 0]} />
                      <Bar dataKey="成交占比" fill="#08E03B" radius={[10, 10, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-8">
                <h2 className="text-2xl font-black mb-6">分产品漏斗</h2>
                <div className="space-y-6">
                  {PRODUCT_ORDER.map((product) => (
                    <div key={product} className="rounded-3xl border border-gray-100 p-5">
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-lg font-black text-black">{PRODUCT_META[product].label}</p>
                        <StatusPill status={result.dashboard.products[product].cpsStatus} />
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        {result.dashboard.funnels[product].stages.map((stage) => (
                          <div key={stage.key} className="rounded-2xl bg-gray-50 px-4 py-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">{stage.label}</p>
                            <p className="mt-2 text-2xl font-black tracking-tight text-gray-950">{formatFunnelStageValue(stage)}</p>
                          </div>
                        ))}
                      </div>
                      <ProductFunnelView funnel={result.dashboard.funnels[product]} />
                      <p className="mt-4 text-sm font-medium leading-6 text-gray-600">{result.dashboard.diagnosis[product].intuition}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <AnalysisReportSection analysis={result.analysis} insights={result.insights} />

            <ContentRankingSection contentRanking={result.dashboard.contentRanking} />

            <BudgetRecommendationsSection budgetRecommendations={result.dashboard.budgetRecommendations} />

            <ActionPlanSection actionPlan={result.dashboard.actionPlan} />

            <ScalePlanSection scalePlan={result.dashboard.scalePlan} />

          </div>
        )}
      </main>

      <footer className="fixed bottom-10 left-10 z-50 flex items-center gap-6 pointer-events-none">
        <div className="px-5 py-2 bg-black text-[#08E03B] rounded-sm text-[9px] font-black tracking-[0.3em] uppercase italic">
          SUPEREV INTEL 2026
        </div>
        <div className="text-[9px] font-black text-gray-300 uppercase tracking-widest flex items-center gap-2">
          <div className="w-12 h-[1px] bg-gray-100" />
          由 SUPEREV 超级电动驱动 <span className="text-[7px] opacity-60">DRIVEN BY SUPEREV</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  const [experience, setExperience] = useState<"v2" | "legacy">("legacy");
  const [v2Mode, setV2Mode] = useState<"fromHome" | "internal">("internal");
  const [v2InitialDashboard, setV2InitialDashboard] =
    useState<V2DashboardType | undefined>(undefined);
  const [v2InitialSnapshot, setV2InitialSnapshot] =
    useState<V2SnapshotRecord | null>(null);
  const [v2InitialUploadSession, setV2InitialUploadSession] =
    useState<V2UploadSessionRecord | null>(null);

  if (experience === "v2") {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen bg-white text-[#1D1D1F] font-sans selection:bg-[#08E03B]/30">
            <main className="mx-auto max-w-7xl px-6 pb-20 pt-20 md:px-8">
              <div className="inline-flex items-center gap-3 rounded-full border border-gray-200 bg-gray-50 px-5 py-3 text-sm font-medium text-gray-600">
                <RefreshCcw size={16} className="animate-spin" />
                正在加载 V2 工作台...
              </div>
            </main>
          </div>
        }
      >
        <V2Workspace
          mode={v2Mode}
          initialDashboard={v2InitialDashboard}
          initialSnapshot={v2InitialSnapshot}
          onBackToHome={() => {
            setExperience("legacy");
            setV2Mode("internal");
            setV2InitialDashboard(undefined);
            setV2InitialSnapshot(null);
            setV2InitialUploadSession(null);
          }}
        />
      </Suspense>
    );
  }

  return (
    <LegacyApp
      onEnterV2={(options) => {
        setV2Mode("fromHome");
        setV2InitialDashboard(options.initialDashboard);
        setV2InitialSnapshot(options.initialSnapshot);
        setV2InitialUploadSession(options.initialUploadSession);
        setExperience("v2");
      }}
    />
  );
}
