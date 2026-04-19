import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import {
  detectLeadSheet,
  type TabularSheet,
} from "../adapters/lead-sheet/detect-lead-sheet.ts";
import {
  isDealLeadRow,
  normalizeLeadRows,
} from "../adapters/lead-sheet/normalize-lead-row.ts";
import type {
  ClosedLoopImportBundle,
  ContentTouchpointRecord,
} from "../closed-loop/types.ts";
import { parseClosedLoopWorkbook } from "../closed-loop/workbook.ts";
import type { V2UploadFileRecord } from "./types.ts";
import type {
  V2AttributionRule,
  V2BusinessLine,
  V2CanonicalFacts,
  V2CanonicalLeadFact,
  V2CanonicalOrderFact,
  V2CanonicalTouchpointFact,
  V2Confidence,
  V2PhoneMatchType,
  V2SourceType,
} from "./types.ts";

type SpreadsheetRecord = Record<string, string>;

const normalizeCell = (value: unknown) =>
  String(value ?? "")
    .replace(/\r?\n/g, " ")
    .trim();

const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length >= 11) {
    return digits.slice(-11);
  }
  return digits;
};

const last8 = (value: string) => {
  const phone = normalizePhone(value);
  return phone.length >= 8 ? phone.slice(-8) : "";
};

const normalizeCity = (value: string) =>
  normalizeCell(value)
    .replace(/省|市|区|县/g, "")
    .replace(/\s+/g, "")
    .trim();

const normalizeDate = (value: string) => {
  const raw = normalizeCell(value);
  if (!raw) return "";
  const normalized = raw
    .replace(/[.年/]/g, "-")
    .replace(/月/g, "-")
    .replace(/日/g, "")
    .replace(/\s+/g, " ");
  const matched = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!matched) return raw;
  return `${matched[1]}-${matched[2].padStart(2, "0")}-${matched[3].padStart(2, "0")}`;
};

const dateToTs = (value: string) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const inferChannel = (...values: string[]) => {
  const joined = values.join(" ").trim();
  if (/小红书|xhs|red/i.test(joined)) return "小红书";
  if (/抖音|douyin/i.test(joined)) return "抖音";
  if (/视频号|微信视频号/i.test(joined)) return "视频号";
  if (/私域|老客|老客户|复购|转介绍|微信|企微/i.test(joined)) return "私域";
  return joined || "未知渠道";
};

const inferAccountType = (...values: string[]) => {
  const joined = values.join(" ").trim();
  if (/老孙|IP/i.test(joined)) return "IP号";
  if (/品牌/i.test(joined)) return "品牌号";
  if (/私域|老客|老客户|复购|转介绍/i.test(joined)) return "私域";
  return "待确认";
};

const normalizeBusinessLine = (value: string): V2BusinessLine => {
  if (/超级/.test(value)) return "super";
  if (/灵活/.test(value)) return "flexible";
  return "unknown";
};

const inferBusinessLineFromFileName = (fileName: string): V2BusinessLine => {
  if (/超级/.test(fileName)) return "super";
  if (/灵活/.test(fileName)) return "flexible";
  return "unknown";
};

const inferAttribution = (input: {
  creativeId?: string;
  noteId?: string;
  channel?: string;
}): { rule: V2AttributionRule; target: string } => {
  if (normalizeCell(input.creativeId)) {
    return {
      rule: "creative_id",
      target: normalizeCell(input.creativeId),
    };
  }
  if (normalizeCell(input.noteId)) {
    return {
      rule: "note_id",
      target: normalizeCell(input.noteId),
    };
  }
  if (normalizeCell(input.channel)) {
    return {
      rule: "channel",
      target: normalizeCell(input.channel),
    };
  }
  return {
    rule: "unknown",
    target: "unknown",
  };
};

const readSheets = (file: V2UploadFileRecord): TabularSheet[] => {
  const workbook = XLSX.read(Buffer.from(file.data, "base64"), {
    type: "buffer",
    cellDates: true,
  });

  return workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils
      .sheet_to_json<unknown[]>(worksheet, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false,
      })
      .map((row) => row.map((cell) => normalizeCell(cell)));

    return {
      name: sheetName,
      rows,
    };
  });
};

const readFirstSheetRecords = (file: V2UploadFileRecord): SpreadsheetRecord[] => {
  const workbook = XLSX.read(Buffer.from(file.data, "base64"), {
    type: "buffer",
    cellDates: true,
  });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<SpreadsheetRecord>(firstSheet, {
    raw: false,
    defval: "",
  }) as SpreadsheetRecord[];
};

