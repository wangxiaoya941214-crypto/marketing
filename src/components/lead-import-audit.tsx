import type { LeadSheetAdapterSidecar } from "../../shared/adapters/lead-sheet/build-marketing-input-from-leads";

const StatBlock = ({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "warn" | "danger";
}) => {
  const toneClassName =
    tone === "danger"
      ? "bg-red-50 text-red-700 border-red-100"
      : tone === "warn"
        ? "bg-yellow-50 text-yellow-700 border-yellow-100"
        : "bg-gray-50 text-gray-700 border-gray-100";

  return (
    <div className={`rounded-2xl border px-4 py-4 ${toneClassName}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] opacity-60">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
    </div>
  );
};

export function LeadImportAuditPanel({
  audit,
}: {
  audit: LeadSheetAdapterSidecar;
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
          主线索表导入审计
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-gray-950">
          这份表能不能直接拿来判断业务
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-gray-500">
          {audit.orderAuditSummary}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatBlock label="识别行数" value={audit.rowCount} />
        <StatBlock
          label="订单冲突"
          value={audit.orderConflictCount}
          tone={audit.orderConflictCount > 0 ? "danger" : "default"}
        />
        <StatBlock
          label="人工确认成交"
          value={audit.manualReviewDealCount}
          tone={audit.manualReviewDealCount > 0 ? "warn" : "default"}
        />
        <StatBlock
          label="缺失字段"
          value={audit.missingFields.length}
          tone={audit.missingFields.length > 0 ? "warn" : "default"}
        />
      </div>

      {audit.warnings.map((warning) => (
        <div
          key={warning}
          className="rounded-2xl bg-yellow-50 px-4 py-4 text-sm font-bold text-yellow-700"
        >
          {warning}
        </div>
      ))}

      {audit.missingFields.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
            缺失字段
          </p>
          <p className="mt-2 text-sm font-medium leading-6 text-gray-700">
            {audit.missingFields.join("、")}
          </p>
        </div>
      )}

      {audit.orderConflictSamples.length > 0 && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-red-500">
            冲突样本
          </p>
          <div className="mt-3 space-y-3">
            {audit.orderConflictSamples.map((sample) => (
              <div
                key={`${sample.rowNumber}-${sample.leadName}-${sample.issue}`}
                className="rounded-2xl border border-red-100 bg-white px-4 py-4"
              >
                <p className="text-sm font-black text-gray-950">
                  第 {sample.rowNumber} 行 · {sample.leadName}
                </p>
                <p className="mt-1 text-sm font-medium leading-6 text-red-700">
                  {sample.issue}
                </p>
                <p className="mt-2 text-xs font-medium leading-5 text-gray-500">
                  {sample.channel} / {sample.businessType} / 成交状态：{sample.dealStatus} /
                  订单数：{sample.orderCount ?? "待确认"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
