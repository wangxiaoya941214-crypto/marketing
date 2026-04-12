import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ShieldCheck,
} from "lucide-react";
import type { MarketingDashboardData } from "../../shared/marketing-engine";

const MODULE_CARD_CLASS =
  "bg-white rounded-[2rem] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]";

const SECTION_IDS = {
  reliability: "result-reliability",
  mom: "result-mom-overview",
  analysis: "result-analysis",
  ranking: "result-content-ranking",
  budget: "result-budget-recommendations",
  actions: "result-action-plan",
  scale: "result-scale-plan",
} as const;

const MODULE_NAV_ITEMS = [
  { id: SECTION_IDS.reliability, label: "可靠性" },
  { id: SECTION_IDS.mom, label: "环比变化" },
  { id: SECTION_IDS.analysis, label: "完整报告" },
  { id: SECTION_IDS.ranking, label: "内容排名" },
  { id: SECTION_IDS.budget, label: "预算建议" },
  { id: SECTION_IDS.actions, label: "动作清单" },
  { id: SECTION_IDS.scale, label: "放量建议" },
];

type ParsedAnalysisSection = {
  id: string;
  title: string;
  bodyLines: string[];
  highlights: string[];
};

type RankingSortKey = "rank" | "leads" | "leadShare" | "cpl" | "qualityScore" | "views";
type SortDirection = "asc" | "desc";

type ActionPriority = "高" | "中" | "低";

const SORT_DEFAULT_DIRECTION: Record<RankingSortKey, SortDirection> = {
  rank: "asc",
  leads: "desc",
  leadShare: "desc",
  cpl: "asc",
  qualityScore: "desc",
  views: "desc",
};

const scrollToSection = (id: string) => {
  const element = document.getElementById(id);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "start" });
};

const formatMoney = (value: number | null | undefined) =>
  value === null || value === undefined ? "——" : `${Math.round(value * 100) / 100}元`;

const formatCount = (value: number | null | undefined, unit = "条") =>
  value === null || value === undefined ? "——" : `${Math.round(value * 100) / 100}${unit}`;

const formatRate = (value: number | null | undefined) =>
  value === null || value === undefined ? "——" : `${Math.round(value * 1000) / 10}%`;

const formatSignedPercent = (value: number | null | undefined) =>
  value === null || value === undefined ? "——" : `${value > 0 ? "+" : ""}${Math.round(value * 1000) / 10}%`;

const getReliabilityTone = (value: string) => {
  if (value === "高") {
    return {
      badgeClass: "bg-[#08E03B]/10 text-[#067b21] border-[#08E03B]/20",
      titleClass: "text-[#067b21]",
    };
  }
  if (value === "中") {
    return {
      badgeClass: "bg-yellow-50 text-yellow-700 border-yellow-200",
      titleClass: "text-yellow-700",
    };
  }
  return {
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    titleClass: "text-red-700",
  };
};

