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
  assert.equal(buildResponse.v2Files[0]?.sourceType, "super_subscription_followup");
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
