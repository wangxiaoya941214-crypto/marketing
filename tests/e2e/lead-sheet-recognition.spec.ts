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

test("主线索表上传后会优先进入 V2 跟进相关看板，而不是停在识别确认页", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByText("还原成交链路")).toBeVisible();

  const [response] = await Promise.all([
    page.waitForResponse((item) => item.url().includes("/api/intake/build-session")),
    page.setInputFiles("input[type=file]", fixturePath).then(() =>
      page.getByRole("button", { name: /开始识别/i }).click(),
    ),
  ]);

  expect(response.ok()).toBeTruthy();
  await expect(page.getByRole("heading", { name: /推荐分析方向/ })).toHaveCount(0);
  await expect(page.getByTestId("v2-dashboard-title")).toBeVisible();
  await expect(page.getByTestId("v2-dashboard-title")).toContainText(/销售跟进|超级订阅|灵活订阅/);
  await expect(page.getByText("筛选与快照")).toBeVisible();

  await attachScreenshot("lead-sheet-v2-direct.png", page, testInfo);
});
