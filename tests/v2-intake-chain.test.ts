import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import {
  analyzeV2UploadSession,
  buildV2AnalysisSession,
  buildV2AnalyzeResponse,
  buildV2BuildSessionResponse,
  buildV2ReclassifyResponse,
  buildV2UploadResponse,
  reclassifyV2UploadFile,
  uploadV2Files,
} from "../shared/v2/service.ts";

const leadSheetFixturePath = path.resolve(
  process.cwd(),
  "tests/fixtures/lead-sheet-real-structure.xlsx",
);
const marketingTemplateFixturePath = path.resolve(
  process.cwd(),
  "tests/fixtures/daily-smoke.csv",
);

const buildClosedLoopWorkbookBuffer = () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ 指标: "主线索总量", 数值: 1 }]),
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
        线索来源: "小红书-品牌号",
      },
    ]),
    "统一主线索底座",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        小红书线索ID: "X001",
        线索生成时间: "2026-03-31 10:00:00",
        来源笔记: "测试笔记",
        流量类型: "广告流量",
        手机号: "13800000000",
      },
    ]),
    "XHS线索明细_打通",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ 来源笔记: "测试笔记" }]),
    "XHS内容分析_按笔记",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ 计划名称_标准化: "计划A" }]),
    "XHS计划分析_按计划",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ 日期: "2026-03-31" }]),
    "XHS日分析_打通",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ 小红书线索ID: "X001" }]),
    "低置信匹配待核查",
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

const buildVideoWorkbookBuffer = () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        视频标题: "视频 1",
        内容标题: "内容 1",
        播放量: 1000,
        完播率: "32%",
        互动量: 88,
      },
    ]),
    "视频表现",
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

const buildLeadListWorkbookBuffer = () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        小红书线索ID: "L001",
        线索生成时间: "2026-04-01 10:00:00",
        来源笔记: "测试笔记",
        流量类型: "自然流量",
        手机号: "13800000001",
      },
    ]),
    "线索明细",
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

const buildOrderSourceAuditWorkbookBuffer = () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        订单号: "DY2604011647109025",
        下单时间: "4/1/26 16:47",
        客户姓名: "钱月娟",
        手机号: "17681879909",
        匹配4月签约: "",
        用车城市: "杭州市",
        类型: "现车",
        车型: "萤火虫",
        聊天记录: "",
        平台来源: "小红书",
        备注: "",
      },
    ]),
    "灵活订阅四月总表",
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

const buildAmbiguousLeadSheetBuffer = () => {
  const workbook = XLSX.read(fs.readFileSync(leadSheetFixturePath), {
    type: "buffer",
    cellDates: true,
  });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    raw: false,
    defval: "",
  });
  const sampleRows = rows.slice(0, 3).map((row, index) => ({
    ...row,
    业务类型: index % 2 === 0 ? "超级订阅" : "灵活订阅",
  }));

  workbook.Sheets[firstSheetName] = XLSX.utils.json_to_sheet(sampleRows);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

const buildFlexibleLeadSheetBuffer = () => {
  const workbook = XLSX.read(fs.readFileSync(leadSheetFixturePath), {
    type: "buffer",
    cellDates: true,
  });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    raw: false,
    defval: "",
  });

  workbook.Sheets[firstSheetName] = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      ...row,
      业务类型: "灵活订阅",
    })),
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

