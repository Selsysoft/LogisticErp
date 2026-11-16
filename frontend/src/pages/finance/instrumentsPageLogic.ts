import type { InstrumentListItem, InstrumentStatus } from "./types";

/**
 * MUI Çek/Senet ekranının geçiş hedefleri (12.3 §5.9): sunucunun `allowedTransitions` alanından
 * (`InstrumentRules`). Ciro ödeme ekranından, iptal ödeme/tahsilat kaydından yapılır; sunucu bunları
 * listelemese de savunma olarak süzülür.
 */
export function nextStatuses(
  row: Pick<InstrumentListItem, "allowedTransitions">,
): InstrumentStatus[] {
  return (row.allowedTransitions ?? []).filter(
    (status) => status !== "ENDORSED" && status !== "CANCELLED",
  );
}
