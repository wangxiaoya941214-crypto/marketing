import { randomUUID } from "node:crypto";
import postgres, { type Sql } from "postgres";
import type {
  V2AgentThread,
  V2AlertConfig,
  V2AnalysisSessionRecord,
  V2SnapshotRecord,
  V2UploadFileRecord,
  V2UploadSessionRecord,
} from "./types.ts";

type PostgresRow = Record<string, unknown>;

type V2Store = {
  ensureSchema(): Promise<void>;
  createUploadSessionRecord(
    files: Array<Pick<V2UploadFileRecord, "name" | "mimeType" | "size" | "data">>,
  ): Promise<V2UploadSessionRecord>;
  getUploadSessionRecord(uploadId: string): Promise<V2UploadSessionRecord | null>;
  saveUploadSessionRecord(record: V2UploadSessionRecord): Promise<void>;
  saveSnapshotRecord(snapshot: V2SnapshotRecord): Promise<void>;
  getSnapshotRecord(snapshotId: string): Promise<V2SnapshotRecord | null>;
  listSnapshotRecords(): Promise<V2SnapshotRecord[]>;
  saveAnalysisSessionRecord(record: V2AnalysisSessionRecord): Promise<void>;
  getAnalysisSessionRecord(sessionId: string): Promise<V2AnalysisSessionRecord | null>;
  saveAgentThread(thread: V2AgentThread): Promise<void>;
  getAgentThread(threadId: string): Promise<V2AgentThread | null>;
  getAlertConfigRecord(): Promise<V2AlertConfig>;
  saveAlertConfigRecord(patch: Partial<V2AlertConfig>): Promise<V2AlertConfig>;
};

const nowIso = () => new Date().toISOString();
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value ?? null));

const DEFAULT_ALERT_CONFIG: V2AlertConfig = {
  redTargetCompletionThreshold: 0.8,
  yellowMomDropThreshold: 0.2,
  feishuWebhook: "",
  enabled: false,
};

type MemoryState = {
  uploads: Map<string, V2UploadSessionRecord>;
  sessions: Map<string, V2AnalysisSessionRecord>;
  snapshots: Map<string, V2SnapshotRecord>;
  agentThreads: Map<string, V2AgentThread>;
  alertConfig: V2AlertConfig;
};

const createMemoryState = (): MemoryState => ({
  uploads: new Map(),
  sessions: new Map(),
  snapshots: new Map(),
  agentThreads: new Map(),
  alertConfig: { ...DEFAULT_ALERT_CONFIG },
});

const memoryState = createMemoryState();

class MemoryV2Store implements V2Store {
  async ensureSchema() {}

  async createUploadSessionRecord(
    files: Array<Pick<V2UploadFileRecord, "name" | "mimeType" | "size" | "data">>,
  ) {
    const record: V2UploadSessionRecord = {
      id: randomUUID(),
      status: "uploaded",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      files: files.map((file) => ({
        id: randomUUID(),
        ...file,
        status: "uploaded",
        legacySourceType: null,
        sourceType: null,
        manualSourceType: null,
        confidence: "low",
        reason: "等待识别。",
        candidates: [],
        v2Eligible: false,
        lowConfidenceNotes: [],
      })),
    };

    memoryState.uploads.set(record.id, record);
    return record;
  }

  async getUploadSessionRecord(uploadId: string) {
    return memoryState.uploads.get(uploadId) || null;
  }

  async saveUploadSessionRecord(record: V2UploadSessionRecord) {
    memoryState.uploads.set(record.id, {
      ...record,
      updatedAt: nowIso(),
    });
  }

  async saveSnapshotRecord(snapshot: V2SnapshotRecord) {
    memoryState.snapshots.set(snapshot.id, snapshot);
  }

  async getSnapshotRecord(snapshotId: string) {
    return memoryState.snapshots.get(snapshotId) || null;
  }

  async listSnapshotRecords() {
    return [...memoryState.snapshots.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  async saveAnalysisSessionRecord(record: V2AnalysisSessionRecord) {
    memoryState.sessions.set(record.id, record);
  }

  async getAnalysisSessionRecord(sessionId: string) {
    return memoryState.sessions.get(sessionId) || null;
  }

  async saveAgentThread(thread: V2AgentThread) {
    memoryState.agentThreads.set(thread.id, thread);
  }

  async getAgentThread(threadId: string) {
    return memoryState.agentThreads.get(threadId) || null;
  }

  async getAlertConfigRecord() {
    return memoryState.alertConfig;
  }

  async saveAlertConfigRecord(patch: Partial<V2AlertConfig>) {
    memoryState.alertConfig = {
      ...memoryState.alertConfig,
      ...patch,
    };
    return memoryState.alertConfig;
  }
}

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
    // Keep safer default for malformed URLs.
  }

