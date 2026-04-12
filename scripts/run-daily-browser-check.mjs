import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

const rootDir = process.cwd();
const reportsRoot = path.join(rootDir, "reports", "browser-check");
const runsRoot = path.join(reportsRoot, "runs");
const feedbackPath = path.join(reportsRoot, "用户反馈.md");
const latestSummaryPath = path.join(reportsRoot, "latest.json");
const latestReportPath = path.join(reportsRoot, "latest.md");
const port = process.env.PLAYWRIGHT_PORT || "3101";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;

const now = new Date();
const runId = now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
const runDir = path.join(runsRoot, runId);
const outputDir = path.join(runDir, "artifacts");
const htmlDir = path.join(runDir, "playwright-report");
const jsonReportPath = path.join(runDir, "playwright-report.json");
const runLogPath = path.join(runDir, "run.log");
const markdownPath = path.join(runDir, "测试报告.md");
const summaryJsonPath = path.join(runDir, "summary.json");

const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const readTextIfExists = async (filePath) => {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
};

const normalizeFeedbackText = (rawText) => {
  const trimmed = rawText.trim();
  if (!trimmed) return "";

  const currentFeedbackMarker = "## 当前反馈";
  if (!trimmed.includes(currentFeedbackMarker)) {
    return trimmed;
  }

  const currentFeedback = trimmed
    .split(currentFeedbackMarker)[1]
    ?.trim()
    .replace(/^暂无。?$/u, "")
    .trim();

  return currentFeedback || "";
};

const readJsonIfExists = async (filePath) => {
  const text = await readTextIfExists(filePath);
  if (!text.trim()) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const isServerReady = async (url) => {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
};

const waitForServer = async (url, timeoutMs = 30_000) => {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (await isServerReady(url)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`本地服务未能在 ${timeoutMs}ms 内启动：${url}`);
};

const startLocalServer = async (outputChunks) => {
  const command = process.platform === "win32" ? "env.exe" : "env";
  const args = [`PORT=${port}`, "node", "--import", "tsx", "server.ts"];
  const child = spawn(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const onChunk = (chunk, stream, label) => {
    const text = chunk.toString();
    outputChunks.push(`[${label}] ${text}`);
    stream.write(text);
  };

  child.stdout.on("data", (chunk) => onChunk(chunk, process.stdout, "AppServer"));
  child.stderr.on("data", (chunk) => onChunk(chunk, process.stderr, "AppServer"));

  await waitForServer(baseURL);

  return child;
};

const stopChildProcess = async (child) => {
  if (!child || child.killed) return;

  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, 5_000);

    child.once("exit", () => {
      clearTimeout(timer);
      resolve(undefined);
    });

    child.kill("SIGTERM");
  });
};

const runPlaywright = async (outputChunks) => {
  await ensureDir(runDir);

  const env = {
    ...process.env,
    PLAYWRIGHT_OUTPUT_DIR: outputDir,
    PLAYWRIGHT_HTML_OUTPUT_DIR: htmlDir,
    PLAYWRIGHT_JSON_OUTPUT_NAME: jsonReportPath,
    PLAYWRIGHT_DISABLE_WEB_SERVER: "1",
    PLAYWRIGHT_BASE_URL: baseURL,
    PLAYWRIGHT_PORT: port,
  };

  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = ["playwright", "test", "tests/e2e/daily-smoke.spec.ts"];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const onChunk = (chunk, stream) => {
      const text = chunk.toString();
      outputChunks.push(`[Playwright] ${text}`);
      stream.write(text);
    };

    child.stdout.on("data", (chunk) => onChunk(chunk, process.stdout));
    child.stderr.on("data", (chunk) => onChunk(chunk, process.stderr));
    child.on("error", reject);
    child.on("close", async (code) => {
      resolve({
        exitCode: code ?? 1,
      });
    });
  });
};

const summarizeSuites = (suite, titlePath = []) => {
  const records = [];
  const nextTitlePath = suite.title ? [...titlePath, suite.title] : titlePath;

  for (const childSuite of suite.suites || []) {
    records.push(...summarizeSuites(childSuite, nextTitlePath));
  }

  for (const spec of suite.specs || []) {
    const specTitlePath = [...nextTitlePath, spec.title].filter(Boolean);
    for (const test of spec.tests || []) {
      const result = (test.results || []).at(-1) || {};
      const errorMessage =
        result.error?.message ||
        result.error?.stack ||
        (Array.isArray(result.errors)
          ? result.errors
              .map((item) => item?.message || item?.stack || "")
              .filter(Boolean)
              .join("\n")
          : "");

      records.push({
        title: specTitlePath.join(" > "),
        status: result.status || test.status || "unknown",
        durationMs: result.duration || 0,
        errorMessage: errorMessage?.trim() || "",
        attachments: (result.attachments || []).map((attachment) => ({
          name: attachment.name || "",
          contentType: attachment.contentType || "",
          path: attachment.path || "",
        })),
      });
    }
  }

  return records;
};

