import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BellRing,
  Bot,
  ChevronsUpDown,
  Filter,
  History,
  Layers3,
  PanelLeft,
  ShieldAlert,
  Send,
} from "lucide-react";
import type {
  V2AlertItem,
  V2DashboardBusinessFilter,
  V2DashboardFilterMeta,
  V2DashboardFilters,
  V2DashboardResponse,
  V2DashboardTimeScope,
  V2DashboardType,
  V2SnapshotRecord,
  V2UploadSessionRecord,
} from "../../shared/v2/types.ts";

type AgentTimelineMessage = {
  role: "user" | "assistant";
  content: string;
};

type V2WorkspaceMode = "fromHome" | "internal";

const CARD_CLASS =
  "bg-white rounded-[2rem] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]";

const DASHBOARD_META: Array<{
  type: V2DashboardType;
  label: string;
  agent: string;
  role: string;
  focus: string;
  atmosphere: string;
  keyQuestion: string;
  chartTitle: string;
  chartHint: string;
  tableTitle: string;
  tableHint: string;
  emptyState: string;
}> = [
  {
    type: "overview",
    label: "总览驾驶舱",
    agent: "Alex",
    role: "首席经营分析师",
    focus: "经营健康度",
    atmosphere: "先看经营状态，再决定今天最该盯哪一个风险。",
    keyQuestion: "当前经营状态是健康、需关注，还是已经进入预警区？",
    chartTitle: "经营健康度对比",
    chartHint: "优先看总量、成交、消耗和打通质量的相互关系。",
    tableTitle: "关键指标清单",
    tableHint: "给管理层快速扫一眼当前主指标。",
    emptyState: "当前还缺少能进入总览驾驶舱主链的数据。",
  },
  {
    type: "content",
    label: "内容获客",
    agent: "Nova",
    role: "内容策略分析师",
    focus: "内容贡献",
    atmosphere: "先抓真正带线的内容，再看哪些内容只贡献了热闹。",
    keyQuestion: "哪类内容真正带来了线索，而不是只带来了热度？",
    chartTitle: "内容贡献对比",
    chartHint: "重点看内容数量、线索贡献和高价值内容分布。",
    tableTitle: "内容贡献表",
    tableHint: "优先下钻高线索内容和零线索内容。",
    emptyState: "当前还缺少内容表现或线索明细数据。",
  },
  {
    type: "ads",
    label: "投放效果",
    agent: "Rex",
    role: "增长黑客分析师",
    focus: "效率对比",
    atmosphere: "这张看板不是看花了多少钱，而是看钱有没有花在对的地方。",
    keyQuestion: "哪些计划值得继续加预算，哪些计划应该立刻止损？",
    chartTitle: "计划效率分层",
    chartHint: "重点看消耗、打通和闭环下单之间的效率关系。",
    tableTitle: "计划效率表",
    tableHint: "优先识别高消耗低结果的计划。",
    emptyState: "当前还缺少投放计划和消耗数据。",
  },
  {
    type: "sales",
    label: "销售跟进",
    agent: "Morgan",
    role: "销售行为分析师",
    focus: "漏斗和战败原因",
    atmosphere: "优先看跟进链路是否断掉，再看战败是不是还能挽回。",
    keyQuestion: "问题到底卡在跟进节奏、战败原因，还是线索本身质量？",
    chartTitle: "销售漏斗观察",
    chartHint: "优先看待复核、已确认、未匹配三类状态的差异。",
    tableTitle: "销售跟进明细",
    tableHint: "向下看漏斗节点和战败原因分布。",
    emptyState: "当前还缺少销售跟进表或闭环底座数据。",
  },
  {
    type: "super_subscription",
    label: "超级订阅",
    agent: "Sage",
    role: "订阅业务增长顾问",
    focus: "长期承诺和城市机会",
    atmosphere: "看的是高承诺用户池，而不是短期线索热闹。",
    keyQuestion: "哪些城市和用户更适合做高承诺、高价值的超级订阅？",
    chartTitle: "城市与承诺机会",
    chartHint: "优先看城市覆盖、超级订阅转化和机会分层。",
    tableTitle: "超级订阅机会表",
    tableHint: "适合看城市、车型和长期承诺机会。",
    emptyState: "当前还缺少超级订阅业务线数据。",
  },
  {
    type: "flexible_subscription",
    label: "灵活订阅",
    agent: "Iris",
    role: "用户决策行为分析师",
    focus: "低门槛、AI 外呼和决策阻力",
    atmosphere: "重点不是有没有线索，而是用户还在犹豫什么。",
    keyQuestion: "用户的决策阻力在哪里，AI 外呼到底有没有拉动转化？",
    chartTitle: "决策阻力观察",
    chartHint: "优先看低门槛转化、AI 外呼触达和最终下单的关系。",
    tableTitle: "灵活订阅质量表",
    tableHint: "适合看渠道差异、决策阻力和 AI 外呼效果。",
    emptyState: "当前还缺少灵活订阅业务线数据。",
  },
];