const buildFlexibleChannelSplitWorkbookBuffer = () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        线索日期: "2026/03/04",
        "客户手机号/微信": "13800000001",
        用车城市: "杭州",
        意向车型: "萤火虫",
        跟进销售: "潇雅",
        是否成功加微: "已通过",
        加微时间: "2026/03/04",
        首次跟进情况: "已触达",
        第2次跟进时间: "2026/03/05",
        第2次跟进情况: "持续跟进",
        是否下单: "否",
        线索来源: "小红书",
        用户去重: "1",
        "是否下单（下单为1）": "0",
        "AI外呼意向客户（是为1）": "0",
        未成功原因: "",
        未下单原因: "继续观望",
        按周划分: "3W1",
        父记录: "",
      },
      {
        线索日期: "2026/03/05",
        "客户手机号/微信": "13800000002",
        用车城市: "广州",
        意向车型: "乐道L60",
        跟进销售: "潇雅",
        是否成功加微: "已通过",
        加微时间: "2026/03/05",
        首次跟进情况: "已触达",
        第2次跟进时间: "2026/03/06",
        第2次跟进情况: "意向明确",
        是否下单: "是",
        线索来源: "抖音",
        用户去重: "1",
        "是否下单（下单为1）": "1",
        "AI外呼意向客户（是为1）": "1",
        未成功原因: "",
        未下单原因: "",
        按周划分: "3W1",
        父记录: "",
      },
      {
        线索日期: "2026/03/06",
        "客户手机号/微信": "13800000003",
        用车城市: "南京",
        意向车型: "乐道L60",
        跟进销售: "潇雅",
        是否成功加微: "已通过",
        加微时间: "2026/03/06",
        首次跟进情况: "已触达",
        第2次跟进时间: "2026/03/07",
        第2次跟进情况: "二次跟进中",
        是否下单: "否",
        线索来源: "私域池",
        用户去重: "1",
        "是否下单（下单为1）": "0",
        "AI外呼意向客户（是为1）": "0",
        未成功原因: "",
        未下单原因: "价格犹豫",
        按周划分: "3W1",
        父记录: "",
      },
    ]),
    "日更❗️灵活订阅客资",
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

const buildSuperMarketFollowupWorkbookBuffer = () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        线索日期: "2026/03/04",
        新老客资: "老客户",
        用户来源: "私域池",
        客户微信号: "小黄鸭来了",
        用户姓名: "",
        联系方式: "",
        是否添加成功微信: "已通过",
        意向车型: "萤火虫",
        用车城市: "南京",
        用车时长: "12个月",
        跟进销售: "陆鑫涛",
        意向等级: "A（高意向）",
        "成交/小订日期": "",
        跟进记录: "目前等待第二批上线",
        未成交归因: "芝麻分不足800",
        备注: "",
        "芝麻分（只填高意向）": "749",
        订单进度: "",
        按周划分: "3W1",
        所属省份: "江苏",
        父记录: "",
        来源类型: "平台客资",
      },
      {
        线索日期: "2026/03/05",
        新老客资: "老客户",
        用户来源: "私域池",
        客户微信号: "WHL",
        用户姓名: "王海林",
        联系方式: "18800001111",
        是否添加成功微信: "已通过",
        意向车型: "萤火虫",
        用车城市: "杭州",
        用车时长: "12个月",
        跟进销售: "陆鑫涛",
        意向等级: "B（中意向）",
        "成交/小订日期": "2026/03/20",
        跟进记录: "持续跟进中",
        未成交归因: "",
        备注: "",
        "芝麻分（只填高意向）": "",
        订单进度: "已成交",
        按周划分: "3W1",
        所属省份: "浙江",
        父记录: "",
        来源类型: "平台客资",
      },
      {
        线索日期: "2026/03/06",
        新老客资: "新客资",
        用户来源: "抖音",
        客户微信号: "test-super-03",
        用户姓名: "测试用户三",
        联系方式: "13900001111",
        是否添加成功微信: "已通过",
        意向车型: "萤火虫",
        用车城市: "广州",
        用车时长: "6个月",
        跟进销售: "陆鑫涛",
        意向等级: "C（低意向）",
        "成交/小订日期": "",
        跟进记录: "继续观望",
        未成交归因: "等待活动",
        备注: "",
        "芝麻分（只填高意向）": "",
        订单进度: "",
        按周划分: "3W1",
        所属省份: "广东",
        父记录: "",
        来源类型: "平台客资",
      },
    ]),
    "日更❗️超级订阅客资",
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

