import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import { getV2AgentPrompt } from "./v2-agent-prompts.ts";
import {
  getAgentThread,
  saveAgentThread,
} from "../../shared/v2/store.ts";
import { getV2Dashboard } from "../../shared/v2/service.ts";
import type {
  V2DashboardBusinessFilter,
  V2DashboardTimeScope,
  V2DashboardType,
} from "../../shared/v2/types.ts";

type AgentFilterContext = {
  timeScope?: V2DashboardTimeScope;
  businessFilter?: V2DashboardBusinessFilter;
};

const readEnv = (value?: string) => value?.trim() || undefined;

const getOpenAiClient = () => {
  const apiKey =
    readEnv(process.env.YUNWU_API_KEY) || readEnv(process.env.OPENAI_API_KEY);
  if (!apiKey) {
    return null;
  }
  return new OpenAI({
    apiKey,
    baseURL:
      readEnv(process.env.YUNWU_BASE_URL) || readEnv(process.env.OPENAI_BASE_URL),
  });
};

const getOpenAiModel = () =>
  readEnv(process.env.YUNWU_MODEL) ||
  readEnv(process.env.OPENAI_MODEL) ||
  "gpt-5.4";

const shouldForceFallback = () =>
  process.env.V2_FORCE_MEMORY_STORE === "1" || process.env.NODE_ENV === "test";

const renderPrompt = (template: string, context: Record<string, unknown>) =>
  template.replace(/\{([^}]+)\}/g, (_match, key) => {
    const value = context[key];
    if (value === null || value === undefined || value === "") {
      return "[待补数据]";
    }
    if (typeof value === "string") {
      return value;
    }
    return JSON.stringify(value, null, 2);
  });

const buildFallbackAnswer = (
  agentName: string,
  roleLabel: string,
  summary: string,
  notices: string[],
) => {
  const lines = [
    `${agentName} · ${roleLabel}`,
    "",
    summary || "当前数据还不足以给出完整结论。",
  ];

  if (notices.length) {
    lines.push("", "当前补充说明：");
    notices.slice(0, 3).forEach((item) => {
      lines.push(`- ${item}`);
    });
  }

  lines.push("", "当前为离线降级分析。补齐数据或配置模型后，可获得完整 Agent 结论。");
  return lines.join("\n");
};

export const analyzeV2Agent = async (
  snapshotId: string,
  dashboardType: V2DashboardType,
  filters: AgentFilterContext = {},
) => {
  const { dashboard } = await getV2Dashboard(snapshotId, dashboardType, filters);
  const promptMeta = getV2AgentPrompt(dashboardType);
  const systemPrompt = renderPrompt(promptMeta.prompt, dashboard.agentContext);
  const client = shouldForceFallback() ? null : getOpenAiClient();

  let content = buildFallbackAnswer(
    promptMeta.agentName,
    promptMeta.roleLabel,
    dashboard.summary,
    dashboard.notices,
  );
  let fallback = true;

  if (client) {
    try {
      const response = await client.responses.create({
        model: getOpenAiModel(),
        input: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: `当前看板上下文如下：\n${JSON.stringify(dashboard.agentContext, null, 2)}\n\n请按你的固定输出结构直接开始分析。`,
          },
        ],
      });
      const outputText =
        response.output_text?.trim() ||
        buildFallbackAnswer(
          promptMeta.agentName,
          promptMeta.roleLabel,
          dashboard.summary,
          dashboard.notices,
        );
      content = outputText;
      fallback = false;
    } catch (error) {
      console.warn("[v2-agent]", "agent analyze fallback", error);
    }
  }

  const thread = {
    id: randomUUID(),
    dashboardType,
    snapshotId,
    agentName: promptMeta.agentName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [
      {
        role: "assistant" as const,
        content,
      },
    ],
  };

  await saveAgentThread(thread);
  return {
    sessionId: thread.id,
    agentName: promptMeta.agentName,
    roleLabel: promptMeta.roleLabel,
    content,
    fallback,
  };
};

export const followupV2Agent = async (
  threadId: string,
  userQuestion: string,
  filters: AgentFilterContext = {},
) => {
  const thread = await getAgentThread(threadId);
  if (!thread) {
    const error = new Error("未找到 Agent 会话。") as Error & { statusCode?: number };
    error.statusCode = 404;
    throw error;
  }

  const { dashboard } = await getV2Dashboard(
    thread.snapshotId,
    thread.dashboardType,
    filters,
  );
  const promptMeta = getV2AgentPrompt(thread.dashboardType);
  const systemPrompt = renderPrompt(promptMeta.prompt, dashboard.agentContext);
  const client = shouldForceFallback() ? null : getOpenAiClient();

  let content = buildFallbackAnswer(
    promptMeta.agentName,
    promptMeta.roleLabel,
    dashboard.summary,
    dashboard.notices,
  );
  let fallback = true;

  if (client) {
    try {
      const response = await client.responses.create({
        model: getOpenAiModel(),
        input: [
          {
            role: "system",
            content: systemPrompt,
          },
          ...thread.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          {
            role: "user",
            content: userQuestion,
          },
        ],
      });
      const outputText =
        response.output_text?.trim() ||
        buildFallbackAnswer(
          promptMeta.agentName,
          promptMeta.roleLabel,
          dashboard.summary,
          dashboard.notices,
        );
      content = outputText;
      fallback = false;
    } catch (error) {
      console.warn("[v2-agent]", "agent followup fallback", error);
    }
  }

  const nextThread = {
    ...thread,
    updatedAt: new Date().toISOString(),
    messages: [
      ...thread.messages,
      { role: "user" as const, content: userQuestion },
      { role: "assistant" as const, content },
    ],
  };
  await saveAgentThread(nextThread);

  return {
    sessionId: nextThread.id,
    agentName: promptMeta.agentName,
    roleLabel: promptMeta.roleLabel,
    content,
    fallback,
  };
};
