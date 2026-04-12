import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type { MarketingDashboardData, MarketingInput } from "./marketing-engine";

export type DashboardData = MarketingDashboardData;
export type NormalizedInput = MarketingInput;

export interface Insight {
  type: "anomaly" | "opportunity" | "risk";
  title: string;
  description: string;
  metric: string;
  value: number | string;
  severity: "low" | "medium" | "high";
}

export interface InsightResult {
  anomalies: Insight[];
  opportunities: Insight[];
  risks: Insight[];
  topFindings: string[];
}

const EMPTY_INSIGHT_RESULT = (): InsightResult => ({
  anomalies: [],
  opportunities: [],
  risks: [],
  topFindings: [],
});

const isInsightType = (value: unknown): value is Insight["type"] =>
  value === "anomaly" || value === "opportunity" || value === "risk";

const isSeverity = (value: unknown): value is Insight["severity"] =>
  value === "low" || value === "medium" || value === "high";

const isProduction = () => process.env.NODE_ENV === "production";

const DEFAULT_LOCAL_OPENAI_MODEL = "gpt-5.4";
const DEFAULT_PRODUCTION_OPENAI_MODEL = "claude-sonnet-4-5-20250929-thinking";
const DEFAULT_PRODUCTION_OPENAI_BASE_URL = "https://yunwu.ai/v1";
const readEnv = (value?: string) => value?.trim() || undefined;
const getOpenAiApiKey = () =>
  isProduction()
    ? readEnv(process.env.YUNWU_API_KEY) || readEnv(process.env.OPENAI_API_KEY)
    : readEnv(process.env.OPENAI_API_KEY);
const getOpenAiModel = () =>
  isProduction()
    ? readEnv(process.env.YUNWU_MODEL) ||
      readEnv(process.env.OPENAI_MODEL) ||
      DEFAULT_PRODUCTION_OPENAI_MODEL
    : readEnv(process.env.OPENAI_MODEL) || DEFAULT_LOCAL_OPENAI_MODEL;
const getOpenAiBaseUrl = () =>
  isProduction()
    ? readEnv(process.env.YUNWU_BASE_URL) ||
      readEnv(process.env.OPENAI_BASE_URL) ||
      DEFAULT_PRODUCTION_OPENAI_BASE_URL
    : readEnv(process.env.OPENAI_BASE_URL);
const getGeminiModel = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";
const getSiliconFlowBaseUrl = () => process.env.SILICONFLOW_BASE_URL || "https://api.siliconflow.cn/v1";
const getSiliconFlowModel = () => process.env.SILICONFLOW_MODEL || "Qwen/Qwen3.5-397B-A17B";

const safeJsonParse = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1]);
    }
    throw new Error("AI 洞察结果不是有效 JSON。");
  }
};

const toInsightValue = (value: unknown): number | string => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (value === null || value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const normalizeInsight = (input: unknown, fallbackType: Insight["type"]): Insight | null => {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const description = typeof candidate.description === "string" ? candidate.description.trim() : "";
  const metric = typeof candidate.metric === "string" ? candidate.metric.trim() : "";

  if (!title || !description || !metric) {
    return null;
  }

  return {
    type: isInsightType(candidate.type) ? candidate.type : fallbackType,
    title,
    description,
    metric,
    value: toInsightValue(candidate.value),
    severity: isSeverity(candidate.severity) ? candidate.severity : "medium",
  };
};

const normalizeInsightList = (input: unknown, fallbackType: Insight["type"]) => {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => normalizeInsight(item, fallbackType))
    .filter((item): item is Insight => Boolean(item))
    .slice(0, 5);
};

const deriveTopFindings = (result: Omit<InsightResult, "topFindings">) =>
  [...result.anomalies, ...result.opportunities, ...result.risks]
    .map((item) => item.title)
    .filter(Boolean)
    .slice(0, 3);

const normalizeInsightResult = (input: unknown): InsightResult => {
  if (!input || typeof input !== "object") {
    return EMPTY_INSIGHT_RESULT();
  }

  const candidate = input as Record<string, unknown>;
  const normalized = {
    anomalies: normalizeInsightList(candidate.anomalies, "anomaly"),
    opportunities: normalizeInsightList(candidate.opportunities, "opportunity"),
    risks: normalizeInsightList(candidate.risks, "risk"),
  };

  const topFindings = Array.isArray(candidate.topFindings)
    ? candidate.topFindings
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 3)
    : deriveTopFindings(normalized);

  return {
    ...normalized,
    topFindings,
  };
};