const buildMixedMarketingDashboardWorkbookBuffer = () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        期数: "第1期",
        发布日期: "2026/03/01",
        发布平台: "小红书",
        内容标题: "内容一",
        视频链接: "https://example.com/1",
        播放量: 1000,
      },
    ]),
    "1-内容数据",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        线索日期: "2026/03/04",
        新老客资: "老客户",
        用户来源: "私域池",
        客户微信号: "mix-super-01",
        用户姓名: "测试用户",
        联系方式: "13800000001",
        是否添加成功微信: "已通过",
        意向车型: "萤火虫",
        用车城市: "上海",
        跟进销售: "陆鑫涛",
        意向等级: "A（高意向）",
        跟进记录: "持续跟进中",
        未成交归因: "",
        备注: "",
        SourceID: "S001",
        用车时长: "12个月",
        "成交/小订日期": "2026/03/20",
        "芝麻分（只填高意向）": "760",
        订单进度: "已成交",
        按周划分: "3W1",
        所属省份: "上海",
        父记录: "",
        来源类型: "平台客资",
      },
      {
        线索日期: "2026/03/05",
        新老客资: "新客户",
        用户来源: "小红书",
        客户微信号: "mix-super-02",
        用户姓名: "测试用户2",
        联系方式: "13800000002",
        是否添加成功微信: "已通过",
        意向车型: "萤火虫",
        用车城市: "杭州",
        跟进销售: "陆鑫涛",
        意向等级: "B（中意向）",
        跟进记录: "持续跟进中",
        未成交归因: "",
        备注: "",
        SourceID: "S002",
        用车时长: "12个月",
        "成交/小订日期": "",
        "芝麻分（只填高意向）": "",
        订单进度: "",
        按周划分: "3W1",
        所属省份: "浙江",
        父记录: "",
        来源类型: "平台客资",
      },
      {
        线索日期: "2026/03/06",
        新老客资: "新客户",
        用户来源: "抖音",
        客户微信号: "mix-super-03",
        用户姓名: "测试用户3",
        联系方式: "13800000003",
        是否添加成功微信: "已通过",
        意向车型: "萤火虫",
        用车城市: "广州",
        跟进销售: "陆鑫涛",
        意向等级: "C（低意向）",
        跟进记录: "持续跟进中",
        未成交归因: "继续观望",
        备注: "",
        SourceID: "S003",
        用车时长: "12个月",
        "成交/小订日期": "",
        "芝麻分（只填高意向）": "",
        订单进度: "",
        按周划分: "3W1",
        所属省份: "广东",
        父记录: "",
        来源类型: "平台客资",
      },
    ]),
    "6.1-小红书-超级订阅客资跟进表",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        订单号: "DY0001",
        下单时间: "2026/03/20",
        客户姓名: "测试用户",
        手机号: "13800000001",
        用车城市: "上海",
        平台来源: "小红书",
      },
    ]),
    "灵活订阅三月来源表",
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

test("V2 上传支持单文件与多文件，并返回稳定 contract", async () => {
  const upload = await uploadV2Files([
    {
      name: "daily-smoke.csv",
      mimeType: "text/csv",
      data: fs.readFileSync(marketingTemplateFixturePath).toString("base64"),
    },
    {
      name: "closed-loop.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildClosedLoopWorkbookBuffer().toString("base64"),
    },
  ]);

  const response = buildV2UploadResponse(upload);

  assert.ok(response.uploadId);
  assert.equal(response.files.length, 2);
  assert.equal(response.files[0]?.status, "uploaded");
  assert.equal(response.upload.files.length, 2);
});

test("空文件不会创建上传会话", async () => {
  await assert.rejects(
    () =>
      uploadV2Files([
        {
          name: "empty.csv",
          mimeType: "text/csv",
          data: "",
        },
      ]),
    /文件 empty\.csv 为空，无法创建上传会话/,
  );
});

test("V2 analyze 能识别混合文件并标记 Legacy 文件", async () => {
  const upload = await uploadV2Files([
    {
      name: "daily-smoke.csv",
      mimeType: "text/csv",
      data: fs.readFileSync(marketingTemplateFixturePath).toString("base64"),
    },
    {
      name: "closed-loop.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildClosedLoopWorkbookBuffer().toString("base64"),
    },
  ]);

  const analyzedUpload = await analyzeV2UploadSession(upload.id);
  const response = buildV2AnalyzeResponse(analyzedUpload);

  const closedLoopFile = response.files.find((item) => item.name === "closed-loop.xlsx");
  const legacyFile = response.files.find((item) => item.name === "daily-smoke.csv");

  assert.equal(closedLoopFile?.sourceType, "closed_loop_workbook");
  assert.equal(closedLoopFile?.v2Eligible, true);
  assert.equal(legacyFile?.sourceType, null);
  assert.equal(legacyFile?.v2Eligible, false);
  assert.equal(response.v2Eligible, true);
  assert.equal(response.entryDashboard, "overview");
  assert.match(response.entryReason || "", /闭环底座工作簿/);
});

