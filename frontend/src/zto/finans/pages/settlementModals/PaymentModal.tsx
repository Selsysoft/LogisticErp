import { useEffect, useState } from "react";
import { currencySymbol, ZtoModal } from "../../../components";
import { CheckFields } from "./CheckFields";
import { CounterpartyBankSelect } from "./CounterpartyBankSelect";
import {
  BranchGroup,
  CurrencySelect,
  DateInput,
  DescriptionGroup,
  DocumentNoInput,
  FundGroup,
  MethodSelect,
  ModalFooter,
  ModalHeader,
  ReasonGroup,
  errorItems,
  fieldErrorOf,
} from "./formParts";
import type { PaymentModalProps } from "./index";
import { InvoiceAllocationTable } from "./InvoiceAllocationTable";
import { NoteFields } from "./NoteFields";
import { AccountSelect, ErrorBox, FixedNotice, Help, WarningLines, useModalText } from "./parts";
import { PostPaymentPlanningModal } from "./PostPaymentPlanningModal";
import { RemainingDebtPanel } from "./RemainingDebtPanel";
import {
  amountText,
  applyBankSentence,
  formatDecimalInput,
  fundKindOf,
  inputAmount,
  isBankLike,
  withAccount,
  withBranch,
  withCurrency,
  withMethod,
  type FormField,
} from "./settlementFormLogic";
import { useSettlementModal } from "./useSettlementModal";

/*
 * Fon / ciro çeki seçimi para birimini `withCurrency` ile değiştirir: para birimi değişince fatura
 * eşleştirmeleri sıfırlanır (zto-onyuz:F1; aksi halde gizli satırlar 422 ALLOCATION_TARGET_INVALID).
 *
 * Yeni Ödeme / Ödeme Düzenle (ZTO `_AddPaymentModal.cshtml` / `_EditPaymentModal.cshtml`, payments.js
 * 1868-2143, 2585-2731; 12.2a_TASARIM §5.7). Kök `.modal.fade.erp-modal#addPaymentModal`
 * (`#editPaymentModal`); DOM `.modal-content > .modal-header + form > (.modal-body + .modal-footer)`
 * olduğu için ZtoModal çıplak kipte. Çapraz kur, bahçe bölümü ve "Ödemeyi Sonra Kaydet" (12.4) yok;
 * bahçe bölümünün yerinde fatura eşleştirme (S-9). Düzenleme = düzeltme (ters + yeni, OK-12.2a-4).
 */

