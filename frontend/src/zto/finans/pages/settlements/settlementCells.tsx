import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { settlementErrorKeys } from "../../../../pages/finance/settlementWarnings";
import type { SettlementListItem, SettlementType } from "../../../../pages/finance/types";
import { apiErrorReason } from "../settlementModals/settlementFormLogic";
import { errorCode, errorMessage } from "../../../components/definitionLogic";
import { methodBadge } from "./settlementListLogic";

/**
 * Ödemeler / Tahsilatlar ekranlarının ortak hücre parçaları (ZTO pjs:3437-3446, :3483-3487) ve hata
 * metni. ZTO `.html(...)` ile bastığı içerik React öğesi olarak kurulur (sunucu metni düz metin).
 */

/** Yöntem rozeti + (çek/senet) numara satırı. */
export function MethodBadge({
  row,
}: {
  row: Pick<SettlementListItem, "displayMethod" | "instrumentNumber">;
}) {
  const { t } = useTranslation("ztoFinans");
  const badge = methodBadge(row);
  return (
    <>
      <span className={`badge ${badge.className}`}>
        {t(`payments.list.method.${badge.method}`)}
      </span>
      {badge.sub && (
        <div className="mt-1">
          <small className={badge.sub.className}>
            {t(
              badge.sub.kind === "CHECK"
                ? "payments.list.table.checkNo"
                : "payments.list.table.noteNo",
              { number: badge.sub.number },
            )}
          </small>
        </div>
      )}
    </>
  );
}

/**
 * Sunucu hatasının iletisi: önce `finance.error.<KOD>[_<NEDEN>][_<TÜR>]` adaylarından ilk bulunan
 * (FE-3 kataloğu, §3.12; `settlementErrorKeys` — zto-onyuz:F5), yoksa sunucu iletisi, o da yoksa ZTO
 * genel metni. `type` verilince türe özgü metin seçilir (ör. "Tahsilat bilgileri alınamadı.").
 */
export function useSettlementErrorText() {
  const { t, i18n } = useTranslation();
  return useCallback(
    (error: unknown, fallback: string, type?: SettlementType | null) => {
      const code = errorCode(error);
      if (code) {
        const key = settlementErrorKeys(code, type, apiErrorReason(error)).find((k) =>
          i18n.exists(k),
        );
        if (key) return t(key);
      }
      return errorMessage(error, fallback);
    },
    [t, i18n],
  );
}
