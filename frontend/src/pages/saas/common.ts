import { LimitUsage, SubscriptionStatus, SuspendReason, TenantStatus } from "./types";

/** Boş sınır sınırsız demektir. */
export function formatLimit(row: LimitUsage, unlimited: string) {
  return `${row.used} / ${row.limit ?? unlimited}`;
}

export function limitsNeedingAttention(limits: LimitUsage[]) {
  return limits.filter((row) => row.warning || row.reached);
}

export function daysUntil(iso: string, today: string) {
  const day = 24 * 60 * 60 * 1000;
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / day);
}

/** Konsoldaki işlem düğmeleri; sunucu aynı kuralları ayrıca denetler. */
export function availableActions(
  status: TenantStatus,
  subscription: SubscriptionStatus | null,
  reason: SuspendReason | null = null,
) {
  const hasSchema = status === "ACTIVE" || status === "SUSPENDED" || status === "CLOSED";
  const trialEnded = reason === "TRIAL_ENDED";
  return {
    activate: (subscription === "TRIAL" && status === "ACTIVE") || trialEnded,
    extendTrial: subscription === "TRIAL" || trialEnded,
    changePlan: status === "ACTIVE" || status === "SUSPENDED",
    suspend: status === "ACTIVE",
    resume: (status === "SUSPENDED" && !trialEnded) || status === "CLOSED",
    close: status === "ACTIVE" || status === "SUSPENDED",
    exportData: hasSchema,
  };
}
