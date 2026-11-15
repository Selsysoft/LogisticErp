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
import { FundSelect } from "./FundSelect";
import type { CollectionModalProps } from "./index";
import { InvoiceAllocationTable } from "./InvoiceAllocationTable";
import { NoteFields } from "./NoteFields";
import {
  AccountSelect,
  ErrorBox,
  FixedNotice,
  Help,
  PhaseNote,
  WarningLines,
  accountOptionLabel,
  useModalText,
} from "./parts";
import { RemainingCreditPanel } from "./RemainingCreditPanel";
import {
  amountText,
  applyBankSentence,
  calculationText,
  formatDecimalInput,
  fundLabel,
  isBankLike,
  withAccount,
  withBranch,
  withCurrency,
  withMethod,
  type FormField,
} from "./settlementFormLogic";
import { useSettlementModal } from "./useSettlementModal";

/*
 * Yeni Tahsilat / Tahsilat Düzenle (ZTO `_CollectionModalsPartial.cshtml` :47-850 / :854-1530;
 * 12.2a_TASARIM §5.8). Kök `.modal.fade.erp-modal#addCollectionModal` (`#editCollectionModal`,
 * başlık `bg-warning` + fa-edit, "Güncelle" `btn-primary btn-update`). Çapraz kur satırı ve "Farklı
 * Para Birimi ile Tahsilat" kutusu yok (Y9); "Sipariş Tahsisi" yerinde fatura eşleştirme. Çekte
 * "Bankaya Yatırıldı" = `initialStatus: AT_BANK` + banka; "Kasaya Al (Ciro)" = PORTFOLIO (kasa 12.3).
 * Düzenlemede cari değiştirilemez ve karşı taraf banka bölümü yoktur (CMP birebir).
 */

