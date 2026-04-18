import path from "node:path";
import fs from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import * as XLSX from "xlsx";

const createClosedLoopFixture = async (filePath: string) => {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      { 指标: "主线索总量", 数值: 1, 说明: "测试" },
      { 指标: "小红书线索总量", 数值: 1, 说明: "测试" },
      { 指标: "高置信打通主线索", 数值: 1, 说明: "测试" },
      { 指标: "高置信下单", 数值: 1, 说明: "测试" },
    ]),
    "闭环总览",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        主线索ID: "M001",
        线索日期: "2026-03-31",
        客户手机号微信: "13800000000",
        用车城市: "上海",
        意向车型: "萤火虫",
        跟进销售: "销售A",
        是否成功加微: "已通过",
        是否下单: "已下单",
        线索来源: "小红书-品牌号",
        业务类型: "超级订阅",
      },
    ]),
    "统一主线索底座",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        小红书线索ID: "X001",
        用户小红书昵称: "测试用户",
        线索生成时间: "2026-03-31 10:00:00",
        来源笔记: "测试笔记",
        流量类型: "广告流量",
        手机号: "13800000000",
        联络主键: "13800000000",
      },
    ]),
    "XHS线索明细_打通",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ 来源笔记: "测试笔记", XHS线索数: 1, 下单数: 1 }]),
    "XHS内容分析_按笔记",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      { 计划名称_标准化: "计划A", 消费: 500, 高置信打通主线索数: 1, 下单数: 1 },
    ]),
    "XHS计划分析_按计划",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ 日期: "2026-03-31", 投放消费: 500, 下单数: 1 }]),
    "XHS日分析_打通",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ 小红书线索ID: "X001" }]),
    "低置信匹配待核查",
  );

  XLSX.writeFile(workbook, filePath);
};

const attachScreenshot = async (name: string, page: Page, testInfo: TestInfo) => {
  const screenshotPath = testInfo.outputPath(name);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach(name, {
    path: screenshotPath,
    contentType: "image/png",
  });
};

test("首页默认只保留上传入口，不再显示用户可见的 V2 或 Legacy 切换", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /还原成交链路/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /开始识别/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "打开 V2" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "打开 Legacy" })).toHaveCount(0);
});

test("混合上传后会直接进入后端指定的 V2 看板，并支持打开 Agent", async ({
  page,
}, testInfo) => {
  const fixtureDir = path.resolve(testInfo.outputDir, "v2-entry");
  await fs.mkdir(fixtureDir, { recursive: true });
  const closedLoopFixturePath = path.join(fixtureDir, "v2-closed-loop.xlsx");
  await createClosedLoopFixture(closedLoopFixturePath);
  const legacyFixturePath = path.resolve(process.cwd(), "tests/fixtures/daily-smoke.csv");

  await page.goto("/");
  await page.setInputFiles("input[type=file]", [closedLoopFixturePath, legacyFixturePath]);

  await expect(page.getByText("本次已加入 2 个文件")).toBeVisible();
  await expect(page.getByText("v2-closed-loop.xlsx", { exact: true })).toBeVisible();
  await expect(page.getByText("daily-smoke.csv", { exact: true })).toBeVisible();

  const [response] = await Promise.all([
    page.waitForResponse((item) => item.url().includes("/api/intake/build-session")),
    page.getByRole("button", { name: /开始识别/i }).click(),
  ]);
  expect(response.ok()).toBeTruthy();

  await expect(page.getByTestId("v2-dashboard-title")).toHaveText("总览驾驶舱");
  await expect(page.getByRole("heading", { name: /当前工作区/ })).toBeVisible();
  await expect(
    page.getByRole("navigation").getByRole("button", { name: "返回上传首页" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "打开 Legacy" })).toHaveCount(0);

  const [agentResponse] = await Promise.all([
    page.waitForResponse((item) => item.url().includes("/api/agent/analyze")),
    page.getByRole("button", { name: /打开 Alex/i }).click(),
  ]);
  expect(agentResponse.ok()).toBeTruthy();
  await expect(page.getByTestId("v2-agent-drawer")).toBeVisible();
  await expect(page.getByTestId("v2-agent-name")).toHaveText("Alex");
  await expect(page.getByText("当前看板：总览驾驶舱")).toBeVisible();

  await attachScreenshot("v2-entry-from-home.png", page, testInfo);
});

test("多文件但无法进入 V2 时，会在首页明确提示不要静默回退兼容链", async ({
  page,
}, testInfo) => {
  const fixtureDir = path.resolve(testInfo.outputDir, "v2-fallback");
  await fs.mkdir(fixtureDir, { recursive: true });
  const legacyFixturePath = path.resolve(process.cwd(), "tests/fixtures/daily-smoke.csv");
  const markdownFixturePath = path.join(fixtureDir, "legacy-note.md");
  await fs.writeFile(markdownFixturePath, "# 会议纪要\n\n本周主要讨论投放预算和复盘。", "utf8");

  await page.goto("/");
  await page.setInputFiles("input[type=file]", [legacyFixturePath, markdownFixturePath]);

  const [response] = await Promise.all([
    page.waitForResponse((item) => item.url().includes("/api/intake/analyze")),
    page.getByRole("button", { name: /开始识别/i }).click(),
  ]);
  expect(response.ok()).toBeTruthy();

  await expect(
    page.getByText(
      "当前这组多文件还不能进入 V2 主链。多文件上传目前只支持 V2；如果要走兼容诊断，请改为单文件或直接粘贴文本。",
    ),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /还原成交链路/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "推荐分析方向" })).toHaveCount(0);

  await attachScreenshot("v2-multifile-home-warning.png", page, testInfo);
});