test("纯 Legacy 上传在 analyze 结果里明确返回 v2Eligible=false，且不给 entryDashboard", async () => {
  const upload = await uploadV2Files([
    {
      name: "daily-smoke.csv",
      mimeType: "text/csv",
      data: fs.readFileSync(marketingTemplateFixturePath).toString("base64"),
    },
  ]);

  const analyzedUpload = await analyzeV2UploadSession(upload.id);
  const response = buildV2AnalyzeResponse(analyzedUpload);

  assert.equal(response.v2Eligible, false);
  assert.equal(response.entryDashboard, undefined);
  assert.equal(response.entryReason, undefined);
});

test("同看板多文件在 analyze 结果里固定返回 entryDashboard=content", async () => {
  const upload = await uploadV2Files([
    {
      name: "video-performance.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildVideoWorkbookBuffer().toString("base64"),
    },
    {
      name: "xhs-leads.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildLeadListWorkbookBuffer().toString("base64"),
    },
  ]);

  const analyzedUpload = await analyzeV2UploadSession(upload.id);
  const response = buildV2AnalyzeResponse(analyzedUpload);

  assert.equal(response.v2Eligible, true);
  assert.equal(response.entryDashboard, "content");
  assert.match(response.entryReason || "", /都归到内容获客看板/);
});

test("跨业务线跟进表在 analyze 结果里固定返回 entryDashboard=sales", async () => {
  const upload = await uploadV2Files([
    {
      name: "super-leads.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: fs.readFileSync(leadSheetFixturePath).toString("base64"),
    },
    {
      name: "flexible-leads.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildFlexibleLeadSheetBuffer().toString("base64"),
    },
  ]);

  const analyzedUpload = await analyzeV2UploadSession(upload.id);
  const response = buildV2AnalyzeResponse(analyzedUpload);

  assert.equal(response.v2Eligible, true);
  assert.equal(response.entryDashboard, "sales");
  assert.match(response.entryReason || "", /同时识别到超级订阅和灵活订阅跟进表/);
});

test("灵活订阅渠道拆分跟进表会识别成 flexible_subscription_followup 并能 build-session", async () => {
  const upload = await uploadV2Files([
    {
      name: "订阅线索留资跟进表单_日更❗️灵活订阅客资_渠道拆分表-潇雅.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildFlexibleChannelSplitWorkbookBuffer().toString("base64"),
    },
  ]);

  const analyzedUpload = await analyzeV2UploadSession(upload.id);
  const response = buildV2AnalyzeResponse(analyzedUpload);

  assert.equal(response.v2Eligible, true);
  assert.equal(response.files[0]?.sourceType, "flexible_subscription_followup");
  assert.equal(response.entryDashboard, "flexible_subscription");

  const built = await buildV2AnalysisSession(upload.id);
  assert.equal(built.snapshot.confirmedFiles[0]?.sourceType, "flexible_subscription_followup");
  assert.equal(built.snapshot.canonicalFacts.summary.totalFollowupLeads, 3);
  assert.equal(built.snapshot.canonicalFacts.summary.totalOrders, 1);
});