const fetchJsonWithTimeout = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 20_000,
) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    return { response, payload };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("请求超时，请稍后重试。");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const toChartNumber = (value: string) => {
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const toneClass = (tone?: string) => {
  if (tone === "positive") return "border-[#08E03B]/20 bg-[#08E03B]/10 text-[#067b21]";
  if (tone === "warning") return "border-yellow-200 bg-yellow-50 text-yellow-700";
  if (tone === "danger") return "border-red-200 bg-red-50 text-red-700";
  return "border-gray-200 bg-gray-50 text-gray-700";
};

const TIME_SCOPE_LABEL: Record<V2DashboardTimeScope, string> = {
  current_snapshot: "当前快照",
  last_7_days: "最近 7 天",
  current_cycle: "当前周期",
};

const BUSINESS_FILTER_LABEL: Record<V2DashboardBusinessFilter, string> = {
  all: "全部业务线",
  super: "超级订阅",
  flexible: "灵活订阅",
};

const toFriendlyWorkspaceErrorMessage = (
  error: unknown,
  fallback = "当前页面暂时不可用，请重新生成分析会话后再试。",
) => {
  const message =
    error instanceof Error ? error.message.trim() : typeof error === "string" ? error.trim() : "";

  if (!message) {
    return fallback;
  }

  if (
    message.includes("Cannot read properties") ||
    message.includes("Unexpected token") ||
    message.includes("summary")
  ) {
    return fallback;
  }

  return message;
};

const describeFilterMeta = (
  appliedFilters?: V2DashboardFilters,
  filterMeta?: V2DashboardFilterMeta,
) => {
  if (!appliedFilters || !filterMeta) return [];

  const messages: Array<{ tone: "neutral" | "warning"; text: string }> = [];

  messages.push({
    tone: "neutral",
    text: `当前按 ${TIME_SCOPE_LABEL[appliedFilters.timeScope]} / ${BUSINESS_FILTER_LABEL[appliedFilters.businessFilter]} 查看。`,
  });

  if (filterMeta.timeScopeFallbackApplied) {
    messages.push({
      tone: "warning",
      text: `时间范围已回退到 ${TIME_SCOPE_LABEL[appliedFilters.timeScope]}，因为当前快照不足以支持你选的范围。`,
    });
  }

  if (filterMeta.businessFilterForced) {
    messages.push({
      tone: "warning",
      text: `当前看板已强制切到 ${BUSINESS_FILTER_LABEL[appliedFilters.businessFilter]}，因为这张看板只支持对应业务线。`,
    });
  }

  filterMeta.notes.forEach((note) => {
    messages.push({ tone: "warning", text: note });
  });

  return messages;
};

const DashboardDetailBlock = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
}) => (
  <div className="rounded-[1.5rem] border border-gray-100 bg-gray-50 px-5 py-5">
    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
      {label}
    </p>
    <div className="mt-3 text-lg font-black tracking-tight text-gray-950">{value}</div>
    <p className="mt-2 text-sm font-medium leading-6 text-gray-500">{hint}</p>
  </div>
);

const DashboardFocusSection = ({
  payload,
  meta,
}: {
  payload: V2DashboardResponse;
  meta: (typeof DASHBOARD_META)[number];
}) => {
  const { dashboard, snapshot } = payload;
  const canonicalSummary =
    dashboard.agentContext.canonicalFactsSummary as
      | V2SnapshotRecord["canonicalFacts"]["summary"]
      | undefined;
  const matchingSummary =
    dashboard.agentContext.matchingSummary as
      | V2SnapshotRecord["canonicalFacts"]["summary"]["matching"]
      | undefined;
  const attributionSummary =
    dashboard.agentContext.attributionSummary as
      | V2SnapshotRecord["canonicalFacts"]["summary"]["attribution"]
      | undefined;
  const topContent = dashboard.agentContext.top5_content as Array<Record<string, unknown>> | undefined;
  const planRows = snapshot.dashboards.ads.table?.rows || [];
  const salesRows = snapshot.dashboards.sales.table?.rows || [];
  const defeatReasons = dashboard.agentContext.defeat_reasons as
    | { notOrdered?: unknown[]; lost?: unknown[] }
    | undefined;
  const currentBusinessLineSummary =
    canonicalSummary?.byBusinessLine?.[
      payload.appliedFilters.businessFilter === "all"
        ? "all"
        : payload.appliedFilters.businessFilter
    ];

  if (meta.type === "overview") {
    return (
      <section className={`${CARD_CLASS} px-8 py-8`}>
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
            总览重点
          </p>
          <h2 className="text-2xl font-black tracking-tight text-gray-950">
            当前经营健康判断
          </h2>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DashboardDetailBlock
            label="总线索结构"
            value={`${canonicalSummary?.totalLeads ?? 0} / ${canonicalSummary?.totalTrafficLeads ?? 0} / ${canonicalSummary?.totalFollowupLeads ?? 0}`}
            hint="按 总线索 / 流量线索 / 跟进线索 展示当前快照体量。"
          />
          <DashboardDetailBlock
            label="打通质量"
            value={`${matchingSummary?.exact ?? 0} 精确 / ${matchingSummary?.fuzzy ?? 0} 模糊`}
            hint="先看高置信打通和模糊打通的占比。"
          />
          <DashboardDetailBlock
            label="归因方式"
            value={`${attributionSummary?.creativeId ?? 0} 创意 / ${attributionSummary?.noteId ?? 0} 笔记`}
            hint="归因方式能直接影响经营判断可信度。"
          />
          <DashboardDetailBlock
            label="当前业务范围"
            value={`${currentBusinessLineSummary?.orders ?? 0} 单 / ${currentBusinessLineSummary?.spend ?? 0} 元`}
            hint="当前筛选条件下的订单和消耗范围。"
          />
        </div>
      </section>
    );
  }

  if (meta.type === "content") {
    const firstContent = topContent?.[0];
    return (
      <section className={`${CARD_CLASS} px-8 py-8`}>
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
            内容重点
          </p>
          <h2 className="text-2xl font-black tracking-tight text-gray-950">
            当前内容贡献摘要
          </h2>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DashboardDetailBlock
            label="内容数量"
            value={String(dashboard.agentContext.total_content || 0)}
            hint="当前过滤条件下能进入内容分析的条目数。"
          />
          <DashboardDetailBlock
            label="自然线索"
            value={String(dashboard.agentContext.organic_leads || 0)}
            hint="闭环快照里记录到的自然扩散线索。"
          />
          <DashboardDetailBlock
            label="零线索内容"
            value={String(dashboard.agentContext.zero_lead_content || 0)}
            hint="帮助快速定位应该止损或复盘的内容。"
          />
          <DashboardDetailBlock
            label="当前最强内容"
            value={String(firstContent?.note || firstContent?.name || "待补")}
            hint="优先复盘这条内容的选题和转化动作。"
          />
        </div>
      </section>
    );
  }

  if (meta.type === "ads") {
    const topPlan = planRows[0];
    const lowPlan = planRows[planRows.length - 1];
    return (
      <section className={`${CARD_CLASS} px-8 py-8`}>
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
            投放重点
          </p>
          <h2 className="text-2xl font-black tracking-tight text-gray-950">
            当前计划效率分层
          </h2>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DashboardDetailBlock
            label="总计划数"
            value={String(dashboard.agentContext.total_plans || 0)}
            hint="当前看板里可用于比较的计划数。"
          />
          <DashboardDetailBlock
            label="总消耗"
            value={String(dashboard.agentContext.total_spend || 0)}
            hint="当前过滤条件下的计划消耗规模。"
          />
          <DashboardDetailBlock
            label="优先看"
            value={String(topPlan?.[0] || "待补")}
            hint="优先看这条计划是不是值得继续加预算。"
          />
          <DashboardDetailBlock
            label="优先止损"
            value={String(lowPlan?.[0] || "待补")}
            hint="优先确认这条计划是不是高消耗低结果。"
          />
        </div>
      </section>
    );
  }

  if (meta.type === "sales") {
    const firstSales = salesRows[0];
    return (
      <section className={`${CARD_CLASS} px-8 py-8`}>
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
            销售重点
          </p>
          <h2 className="text-2xl font-black tracking-tight text-gray-950">
            当前跟进质量与战败判断
          </h2>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DashboardDetailBlock
            label="跟进线索"
            value={String(dashboard.agentContext.new_leads || canonicalSummary?.totalFollowupLeads || 0)}
            hint="当前过滤条件下进入销售跟进链的线索。"
          />
          <DashboardDetailBlock
            label="待复核"
            value={String(dashboard.agentContext.overdue_leads || 0)}
            hint="仍可能影响销售判断的待确认样本。"
          />
          <DashboardDetailBlock
            label="首位销售"
            value={String(firstSales?.[0] || "待补")}
            hint="当前销售明细中线索数最多的销售。"
          />
          <DashboardDetailBlock
            label="战败原因池"
            value={String(
              Array.isArray(defeatReasons?.notOrdered)
                ? defeatReasons.notOrdered.length
                : 0,
            )}
            hint="用于进一步分析跟进阻塞和流失原因。"
          />
        </div>
      </section>
    );
  }

  if (
    meta.type === "super_subscription" ||
    meta.type === "flexible_subscription"
  ) {
    const channels = (dashboard.agentContext.channel_distribution ||
      dashboard.agentContext.channels ||
      []) as Array<Record<string, unknown>>;
    const firstChannel = channels[0];
    return (
      <section className={`${CARD_CLASS} px-8 py-8`}>
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
            业务重点
          </p>
          <h2 className="text-2xl font-black tracking-tight text-gray-950">
            {meta.type === "super_subscription" ? "长期承诺机会" : "决策阻力观察"}
          </h2>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DashboardDetailBlock
            label="线索"
            value={String(dashboard.agentContext.leads || 0)}
            hint="当前业务线筛选下的线索数量。"
          />
          <DashboardDetailBlock
            label="成交"
            value={String(dashboard.agentContext.conversion || 0)}
            hint="当前业务线筛选下的成交数量。"
          />
          <DashboardDetailBlock
            label={meta.type === "super_subscription" ? "城市机会" : "主要渠道"}
            value={String(
              Array.isArray(dashboard.agentContext.top5_leads_cities)
                ? dashboard.agentContext.top5_leads_cities[0]?.city || "待补"
                : firstChannel?.channel || "待补",
            )}
            hint={
              meta.type === "super_subscription"
                ? "优先看高线索城市和高转化城市。"
                : "优先看当前最主要的线索渠道。"
            }
          />
          <DashboardDetailBlock
            label={meta.type === "super_subscription" ? "私域承接" : "AI / 决策提示"}
            value={String(
              meta.type === "super_subscription"
                ? dashboard.agentContext.wechat_rate || "待补"
                : dashboard.agentContext.ai_conversion_rate || "待补",
            )}
            hint={
              meta.type === "super_subscription"
                ? "当前业务线下的私域承接率。"
                : "AI 外呼和决策阻力字段仍在逐步补齐。"
            }
          />
        </div>
      </section>
    );
  }

  return null;
};

