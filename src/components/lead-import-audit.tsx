import type { LeadSheetAdapterSidecar } from "../../shared/adapters/lead-sheet/build-marketing-input-from-leads";
import type { RecognitionAudit } from "../../shared/recognition-audit";
import {
  LEAD_SHEET_PENDING_METRICS,
  LEAD_SHEET_REFERENCE_METRICS,
  LEAD_SHEET_REVIEW_PRIORITIES,
  LEAD_SHEET_TRUSTED_METRICS,
} from "../../shared/lead-sheet-mode";

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
        <StatBlock label="自动计入成交" value={audit.countedDeals} />
        <StatBlock
          label="保守剔除"
          value={audit.excludedConflictDealCount}
          tone={audit.excludedConflictDealCount > 0 ? "danger" : "default"}
        />
        <StatBlock
          label="表头置信度"
          value={`${Math.round(audit.detectionConfidence * 100)}%`}
          tone={audit.detectionConfidence < 0.7 ? "warn" : "default"}
        />
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
      </div>

      <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-4">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-red-500">
          保守口径说明
        </p>
        <p className="mt-2 text-sm font-medium leading-6 text-red-700">
          {audit.excludedConflictDealReason}
        </p>
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

      <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
          先按这个顺序复核
        </p>
        <div className="mt-3 space-y-2">
          {LEAD_SHEET_REVIEW_PRIORITIES.map((item, index) => (
            <p key={item} className="text-sm font-medium leading-6 text-gray-700">
              {index + 1}. {item}
            </p>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
            这份表适合直接看
          </p>
          <p className="mt-2 text-sm font-medium leading-6 text-gray-700">
            {LEAD_SHEET_TRUSTED_METRICS.join("、")}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
            当前只能先当参考
          </p>
          <p className="mt-2 text-sm font-medium leading-6 text-gray-700">
            {LEAD_SHEET_REFERENCE_METRICS.join("、")}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
            当前还要补
          </p>
          <p className="mt-2 text-sm font-medium leading-6 text-gray-700">
            {LEAD_SHEET_PENDING_METRICS.join("、")}
          </p>
        </div>
      </div>

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

const SOURCE_TYPE_LABEL: Record<RecognitionAudit["sourceType"], string> = {
  csv: "CSV",
  xlsx: "Excel",
  docx: "Word",
  text: "文本文件",
  rawText: "粘贴文本",
  image: "图片",
  pdf: "PDF",
};

const EXTRACTOR_LABEL: Record<RecognitionAudit["extractor"], string> = {
  rule: "规则抽取",
  rule_then_ai: "规则优先 + AI补全",
  ai_primary: "AI 主识别",
};

const CONFIDENCE_LABEL: Record<RecognitionAudit["confidence"], string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const CONFIDENCE_TONE: Record<RecognitionAudit["confidence"], "default" | "warn" | "danger"> = {
  high: "default",
  medium: "warn",
  low: "danger",
};

export function RecognitionAuditPanel({
  audit,
}: {
  audit: RecognitionAudit;
}) {
  const isLeadSheetRecognition =
    audit.adapterAudit?.sheetType === "lead_detail_sheet";

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
          识别可信度
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-gray-950">
          这次识别结果要重点复核哪里
        </h2>
        <p className="mt-2 text-sm font-medium leading-6 text-gray-500">
          当前来源：{SOURCE_TYPE_LABEL[audit.sourceType]} / 抽取方式：{EXTRACTOR_LABEL[audit.extractor]}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatBlock
          label="置信度"
          value={CONFIDENCE_LABEL[audit.confidence]}
          tone={CONFIDENCE_TONE[audit.confidence]}
        />
        <StatBlock
          label={isLeadSheetRecognition ? "识别覆盖" : "完整度"}
          value={`${audit.completenessPercent}%`}
          tone={audit.completenessPercent < 45 ? "danger" : audit.completenessPercent < 75 ? "warn" : "default"}
        />
        <StatBlock
          label="AI补全"
          value={audit.fallbackUsed ? "已启用" : "未启用"}
          tone={audit.fallbackUsed ? "warn" : "default"}
        />
        <StatBlock
          label="复核重点"
          value={audit.recommendedFocus.length}
          tone={audit.recommendedFocus.length > 0 ? "warn" : "default"}
        />
      </div>

      {isLeadSheetRecognition && (
        <div className="rounded-2xl bg-gray-50 px-4 py-4 text-sm font-bold leading-6 text-gray-700">
          这张分数只看表头、关键漏斗和成交风险。目标、花费、CPS 红线已经改到业务补充项，不再因为缺预算字段就把主线索表判成识别失败。
        </div>
      )}

      {audit.confidence === "low" && (
        <div className="rounded-2xl bg-red-50 px-4 py-4 text-sm font-bold leading-6 text-red-700">
          本次识别置信度低，请优先复核以下字段：{audit.recommendedFocus.join("、") || "关键漏斗与费用字段"}。
        </div>
      )}

      {audit.confidence === "medium" && (
        <div className="rounded-2xl bg-yellow-50 px-4 py-4 text-sm font-bold leading-6 text-yellow-700">
          当前识别可继续使用，但建议先复核：{audit.recommendedFocus.join("、") || "关键字段"}。
        </div>
      )}

      {audit.reviewReasons.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
            复核原因
          </p>
          <div className="mt-3 space-y-2">
            {audit.reviewReasons.map((reason) => (
              <p key={reason} className="text-sm font-medium leading-6 text-gray-700">
                {reason}
              </p>
            ))}
          </div>
        </div>
      )}

      {audit.recommendedFocus.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
            建议优先检查项
          </p>
          <p className="mt-2 text-sm font-medium leading-6 text-gray-700">
            {audit.recommendedFocus.join("、")}
          </p>
        </div>
      )}
    </div>
  );
}