const buildLeadFact = (input: Omit<V2CanonicalLeadFact, "phoneLast8" | "attributionRule" | "attributionTarget">) => {
  const attribution = inferAttribution({
    creativeId: input.creativeId,
    noteId: input.noteId,
    channel: input.channel,
  });
  return {
    ...input,
    phoneLast8: last8(input.phone),
    attributionRule: attribution.rule,
    attributionTarget: attribution.target,
  } satisfies V2CanonicalLeadFact;
};

const buildTouchpointFact = (
  input: Omit<V2CanonicalTouchpointFact, "attributionRule" | "attributionTarget">,
) => {
  const attribution = inferAttribution({
    creativeId: input.creativeId,
    noteId: input.noteId,
    channel: input.channel,
  });
  return {
    ...input,
    attributionRule: attribution.rule,
    attributionTarget: attribution.target,
  } satisfies V2CanonicalTouchpointFact;
};

const buildOrderFact = (
  input: Omit<V2CanonicalOrderFact, "phoneLast8" | "attributionRule" | "attributionTarget">,
) => {
  const attribution = inferAttribution({
    creativeId: "",
    noteId: "",
    channel: input.orderSource,
  });
  return {
    ...input,
    phoneLast8: last8(input.phone),
    attributionRule: attribution.rule,
    attributionTarget: attribution.target,
  } satisfies V2CanonicalOrderFact;
};

const parseClosedLoopFacts = (
  file: V2UploadFileRecord,
  bundle: ClosedLoopImportBundle,
) => {
  const leads: V2CanonicalLeadFact[] = [];
  const touchpoints: V2CanonicalTouchpointFact[] = [];
  const orders: V2CanonicalOrderFact[] = [];

  bundle.xhsLeads.forEach((item) => {
    leads.push(
      buildLeadFact({
        id: `xhs-${item.id}`,
        sourceType: "closed_loop_workbook",
        sourceFileName: file.name,
        leadKind: "traffic",
        businessLine: "unknown",
        phone: item.phone || item.contactKey,
        city: normalizeCity(item.region),
        leadDate: normalizeDate(item.leadDate || ""),
        channel: inferChannel(item.account, item.trafficType),
        accountType: inferAccountType(item.account, item.trafficType),
        salesOwner: "",
        noteId: item.noteId || "",
        creativeId: item.creativeId || "",
        planName: item.creativeName || "",
        matchType: "unmatched",
        matchConfidence: "low",
        matchedLeadId: null,
      }),
    );
  });

  bundle.crmLeads.forEach((item) => {
    leads.push(
      buildLeadFact({
        id: `crm-${item.id}`,
        sourceType: "closed_loop_workbook",
        sourceFileName: file.name,
        leadKind: "followup",
        businessLine: item.businessType,
        phone: item.contactKey,
        city: normalizeCity(item.city),
        leadDate: normalizeDate(item.leadDate || ""),
        channel: inferChannel(item.channel, item.channelDetail),
        accountType: inferAccountType(item.channel, item.channelDetail),
        salesOwner: item.salesOwner,
        noteId: "",
        creativeId: "",
        planName: "",
        matchType: "unmatched",
        matchConfidence: "low",
        matchedLeadId: null,
      }),
    );
  });

  bundle.contentTouchpoints.forEach((item: ContentTouchpointRecord) => {
    const spend = Number(item.metrics["消费"] || item.metrics["投放消费"] || 0) || 0;
    const leadCount =
      Number(
        item.metrics["XHS线索数"] ||
          item.metrics["私信留资数"] ||
          item.metrics["私信留资总人数"] ||
          0,
      ) || 0;
    const registerCount = Number(item.metrics["注册量"] || item.metrics["注册人数"] || 0) || 0;
    const orderCount = Number(item.metrics["下单数"] || 0) || 0;

    touchpoints.push(
      buildTouchpointFact({
        id: item.id,
        sourceType: "closed_loop_workbook",
        sourceFileName: file.name,
        touchpointType:
          item.touchpointType === "plan"
            ? "ad_plan"
            : item.touchpointType === "daily"
              ? "daily"
              : "note",
        businessLine: item.productType,
        eventDate: normalizeDate(item.occurredAt || ""),
        channel: inferChannel(item.channel, item.channelDetail),
        accountType: inferAccountType(item.channel, item.channelDetail),
        noteId: item.noteId || "",
        creativeId: item.creativeName || "",
        planName: item.planName || item.touchpointKey,
        spend,
        leads: leadCount,
        registrations: registerCount,
        orders: orderCount,
      }),
    );
  });

  bundle.orders
    .filter((item) => item.ordered)
    .forEach((item) => {
      const lead = bundle.crmLeads.find((crm) => crm.id === item.crmLeadId);
      orders.push(
        buildOrderFact({
          id: item.id,
          sourceType: "closed_loop_workbook",
          sourceFileName: file.name,
          businessLine: lead?.businessType || "unknown",
          phone: lead?.contactKey || "",
          city: normalizeCity(lead?.city || ""),
          orderDate: normalizeDate(item.orderedAt || item.dealDate || ""),
          orderSource: item.orderSourceStandardized || item.orderSource || "未知来源",
        }),
      );
    });

  return { leads, touchpoints, orders };
};

