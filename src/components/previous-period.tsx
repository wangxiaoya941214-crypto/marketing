import React, { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Minus,
} from "lucide-react";
import type { MarketingInput } from "../../shared/marketing-engine";

const CARD_CLASS =
  "bg-white rounded-[2rem] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]";

const parseInputToNullableNumber = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(/[，,%]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const displayPercentInput = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "";
  return String(value <= 1 ? Math.round(value * 1000) / 10 : value);
};

const formatMoney = (value: number | null | undefined) =>
  value === null || value === undefined ? "——" : `${Math.round(value * 100) / 100}元`;

const formatCount = (value: number | null | undefined, unit = "台") =>
  value === null || value === undefined ? "——" : `${Math.round(value * 100) / 100}${unit}`;

const formatRate = (value: number | null | undefined) =>
  value === null || value === undefined ? "——" : `${Math.round(value * 1000) / 10}%`;

const getDeltaPercent = (
  current: number | null | undefined,
  previous: number | null | undefined,
) => {
  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined ||
    previous === 0
  ) {
    return null;
  }

  return ((current - previous) / previous) * 100;
};

const getDisplayDirection = (delta: number | null) => {
  if (delta === null || delta === 0) return "flat" as const;
  return delta > 0 ? "up" : "down" as const;
};

const InputField = ({
  label,
  value,
  placeholder,
  note,
  suffix,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  note: string;
  suffix?: string;
  onChange: (value: string) => void;
}) => (
  <div className="space-y-2">
    <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
      {label}
    </label>
    <div className="relative">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 pr-14 text-sm font-medium text-gray-900 outline-none transition focus:border-[#08E03B]"
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-bold text-gray-400">
          {suffix}
        </span>
      )}
    </div>
    <p className="text-xs font-medium leading-5 text-gray-500">{note}</p>
  </div>
);

export const PreviousMetricsSection = ({
  previous,
  onChange,
}: {
  previous: MarketingInput["previous"];
  onChange: (patch: Partial<MarketingInput["previous"]>) => void;
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className={`${CARD_CLASS} p-8`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="inline-flex items-center gap-3 text-left"
          >
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
              选填信息
            </span>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <h2 className="text-2xl font-black tracking-tight text-gray-950">
            上期数据（选填，用于环比分析）
          </h2>
          <p className="text-sm font-medium leading-6 text-gray-500">
            不填写也不会影响当前分析；填写后，系统会补充本期 vs 上期的变化判断。
          </p>
        </div>

        <div className="group relative w-full max-w-[320px] md:w-auto">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-gray-500 transition hover:border-[#08E03B] hover:text-black"
          >
            <HelpCircle size={14} />
            为什么填这个？
          </button>
          <div className="pointer-events-none absolute right-0 top-12 z-10 w-72 rounded-2xl border border-gray-100 bg-white px-4 py-4 text-sm font-medium leading-6 text-gray-600 opacity-0 shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition group-hover:opacity-100 group-focus-within:opacity-100">
            填写上期数据后，系统将自动生成环比分析，帮你判断本期表现是进步还是退步。
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
          <InputField
            label="上期成交量"
            value={previous.totalDeals === null ? "" : String(previous.totalDeals)}
            placeholder="例如 128"
            note="填写上一周期的总成交台数，用于判断本期成交规模变化。"
            suffix="台"
            onChange={(value) => onChange({ totalDeals: parseInputToNullableNumber(value) })}
          />

          <InputField
            label="上期 CPS / 元"
            value={previous.overallCps === null ? "" : String(previous.overallCps)}
            placeholder="例如 860"
            note="填写上一周期平均每次成交成本，用于判断投放效率是改善还是恶化。"
            suffix="元"
            onChange={(value) => onChange({ overallCps: parseInputToNullableNumber(value) })}
          />

          <InputField
            label="上期整体转化率"
            value={displayPercentInput(previous.overallConversionRate)}
            placeholder="例如 5"
            note="按百分比填写，输入 5 代表 5%。"
            suffix="%"
            onChange={(value) =>
              onChange({ overallConversionRate: parseInputToNullableNumber(value) })
            }
          />

          <InputField
            label="上期总花费 / 元"
            value={previous.totalSpend === null ? "" : String(previous.totalSpend)}
            placeholder="例如 120000"
            note="填写上一周期总投放费用，用于判断投入规模变化。"
            suffix="元"
            onChange={(value) => onChange({ totalSpend: parseInputToNullableNumber(value) })}
          />
        </div>
      )}
    </section>
  );
};

