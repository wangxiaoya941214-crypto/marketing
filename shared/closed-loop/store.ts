import { randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";
import { buildImportProgressSummary } from "./import-summary.ts";
import type {
  ClosedLoopAiStatus,
  ClosedLoopAnalysisSnapshot,
  ClosedLoopImportBundle,
  ContentTouchpointRecord,
  CrmLeadRecord,
  ImportJobRecord,
  LeadJourneyRecord,
  LeadLinkRecord,
  LinkReviewStatus,
  OrderRecord,
  ReviewDecisionRecord,
  ReviewQueueFilters,
  ReviewDecisionType,
  ReviewQueueSummary,
  ReviewSearchCandidate,
  ReviewQueueItem,
  SourceType,
  XhsLeadRecord,
} from "./types.ts";

type StoreBundle = {
  importSummary: Record<string, unknown>;
  contentTouchpoints: ContentTouchpointRecord[];
  xhsLeads: XhsLeadRecord[];
  crmLeads: CrmLeadRecord[];
  leadJourneys: LeadJourneyRecord[];
  orders: OrderRecord[];
  leadLinks: LeadLinkRecord[];
  reviewDecisions: ReviewDecisionRecord[];
  snapshotHistory: ClosedLoopAnalysisSnapshot[];
  snapshot: ClosedLoopAnalysisSnapshot | null;
};

export interface ClosedLoopStore {
  ensureSchema(): Promise<void>;
  getImportJob(importJobId: string): Promise<ImportJobRecord | null>;
  createImportJob(input: {
    fileName: string;
    sourceType: SourceType;
    summary?: Record<string, unknown>;
  }): Promise<ImportJobRecord>;
  updateImportJob(
    importJobId: string,
    patch: Partial<
      Pick<
        ImportJobRecord,
        | "status"
        | "errorMessage"
        | "summary"
        | "currentSnapshotId"
        | "aiStatus"
        | "aiStartedAt"
        | "aiFinishedAt"
        | "aiAttempts"
        | "aiError"
      >
    >,
  ): Promise<void>;
  listImportJobs(): Promise<ImportJobRecord[]>;
  saveImportBundle(importJobId: string, bundle: ClosedLoopImportBundle): Promise<void>;
  getImportBundle(importJobId: string): Promise<StoreBundle | null>;
  saveSnapshot(importJobId: string, snapshot: ClosedLoopAnalysisSnapshot): Promise<void>;
  getSnapshot(importJobId: string): Promise<ClosedLoopAnalysisSnapshot | null>;
  searchReviewCandidates(importJobId: string, query: string): Promise<ReviewSearchCandidate[]>;
  claimAiRefreshLock(importJobId: string, staleBeforeIso: string): Promise<boolean>;
  listReviewQueue(importJobId: string): Promise<ReviewQueueItem[]>;
  applyReviewDecision(input: {
    importJobId: string;
    xhsLeadId: string;
    decisionType: ReviewDecisionType;
    actor: string;
    note?: string;
    nextCrmLeadId?: string | null;
  }): Promise<void>;
}

type MemoryState = {
  importJobs: Map<string, ImportJobRecord>;
  bundles: Map<string, StoreBundle>;
};

const nowIso = () => new Date().toISOString();
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value ?? null));
const DEFAULT_AI_STATUS: ClosedLoopAiStatus = "pending";
const toNullableNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const createMemoryState = (): MemoryState => ({
  importJobs: new Map(),
  bundles: new Map(),
});

const memoryState = createMemoryState();

class MemoryClosedLoopStore implements ClosedLoopStore {
  async ensureSchema() {}

  async createImportJob(input: {
    fileName: string;
    sourceType: SourceType;
    summary?: Record<string, unknown>;
  }): Promise<ImportJobRecord> {
    const now = nowIso();
    const job: ImportJobRecord = {
      id: randomUUID(),
      sourceType: input.sourceType,
      fileName: input.fileName,
      status: "queued",
      currentSnapshotId: null,
      aiStatus: DEFAULT_AI_STATUS,
      aiStartedAt: null,
      aiFinishedAt: null,
      aiAttempts: 0,
      aiError: null,
      errorMessage: null,
      summary: input.summary || {},
      createdAt: now,
      updatedAt: now,
    };
    memoryState.importJobs.set(job.id, job);
    memoryState.bundles.set(job.id, {
      importSummary: {},
      contentTouchpoints: [],
      xhsLeads: [],
      crmLeads: [],
      leadJourneys: [],
      orders: [],
      leadLinks: [],
      reviewDecisions: [],
      snapshotHistory: [],
      snapshot: null,
    });
    return job;
  }

  async getImportJob(importJobId: string) {
    return memoryState.importJobs.get(importJobId) || null;
  }

  async updateImportJob(
    importJobId: string,
    patch: Partial<
      Pick<
        ImportJobRecord,
        | "status"
        | "errorMessage"
        | "summary"
        | "currentSnapshotId"
        | "aiStatus"
        | "aiStartedAt"
        | "aiFinishedAt"
        | "aiAttempts"
        | "aiError"
      >
    >,
  ) {
    const current = memoryState.importJobs.get(importJobId);
    if (!current) return;
    memoryState.importJobs.set(importJobId, {
      ...current,
      ...patch,
      updatedAt: nowIso(),
    });
  }

