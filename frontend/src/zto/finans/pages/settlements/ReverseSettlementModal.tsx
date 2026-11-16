import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useReverseSettlement, useSettlement } from "../../../../pages/finance/settlementApi";
import type { SettlementType } from "../../../../pages/finance/types";
import { ZtoModal } from "../../../components";
import { todayIso } from "../fundTransactions/fundTransactionsLogic";
import { useSettlementErrorText } from "./settlementCells";
import {
  deleteMessageParts,
  isReverseDateValid,
  payMethodOf,
  reverseBounds,
  reverseInstrumentNotice,
} from "./settlementListLogic";

type Props = {
  settlementId: string | null;
  type: SettlementType;
  onHide: () => void;
  /** Başarıda (modal kapandıktan sonra gösterilecek ZTO iletisi). */
  onDone: (message: string) => void;
};

/**
 * "Ödeme Silme Onayı" / "Tahsilat Silme Onayı" (ZTO pjs:3538-3585, :3692-3725; cjs:6252-6293). Silme =
 * ters kayıt (`POST /settlements/{id}/reverse`). Blackrose ekleri (MX7 Ç1, OK-12.2a-6/-18): zorunlu
 * "İptal Tarihi" (kayıt tarihi … max(bugün, kayıt tarihi)) ve isteğe bağlı "Gerekçe". İleti ZTO'da sunucu
 * HTML'idir; burada React öğeleri (MWG sanitize-untrusted-html). İlk odak güvenli eylem "İptal" (MWG
 * dialog).
 */
export function ReverseSettlementModal({ settlementId, type, onHide, onDone }: Props) {
  const { t } = useTranslation("ztoFinans");
  const errorText = useSettlementErrorText();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const show = settlementId !== null;
  const detail = useSettlement(settlementId, { enabled: show });
  const reverse = useReverseSettlement();
  const ns = type === "PAYMENT" ? "payments" : "collections";
  const r = (key: string) => t(`payments.list.reverse.${key}`);
  const item = detail.data?.item;
  const today = todayIso();
  const bounds = useMemo(
    () => (item ? reverseBounds(item.settlementDate, today) : null),
    [item, today],
  );
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!show) return;
    setReason("");
    setError(null);
    setTouched(false);
  }, [show, settlementId]);

  useEffect(() => {
    if (bounds) setDate(bounds.initial);
  }, [bounds]);

  const dateValid = bounds ? isReverseDateValid(date, bounds) : false;
  const showDateError = touched && !dateValid;
  const parts = item ? deleteMessageParts(item) : null;
  const instrumentNotice = reverseInstrumentNotice(type, detail.data?.instrument);

  async function confirm() {
    setTouched(true);
    if (!settlementId || !item || !bounds || !dateValid) return;
    setError(null);
    try {
      await reverse.mutateAsync({
        id: settlementId,
        body: { date, description: reason.trim() || undefined },
      });
      onHide();
      onDone(t(`${ns}.reverse.done`));
    } catch (err) {
      setError(errorText(err, r("failed"), type));
    }
  }

  return (
    <ZtoModal
      show={show}
      onHide={onHide}
      size="lg"
      rootId="confirmDeleteModal"
      headerClassName="bg-warning text-dark"
      onEntered={() => cancelRef.current?.focus()}
      title={
        <>
          <i className="fas fa-exclamation-triangle" aria-hidden="true" />{" "}
          {t(`${ns}.reverse.title`)}
        </>
      }
      footer={
        <>
          <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={onHide}>
            <i className="fas fa-times" aria-hidden="true" /> {r("cancel")}
          </button>
          <button
            type="button"
            className="btn btn-danger btn-confirm-delete"
            disabled={!item || reverse.isPending}
            aria-busy={reverse.isPending}
            onClick={() => void confirm()}
          >
            <i className="fas fa-trash" aria-hidden="true" /> {r("confirm")}
          </button>
        </>
      }
    >
      <div className="alert alert-warning">
        <i className="fas fa-info-circle" aria-hidden="true" /> {r("irreversible")}
      </div>
      {instrumentNotice && (
        <div className="alert alert-warning" id="reverseInstrumentNotice">
          <i className="fas fa-money-check" aria-hidden="true" /> {r(instrumentNotice)}
        </div>
      )}
      {detail.isError && (
        <div className="alert alert-danger" role="alert">
          {errorText(detail.error, t(`${ns}.detail.notFound`), type)}
        </div>
      )}
      {item && parts && bounds && (
        <>
          {t(`${ns}.reverse.message`, { amount: parts.amount, currency: parts.currency })}
          <br />
          <br />
          <strong>{r("accountLabel")}</strong>{" "}
          {parts.account ?? t("common.a11y.maskedEmployee", { ns: "translation" })}
          <br />
          <strong>{t(`${ns}.reverse.methodLabel`)}</strong>{" "}
          {t(`payments.list.method.${payMethodOf(item)}`)}
          <br />
          <div className="form-row mt-3">
            <div className="form-group col-md-4">
              <label htmlFor="reverseSettlementDate" className="required-field">
                {r("date")}
              </label>
              <input
                type="date"
                id="reverseSettlementDate"
                className={`form-control${showDateError ? " is-invalid" : ""}`}
                required
                min={bounds.min}
                max={bounds.max}
                value={date}
                aria-invalid={showDateError}
                aria-describedby={
                  showDateError ? "reverseSettlementDateError" : "reverseSettlementDateHelp"
                }
                onChange={(event) => setDate(event.target.value)}
                onBlur={() => setTouched(true)}
              />
              {showDateError ? (
                <div id="reverseSettlementDateError" className="invalid-feedback d-block">
                  {r("dateInvalid")}
                </div>
              ) : (
                <small id="reverseSettlementDateHelp" className="form-text text-muted">
                  {r("dateHelp")}
                </small>
              )}
            </div>
            <div className="form-group col-md-8">
              <label htmlFor="reverseSettlementReason">{r("reason")}</label>
              <textarea
                id="reverseSettlementReason"
                className="form-control"
                rows={2}
                maxLength={500}
                placeholder={r("reasonPlaceholder")}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          </div>
          {detail.data?.bankStatementMatched && (
            <small className="text-warning d-block">{r("bankStatementMatched")}</small>
          )}
        </>
      )}
      {error && (
        <div className="alert alert-danger mt-2 mb-0" role="alert">
          {error}
        </div>
      )}
    </ZtoModal>
  );
}
