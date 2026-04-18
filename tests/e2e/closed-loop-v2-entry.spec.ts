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
      { 指标: "计划级可归因覆盖率", 数值: 0.5, 说明: "测试" },
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
        加微时间: "2026-03-31",
        是否下单: "已下单",
        线索来源: "小红书-品牌号",
        业务类型: "超级订阅",
        意向等级SABCF: "A",
        订单号: "O001",
        下单时间: "2026-04-02",
        来源类型: "平台客资",
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
        归属账号: "超级电动",
        来源笔记: "测试笔记",
        流量类型: "广告流量",
        创意名称: "测试计划A",
        转化方式: "私信留资",
        手机号: "13800000000",
        微信号: "wechat001",
        联络主键: "13800000000",
        地区: "上海市",
        匹配状态: "已匹配",
        匹配主键: "13800000000",
        匹配时间差天: 0,
        匹配置信度: "低置信待核查",
        主线索ID: "M001",
      },
    ]),
    "XHS线索明细_打通",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        来源笔记: "测试笔记",
        XHS线索数: 1,
        广告流量线索数: 1,
        自然流量线索数: 0,
        高置信打通主线索数: 1,
        高置信打通率: 1,
        加微成功数: 1,
        加微成功率: 1,
        下单数: 1,
        下单率: 1,
      },
    ]),
    "XHS内容分析_按笔记",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        计划名称_标准化: "测试计划A",
        消费: 500,
        展现量: 1000,
        点击量: 100,
        互动量: 10,
        私信进线数: 10,
        私信开口数: 5,
        私信留资数: 1,
        XHS线索数: 1,
        高置信打通主线索数: 1,
        加微成功数: 1,
        下单数: 1,
        点击率: 0.1,
        投放表留资率: 0.1,
        按打通主线索重算留资成本: 500,
        按打通下单重算获客成本: 500,
      },
    ]),
    "XHS计划分析_按计划",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        日期: "2026-03-31",
        投放消费: 500,
        投放展现量: 1000,
        投放点击量: 100,
        投放私信进线数: 10,
        投放私信开口数: 5,
        投放私信留资数: 1,
        私信进线人数: 10,
        私信开口人数: 5,
        私信留资总人数: 1,
        XHS线索列表条数: 1,
        XHS广告流量线索数: 1,
        XHS自然流量线索数: 0,
        高置信打通主线索数: 1,
        加微成功数: 1,
        下单数: 1,
        投放点击率: 0.1,
        投放留资率: 0.1,
        高置信打通率: 1,
        下单率: 1,
      },
    ]),
    "XHS日分析_打通",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        小红书线索ID: "X001",
        用户小红书昵称: "测试用户",
        线索生成时间: "2026-03-31 10:00:00",
        归属账号: "超级电动",
        来源笔记: "测试笔记",
        流量类型: "广告流量",
        创意名称: "测试计划A",
        转化方式: "私信留资",
        手机号: "13800000000",
        微信号: "wechat001",
        联络主键: "13800000000",
        匹配状态: "已匹配",
        匹配主键: "13800000000",
        匹配时间差天: 0,
        匹配置信度: "低置信待核查",
        主线索ID: "M001",
        主线索日期: "2026-03-31",
        业务类型: "超级订阅",
      },
    ]),
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

test("闭环底座单文件上传后会直接进入 V2 总览看板", async ({
  page,
}, testInfo) => {
  const fixturePath = path.resolve(testInfo.outputDir, "closed-loop-fixture.xlsx");
  await fs.mkdir(path.dirname(fixturePath), { recursive: true });
  await createClosedLoopFixture(fixturePath);

  await page.goto("/");
  await expect(page.getByRole("button", { name: /开始识别/i })).toBeVisible();

  await page.setInputFiles("input[type=file]", fixturePath);
  const [, buildSessionResponse] = await Promise.all([
    page.getByRole("button", { name: /开始识别/i }).click(),
    page.waitForResponse((item) => item.url().includes("/api/intake/build-session")),
  ]);
  expect(buildSessionResponse.ok()).toBeTruthy();

  await expect(page.getByRole("heading", { name: /推荐分析方向/ })).toHaveCount(0);
  await expect(page.getByTestId("v2-dashboard-title")).toHaveText("总览驾驶舱");
  await expect(page.getByRole("heading", { name: /当前工作区/ })).toBeVisible();
  await expect(page.getByText("筛选与快照")).toBeVisible();
  await expect(page.getByRole("button", { name: /打开 Alex/i })).toBeVisible();

  await page.getByRole("button", { name: "销售跟进" }).click();
  await expect(page.getByTestId("v2-dashboard-title")).toHaveText("销售跟进看板");

  await attachScreenshot("closed-loop-single-file-v2.png", page, testInfo);
});