  async listImportJobs() {
    return [...memoryState.importJobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async saveImportBundle(importJobId: string, bundle: ClosedLoopImportBundle) {
    const current = memoryState.bundles.get(importJobId);
    if (!current) return;
    memoryState.bundles.set(importJobId, {
      ...current,
      importSummary: bundle.importSummary,
      contentTouchpoints: bundle.contentTouchpoints,
      xhsLeads: bundle.xhsLeads,
      crmLeads: bundle.crmLeads,
      leadJourneys: bundle.leadJourneys,
      orders: bundle.orders,
      leadLinks: bundle.leadLinks,
    });
  }

  async getImportBundle(importJobId: string) {
    return memoryState.bundles.get(importJobId) || null;
  }

  async saveSnapshot(importJobId: string, snapshot: ClosedLoopAnalysisSnapshot) {
    const current = memoryState.bundles.get(importJobId);
    const job = memoryState.importJobs.get(importJobId);
    if (!current || !job) return;
    current.snapshotHistory = [...current.snapshotHistory.filter((item) => item.id !== snapshot.id), snapshot];
    current.snapshot = snapshot;
    memoryState.bundles.set(importJobId, current);
    memoryState.importJobs.set(importJobId, {
      ...job,
      currentSnapshotId: snapshot.id,
      aiStatus: snapshot.aiStatus,
      aiFinishedAt: snapshot.aiUpdatedAt,
      aiError: snapshot.aiError,
      updatedAt: nowIso(),
    });
  }

  async getSnapshot(importJobId: string) {
    const job = memoryState.importJobs.get(importJobId);
    const bundle = memoryState.bundles.get(importJobId);
    if (!job || !bundle) return null;
    if (!job.currentSnapshotId) return bundle.snapshot || null;
    return (
      bundle.snapshotHistory.find((item) => item.id === job.currentSnapshotId) ||
      bundle.snapshot ||
      null
    );
  }

  async searchReviewCandidates(importJobId: string, query: string) {
    const bundle = memoryState.bundles.get(importJobId);
    if (!bundle) return [];
    return rankReviewCandidates(bundle.crmLeads, query);
  }

  async claimAiRefreshLock(importJobId: string, staleBeforeIso: string) {
    const current = memoryState.importJobs.get(importJobId);
    if (!current) return false;
    const staleBefore = new Date(staleBeforeIso).getTime();
    const startedAt = current.aiStartedAt ? new Date(current.aiStartedAt).getTime() : null;
    const blocked =
      current.aiStatus === "running" &&
      startedAt !== null &&
      !Number.isNaN(startedAt) &&
      startedAt >= staleBefore;
    if (blocked) return false;

    memoryState.importJobs.set(importJobId, {
      ...current,
      summary: buildImportProgressSummary(
        {
          fileName: current.fileName,
          status: current.status,
          aiStatus: "running",
          currentSnapshotId: current.currentSnapshotId,
          currentSnapshotVersion: toNullableNumber(
            current.summary["当前快照版本"] ?? current.summary["currentSnapshotVersion"],
          ),
          lastError: null,
          workbookSheetCount: toNullableNumber(
            current.summary["工作簿表数"] ?? current.summary["workbookSheetCount"],
          ),
          parsedSheetCount: toNullableNumber(
            current.summary["解析表数"] ?? current.summary["parsedSheetCount"],
          ),
          parsedRowCount: toNullableNumber(
            current.summary["解析行数"] ?? current.summary["parsedRowCount"],
          ),
          highConfidenceMatchedCount: toNullableNumber(
            current.summary["高置信打通数"] ?? current.summary["highConfidenceMatchedCount"],
          ),
          reviewQueueCount: toNullableNumber(
            current.summary["待复核数"] ?? current.summary["reviewQueueCount"],
          ),
        },
        current.summary,
      ),
      aiStatus: "running",
      aiStartedAt: nowIso(),
      aiAttempts: current.aiAttempts + 1,
      aiError: null,
      updatedAt: nowIso(),
    });
    return true;
  }

  async listReviewQueue(importJobId: string) {
    const bundle = memoryState.bundles.get(importJobId);
    if (!bundle) return [];
    return buildReviewQueue(bundle);
  }

  async applyReviewDecision(input: {
    importJobId: string;
    xhsLeadId: string;
    decisionType: ReviewDecisionType;
    actor: string;
    note?: string;
    nextCrmLeadId?: string | null;
  }) {
    const bundle = memoryState.bundles.get(input.importJobId);
    if (!bundle) return;
    const link = bundle.leadLinks.find((item) => item.xhsLeadId === input.xhsLeadId);
    if (!link) return;
    const previousCrmLeadId = link.crmLeadId;

    if (input.decisionType === "confirm_match") {
      link.reviewStatus = "confirmed";
      link.confidence = link.confidence === "manual" ? "manual" : "high";
      link.issue = "";
    } else if (input.decisionType === "mark_unmatched") {
      link.reviewStatus = "unmatched";
      link.crmLeadId = null;
      link.confidence = "manual";
      link.issue = input.note || "人工标记为未匹配";
    } else if (input.decisionType === "change_match") {
      link.reviewStatus = "confirmed";
      link.crmLeadId = input.nextCrmLeadId || null;
      link.confidence = "manual";
      link.issue = input.note || "";
    }

    bundle.reviewDecisions.push({
      id: randomUUID(),
      importJobId: input.importJobId,
      xhsLeadId: input.xhsLeadId,
      previousCrmLeadId,
      nextCrmLeadId: link.crmLeadId,
      decisionType: input.decisionType,
      note: input.note || "",
      actor: input.actor,
      createdAt: nowIso(),
    });
  }
}

type PostgresRow = Record<string, unknown>;

const resolvePostgresSslMode = (databaseUrl: string) => {
  try {
    const parsed = new URL(databaseUrl);
    const hostParam = parsed.searchParams.get("host") || "";
    const host = parsed.hostname || hostParam;
    const sslMode = (parsed.searchParams.get("sslmode") || "").toLowerCase();
    const ssl = (parsed.searchParams.get("ssl") || "").toLowerCase();
    const isLocalHost =
      !host ||
      host === "127.0.0.1" ||
      host === "localhost" ||
      host === "::1" ||
      host.startsWith("/");

    if (sslMode === "disable" || ssl === "false" || isLocalHost) {
      return false;
    }
  } catch {
    // Ignore malformed URL parsing and keep the safer remote default below.
  }

  return "require" as const;
};

class PostgresClosedLoopStore implements ClosedLoopStore {
  private sql: Sql;
  private ensured = false;
  private schemaSql = `
    create table if not exists import_jobs (
      id text primary key,
      source_type text not null,
      file_name text not null,
      status text not null,
      current_snapshot_id text,
      ai_status text not null default 'pending',
      ai_started_at timestamptz,
      ai_finished_at timestamptz,
      ai_attempts integer not null default 0,
      ai_error text,
      error_message text,
      summary_json jsonb not null default '{}'::jsonb,
      created_at timestamptz not null,
      updated_at timestamptz not null
    );
    create table if not exists content_touchpoints (
      id text not null,
      import_job_id text not null,
      touchpoint_type text not null,
      touchpoint_key text not null,
      product_type text not null,
      channel text not null,
      channel_detail text not null,
      note_title text not null,
      note_id text not null,
      plan_name text not null,
      creative_name text not null,
      occurred_at timestamptz,
      metrics_json jsonb not null,
      raw_json jsonb not null
    );
    create table if not exists xhs_leads (
      id text not null,
      import_job_id text not null,
      lead_date timestamptz,
      account text not null,
      note_title text not null,
      note_id text not null,
      traffic_type text not null,
      creative_name text not null,
      creative_id text not null,
      conversion_type text not null,
      phone text not null,
      wechat text not null,
      contact_key text not null,
      region text not null,
      raw_json jsonb not null
    );
    create table if not exists crm_leads (
      id text not null,
      import_job_id text not null,
      lead_date timestamptz,
      contact_key text not null,
      customer_identity text not null,
      city text not null,
      vehicle_intent text not null,
      sales_owner text not null,
      channel text not null,
      channel_detail text not null,
      business_type text not null,
      source_type text not null,
      province text not null,
      raw_json jsonb not null
    );
    create table if not exists lead_journeys (
      id text not null,
      import_job_id text not null,
      crm_lead_id text not null,
      added_wechat boolean not null,
      added_wechat_at timestamptz,
      high_intent boolean not null,
      intent_grade text not null,
      not_ordered_reason text not null,
      loss_reason text not null,
      order_status text not null,
      order_progress text not null,
      raw_json jsonb not null
    );
    create table if not exists orders (
      id text not null,
      import_job_id text not null,
      crm_lead_id text not null,
      external_order_id text not null,
      ordered boolean not null,
      ordered_at timestamptz,
      deal_date timestamptz,
      order_source text not null,
      order_source_standardized text not null,
      match_method text not null,
      match_note text not null,
      raw_json jsonb not null
    );
    create table if not exists lead_links (
      id text not null,
      import_job_id text not null,
      xhs_lead_id text not null,
      crm_lead_id text,
      match_key text not null,
      confidence text not null,
      review_status text not null,
      match_days_delta numeric,
      issue text not null,
      note_title text not null,
      plan_name text not null,
      raw_json jsonb not null
    );
    create table if not exists review_decisions (
      id text primary key,
      import_job_id text not null,
      xhs_lead_id text not null,
      previous_crm_lead_id text,
      next_crm_lead_id text,
      decision_type text not null,
      note text not null,
      actor text not null,
      created_at timestamptz not null
    );
    create table if not exists analysis_snapshots (
      id text primary key,
      import_job_id text not null,
      version integer not null default 1,
      generated_at timestamptz not null,
      marketing_input_json jsonb not null,
      dashboard_json jsonb not null,
      analysis_text text not null,
      insights_json jsonb not null,
      ai_status text not null default 'pending',
      ai_updated_at timestamptz,
      ai_error text,
      cockpit_json jsonb not null
    );
    alter table import_jobs add column if not exists current_snapshot_id text;
    alter table import_jobs add column if not exists ai_status text not null default 'pending';
    alter table import_jobs add column if not exists ai_started_at timestamptz;
    alter table import_jobs add column if not exists ai_finished_at timestamptz;
    alter table import_jobs add column if not exists ai_attempts integer not null default 0;
    alter table import_jobs add column if not exists ai_error text;
    alter table content_touchpoints drop constraint if exists content_touchpoints_pkey;
    alter table content_touchpoints add primary key (import_job_id, id);
    alter table xhs_leads drop constraint if exists xhs_leads_pkey;
    alter table xhs_leads add primary key (import_job_id, id);
    alter table crm_leads drop constraint if exists crm_leads_pkey;
    alter table crm_leads add primary key (import_job_id, id);
    alter table lead_journeys drop constraint if exists lead_journeys_pkey;
    alter table lead_journeys add primary key (import_job_id, id);
    alter table orders drop constraint if exists orders_pkey;
    alter table orders add primary key (import_job_id, id);
    alter table lead_links drop constraint if exists lead_links_pkey;
    alter table lead_links add primary key (import_job_id, id);
    alter table analysis_snapshots add column if not exists version integer not null default 1;
    alter table analysis_snapshots add column if not exists ai_status text not null default 'pending';
    alter table analysis_snapshots add column if not exists ai_updated_at timestamptz;
    alter table analysis_snapshots add column if not exists ai_error text;
    create index if not exists import_jobs_status_created_at_idx on import_jobs (status, created_at desc);
    create index if not exists lead_links_import_job_review_status_confidence_idx on lead_links (import_job_id, review_status, confidence);
    create index if not exists xhs_leads_import_job_contact_key_idx on xhs_leads (import_job_id, contact_key);
    create index if not exists crm_leads_import_job_contact_key_idx on crm_leads (import_job_id, contact_key);
    create index if not exists analysis_snapshots_import_job_generated_at_idx on analysis_snapshots (import_job_id, generated_at desc);
  `;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, {
      max: 1,
      ssl: resolvePostgresSslMode(databaseUrl),
      idle_timeout: 20,
      connect_timeout: 20,
    });
  }