const collectAttachments = async (records) => {
  const attachments = [];

  for (const record of records) {
    for (const attachment of record.attachments) {
      if (!attachment.path) continue;

      const absolutePath = path.isAbsolute(attachment.path)
        ? attachment.path
        : path.join(rootDir, attachment.path);

      if (!(await fileExists(absolutePath))) continue;

      const preview =
        attachment.contentType === "application/json"
          ? (await readTextIfExists(absolutePath)).slice(0, 4000)
          : "";

      attachments.push({
        ...attachment,
        absolutePath,
        preview,
      });
    }
  }

  return attachments;
};

const buildDiff = (currentFailures, previousFailures) => {
  const currentSet = new Set(currentFailures);
  const previousSet = new Set(previousFailures);

  return {
    newFailures: currentFailures.filter((item) => !previousSet.has(item)),
    resolvedFailures: previousFailures.filter((item) => !currentSet.has(item)),
    persistentFailures: currentFailures.filter((item) => previousSet.has(item)),
  };
};

const heuristicConclusion = (summary, diff, feedbackText) => {
  if (summary.failedCases.length === 0) {
    if (feedbackText.trim()) {
      return "本次自动巡检未复现明显阻断问题，但已有用户反馈待人工复核，建议优先对照截图和反馈步骤补一轮定向回归。";
    }
    return "本次自动巡检通过，主流程已成功从数据导入走到诊断报告页，暂未发现阻断性异常。";
  }

  if (diff.newFailures.length > 0) {
    return `本次出现 ${diff.newFailures.length} 个新增失败，建议优先看新增失败对应的报错、截图和 trace，先止损再继续迭代。`;
  }

  return "存在持续失败项，说明问题还没有真正闭环，建议先复现并补针对性的回归用例。";
};

const buildResolutionSection = ({ summary, failedCases, combinedOutput }) => {
  if (summary.failedCases.length === 0) {
    return {
      rootCause: "本次自动巡检没有发现阻断问题，当前不需要额外修复动作。",
      minimumFix: "继续保留现有回归用例和每日巡检节奏即可。",
      validation: "下次巡检继续通过，并且用户反馈里没有新增阻断问题。",
      coordination: "当前不需要前端、后端、测试额外联动。",
    };
  }

  const isAnalyzeTimeout = failedCases.some(
    (item) =>
      item.title.includes("营销分析主流程每日巡检") &&
      (item.status === "timedOut" || item.errorMessage.includes("/api/analyze")),
  );

  if (isAnalyzeTimeout) {
    const hasAnalyzeTimingLog = combinedOutput.includes('"stage":"generate_ai_enhanced_report"');
    return {
      rootCause: hasAnalyzeTimingLog
        ? "主流程卡在 `/api/analyze`，需要结合分段耗时日志确认是输入解析、洞察生成还是 AI 增强超时。"
        : "主流程卡在 `/api/analyze`，当前最像是后端分析接口响应过慢。",
      minimumFix: "先看 `/api/analyze` 的阶段耗时日志，给慢阶段加硬超时和超时降级，保证接口能先返回 fallback 结果。",
      validation: "重新跑 `tests/e2e/daily-smoke.spec.ts`，确认 90 秒内能拿到 `/api/analyze` 响应，并能进入结果页。",
      coordination: "后端负责超时与降级；测试负责复跑并确认阈值；如果结果页文案或状态展示变化，前端同步确认。",
    };
  }

  const isRecognizeFailure = failedCases.some((item) =>
    item.title.includes("recognize") || item.errorMessage.includes("/api/recognize-input"),
  );

  if (isRecognizeFailure) {
    return {
      rootCause: "文件识别链路没有稳定产出 `/api/recognize-input` 结果，优先看表头识别、审计 sidecar 和漏斗回填。",
      minimumFix: "先用 fixture 回放识别接口，补齐 `importAudit` 和 `funnel` 断言，再修主线索表适配器。",
      validation: "重跑轻量识别 e2e，确认能进入匹配页、看到主线索表导入审计、漏斗数字已自动回填。",
      coordination: "后端负责适配器和 API；前端负责匹配页展示；测试负责把识别回归和完整主流程拆开。",
    };
  }

  return {
    rootCause: "当前失败需要结合截图、trace 和 error-context 继续定位，暂时无法只凭状态码判断唯一根因。",
    minimumFix: "先复现场景，再按失败步骤补最小修复，不要一次改多处。",
    validation: "复跑对应失败用例，确认状态从失败变成通过，并且没有新增失败项。",
    coordination: "测试先复现并收集证据，前后端按证据分工修复。",
  };
};