const parseFollowupFacts = (file: V2UploadFileRecord, sourceType: V2SourceType) => {
  const sheets = readSheets(file);
  const detection = detectLeadSheet(sheets);
  if (detection.kind !== "lead_detail_sheet") {
    return {
      leads: [] as V2CanonicalLeadFact[],
      orders: [] as V2CanonicalOrderFact[],
    };
  }

  const normalized = normalizeLeadRows(sheets, detection).rows;
  const businessLine =
    sourceType === "super_subscription_followup"
      ? "super"
      : sourceType === "flexible_subscription_followup"
        ? "flexible"
        : "unknown";

  const leads = normalized.map((row) =>
    buildLeadFact({
      id: `${sourceType}-${row.sheetName}-${row.rowNumber}`,
      sourceType,
      sourceFileName: file.name,
      leadKind: "followup",
      businessLine: businessLine === "unknown" ? row.businessType : businessLine,
      phone: row.phone,
      city: normalizeCity(row.city || row.channelDetail || row.channelGroup),
      leadDate: normalizeDate(row.leadDate),
      channel: inferChannel(row.channel, row.channelDetail),
      accountType: inferAccountType(row.channel, row.channelDetail),
      salesOwner: row.salesOwner,
      noteId: "",
      creativeId: "",
      planName: "",
      matchType: "unmatched",
      matchConfidence: "low",
      matchedLeadId: null,
    }),
  );

  const orders = normalized
    .filter((row) => isDealLeadRow(row))
    .map((row) =>
      buildOrderFact({
        id: `${sourceType}-order-${row.sheetName}-${row.rowNumber}`,
        sourceType,
        sourceFileName: file.name,
        businessLine: businessLine === "unknown" ? row.businessType : businessLine,
        phone: row.phone,
        city: normalizeCity(row.city || row.channelDetail || row.channelGroup),
        orderDate: normalizeDate(row.orderDate || row.dealDate),
        orderSource: inferChannel(row.channel, row.channelDetail),
      }),
    );

  return { leads, orders };
};

const parseXhsLeadFacts = (file: V2UploadFileRecord) => {
  const rows = readFirstSheetRecords(file);
  return rows.map((row, index) =>
    buildLeadFact({
      id: `${file.id}-lead-${index + 1}`,
      sourceType: "xhs_lead_list",
      sourceFileName: file.name,
      leadKind: "traffic",
      businessLine: "unknown",
      phone: normalizeCell(row["手机号"] || row["联络主键"] || row["匹配主键"]),
      city: normalizeCity(normalizeCell(row["地区"] || row["城市"])),
      leadDate: normalizeDate(normalizeCell(row["线索生成时间"])),
      channel: inferChannel(
        normalizeCell(row["归属账号"]),
        normalizeCell(row["流量类型"]),
      ),
      accountType: inferAccountType(
        normalizeCell(row["归属账号"]),
        normalizeCell(row["流量类型"]),
      ),
      salesOwner: "",
      noteId: normalizeCell(row["来源笔记ID"] || row["笔记ID"]),
      creativeId: normalizeCell(row["创意ID"] || row["创意名称标准化"]),
      planName: normalizeCell(row["创意名称"] || row["创意名称标准化"]),
      matchType: "unmatched",
      matchConfidence: "low",
      matchedLeadId: null,
    }),
  );
};