export function CollectionModal(props: CollectionModalProps) {
  const { tm } = useModalText();
  const m = useSettlementModal("COLLECTION", props);
  const { form, setForm, ids, edit } = m;
  const titleId = `${ids.root}Label`;
  const error = (field: FormField) => fieldErrorOf(m.errors, ids, form, field);
  const symbol = currencySymbol(form.currency);
  const fundLocked = (form.method === "CASH" || isBankLike(form.method)) && !!form.fundAccountId;
  const calculation = calculationText(form.amount, form.currency);
  const accountExtra =
    edit && m.detail?.item.accountId
      ? {
          value: m.detail.item.accountId,
          label: `${m.detail.item.accountCode ?? ""} - ${m.detail.item.accountName ?? ""}`,
        }
      : null;
  const presetDisplay =
    !edit &&
    m.presetFund &&
    m.presetFund.kind === "BANK" &&
    isBankLike(form.method) &&
    form.fundAccountId === m.presetFund.id
      ? fundLabel(m.presetFund)
      : null;
  /** Fon para birimi `withCurrency` ile: değişince eşleştirmeler sıfırlanır (zto-onyuz:F1). */
  const setFund = (fundAccountId: string, currency: string | undefined) =>
    setForm((f) => m.reconcileRate({ ...withCurrency(f, currency ?? f.currency), fundAccountId }));

  const topFields = () => {
    switch (form.method) {
      case "BANK":
      case "CREDIT_CARD":
        return (
          <FundGroup
            containerId={ids.bankFields}
            selectId={ids.bank}
            kind="BANK"
            title={tm("collection.bankTitle")}
            branchId={form.branchId}
            companyId={m.companyId}
            value={form.fundAccountId}
            onChange={(id, fund) => setFund(id, fund?.currency)}
            error={error("fundAccountId")}
            display={presetDisplay}
          />
        );
      case "CASH":
        return (
          <FundGroup
            containerId={ids.cashFields}
            selectId={ids.cash}
            kind="CASH"
            title={tm("collection.cashTitle")}
            branchId={form.branchId}
            companyId={m.companyId}
            value={form.fundAccountId}
            onChange={(id, fund) => setFund(id, fund?.currency)}
            error={error("fundAccountId")}
          />
        );
      case "CHECK":
        return (
          <div id="checkTopFields">
            <div className="field-group">
              <div className="field-group-title">
                <i className="fas fa-money-check" aria-hidden="true" />{" "}
                {tm("collection.checkTopTitle")}
              </div>
              {form.check.status === "AT_BANK" ? (
                <div id="checkBankSelection" className="form-group">
                  <label id="CheckBankID-label" className="required-field">
                    <i className="fas fa-university" aria-hidden="true" />{" "}
                    {tm("collection.checkBank")}
                  </label>
                  <FundSelect
                    id="CheckBankID"
                    kind="BANK"
                    branchId={form.branchId}
                    currency={form.currency}
                    companyId={m.companyId}
                    value={form.check.fundAccountId}
                    onChange={(fundAccountId) =>
                      setForm((f) => ({ ...f, check: { ...f.check, fundAccountId } }))
                    }
                    ariaLabelledBy={
                      error("check.fundAccountId").describedBy
                        ? `CheckBankID-label ${error("check.fundAccountId").describedBy}`
                        : "CheckBankID-label"
                    }
                  />
                  <Help icon="fa-filter">{tm("collection.checkBankHelp")}</Help>
                </div>
              ) : (
                <div id="checkCashSelection" className="form-group">
                  <label htmlFor="CheckCashID">
                    <i className="fas fa-wallet" aria-hidden="true" /> {tm("collection.checkCash")}
                  </label>
                  <select
                    id="CheckCashID"
                    name="CheckCashID"
                    className="form-control no-select2"
                    disabled
                    title={tm("shared.phase123")}
                    aria-describedby="CheckCashID-phase"
                  >
                    <option value="">{tm("fund.selectBranchFirst")}</option>
                  </select>
                  <PhaseNote id="CheckCashID-phase" step="12.3" />
                  <Help icon="fa-filter">{tm("collection.checkCashHelp")}</Help>
                </div>
              )}
            </div>
          </div>
        );
      case "NOTE":
        return (
          <div id="billTopFields">
            <div className="field-group">
              <div className="field-group-title">
                <i className="fas fa-file-invoice-dollar" aria-hidden="true" />{" "}
                {tm("collection.billTopTitle")}
              </div>
              <div className="form-group">
                <label htmlFor="BillBankID">
                  <i className="fas fa-university" aria-hidden="true" /> {tm("collection.billBank")}
                </label>
                <select
                  id="BillBankID"
                  name="BillBankID"
                  className="form-control no-select2"
                  disabled
                  title={tm("shared.phase123")}
                  aria-describedby="BillBankID-phase"
                >
                  <option value="">{tm("fund.selectBranchFirst")}</option>
                </select>
                <PhaseNote id="BillBankID-phase" step="12.3" />
                <Help icon="fa-filter">{tm("collection.billBankHelp")}</Help>
              </div>
            </div>
          </div>
        );
      default:
        return null;
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
        onEntered={() => document.getElementById(edit ? ids.method : ids.account)?.focus()}
      >
        <ModalHeader
          titleId={titleId}
          icon={edit ? "fa-edit" : "fa-plus-circle"}
          title={edit ? tm("collection.editTitle") : tm("collection.addTitle")}
          className={edit ? "bg-warning" : undefined}
          onClose={props.onHide}
        />
        <form id={ids.form} ref={m.formRef} noValidate onSubmit={m.onSubmit}>
          <div className="modal-body">
            <ErrorBox
              items={errorItems(m.errors, ids, form, (key) => tm(`validation.${key}`))}
              server={m.serverError}
            />
            <div id={ids.remaining} className="mb-3">
              {form.accountId && (
                <RemainingCreditPanel accountId={form.accountId} companyId={m.workingCompany} />
              )}
            </div>

            <div className="form-row">
              <div className="col-md-3">
                <AccountSelect
                  id={ids.account}
                  value={form.accountId}
                  onChange={(accountId) => setForm((f) => withAccount(f, accountId))}
                  label={tm("collection.account")}
                  help={edit ? tm("collection.accountHelpEdit") : tm("collection.accountHelp")}
                  showActions
                  extra={accountExtra}
                  disabled={edit}
                  invalid={error("accountId").invalid}
                  describedBy={error("accountId").describedBy}
                />
              </div>
              <div className="col-md-3">
                <MethodSelect
                  id={ids.method}
                  label={tm("collection.method")}
                  mode={props.mode}
                  value={form.method}
                  onChange={(method) => setForm((f) => withMethod(f, method))}
                  error={error("method")}
                />
              </div>
              <div className="col-md-3">
                <DocumentNoInput
                  id={ids.documentNo}
                  label={edit ? tm("collection.documentNoEdit") : tm("collection.documentNo")}
                  placeholder={tm("collection.documentNoPlaceholder")}
                  help={
                    edit ? tm("collection.documentNoHelpEdit") : tm("collection.documentNoHelp")
                  }
                  value={form.documentNo}
                  onChange={(documentNo) => setForm((f) => ({ ...f, documentNo }))}
                />
              </div>
              <div className="col-md-3">
                <DateInput
                  id={ids.date}
                  label={tm("collection.date")}
                  value={form.date}
                  onChange={(date) => setForm((f) => m.reconcileRate({ ...f, date }))}
                  error={error("date")}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="col-md-3">
                <BranchGroup
                  id={ids.branch}
                  help={tm("collection.workPlaceHelp")}
                  value={form.branchId}
                  onChange={(branchId) => setForm((f) => withBranch(f, branchId))}
                  companyId={m.companyId}
                  error={error("branchId")}
                />
              </div>
              <div className="col-md-5">
                <div className="field-group">
                  <div className="field-group-title">
                    <i className="fas fa-coins" aria-hidden="true" />{" "}
                    {tm("collection.currencyTitle")}
                  </div>
                  <div
                    id={
                      edit
                        ? "editNormalCurrencyCollectionSection"
                        : "normalCurrencyCollectionSection"
                    }
                  >
                    <CurrencySelect
                      id={ids.currency}
                      value={form.currency}
                      onChange={(currency) =>
                        setForm((f) => m.reconcileRate(withCurrency(f, currency)))
                      }
                      disabled={fundLocked}
                      withPlaceholder
                      help={tm("collection.currencyHelp")}
                      error={error("currency")}
                    />
                  </div>
                </div>
              </div>
              <div className="col-md-4">{topFields()}</div>
            </div>

            {form.method === "CHECK" && (
              <CheckFields
                variant="received"
                value={form.check}
                onChange={(check) => setForm((f) => ({ ...f, check }))}
                branchId={form.branchId}
                companyId={m.workingCompany}
                currency={form.currency}
                errors={{
                  number: error("check.number").invalid ? "x" : undefined,
                  dueDate: error("check.dueDate").invalid ? "x" : undefined,
                }}
              />
            )}
            {form.method === "NOTE" && (
              <NoteFields
                variant="received"
                value={form.note}
                onChange={(note) => setForm((f) => ({ ...f, note }))}
                branchId={form.branchId}
                companyId={m.workingCompany}
                accountLabel={
                  m.selectedAccount
                    ? accountOptionLabel(m.selectedAccount)
                    : (accountExtra?.label ?? "")
                }
                errors={{
                  number: error("note.number").invalid ? "x" : undefined,
                  dueDate: error("note.dueDate").invalid ? "x" : undefined,
                }}
              />
            )}

            <div className="form-row">
              <div className="field-group col-md-12">
                <div className="field-group-title">
                  <i className="fas fa-money-bill" aria-hidden="true" />{" "}
                  {edit ? tm("collection.amountTitleEdit") : tm("collection.amountTitle")}
                </div>
                <div className="form-row">
                  <div className="col-md-3">
                    <div className="form-group">
                      <label htmlFor={ids.amount} className="required-field">
                        <i className="fas fa-money-bill-wave" aria-hidden="true" />{" "}
                        {tm("collection.amount")}
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
                          value={form.amount}
                          onChange={(event) =>
                            setForm((f) => ({
                              ...f,
                              amount: formatDecimalInput(event.target.value, 2),
                            }))
                          }
                          aria-invalid={error("amount").invalid}
                          aria-describedby={
                            [error("amount").describedBy, "collectionWarningLines"]
                              .filter(Boolean)
                              .join(" ") || undefined
                          }
                        />
                        <div className="input-group-append">
                          <span className="input-group-text" style={{ fontSize: 13 }}>
                            {symbol}
                          </span>
                        </div>
                      </div>
                      <Help>{tm("collection.amountHelp")}</Help>
                    </div>
                  </div>
                  <div
                    className="col-md-3"
                    id={
                      edit
                        ? "editNormalExchangeRateCollectionSection"
                        : "normalExchangeRateCollectionSection"
                    }
                  >
                    <div className="form-group">
                      <label htmlFor={ids.exchangeRate}>
                        <i className="fas fa-exchange-alt" aria-hidden="true" />{" "}
                        {tm("collection.exchangeRate")}
                      </label>
                      <input
                        id={ids.exchangeRate}
                        name="ExchangeRate"
                        className="form-control"
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]{0,4}"
                        placeholder="1.0000"
                        autoComplete="off"
                        disabled={form.currency === "TRY"}
                        value={form.currency === "TRY" ? "" : form.exchangeRate}
                        onChange={(event) =>
                          setForm((f) => ({
                            ...f,
                            exchangeRate: formatDecimalInput(event.target.value, 4),
                          }))
                        }
                      />
                      <Help>{tm("collection.exchangeRateHelp")}</Help>
                    </div>
                  </div>
                  <div
                    className="col-md-6"
                    id={edit ? "editNormalAmountCollectionRow" : "normalAmountCollectionRow"}
                  >
                    <div className="form-row">
                      <div className="col-md-5">
                        <div className="form-group">
                          <label htmlFor={ids.ledgerAmount} className="required-field">
                            <i className="fas fa-calculator" aria-hidden="true" />{" "}
                            {tm("collection.ledgerAmount")}
                          </label>
                          <div className="input-group">
                            <input
                              id={ids.ledgerAmount}
                              name="Amount"
                              className="form-control"
                              type="text"
                              readOnly
                              style={{ backgroundColor: "#f8f9fa", fontWeight: "bold" }}
                              placeholder="0.00"
                              value={amountText(form.amount) || "0.00"}
                            />
                            <div className="input-group-append">
                              <span className="input-group-text" style={{ fontSize: 13 }}>
                                {symbol}
                              </span>
                            </div>
                          </div>
                          <Help>{tm("collection.ledgerAmountHelp")}</Help>
                        </div>
                      </div>
                      <div className="col-md-7">
                        {calculation && (
                          <div
                            className="alert alert-success"
                            id={ids.calculation}
                            style={{ fontSize: 13 }}
                          >
                            <i className="fas fa-calculator" aria-hidden="true" />{" "}
                            <strong>{tm("collection.calculation")}</strong>{" "}
                            <span>{calculation}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <WarningLines type="COLLECTION" check={m.preview} id="collectionWarningLines" />
              </div>
            </div>

            {!edit && isBankLike(form.method) && form.accountId && (
              <div id="customerBankSection">
                <div className="field-group">
                  <div className="field-group-title">
                    <i className="fas fa-university" aria-hidden="true" />{" "}
                    {tm("collection.customerBankTitle")}
                  </div>
                  <div className="form-group">
                    <label htmlFor={ids.counterparty}>
                      <i className="fas fa-building" aria-hidden="true" />{" "}
                      {tm("shared.customerBankLabel")}
                    </label>
                    <CounterpartyBankSelect
                      id={ids.counterparty}
                      accountId={form.accountId}
                      accountType={m.selectedAccount?.type ?? null}
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
                    <Help>{tm("collection.customerBankHelp")}</Help>
                  </div>
                </div>
              </div>
            )}

            <InvoiceAllocationTable
              type="COLLECTION"
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

            <DescriptionGroup
              id={ids.description}
              label={tm("collection.description")}
              placeholder={tm("collection.descriptionPlaceholder")}
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
          <ModalFooter
            pending={m.pending}
            onCancel={props.onHide}
            onSave={m.requestSave}
            update={edit}
          />
        </form>
      </ZtoModal>
      {m.confirmModal}
      {m.notice && !props.show && <FixedNotice notice={m.notice} onClose={m.clearNotice} />}
    </>
  );
}
