import path from "node:path";
import fs from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const fixturePath = path.resolve(process.cwd(), "tests/fixtures/daily-smoke.csv");

const attachScreenshot = async (name: string, page: Page, testInfo: TestInfo) => {
  const screenshotPath = testInfo.outputPath(name);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach(name, {
    path: screenshotPath,
    contentType: "image/png",
  });
};

test("营销分析主流程每日巡检", async ({ page }, testInfo) => {
  const fixtureText = await fs.readFile(fixturePath, "utf8");

  await test.step("打开首页并确认核心入口可用", async () => {
    await page.goto("/");
    await expect(page.getByText("还原成交链路")).toBeVisible();
    await expect(page.getByRole("button", { name: /数据分析/i })).toBeVisible();
  });

  await test.step("粘贴模板数据并进入匹配页", async () => {
    const executeButton = page.getByRole("button", { name: /数据分析/i });
    await page.getByPlaceholder("也可以直接在这里粘贴原始数据、复盘文档或表格内容...").fill(fixtureText);
    await expect(executeButton).toBeEnabled();

    const [response] = await Promise.all([
      page.waitForResponse((item) => item.url().includes("/api/recognize-input")),
      executeButton.dispatchEvent("click"),
    ]);

    expect(response.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { name: "数据匹配框" })).toBeVisible();
    await expect(page.getByText(/已完成数据识别/)).toBeVisible();
    await attachScreenshot("01-matching-page.png", page, testInfo);
  });

  await test.step("生成最终分析并校验关键结果模块", async () => {
    const [response] = await Promise.all([
      page.waitForResponse((item) => item.url().includes("/api/analyze")),
      page.getByRole("button", { name: /生成最终分析/i }).dispatchEvent("click"),
    ]);

    expect(response.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { name: "营销效果诊断报告" })).toBeVisible();
    await expect(page.getByText("完整分析报告")).toBeVisible();
    await expect(page.getByText("分产品漏斗")).toBeVisible();
    await attachScreenshot("02-result-page.png", page, testInfo);
  });

  const pageText = await page.locator("body").innerText();
  const summary = {
    checkedAt: new Date().toISOString(),
    fixturePath,
    currentUrl: page.url(),
    pageTextPreview: pageText.slice(0, 2000),
  };

  const summaryPath = testInfo.outputPath("inspection-summary.json");
  await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await testInfo.attach("inspection-summary", {
    path: summaryPath,
    contentType: "application/json",
  });
});
