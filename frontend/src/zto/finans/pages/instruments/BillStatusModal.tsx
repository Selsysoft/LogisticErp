import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useInstrumentTransition } from "../../../../pages/finance/instrumentApi";
import type { InstrumentListItem, InstrumentStatus } from "../../../../pages/finance/types";
import { ZtoConfirmModal, ZtoModal } from "../../../components";
import { todayIso } from "../fundTransactions/fundTransactionsLogic";
import { FundSelect } from "../settlementModals";
import {
  billTransitionBody,
  fundKindFor,
  needsConfirm,
  validateBillStatus,
  type BillStatusError,
  type BillStatusForm,
} from "./billsLogic";
import { errorTextOf } from "./editInstrumentLogic";
import { transitionMenu } from "./instrumentLogic";

type Props = {
  /** Açık modalın senedi; null → kapalı. */
  item: InstrumentListItem | null;
  /** Menüden seçilen hedef (ön seçili). */
  target: InstrumentStatus | null;
  onHide: () => void;
  /** Başarıda (modal kapandıktan sonra gösterilecek ileti). */
  onDone: (message: string) => void;
};

const EMPTY: BillStatusForm = { target: "", date: "", fundAccountId: "", note: "" };

/**
 * "Senet Durumu Güncelle" (ZTO Bills.cshtml #updateStatusModal :1669-1732, confirmUpdateBillStatus
 * :2990-3040). "Yeni Durum" seçenekleri yalnız sunucunun izin verdiği hedeflerdir; banka hesabı
 * Ödendi/Bankada için, kasa kasaya tahsil için görünür ve zorunludur. Ters kayıt yazan hedeflerde
 * (Protestolu, İptal) M8 tarzı onay sorulur. Teminata Verildi defter etkisizdir (ZTO hatası (f)).
 */
