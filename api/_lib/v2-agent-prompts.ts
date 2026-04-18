import fs from "node:fs";
import path from "node:path";
import type { V2DashboardType } from "../../shared/v2/types.ts";

const AGENT_DOC_PATH = path.resolve(
  process.cwd(),
  "docs/六大看板_Agent角色设定.md",
);

const SECTION_BY_DASHBOARD: Record<
  V2DashboardType,
  { heading: string; agentName: string; roleLabel: string }
> = {
  overview: {
    heading: "## Agent 一：总览驾驶舱",
    agentName: "Alex",
    roleLabel: "首席经营分析师",
  },
  content: {
    heading: "## Agent 二：内容获客看板",
    agentName: "Nova",
    roleLabel: "内容策略分析师",
  },
  ads: {
    heading: "## Agent 三：投放效果看板",
    agentName: "Rex",
    roleLabel: "增长黑客分析师",
  },
  sales: {
    heading: "## Agent 四：销售跟进看板",
    agentName: "Morgan",
    roleLabel: "销售行为分析师",
  },
  super_subscription: {
    heading: "## Agent 五：超级订阅漏斗看板",
    agentName: "Sage",
    roleLabel: "订阅业务增长顾问",
  },
  flexible_subscription: {
    heading: "## Agent 六：灵活订阅漏斗看板",
    agentName: "Iris",
    roleLabel: "用户决策行为分析师",
  },
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const extractPromptBlock = (markdown: string, heading: string) => {
  const sectionPattern = new RegExp(
    `${escapeRegExp(
      heading,
    )}[\\s\\S]*?### Prompt 模板[\\s\\S]*?\`\`\`txt\\s*([\\s\\S]*?)\`\`\``,
  );
  const match = markdown.match(sectionPattern);
  return match?.[1]?.trim() || "";
};

export const getV2AgentPrompt = (dashboardType: V2DashboardType) => {
  const markdown = fs.readFileSync(AGENT_DOC_PATH, "utf8");
  const section = SECTION_BY_DASHBOARD[dashboardType];
  const prompt = extractPromptBlock(markdown, section.heading);

  if (!prompt) {
    throw new Error(`未在 Agent 文档中找到 ${section.heading} 的 Prompt。`);
  }

  return {
    ...section,
    prompt,
  };
};