type MoMMetric = {
  title: string;
  current: number | null;
  previous: number | null;
  formatter: (value: number | null) => string;
  positiveWhen: "up" | "down";
};

export const MoMOverviewSection = ({
  input,
}: {
  input: MarketingInput;
}) => {
  const totalDeals = input.funnel.deals.total;
  const totalLeads = input.funnel.leads.total;
  const totalSpend = input.spend.total;
  const currentOverallCps =
    totalDeals !== null && totalDeals > 0 && totalSpend !== null ? totalSpend / totalDeals : null;
  const currentOverallConversion =
    totalDeals !== null && totalLeads !== null && totalLeads > 0 ? totalDeals / totalLeads : null;

  const metrics: MoMMetric[] = useMemo(
    () => [
      {
        title: "成交量",
        current: totalDeals,
        previous: input.previous.totalDeals,
        formatter: (value) => formatCount(value, "台"),
        positiveWhen: "up",
      },
      {
        title: "CPS",
        current: currentOverallCps,
        previous: input.previous.overallCps,
        formatter: formatMoney,
        positiveWhen: "down",
      },
      {
        title: "整体转化率",
        current: currentOverallConversion,
        previous: input.previous.overallConversionRate,
        formatter: formatRate,
        positiveWhen: "up",
      },
      {
        title: "总花费",
        current: totalSpend,
        previous: input.previous.totalSpend,
        formatter: formatMoney,
        positiveWhen: "down",
      },
    ],
    [
      currentOverallConversion,
      currentOverallCps,
      input.previous.overallConversionRate,
      input.previous.overallCps,
      input.previous.totalDeals,
      input.previous.totalSpend,
      totalDeals,
      totalSpend,
    ],
  );

  const hasPreviousData = metrics.some((item) => item.previous !== null);
  if (!hasPreviousData) return null;

  return (
    <section id="result-mom-overview" className={`${CARD_CLASS} scroll-mt-36 p-8`}>
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
          本期 vs 上期
        </p>
        <h2 className="text-2xl font-black tracking-tight text-gray-950">环比变化</h2>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((item) => {
          const delta = getDeltaPercent(item.current, item.previous);
          const direction = getDisplayDirection(delta);
          const beneficial =
            delta !== null &&
            ((item.positiveWhen === "up" && delta > 0) ||
              (item.positiveWhen === "down" && delta < 0));
          const emphatic = delta !== null && Math.abs(delta) >= 10;
          const toneClass =
            delta === null
              ? "border-gray-100 bg-gray-50 text-gray-500"
              : emphatic
                ? beneficial
                  ? "border-[#08E03B]/20 bg-[#08E03B]/10 text-[#067b21]"
                  : "border-red-200 bg-red-50 text-red-700"
                : "border-gray-200 bg-gray-50 text-gray-600";

          return (
            <div key={item.title} className="rounded-[1.75rem] border border-gray-100 px-5 py-5">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                {item.title}
              </p>
              <p className="mt-3 text-3xl font-black tracking-tight text-gray-950">
                {item.formatter(item.current)}
              </p>
              <p className="mt-2 text-sm font-medium text-gray-500">
                上期 {item.formatter(item.previous)}
              </p>

              <div className={`mt-4 flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-black ${toneClass}`}>
                {direction === "up" && <ArrowUpRight size={16} />}
                {direction === "down" && <ArrowDownRight size={16} />}
                {direction === "flat" && <Minus size={16} />}
                <span>
                  {delta === null
                    ? "暂无环比"
                    : `${direction === "up" ? "↑" : direction === "down" ? "↓" : ""}${Math.abs(
                        Math.round(delta * 10) / 10,
                      )}%`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
