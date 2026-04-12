import React, { useRef, useState } from "react";
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
import { LeadImportAuditPanel } from "./components/lead-import-audit";
import type { LeadSheetAdapterSidecar } from "../shared/adapters/lead-sheet/build-marketing-input-from-leads";

type ResultPayload = {
  analysis: string;
  dashboard: MarketingDashboardData;
  normalizedInput: MarketingInput;
  engineMode: string;
};

type RecognitionPayload = {
  recognizedInput?: MarketingInput;
  recognitionMode?: string;
  importAudit?: LeadSheetAdapterSidecar | null;
};

type Screen = "home" | "matching" | "result";
type ProductFunnel = MarketingDashboardData["funnels"]["flexible"];

const CARD_BG = "bg-white rounded-[2rem] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]";

const isTextLikeFile = (file: File) =>
  file.type.startsWith("text/") ||
  file.name.endsWith(".csv") ||
  file.name.endsWith(".md") ||
  file.name.endsWith(".txt");

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

const Card = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => <div className={`${CARD_BG} ${className}`}>{children}</div>;

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

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">{children}</label>
);

const TextInput = ({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) => (
  <input
    value={value}
    onChange={(event) => onChange(event.target.value)}
    placeholder={placeholder}
    className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none transition focus:border-[#08E03B]"
  />
);

const NumberInput = ({
  value,
  onChange,
  placeholder,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
}) => (
  <input
    value={numberValue(value)}
    onChange={(event) => onChange(toNullableNumber(event.target.value))}
    placeholder={placeholder}
    inputMode="decimal"
    className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-900 outline-none transition focus:border-[#08E03B]"
  />
);

const TextArea = ({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) => (
  <textarea
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

export default function App() {
  const resultExportRef = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [form, setForm] = useState<MarketingInput>(() => createEmptyInput());
  const [rawInput, setRawInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [recognitionMessage, setRecognitionMessage] = useState("");
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [engineMode, setEngineMode] = useState("");
  const [leadImportAudit, setLeadImportAudit] = useState<LeadSheetAdapterSidecar | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const audit = auditMarketingInput({
    ...form,
    rawInput,
  });

  const preview = analyzeMarketingInput({
    ...form,
    rawInput,
  }).dashboard;

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

  const processFile = async (file: File | null) => {
    if (!file) return;
    setSelectedFile(file);
    setLeadImportAudit(null);
    if (isTextLikeFile(file)) {
      setRawInput(await file.text());
    } else {
      setRawInput("");
    }
  };

  const startRecognition = async () => {
    if (!selectedFile && !rawInput.trim()) return;
    setRecognizing(true);
    setErrorMessage("");
    setRecognitionMessage("");

    try {
      const body: Record<string, unknown> = {};
      if (rawInput.trim()) {
        body.rawText = rawInput;
      }
      if (selectedFile) {
        body.fileInfo = {
          name: selectedFile.name,
          mimeType: selectedFile.type || "application/octet-stream",
          data: await fileToBase64(selectedFile),
        };
      }

      const response = await fetch("/api/recognize-input", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
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
      setRecognitionMessage(
        payload.importAudit?.sheetType === "lead_detail_sheet"
          ? "已识别为主线索表，漏斗数据已自动填入匹配页。目标、花费和 CPS 红线仍需你继续补齐。"
          : "已完成数据识别，当前页面下一步会呈现全部识别结果，请先确认和补充，再生成最终看板。",
      );
      setScreen("matching");
      setResult(null);
    } catch (error: any) {
      setLeadImportAudit(null);
      setErrorMessage(error.message || "识别失败");
    } finally {
      setRecognizing(false);
    }
  };

  const runFinalAnalysis = async () => {
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
      setResult(payload);
      setEngineMode(payload.engineMode);
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
    setSelectedFile(null);
    setIsDragging(false);
    setRecognizing(false);
    setLoading(false);
    setErrorMessage("");
    setRecognitionMessage("");
    setResult(null);
    setEngineMode("");
    setLeadImportAudit(null);
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

      pdf.save(`SUPEREV_诊断报告_${new Date().toISOString().slice(0, 10)}.pdf`);
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

      <nav className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur-xl border-b border-gray-100 px-10 py-5 flex justify-between items-center">
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
          <button onClick={() => setScreen("home")} className={`flex flex-col items-start ${screen === "home" ? "text-black" : "hover:text-black"}`}>
            <span className={screen === "home" ? "border-b-2 border-[#08E03B]" : ""}>效果诊断</span>
            <span className="text-[8px] opacity-60">INSIGHT ENGINE</span>
          </button>
          <button onClick={() => setScreen("matching")} className={`flex flex-col items-start ${screen === "matching" ? "text-black" : "hover:text-black"}`}>
            <span className={screen === "matching" ? "border-b-2 border-[#08E03B]" : ""}>数据匹配</span>
            <span className="text-[8px] opacity-60">DATA MATCH</span>
          </button>
          <button onClick={() => result && setScreen("result")} className={`flex flex-col items-start ${screen === "result" ? "text-black" : "hover:text-black"}`}>
            <span className={screen === "result" ? "border-b-2 border-[#08E03B]" : ""}>结果看板</span>
            <span className="text-[8px] opacity-60">DASHBOARD</span>
          </button>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-full border border-gray-100">
          <div className="w-2 h-2 bg-[#08E03B] rounded-full animate-pulse shadow-[0_0_8px_#08E03B]" />
          <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">{engineMode || "系统就绪"}</span>
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
                追踪数据效果闭环，分析数据快速找出瓶颈给出建议。
              </p>
              <div className="flex flex-wrap justify-center xl:justify-start gap-3 text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                <span className="rounded-full border border-gray-200 bg-white/80 px-4 py-2">上传文件优先</span>
                <span className="rounded-full border border-gray-200 bg-white/80 px-4 py-2">模板下载仅辅助</span>
                <span className="rounded-full border border-gray-200 bg-white/80 px-4 py-2">识别后进入数据匹配页</span>
              </div>
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
                processFile(event.dataTransfer.files?.[0] || null);
              }}
              className={`relative transition-all duration-500 rounded-[2.2rem] p-1 xl:self-center ${isDragging ? "bg-[#08E03B] shadow-[0_0_40px_rgba(8,224,59,0.2)]" : "bg-transparent"}`}
            >
              <Card className={`p-7 sm:p-8 xl:p-9 border-2 transition-all duration-500 ${isDragging ? "border-[#08E03B] bg-[#08E03B]/5 scale-[0.995]" : "border-black bg-white hover:shadow-2xl"}`}>
                <div className="flex flex-col items-center text-center space-y-6">
                  <div className={`w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center transition-all duration-500 ${isDragging ? "rotate-[360deg] scale-125" : ""}`}>
                    <svg width="64" height="64" viewBox="0 0 80 80" fill="none">
                      <path d="M45 5L15 45H35L25 75L55 35H35L45 5Z" stroke="black" strokeWidth="4" strokeLinejoin="round" fill={isDragging ? "#08E03B" : "none"} />
                    </svg>
                  </div>

                  <div className="space-y-2 pointer-events-none">
                    <h3 className="text-2xl sm:text-3xl font-black italic tracking-tight uppercase">
                      {isDragging ? "立即释放文件开始识别" : "投放数据导入 DATA INPUT"}
                    </h3>
                    <p className="text-gray-400 font-bold tracking-wider text-[10px] uppercase">
                      支持上传 XLSX、CSV、TXT、Markdown、Word、PDF、图片；模板下载只是辅助，不是强制要求
                    </p>
                  </div>

                  <div className="w-full relative">
                    <TextArea
                      rows={6}
                      value={rawInput}
                      onChange={setRawInput}
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
                      上传文件 BROWSE
                    </button>
                    <button
                      onClick={() => downloadFile("SUPEREV_营销分析模板.csv", buildTemplateCsv())}
                      className="w-full md:flex-1 px-8 py-4 rounded-full border-2 border-gray-200 font-black text-[10px] uppercase tracking-widest bg-gray-50 hover:bg-gray-100 transition-all active:scale-95"
                    >
                      下载模板 TEMPLATE
                    </button>
                    <button
                      onClick={startRecognition}
                      disabled={recognizing || (!rawInput.trim() && !selectedFile)}
                      className="w-full md:flex-[1.15] px-10 py-4 rounded-full bg-[#08E03B] text-black font-black text-[10px] uppercase tracking-widest hover:shadow-[0_10px_30px_rgba(8,224,59,0.3)] transition-all disabled:opacity-20 flex items-center justify-center gap-3 active:scale-95"
                    >
                      {recognizing ? <RefreshCcw size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                      数据分析 EXECUTE
                    </button>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.csv,.txt,.md,.docx,.pdf,image/*"
                    onChange={(event) => processFile(event.target.files?.[0] || null)}
                    className="hidden"
                  />

                  {selectedFile && (
                    <div className="flex items-center gap-3 text-[10px] font-black bg-black text-[#08E03B] px-6 py-3 rounded-full italic animate-in zoom-in-95 border border-[#08E03B]/30">
                      <FileText size={14} />
                      {selectedFile.name.toUpperCase()}
                      <button
                        onClick={() => {
                          setSelectedFile(null);
                          setRawInput("");
                          setLeadImportAudit(null);
                        }}
                        className="ml-2 hover:text-white transition-colors"
                      >
                        <X size={16} />
                      </button>
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
                <h1 className="text-5xl font-black italic tracking-tighter uppercase text-black">数据匹配框</h1>
                <p className="text-gray-500 font-medium max-w-3xl">
                  这里呈现上传后识别出的全部数据。你只需要确认、修正和补充，确认无误后再生成最终看板和报告。
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={runFinalAnalysis}
                  disabled={loading}
                  className="flex items-center gap-3 px-8 py-4 rounded-full bg-black text-white font-black text-[10px] uppercase tracking-widest hover:bg-[#08E03B] hover:text-black transition-all shadow-xl disabled:opacity-40"
                >
                  {loading ? <RefreshCcw size={18} className="animate-spin" /> : <ClipboardCheck size={18} />}
                  生成最终分析
                </button>
              </div>
            </header>

            <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-8">
              <div className="space-y-8">
                <Card className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <FieldLabel>统计周期开始</FieldLabel>
                      <TextInput value={form.periodStart} onChange={(value) => setForm((current) => ({ ...current, periodStart: value }))} placeholder="2026-04-01" />
                    </div>
                    <div>
                      <FieldLabel>统计周期结束</FieldLabel>
                      <TextInput value={form.periodEnd} onChange={(value) => setForm((current) => ({ ...current, periodEnd: value }))} placeholder="2026-04-30" />
                    </div>
                    <div>
                      <FieldLabel>目标成交台数（灵活订阅）</FieldLabel>
                      <NumberInput value={form.targets.flexible} onChange={(value) => setForm((current) => ({ ...current, targets: { ...current.targets, flexible: value } }))} />
                    </div>
                    <div>
                      <FieldLabel>目标成交台数（超级订阅）</FieldLabel>
                      <NumberInput value={form.targets.super} onChange={(value) => setForm((current) => ({ ...current, targets: { ...current.targets, super: value } }))} />
                    </div>
                    <div>
                      <FieldLabel>CPS红线（灵活订阅）</FieldLabel>
                      <NumberInput value={form.cpsRedlines.flexible} onChange={(value) => setForm((current) => ({ ...current, cpsRedlines: { ...current.cpsRedlines, flexible: value } }))} />
                    </div>
                    <div>
                      <FieldLabel>CPS红线（超级订阅）</FieldLabel>
                      <NumberInput value={form.cpsRedlines.super} onChange={(value) => setForm((current) => ({ ...current, cpsRedlines: { ...current.cpsRedlines, super: value } }))} />
                    </div>
                  </div>
                </Card>

                <Card className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <FieldLabel>灵活订阅投放金额</FieldLabel>
                      <NumberInput value={form.spend.flexible} onChange={(value) => setForm((current) => ({ ...current, spend: { ...current.spend, flexible: value } }))} />
                    </div>
                    <div>
                      <FieldLabel>超级订阅投放金额</FieldLabel>
                      <NumberInput value={form.spend.super} onChange={(value) => setForm((current) => ({ ...current, spend: { ...current.spend, super: value } }))} />
                    </div>
                    <div>
                      <FieldLabel>品牌号 / 其他</FieldLabel>
                      <NumberInput value={form.spend.brand} onChange={(value) => setForm((current) => ({ ...current, spend: { ...current.spend, brand: value } }))} />
                    </div>
                    <div>
                      <FieldLabel>总投放金额</FieldLabel>
                      <NumberInput value={form.spend.total} onChange={(value) => setForm((current) => ({ ...current, spend: { ...current.spend, total: value } }))} />
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
                          <FieldLabel>总计</FieldLabel>
                          <NumberInput value={form.funnel[group as keyof MarketingInput["funnel"]].total} onChange={(value) => setSplitValue(group as keyof MarketingInput["funnel"], "total", value)} />
                        </div>
                        <div>
                          <FieldLabel>灵活订阅</FieldLabel>
                          <NumberInput value={form.funnel[group as keyof MarketingInput["funnel"]].flexible} onChange={(value) => setSplitValue(group as keyof MarketingInput["funnel"], "flexible", value)} />
                        </div>
                        <div>
                          <FieldLabel>超级订阅</FieldLabel>
                          <NumberInput value={form.funnel[group as keyof MarketingInput["funnel"]].super} onChange={(value) => setSplitValue(group as keyof MarketingInput["funnel"], "super", value)} />
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
                    {form.contents.map((content, index) => (
                      <div key={content.id} className="rounded-3xl border border-gray-100 p-5">
                        <div className="flex items-center justify-between gap-4">
                          <p className="text-sm font-black text-gray-900">内容 {index + 1}</p>
                          <button onClick={() => removeContentRow(index)} className="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-red-500">
                            删除
                          </button>
                        </div>
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <FieldLabel>内容名称</FieldLabel>
                            <TextInput value={content.name} onChange={(value) => setContentValue(index, "name", value)} />
                          </div>
                          <div>
                            <FieldLabel>内容链接</FieldLabel>
                            <TextInput value={content.link} onChange={(value) => setContentValue(index, "link", value)} />
                          </div>
                          <div>
                            <FieldLabel>产品归属</FieldLabel>
                            <select
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
                            <FieldLabel>所属板块</FieldLabel>
                            <TextInput value={content.board} onChange={(value) => setContentValue(index, "board", value)} />
                          </div>
                          <div>
                            <FieldLabel>浏览量</FieldLabel>
                            <NumberInput value={content.views} onChange={(value) => setContentValue(index, "views", value)} />
                          </div>
                          <div>
                            <FieldLabel>意向评论</FieldLabel>
                            <NumberInput value={content.intentComments} onChange={(value) => setContentValue(index, "intentComments", value)} />
                          </div>
                          <div>
                            <FieldLabel>私信进线</FieldLabel>
                            <NumberInput value={content.privateMessages} onChange={(value) => setContentValue(index, "privateMessages", value)} />
                          </div>
                          <div>
                            <FieldLabel>留资</FieldLabel>
                            <NumberInput value={content.leads} onChange={(value) => setContentValue(index, "leads", value)} />
                          </div>
                          <div>
                            <FieldLabel>内容花费</FieldLabel>
                            <NumberInput value={content.spend} onChange={(value) => setContentValue(index, "spend", value)} />
                          </div>
                          <div>
                            <FieldLabel>高意向贡献</FieldLabel>
                            <NumberInput value={content.highIntent} onChange={(value) => setContentValue(index, "highIntent", value)} />
                          </div>
                          <div>
                            <FieldLabel>成交贡献</FieldLabel>
                            <NumberInput value={content.deals} onChange={(value) => setContentValue(index, "deals", value)} />
                          </div>
                          <div className="md:col-span-2">
                            <FieldLabel>素材描述</FieldLabel>
                            <TextArea value={content.creativeSummary} onChange={(value) => setContentValue(index, "creativeSummary", value)} rows={3} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-8">
                  <div className="grid grid-cols-1 gap-5">
                    <div>
                      <FieldLabel>素材补充说明</FieldLabel>
                      <TextArea value={form.creativeNotes} onChange={(value) => setForm((current) => ({ ...current, creativeNotes: value }))} rows={3} />
                    </div>
                    <div>
                      <FieldLabel>异常说明</FieldLabel>
                      <TextArea value={form.anomalyNotes} onChange={(value) => setForm((current) => ({ ...current, anomalyNotes: value }))} rows={3} />
                    </div>
                    <div>
                      <FieldLabel>优秀案例链接</FieldLabel>
                      <TextArea value={form.benchmarkLinks} onChange={(value) => setForm((current) => ({ ...current, benchmarkLinks: value }))} rows={3} />
                    </div>
                  </div>
                </Card>

                <PreviousMetricsSection previous={form.previous} onChange={setPreviousValue} />
              </div>

              <div className="space-y-8">
                {leadImportAudit && (
                  <Card className="p-8">
                    <LeadImportAuditPanel audit={leadImportAudit} />
                  </Card>
                )}

                <SummaryCard
                  title="数据完整度"
                  value={`${audit.completenessPercent}%`}
                  hint={audit.missingFields.length ? `待补充 ${audit.missingFields.slice(0, 4).join("、")}` : "核心字段已经基本齐全"}
                  status={audit.completenessPercent >= 85 ? "🟢" : audit.completenessPercent >= 60 ? "🟡" : "🔴"}
                />

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
                <h1 className="text-5xl font-black italic tracking-tighter uppercase text-black">营销效果诊断报告</h1>
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

            {leadImportAudit?.sheetType === "lead_detail_sheet" && (
              <div
                className="rounded-3xl bg-yellow-50 px-6 py-5 text-sm font-bold leading-7 text-yellow-800"
              >
                当前内容分析来自主线索表聚合，不等于真实内容表现。目标 / 花费 / 红线仍需结合预算表或手填补齐。
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

            <AnalysisReportSection analysis={result.analysis} />

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
