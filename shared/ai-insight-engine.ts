import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type { MarketingDashboardData, MarketingInput } from "./marketing-engine";
import {
  clipText,
  isTimeoutError,
  summarizeError,
  withTimeout,
} from "./async-utils";

export type DashboardData = MarketingDashboardData;
export type NormalizedInput = MarketingInput;

export interface Insight {
  type: "anomaly" | "opportunity" | "risk";
  title: string;
  description: string;
  metric: string;
  value: number | string;
  severity: "low" | "medium" | "high";
  benchmark?: string;
  action?: string;
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

export const createEmptyInsightResult = () => EMPTY_INSIGHT_RESULT();

const isInsightType = (value: unknown): value is Insight["type"] =>
  value === "anomaly" || value === "opportunity" || value === "risk";

const isSeverity = (value: unknown): value is Insight["severity"] =>
  value === "low" || value === "medium" || value === "high";

const isProduction = () => process.env.NODE_ENV === "production";

const DEFAULT_LOCAL_OPENAI_MODEL = "gpt-5.4";
const DEFAULT_PRODUCTION_OPENAI_MODEL = "claude-sonnet-4-5-20250929-thinking";
const DEFAULT_PRODUCTION_OPENAI_BASE_URL = "https://yunwu.ai/v1";
const DEFAULT_INSIGHT_TIMEOUT_MS = Number(process.env.AI_INSIGHTS_TIMEOUT_MS) || 12_000;
const AI_INSIGHT_LOG_PREVIEW_LIMIT = 500;

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

const extractFirstJsonObject = (text: string) => {
  let startIndex = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (startIndex === -1) {
      if (char === "{") {
        startIndex = index;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return "";
};

const safeJsonParse = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    const fenced =
      text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1]);
    }

    const firstJsonObject = extractFirstJsonObject(text);
    if (firstJsonObject) {
      return JSON.parse(firstJsonObject);
    }

    throw new Error("AI 洞察结果不是有效 JSON。");
  }
};

const logInsightAttemptFailure = ({
  provider,
  model,
  reason,
  text = "",
}: {
  provider: string;
  model: string;
  reason: string;
  text?: string;
}) => {
  console.warn(
    "[ai-insights]",
    JSON.stringify({
      provider,
      model,
      reason,
      responseLength: text.length,
      responsePreview: text ? clipText(text, AI_INSIGHT_LOG_PREVIEW_LIMIT) : "",
    }),
  );
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

const toOptionalText = (value: unknown) => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
};

