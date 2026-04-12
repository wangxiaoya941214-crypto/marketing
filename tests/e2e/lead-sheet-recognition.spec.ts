import path from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const fixturePath = path.resolve(process.cwd(), "tests/fixtures/lead-sheet-real-structure.xlsx");

const attachScreenshot = async (name: string, page: Page, testInfo: TestInfo) => {
  const screenshotPath = testInfo.outputPath(name);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach(name, {
    path: screenshotPath,
    contentType: "image/png",
  });
};

test("主线索表识别链路会进入匹配页并展示审计", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByText("还原成交链路")).toBeVisible();

  const [response] = await Promise.all([
    page.waitForResponse((item) => item.url().includes("/api/recognize-input")),
    page.setInputFiles("input[type=file]", fixturePath).then(() =>
      page.getByRole("button", { name: /数据分析/i }).click(),
    ),
  ]);

  expect(response.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { name: "数据匹配框" })).toBeVisible();
  await expect(page.getByText("主线索表导入审计")).toBeVisible();
  await expect(page.getByText(/已识别为主线索表/)).toBeVisible();

  const numericInputs = page.locator('input[inputmode="decimal"]');
  await expect(numericInputs.nth(8)).toHaveValue("5");
  await expect(numericInputs.nth(11)).toHaveValue("5");
  await expect(numericInputs.nth(14)).toHaveValue("2");
  await expect(numericInputs.nth(17)).toHaveValue("3");

  await attachScreenshot("lead-sheet-recognition.png", page, testInfo);
});