const buildInsightPrompt = (dashboard: DashboardData, normalizedInput: NormalizedInput) => `
你是 SUPEREV 营销数据分析师，拥有10年汽车行业营销经验。

我已经完成了数据的结构化计算，现在需要你做真正的业务洞察。

【你的任务】
基于以下营销数据，找出：
1. 异常指标（和正常范围偏差 > 20% 的）
2. 趋势变化（如果有环比或前期数据，判断哪些在变好、哪些在变差，并归类进异常 / 机会 / 风险）
3. 最值得关注的机会点（ROI 最高、潜力最大的）
4. 需要立即处理的风险（可能影响成交的）

【分析边界】
1. 只能使用我提供的数据，不能补造渠道、时间序列、成交周期等不存在的维度。
2. 如果数据不足以支持某条判断，就不要输出这条洞察。
3. 优先关注实际影响成交和预算效率的问题，不要泛泛而谈。
4. 如果发现明显不合理的数据（例如转化率 > 100%、分项之和对不上总数），按异常处理。

【汽车行业参考基准】
- 线索转化率正常范围：15%-35%
- 试驾转化率正常范围：40%-60%
- 成交周期正常范围：7-21天
- 单条线索成本正常范围：200-800元

【输出格式】
严格返回 JSON，结构如下：
{
  "anomalies": [
    {
      "type": "anomaly",
      "title": "一句话标题",
      "description": "详细说明",
      "metric": "指标名",
      "value": 123,
      "severity": "high"
    }
  ],
  "opportunities": [
    {
      "type": "opportunity",
      "title": "一句话标题",
      "description": "详细说明",
      "metric": "指标名",
      "value": "灵活订阅",
      "severity": "medium"
    }
  ],
  "risks": [
    {
      "type": "risk",
      "title": "一句话标题",
      "description": "详细说明",
      "metric": "指标名",
      "value": "当前值",
      "severity": "high"
    }
  ],
  "topFindings": ["发现1", "发现2", "发现3"]
}

不要加任何解释，只返回 JSON。

【结构化计算结果 dashboard】
${JSON.stringify(dashboard, null, 2)}

【原始标准化输入 normalizedInput】
${JSON.stringify(normalizedInput, null, 2)}
`;

const tryOpenAiInsights = async (prompt: string) => {
  const openai = new OpenAI({
    apiKey: getOpenAiApiKey(),
    baseURL: getOpenAiBaseUrl(),
  });
  const response = await openai.chat.completions.create({
    model: getOpenAiModel(),
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
  });
  const text = response.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenAI 没有返回 AI 洞察结果。");
  }
  return normalizeInsightResult(safeJsonParse(text));
};

const tryGeminiInsights = async (prompt: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: getGeminiModel(),
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
    } as any,
  });
  const text = response.text?.trim();
  if (!text) {
    throw new Error("Gemini 没有返回 AI 洞察结果。");
  }
  return normalizeInsightResult(safeJsonParse(text));
};

const trySiliconFlowInsights = async (prompt: string) => {
  const siliconflow = new OpenAI({
    apiKey: process.env.SILICONFLOW_API_KEY,
    baseURL: getSiliconFlowBaseUrl(),
  });
  const response = await siliconflow.chat.completions.create({
    model: getSiliconFlowModel(),
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
  });
  const text = response.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("SiliconFlow 没有返回 AI 洞察结果。");
  }
  return normalizeInsightResult(safeJsonParse(text));
};

export async function generateInsights(
  dashboard: DashboardData,
  normalizedInput: NormalizedInput,
): Promise<InsightResult> {
  const prompt = buildInsightPrompt(dashboard, normalizedInput);
  const attempts: Array<{ enabled: boolean; run: () => Promise<InsightResult> }> = [
    { enabled: Boolean(getOpenAiApiKey()), run: () => tryOpenAiInsights(prompt) },
    { enabled: Boolean(process.env.GEMINI_API_KEY), run: () => tryGeminiInsights(prompt) },
    { enabled: Boolean(process.env.SILICONFLOW_API_KEY), run: () => trySiliconFlowInsights(prompt) },
  ];

  let lastError: unknown = null;

  for (const attempt of attempts) {
    if (!attempt.enabled) {
      continue;
    }

    try {
      return await attempt.run();
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.error("AI insight generation failed, using empty insight result:", lastError);
  }

  return EMPTY_INSIGHT_RESULT();
}

export const appendInsightsToReportPrompt = (basePrompt: string, insights: InsightResult) => {
  const hasInsights =
    insights.topFindings.length > 0 ||
    insights.anomalies.length > 0 ||
    insights.opportunities.length > 0 ||
    insights.risks.length > 0;

  if (!hasInsights) {
    return `${basePrompt}

<AI洞察层>
本轮 AI 洞察层没有返回有效结果。请继续只基于结构化数据写报告，不要补造新的异常、机会点或风险预警。
</AI洞察层>
`;
  }

  return `${basePrompt}

<AI洞察层>
以下 JSON 是第4步 AI 洞察层的结果。你可以优先解释这些发现，但不能和结构化数据冲突，也不能额外编造没有证据的洞察。
${JSON.stringify(insights, null, 2)}
</AI洞察层>
`;
};