export function BillStatusModal({ item, target, onHide, onDone }: Props) {
  const { t, i18n } = useTranslation("ztoFinans");
  const transition = useInstrumentTransition();
  const submitRef = useRef<HTMLButtonElement>(null);
  const [form, setForm] = useState<BillStatusForm>(EMPTY);
  const [fieldError, setFieldError] = useState<BillStatusError>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const show = item !== null;
  const m = (key: string) => t(`bills.statusModal.${key}`);

  useEffect(() => {
    if (!item) return;
    setForm({ target: target ?? "", date: todayIso(), fundAccountId: "", note: "" });
    setFieldError(null);
    setError(null);
    setConfirming(false);
  }, [item, target]);

  const targets = item
    ? transitionMenu(item, "bill").flatMap((entry) =>
        entry.action === "transition" ? [entry.target] : [],
      )
    : [];
  const fundKind = item ? fundKindFor(item, form.target) : null;
  const errorId = "updateBillStatusError";

  const lookup = (key: string) => (i18n.exists(key, { ns: "ztoFinans" }) ? t(key) : null);

  async function send() {
    if (!item) return;
    await transition.mutateAsync({ id: item.id, body: billTransitionBody(item, form) });
    setConfirming(false);
    onHide();
    onDone(m("success"));
  }

  function submit() {
    if (!item) return;
    const problem = validateBillStatus(item, form);
    setFieldError(problem);
    if (problem) {
      document
        .getElementById(problem === "dateRequired" ? "updateBillTransactionDate" : "updateBillBank")
        ?.focus();
      return;
    }
    setError(null);
    if (needsConfirm(form.target as InstrumentStatus)) {
      setConfirming(true);
      return;
    }
    void send().catch((err: unknown) =>
      setError(errorTextOf(err, m("failed"), ["instruments"], lookup)),
    );
  }

  const statusLabel = form.target ? t(`bills.statusOption.${form.target}`) : "";

  return (
    <>
      <ZtoModal
        show={show && !confirming}
        onHide={onHide}
        size="lg"
        rootId="updateStatusModal"
        className="erp-modal"
        title={
          <>
            <i className="fas fa-edit" aria-hidden="true" /> {m("title")}
          </>
        }
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={onHide}>
              {m("cancel")}
            </button>
            <button
              ref={submitRef}
              type="button"
              className="btn btn-primary"
              disabled={transition.isPending}
              aria-busy={transition.isPending}
              onClick={submit}
            >
              <i className="fas fa-save" aria-hidden="true" /> {m("submit")}
            </button>
          </>
        }
      >
        <div className="row">
          <div className="col-md-6">
            <div className="form-group">
              <label htmlFor="updateBillStatus">
                {m("newStatus")} <span className="text-danger">*</span>
              </label>
              <select
                id="updateBillStatus"
                className="form-control no-select2"
                value={form.target}
                onChange={(event) => {
                  setForm((f) => ({
                    ...f,
                    target: event.target.value as InstrumentStatus,
                    fundAccountId: "",
                  }));
                  setFieldError(null);
                }}
              >
                {targets.map((value) => (
                  <option key={value} value={value}>
                    {t(`bills.statusOption.${value}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="col-md-6">
            <div className="form-group">
              <label htmlFor="updateBillTransactionDate">{m("date")}</label>
              <input
                type="date"
                id="updateBillTransactionDate"
                className={`form-control${fieldError === "dateRequired" ? " is-invalid" : ""}`}
                value={form.date}
                aria-invalid={fieldError === "dateRequired"}
                aria-describedby={fieldError === "dateRequired" ? errorId : undefined}
                onChange={(event) => setForm((f) => ({ ...f, date: event.target.value }))}
              />
            </div>
          </div>
        </div>

        {fundKind && item && (
          <div id="billBankSelectionDiv">
            <div className="field-group">
              <div className="field-group-title">
                <i
                  className={`fas ${fundKind === "BANK" ? "fa-university" : "fa-cash-register"}`}
                  aria-hidden="true"
                />{" "}
                {m(fundKind === "BANK" ? "bankGroup" : "cashGroup")}
              </div>
              <div className="form-group">
                <label id="updateBillBankLabel" htmlFor="updateBillBank">
                  {m(fundKind === "BANK" ? "bank" : "cash")} <span className="text-danger">*</span>
                </label>
                <FundSelect
                  id="updateBillBank"
                  kind={fundKind}
                  branchId={item.branchId}
                  companyId={item.companyId}
                  currency={item.money.currency}
                  value={form.fundAccountId}
                  ariaLabelledBy="updateBillBankLabel"
                  onChange={(fundAccountId) => {
                    setForm((f) => ({ ...f, fundAccountId }));
                    setFieldError(null);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="updateBillDescription">{m("note")}</label>
          <textarea
            id="updateBillDescription"
            className="form-control"
            rows={3}
            maxLength={500}
            placeholder={m("notePlaceholder")}
            value={form.note}
            onChange={(event) => setForm((f) => ({ ...f, note: event.target.value }))}
          />
        </div>

        <div id={errorId} className="invalid-feedback d-block" role="alert" hidden={!fieldError}>
          {fieldError ? m(fieldError) : ""}
        </div>
        {error && (
          <div className="alert alert-danger mt-2 mb-0" role="alert">
            {error}
          </div>
        )}
      </ZtoModal>

      <ZtoConfirmModal
        show={show && confirming}
        variant="warning"
        title={m("confirmTitle")}
        message={
          <>
            {m("confirmBodyBefore")}
            <b>{statusLabel}</b>
            {m("confirmBodyAfter")}
          </>
        }
        note={`${m("confirmWarning")} ${m("confirmIrreversible")}`}
        confirmText={m("confirmButton")}
        cancelText={m("cancel")}
        onConfirm={send}
        onCancel={() => {
          setConfirming(false);
          submitRef.current?.focus();
        }}
        onError={(err) => {
          setConfirming(false);
          setError(errorTextOf(err, m("failed"), ["instruments"], lookup));
        }}
      />
    </>
  );
}