  async ensureSchema() {
    if (this.ensured) return;
    await this.sql.unsafe(this.schemaSql);
    this.ensured = true;
  }

  async createImportJob(input: {
    fileName: string;
    sourceType: SourceType;
    summary?: Record<string, unknown>;
  }): Promise<ImportJobRecord> {
    const now = nowIso();
    const job: ImportJobRecord = {
      id: randomUUID(),
      sourceType: input.sourceType,
      fileName: input.fileName,
      status: "queued",
      currentSnapshotId: null,
      aiStatus: DEFAULT_AI_STATUS,
      aiStartedAt: null,
      aiFinishedAt: null,
      aiAttempts: 0,
      aiError: null,
      errorMessage: null,
      summary: input.summary || {},
      createdAt: now,
      updatedAt: now,
    };
    await this.ensureSchema();
    await this.sql`
      insert into import_jobs (
        id, source_type, file_name, status, current_snapshot_id, ai_status, ai_started_at, ai_finished_at,
        ai_attempts, ai_error, error_message, summary_json, created_at, updated_at
      ) values (
        ${job.id}, ${job.sourceType}, ${job.fileName}, ${job.status}, ${job.currentSnapshotId}, ${job.aiStatus},
        ${job.aiStartedAt}, ${job.aiFinishedAt}, ${job.aiAttempts}, ${job.aiError}, ${job.errorMessage},
        ${this.sql.json(asJson(job.summary))}, ${job.createdAt}, ${job.updatedAt}
      )
    `;
    return job;
  }