const maybeGenerateAiSummary = async ({ summary, diff, feedbackText, attachmentPreviews, combinedOutput }) => {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL?.trim() || undefined,
  });
  const model = process.env.OPENAI_MODEL || "gpt-5.4";
  const prompt = [
    "你是中文测试负责人，请根据下面的每日巡检结果输出结论。",
    "只输出四段：1. 今日结论 2. 疑似根因 3. 怎么解决 4. 下一步建议。",
    "要求：只能基于已知证据，不要编造。",
    "",
    "巡检摘要：",
    JSON.stringify(
      {
        status: summary.status,
        totals: summary.totals,
        failedCases: summary.failedCases,
        diff,
      },
      null,
      2,
    ),
    "",
    "用户反馈：",
    feedbackText.trim() || "无",
    "",
    "附件摘要：",
    attachmentPreviews.join("\n\n") || "无",
    "",
    "执行日志摘录：",
    combinedOutput.slice(-6000) || "无",
  ].join("\n");

  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });
    return response.choices[0]?.message?.content?.trim() || null;
  } catch (error) {
    return `AI 总结生成失败：${error instanceof Error ? error.message : "未知错误"}`;
  }
};

const renderMarkdown = ({ summary, diff, feedbackText, aiSummary, heuristicText, resolution }) => {
  const lines = [
    "# 每日浏览器巡检报告",
    "",
    `- 执行批次：${summary.runId}`,
    `- 执行时间：${summary.generatedAt}`,
    `- 巡检状态：${summary.status}`,
    `- 用例统计：总计 ${summary.totals.total}，通过 ${summary.totals.passed}，失败 ${summary.totals.failed}，跳过 ${summary.totals.skipped}`,
    "",
    "## 今日结论",
    "",
    heuristicText,
    "",
    "## 与上次相比",
    "",
    `- 新增失败：${diff.newFailures.length ? diff.newFailures.join("；") : "无"}`,
    `- 已恢复：${diff.resolvedFailures.length ? diff.resolvedFailures.join("；") : "无"}`,
    `- 持续失败：${diff.persistentFailures.length ? diff.persistentFailures.join("；") : "无"}`,
    "",
    "## 失败明细",
    "",
  ];

  if (summary.failedCases.length === 0) {
    lines.push("- 本次无失败用例。", "");
  } else {
    for (const item of summary.failedCases) {
      lines.push(`### ${item.title}`);
      lines.push("");
      lines.push(`- 状态：${item.status}`);
      lines.push(`- 耗时：${item.durationMs}ms`);
      lines.push(`- 报错：${item.errorMessage || "未拿到明确报错，请看截图和 trace"}`);
      lines.push(
        `- 附件：${
          item.attachments.length
            ? item.attachments.map((attachment) => path.relative(rootDir, attachment.absolutePath)).join("，")
            : "无"
        }`,
      );
      lines.push("");
    }
  }

  lines.push(
    "## 怎么解决",
    "",
    `- 根因判断：${resolution.rootCause}`,
    `- 最小修复动作：${resolution.minimumFix}`,
    `- 修完后怎么验证：${resolution.validation}`,
    `- 是否需要前端/后端/测试分别配合：${resolution.coordination}`,
    "",
  );

  lines.push("## 用户反馈对照", "", feedbackText.trim() || "当前没有待对照的用户反馈。", "");

  if (aiSummary) {
    lines.push("## AI 判断", "", aiSummary, "");
  }

  lines.push(
    "## 产物路径",
    "",
    `- Markdown 报告：${path.relative(rootDir, markdownPath)}`,
    `- Playwright JSON：${path.relative(rootDir, jsonReportPath)}`,
    `- Playwright HTML：${path.relative(rootDir, htmlDir)}`,
    `- 运行日志：${path.relative(rootDir, runLogPath)}`,
    "",
  );

  return `${lines.join("\n")}\n`;
};