export function PaymentModal(props: PaymentModalProps) {
  const { tm } = useModalText();
  const m = useSettlementModal("PAYMENT", props);
  const { form, setForm, ids, edit } = m;
  // Plan modalı kapanınca bağlı kalır: "Ödeme planlaması başarıyla kaydedildi." bildirimi plan modalının
  // içinde ve yalnız `show=false` iken çizilir; öneri her yeni kayıtta `key` ile yeniden kurulur.
  const [planShown, setPlanShown] = useState(false);
  useEffect(() => setPlanShown(m.offer !== null), [m.offer]);
  const titleId = `${ids.root}Label`;
  const error = (field: FormField) => fieldErrorOf(m.errors, ids, form, field);
  const fundKind = fundKindOf(form.method);
  const endorseLocked =
    form.method === "CHECK" && form.check.mode === "ENDORSE" && !!form.check.instrumentId;
  const fundLocked = fundKind !== null && !!form.fundAccountId;
  const symbol = currencySymbol(form.currency);
  const accountExtra =
    edit && m.detail?.item.accountId
      ? {
          value: m.detail.item.accountId,
          label: `${m.detail.item.accountCode ?? ""} - ${m.detail.item.accountName ?? ""}`,
        }
      : null;

  const methodPanel = () => {
    switch (form.method) {
      case "CASH":
        return (
          <FundGroup
            containerId={ids.cashFields}
            selectId={ids.cash}
            kind="CASH"
            title={tm("payment.cashTitle")}
            branchId={form.branchId}
            companyId={m.companyId}
            value={form.fundAccountId}
            onChange={(fundAccountId, fund) =>
              setForm((f) => ({
                ...withCurrency(f, fund?.currency ?? f.currency),
                fundAccountId,
              }))
            }
            error={error("fundAccountId")}
          />
        );
      case "BANK":
      case "CREDIT_CARD":
        return (
          <FundGroup
            containerId={ids.bankFields}
            selectId={ids.bank}
            kind="BANK"
            title={tm("payment.bankTitle")}
            branchId={form.branchId}
            companyId={m.companyId}
            value={form.fundAccountId}
            onChange={(fundAccountId, fund) =>
              setForm((f) => ({
                ...withCurrency(f, fund?.currency ?? f.currency),
                fundAccountId,
              }))
            }
            error={error("fundAccountId")}
          />
        );
      case "CHECK":
      case "NOTE":
        return (
          <MethodInfo
            kind={form.method}
            id={form.method === "CHECK" ? ids.checkInfo : ids.billInfo}
          />
        );
      default:
        return <MethodInfo kind="SELECT" id={ids.selectInfo} />;
    }
  };

  return (
    <>
      <ZtoModal
        show={props.show && m.ready}
        onHide={props.onHide}
        bare
        size="xl"
        scrollable={!edit}
        rootId={ids.root}
        className="erp-modal"
        ariaLabelledBy={titleId}
        onEntered={() => document.getElementById(ids.account)?.focus()}
      >
        <ModalHeader
          titleId={titleId}
          icon="fa-plus-circle"
          title={edit ? tm("payment.editTitle") : tm("payment.addTitle")}
          onClose={props.onHide}
        />
        <form id={ids.form} ref={m.formRef} noValidate onSubmit={m.onSubmit}>
          <div className="modal-body">
            <ErrorBox
              items={errorItems(m.errors, ids, form, (key) => tm(`validation.${key}`))}
              server={m.serverError}
            />
            <div id={ids.remaining}>
              {form.accountId && (
                <RemainingDebtPanel accountId={form.accountId} companyId={m.workingCompany} />
              )}
            </div>
            <br />
            <div className="form-row">
              <div className="col-md-3">
                <AccountSelect
                  id={ids.account}
                  value={form.accountId}
                  onChange={(accountId) => setForm((f) => withAccount(f, accountId))}
                  label={tm("payment.account")}
                  help={tm("payment.accountHelp")}
                  showActions
                  extra={accountExtra}
                  invalid={error("accountId").invalid}
                  describedBy={error("accountId").describedBy}
                />
              </div>
              <div className="col-md-3">
                <DocumentNoInput
                  id={ids.documentNo}
                  label={tm("payment.documentNo")}
                  placeholder={tm("payment.documentNoPlaceholder")}
                  help={tm("payment.documentNoHelp")}
                  value={form.documentNo}
                  onChange={(documentNo) => setForm((f) => ({ ...f, documentNo }))}
                />
              </div>
              <div className="col-md-3">
                <MethodSelect
                  id={ids.method}
                  label={tm("payment.method")}
                  mode={props.mode}
                  value={form.method}
                  onChange={(method) => setForm((f) => withMethod(f, method))}
                  error={error("method")}
                />
              </div>
              <div className="col-md-3">
                <DateInput
                  id={ids.date}
                  label={tm("payment.date")}
                  value={form.date}
                  onChange={(date) => setForm((f) => ({ ...f, date }))}
                  error={error("date")}
                />
              </div>
            </div>

            <div className="form-row align-items-start">
              <div className="col-md-3">
                <BranchGroup
                  id={ids.branch}
                  help={tm("payment.workPlaceHelp")}
                  value={form.branchId}
                  onChange={(branchId) => setForm((f) => withBranch(f, branchId))}
                  companyId={m.companyId}
                  error={error("branchId")}
                />
              </div>
              <div className="col-md-6">
                <div className="field-group">
                  <div className="field-group-title">
                    <i className="fas fa-money-bill" aria-hidden="true" />{" "}
                    {tm("payment.amountTitle")}
                  </div>
                  <div className="form-row" id={edit ? "editNormalModeRow" : "normalModeRow"}>
                    <div className="col-md-6">
                      <CurrencySelect
                        id={ids.currency}
                        value={form.currency}
                        onChange={(currency) => setForm((f) => withCurrency(f, currency))}
                        disabled={fundLocked || endorseLocked}
                        help={fundLocked ? tm("shared.currencyLocked") : tm("payment.currencyHelp")}
                        lockNote={endorseLocked ? tm("shared.endorseLocked") : null}
                      />
                    </div>
                    <div className="col-md-6">
                      <div className="form-group">
                        <label htmlFor={ids.amount} className="required-field">
                          <i className="fas fa-money-bill-wave" aria-hidden="true" />{" "}
                          {tm("payment.amount")}
                        </label>
                        <div className="input-group">
                          <input
                            id={ids.amount}
                            className="form-control"
                            required
                            type="text"
                            inputMode="decimal"
                            pattern="[0-9]*[.,]?[0-9]{0,2}"
                            placeholder="0.00"
                            autoComplete="off"
                            readOnly={endorseLocked}
                            value={form.amount}
                            onChange={(event) =>
                              setForm((f) => ({
                                ...f,
                                amount: formatDecimalInput(event.target.value, 2),
                              }))
                            }
                            aria-invalid={error("amount").invalid}
                            aria-describedby={
                              [error("amount").describedBy, "paymentWarningLines"]
                                .filter(Boolean)
                                .join(" ") || undefined
                            }
                          />
                          <div className="input-group-append">
                            <span
                              className="input-group-text"
                              id={
                                edit
                                  ? "editPaymentAmountCurrencySymbolAddon"
                                  : "paymentAmountCurrencySymbolAddon"
                              }
                              style={{ fontSize: 13 }}
                            >
                              {symbol}
                            </span>
                          </div>
                        </div>
                        {endorseLocked && (
                          <small className="form-text text-warning">
                            <i className="fas fa-lock" aria-hidden="true" />{" "}
                            {tm("shared.endorseLocked")}
                          </small>
                        )}
                        <Help>{tm("payment.amountHelp")}</Help>
                        {edit && form.currency !== "TRY" && (
                          <Help>{tm("payment.editRateNote")}</Help>
                        )}
                        <WarningLines type="PAYMENT" check={m.preview} id="paymentWarningLines" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-md-3">{methodPanel()}</div>
            </div>

            {form.method === "CHECK" && (
              <CheckFields
                variant="issued"
                value={form.check}
                onChange={(check) => setForm((f) => ({ ...f, check }))}
                branchId={form.branchId}
                companyId={m.workingCompany}
                currency={form.currency}
                onEndorsedCheck={(instrument) =>
                  setForm((f) =>
                    instrument
                      ? {
                          ...withCurrency(f, instrument.money.currency),
                          amount: inputAmount(instrument.money.amount),
                        }
                      : { ...f, amount: "" },
                  )
                }
                errors={{
                  instrumentId: error("check.instrumentId").invalid ? "x" : undefined,
                  fundAccountId: error("check.fundAccountId").invalid ? "x" : undefined,
                  number: error("check.number").invalid ? "x" : undefined,
                  dueDate: error("check.dueDate").invalid ? "x" : undefined,
                }}
              />
            )}
            {form.method === "NOTE" && (
              <NoteFields
                variant="issued"
                value={form.note}
                onChange={(note) => setForm((f) => ({ ...f, note }))}
                branchId={form.branchId}
                companyId={m.workingCompany}
                errors={{
                  number: error("note.number").invalid ? "x" : undefined,
                  dueDate: error("note.dueDate").invalid ? "x" : undefined,
                }}
              />
            )}

            <InvoiceAllocationTable
              type="PAYMENT"
              accountId={form.accountId}
              branchId={form.branchId}
              currency={form.currency}
              settlementAmount={amountText(form.amount) || "0"}
              excludeSettlementId={edit ? props.settlementId : undefined}
              value={form.allocations}
              onChange={(allocations) => setForm((f) => ({ ...f, allocations }))}
              onExceededChange={m.setAllocationExceeded}
              idPrefix={ids.allocationPrefix}
            />

            {isBankLike(form.method) && form.accountId && (
              <div id="customerBankSection">
                <div className="field-group">
                  <div className="field-group-title">
                    <i className="fas fa-university" aria-hidden="true" />{" "}
                    {tm("payment.customerBankTitle")}
                  </div>
                  <div className="form-group">
                    <label htmlFor={ids.counterparty}>
                      <i className="fas fa-building" aria-hidden="true" />{" "}
                      {tm("shared.customerBankLabel")}
                    </label>
                    <CounterpartyBankSelect
                      id={ids.counterparty}
                      accountId={form.accountId}
                      accountType={m.selectedAccount?.type ?? m.detail?.item.accountType ?? null}
                      date={form.date}
                      value={form.counterpartyBankAccountId}
                      onChange={(counterpartyBankAccountId) =>
                        setForm((f) => ({ ...f, counterpartyBankAccountId }))
                      }
                      onDescription={(sentence) =>
                        setForm((f) => ({
                          ...f,
                          description: applyBankSentence(f.description, sentence),
                        }))
                      }
                    />
                    <Help>{tm("payment.customerBankHelp")}</Help>
                  </div>
                </div>
              </div>
            )}

            <DescriptionGroup
              id={ids.description}
              label={tm("payment.description")}
              placeholder={tm("payment.descriptionPlaceholder")}
              value={form.description}
              onChange={(description) => setForm((f) => ({ ...f, description }))}
            />
            {edit && (
              <ReasonGroup
                id={ids.reason}
                value={form.reason}
                onChange={(reason) => setForm((f) => ({ ...f, reason }))}
              />
            )}
          </div>
          <ModalFooter pending={m.pending} onCancel={props.onHide} onSave={m.requestSave} />
        </form>
      </ZtoModal>
      {m.confirmModal}
      {m.notice && !props.show && <FixedNotice notice={m.notice} onClose={m.clearNotice} />}
      {m.offer && (
        <PostPaymentPlanningModal
          key={m.offer.settlement.id}
          show={planShown}
          onHide={() => setPlanShown(false)}
          settlement={m.offer.settlement}
          account={m.offer.account}
        />
      )}
    </>
  );
}