  async getImportJob(importJobId: string) {
    await this.ensureSchema();
    const rows = await this.sql<PostgresRow[]>`select * from import_jobs where id = ${importJobId} limit 1`;
    return rows[0] ? mapImportJobRow(rows[0]) : null;
  }

  async updateImportJob(
    importJobId: string,
    patch: Partial<
      Pick<
        ImportJobRecord,
        | "status"
        | "errorMessage"
        | "summary"
        | "currentSnapshotId"
        | "aiStatus"
        | "aiStartedAt"
        | "aiFinishedAt"
        | "aiAttempts"
        | "aiError"
      >
    >,
  ) {
    await this.ensureSchema();
    const currentRows = await this.sql<PostgresRow[]>`select * from import_jobs where id = ${importJobId} limit 1`;
    const current = currentRows[0];
    if (!current) return;
    const nextStatus = (patch.status || current.status) as ImportJobRecord["status"];
    const nextCurrentSnapshotId =
      patch.currentSnapshotId ?? (current.current_snapshot_id as string | null) ?? null;
    const nextAiStatus =
      (patch.aiStatus ?? current.ai_status ?? DEFAULT_AI_STATUS) as ImportJobRecord["aiStatus"];
    const nextAiStartedAt =
      patch.aiStartedAt ?? (current.ai_started_at ? new Date(String(current.ai_started_at)).toISOString() : null);
    const nextAiFinishedAt =
      patch.aiFinishedAt ?? (current.ai_finished_at ? new Date(String(current.ai_finished_at)).toISOString() : null);
    const nextAiAttempts =
      patch.aiAttempts ?? Number(current.ai_attempts ?? 0);
    const nextAiError = patch.aiError ?? (current.ai_error as string | null) ?? null;
    const nextError = patch.errorMessage ?? (current.error_message as string | null) ?? null;
    const nextSummary =
      patch.summary ?? ((current.summary_json as Record<string, unknown>) || {});
    await this.sql`
      update import_jobs
      set status = ${nextStatus},
          current_snapshot_id = ${nextCurrentSnapshotId},
          ai_status = ${nextAiStatus},
          ai_started_at = ${nextAiStartedAt},
          ai_finished_at = ${nextAiFinishedAt},
          ai_attempts = ${nextAiAttempts},
          ai_error = ${nextAiError},
          error_message = ${nextError},
          summary_json = ${this.sql.json(asJson(nextSummary))},
          updated_at = ${nowIso()}
      where id = ${importJobId}
    `;
  }

  async listImportJobs() {
    await this.ensureSchema();
    const rows = await this.sql<PostgresRow[]>`select * from import_jobs order by created_at desc limit 20`;
    return rows.map(mapImportJobRow);
  }