const getHighlightTone = (line: string) => {
  if (line.startsWith("🚨")) {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (line.startsWith("⚠️")) {
    return "border-yellow-200 bg-yellow-50 text-yellow-700";
  }
  if (line.startsWith("💡")) {
    return "border-[#08E03B]/20 bg-[#08E03B]/10 text-[#067b21]";
  }
  if (line.startsWith("📌")) {
    return "border-gray-200 bg-gray-50 text-gray-700";
  }
  return "border-gray-200 bg-gray-50 text-gray-700";
};

const getPerformanceTone = (
  item: MarketingDashboardData["contentRanking"][number],
): { label: "好" | "中" | "差"; className: string } => {
  if (
    item.recommendation.includes("立刻加量") ||
    (item.qualityScore !== null && item.qualityScore >= 1)
  ) {
    return {
      label: "好",
      className: "bg-[#08E03B]/10 text-[#067b21] border-[#08E03B]/20",
    };
  }
  if (
    item.recommendation.includes("建议暂停") ||
    (item.qualityScore !== null && item.qualityScore < 0.8)
  ) {
    return {
      label: "差",
      className: "bg-red-50 text-red-700 border-red-200",
    };
  }
  return {
    label: "中",
    className: "bg-yellow-50 text-yellow-700 border-yellow-200",
  };
};

const parseAnalysisSections = (analysis: string): ParsedAnalysisSection[] => {
  const headingPattern = /^═{3}\s*(.+?)\s*═{3}$/;
  const lines = analysis.split("\n");
  const sections: ParsedAnalysisSection[] = [];
  let currentTitle = "完整分析报告";
  let currentLines: string[] = [];

  const pushSection = () => {
    const trimmedLines = currentLines.map((line) => line.trimEnd());
    const highlights = trimmedLines.filter(
      (line) =>
        line.startsWith("🚨") ||
        line.startsWith("⚠️") ||
        line.startsWith("💡") ||
        line.startsWith("📌") ||
        line.startsWith("综合评级"),
    );
    const bodyLines = trimmedLines.filter((line) => !highlights.includes(line));

    if (!bodyLines.some((line) => line.trim()) && !highlights.length) {
      currentLines = [];
      return;
    }

    sections.push({
      id: `analysis-section-${sections.length + 1}`,
      title: currentTitle,
      bodyLines,
      highlights,
    });
    currentLines = [];
  };

  lines.forEach((line) => {
    const headingMatch = line.trim().match(headingPattern);
    if (headingMatch) {
      if (currentLines.length) {
        pushSection();
      }
      currentTitle = headingMatch[1];
      return;
    }
    currentLines.push(line);
  });

  if (currentLines.length) {
    pushSection();
  }

  return sections;
};

const ReportBody = ({ lines }: { lines: string[] }) => {
  const blocks: Array<{ type: "table" | "text"; lines: string[] }> = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        tableLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: "table", lines: tableLines });
      continue;
    }

    const textLines: string[] = [];
    while (index < lines.length && lines[index].trim() && !lines[index].trim().startsWith("|")) {
      textLines.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: "text", lines: textLines });
  }

  return (
    <div className="space-y-4">
      {blocks.map((block, blockIndex) =>
        block.type === "table" ? (
          <div
            key={`table-${blockIndex}`}
            className="overflow-x-auto rounded-[1.5rem] bg-gray-950 px-4 py-4 text-gray-100"
          >
            <pre className="min-w-max whitespace-pre text-[12px] leading-6">
              {block.lines.join("\n")}
            </pre>
          </div>
        ) : (
          <div key={`text-${blockIndex}`} className="space-y-2">
            {block.lines.map((item, itemIndex) => (
              <p
                key={`line-${itemIndex}`}
                className="text-sm font-medium leading-7 text-gray-600"
              >
                {item}
              </p>
            ))}
          </div>
        ),
      )}
    </div>
  );
};

export const ResultModuleNavigation = () => (
  <div
    data-pdf-exclude="true"
    className={`${MODULE_CARD_CLASS} sticky top-24 z-30 overflow-x-auto px-4 py-4`}
  >
    <div className="flex min-w-max gap-3">
      {MODULE_NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          onClick={() => scrollToSection(item.id)}
          className="rounded-full border border-gray-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-500 transition hover:border-[#08E03B] hover:text-black"
        >
          {item.label}
        </button>
      ))}
    </div>
  </div>
);