const DashboardView = ({
  payload,
  meta,
}: {
  payload: V2DashboardResponse | null;
  meta: (typeof DASHBOARD_META)[number];
}) => {
  const [tableExpanded, setTableExpanded] = useState(false);

  useEffect(() => {
    setTableExpanded(false);
  }, [payload?.snapshot.id, payload?.dashboard.type]);

  if (!payload) {
    return (
      <div className={`${CARD_CLASS} px-8 py-10 text-sm font-medium text-gray-500`}>
        {meta.emptyState} 先回首页完成分析，或者切换到一个已有快照。
      </div>
    );
  }

  const { dashboard, snapshot, appliedFilters, filterMeta } = payload;
  const dashboardSummary =
    typeof dashboard.summary === "string" && dashboard.summary.trim()
      ? dashboard.summary
      : meta.emptyState;
  const chartCards = dashboard.cards
    .map((card) => ({
      ...card,
      numericValue: toChartNumber(card.value),
    }))
    .filter((card) => card.numericValue !== null)
    .slice(0, 4);
  const maxChartValue = Math.max(...chartCards.map((card) => card.numericValue || 0), 1);
  const filterMessages = describeFilterMeta(appliedFilters, filterMeta);
  const warningMessages = filterMessages.filter((item) => item.tone === "warning");

  return (
    <div className="space-y-6">
      <section className={`${CARD_CLASS} px-8 py-8`}>
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
              当前看板
            </p>
            <h1
              data-testid="v2-dashboard-title"
              className="text-4xl font-black tracking-tight text-gray-950"
            >
              {dashboard.title}
            </h1>
            <p className="max-w-4xl text-sm font-medium leading-7 text-gray-600">
              {dashboardSummary}
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-gray-100 bg-gray-50 px-5 py-5">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
              这一屏最先回答
            </p>
            <p className="mt-3 text-sm font-black leading-7 text-gray-950">{meta.keyQuestion}</p>
            <p className="mt-2 text-sm font-medium leading-6 text-gray-500">
              当前重点：{meta.focus}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <span className={`rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] ${toneClass(dashboard.status === "ready" ? "positive" : dashboard.status === "partial" ? "warning" : "danger")}`}>
            {dashboard.status === "ready"
              ? "数据就绪"
              : dashboard.status === "partial"
                ? "部分就绪"
                : "待补数据"}
          </span>
          <span className="rounded-full border border-gray-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">
            {TIME_SCOPE_LABEL[appliedFilters.timeScope]}
          </span>
          <span className="rounded-full border border-gray-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">
            {BUSINESS_FILTER_LABEL[appliedFilters.businessFilter]}
          </span>
          <span className="rounded-full border border-gray-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">
            SNAPSHOT {snapshot.createdAt}
          </span>
        </div>
      </section>

      {warningMessages.length > 0 && (
        <section data-testid="v2-dashboard-filter-meta" className={`${CARD_CLASS} px-8 py-6`}>
          <div className="space-y-3">
            {warningMessages.map((item, index) => (
              <div
                key={`${item.text}-${index}`}
                className={`rounded-[1.25rem] border px-4 py-4 text-sm font-medium leading-7 ${toneClass(
                  item.tone,
                )}`}
              >
                {item.text}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={`${CARD_CLASS} px-8 py-8`}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {dashboard.cards.map((card) => (
            <div key={card.label} className={`rounded-[1.5rem] border px-5 py-5 ${toneClass(card.tone)}`}>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70">{card.label}</p>
              <p className="mt-3 text-3xl font-black tracking-tight">{card.value}</p>
              <p className="mt-2 text-sm font-medium leading-6 opacity-80">{card.hint}</p>
            </div>
          ))}
        </div>
      </section>

      <DashboardFocusSection payload={payload} meta={meta} />

      <section className={`${CARD_CLASS} px-8 py-8`}>
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
            图表区
          </p>
          <h2 className="text-2xl font-black tracking-tight text-gray-950">{meta.chartTitle}</h2>
          <p className="text-sm font-medium leading-7 text-gray-500">{meta.chartHint}</p>
        </div>

        {chartCards.length > 0 ? (
          <div className="mt-6 space-y-4">
            {chartCards.map((card) => (
              <div key={card.label} className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm font-medium text-gray-600">
                  <span>{card.label}</span>
                  <span className="font-black text-gray-950">{card.value}</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full ${
                      card.tone === "positive"
                        ? "bg-[#08E03B]"
                        : card.tone === "warning"
                          ? "bg-yellow-400"
                          : card.tone === "danger"
                            ? "bg-red-500"
                            : "bg-black"
                    }`}
                    style={{
                      width: `${Math.max(((card.numericValue || 0) / maxChartValue) * 100, 8)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-[1.25rem] border border-dashed border-gray-200 px-4 py-4 text-sm font-medium text-gray-500">
            当前这张看板还没有足够的数值型指标可用于对比图。
          </div>
        )}
      </section>

      {dashboard.notices.length > 0 && (
        <section className={`${CARD_CLASS} px-8 py-6`}>
          <div className="space-y-3">
            {dashboard.notices.slice(0, 1).map((notice) => (
              <div key={notice} className="rounded-[1.25rem] border border-gray-200 bg-gray-50 px-4 py-4 text-sm font-medium leading-7 text-gray-700">
                {notice}
              </div>
            ))}
          </div>
        </section>
      )}

      {dashboard.table && (
        <section className={`${CARD_CLASS} px-8 py-8`}>
          <div className="mb-6 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
              表格区
            </p>
            <h2 className="text-2xl font-black tracking-tight text-gray-950">{meta.tableTitle}</h2>
            <p className="text-sm font-medium leading-7 text-gray-500">{meta.tableHint}</p>
          </div>
          <div className="rounded-[1.5rem] border border-gray-100 bg-gray-50 px-5 py-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-black text-gray-950">
                  默认先收起明细表，避免首屏被大面积表头打断。
                </p>
                <p className="mt-2 text-sm font-medium leading-6 text-gray-500">
                  需要下钻时再展开，当前共 {dashboard.table.rows.length} 行明细。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTableExpanded((current) => !current)}
                className="inline-flex items-center gap-2 self-start rounded-full border border-gray-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-gray-600 transition hover:border-[#08E03B] hover:text-black"
              >
                <ChevronsUpDown size={14} />
                {tableExpanded ? "收起明细" : "展开明细"}
              </button>
            </div>
          </div>

          {tableExpanded && (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-3">
                <thead>
                  <tr>
                    {dashboard.table.columns.map((column) => (
                      <th
                        key={column}
                        className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.18em] text-gray-400"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dashboard.table.rows.map((row, rowIndex) => (
                    <tr key={`${rowIndex}-${row.join("-")}`} className="align-top">
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`${rowIndex}-${cellIndex}`}
                          className={`border-y border-gray-100 bg-gray-50 px-4 py-4 text-sm ${
                            cellIndex === 0
                              ? "rounded-l-[1.5rem] border-l font-black text-gray-950"
                              : cellIndex === row.length - 1
                                ? "rounded-r-[1.5rem] border-r text-gray-700"
                                : "text-gray-700"
                          }`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export function V2Workspace({
  onBackToHome,
  mode = "internal",
  initialDashboard,
  initialSnapshot = null,
}: {
  onBackToHome?: () => void;
  mode?: V2WorkspaceMode;
  initialDashboard?: V2DashboardType;
  initialSnapshot?: V2SnapshotRecord | null;
}) {
  const isFromHome = mode === "fromHome";
  const [snapshots, setSnapshots] = useState<V2SnapshotRecord[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [activeDashboard, setActiveDashboard] = useState<V2DashboardType>("overview");
  const [timeScope, setTimeScope] = useState<V2DashboardTimeScope>("current_snapshot");
  const [businessFilter, setBusinessFilter] = useState<V2DashboardBusinessFilter>("all");
  const [showAlertsPanel, setShowAlertsPanel] = useState(false);
  const [alerts, setAlerts] = useState<V2AlertItem[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsErrorMessage, setAlertsErrorMessage] = useState("");
  const [dashboardPayload, setDashboardPayload] = useState<V2DashboardResponse | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentSessionId, setAgentSessionId] = useState("");
  const [agentRoleLabel, setAgentRoleLabel] = useState("");
  const [agentMessages, setAgentMessages] = useState<AgentTimelineMessage[]>([]);
  const [agentFallback, setAgentFallback] = useState(false);
  const [agentTimedOut, setAgentTimedOut] = useState(false);
  const [agentEmptyContext, setAgentEmptyContext] = useState(false);
  const [agentQuestion, setAgentQuestion] = useState("");
  const [agentErrorMessage, setAgentErrorMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const activeSnapshot = useMemo(
    () => snapshots.find((item) => item.id === selectedSnapshotId) || null,
    [selectedSnapshotId, snapshots],
  );
  const activeDashboardMeta = useMemo(
    () => DASHBOARD_META.find((item) => item.type === activeDashboard) || DASHBOARD_META[0],
    [activeDashboard],
  );
  const effectiveTimeScope =
    dashboardPayload?.appliedFilters.timeScope || timeScope;
  const effectiveBusinessFilter =
    dashboardPayload?.appliedFilters.businessFilter || businessFilter;
  const alertCount = alerts.length || activeSnapshot?.alerts.length || 0;

  const resetAgent = () => {
    setAgentSessionId("");
    setAgentRoleLabel("");
    setAgentMessages([]);
    setAgentFallback(false);
    setAgentTimedOut(false);
    setAgentEmptyContext(false);
    setAgentQuestion("");
    setAgentErrorMessage("");
  };

  const loadSnapshots = async (focusSnapshotId?: string) => {
    const { response, payload } = await fetchJsonWithTimeout("/api/snapshot/list");
    if (!response.ok) {
      throw new Error((payload as { error?: string } | null)?.error || "读取快照列表失败。");
    }
    const nextSnapshots =
      (((payload as { snapshots?: V2SnapshotRecord[] } | null)?.snapshots) || []) as V2SnapshotRecord[];
    setSnapshots(nextSnapshots);
    if (!nextSnapshots.length) {
      setSelectedSnapshotId("");
      setDashboardPayload(null);
      setAlerts([]);
      return;
    }
    if (focusSnapshotId && nextSnapshots.some((item) => item.id === focusSnapshotId)) {
      setSelectedSnapshotId(focusSnapshotId);
    } else if (!selectedSnapshotId && nextSnapshots[0]) {
      setSelectedSnapshotId(nextSnapshots[0].id);
    } else if (
      selectedSnapshotId &&
      !nextSnapshots.some((item) => item.id === selectedSnapshotId)
    ) {
      setSelectedSnapshotId(nextSnapshots[0].id);
    }
  };

  const loadAlerts = async (snapshotId: string) => {
    setAlertsLoading(true);
    try {
      const query = new URLSearchParams({ snapshotId });
      const { response, payload } = await fetchJsonWithTimeout(
        `/api/alert/list?${query.toString()}`,
      );
      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error || "读取预警失败。");
      }
      setAlerts((((payload as { alerts?: V2AlertItem[] } | null)?.alerts) || []) as V2AlertItem[]);
      setAlertsErrorMessage("");
    } catch (error) {
      setAlerts([]);
      setAlertsErrorMessage(
        toFriendlyWorkspaceErrorMessage(error, "读取预警失败，请稍后重试。"),
      );
    } finally {
      setAlertsLoading(false);
    }
  };

  const fetchDashboard = async (
    snapshotId: string,
    dashboardType: V2DashboardType,
    filters: {
      timeScope: V2DashboardTimeScope;
      businessFilter: V2DashboardBusinessFilter;
    },
  ) => {
    setDashboardLoading(true);
    try {
      const routeByDashboard: Record<V2DashboardType, string> = {
        overview: "/api/dashboard/overview",
        content: "/api/dashboard/content",
        ads: "/api/dashboard/ads",
        sales: "/api/dashboard/sales",
        super_subscription: "/api/dashboard/super-subscription",
        flexible_subscription: "/api/dashboard/flexible-subscription",
      };
      const query = new URLSearchParams({
        snapshotId,
        timeScope: filters.timeScope,
        businessFilter: filters.businessFilter,
      });
      const { response, payload } = await fetchJsonWithTimeout(
        `${routeByDashboard[dashboardType]}?${query.toString()}`,
      );
      if (!response.ok || !payload || !("dashboard" in payload)) {
        throw new Error(
          (payload && "error" in payload && payload.error) || "读取看板失败。",
        );
      }
      setErrorMessage("");
      setDashboardPayload(payload);
    } catch (error) {
      setDashboardPayload(null);
      throw new Error(
        toFriendlyWorkspaceErrorMessage(
          error,
          "当前快照暂时不可用，请重新生成分析会话或切换其他快照。",
        ),
      );
    } finally {
      setDashboardLoading(false);
    }
  };

  useEffect(() => {
    void loadSnapshots().catch((error: Error) =>
      setErrorMessage(
        toFriendlyWorkspaceErrorMessage(error, "读取快照列表失败，请稍后重试。"),
      ),
    );
  }, []);

  useEffect(() => {
    if (!selectedSnapshotId) return;
    void fetchDashboard(selectedSnapshotId, activeDashboard, {
      timeScope,
      businessFilter,
    }).catch((error: Error) =>
      setErrorMessage(
        toFriendlyWorkspaceErrorMessage(
          error,
          "当前快照暂时不可用，请重新生成分析会话或切换其他快照。",
        ),
      ),
    );
  }, [selectedSnapshotId, activeDashboard, timeScope, businessFilter]);

  useEffect(() => {
    if (!selectedSnapshotId) {
      setAlerts([]);
      setAlertsErrorMessage("");
      return;
    }
    void loadAlerts(selectedSnapshotId);
  }, [selectedSnapshotId]);

  useEffect(() => {
    resetAgent();
  }, [selectedSnapshotId, activeDashboard, timeScope, businessFilter]);

  useEffect(() => {
    if (!isFromHome || !initialSnapshot || !initialDashboard) {
      return;
    }

    setSnapshots((current) =>
      current.some((item) => item.id === initialSnapshot.id)
        ? current
        : [initialSnapshot, ...current],
    );
    setSelectedSnapshotId(initialSnapshot.id);
    setActiveDashboard(initialDashboard);
    setDashboardPayload(null);
  }, [initialDashboard, initialSnapshot, isFromHome]);

  const handleOpenAgent = async () => {
    if (!selectedSnapshotId) return;
    setAgentOpen(true);
    if (agentSessionId || agentLoading) return;
    const hasAgentContext = Boolean(
      dashboardPayload?.dashboard?.agentContext &&
        Object.keys(dashboardPayload.dashboard.agentContext).length > 0,
    );
    if (!hasAgentContext) {
      setAgentEmptyContext(true);
      return;
    }
    setAgentEmptyContext(false);
    setAgentTimedOut(false);
    setAgentErrorMessage("");
    setAgentLoading(true);
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 12000);
      const { response, payload } = await fetchJsonWithTimeout(
        "/api/agent/analyze",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            snapshotId: selectedSnapshotId,
            dashboardType: activeDashboard,
            timeScope: effectiveTimeScope,
            businessFilter: effectiveBusinessFilter,
          }),
          signal: controller.signal,
        },
        12000,
      );
      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error || "读取 Agent 分析失败。");
      }
      const agentPayload = payload as {
        sessionId?: string;
        roleLabel?: string;
        content?: string;
        fallback?: boolean;
      };
      setAgentSessionId(agentPayload.sessionId || "");
      setAgentRoleLabel(agentPayload.roleLabel || "");
      setAgentMessages(
        agentPayload.content
          ? [{ role: "assistant", content: agentPayload.content }]
          : [],
      );
      setAgentFallback(Boolean(agentPayload.fallback));
    } catch (error: any) {
      if (
        error?.name === "AbortError" ||
        (error instanceof Error && error.message.includes("请求超时"))
      ) {
        setAgentTimedOut(true);
        return;
      }
      setAgentErrorMessage(error.message || "读取 Agent 分析失败。");
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setAgentLoading(false);
    }
  };

  const handleAgentFollowup = async () => {
    if (!agentSessionId || !agentQuestion.trim()) return;
    const question = agentQuestion.trim();
    setAgentMessages((current) => [...current, { role: "user", content: question }]);
    setAgentQuestion("");
    setAgentTimedOut(false);
    setAgentErrorMessage("");
    setAgentLoading(true);
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 12000);
      const { response, payload } = await fetchJsonWithTimeout(
        "/api/agent/followup",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: agentSessionId,
            userQuestion: question,
            timeScope: effectiveTimeScope,
            businessFilter: effectiveBusinessFilter,
          }),
          signal: controller.signal,
        },
        12000,
      );
      if (!response.ok) {
        throw new Error((payload as { error?: string } | null)?.error || "追问失败。");
      }
      const agentPayload = payload as {
        content?: string;
        roleLabel?: string;
        fallback?: boolean;
      };
      setAgentMessages((current) => [
        ...current,
        { role: "assistant", content: agentPayload.content || "" },
      ]);
      setAgentRoleLabel(agentPayload.roleLabel || agentRoleLabel);
      setAgentFallback(Boolean(agentPayload.fallback));
    } catch (error: any) {
      if (
        error?.name === "AbortError" ||
        (error instanceof Error && error.message.includes("请求超时"))
      ) {
        setAgentTimedOut(true);
        return;
      }
      setAgentErrorMessage(error.message || "追问失败。");
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setAgentLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-[#1D1D1F] font-sans selection:bg-[#08E03B]/30 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none overflow-hidden z-0">
        <svg width="100%" height="100%">
          <pattern id="zigzag-v2-shell" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M0 20L10 10L20 20L30 10L40 20" fill="none" stroke="black" strokeWidth="2" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#zigzag-v2-shell)" />
        </svg>
      </div>
      <nav className="fixed top-0 z-50 flex w-full items-center justify-between border-b border-gray-100 bg-white/90 px-6 py-5 backdrop-blur-xl md:px-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-black">
              <span className="text-xl font-black text-[#08E03B]">[ ]</span>
            </div>
            <div className="flex flex-col -space-y-1">
              <span className="text-xl font-black uppercase italic tracking-tighter">SUPEREV</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">
                Marketing Assistant
              </span>
            </div>
          </div>
        </div>
        <div className="hidden items-center gap-10 text-[11px] font-black uppercase tracking-widest text-gray-400 md:flex">
          <span className="text-black">V2.0 Workspace</span>
          <span>看板视图</span>
          <span>六套 Agent</span>
        </div>
        <div className="flex items-center gap-3">
          {onBackToHome && (
            <button
              type="button"
              onClick={onBackToHome}
              className="rounded-full border border-gray-200 bg-white px-5 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-gray-500 transition hover:border-[#08E03B] hover:text-black"
            >
              返回上传首页
            </button>
          )}
          <span className="rounded-full border border-[#08E03B]/20 bg-[#08E03B]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#067b21]">
            闭环分析工作台 2.0
          </span>
        </div>
      </nav>

      <main className="relative z-10 mx-auto flex max-w-7xl gap-8 px-6 pb-20 pt-28 md:px-8">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className={`${CARD_CLASS} sticky top-28 px-5 py-5`}>
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                V2 导航
              </p>
              {DASHBOARD_META.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  data-testid={`v2-dashboard-nav-${item.type}`}
                  onClick={() => setActiveDashboard(item.type)}
                  className={`mt-2 flex w-full items-center justify-between rounded-[1.25rem] border px-4 py-4 text-left transition ${
                    activeDashboard === item.type
                      ? "border-black bg-black text-white shadow-[0_10px_30px_rgba(0,0,0,0.16)]"
                      : "border-gray-200 bg-white text-gray-500 hover:border-[#08E03B]/40 hover:text-black hover:-translate-y-0.5"
                  }`}
                >
                  <div>
                    <p className="text-sm font-black">{item.label}</p>
                    <p className={`mt-1 text-[10px] font-black uppercase tracking-[0.14em] ${activeDashboard === item.type ? "text-[#08E03B]" : "opacity-60"}`}>
                      {item.agent}
                    </p>
                  </div>
                  <PanelLeft size={16} />
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-8">
          <section className={`${CARD_CLASS} px-8 py-8`}>
            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
              <div className="space-y-3">
                <p className="inline-flex rounded-full bg-black px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#08E03B]">
                  V2 WORKSPACE
                </p>
                <h1 className="text-5xl font-black tracking-tight text-gray-950">
                  {activeDashboardMeta.label}
                </h1>
                <p className="max-w-2xl text-sm font-medium leading-7 text-gray-600">
                  从首页进入后，这里只负责快照切换、看板浏览、预警查看和 Agent 分析。
                </p>
              </div>
              <div className="rounded-[1.75rem] border border-gray-100 bg-gray-50 px-5 py-5 xl:min-w-[360px]">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                  首屏状态
                </p>
                <p className="mt-3 text-lg font-black tracking-tight text-gray-950">
                  {activeSnapshot ? "已从首页进入当前看板" : "等待首页分析完成"}
                </p>
                <p className="mt-2 text-sm font-medium leading-6 text-gray-500">
                  {activeSnapshot
                    ? `${activeDashboardMeta.label} 已绑定当前快照，可直接浏览和追问 Agent。`
                    : "请先回首页完成上传和分析。"}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <span className="rounded-full border border-gray-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-gray-600">
                {selectedSnapshotId ? "已加载快照" : "等待快照"}
              </span>
              <span className="rounded-full border border-gray-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-gray-600">
                {activeDashboardMeta.label}
              </span>
              <span className="rounded-full border border-gray-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-gray-600">
                {snapshots.length > 0 ? `${snapshots.length} 个快照可切换` : "暂无可用快照"}
              </span>
            </div>
          </section>

          <section className={`${CARD_CLASS} px-8 py-8`}>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                  CONTROL STRIP
                </p>
                <h2 className="text-2xl font-black tracking-tight text-gray-950">
                  筛选与快照
                </h2>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  data-testid="v2-alerts-toggle"
                  onClick={() => setShowAlertsPanel((current) => !current)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em] transition ${
                    showAlertsPanel
                      ? "border-[#08E03B] bg-[#08E03B]/10 text-black"
                      : "border-gray-200 bg-white text-gray-600 hover:border-[#08E03B] hover:text-black"
                  }`}
                >
                  <BellRing size={16} />
                  预警入口
                  <span className="rounded-full bg-black px-2 py-1 text-[9px] text-[#08E03B]">
                    {alertCount}
                  </span>
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_1.1fr_1.3fr_auto]">
              <label className="rounded-[1.25rem] border border-gray-200 bg-white px-4 py-4">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
                  <Filter size={14} />
                  时间范围
                </p>
                <select
                  data-testid="v2-time-scope-select"
                  value={timeScope}
                  onChange={(event) =>
                    setTimeScope(event.target.value as V2DashboardTimeScope)
                  }
                  className="mt-3 w-full bg-transparent text-sm font-black text-gray-950 outline-none"
                >
                  <option value="current_snapshot">当前快照</option>
                  <option value="last_7_days">最近 7 天视角</option>
                  <option value="current_cycle">当前周期视角</option>
                </select>
              </label>

              <label className="rounded-[1.25rem] border border-gray-200 bg-white px-4 py-4">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
                  <Layers3 size={14} />
                  业务线
                </p>
                <select
                  data-testid="v2-business-filter-select"
                  value={businessFilter}
                  onChange={(event) =>
                    setBusinessFilter(
                      event.target.value as V2DashboardBusinessFilter,
                    )
                  }
                  className="mt-3 w-full bg-transparent text-sm font-black text-gray-950 outline-none"
                >
                  <option value="all">全部业务线</option>
                  <option value="super">超级订阅</option>
                  <option value="flexible">灵活订阅</option>
                </select>
              </label>

              <div className="rounded-[1.25rem] border border-gray-200 bg-white px-4 py-4">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
                  <History size={14} />
                  快照切换
                </p>
                <div className="mt-3 flex gap-3">
                  <select
                    data-testid="v2-snapshot-select"
                    value={selectedSnapshotId}
                    onChange={(event) => setSelectedSnapshotId(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm font-black text-gray-950 outline-none"
                  >
                    <option value="">选择快照</option>
                    {snapshots.map((snapshot) => (
                      <option key={snapshot.id} value={snapshot.id}>
                        {snapshot.createdAt}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void loadSnapshots()}
                    className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-gray-600 transition hover:border-[#08E03B] hover:text-black"
                  >
                    <ChevronsUpDown size={14} />
                    刷新
                  </button>
                </div>
                <p className="mt-2 text-xs font-medium leading-6 text-gray-500">
                  切到新快照后，六看板和 Agent 会同步刷新，不保留旧结果。
                </p>
              </div>

            </div>
          </section>

          {errorMessage && (
            <section className="rounded-[1.5rem] border border-red-200 bg-red-50 px-5 py-5 text-sm font-bold text-red-700">
              {errorMessage}
            </section>
          )}

          <section className={`${CARD_CLASS} px-8 py-6`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm font-medium leading-7 text-gray-500">
                这里只保留看板、快照、预警和 Agent。
              </p>
            </div>
          </section>

          <section className={`${CARD_CLASS} px-8 py-8`}>
            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr] xl:items-end">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                  当前看板
                </p>
                <h2 className="mt-2 text-4xl font-black tracking-tight text-gray-950">
                  {activeDashboardMeta.label}
                </h2>
                <p className="mt-2 max-w-3xl text-sm font-medium leading-7 text-gray-500">
                  {activeDashboardMeta.atmosphere}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleOpenAgent()}
                className="inline-flex items-center gap-3 rounded-full bg-black px-5 py-4 text-[10px] font-black uppercase tracking-[0.16em] text-[#08E03B] transition hover:shadow-[0_12px_30px_rgba(0,0,0,0.18)] xl:justify-self-end"
              >
                <Bot size={16} />
                打开 {activeDashboardMeta.agent}
              </button>
            </div>

            {showAlertsPanel && (
              <div data-testid="v2-alerts-panel" className="mt-6 grid gap-3 md:grid-cols-2">
                {alertsLoading ? (
                  <div className="rounded-[1.25rem] border border-gray-200 bg-gray-50 px-4 py-4 text-sm font-medium text-gray-500">
                    正在读取当前 snapshot 的预警结果...
                  </div>
                ) : alertsErrorMessage ? (
                  <div className="rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-4 text-sm font-medium text-red-700">
                    {alertsErrorMessage}
                  </div>
                ) : alerts.length > 0 ? (
                  alerts.map((alert) => (
                    <div
                      key={`${alert.level}-${alert.title}`}
                      className={`rounded-[1.25rem] border px-4 py-4 text-sm font-medium ${toneClass(alert.level === "red" ? "danger" : "warning")}`}
                    >
                      <div className="flex items-center gap-2 font-black">
                        {alert.level === "red" ? <ShieldAlert size={16} /> : <AlertCircle size={16} />}
                        {alert.title}
                      </div>
                      <p className="mt-2 leading-6">{alert.description}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.25rem] border border-dashed border-gray-200 px-4 py-4 text-sm font-medium text-gray-500">
                    当前快照还没有预警项，预警入口保留但不抢主视觉。
                  </div>
                )}
              </div>
            )}
          </section>

          {dashboardLoading ? (
            <div className={`${CARD_CLASS} px-8 py-10 text-sm font-medium text-gray-500`}>
              正在加载当前看板...
            </div>
          ) : (
            <DashboardView payload={dashboardPayload} meta={activeDashboardMeta} />
          )}
        </div>
      </main>

      <footer className="fixed bottom-10 left-10 z-40 hidden items-center gap-6 pointer-events-none xl:flex">
        <div className="rounded-sm bg-black px-5 py-2 text-[9px] font-black uppercase italic tracking-[0.3em] text-[#08E03B]">
          SUPEREV INTEL 2026
        </div>
        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-gray-300">
          <div className="h-[1px] w-12 bg-gray-100" />
          Driven by SUPEREV
        </div>
      </footer>

      <button
        type="button"
        onClick={() => void handleOpenAgent()}
        className="fixed bottom-8 right-8 z-50 inline-flex items-center gap-3 rounded-full bg-black px-6 py-4 text-[10px] font-black uppercase tracking-[0.16em] text-[#08E03B] transition hover:shadow-[0_12px_30px_rgba(0,0,0,0.18)]"
      >
        <Bot size={16} />
        打开 Agent
      </button>

      {agentOpen && (
        <div className="fixed inset-0 z-[60] bg-black/20">
          <div
            data-testid="v2-agent-drawer"
            className="absolute right-0 top-0 h-full w-full max-w-xl border-l border-gray-100 bg-white px-6 py-6 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                  当前 Agent
                </p>
                <p
                  data-testid="v2-agent-name"
                  className="mt-2 text-2xl font-black tracking-tight text-gray-950"
                >
                  {DASHBOARD_META.find((item) => item.type === activeDashboard)?.agent || "Agent"}
                </p>
                <p className="mt-1 text-sm font-medium text-gray-500">
                  {agentRoleLabel || activeDashboardMeta.role}
                </p>
                <p className="mt-1 text-xs font-medium text-gray-400">
                  当前看板：{activeDashboardMeta.label}
                  {selectedSnapshotId ? ` / snapshot ${selectedSnapshotId}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAgentOpen(false)}
                className="rounded-full border border-gray-200 px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-gray-500 transition hover:border-[#08E03B] hover:text-black"
              >
                关闭
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <span className="rounded-full border border-[#08E03B]/20 bg-[#08E03B]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#067b21]">
                {activeDashboardMeta.label}
              </span>
              <span className="rounded-full border border-gray-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">
                {TIME_SCOPE_LABEL[effectiveTimeScope]}
              </span>
              <span className="rounded-full border border-gray-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">
                {BUSINESS_FILTER_LABEL[effectiveBusinessFilter]}
              </span>
              <span
                className={`rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] ${
                  agentLoading
                    ? toneClass("warning")
                    : agentTimedOut
                      ? toneClass("danger")
                      : agentEmptyContext
                        ? toneClass("warning")
                    : agentFallback
                      ? toneClass("warning")
                      : agentErrorMessage
                        ? toneClass("danger")
                      : toneClass("positive")
                }`}
              >
                {agentLoading
                  ? "加载中"
                  : agentTimedOut
                    ? "超时"
                    : agentEmptyContext
                      ? "空上下文"
                    : agentFallback
                      ? "降级输出"
                      : agentErrorMessage
                        ? "分析异常"
                      : "在线分析"}
              </span>
              <button
                type="button"
                onClick={() => {
                  resetAgent();
                  void handleOpenAgent();
                }}
                disabled={agentLoading}
                className="rounded-full border border-gray-200 px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-gray-500 transition hover:border-[#08E03B] hover:text-black disabled:opacity-40"
              >
                重新分析
              </button>
            </div>

            {agentFallback && !agentLoading && (
              <div className="mt-4 rounded-[1.25rem] border border-yellow-200 bg-yellow-50 px-4 py-4 text-sm font-medium leading-6 text-yellow-800">
                当前为离线降级分析，先给出可读结论；模型或更多数据到位后会自动升级。
              </div>
            )}

            {agentTimedOut && !agentLoading && (
              <div className="mt-4 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-4 text-sm font-medium leading-6 text-red-700">
                当前 Agent 响应超时。你可以重试一次，或者先基于当前看板继续人工判断。
              </div>
            )}

            {agentErrorMessage && !agentLoading && (
              <div className="mt-4 rounded-[1.25rem] border border-red-200 bg-red-50 px-4 py-4 text-sm font-medium leading-6 text-red-700">
                {agentErrorMessage}
              </div>
            )}

            {agentEmptyContext && !agentLoading && (
              <div className="mt-4 rounded-[1.25rem] border border-gray-200 bg-gray-50 px-4 py-4 text-sm font-medium leading-6 text-gray-600">
                当前看板上下文还不完整，Agent 暂时没有足够信息开始分析。请先回首页完成分析，或切到已有快照。
              </div>
            )}

            <div className="mt-6 h-[calc(100%-12rem)] overflow-y-auto rounded-[1.5rem] border border-gray-100 bg-gray-50 px-5 py-5">
              {agentMessages.length === 0 && !agentLoading ? (
                <p className="text-sm font-medium leading-7 text-gray-700 whitespace-pre-wrap">
                  {agentTimedOut
                    ? "这次请求没有在预期时间内返回结果。"
                    : agentEmptyContext
                      ? "当前还没有可用于分析的看板上下文。"
                      : "Agent 将基于当前看板和同一份 snapshot 做分析。"}
                </p>
              ) : (
                <div className="space-y-4">
                  {agentMessages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`rounded-[1.25rem] px-4 py-4 text-sm font-medium leading-7 whitespace-pre-wrap ${
                        message.role === "assistant"
                          ? "border border-gray-100 bg-white text-gray-700"
                          : "border border-black bg-black text-white"
                      }`}
                    >
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-60">
                        {message.role === "assistant"
                          ? DASHBOARD_META.find((item) => item.type === activeDashboard)?.agent || "Agent"
                          : "你"}
                      </p>
                      <div className="mt-2">{message.content}</div>
                    </div>
                  ))}
                  {agentLoading && (
                    <div className="rounded-[1.25rem] border border-gray-100 bg-white px-4 py-4 text-sm font-medium leading-7 text-gray-700">
                      正在读取 Agent 分析...
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 flex gap-3">
              <textarea
                data-testid="v2-agent-input"
                value={agentQuestion}
                onChange={(event) => setAgentQuestion(event.target.value)}
                placeholder="继续追问当前看板..."
                rows={3}
                className="min-h-[72px] flex-1 rounded-[1.25rem] border border-gray-200 px-4 py-3 text-sm font-medium text-gray-900 outline-none transition focus:border-[#08E03B]"
                disabled={agentLoading || agentEmptyContext || !agentSessionId}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    void handleAgentFollowup();
                  }
                }}
              />
              <button
                type="button"
                data-testid="v2-agent-send"
                onClick={() => void handleAgentFollowup()}
                disabled={agentLoading || agentEmptyContext || !agentSessionId || !agentQuestion.trim()}
                className="inline-flex items-center gap-2 self-end rounded-full bg-[#08E03B] px-5 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-black transition disabled:opacity-40"
              >
                <Send size={14} />
                发送
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