  async saveImportBundle(importJobId: string, bundle: ClosedLoopImportBundle) {
    await this.ensureSchema();
    await this.sql.begin(async (sql) => {
      await sql`delete from content_touchpoints where import_job_id = ${importJobId}`;
      await sql`delete from xhs_leads where import_job_id = ${importJobId}`;
      await sql`delete from crm_leads where import_job_id = ${importJobId}`;
      await sql`delete from lead_journeys where import_job_id = ${importJobId}`;
      await sql`delete from orders where import_job_id = ${importJobId}`;
      await sql`delete from lead_links where import_job_id = ${importJobId}`;
      await sql`delete from review_decisions where import_job_id = ${importJobId}`;
      await sql`delete from analysis_snapshots where import_job_id = ${importJobId}`;

      for (const row of bundle.contentTouchpoints) {
        await sql`
          insert into content_touchpoints (
            id, import_job_id, touchpoint_type, touchpoint_key, product_type, channel, channel_detail,
            note_title, note_id, plan_name, creative_name, occurred_at, metrics_json, raw_json
          ) values (
            ${row.id}, ${row.importJobId}, ${row.touchpointType}, ${row.touchpointKey}, ${row.productType},
            ${row.channel}, ${row.channelDetail}, ${row.noteTitle}, ${row.noteId}, ${row.planName},
            ${row.creativeName}, ${row.occurredAt}, ${sql.json(asJson(row.metrics))}, ${sql.json(asJson(row.raw))}
          )
        `;
      }

      for (const row of bundle.xhsLeads) {
        await sql`
          insert into xhs_leads (
            id, import_job_id, lead_date, account, note_title, note_id, traffic_type, creative_name,
            creative_id, conversion_type, phone, wechat, contact_key, region, raw_json
          ) values (
            ${row.id}, ${row.importJobId}, ${row.leadDate}, ${row.account}, ${row.noteTitle}, ${row.noteId},
            ${row.trafficType}, ${row.creativeName}, ${row.creativeId}, ${row.conversionType},
            ${row.phone}, ${row.wechat}, ${row.contactKey}, ${row.region}, ${sql.json(asJson(row.raw))}
          )
        `;
      }

      for (const row of bundle.crmLeads) {
        await sql`
          insert into crm_leads (
            id, import_job_id, lead_date, contact_key, customer_identity, city, vehicle_intent,
            sales_owner, channel, channel_detail, business_type, source_type, province, raw_json
          ) values (
            ${row.id}, ${row.importJobId}, ${row.leadDate}, ${row.contactKey}, ${row.customerIdentity},
            ${row.city}, ${row.vehicleIntent}, ${row.salesOwner}, ${row.channel}, ${row.channelDetail},
            ${row.businessType}, ${row.sourceType}, ${row.province}, ${sql.json(asJson(row.raw))}
          )
        `;
      }

      for (const row of bundle.leadJourneys) {
        await sql`
          insert into lead_journeys (
            id, import_job_id, crm_lead_id, added_wechat, added_wechat_at, high_intent, intent_grade,
            not_ordered_reason, loss_reason, order_status, order_progress, raw_json
          ) values (
            ${row.id}, ${row.importJobId}, ${row.crmLeadId}, ${row.addedWechat}, ${row.addedWechatAt},
            ${row.highIntent}, ${row.intentGrade}, ${row.notOrderedReason}, ${row.lossReason},
            ${row.orderStatus}, ${row.orderProgress}, ${sql.json(asJson(row.raw))}
          )
        `;
      }

      for (const row of bundle.orders) {
        await sql`
          insert into orders (
            id, import_job_id, crm_lead_id, external_order_id, ordered, ordered_at, deal_date,
            order_source, order_source_standardized, match_method, match_note, raw_json
          ) values (
            ${row.id}, ${row.importJobId}, ${row.crmLeadId}, ${row.externalOrderId}, ${row.ordered},
            ${row.orderedAt}, ${row.dealDate}, ${row.orderSource}, ${row.orderSourceStandardized},
            ${row.matchMethod}, ${row.matchNote}, ${sql.json(asJson(row.raw))}
          )
        `;
      }

      for (const row of bundle.leadLinks) {
        await sql`
          insert into lead_links (
            id, import_job_id, xhs_lead_id, crm_lead_id, match_key, confidence, review_status,
            match_days_delta, issue, note_title, plan_name, raw_json
          ) values (
            ${row.id}, ${row.importJobId}, ${row.xhsLeadId}, ${row.crmLeadId}, ${row.matchKey},
            ${row.confidence}, ${row.reviewStatus}, ${row.matchDaysDelta}, ${row.issue},
            ${row.noteTitle}, ${row.planName}, ${sql.json(asJson(row.raw))}
          )
        `;
      }
    });
  }

  async getImportBundle(importJobId: string) {
    await this.ensureSchema();
    const [jobRows, contentRows, xhsRows, crmRows, journeyRows, orderRows, linkRows, reviewRows, snapshotRows] =
      await Promise.all([
        this.sql<PostgresRow[]>`select summary_json, current_snapshot_id from import_jobs where id = ${importJobId} limit 1`,
        this.sql<PostgresRow[]>`select * from content_touchpoints where import_job_id = ${importJobId}`,
        this.sql<PostgresRow[]>`select * from xhs_leads where import_job_id = ${importJobId}`,
        this.sql<PostgresRow[]>`select * from crm_leads where import_job_id = ${importJobId}`,
        this.sql<PostgresRow[]>`select * from lead_journeys where import_job_id = ${importJobId}`,
        this.sql<PostgresRow[]>`select * from orders where import_job_id = ${importJobId}`,
        this.sql<PostgresRow[]>`select * from lead_links where import_job_id = ${importJobId}`,
        this.sql<PostgresRow[]>`select * from review_decisions where import_job_id = ${importJobId}`,
        this.sql<PostgresRow[]>`select * from analysis_snapshots where import_job_id = ${importJobId} order by version desc, generated_at desc`,
      ]);

    if (jobRows.length === 0) return null;

    return {
      importSummary: (jobRows[0].summary_json as Record<string, unknown>) || {},
      contentTouchpoints: contentRows.map(mapTouchpointRow),
      xhsLeads: xhsRows.map(mapXhsLeadRow),
      crmLeads: crmRows.map(mapCrmLeadRow),
      leadJourneys: journeyRows.map(mapJourneyRow),
      orders: orderRows.map(mapOrderRow),
      leadLinks: linkRows.map(mapLeadLinkRow),
      reviewDecisions: reviewRows.map(mapReviewDecisionRow),
      snapshotHistory: snapshotRows.map(mapSnapshotRow),
      snapshot:
        snapshotRows.find((row) => String(row.id) === String(jobRows[0].current_snapshot_id || "")) ?
          mapSnapshotRow(snapshotRows.find((row) => String(row.id) === String(jobRows[0].current_snapshot_id || ""))!) :
          (snapshotRows[0] ? mapSnapshotRow(snapshotRows[0]) : null),
    };
  }