const main = async () => {
  await ensureDir(runsRoot);

  const previousSummary = await readJsonIfExists(latestSummaryPath);
  const feedbackText = normalizeFeedbackText(await readTextIfExists(feedbackPath));
  const outputChunks = [];
  let serverProcess = null;
  let exitCode = 1;
  const shouldReuseRunningServer =
    process.env.PLAYWRIGHT_SKIP_SERVER_START === "1" || (await isServerReady(baseURL));

  try {
    if (shouldReuseRunningServer) {
      outputChunks.push(`[AppServer] 复用已启动服务：${baseURL}\n`);
    } else {
      serverProcess = await startLocalServer(outputChunks);
    }
    ({ exitCode } = await runPlaywright(outputChunks));
  } finally {
    await stopChildProcess(serverProcess);
  }

  const combinedOutput = outputChunks.join("");
  await fs.writeFile(runLogPath, combinedOutput, "utf8");
  const jsonReport = await readJsonIfExists(jsonReportPath);

  const records = jsonReport ? summarizeSuites(jsonReport) : [];
  const attachments = await collectAttachments(records);
  const attachmentMap = new Map(attachments.map((item) => [item.absolutePath, item]));

  const passedCases = records.filter((item) => item.status === "passed");
  const skippedCases = records.filter((item) => item.status === "skipped");
  const failedCases = records
    .filter((item) => item.status !== "passed" && item.status !== "skipped")
    .map((item) => ({
      title: item.title,
      status: item.status,
      durationMs: item.durationMs,
      errorMessage: item.errorMessage.split("\n").slice(0, 8).join(" ").trim(),
      attachments: item.attachments
        .map((attachment) => {
          if (!attachment.path) return null;
          const absolutePath = path.isAbsolute(attachment.path)
            ? attachment.path
            : path.join(rootDir, attachment.path);
          const detail = attachmentMap.get(absolutePath);
          if (!detail) return null;
          return detail;
        })
        .filter(Boolean),
    }));

  if (!jsonReport && exitCode !== 0) {
    failedCases.push({
      title: "Playwright 未生成结构化报告",
      status: "failed",
      durationMs: 0,
      errorMessage: combinedOutput.trim().split("\n").slice(-20).join(" "),
      attachments: [],
    });
  }

  const summary = {
    runId,
    generatedAt: now.toISOString(),
    status: failedCases.length === 0 && exitCode === 0 ? "通过" : "失败",
    totals: {
      total: records.length,
      passed: passedCases.length,
      failed: failedCases.length,
      skipped: skippedCases.length,
    },
    passedCases: passedCases.map((item) => item.title),
    failedCases,
  };

  const previousFailures =
    previousSummary?.failedCases?.map?.((item) => (typeof item === "string" ? item : item.title)).filter(Boolean) || [];
  const diff = buildDiff(
    summary.failedCases.map((item) => item.title),
    previousFailures,
  );
  const attachmentPreviews = failedCases
    .flatMap((item) => item.attachments)
    .map((attachment) => `附件：${path.relative(rootDir, attachment.absolutePath)}\n${attachment.preview || "二进制附件，预览省略"}`);
  const heuristicText = heuristicConclusion(summary, diff, feedbackText);
  const resolution = buildResolutionSection({
    summary,
    failedCases,
    combinedOutput,
  });
  const aiSummary = await maybeGenerateAiSummary({
    summary,
    diff,
    feedbackText,
    attachmentPreviews,
    combinedOutput,
  });
  const markdown = renderMarkdown({
    summary,
    diff,
    feedbackText,
    aiSummary,
    heuristicText,
    resolution,
  });

  await fs.writeFile(markdownPath, markdown, "utf8");
  await fs.writeFile(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await fs.writeFile(latestSummaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await fs.writeFile(latestReportPath, markdown, "utf8");

  console.log(`\n每日巡检报告已生成：${path.relative(rootDir, markdownPath)}`);
  process.exit(exitCode === 0 ? 0 : 1);
};

main().catch(async (error) => {
  await ensureDir(runDir);
  const message = error instanceof Error ? `${error.message}\n${error.stack || ""}` : String(error);
  await fs.writeFile(runLogPath, message, "utf8");
  await fs.writeFile(
    markdownPath,
    `# 每日浏览器巡检报告\n\n- 执行批次：${runId}\n- 巡检状态：失败\n\n## 异常\n\n${message}\n\n## 怎么解决\n\n- 根因判断：脚本在生成巡检报告前就异常退出，优先看运行日志和异常栈。\n- 最小修复动作：先修复脚本或启动流程里的首个报错，再重跑整套巡检。\n- 修完后怎么验证：重新执行 \`npm run test:e2e:daily\`，确认能产出完整的 \`测试报告.md\`。\n- 是否需要前端/后端/测试分别配合：测试先复现脚本异常；如果栈里指向业务接口或页面，再由对应前后端接手。\n`,
    "utf8",
  );
  console.error(error);
  process.exit(1);
});