  return "require" as const;
};

class PostgresV2Store implements V2Store {
  private sql: Sql;
  private ensured = false;
  private schemaSql = `
    create table if not exists v2_upload_sessions (
      id text primary key,
      status text not null,
      created_at timestamptz not null,
      updated_at timestamptz not null
    );
    create table if not exists v2_upload_files (
      id text not null,
      upload_id text not null,
      name text not null,
      mime_type text not null,
      size bigint not null,
      data text not null,
      status text not null,
      legacy_source_type text,
      source_type text,
      manual_source_type text,
      confidence text not null,
      reason text not null,
      v2_eligible boolean not null,
      low_confidence_notes_json jsonb not null default '[]'::jsonb,
      candidates_json jsonb not null default '[]'::jsonb
    );
    create table if not exists v2_analysis_sessions (
      id text primary key,
      upload_id text not null,
      snapshot_id text not null,
      created_at timestamptz not null
    );
    create table if not exists v2_snapshots (
      id text primary key,
      session_id text not null,
      upload_id text not null,
      created_at timestamptz not null,
      source_coverage_json jsonb not null,
      confirmed_files_json jsonb not null,
      legacy_files_json jsonb not null,
      canonical_facts_json jsonb not null default '{}'::jsonb,
      alerts_json jsonb not null,
      agent_contexts_json jsonb not null default '{}'::jsonb,
      dashboards_json jsonb not null,
      closed_loop_import_job_id text,
      closed_loop_snapshot_id text
    );
    alter table v2_snapshots
      add column if not exists canonical_facts_json jsonb not null default '{}'::jsonb;
    alter table v2_snapshots
      add column if not exists agent_contexts_json jsonb not null default '{}'::jsonb;
    create table if not exists v2_agent_threads (
      id text primary key,
      dashboard_type text not null,
      snapshot_id text not null,
      agent_name text not null,
      messages_json jsonb not null,
      created_at timestamptz not null,
      updated_at timestamptz not null
    );
    create table if not exists v2_alert_config (
      singleton_id boolean primary key default true,
      red_target_completion_threshold numeric not null,
      yellow_mom_drop_threshold numeric not null,
      feishu_webhook text not null,
      enabled boolean not null
    );
    alter table v2_upload_files drop constraint if exists v2_upload_files_pkey;
    alter table v2_upload_files add primary key (upload_id, id);
    create index if not exists v2_upload_files_upload_id_idx on v2_upload_files (upload_id);
    create index if not exists v2_analysis_sessions_upload_id_idx on v2_analysis_sessions (upload_id);
    create index if not exists v2_snapshots_upload_id_created_at_idx on v2_snapshots (upload_id, created_at desc);
    insert into v2_alert_config (
      singleton_id,
      red_target_completion_threshold,
      yellow_mom_drop_threshold,
      feishu_webhook,
      enabled
    ) values (true, 0.8, 0.2, '', false)
    on conflict (singleton_id) do nothing;
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

  async createUploadSessionRecord(
    files: Array<Pick<V2UploadFileRecord, "name" | "mimeType" | "size" | "data">>,
  ) {
    await this.ensureSchema();
    const record: V2UploadSessionRecord = {
      id: randomUUID(),
      status: "uploaded",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      files: files.map((file) => ({
        id: randomUUID(),
        ...file,
        status: "uploaded",
        legacySourceType: null,
        sourceType: null,
        manualSourceType: null,
        confidence: "low",
        reason: "等待识别。",
        candidates: [],
        v2Eligible: false,
        lowConfidenceNotes: [],
      })),
    };

    await this.saveUploadSessionRecord(record);
    return record;
  }

  async getUploadSessionRecord(uploadId: string) {
    await this.ensureSchema();
    const [sessionRows, fileRows] = await Promise.all([
      this.sql<PostgresRow[]>`
        select * from v2_upload_sessions where id = ${uploadId} limit 1
      `,
      this.sql<PostgresRow[]>`
        select * from v2_upload_files where upload_id = ${uploadId} order by id asc
      `,
    ]);

    if (sessionRows.length === 0) {
      return null;
    }

    return mapUploadSessionRow(sessionRows[0], fileRows);
  }

  async saveUploadSessionRecord(record: V2UploadSessionRecord) {
    await this.ensureSchema();
    const nextUpdatedAt = nowIso();
    await this.sql.begin(async (sql) => {
      await sql`
        insert into v2_upload_sessions (
          id, status, created_at, updated_at
        ) values (
          ${record.id}, ${record.status}, ${record.createdAt}, ${nextUpdatedAt}
        )
        on conflict (id) do update
        set status = excluded.status,
            updated_at = excluded.updated_at
      `;

      await sql`delete from v2_upload_files where upload_id = ${record.id}`;

      for (const file of record.files) {
        await sql`
          insert into v2_upload_files (
            id,
            upload_id,
            name,
            mime_type,
            size,
            data,
            status,
            legacy_source_type,
            source_type,
            manual_source_type,
            confidence,
            reason,
            v2_eligible,
            low_confidence_notes_json,
            candidates_json
          ) values (
            ${file.id},
            ${record.id},
            ${file.name},
            ${file.mimeType},
            ${file.size},
            ${file.data},
            ${file.status},
            ${file.legacySourceType},
            ${file.sourceType},
            ${file.manualSourceType},
            ${file.confidence},
            ${file.reason},
            ${file.v2Eligible},
            ${sql.json(asJson(file.lowConfidenceNotes))},
            ${sql.json(asJson(file.candidates))}
          )
        `;
      }
    });
  }

  async saveSnapshotRecord(snapshot: V2SnapshotRecord) {
    await this.ensureSchema();
    await this.sql`
      insert into v2_snapshots (
        id,
        session_id,
        upload_id,
        created_at,
        source_coverage_json,
        confirmed_files_json,
        legacy_files_json,
        canonical_facts_json,
        alerts_json,
        agent_contexts_json,
        dashboards_json,
        closed_loop_import_job_id,
        closed_loop_snapshot_id
      ) values (
        ${snapshot.id},
        ${snapshot.sessionId},
        ${snapshot.uploadId},
        ${snapshot.createdAt},
        ${this.sql.json(asJson(snapshot.sourceCoverage))},
        ${this.sql.json(asJson(snapshot.confirmedFiles))},
        ${this.sql.json(asJson(snapshot.legacyFiles))},
        ${this.sql.json(asJson(snapshot.canonicalFacts))},
        ${this.sql.json(asJson(snapshot.alerts))},
        ${this.sql.json(asJson(snapshot.agentContexts))},
        ${this.sql.json(asJson(snapshot.dashboards))},
        ${snapshot.closedLoopImportJobId},
        ${snapshot.closedLoopSnapshotId}
      )
      on conflict (id) do update
      set session_id = excluded.session_id,
          upload_id = excluded.upload_id,
          created_at = excluded.created_at,
          source_coverage_json = excluded.source_coverage_json,
          confirmed_files_json = excluded.confirmed_files_json,
          legacy_files_json = excluded.legacy_files_json,
          canonical_facts_json = excluded.canonical_facts_json,
          alerts_json = excluded.alerts_json,
          agent_contexts_json = excluded.agent_contexts_json,
          dashboards_json = excluded.dashboards_json,
          closed_loop_import_job_id = excluded.closed_loop_import_job_id,
          closed_loop_snapshot_id = excluded.closed_loop_snapshot_id
    `;
  }

  async getSnapshotRecord(snapshotId: string) {
    await this.ensureSchema();
    const rows = await this.sql<PostgresRow[]>`
      select * from v2_snapshots where id = ${snapshotId} limit 1
    `;
    return rows[0] ? mapSnapshotRow(rows[0]) : null;
  }

  async listSnapshotRecords() {
    await this.ensureSchema();
    const rows = await this.sql<PostgresRow[]>`
      select * from v2_snapshots order by created_at desc
    `;
    return rows.map(mapSnapshotRow);
  }

  async saveAnalysisSessionRecord(record: V2AnalysisSessionRecord) {
    await this.ensureSchema();
    await this.sql`
      insert into v2_analysis_sessions (
        id, upload_id, snapshot_id, created_at
      ) values (
        ${record.id}, ${record.uploadId}, ${record.snapshotId}, ${record.createdAt}
      )
      on conflict (id) do update
      set upload_id = excluded.upload_id,
          snapshot_id = excluded.snapshot_id,
          created_at = excluded.created_at
    `;
  }

  async getAnalysisSessionRecord(sessionId: string) {
    await this.ensureSchema();
    const rows = await this.sql<PostgresRow[]>`
      select * from v2_analysis_sessions where id = ${sessionId} limit 1
    `;
    return rows[0] ? mapAnalysisSessionRow(rows[0]) : null;
  }

  async saveAgentThread(thread: V2AgentThread) {
    await this.ensureSchema();
    await this.sql`
      insert into v2_agent_threads (
        id, dashboard_type, snapshot_id, agent_name, messages_json, created_at, updated_at
      ) values (
        ${thread.id},
        ${thread.dashboardType},
        ${thread.snapshotId},
        ${thread.agentName},
        ${this.sql.json(asJson(thread.messages))},
        ${thread.createdAt},
        ${thread.updatedAt}
      )
      on conflict (id) do update
      set dashboard_type = excluded.dashboard_type,
          snapshot_id = excluded.snapshot_id,
          agent_name = excluded.agent_name,
          messages_json = excluded.messages_json,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
    `;
  }

  async getAgentThread(threadId: string) {
    await this.ensureSchema();
    const rows = await this.sql<PostgresRow[]>`
      select * from v2_agent_threads where id = ${threadId} limit 1
    `;
    return rows[0] ? mapAgentThreadRow(rows[0]) : null;
  }

  async getAlertConfigRecord() {
    await this.ensureSchema();
    const rows = await this.sql<PostgresRow[]>`
      select * from v2_alert_config where singleton_id = true limit 1
    `;
    return rows[0] ? mapAlertConfigRow(rows[0]) : { ...DEFAULT_ALERT_CONFIG };
  }

  async saveAlertConfigRecord(patch: Partial<V2AlertConfig>) {
    await this.ensureSchema();
    const current = await this.getAlertConfigRecord();
    const next = {
      ...current,
      ...patch,
    };

    await this.sql`
      insert into v2_alert_config (
        singleton_id,
        red_target_completion_threshold,
        yellow_mom_drop_threshold,
        feishu_webhook,
        enabled
      ) values (
        true,
        ${next.redTargetCompletionThreshold},
        ${next.yellowMomDropThreshold},
        ${next.feishuWebhook},
        ${next.enabled}
      )
      on conflict (singleton_id) do update
      set red_target_completion_threshold = excluded.red_target_completion_threshold,
          yellow_mom_drop_threshold = excluded.yellow_mom_drop_threshold,
          feishu_webhook = excluded.feishu_webhook,
          enabled = excluded.enabled
    `;

    return next;
  }
}

const mapUploadFileRow = (row: PostgresRow): V2UploadFileRecord => ({
  id: String(row.id),
  name: String(row.name),
  mimeType: String(row.mime_type),
  size: Number(row.size),
  data: String(row.data),
  status: row.status as V2UploadFileRecord["status"],
  legacySourceType: (row.legacy_source_type as V2UploadFileRecord["legacySourceType"]) || null,
  sourceType: (row.source_type as V2UploadFileRecord["sourceType"]) || null,
  manualSourceType: (row.manual_source_type as V2UploadFileRecord["manualSourceType"]) || null,
  confidence: row.confidence as V2UploadFileRecord["confidence"],
  reason: String(row.reason),
  v2Eligible: Boolean(row.v2_eligible),
  lowConfidenceNotes: (row.low_confidence_notes_json as string[]) || [],
  candidates: (row.candidates_json as V2UploadFileRecord["candidates"]) || [],
});

const mapUploadSessionRow = (
  row: PostgresRow,
  fileRows: PostgresRow[],
): V2UploadSessionRecord => ({
  id: String(row.id),
  status: row.status as V2UploadSessionRecord["status"],
  createdAt: new Date(String(row.created_at)).toISOString(),
  updatedAt: new Date(String(row.updated_at)).toISOString(),
  files: fileRows.map(mapUploadFileRow),
});

const mapSnapshotRow = (row: PostgresRow): V2SnapshotRecord => ({
  id: String(row.id),
  sessionId: String(row.session_id),
  uploadId: String(row.upload_id),
  createdAt: new Date(String(row.created_at)).toISOString(),
  sourceCoverage: row.source_coverage_json as V2SnapshotRecord["sourceCoverage"],
  confirmedFiles: row.confirmed_files_json as V2SnapshotRecord["confirmedFiles"],
  legacyFiles: (row.legacy_files_json as string[]) || [],
  canonicalFacts: row.canonical_facts_json as V2SnapshotRecord["canonicalFacts"],
  alerts: row.alerts_json as V2SnapshotRecord["alerts"],
  agentContexts: row.agent_contexts_json as V2SnapshotRecord["agentContexts"],
  dashboards: row.dashboards_json as V2SnapshotRecord["dashboards"],
  closedLoopImportJobId: (row.closed_loop_import_job_id as string | null) || null,
  closedLoopSnapshotId: (row.closed_loop_snapshot_id as string | null) || null,
});

const mapAnalysisSessionRow = (row: PostgresRow): V2AnalysisSessionRecord => ({
  id: String(row.id),
  uploadId: String(row.upload_id),
  snapshotId: String(row.snapshot_id),
  createdAt: new Date(String(row.created_at)).toISOString(),
});

const mapAgentThreadRow = (row: PostgresRow): V2AgentThread => ({
  id: String(row.id),
  dashboardType: row.dashboard_type as V2AgentThread["dashboardType"],
  snapshotId: String(row.snapshot_id),
  agentName: String(row.agent_name),
  messages: (row.messages_json as V2AgentThread["messages"]) || [],
  createdAt: new Date(String(row.created_at)).toISOString(),
  updatedAt: new Date(String(row.updated_at)).toISOString(),
});

const mapAlertConfigRow = (row: PostgresRow): V2AlertConfig => ({
  redTargetCompletionThreshold: Number(row.red_target_completion_threshold),
  yellowMomDropThreshold: Number(row.yellow_mom_drop_threshold),
  feishuWebhook: String(row.feishu_webhook || ""),
  enabled: Boolean(row.enabled),
});

let singletonStore: V2Store | null = null;

const getV2Store = () => {
  if (singletonStore) return singletonStore;

  const databaseUrl = process.env.DATABASE_URL || "";
  const forceMemoryStore = process.env.V2_FORCE_MEMORY_STORE === "1";
  singletonStore =
    databaseUrl && process.env.NODE_ENV !== "test" && !forceMemoryStore
      ? new PostgresV2Store(databaseUrl)
      : new MemoryV2Store();
  return singletonStore;
};

export const createUploadSessionRecord = async (
  files: Array<Pick<V2UploadFileRecord, "name" | "mimeType" | "size" | "data">>,
) => getV2Store().createUploadSessionRecord(files);

export const getUploadSessionRecord = async (uploadId: string) =>
  getV2Store().getUploadSessionRecord(uploadId);

export const saveUploadSessionRecord = async (record: V2UploadSessionRecord) =>
  getV2Store().saveUploadSessionRecord(record);

export const saveSnapshotRecord = async (snapshot: V2SnapshotRecord) =>
  getV2Store().saveSnapshotRecord(snapshot);

export const getSnapshotRecord = async (snapshotId: string) =>
  getV2Store().getSnapshotRecord(snapshotId);

export const listSnapshotRecords = async () => getV2Store().listSnapshotRecords();

export const saveAnalysisSessionRecord = async (record: V2AnalysisSessionRecord) =>
  getV2Store().saveAnalysisSessionRecord(record);

export const getAnalysisSessionRecord = async (sessionId: string) =>
  getV2Store().getAnalysisSessionRecord(sessionId);

export const saveAgentThread = async (thread: V2AgentThread) =>
  getV2Store().saveAgentThread(thread);

export const getAgentThread = async (threadId: string) =>
  getV2Store().getAgentThread(threadId);

export const getAlertConfigRecord = async () => getV2Store().getAlertConfigRecord();

export const saveAlertConfigRecord = async (patch: Partial<V2AlertConfig>) =>
  getV2Store().saveAlertConfigRecord(patch);

export const resetV2StoreForTests = async () => {
  memoryState.uploads.clear();
  memoryState.sessions.clear();
  memoryState.snapshots.clear();
  memoryState.agentThreads.clear();
  memoryState.alertConfig = { ...DEFAULT_ALERT_CONFIG };
  singletonStore = null;
};