  async saveSnapshot(importJobId: string, snapshot: ClosedLoopAnalysisSnapshot) {
    await this.ensureSchema();
    await this.sql`
      insert into analysis_snapshots (
        id, import_job_id, version, generated_at, marketing_input_json, dashboard_json, analysis_text, insights_json,
        ai_status, ai_updated_at, ai_error, cockpit_json
      ) values (
        ${snapshot.id}, ${importJobId}, ${snapshot.version}, ${snapshot.generatedAt},
        ${this.sql.json(asJson(snapshot.marketingInput))},
        ${this.sql.json(asJson(snapshot.dashboard))},
        ${snapshot.analysis},
        ${this.sql.json(asJson(snapshot.insights))},
        ${snapshot.aiStatus},
        ${snapshot.aiUpdatedAt},
        ${snapshot.aiError},
        ${this.sql.json(asJson(snapshot.cockpit))}
      )
      on conflict (id) do update
      set version = excluded.version,
          generated_at = excluded.generated_at,
          marketing_input_json = excluded.marketing_input_json,
          dashboard_json = excluded.dashboard_json,
          analysis_text = excluded.analysis_text,
          insights_json = excluded.insights_json,
          ai_status = excluded.ai_status,
          ai_updated_at = excluded.ai_updated_at,
          ai_error = excluded.ai_error,
          cockpit_json = excluded.cockpit_json
    `;
    await this.updateImportJob(importJobId, {
      currentSnapshotId: snapshot.id,
      aiStatus: snapshot.aiStatus,
      aiFinishedAt: snapshot.aiUpdatedAt,
      aiError: snapshot.aiError,
    });
  }

  async getSnapshot(importJobId: string) {
    await this.ensureSchema();
    const currentJob = await this.getImportJob(importJobId);
    const rows = currentJob?.currentSnapshotId
      ? await this.sql<PostgresRow[]>`
          select * from analysis_snapshots where id = ${currentJob.currentSnapshotId}
          limit 1
        `
      : await this.sql<PostgresRow[]>`
          select * from analysis_snapshots where import_job_id = ${importJobId}
          order by version desc, generated_at desc limit 1
        `;
    return rows[0] ? mapSnapshotRow(rows[0]) : null;
  }

  async searchReviewCandidates(importJobId: string, query: string) {
    await this.ensureSchema();
    const rows = await this.sql<PostgresRow[]>`
      select *
      from crm_leads
      where import_job_id = ${importJobId}
    `;
    return rankReviewCandidates(rows.map(mapCrmLeadRow), query);
  }

  async claimAiRefreshLock(importJobId: string, staleBeforeIso: string) {
    await this.ensureSchema();
    const now = nowIso();
    const rows = await this.sql<PostgresRow[]>`
      update import_jobs
      set ai_status = 'running',
          ai_started_at = ${now},
          ai_attempts = coalesce(ai_attempts, 0) + 1,
          ai_error = null,
          summary_json = coalesce(summary_json, '{}'::jsonb) || jsonb_build_object(
            'AI状态', 'running',
            'aiStatus', 'running',
            '最近错误摘要', null,
            'lastError', null
          ),
          updated_at = ${now}
      where id = ${importJobId}
        and (
          ai_status is distinct from 'running'
          or ai_started_at is null
          or ai_started_at < ${staleBeforeIso}
        )
      returning id
    `;
    return rows.length > 0;
  }

  async listReviewQueue(importJobId: string) {
    const bundle = await this.getImportBundle(importJobId);
    if (!bundle) return [];
    return buildReviewQueue(bundle);
  }

  async applyReviewDecision(input: {
    importJobId: string;
    xhsLeadId: string;
    decisionType: ReviewDecisionType;
    actor: string;
    note?: string;
    nextCrmLeadId?: string | null;
  }) {
    await this.ensureSchema();
    const currentRows = await this.sql<PostgresRow[]>`
      select * from lead_links where import_job_id = ${input.importJobId} and xhs_lead_id = ${input.xhsLeadId} limit 1
    `;
    const current = currentRows[0];
    if (!current) return;

    const previousCrmLeadId = (current.crm_lead_id as string | null) || null;
    let reviewStatus: LinkReviewStatus = "confirmed";
    let confidence: "high" | "low" | "manual" = "manual";
    let crmLeadId = input.nextCrmLeadId ?? previousCrmLeadId;
    let issue = "";

    if (input.decisionType === "mark_unmatched") {
      reviewStatus = "unmatched";
      crmLeadId = null;
      issue = input.note || "人工标记为未匹配";
    } else if (input.decisionType === "confirm_match") {
      reviewStatus = "confirmed";
      confidence = previousCrmLeadId ? "high" : "manual";
    } else if (input.decisionType === "change_match") {
      reviewStatus = "confirmed";
      confidence = "manual";
      issue = input.note || "";
    }

    await this.sql.begin(async (sql) => {
      await sql`
        update lead_links
        set crm_lead_id = ${crmLeadId},
            confidence = ${confidence},
            review_status = ${reviewStatus},
            issue = ${issue}
        where import_job_id = ${input.importJobId} and xhs_lead_id = ${input.xhsLeadId}
      `;

      await sql`
        insert into review_decisions (
          id, import_job_id, xhs_lead_id, previous_crm_lead_id, next_crm_lead_id, decision_type, note, actor, created_at
        ) values (
          ${randomUUID()}, ${input.importJobId}, ${input.xhsLeadId}, ${previousCrmLeadId}, ${crmLeadId},
          ${input.decisionType}, ${input.note || ""}, ${input.actor}, ${nowIso()}
        )
      `;
    });
  }
}

const mapImportJobRow = (row: PostgresRow): ImportJobRecord => ({
  id: String(row.id),
  sourceType: row.source_type as SourceType,
  fileName: String(row.file_name),
  status: row.status as ImportJobRecord["status"],
  currentSnapshotId: (row.current_snapshot_id as string | null) || null,
  aiStatus: (row.ai_status as ImportJobRecord["aiStatus"]) || DEFAULT_AI_STATUS,
  aiStartedAt: row.ai_started_at ? new Date(String(row.ai_started_at)).toISOString() : null,
  aiFinishedAt: row.ai_finished_at ? new Date(String(row.ai_finished_at)).toISOString() : null,
  aiAttempts: Number(row.ai_attempts ?? 0),
  aiError: (row.ai_error as string | null) || null,
  errorMessage: (row.error_message as string | null) || null,
  summary: (row.summary_json as Record<string, unknown>) || {},
  createdAt: new Date(String(row.created_at)).toISOString(),
  updatedAt: new Date(String(row.updated_at)).toISOString(),
});