test("订单来源核查表会识别成 order_source_check 并直接进入 sales", async () => {
  const upload = await uploadV2Files([
    {
      name: "灵活订阅订单来源核查.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildOrderSourceAuditWorkbookBuffer().toString("base64"),
    },
  ]);

  const analyzedUpload = await analyzeV2UploadSession(upload.id);
  const response = buildV2AnalyzeResponse(analyzedUpload);

  assert.equal(response.v2Eligible, true);
  assert.equal(response.files[0]?.sourceType, "order_source_check");
  assert.equal(response.entryDashboard, "sales");
  assert.match(response.entryReason || "", /销售跟进看板/);

  const built = await buildV2AnalysisSession(upload.id);
  assert.equal(built.snapshot.confirmedFiles[0]?.sourceType, "order_source_check");
  assert.equal(built.snapshot.canonicalFacts.orders.length, 1);
  assert.equal(built.snapshot.canonicalFacts.orders[0]?.orderSource, "小红书");
  assert.equal(built.snapshot.canonicalFacts.orders[0]?.city, "杭州");
  assert.equal(built.snapshot.canonicalFacts.orders[0]?.businessLine, "flexible");
});

test("超级订阅市场底表会识别成 super_subscription_followup 并能 build-session", async () => {
  const upload = await uploadV2Files([
    {
      name: "订阅线索留资跟进表单_日更❗️超级订阅客资_市场底表.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildSuperMarketFollowupWorkbookBuffer().toString("base64"),
    },
  ]);

  const analyzedUpload = await analyzeV2UploadSession(upload.id);
  const response = buildV2AnalyzeResponse(analyzedUpload);

  assert.equal(response.v2Eligible, true);
  assert.equal(response.files[0]?.sourceType, "super_subscription_followup");
  assert.equal(response.entryDashboard, "super_subscription");

  const built = await buildV2AnalysisSession(upload.id);
  assert.equal(built.snapshot.confirmedFiles[0]?.sourceType, "super_subscription_followup");
  assert.ok(built.snapshot.canonicalFacts.summary.totalFollowupLeads >= 2);
  assert.equal(built.snapshot.canonicalFacts.orders[0]?.city, "杭州");
  assert.equal(built.snapshot.canonicalFacts.orders[0]?.businessLine, "super");
});

test("混装市场看板工作簿优先识别内部跟进表，不再误判成 order_source_check", async () => {
  const upload = await uploadV2Files([
    {
      name: "市场营销部门数据看板.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildMixedMarketingDashboardWorkbookBuffer().toString("base64"),
    },
  ]);

  const analyzedUpload = await analyzeV2UploadSession(upload.id);
  const response = buildV2AnalyzeResponse(analyzedUpload);

  assert.equal(response.v2Eligible, true);
  assert.equal(response.files[0]?.sourceType, "super_subscription_followup");
  assert.equal(response.entryDashboard, "super_subscription");
});

test("低置信主线索表支持人工修正，build-session 以人工修正结果为准", async () => {
  const upload = await uploadV2Files([
    {
      name: "ambiguous-lead-sheet.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buildAmbiguousLeadSheetBuffer().toString("base64"),
    },
  ]);

  const analyzedUpload = await analyzeV2UploadSession(upload.id);
  const ambiguousFile = analyzedUpload.files[0];

  assert.equal(ambiguousFile?.sourceType, null);
  assert.equal(ambiguousFile?.v2Eligible, true);
  assert.ok(ambiguousFile?.candidates.includes("super_subscription_followup"));
  assert.ok(ambiguousFile?.candidates.includes("flexible_subscription_followup"));

  const reclassifiedUpload = await reclassifyV2UploadFile(
    analyzedUpload.id,
    ambiguousFile.id,
    "super_subscription_followup",
  );
  const reclassifyResponse = buildV2ReclassifyResponse(
    reclassifiedUpload,
    ambiguousFile.id,
    "super_subscription_followup",
  );

  assert.equal(reclassifyResponse.sourceType, "super_subscription_followup");
  assert.equal(
    reclassifyResponse.upload.files[0]?.manualSourceType,
    "super_subscription_followup",
  );

  const built = await buildV2AnalysisSession(reclassifiedUpload.id);
  const buildResponse = buildV2BuildSessionResponse(built);

  assert.ok(buildResponse.sessionId);
  assert.ok(buildResponse.snapshotId);
  assert.equal(buildResponse.v2Eligible, true);
  assert.equal(buildResponse.entryDashboard, "super_subscription");
  assert.match(buildResponse.entryReason || "", /super_subscription_followup/);
  assert.equal(buildResponse.upload.status, "built");
  assert.equal(buildResponse.v2Files[0]?.sourceType, "super_subscription_followup");
  assert.ok(
    !("entryDashboard" in (buildResponse.snapshot as unknown as Record<string, unknown>)),
  );
  assert.ok(
    !("entryReason" in (buildResponse.snapshot as unknown as Record<string, unknown>)),
  );
});