const parseAdTouchpoints = (file: V2UploadFileRecord, sourceType: V2SourceType) => {
  const rows = readFirstSheetRecords(file);
  return rows.map((row, index) =>
    buildTouchpointFact({
      id: `${file.id}-touchpoint-${index + 1}`,
      sourceType,
      sourceFileName: file.name,
      touchpointType:
        sourceType === "video_performance"
          ? "video"
          : sourceType === "daily_register"
            ? "register"
            : sourceType === "ad_plan_spend"
              ? "ad_plan"
              : "daily",
      businessLine: normalizeBusinessLine(
        normalizeCell(row["业务类型"] || row["产品"] || row["产品归属"]),
      ),
      eventDate: normalizeDate(normalizeCell(row["日期"] || row["发布时间"] || row["创建时间"])),
      channel: inferChannel(
        normalizeCell(row["平台"] || row["渠道"]),
        normalizeCell(row["账号类型"] || row["账号"]),
      ),
      accountType: inferAccountType(
        normalizeCell(row["账号类型"] || row["账号"]),
        normalizeCell(row["计划名称_标准化"] || row["内容标题"] || row["视频标题"]),
      ),
      noteId: normalizeCell(row["笔记ID"] || row["来源笔记ID"]),
      creativeId: normalizeCell(
        row["创意ID"] ||
          row["创意名称标准化"] ||
          row["计划名称_标准化"],
      ),
      planName: normalizeCell(
        row["计划名称_标准化"] ||
          row["内容标题"] ||
          row["视频标题"] ||
          row["来源笔记"],
      ),
      spend:
        Number(
          normalizeCell(row["消费"] || row["投放消费"] || row["花费"]).replace(/,/g, ""),
        ) || 0,
      leads:
        Number(
          normalizeCell(
            row["私信留资数"] ||
              row["投放私信留资数"] ||
              row["XHS线索数"] ||
              row["留资"],
          ).replace(/,/g, ""),
        ) || 0,
      registrations:
        Number(
          normalizeCell(
            row["注册量"] || row["注册人数"] || row["小程序注册"],
          ).replace(/,/g, ""),
        ) || 0,
      orders:
        Number(normalizeCell(row["下单数"] || row["成交贡献"]).replace(/,/g, "")) || 0,
    }),
  );
};

const parseOrderFacts = (file: V2UploadFileRecord) => {
  const rows = readFirstSheetRecords(file);
  return rows.map((row, index) =>
    buildOrderFact({
      id: `${file.id}-order-${index + 1}`,
      sourceType: "order_source_check",
      sourceFileName: file.name,
      businessLine:
        normalizeBusinessLine(
          normalizeCell(row["业务线"] || row["业务类型"] || row["产品"]),
        ) !== "unknown"
          ? normalizeBusinessLine(
              normalizeCell(row["业务线"] || row["业务类型"] || row["产品"]),
            )
          : inferBusinessLineFromFileName(file.name),
      phone: normalizeCell(row["手机号"] || row["联络主键"] || row["手机号码"]),
      city: normalizeCity(normalizeCell(row["城市"] || row["地区"] || row["用车城市"])),
      orderDate: normalizeDate(normalizeCell(row["下单时间"] || row["日期"])),
      orderSource: normalizeCell(
        row["订单来源"] || row["归因渠道"] || row["来源核查"] || row["平台来源"] || row["备注"],
      ),
    }),
  );
};

const applyPhoneMatching = (leads: V2CanonicalLeadFact[]) => {
  const trafficLeads = leads.filter((lead) => lead.leadKind === "traffic");
  const followupLeads = leads.filter((lead) => lead.leadKind === "followup");

  trafficLeads.forEach((lead) => {
    const exact = followupLeads.find(
      (candidate) =>
        candidate.phone &&
        lead.phone &&
        candidate.phone === lead.phone,
    );

    if (exact) {
      lead.matchType = "exact";
      lead.matchConfidence = "high";
      lead.matchedLeadId = exact.id;
      return;
    }

    const leadDateTs = dateToTs(lead.leadDate);
    const fuzzy = followupLeads.find((candidate) => {
      if (!lead.phoneLast8 || candidate.phoneLast8 !== lead.phoneLast8) {
        return false;
      }
      if (lead.city && candidate.city && lead.city !== candidate.city) {
        return false;
      }
      const candidateDateTs = dateToTs(candidate.leadDate);
      if (leadDateTs === null || candidateDateTs === null) {
        return true;
      }
      return Math.abs(leadDateTs - candidateDateTs) <= 7 * 24 * 60 * 60 * 1000;
    });

    if (fuzzy) {
      lead.matchType = "fuzzy";
      lead.matchConfidence = "medium";
      lead.matchedLeadId = fuzzy.id;
      return;
    }

    lead.matchType = "unmatched";
    lead.matchConfidence = "low";
    lead.matchedLeadId = null;
  });
};