export const ReliabilitySection = ({
  reliability,
}: {
  reliability: MarketingDashboardData["reliability"];
}) => {
  const tone = getReliabilityTone(reliability.reliabilityText);
  const factors = [
    { label: "数据完整度", value: reliability.dataIntegrityText },
    { label: "样本充足度", value: reliability.sampleText },
    { label: "建议复盘周期", value: `${reliability.reviewDays}天` },
    { label: "当前复盘重点", value: reliability.reviewFocus },
  ];

  return (
    <section id={SECTION_IDS.reliability} className={`${MODULE_CARD_CLASS} p-8 scroll-mt-36`}>
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-[#08E03B]">
              <ShieldCheck size={22} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                结果可靠性
              </p>
              <h2 className="text-2xl font-black tracking-tight text-gray-950">
                数据可靠性说明
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] ${tone.badgeClass}`}
            >
              整体评级 {reliability.reliabilityText}
            </span>
            <p className={`text-sm font-bold ${tone.titleClass}`}>
              当前结果可用，但建议结合补充数据一起判断。
            </p>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2">
          {factors.map((factor) => (
            <div key={factor.label} className="rounded-[1.5rem] border border-gray-100 bg-gray-50 px-4 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">
                {factor.label}
              </p>
              <p className="mt-2 text-sm font-bold leading-6 text-gray-700">{factor.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 border-t border-gray-100 pt-6">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
          建议补充的数据项
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {reliability.moreDataSuggestions.map((item) => (
            <div key={item} className="rounded-[1.5rem] border border-gray-100 px-4 py-4">
              <p className="text-sm font-medium leading-6 text-gray-600">{item}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export const AnalysisReportSection = ({ analysis }: { analysis: string }) => {
  const sections = useMemo(() => parseAnalysisSections(analysis), [analysis]);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  useEffect(() => {
    setExpandedIds(sections.slice(0, 3).map((item) => item.id));
  }, [sections]);

  const toggleSection = (id: string) => {
    setExpandedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  return (
    <section id={SECTION_IDS.analysis} className="scroll-mt-36 space-y-6">
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
          模块一到模块七
        </p>
        <h2 className="text-3xl font-black tracking-tight text-gray-950">完整分析报告</h2>
      </div>

      <div className="space-y-4">
        {sections.map((section, index) => {
          const expanded = expandedIds.includes(section.id);
          return (
            <article key={section.id} className={`${MODULE_CARD_CLASS} p-6`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                    第 {index + 1} 个模块
                  </p>
                  <h3 className="text-2xl font-black tracking-tight text-gray-950">
                    {section.title}
                  </h3>
                </div>

                <button
                  onClick={() => toggleSection(section.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-gray-500 transition hover:border-[#08E03B] hover:text-black"
                >
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {expanded ? "收起" : "展开"}
                </button>
              </div>

              {section.highlights.length > 0 && (
                <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {section.highlights.map((item) => (
                    <div
                      key={item}
                      className={`rounded-[1.5rem] border px-4 py-4 text-sm font-bold leading-6 ${getHighlightTone(
                        item,
                      )}`}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              )}

              {expanded && (
                <div className="mt-5 border-t border-gray-100 pt-5">
                  <ReportBody lines={section.bodyLines} />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
};

export const ContentRankingSection = ({
  contentRanking,
}: {
  contentRanking: MarketingDashboardData["contentRanking"];
}) => {
  const [sortKey, setSortKey] = useState<RankingSortKey>("rank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const sortedRanking = useMemo(() => {
    const getValue = (item: MarketingDashboardData["contentRanking"][number]) => {
      switch (sortKey) {
        case "rank":
          return item.rank;
        case "leads":
          return item.leads ?? -1;
        case "leadShare":
          return item.leadShare ?? -1;
        case "cpl":
          return item.cpl ?? Number.POSITIVE_INFINITY;
        case "qualityScore":
          return item.qualityScore ?? -1;
        case "views":
          return item.views ?? -1;
      }
    };

    return [...contentRanking].sort((left, right) => {
      const leftValue = getValue(left);
      const rightValue = getValue(right);

      if (sortDirection === "asc") {
        return leftValue > rightValue ? 1 : leftValue < rightValue ? -1 : 0;
      }
      return leftValue < rightValue ? 1 : leftValue > rightValue ? -1 : 0;
    });
  }, [contentRanking, sortDirection, sortKey]);

  const toggleSort = (key: RankingSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(SORT_DEFAULT_DIRECTION[key]);
  };

  return (
    <section id={SECTION_IDS.ranking} className={`${MODULE_CARD_CLASS} scroll-mt-36 p-8`}>
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
          内容表现对比
        </p>
        <h2 className="text-3xl font-black tracking-tight text-gray-950">内容排名</h2>
      </div>

      {contentRanking.length === 0 ? (
        <div className="mt-6 rounded-[1.5rem] border border-dashed border-gray-200 px-6 py-8 text-sm font-medium text-gray-500">
          当前没有足够的内容数据，先补充内容名称、留资、花费、成交贡献后再看排名。
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <div className="mb-4 flex flex-wrap gap-2">
            {[
              { key: "rank" as RankingSortKey, label: "按排名" },
              { key: "leads" as RankingSortKey, label: "按留资" },
              { key: "leadShare" as RankingSortKey, label: "按占比" },
              { key: "cpl" as RankingSortKey, label: "按CPL" },
              { key: "qualityScore" as RankingSortKey, label: "按质量分" },
              { key: "views" as RankingSortKey, label: "按浏览量" },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => toggleSort(item.key)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition ${
                  sortKey === item.key
                    ? "border-[#08E03B] bg-[#08E03B]/10 text-black"
                    : "border-gray-200 bg-white text-gray-500 hover:border-[#08E03B] hover:text-black"
                }`}
              >
                {item.label}
                <ChevronsUpDown size={12} />
              </button>
            ))}
          </div>

          <table className="min-w-full border-separate border-spacing-y-3">
            <thead>
              <tr>
                {["排名", "内容名称", "核心指标", "表现评级"].map((label) => (
                  <th
                    key={label}
                    className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.18em] text-gray-400"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRanking.map((item) => {
                const performance = getPerformanceTone(item);
                return (
                  <tr key={`${item.rank}-${item.name}`} className="align-top">
                    <td className="rounded-l-[1.5rem] border-y border-l border-gray-100 bg-gray-50 px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{item.medal}</span>
                        <div>
                          <p className="text-sm font-black text-gray-950">#{item.rank}</p>
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">
                            {item.product}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="border-y border-gray-100 bg-gray-50 px-4 py-4">
                      <p className="text-sm font-black text-gray-950">{item.name}</p>
                      <p className="mt-2 text-sm font-medium leading-6 text-gray-500">
                        {item.reason}
                      </p>
                    </td>
                    <td className="border-y border-gray-100 bg-gray-50 px-4 py-4">
                      <div className="space-y-2 text-sm font-medium text-gray-600">
                        <p>留资：{formatCount(item.leads, "条")}</p>
                        <p>占比：{formatRate(item.leadShare)}</p>
                        <p>CPL：{formatMoney(item.cpl)}</p>
                        <p>质量分：{item.qualityScore === null ? "——" : item.qualityScore.toFixed(2)}</p>
                      </div>
                    </td>
                    <td className="rounded-r-[1.5rem] border-y border-r border-gray-100 bg-gray-50 px-4 py-4">
                      <div className="space-y-3">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${performance.className}`}
                        >
                          {performance.label}
                        </span>
                        <p className="text-sm font-bold leading-6 text-gray-700">
                          {item.recommendation}
                        </p>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export const BudgetRecommendationsSection = ({
  budgetRecommendations,
}: {
  budgetRecommendations: MarketingDashboardData["budgetRecommendations"];
}) => (
  <section id={SECTION_IDS.budget} className="scroll-mt-36 space-y-6">
    <div className="space-y-2">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
        投放调整方向
      </p>
      <h2 className="text-3xl font-black tracking-tight text-gray-950">预算建议</h2>
    </div>

    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {budgetRecommendations.map((item, index) => {
        const tone = item.action.includes("加")
          ? "border-[#08E03B]/20 bg-[#08E03B]/10 text-[#067b21]"
          : item.action.includes("减")
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-gray-200 bg-gray-50 text-gray-700";

        return (
          <article key={`${item.target}-${index}`} className={`${MODULE_CARD_CLASS} p-6`}>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${tone}`}
              >
                {item.action}
              </span>
              <p className="text-lg font-black text-gray-950">{item.target}</p>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-[1.5rem] border border-gray-100 bg-gray-50 px-4 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">
                  当前投入
                </p>
                <p className="mt-2 text-lg font-black text-gray-950">
                  {formatMoney(item.currentSpend)}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-gray-100 bg-gray-50 px-4 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">
                  建议投入
                </p>
                <p className="mt-2 text-lg font-black text-gray-950">
                  {formatMoney(item.suggestedSpend)}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-gray-100 bg-gray-50 px-4 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">
                  建议幅度
                </p>
                <p className="mt-2 text-lg font-black text-gray-950">
                  {formatSignedPercent(item.changePercent)}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-gray-100 px-4 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">
                原因说明
              </p>
              <p className="mt-2 text-sm font-medium leading-7 text-gray-600">{item.reason}</p>
            </div>
          </article>
        );
      })}
    </div>
  </section>
);

