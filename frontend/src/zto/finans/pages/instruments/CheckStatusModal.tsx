import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFundList } from "../../../../pages/finance/fundApi";
import { useInstrumentTransition, useMoveCustody } from "../../../../pages/finance/instrumentApi";
import type { InstrumentListItem } from "../../../../pages/finance/types";
import { ZtoModal, formatDate, formatMoneyValue } from "../../../components";
import { errorCode } from "../../../components/definitionLogic";
import { todayIso } from "../fundTransactions/fundTransactionsLogic";
import { useSettlementErrorText } from "../settlements/settlementCells";
import { fundLabel } from "../settlementModals/settlementFormLogic";
import {
  buildStatusRequest,
  cashHelpKey,
  cashRule,
  initialStatusForm,
  isOwnCheck,
  isReversingTarget,
  needsBank,
  targetConfirmKey,
  targetHelp,
  targetOptionKey,
  targetWarningKey,
  validateStatusForm,
  type StatusForm,
  type StatusFormError,
  type StatusTarget,
} from "./checksLogic";
import { statusLabelKey } from "./instrumentLogic";

const INFO_CARD: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: "10px 12px",
  background: "#f8fafc",
};
const INFO_ROW: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 6,
};
const INFO_DETAIL: CSSProperties = { fontSize: ".85rem", marginTop: 4 };

/** Kapalıyken form başlangıcı (çek bağlamı yok). */
const EMPTY_CTX = {
  direction: "RECEIVED",
  status: "PORTFOLIO",
  custodyFundId: null,
  fundAccountId: null,
  fundKind: null,
} as const;

type Notice = { variant: "success" | "danger" | "warning"; text: string };

type Props = {
  /** Güncellenen çek; null → kapalı. */
  item: InstrumentListItem | null;
  /** Menüden gelen ön seçili hedef. */
  initialTarget: StatusTarget | "";
  /** Seçicinin seçenekleri (satır menüsünün M3 hedefleri). */
  targets: readonly StatusTarget[];
  onHide: () => void;
  /** Bildirim (ZTO `showSuccessMessage` / `showErrorMessage`). */
  onNotice: (notice: Notice) => void;
};

/** Çek/senet geçiş ve emanet hatalarının metni: önce `instruments.errors.<KOD>`, sonra finans kataloğu. */
export function useInstrumentErrorText() {
  const { t, i18n } = useTranslation("ztoFinans");
  const settlementText = useSettlementErrorText();
  return useCallback(
    (error: unknown, fallback: string) => {
      const code = errorCode(error);
      const key = code ? `instruments.errors.${code}` : null;
      if (key && i18n.exists(key, { ns: "ztoFinans" })) return t(key);
      return settlementText(error, fallback);
    },
    [t, i18n, settlementText],
  );
}

/**
 * M3 "Çek Durumu Güncelle" + M8 "İşlemi Onaylayın" (ZTO Checks.cshtml:1225-1315, 2681-2706,
 * 4022-4236, 5322-5480; 12.3 §5.4). Seçici yalnız sunucunun izin verdiği hedefleri listeler
 * (`allowedTransitions` → `transitionMenu`). "Kasaya Al (Ciro)" PUT custody, diğerleri POST transition.
 * Doğrulama hatası ZTO gibi bildirimle gösterilir; ilgili alan `aria-invalid` olur ve odak alır.
 */