const mapTouchpointRow = (row: PostgresRow): ContentTouchpointRecord => ({
  id: String(row.id),
  importJobId: String(row.import_job_id),
  touchpointType: row.touchpoint_type as ContentTouchpointRecord["touchpointType"],
  touchpointKey: String(row.touchpoint_key),
  productType: row.product_type as ContentTouchpointRecord["productType"],
  channel: String(row.channel),
  channelDetail: String(row.channel_detail),
  noteTitle: String(row.note_title),
  noteId: String(row.note_id),
  planName: String(row.plan_name),
  creativeName: String(row.creative_name),
  occurredAt: row.occurred_at ? new Date(String(row.occurred_at)).toISOString() : null,
  metrics: (row.metrics_json as Record<string, number | string | null>) || {},
  raw: (row.raw_json as Record<string, unknown>) || {},
});

const mapXhsLeadRow = (row: PostgresRow): XhsLeadRecord => ({
  id: String(row.id),
  importJobId: String(row.import_job_id),
  leadDate: row.lead_date ? new Date(String(row.lead_date)).toISOString() : null,
  account: String(row.account),
  noteTitle: String(row.note_title),
  noteId: String(row.note_id),
  trafficType: String(row.traffic_type),
  creativeName: String(row.creative_name),
  creativeId: String(row.creative_id),
  conversionType: String(row.conversion_type),
  phone: String(row.phone),
  wechat: String(row.wechat),
  contactKey: String(row.contact_key),
  region: String(row.region),
  raw: (row.raw_json as Record<string, unknown>) || {},
});

const mapCrmLeadRow = (row: PostgresRow): CrmLeadRecord => ({
  id: String(row.id),
  importJobId: String(row.import_job_id),
  leadDate: row.lead_date ? new Date(String(row.lead_date)).toISOString() : null,
  contactKey: String(row.contact_key),
  customerIdentity: String(row.customer_identity),
  city: String(row.city),
  vehicleIntent: String(row.vehicle_intent),
  salesOwner: String(row.sales_owner),
  channel: String(row.channel),
  channelDetail: String(row.channel_detail),
  businessType: row.business_type as CrmLeadRecord["businessType"],
  sourceType: String(row.source_type),
  province: String(row.province),
  raw: (row.raw_json as Record<string, unknown>) || {},
});

const mapJourneyRow = (row: PostgresRow): LeadJourneyRecord => ({
  id: String(row.id),
  importJobId: String(row.import_job_id),
  crmLeadId: String(row.crm_lead_id),
  addedWechat: Boolean(row.added_wechat),
  addedWechatAt: row.added_wechat_at ? new Date(String(row.added_wechat_at)).toISOString() : null,
  highIntent: Boolean(row.high_intent),
  intentGrade: String(row.intent_grade),
  notOrderedReason: String(row.not_ordered_reason),
  lossReason: String(row.loss_reason),
  orderStatus: String(row.order_status),
  orderProgress: String(row.order_progress),
  raw: (row.raw_json as Record<string, unknown>) || {},
});

const mapOrderRow = (row: PostgresRow): OrderRecord => ({
  id: String(row.id),
  importJobId: String(row.import_job_id),
  crmLeadId: String(row.crm_lead_id),
  externalOrderId: String(row.external_order_id),
  ordered: Boolean(row.ordered),
  orderedAt: row.ordered_at ? new Date(String(row.ordered_at)).toISOString() : null,
  dealDate: row.deal_date ? new Date(String(row.deal_date)).toISOString() : null,
  orderSource: String(row.order_source),
  orderSourceStandardized: String(row.order_source_standardized),
  matchMethod: String(row.match_method),
  matchNote: String(row.match_note),
  raw: (row.raw_json as Record<string, unknown>) || {},
});

const mapLeadLinkRow = (row: PostgresRow): LeadLinkRecord => ({
  id: String(row.id),
  importJobId: String(row.import_job_id),
  xhsLeadId: String(row.xhs_lead_id),
  crmLeadId: (row.crm_lead_id as string | null) || null,
  matchKey: String(row.match_key),
  confidence: row.confidence as LeadLinkRecord["confidence"],
  reviewStatus: row.review_status as LeadLinkRecord["reviewStatus"],
  matchDaysDelta: row.match_days_delta === null ? null : Number(row.match_days_delta),
  issue: String(row.issue),
  noteTitle: String(row.note_title),
  planName: String(row.plan_name),
  raw: (row.raw_json as Record<string, unknown>) || {},
});

const mapReviewDecisionRow = (row: PostgresRow): ReviewDecisionRecord => ({
  id: String(row.id),
  importJobId: String(row.import_job_id),
  xhsLeadId: String(row.xhs_lead_id),
  previousCrmLeadId: (row.previous_crm_lead_id as string | null) || null,
  nextCrmLeadId: (row.next_crm_lead_id as string | null) || null,
  decisionType: row.decision_type as ReviewDecisionType,
  note: String(row.note),
  actor: String(row.actor),
  createdAt: new Date(String(row.created_at)).toISOString(),
});

const mapSnapshotRow = (row: PostgresRow): ClosedLoopAnalysisSnapshot => ({
  id: String(row.id),
  importJobId: String(row.import_job_id),
  version: Number(row.version ?? 1),
  generatedAt: new Date(String(row.generated_at)).toISOString(),
  marketingInput: row.marketing_input_json as ClosedLoopAnalysisSnapshot["marketingInput"],
  dashboard: row.dashboard_json as ClosedLoopAnalysisSnapshot["dashboard"],
  analysis: String(row.analysis_text),
  insights: row.insights_json as ClosedLoopAnalysisSnapshot["insights"],
  aiStatus: (row.ai_status as ClosedLoopAnalysisSnapshot["aiStatus"]) || DEFAULT_AI_STATUS,
  aiUpdatedAt: row.ai_updated_at ? new Date(String(row.ai_updated_at)).toISOString() : null,
  aiError: (row.ai_error as string | null) || null,
  cockpit: row.cockpit_json as ClosedLoopAnalysisSnapshot["cockpit"],
});

