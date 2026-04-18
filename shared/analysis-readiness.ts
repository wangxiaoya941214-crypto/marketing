import type { MarketingInput } from "./marketing-engine.ts";

export type AnalysisCriticalGap =
  | "目标成交台数"
  | "CPS红线"
  | "投放金额";

export interface AnalysisReadiness {
  shouldBlock: boolean;
  missingGroups: AnalysisCriticalGap[];
  missingFields: string[];
}

export const getCriticalAnalysisReadiness = (
  input: MarketingInput,
): AnalysisReadiness => {
  const missingGroups: AnalysisCriticalGap[] = [];
  const missingFields: string[] = [];

  const addGroup = (
    label: AnalysisCriticalGap,
    checks: Array<[string, number | null]>,
  ) => {
    const groupMissingFields = checks
      .filter(([, value]) => value === null)
      .map(([field]) => field);

    if (!groupMissingFields.length) {
      return;
    }

    missingGroups.push(label);
    missingFields.push(...groupMissingFields);
  };

  addGroup("目标成交台数", [
    ["灵活订阅目标成交台数", input.targets.flexible],
    ["超级订阅目标成交台数", input.targets.super],
  ]);

  addGroup("CPS红线", [
    ["灵活订阅CPS红线", input.cpsRedlines.flexible],
    ["超级订阅CPS红线", input.cpsRedlines.super],
  ]);

  addGroup("投放金额", [
    ["灵活订阅投放金额", input.spend.flexible],
    ["超级订阅投放金额", input.spend.super],
    ["品牌号/其他投放金额", input.spend.brand],
    ["总投放金额", input.spend.total],
  ]);

  return {
    shouldBlock: missingGroups.length > 0,
    missingGroups,
    missingFields,
  };
};