const normalizeInsight = (input: unknown, fallbackType: Insight["type"]): Insight | null => {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as Record<string, unknown>;
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const description =
    typeof candidate.description === "string" ? candidate.description.trim() : "";
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
    benchmark: toOptionalText(candidate.benchmark),
    action: toOptionalText(candidate.action),
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
你是 SUPEREV 的首席营销数据科学家，具备以下能力：

【身份与能力设定】
- 10年以上汽车行业营销经验，覆盖传统燃油车、新能源、汽车订阅、融资租赁、出行服务等细分赛道
- 熟悉中国、北美、欧洲三大市场的获客成本与转化效率差异
- 掌握 MECE 分析框架、漏斗归因模型、LTV/CAC 比率分析、渠道组合优化方法
- 能够基于你的训练数据与行业知识，自主判断当前数据与行业真实水平的偏差
- 不依赖任何固定阈值，而是结合数据上下文、业务模式、市场环境做动态判断

【你的分析任务】
基于以下营销数据，完成四个维度的深度洞察：

1. 【异常检测 Anomaly Detection】
   - 对每个核心指标，结合你掌握的行业知识判断是否异常
   - 说明你判断异常的依据（参考哪类市场/模式/阶段的基准）
   - 识别数据内部的逻辑矛盾（如：线索量高但成交量极低，可能存在质量问题）

2. 【趋势识别 Trend Analysis】
   - 若数据含时间维度，识别上升/下降趋势及拐点
   - 判断趋势是结构性变化还是短期波动
   - 跨渠道或产品横向对比，找出表现分化的来源

3. 【机会点发现 Opportunity Mining】
   - 找出 ROI 最高、增长潜力最大的渠道、产品或环节
   - 识别“低投入高回报”的优化杠杆点
   - 基于 LTV/CAC 与漏斗效率，判断哪些方向值得加大投入

4. 【风险预警 Risk Radar】
   - 识别可能影响成交的关键风险信号
   - 检测单一来源依赖、成本失控、转化崩塌等早期风险
   - 判断哪些风险需要立刻处理，哪些可以持续观察

【分析方法论要求】
- 使用漏斗分析：从曝光/触达→线索→私域→高意向→成交，逐层判断损耗和瓶颈
- 使用对比分析：产品间横向对比 + 前期数据纵向对比
- 使用归因分析：判断哪个环节或动作对最终成交影响最大
- 给出可执行的行动建议，而不是只描述问题

【分析边界】
- 只能使用我提供的数据，不能补造不存在的渠道、时间序列、成交周期或外部事实
- 如果数据不足以支撑某条判断，就不要输出这条洞察
- 如果发现明显不合理的数据（例如转化率 > 100%、分项之和对不上总数），按异常处理
- benchmark 字段请说明你引用的是哪类市场/模式/阶段的参考基准，不需要伪造具体来源链接
- action 字段请给出一句明确、可执行的下一步动作

【输出格式】
严格返回 JSON，结构如下：
{
  "anomalies": [
    {
      "type": "anomaly",
      "title": "一句话标题",
      "description": "详细说明，包含你的分析逻辑",
      "metric": "涉及的指标名",
      "value": "当前值",
      "severity": "low | medium | high",
      "benchmark": "引用的基准描述",
      "action": "建议的具体行动"
    }
  ],
  "opportunities": [
    {
      "type": "opportunity",
      "title": "一句话标题",
      "description": "详细说明，包含你的分析逻辑",
      "metric": "涉及的指标名",
      "value": "当前值",
      "severity": "low | medium | high",
      "benchmark": "引用的基准描述",
      "action": "建议的具体行动"
    }
  ],
  "risks": [
    {
      "type": "risk",
      "title": "一句话标题",
      "description": "详细说明，包含你的分析逻辑",
      "metric": "涉及的指标名",
      "value": "当前值",
      "severity": "low | medium | high",
      "benchmark": "引用的基准描述",
      "action": "建议的具体行动"
    }
  ],
  "topFindings": [
    "最重要发现1（一句话，含数据佐证）",
    "最重要发现2（一句话，含数据佐证）",
    "最重要发现3（一句话，含数据佐证）"
  ]
}

不要加任何解释，只返回 JSON。
如果某个维度没有发现，返回空数组 []，不要捏造。
如果你无法形成有效洞察，也必须返回合法 JSON 空结构，不能输出自然语言说明。

【结构化计算结果 dashboard】
${JSON.stringify(dashboard, null, 2)}

【原始标准化输入 normalizedInput】
${JSON.stringify(normalizedInput, null, 2)}
`;

const tryOpenAiInsights = async (prompt: string, signal: AbortSignal) => {
  const model = getOpenAiModel();
  const openai = new OpenAI({
    apiKey: getOpenAiApiKey(),
    baseURL: getOpenAiBaseUrl(),
  });
  const response = await openai.chat.completions.create(
    {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    },
    { signal },
  );
  const text = response.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("OpenAI 没有返回 AI 洞察结果。");
  }

  try {
    return normalizeInsightResult(safeJsonParse(text));
  } catch (error) {
    logInsightAttemptFailure({
      provider: "openai",
      model,
      reason: `parse_error: ${summarizeError(error)}`,
      text,
    });
    throw error;
  }
};

const tryGeminiInsights = async (prompt: string) => {
  const model = getGeminiModel();
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model,
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
    } as any,
  });
  const text = response.text?.trim();
  if (!text) {
    throw new Error("Gemini 没有返回 AI 洞察结果。");
  }

  try {
    return normalizeInsightResult(safeJsonParse(text));
  } catch (error) {
    logInsightAttemptFailure({
      provider: "gemini",
      model,
      reason: `parse_error: ${summarizeError(error)}`,
      text,
    });
    throw error;
  }
};

const trySiliconFlowInsights = async (prompt: string, signal: AbortSignal) => {
  const model = getSiliconFlowModel();
  const siliconflow = new OpenAI({
    apiKey: process.env.SILICONFLOW_API_KEY,
    baseURL: getSiliconFlowBaseUrl(),
  });
  const response = await siliconflow.chat.completions.create(
    {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    },
    { signal },
  );
  const text = response.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("SiliconFlow 没有返回 AI 洞察结果。");
  }

  try {
    return normalizeInsightResult(safeJsonParse(text));
  } catch (error) {
    logInsightAttemptFailure({
      provider: "siliconflow",
      model,
      reason: `parse_error: ${summarizeError(error)}`,
      text,
    });
    throw error;
  }
};

type InsightGenerationOptions = {
  requestId?: string;
  timeoutMs?: number;
};

export async function generateInsights(
  dashboard: DashboardData,
  normalizedInput: NormalizedInput,
  options: InsightGenerationOptions = {},
): Promise<InsightResult> {
  const prompt = buildInsightPrompt(dashboard, normalizedInput);
  const timeoutMs = options.timeoutMs ?? DEFAULT_INSIGHT_TIMEOUT_MS;
  const startedAt = Date.now();
  const attempts: Array<{
    enabled: boolean;
    provider: string;
    model: string;
    run: (signal: AbortSignal) => Promise<InsightResult>;
  }> = [
    {
      enabled: Boolean(getOpenAiApiKey()),
      provider: "openai",
      model: getOpenAiModel(),
      run: (signal) => tryOpenAiInsights(prompt, signal),
    },
    {
      enabled: Boolean(process.env.GEMINI_API_KEY),
      provider: "gemini",
      model: getGeminiModel(),
      run: () => tryGeminiInsights(prompt),
    },
    {
      enabled: Boolean(process.env.SILICONFLOW_API_KEY),
      provider: "siliconflow",
      model: getSiliconFlowModel(),
      run: (signal) => trySiliconFlowInsights(prompt, signal),
    },
  ];

  let lastError: unknown = null;

  for (const attempt of attempts) {
    if (!attempt.enabled) {
      continue;
    }

    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      const timeoutError = new Error(`generateInsights timeout after ${timeoutMs}ms`);
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }

    try {
      return await withTimeout(
        `generateInsights:${attempt.provider}`,
        remainingMs,
        (signal) => attempt.run(signal),
      );
    } catch (error) {
      logInsightAttemptFailure({
        provider: attempt.provider,
        model: attempt.model,
        reason: isTimeoutError(error)
          ? `timeout:${remainingMs}ms`
          : summarizeError(error),
      });
      lastError = error;

      if (isTimeoutError(error)) {
        break;
      }
    }
  }

  if (lastError) {
    throw lastError;
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
本轮 AI 洞察层没有返回有效结果。请继续只基于结构化数据写原有模块一到模块七，不要新增任何模块标题，也不要补造新的异常、机会点或风险预警。
</AI洞察层>
`;
  }

  return `${basePrompt}

<AI洞察层>
以下 JSON 是第4步 AI 洞察层的结果。它只是一层内部上下文，不是新的报告模块标题。
请遵守以下要求：
1. 仍然只输出原有模块一到模块七，不要新增“模块零”“AI 洞察摘要”或其他新标题。
2. 优先把 topFindings 融入模块三、模块五、模块六的结论、问题和动作建议里。
3. 使用 benchmark 和 action 时，必须与结构化数据一致；如果冲突，以结构化数据为准。
4. 前端会单独展示 AI 洞察摘要，所以不要把下面 JSON 原样逐条粘贴进报告。
${JSON.stringify(insights, null, 2)}
</AI洞察层>
`;
};