const buildReviewQueue = (bundle: StoreBundle): ReviewQueueItem[] => {
  const xhsLeadMap = new Map(bundle.xhsLeads.map((row) => [row.id, row]));
  const crmLeadMap = new Map(bundle.crmLeads.map((row) => [row.id, row]));

  return bundle.leadLinks
    .filter((link) => link.reviewStatus === "pending")
    .map((link) => {
      const xhsLead = xhsLeadMap.get(link.xhsLeadId);
      const crmLead = link.crmLeadId ? crmLeadMap.get(link.crmLeadId) : null;
      return {
        xhsLeadId: link.xhsLeadId,
        nickname: normalizeString(xhsLead?.raw["用户小红书昵称"]),
        contactKey: xhsLead?.contactKey || link.matchKey,
        phone: xhsLead?.phone || "",
        wechat: xhsLead?.wechat || "",
        noteTitle: link.noteTitle || xhsLead?.noteTitle || "",
        planName: link.planName || normalizeString(xhsLead?.raw["创意名称_标准化"]),
        trafficType: xhsLead?.trafficType || "",
        region: xhsLead?.region || "",
        matchedCrmLeadId: link.crmLeadId,
        matchedConfidence: link.confidence,
        reviewStatus: link.reviewStatus,
        matchDaysDelta: link.matchDaysDelta,
        issue: link.issue,
        salesOwner: crmLead?.salesOwner || "",
        businessType: crmLead?.businessType || "",
        matchedCrmLeadSummary: crmLead
          ? `${crmLead.customerIdentity || crmLead.contactKey} / ${crmLead.salesOwner || "未分配销售"} / ${crmLead.city || "未知城市"}`
          : "未匹配",
      };
    })
    .sort((a, b) => (a.matchDaysDelta ?? 999) - (b.matchDaysDelta ?? 999));
};

export const filterReviewQueue = (
  reviewQueue: ReviewQueueItem[],
  filters: ReviewQueueFilters = {},
) => {
  const normalizedQuery = String(filters.query || "")
    .trim()
    .toLowerCase();

  return reviewQueue.filter((item) => {
    const businessTypeMatched =
      !filters.businessType ||
      filters.businessType === "all" ||
      item.businessType === filters.businessType;

    if (!businessTypeMatched) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const haystack = [
      item.contactKey,
      item.phone,
      item.wechat,
      item.nickname,
      item.noteTitle,
      item.planName,
      item.salesOwner,
      item.businessType,
      item.issue,
      item.matchedCrmLeadSummary,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
};

export const buildReviewQueueSummary = (
  reviewQueue: ReviewQueueItem[],
): ReviewQueueSummary => ({
  totalPending: reviewQueue.length,
  byBusinessType: Object.entries(
    reviewQueue.reduce<Record<string, number>>((acc, item) => {
      const key = item.businessType || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  )
    .map(([businessType, count]) => ({ businessType, count }))
    .sort((a, b) => b.count - a.count),
  byIssue: Object.entries(
    reviewQueue.reduce<Record<string, number>>((acc, item) => {
      const key = item.issue || "待确认";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  )
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count),
});

const normalizeString = (value: unknown) => String(value ?? "").trim();

const rankReviewCandidates = (crmLeads: CrmLeadRecord[], query: string): ReviewSearchCandidate[] => {
  const normalizedQuery = normalizeString(query).toLowerCase();
  if (!normalizedQuery) return [];

  const scored = crmLeads
    .map((lead) => {
      const fields = {
        contactKey: lead.contactKey.toLowerCase(),
        customerIdentity: lead.customerIdentity.toLowerCase(),
        salesOwner: lead.salesOwner.toLowerCase(),
        city: lead.city.toLowerCase(),
        vehicleIntent: lead.vehicleIntent.toLowerCase(),
      };

      let score = 0;
      let reason = "";

      if (fields.contactKey === normalizedQuery) {
        score = 100;
        reason = "联络主键完全匹配";
      } else if (fields.customerIdentity === normalizedQuery) {
        score = 95;
        reason = "客户标识完全匹配";
      } else if (fields.contactKey.startsWith(normalizedQuery)) {
        score = 80;
        reason = "联络主键前缀匹配";
      } else if (fields.customerIdentity.includes(normalizedQuery)) {
        score = 70;
        reason = "客户标识模糊匹配";
      } else if (fields.salesOwner.includes(normalizedQuery)) {
        score = 60;
        reason = "销售归属匹配";
      } else if (fields.city.includes(normalizedQuery)) {
        score = 50;
        reason = "城市匹配";
      } else if (fields.vehicleIntent.includes(normalizedQuery)) {
        score = 40;
        reason = "意向车型匹配";
      } else {
        return null;
      }

      return {
        crmLeadId: lead.id,
        customerIdentity: lead.customerIdentity,
        contactKey: lead.contactKey,
        salesOwner: lead.salesOwner,
        city: lead.city,
        businessType: lead.businessType,
        leadDate: lead.leadDate,
        reason,
        score,
      };
    })
    .filter((item): item is ReviewSearchCandidate & { score: number } => Boolean(item))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const leftTime = left.leadDate ? new Date(left.leadDate).getTime() : 0;
      const rightTime = right.leadDate ? new Date(right.leadDate).getTime() : 0;
      return rightTime - leftTime;
    })
    .slice(0, 8);

  return scored.map(({ score: _score, ...item }) => item);
};

let singletonStore: ClosedLoopStore | null = null;

export const getClosedLoopStore = () => {
  if (singletonStore) return singletonStore;

  const databaseUrl = process.env.DATABASE_URL || "";

  singletonStore = databaseUrl
    ? new PostgresClosedLoopStore(databaseUrl)
    : new MemoryClosedLoopStore();

  return singletonStore;
};