export function CheckStatusModal({ item, initialTarget, targets, onHide, onNotice }: Props) {
  const { t } = useTranslation("ztoFinans");
  const s = (key: string, values?: Record<string, unknown>) =>
    t(`checks.statusModal.${key}`, values);
  const show = item !== null;
  const own = item ? isOwnCheck(item) : false;
  const [form, setForm] = useState<StatusForm>(() => initialStatusForm(EMPTY_CTX, "", todayIso()));
  const [invalid, setInvalid] = useState<StatusFormError["field"] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const errorText = useInstrumentErrorText();
  const transition = useInstrumentTransition();
  const custody = useMoveCustody();
  const busy = transition.isPending || custody.isPending;
  const fields = useRef<Record<string, HTMLElement | null>>({});

  // Her açılışta ZTO `openUpdateStatusModal`: hedef ön seçili, banka çekin bankası, tarih bugün.
  useEffect(() => {
    if (item) {
      setForm(initialStatusForm(item, initialTarget, todayIso()));
      setInvalid(null);
      setConfirming(false);
    }
  }, [item, initialTarget]);

  const currency = item?.money.currency;
  const banks = useFundList(
    { companyId: item?.companyId, kind: "BANK", active: true, currency },
    { enabled: show },
  );
  const cashes = useFundList(
    { companyId: item?.companyId, kind: "CASH", active: true, currency },
    { enabled: show },
  );
  const bankOptions = useMemo(
    () => (banks.data ?? []).filter((f) => f.kind === "BANK" && f.active),
    [banks.data],
  );
  const cashOptions = useMemo(
    () => (cashes.data ?? []).filter((f) => f.kind === "CASH" && f.active),
    [cashes.data],
  );

  if (!item) {
    return null;
  }

  const target = form.target;
  const help = targetHelp(target, own);
  const warning = targetWarningKey(target);
  const bank = needsBank(target);
  const cash = cashRule(target, item);
  const cashHelp = cashHelpKey(target, cash.required);
  const update = (patch: Partial<StatusForm>) => {
    setInvalid(null);
    setForm((f) => ({ ...f, ...patch }));
  };

  const confirm = () => {
    const error = validateStatusForm(form, item);
    if (error) {
      setInvalid(error.field);
      onNotice({ variant: "danger", text: t(error.key) });
      fields.current[error.field]?.focus();
      return;
    }
    setConfirming(true);
  };

  const submit = async () => {
    const request = buildStatusRequest(form, item);
    try {
      if (request.kind === "custody") {
        await custody.mutateAsync({ id: item.id, body: request.body });
      } else {
        await transition.mutateAsync({ id: item.id, body: request.body });
      }
      setConfirming(false);
      onNotice({ variant: "success", text: s("success") });
      onHide();
    } catch (error) {
      setConfirming(false);
      onNotice({ variant: "danger", text: errorText(error, s("failed")) });
    }
  };

  const ref = (name: string) => (el: HTMLElement | null) => {
    fields.current[name] = el;
  };
  const statusText = t(statusLabelKey(item.kind, item.direction, item.status));
  const confirmLabel = target ? t(targetConfirmKey(target, own)) : "";

  return (
    <>
      <ZtoModal
        show={show}
        onHide={onHide}
        className="erp-modal"
        rootId="updateStatusModal"
        title={
          <>
            <i className="fas fa-edit" aria-hidden="true" /> {s("title")}
          </>
        }
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={onHide}>
              {s("cancel")}
            </button>
            <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy}>
              <i className="fas fa-save" aria-hidden="true" /> {s("update")}
            </button>
          </>
        }
      >
        <div id="updChkInfo" className="mb-3" style={INFO_CARD}>
          <div style={INFO_ROW}>
            <div>
              <i className="far fa-sticky-note" aria-hidden="true" />{" "}
              <strong>{s("cardNumber", { number: item.number })}</strong>{" "}
              <span className={`badge ${own ? "badge-warning" : "badge-info"}`}>
                {s(own ? "ownBadge" : "customerBadge")}
              </span>
            </div>
            <div>
              <span className="badge badge-secondary">{statusText}</span>
            </div>
          </div>
          <div className="text-muted" style={INFO_DETAIL}>
            {item.bankName && (
              <span className="mr-3">
                <i className="fas fa-university" aria-hidden="true" /> {item.bankName}
              </span>
            )}
            {!item.employeeMasked && (item.drawerName || item.accountName) && (
              <span className="mr-3">
                <i className="fas fa-user" aria-hidden="true" />{" "}
                {s("drawer", {
                  name: own ? item.companyName : (item.drawerName ?? item.accountName),
                })}
              </span>
            )}
            <span className="mr-3">
              <i className="fas fa-money-bill-wave" aria-hidden="true" />{" "}
              <strong>{formatMoneyValue(item.money)}</strong>
            </span>
            <span>
              <i className="far fa-calendar-alt" aria-hidden="true" />{" "}
              {s("due", { date: formatDate(item.dueDate) })}
            </span>
          </div>
        </div>

        <div className="alert alert-info">
          <i className="fas fa-info-circle" aria-hidden="true" /> <strong>{s("infoLabel")}</strong>{" "}
          {s("info")}
        </div>

        <div className="form-group">
          <label htmlFor="updateCheckStatus">
            {s("newStatus")} <span className="text-danger">*</span>
          </label>
          <select
            id="updateCheckStatus"
            ref={ref("target")}
            className="form-control no-select2"
            value={target}
            required
            aria-invalid={invalid === "target"}
            aria-describedby="statusHelpText"
            onChange={(event) => update({ target: event.target.value as StatusTarget | "" })}
          >
            {!target && <option value="">{s("select")}</option>}
            {targets.map((value) => (
              <option key={value} value={value}>
                {t(targetOptionKey(value, own))}
              </option>
            ))}
          </select>
          <small className="form-text text-muted">
            <i className="fas fa-question-circle" aria-hidden="true" />{" "}
            <span id="statusHelpText">
              <span className={help.className || undefined}>{t(help.key)}</span>
            </span>
          </small>
        </div>

        {bank && (
          <div id="bankSelectionDiv">
            <div className="field-group">
              <div className="field-group-title">
                <i className="fas fa-university" aria-hidden="true" /> {s("bankGroup")}
              </div>
              <div className="form-group">
                <label htmlFor="updateBankId">
                  {s("bankAccount")} <span className="text-danger">*</span>
                </label>
                <select
                  id="updateBankId"
                  ref={ref("bankId")}
                  className="form-control no-select2"
                  value={form.bankId}
                  required
                  aria-invalid={invalid === "bankId"}
                  onChange={(event) => update({ bankId: event.target.value })}
                >
                  <option value="">{s("select")}</option>
                  {bankOptions.map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fundLabel(fund)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="updateDepositDate">{s("depositDate")}</label>
                <input
                  type="date"
                  id="updateDepositDate"
                  ref={ref("date")}
                  className="form-control"
                  value={form.date}
                  aria-invalid={invalid === "date"}
                  onChange={(event) => update({ date: event.target.value })}
                />
              </div>
            </div>
          </div>
        )}

        {cash.visible && (
          <div id="cashSelectionDiv">
            <div className="field-group">
              <div className="field-group-title">
                <i className="fas fa-cash-register" aria-hidden="true" /> {s("cashGroup")}
              </div>
              <div className="form-group">
                <label htmlFor="updateCashId">
                  {s("cash")}{" "}
                  {cash.required && (
                    <span className="text-danger" id="cashRequiredMark">
                      *
                    </span>
                  )}
                </label>
                <select
                  id="updateCashId"
                  ref={ref("cashId")}
                  className="form-control no-select2"
                  value={form.cashId}
                  required={cash.required}
                  aria-invalid={invalid === "cashId"}
                  aria-describedby="cashHelpText"
                  onChange={(event) => update({ cashId: event.target.value })}
                >
                  <option value="">{s("select")}</option>
                  {cashOptions.map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.code ? `${fund.name} (${fund.code})` : fund.name}
                    </option>
                  ))}
                </select>
                <small className="form-text text-muted" id="cashHelpText">
                  <span className={cashHelp.className}>
                    <i
                      className={`fas ${cash.required && target === "PORTFOLIO" ? "fa-exclamation-triangle" : "fa-cash-register"}`}
                      aria-hidden="true"
                    />{" "}
                    {t(cashHelp.key)}
                  </span>
                </small>
              </div>
            </div>
          </div>
        )}

        {target === "RETURNED" && (
          <div className="form-group">
            <label htmlFor="updateReturnNote">{s("returnNote")}</label>
            <textarea
              id="updateReturnNote"
              className="form-control"
              rows={2}
              maxLength={500}
              value={form.note}
              onChange={(event) => update({ note: event.target.value })}
            />
          </div>
        )}

        <div id="statusWarnings">
          {warning && (
            <div className="alert alert-danger">
              <i className="fas fa-exclamation-triangle" aria-hidden="true" />{" "}
              <strong>{s("warningLabel")}</strong> {t(warning)}
            </div>
          )}
        </div>
      </ZtoModal>

      <ZtoModal
        show={show && confirming}
        onHide={() => setConfirming(false)}
        centered
        rootId="confirmModal"
        headerClassName="bg-info"
        closeDisabled={busy}
        title={
          <>
            <i className="fas fa-exclamation-circle" aria-hidden="true" /> {s("confirm.title")}
          </>
        }
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              <i className="fas fa-times" aria-hidden="true" /> {s("confirm.cancel")}
            </button>
            <button
              type="button"
              className="btn btn-info"
              id="confirmActionBtn"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void submit()}
            >
              <i className="fas fa-check" aria-hidden="true" /> {s("confirm.ok")}
            </button>
          </>
        }
      >
        <div className="alert alert-info">
          <i className="fas fa-info-circle" aria-hidden="true" /> {s("confirm.before")}
          <strong>{confirmLabel}</strong>
          {s("confirm.after")}
        </div>
        {isReversingTarget(target) && (
          <div className="alert alert-warning mt-2 mb-0">
            <i className="fas fa-exclamation-triangle" aria-hidden="true" /> {s("confirm.reverse")}
          </div>
        )}
        <div className="mt-3">
          <small className="text-muted">
            <i className="fas fa-history" aria-hidden="true" /> {s("confirm.irreversible")}
          </small>
        </div>
      </ZtoModal>
    </>
  );
}