export const ActionPlanSection = ({
  actionPlan,
}: {
  actionPlan: MarketingDashboardData["actionPlan"];
}) => {
  const actionItems = useMemo(
    () =>
      [
        ...actionPlan.urgent.map((item, index) => ({
          id: `urgent-${index}`,
          priority: "高" as ActionPriority,
          order: 0,
          ...item,
        })),
        ...actionPlan.thisWeek.map((item, index) => ({
          id: `this-week-${index}`,
          priority: "中" as ActionPriority,
          order: 1,
          ...item,
        })),
        ...actionPlan.nextReview.map((item, index) => ({
          id: `next-review-${index}`,
          priority: "低" as ActionPriority,
          order: 2,
          ...item,
        })),
      ].sort((left, right) => left.order - right.order),
    [actionPlan],
  );

  const [checkedItems, setCheckedItems] = useState<string[]>([]);

  const toggleChecked = (id: string) => {
    setCheckedItems((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const getPriorityTone = (priority: ActionPriority) => {
    if (priority === "高") return "bg-red-50 text-red-700 border-red-200";
    if (priority === "中") return "bg-yellow-50 text-yellow-700 border-yellow-200";
    return "bg-gray-100 text-gray-600 border-gray-200";
  };

  return (
    <section id={SECTION_IDS.actions} className={`${MODULE_CARD_CLASS} scroll-mt-36 p-8`}>
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
          先做什么
        </p>
        <h2 className="text-3xl font-black tracking-tight text-gray-950">动作清单</h2>
      </div>

      <div className="mt-6 space-y-4">
        {actionItems.map((item) => {
          const checked = checkedItems.includes(item.id);
          return (
            <label
              key={item.id}
              className={`flex cursor-pointer gap-4 rounded-[1.75rem] border px-5 py-5 transition ${
                checked
                  ? "border-[#08E03B]/30 bg-[#08E03B]/5"
                  : "border-gray-100 bg-white hover:border-gray-200"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleChecked(item.id)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-[#08E03B] focus:ring-[#08E03B]"
              />

              <div className="flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${getPriorityTone(
                      item.priority,
                    )}`}
                  >
                    {item.priority}优先级
                  </span>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                    {item.owner}
                  </p>
                </div>

                <p className="text-base font-black leading-7 text-gray-950">{item.task}</p>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-[1.25rem] border border-gray-100 bg-gray-50 px-4 py-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">
                      预期效果
                    </p>
                    <p className="mt-2 text-sm font-medium leading-6 text-gray-600">
                      {item.expectation}
                    </p>
                  </div>
                  <div className="rounded-[1.25rem] border border-gray-100 bg-gray-50 px-4 py-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">
                      验证方式
                    </p>
                    <p className="mt-2 text-sm font-medium leading-6 text-gray-600">
                      {item.validation}
                    </p>
                  </div>
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </section>
  );
};

export const ScalePlanSection = ({
  scalePlan,
}: {
  scalePlan: MarketingDashboardData["scalePlan"];
}) => {
  const scaleTargets = [
    {
      label: "灵活订阅",
      currentPerformance: scalePlan.comboFlexible || "当前暂无放量组合建议",
      recommendation: scalePlan.steps[0] || "先以小步放量为主",
    },
    {
      label: "超级订阅",
      currentPerformance: scalePlan.comboSuper || "当前暂无放量组合建议",
      recommendation: scalePlan.steps[1] || scalePlan.steps[0] || "先以小步放量为主",
    },
  ];

  return (
    <section id={SECTION_IDS.scale} className="scroll-mt-36 space-y-6">
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
          放量与止损
        </p>
        <h2 className="text-3xl font-black tracking-tight text-gray-950">放量建议</h2>
      </div>

      <article className={`${MODULE_CARD_CLASS} p-8`}>
        {!scalePlan.enabled ? (
          <div className="rounded-[1.5rem] border border-dashed border-gray-200 px-6 py-8 text-sm font-medium leading-7 text-gray-500">
            当前综合评级还没有达到适合放量的状态。建议先完成高优先级修复动作，等关键转化环节稳定后再扩大投入。
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {scaleTargets.map((item) => (
                <div key={item.label} className="rounded-[1.75rem] border border-gray-100 px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xl font-black tracking-tight text-gray-950">
                      {item.label}
                    </h3>
                    <span className="inline-flex rounded-full border border-[#08E03B]/20 bg-[#08E03B]/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#067b21]">
                      建议放量
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="rounded-[1.25rem] border border-gray-100 bg-gray-50 px-4 py-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">
                        当前表现
                      </p>
                      <p className="mt-2 text-sm font-medium leading-6 text-gray-600">
                        {item.currentPerformance}
                      </p>
                    </div>

                    <div className="rounded-[1.25rem] border border-gray-100 bg-gray-50 px-4 py-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">
                        建议放量幅度
                      </p>
                      <p className="mt-2 text-sm font-medium leading-6 text-gray-600">
                        小步放量，先扩同结构内容或计划，再看 3 天数据决定是否继续推高。
                      </p>
                    </div>

                    <div className="rounded-[1.25rem] border border-red-100 bg-red-50 px-4 py-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-red-500">
                        风险提示
                      </p>
                      <p className="mt-2 text-sm font-medium leading-6 text-red-700">
                        {scalePlan.stopLoss}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {scalePlan.effectiveTraits.length > 0 && (
              <div className="rounded-[1.75rem] border border-gray-100 px-5 py-5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                  有效内容的共同特征
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                  {scalePlan.effectiveTraits.map((item) => (
                    <div key={`${item.dimension}-${item.trait}`} className="rounded-[1.25rem] border border-gray-100 bg-gray-50 px-4 py-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">
                        {item.dimension}
                      </p>
                      <p className="mt-2 text-sm font-black text-gray-950">{item.trait}</p>
                      <p className="mt-2 text-sm font-medium leading-6 text-gray-600">{item.evidence}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </article>
    </section>
  );
};