test("人工改成 Legacy 后再次 analyze 也不会把文件冲回 V2", async () => {
  const upload = await uploadV2Files([
    {
      name: "lead-sheet-real-structure.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: fs.readFileSync(leadSheetFixturePath).toString("base64"),
    },
  ]);

  const analyzedUpload = await analyzeV2UploadSession(upload.id);
  const targetFile = analyzedUpload.files[0];
  assert.ok(targetFile);

  const reclassifiedUpload = await reclassifyV2UploadFile(
    analyzedUpload.id,
    targetFile!.id,
    null,
  );
  assert.equal(reclassifiedUpload.files[0]?.manualOverrideApplied, true);
  assert.equal(reclassifiedUpload.files[0]?.v2Eligible, false);

  const analyzedAgain = await analyzeV2UploadSession(upload.id);
  const response = buildV2AnalyzeResponse(analyzedAgain);

  assert.equal(response.v2Eligible, false);
  assert.equal(response.entryDashboard, undefined);
  assert.equal(response.files[0]?.sourceType, null);
  assert.equal(analyzedAgain.files[0]?.manualOverrideApplied, true);

  await assert.rejects(
    () => buildV2AnalysisSession(upload.id),
    /当前上传内容还没有可进入 V2 六大看板的文件/,
  );
});

test("reclassify 遇到不存在的文件会返回 404", async () => {
  const upload = await uploadV2Files([
    {
      name: "lead-sheet-real-structure.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: fs.readFileSync(leadSheetFixturePath).toString("base64"),
    },
  ]);

  await analyzeV2UploadSession(upload.id);

  await assert.rejects(
    () => reclassifyV2UploadFile(upload.id, "missing-file-id", null),
    (error: any) => {
      assert.equal(error?.statusCode, 404);
      assert.equal(error?.message, "未找到要修正的文件。");
      return true;
    },
  );
});

test("reclassify 会拦截不合法的 sourceType", async () => {
  const upload = await uploadV2Files([
    {
      name: "lead-sheet-real-structure.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: fs.readFileSync(leadSheetFixturePath).toString("base64"),
    },
  ]);

  const analyzedUpload = await analyzeV2UploadSession(upload.id);
  const targetFile = analyzedUpload.files[0];
  assert.ok(targetFile);

  await assert.rejects(
    () =>
      reclassifyV2UploadFile(
        analyzedUpload.id,
        targetFile!.id,
        "bad_source" as any,
      ),
    (error: any) => {
      assert.equal(error?.statusCode, 400);
      assert.equal(error?.message, "sourceType 不合法。");
      return true;
    },
  );
});

test("build-session 无可用 V2 文件时明确报错", async () => {
  const upload = await uploadV2Files([
    {
      name: "daily-smoke.csv",
      mimeType: "text/csv",
      data: fs.readFileSync(marketingTemplateFixturePath).toString("base64"),
    },
  ]);

  await analyzeV2UploadSession(upload.id);

  await assert.rejects(
    () => buildV2AnalysisSession(upload.id),
    /当前上传内容还没有可进入 V2 六大看板的文件/,
  );
});

test("现有主线索表 fixture 能进入 followup adapter", async () => {
  const upload = await uploadV2Files([
    {
      name: "lead-sheet-real-structure.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: fs.readFileSync(leadSheetFixturePath).toString("base64"),
    },
  ]);

  const analyzedUpload = await analyzeV2UploadSession(upload.id);
  const file = analyzedUpload.files[0];

  assert.equal(file?.v2Eligible, true);
  assert.ok(
    file?.sourceType === "super_subscription_followup" ||
      file?.sourceType === "flexible_subscription_followup",
  );
  assert.match(file?.reason || "", /主线索表/);
});