/** Seçim yokken / çekte / senette sağ sütundaki bilgi kutusu (APM #selectPaymentInfo …). */
function MethodInfo({ kind, id }: { kind: "SELECT" | "CHECK" | "NOTE"; id: string }) {
  const { tm } = useModalText();
  if (kind === "SELECT") {
    return (
      <div id={id}>
        <div className="field-group">
          <div className="text-center">
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 15px",
              }}
            >
              <i
                className="fas fa-hand-pointer text-white"
                style={{ fontSize: 32 }}
                aria-hidden="true"
              />
            </div>
            <h6 style={{ color: "#475569", fontWeight: 600, marginBottom: 8 }}>
              {tm("payment.selectInfoTitle")}
            </h6>
            <p className="text-muted mb-0" style={{ fontSize: 13 }}>
              {tm("payment.selectInfoText")}
            </p>
          </div>
        </div>
      </div>
    );
  }
  const check = kind === "CHECK";
  return (
    <div id={id}>
      <div className="field-group">
        <div className="text-center">
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: check
                ? "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)"
                : "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 15px",
            }}
          >
            <i
              className={
                check ? "fas fa-money-check text-white" : "fas fa-file-invoice-dollar text-white"
              }
              style={{ fontSize: 16 }}
              aria-hidden="true"
            />
          </div>
          <h6 style={{ color: check ? "#1e40af" : "#92400e", fontWeight: 600, marginBottom: 8 }}>
            {check ? tm("payment.checkInfoTitle") : tm("payment.billInfoTitle")}
          </h6>
          <p className="text-muted mb-0" style={{ fontSize: 13 }}>
            {check ? tm("payment.checkInfoText") : tm("payment.billInfoText")}
          </p>
          <small className="text-muted d-block mt-2" style={{ fontSize: 11 }}>
            <i className="fas fa-info-circle" aria-hidden="true" />{" "}
            {check ? tm("payment.checkInfoNote") : tm("payment.billInfoNote")}
          </small>
        </div>
      </div>
    </div>
  );
}