export const buildV2CanonicalFacts = async (
  files: V2UploadFileRecord[],
): Promise<V2CanonicalFacts> => {
  const leads: V2CanonicalLeadFact[] = [];
  const touchpoints: V2CanonicalTouchpointFact[] = [];
  const orders: V2CanonicalOrderFact[] = [];

  for (const file of files) {
    const sourceType = (file.manualSourceType || file.sourceType) as V2SourceType | null;
    if (!sourceType) continue;

    if (sourceType === "closed_loop_workbook") {
      const bundle = parseClosedLoopWorkbook(
        Buffer.from(file.data, "base64"),
        `v2-canonical-${randomUUID()}`,
      );
      const parsed = parseClosedLoopFacts(file, bundle);
      leads.push(...parsed.leads);
      touchpoints.push(...parsed.touchpoints);
      orders.push(...parsed.orders);
      continue;
    }

    if (
      sourceType === "super_subscription_followup" ||
      sourceType === "flexible_subscription_followup"
    ) {
      const parsed = parseFollowupFacts(file, sourceType);
      leads.push(...parsed.leads);
      orders.push(...parsed.orders);
      continue;
    }

    if (sourceType === "xhs_lead_list") {
      leads.push(...parseXhsLeadFacts(file));
      continue;
    }

    if (
      sourceType === "ad_plan_spend" ||
      sourceType === "video_performance" ||
      sourceType === "daily_register"
    ) {
      touchpoints.push(...parseAdTouchpoints(file, sourceType));
      continue;
    }

    if (sourceType === "order_source_check") {
      orders.push(...parseOrderFacts(file));
    }
  }

  applyPhoneMatching(leads);

  const matchingSummary = {
    exact: leads.filter((lead) => lead.leadKind === "traffic" && lead.matchType === "exact")
      .length,
    fuzzy: leads.filter((lead) => lead.leadKind === "traffic" && lead.matchType === "fuzzy")
      .length,
    unmatched: leads.filter(
      (lead) => lead.leadKind === "traffic" && lead.matchType === "unmatched",
    ).length,
    lowConfidence: leads.filter((lead) => lead.matchConfidence !== "high").length,
  };

  const attributionSummary = {
    creativeId:
      leads.filter((lead) => lead.attributionRule === "creative_id").length +
      touchpoints.filter((item) => item.attributionRule === "creative_id").length +
      orders.filter((item) => item.attributionRule === "creative_id").length,
    noteId:
      leads.filter((lead) => lead.attributionRule === "note_id").length +
      touchpoints.filter((item) => item.attributionRule === "note_id").length +
      orders.filter((item) => item.attributionRule === "note_id").length,
    channel:
      leads.filter((lead) => lead.attributionRule === "channel").length +
      touchpoints.filter((item) => item.attributionRule === "channel").length +
      orders.filter((item) => item.attributionRule === "channel").length,
    unknown:
      leads.filter((lead) => lead.attributionRule === "unknown").length +
      touchpoints.filter((item) => item.attributionRule === "unknown").length +
      orders.filter((item) => item.attributionRule === "unknown").length,
  };

  const buildBusinessSummary = (businessLine: V2BusinessLine | "all") => {
    const leadItems =
      businessLine === "all"
        ? leads
        : leads.filter((item) => item.businessLine === businessLine);
    const touchpointItems =
      businessLine === "all"
        ? touchpoints
        : touchpoints.filter((item) => item.businessLine === businessLine);
    const orderItems =
      businessLine === "all"
        ? orders
        : orders.filter((item) => item.businessLine === businessLine);

    return {
      leads: leadItems.length,
      trafficLeads: leadItems.filter((item) => item.leadKind === "traffic").length,
      followupLeads: leadItems.filter((item) => item.leadKind === "followup").length,
      touchpoints: touchpointItems.length,
      orders: orderItems.length,
      spend: touchpointItems.reduce((sum, item) => sum + item.spend, 0),
    };
  };

  return {
    leads,
    touchpoints,
    orders,
    summary: {
      totalLeads: leads.length,
      totalTrafficLeads: leads.filter((item) => item.leadKind === "traffic").length,
      totalFollowupLeads: leads.filter((item) => item.leadKind === "followup").length,
      totalTouchpoints: touchpoints.length,
      totalOrders: orders.length,
      totalSpend: touchpoints.reduce((sum, item) => sum + item.spend, 0),
      matching: matchingSummary,
      attribution: attributionSummary,
      byBusinessLine: {
        all: buildBusinessSummary("all"),
        super: buildBusinessSummary("super"),
        flexible: buildBusinessSummary("flexible"),
        unknown: buildBusinessSummary("unknown"),
      },
    },
  };
};
