import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useActiveCompanyId, isMultiCompany } from "../../../../auth/companyStore";
import { useAuthStore } from "../../../../auth/authStore";
import {
  useCreateIntercompany,
  useCreateTransfer,
  useFundList,
} from "../../../../pages/finance/fundApi";
import type { Fund, IntercompanyReasonType } from "../../../../pages/finance/types";
import { errorIdOf } from "../../../a11y";
import { useBranchTree } from "../../../branch/branchTree";
import {
  ZtoAlert,
  ZtoBranchSelect,
  ZtoSelect,
  currencySymbol,
  formatN2,
  type ZtoSelectOption,
} from "../../../components";
import { CollectionSelection } from "./CollectionSelection";
import {
  calculateFx,
  computedField,
  costSummary,
  costsOnSource,
  formatAmountInput,
  parseAmountInput,
  rateCurrencyLabel,
  type CalcOperation,
  type ZtoCalcMode,
} from "./fxCalcLogic";
import { NegativeBalanceModal } from "./NegativeBalanceModal";
import {
  branchIndex,
  buildIntercompanyBody,
  buildTransferBody,
  deepLinkSteps,
  errorKey,
  errorParts,
  flatBranchOptions,
  fundOptionLabel,
  intercompanyInfoText,
  intercompanyReasonText,
  negativeBalance,
  todayIso,
  validateDraft,
  EMPTY_FX_SELECTION,
  selectionSources,
  selectionTotal,
  type DeepLink,
  type FxSelection,
  type DraftError,
  type DraftField,
  type NegativeBalance,
  type TransferDraft,
} from "./transferCenterLogic";
import { TransferResultModal, type TransferResult } from "./TransferResultModal";
import {
  bankCashSourceKind,
  evaluateBankCashTargets,
  evaluateBankTargets,
  fundsIn,
  infoAlertKey,
  isIntercompany,
  requiresTargetBranch,
  showsSourceTypeHint,
  sourceAmountLabelKey,
  sourceEnabled,
  targetBranchCompany,
  transferTypeOf,
  type BankCashDirection,
  type TransferMode,
  type VirmanSubType,
} from "./transferRulesLogic";
import { TransferSidePanel } from "./TransferSidePanel";

type Props = {
  link: DeepLink;
  /** Başarı penceresi kapanınca: form sıfırlanır, Transferler sekmesine geçilir (bsjs:3104-3109). */
  onSaved: () => void;
};

const FLASH_MS = 3000;
const TYPE_CARDS: Array<{
  mode: TransferMode;
  className: string;
  icon: string;
  title: string;
  desc: string;
}> = [
  {
    mode: "VIRMAN",
    className: "virman",
    icon: "fas fa-exchange-alt text-primary",
    title: "cards.virmanTitle",
    desc: "cards.virmanDesc",
  },
  {
    mode: "FX",
    className: "exchange",
    icon: "fas fa-coins text-warning",
    title: "cards.fxTitle",
    desc: "cards.fxDesc",
  },
  {
    mode: "BANKCASH",
    className: "bankcash",
    icon: "fas fa-piggy-bank text-success",
    title: "cards.bankCashTitle",
    desc: "cards.bankCashDesc",
  },
];

const num = (text: string) => parseAmountInput(text);

/** Hata metni elemanı (MWG accessible-error-announcement: yalnız gösterilirken bağlanır). */
function FieldError({ id, message }: { id: string; message: string | null }) {
  return (
    <div id={errorIdOf(id)} className="invalid-feedback d-block" hidden={!message}>
      {message}
    </div>
  );
}

/**
 * "Yeni Transfer" formu (ZTO BS:1222-1765 + bsjs): üç tür kartı, Virman/EFT/Havale ve Döviz için ortak
 * iş yeri/banka akışı, Banka & Kasa bölümü, döviz bozumunda tahsilat seçimi, tutar/kur satırı,
 * masraflar, BS-11/BS-12 pencereleri. Kurallar transferRulesLogic, hesap fxCalcLogic, doğrulama ve
 * gövdeler transferCenterLogic'te.
 */
export function NewTransferForm({ link, onSaved }: Props) {
  const { t } = useTranslation("ztoFinans");
  const tc = (key: string) => t(`transferCenter.${key}`);
  const fundsQuery = useFundList({ companyId: null, accountType: "DEMAND", active: true });
  const funds = useMemo(() => fundsQuery.data ?? [], [fundsQuery.data]);
  const tree = useBranchTree("mine").data;
  const branches = useMemo(() => branchIndex(tree), [tree]);
  const companies = useAuthStore((state) => state.me?.companies);
  const multiCompany = isMultiCompany(companies);
  const activeCompanyId = useActiveCompanyId();
  const createTransfer = useCreateTransfer();
  const createIntercompany = useCreateIntercompany();

  const [mode, setMode] = useState<TransferMode>(link.mode ?? "VIRMAN");
  const [subType, setSubType] = useState<VirmanSubType>(link.subType);
  const [direction, setDirection] = useState<BankCashDirection>(link.direction || "BANK_TO_CASH");
  const [date, setDate] = useState(todayIso());
  const [sourceBranchId, setSourceBranchId] = useState(link.sourceBranchId);
  const [targetBranchId, setTargetBranchId] = useState(link.targetBranchId);
  const [sourceFundId, setSourceFundId] = useState(link.sourceFundId);
  const [targetFundId, setTargetFundId] = useState(link.targetFundId);
  const [amountText, setAmountText] = useState("");
  const [targetText, setTargetText] = useState("");
  const [rateText, setRateText] = useState("1");
  const [operation, setOperation] = useState<CalcOperation>("/");
  const [calcMode, setCalcMode] = useState<ZtoCalcMode>("source-rate");
  const [kmvText, setKmvText] = useState("0");
  const [commissionText, setCommissionText] = useState("0");
  const [feeText, setFeeText] = useState("0");
  const [costFundId, setCostFundId] = useState("");
  const [description, setDescription] = useState("");
  const [documentNo, setDocumentNo] = useState("");
  const [reason, setReason] = useState<IntercompanyReasonType | "">("");
  const [selection, setSelection] = useState<FxSelection>(EMPTY_FX_SELECTION);
  const [manual, setManual] = useState(false);
  const [error, setError] = useState<DraftError | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [negative, setNegative] = useState<
    (NegativeBalance & { cash: boolean; accountName: string; symbol: string }) | null
  >(null);
  const [result, setResult] = useState<TransferResult | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  // Derin bağlantı: iş yeri verilmemiş fonların iş yeri liste gelince türetilir (ZTO sırası, F4).
  const linkApplied = useRef(false);
  useEffect(() => {
    if (linkApplied.current || !fundsQuery.isSuccess) return;
    linkApplied.current = true;
    for (const step of deepLinkSteps(link, funds)) {
      if (step.kind === "sourceBranch") setSourceBranchId(step.branchId);
      if (step.kind === "targetBranch") setTargetBranchId(step.branchId);
    }
  }, [fundsQuery.isSuccess, funds, link]);

  // Gönderim hatasında ilk (tek) hatalı alana odak.
  useEffect(() => {
    if (!error) return;
    const errorId = errorIdOf(fieldId(error.field));
    document.querySelector<HTMLElement>(`[aria-describedby="${errorId}"]`)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  // --- türetilmiş durum ---
  const isFx = mode === "FX";
  const isBankCash = mode === "BANKCASH";
  const sourceKind = isBankCash ? bankCashSourceKind(direction) : "BANK";
  const sourcePool = fundsIn(funds, sourceKind, sourceBranchId);
  const canPickSource = sourceEnabled(mode, subType, direction, sourceBranchId);
  const source = canPickSource ? (sourcePool.find((f) => f.id === sourceFundId) ?? null) : null;
  const sourceCompanyId = branches.get(sourceBranchId)?.companyId ?? null;
  const bankEval = !isBankCash
    ? evaluateBankTargets({ mode, subType, source, sourceBranchId, targetBranchId, funds })
    : null;
  const bankCashEval = isBankCash
    ? evaluateBankCashTargets({ direction, source, targetBranchId, funds })
    : null;
  const targetOptions = bankEval?.options ?? bankCashEval?.options ?? [];
  const target = targetOptions.find((o) => o.fund.id === targetFundId && !o.reason)?.fund ?? null;
  const targetEnabled = isBankCash ? !!direction && !!targetBranchId : !!bankEval?.enabled;
  const type = transferTypeOf(mode, subType, direction);
  const intercompany = isIntercompany(type, source, target);
  const companyName = (id: string | null) => companies?.find((c) => c.id === id)?.shortName ?? "";

  const fx = isFx
    ? calculateFx({
        mode: calcMode,
        operation,
        source: num(amountText),
        rate: num(rateText),
        target: num(targetText),
      })
    : null;
  const sourceAmount = fx ? fx.source : num(amountText);
  const targetAmount = fx ? fx.target : sourceAmount;
  const effectiveRate = fx ? fx.effectiveRate : 1;
  const costs = costSummary({
    kmvRate: isFx ? num(kmvText) : 0,
    commission: isFx ? num(commissionText) : 0,
    fee: isFx ? num(feeText) : 0,
    source: sourceAmount,
    target: targetAmount,
    sourceCurrency: source?.currency ?? null,
    targetCurrency: target?.currency ?? null,
  });
  const computed = isFx ? computedField(calcMode) : null;
  const sourceSym = currencySymbol(source?.currency ?? "TRY");
  const targetSym = currencySymbol(target?.currency ?? "TRY");
  const saving = createTransfer.isPending || createIntercompany.isPending;

  // --- alan yardımcıları ---
  function fieldId(field: DraftField): string {
    switch (field) {
      case "direction":
        return "bankCashDirection";
      case "source":
        return isBankCash
          ? direction === "BANK_TO_CASH"
            ? "bankCashSourceBank"
            : "bankCashSourceCash"
          : "newSourceBank";
      case "target":
        return isBankCash
          ? direction === "CASH_TO_BANK"
            ? "bankCashTargetBank"
            : "bankCashTargetCash"
          : "newTargetBank";
      case "amount":
        return "newSourceAmount";
      case "date":
        return isBankCash ? "bankCashTransferDate" : "newTransferDate";
      case "type":
        return "virmanTransferType";
      case "calcMode":
        return "exchangeCalcMode";
      case "rate":
        return "newRate1";
      default:
        return "transferReasonType";
    }
  }
  const messageFor = (field: DraftField) => (error?.field === field ? tc(error.key) : null);
  const a11y = (field: DraftField, id = fieldId(field)) => {
    const shown = error?.field === field;
    return {
      "aria-invalid": shown,
      "aria-describedby": shown ? errorIdOf(id) : undefined,
    } as const;
  };
  const clearError = (...fields: DraftField[]) => {
    if (error && fields.includes(error.field)) setError(null);
  };
  const showFlash = (text: string) => {
    setFlash(text);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
  };

  // --- olaylar (ZTO sıfırlama kuralları) ---
  function resetAmounts() {
    setAmountText("");
    setTargetText("");
    setRateText("1");
    setOperation("/");
    setCalcMode("source-rate");
    setKmvText("0");
    setCommissionText("0");
    setFeeText("0");
    setSelection(EMPTY_FX_SELECTION);
    setManual(false);
  }

  function selectMode(next: TransferMode) {
    if (next === mode) return;
    setSourceFundId("");
    setTargetFundId("");
    setReason("");
    if (next === "VIRMAN") {
      setSourceBranchId("");
      setTargetBranchId("");
      setSubType("");
    }
    if (next === "BANKCASH") setDirection(direction || "BANK_TO_CASH");
    if (next !== "FX") resetAmounts();
    else {
      setTargetText("");
      setCalcMode("source-rate");
    }
    setMode(next);
    setError(null);
  }

  function changeSubType(next: VirmanSubType) {
    setSubType(next);
    setSourceFundId("");
    setTargetFundId("");
    setAmountText("");
    setTargetText("");
    clearError("type", "source", "target");
    if (!next) showFlash(tc("form.pickTypeFirst"));
    else setFlash(null);
  }

  function changeSourceBranch(id: string) {
    setSourceBranchId(id);
    setSourceFundId("");
    if (mode === "VIRMAN" && subType === "VIREMENT") setTargetFundId("");
    setSelection(EMPTY_FX_SELECTION);
    setManual(false);
  }

  function changeTargetBranch(id: string) {
    setTargetBranchId(id);
    setTargetFundId("");
  }

  function changeSourceFund(id: string) {
    setSourceFundId(id);
    setFlash(null);
    setCostFundId("");
    setSelection(EMPTY_FX_SELECTION);
    setManual(false);
    clearError("source");
  }

  function changeSelection(next: FxSelection) {
    setSelection(next);
    if (!manual) {
      const total = selectionTotal(next);
      setAmountText(total > 0 ? total.toFixed(2) : "");
    }
  }

  function changeAmount(text: string) {
    setAmountText(text);
    clearError("amount");
    // Seçim varken elle tutar → "Manuel" kip (bsjs `setManualSourceMode(true)`).
    if (isFx && !manual && selectionTotal(selection) > 0) setManual(true);
  }

  function backToSelection() {
    setManual(false);
    const total = selectionTotal(selection);
    setAmountText(total > 0 ? total.toFixed(2) : "");
  }

  function resetForm() {
    resetAmounts();
    setSourceBranchId("");
    setTargetBranchId("");
    setSourceFundId("");
    setTargetFundId("");
    setDescription("");
    setDocumentNo("");
    setReason("");
    setSubType("");
    setMode("VIRMAN");
    setError(null);
    setFlash(null);
    createTransfer.resetIdempotencyKey();
    createIntercompany.resetIdempotencyKey();
  }

  function draft(): TransferDraft & { description: string; documentNo: string } {
    return {
      mode,
      subType,
      direction,
      date,
      source,
      target,
      amount: sourceAmount,
      calcMode,
      rate: fx ? fx.rate : 1,
      intercompany,
      reason,
      description,
      documentNo,
    };
  }

  function save() {
    const current = draft();
    const problem = validateDraft(current);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    const sameFundCosts = isFx && source ? costsOnSource(costs, costFundId, source.id) : 0;
    const risk = negativeBalance(source, sourceAmount, sameFundCosts);
    if (risk && source) {
      setNegative({
        ...risk,
        cash: source.kind === "CASH",
        accountName: source.bankName ?? source.name,
        symbol: currencySymbol(source.currency),
      });
      return;
    }
    void submit(current);
  }

  async function submit(current: ReturnType<typeof draft>) {
    if (!type) return;
    try {
      if (intercompany) {
        const response = await createIntercompany.mutateAsync(buildIntercompanyBody(current, type));
        setResult({
          success: true,
          message: `${tc("resultLabels.INTERCOMPANY")} ${tc("result.created")}`,
          code: response.code,
          target: formatN2(response.money.amount),
        });
        return;
      }
      const body = buildTransferBody(
        current,
        type,
        isFx && fx
          ? {
              targetAmount: fx.target,
              rate: fx.rate,
              operation,
              calcMode,
              kmvRate: num(kmvText),
              commission: num(commissionText),
              fee: num(feeText),
              costFundId,
              sources: selectionSources(selection),
            }
          : undefined,
      );
      const response = await createTransfer.mutateAsync(body);
      setResult({
        success: true,
        message: `${tc(`resultLabels.${type}`)} ${tc("result.created")}`,
        code: response.code,
        target: formatN2(response.targetMoney.amount),
      });
    } catch (err) {
      const { code, message } = errorParts(err);
      const key = errorKey(code, source?.kind);
      setResult({
        success: false,
        message: `${tc("result.errorPrefix")} ${key ? tc(key) : (message ?? tc("result.failed"))}`,
      });
    }
  }

  function closeResult(closed: TransferResult) {
    setResult(null);
    if (closed.success) {
      resetForm();
      onSaved();
    }
  }

  // --- seçenekler ---
  const placeholderSource = !sourceBranchId
    ? tc("form.pickWorkPlace")
    : sourcePool.length === 0
      ? tc("form.noBank")
      : tc("form.select");
  const placeholderTarget =
    mode === "VIRMAN" && !sourceBranchId
      ? tc("form.pickWorkPlace")
      : requiresTargetBranch(mode, subType) && !targetBranchId
        ? tc("form.pickTargetWorkPlace")
        : tc("form.select");
  const fundOption = (fund: Fund, reason?: string | null): ZtoSelectOption => ({
    value: fund.id,
    label: fundOptionLabel(fund, branches),
    disabled: !!reason,
  });
  const sourceOptions = sourcePool.map((fund) => fundOption(fund));
  const targetSelectOptions = targetOptions.map((o) => fundOption(o.fund, o.reason));
  const costFundOptions = source
    ? funds
        .filter((f) => f.kind === "BANK" && f.companyId === source.companyId && f.active)
        .map((fund) => fundOption(fund))
    : [];
  const targetBranchCompanyId = targetBranchCompany(mode, sourceCompanyId);

  const hintText = flash
    ? flash
    : bankEval && bankEval.hints.length > 0
      ? bankEval.hints.map((h) => tc(`hints.${h}`)).join(" ")
      : bankEval?.tone === "warning"
        ? tc("hints.noTarget")
        : null;
  const hintTone = flash ? "info" : bankEval?.tone;

  const balanceSpan = (fund: Fund | null, id: string) => (
    <span className={`balance ${fund && fund.balance < 0 ? "negative" : "positive"}`} id={id}>
      {fund ? `${formatN2(fund.balance)} ${currencySymbol(fund.currency)}` : "-"}
    </span>
  );

  const infoText = tc(infoAlertKey(mode, subType, direction));
  const reasonOptions: Array<{ value: IntercompanyReasonType; label: string }> =
    intercompany && source && target
      ? (["DEBT_PAID", "LOAN_GIVEN"] as const).map((value) => ({
          value,
          label: intercompanyReasonText(
            value,
            companyName(source.companyId),
            companyName(target.companyId),
          ),
        }))
      : [];

  // --- bölümler ---
  const dateInput = (id: string, colClass: string, small: boolean) => (
    <div className={colClass}>
      <label className="form-label" htmlFor={id}>
        <i className="fas fa-calendar" aria-hidden="true" /> {tc("form.date")}{" "}
        <span className="text-danger">*</span>
      </label>
      <input
        type="date"
        id={id}
        className={small ? "form-control form-control-sm" : "form-control"}
        value={date}
        required
        onChange={(event) => {
          setDate(event.target.value);
          clearError("date");
        }}
        {...a11y("date", id)}
      />
      <FieldError id={id} message={messageFor("date")} />
    </div>
  );

  const standardSection = (
    <div
      id="standardTransferSection"
      className={`card ${isFx ? "border-warning" : "border-primary"} mb-3`}
    >
      <div
        className={`card-header ${isFx ? "bg-warning text-dark" : "bg-primary text-white"} py-2`}
        id="standardTransferSectionHeader"
      >
        <h6 className="mb-0" id="standardTransferSectionTitle">
          <i className={isFx ? "fas fa-coins" : "fas fa-exchange-alt"} aria-hidden="true" />{" "}
          {isFx ? tc("form.sectionFx") : tc("form.sectionVirman")}
        </h6>
      </div>
      <div className="card-body">
        <div id={isFx ? "exchangeModeBlock" : "virmanModeBlock"} className="mode-flow-block">
          <div className="small text-muted mb-2">
            <i className={isFx ? "fas fa-coins mr-1" : "fas fa-random mr-1"} aria-hidden="true" />
            {isFx ? tc("form.flowFx") : tc("form.flowVirman")}
          </div>
          <div id="sharedFlowRows">
            <div className="row mb-3" id="standardWorkPlaceSection">
              {dateInput("newTransferDate", "col-md-2", false)}
              <div className="col-md-4" id="sourceWorkPlaceWrapper">
                <div className="flow-step-card flow-step-source">
                  <label className="form-label mb-1" htmlFor="newSourceWorkPlace">
                    <i className="fas fa-building text-danger" aria-hidden="true" />{" "}
                    {tc("form.sourceWorkPlace")} <span className="text-danger">*</span>
                  </label>
                  <ZtoBranchSelect
                    id="newSourceWorkPlace"
                    className="form-control form-control-sm"
                    value={sourceBranchId}
                    onChange={changeSourceBranch}
                    placeholder={tc("form.select")}
                    required
                  />
                </div>
              </div>
              <div
                className="col-md-1 d-flex align-items-center justify-content-center transfer-direction-column"
                id="workPlaceDirectionColumn"
              >
                <div className="transfer-direction-panel">
                  <i
                    className="fas fa-long-arrow-alt-right text-primary"
                    style={{ fontSize: 20 }}
                    aria-hidden="true"
                  />
                </div>
              </div>
              <div className="col-md-5" id="targetWorkPlaceWrapper">
                <div className="flow-step-card flow-step-target">
                  <label className="form-label mb-1" htmlFor="newTargetWorkPlace">
                    <i className="fas fa-building text-success" aria-hidden="true" />{" "}
                    {tc("form.targetWorkPlace")} <span className="text-danger">*</span>
                  </label>
                  <ZtoBranchSelect
                    id="newTargetWorkPlace"
                    className="form-control form-control-sm"
                    value={
                      mode === "VIRMAN" && subType === "VIREMENT" ? sourceBranchId : targetBranchId
                    }
                    onChange={changeTargetBranch}
                    placeholder={tc("form.select")}
                    disabled={mode === "VIRMAN" && subType === "VIREMENT"}
                    companyId={targetBranchCompanyId ?? (isFx ? "active" : null)}
                    required
                  />
                </div>
              </div>
            </div>
            <div className="row mb-3" id="standardBankSection">
              {isFx ? (
                <div className="col-md-2" id="dovizBozumTransferTypeWrapper">
                  <label className="form-label text-center mb-1" htmlFor="dovizBozumTransferType">
                    <i className="fas fa-exchange-alt" aria-hidden="true" />{" "}
                    {tc("form.transferType")} <span className="text-danger">*</span>
                  </label>
                  <select
                    id="dovizBozumTransferType"
                    className="form-control no-select2"
                    defaultValue="fx"
                  >
                    <option value="fx">{tc("form.fxType")}</option>
                  </select>
                </div>
              ) : (
                <div className="col-md-2" id="virmanTransferTypeWrapper">
                  <label className="form-label text-center mb-1" htmlFor="virmanTransferType">
                    <i className="fas fa-exchange-alt" aria-hidden="true" />{" "}
                    {tc("form.transferType")} <span className="text-danger">*</span>
                  </label>
                  <select
                    id="virmanTransferType"
                    className="form-control no-select2"
                    value={subType}
                    onChange={(event) => changeSubType(event.target.value as VirmanSubType)}
                    {...a11y("type")}
                  >
                    <option value="">{tc("form.select")}</option>
                    <option value="VIREMENT">{tc("subTypes.VIREMENT")}</option>
                    <option value="EFT">{tc("subTypes.EFT")}</option>
                    <option value="WIRE">{tc("subTypes.WIRE")}</option>
                  </select>
                  <FieldError id="virmanTransferType" message={messageFor("type")} />
                </div>
              )}
              <div className="col-md-4">
                <div className="bank-select-card flow-step-card flow-step-source">
                  <label className="text-danger" htmlFor="newSourceBank">
                    <i className="fas fa-arrow-up" aria-hidden="true" /> {tc("form.sourceBank")}{" "}
                    <span className="text-danger">*</span>
                  </label>
                  <ZtoSelect
                    id="newSourceBank"
                    className="form-control form-control-sm mb-1"
                    value={source?.id ?? ""}
                    onChange={changeSourceFund}
                    options={sourceOptions}
                    placeholder={placeholderSource}
                    disabled={!canPickSource || sourcePool.length === 0}
                    {...a11y("source")}
                  />
                  <FieldError id="newSourceBank" message={messageFor("source")} />
                  {showsSourceTypeHint(mode, subType, sourceBranchId) && (
                    <small id="sourceBankHint" className="text-info mt-1" style={{ fontSize: 10 }}>
                      <i className="fas fa-info-circle" aria-hidden="true" /> {tc("form.typeHint")}
                    </small>
                  )}
                  <div className="d-flex justify-content-between" style={{ fontSize: 11 }}>
                    <span className="text-muted">{tc("form.balance")}</span>
                    {balanceSpan(source, "sourceBankBalance")}
                  </div>
                </div>
              </div>
              <div
                className="col-md-1 d-flex align-items-center justify-content-center transfer-direction-column"
                id="transferDirectionColumn"
              >
                <div className="transfer-direction-panel">
                  <i
                    className="fas fa-long-arrow-alt-right text-primary"
                    style={{ fontSize: 20 }}
                    aria-hidden="true"
                  />
                  {isFx && <div className="exchange-direction-title" id="exchangeDirectionTitle" />}
                  {isFx && (
                    <div className="exchange-direction-pair" id="exchangeDirectionPair">
                      {source?.currency ?? ""}{" "}
                      <i
                        className="fas fa-long-arrow-alt-right mx-1"
                        style={{ fontSize: 10 }}
                        aria-hidden="true"
                      />{" "}
                      {target?.currency ?? ""}
                    </div>
                  )}
                </div>
              </div>
              <div className="col-md-5" id="targetBankColumn">
                <div className="bank-select-card flow-step-card flow-step-target">
                  <label className="text-success" htmlFor="newTargetBank">
                    <i className="fas fa-arrow-down" aria-hidden="true" /> {tc("form.targetBank")}{" "}
                    <span className="text-danger">*</span>
                  </label>
                  <ZtoSelect
                    id="newTargetBank"
                    className="form-control form-control-sm mb-1"
                    value={target?.id ?? ""}
                    onChange={(id) => {
                      setTargetFundId(id);
                      clearError("target");
                    }}
                    options={targetSelectOptions}
                    placeholder={placeholderTarget}
                    disabled={!targetEnabled}
                    aria-invalid={error?.field === "target"}
                    aria-describedby={
                      error?.field === "target"
                        ? errorIdOf("newTargetBank")
                        : hintText
                          ? "targetBankWarning"
                          : undefined
                    }
                  />
                  <FieldError id="newTargetBank" message={messageFor("target")} />
                  <div className="d-flex justify-content-between" style={{ fontSize: 11 }}>
                    <span className="text-muted">{tc("form.balance")}</span>
                    {balanceSpan(target, "targetBankBalance")}
                  </div>
                  {hintText && (
                    <div
                      id="targetBankWarning"
                      className={`text-${hintTone === "warning" ? "warning" : "info"} mt-1`}
                      style={{ fontSize: 10 }}
                    >
                      <i
                        className={
                          hintTone === "warning"
                            ? "fas fa-exclamation-triangle"
                            : "fas fa-info-circle"
                        }
                        aria-hidden="true"
                      />{" "}
                      {hintText}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const bankCashSourceOptions = flatBranchOptions(tree, activeCompanyId, multiCompany);
  const bankCashTargetBranchOptions = flatBranchOptions(tree, null, multiCompany);
  const bankCashSourceId =
    direction === "BANK_TO_CASH" ? "bankCashSourceBank" : "bankCashSourceCash";
  const bankCashTargetId =
    direction === "CASH_TO_BANK" ? "bankCashTargetBank" : "bankCashTargetCash";
  const bankCashSourcePlaceholder = !direction
    ? tc("form.pickDirectionWorkPlace")
    : !sourceBranchId
      ? tc("form.pickSourceWorkPlace")
      : sourcePool.length === 0
        ? tc(direction === "BANK_TO_CASH" ? "form.noBank" : "form.noCash")
        : tc("form.select");
  const bankCashTargetPlaceholder = !direction
    ? tc("form.pickDirectionWorkPlace")
    : !targetBranchId
      ? tc("form.pickTargetWorkPlace")
      : targetOptions.length === 0
        ? tc(direction === "CASH_TO_BANK" ? "form.noBank" : "form.noCash")
        : tc("form.select");

  const bankCashSection = (
    <div id="bankCashTransferSection" className="card border-success mb-3">
      <div className="card-header bg-success text-white py-2">
        <h6 className="mb-0">
          <i className="fas fa-piggy-bank" aria-hidden="true" /> {tc("form.bankCashSection")}
        </h6>
      </div>
      <div className="card-body">
        <div className="row mb-3">
          {dateInput("bankCashTransferDate", "col-md-3", true)}
          <div className="col-md-4">
            <label className="form-label" htmlFor="bankCashSourceWorkPlace">
              <i className="fas fa-building text-danger" aria-hidden="true" />{" "}
              {tc("form.sourceWorkPlace")} <span className="text-danger">*</span>
            </label>
            <ZtoSelect
              id="bankCashSourceWorkPlace"
              className="form-control form-control-sm"
              value={sourceBranchId}
              onChange={changeSourceBranch}
              options={[{ value: "", label: tc("form.select") }, ...bankCashSourceOptions]}
              placeholder={null}
            />
          </div>
          <div className="col-md-1 d-flex align-items-center justify-content-center transfer-direction-column">
            <div className="transfer-direction-panel">
              <i
                className="fas fa-long-arrow-alt-right text-primary"
                style={{ fontSize: 20 }}
                aria-hidden="true"
              />
            </div>
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="bankCashTargetWorkPlace">
              <i className="fas fa-building text-success" aria-hidden="true" />{" "}
              {tc("form.targetWorkPlace")} <span className="text-danger">*</span>
            </label>
            <ZtoSelect
              id="bankCashTargetWorkPlace"
              className="form-control form-control-sm"
              value={targetBranchId}
              onChange={changeTargetBranch}
              options={[{ value: "", label: tc("form.select") }, ...bankCashTargetBranchOptions]}
              placeholder={null}
            />
          </div>
        </div>
        <div className="row mb-3">
          <div className="col-md-3">
            <label className="form-label" htmlFor="bankCashDirection">
              <i className="fas fa-random" aria-hidden="true" /> {tc("form.direction")}{" "}
              <span className="text-danger">*</span>
            </label>
            <ZtoSelect
              id="bankCashDirection"
              className="form-control form-control-sm"
              value={direction}
              onChange={(value) => {
                setDirection(value as BankCashDirection);
                setSourceFundId("");
                setTargetFundId("");
                clearError("direction");
              }}
              options={[
                { value: "", label: tc("form.select") },
                { value: "BANK_TO_CASH", label: tc("directions.BANK_TO_CASH") },
                { value: "CASH_TO_BANK", label: tc("directions.CASH_TO_BANK") },
                { value: "CASH_TO_CASH", label: tc("directions.CASH_TO_CASH") },
              ]}
              placeholder={null}
              {...a11y("direction")}
            />
            <FieldError id="bankCashDirection" message={messageFor("direction")} />
          </div>
          <div className="col-md-4">
            <div className="bank-select-card h-100">
              <label className="text-danger" id="bankCashSourceLabel" htmlFor={bankCashSourceId}>
                <i className="fas fa-arrow-up" aria-hidden="true" />{" "}
                {direction === "BANK_TO_CASH" ? tc("form.sourceBank") : tc("form.sourceCash")}{" "}
                <span className="text-danger">*</span>
              </label>
              <ZtoSelect
                id={bankCashSourceId}
                className="form-control form-control-sm mb-1"
                value={source?.id ?? ""}
                onChange={changeSourceFund}
                options={sourceOptions}
                placeholder={bankCashSourcePlaceholder}
                disabled={!canPickSource || sourcePool.length === 0}
                {...a11y("source")}
              />
              <FieldError id={bankCashSourceId} message={messageFor("source")} />
              <div className="d-flex justify-content-between" style={{ fontSize: 11 }}>
                <span className="text-muted">{tc("form.balance")}</span>
                {balanceSpan(source, "bankCashSourceBalance")}
              </div>
            </div>
          </div>
          <div className="col-md-1 d-flex align-items-center justify-content-center transfer-direction-column">
            <div className="transfer-direction-panel">
              <i
                className="fas fa-long-arrow-alt-right text-primary"
                style={{ fontSize: 20 }}
                aria-hidden="true"
              />
            </div>
          </div>
          <div className="col-md-4">
            <div className="bank-select-card h-100">
              <label className="text-success" id="bankCashTargetLabel" htmlFor={bankCashTargetId}>
                <i className="fas fa-arrow-down" aria-hidden="true" />{" "}
                {direction === "CASH_TO_BANK" ? tc("form.targetBank") : tc("form.targetCash")}{" "}
                <span className="text-danger">*</span>
              </label>
              <ZtoSelect
                id={bankCashTargetId}
                className="form-control form-control-sm mb-1"
                value={target?.id ?? ""}
                onChange={(id) => {
                  setTargetFundId(id);
                  clearError("target");
                }}
                options={targetSelectOptions}
                placeholder={bankCashTargetPlaceholder}
                disabled={!targetEnabled || targetOptions.length === 0}
                aria-invalid={error?.field === "target"}
                aria-describedby={
                  error?.field === "target"
                    ? errorIdOf(bankCashTargetId)
                    : bankCashEval?.hint
                      ? "bankCashTargetWarning"
                      : undefined
                }
              />
              <FieldError id={bankCashTargetId} message={messageFor("target")} />
              <div className="d-flex justify-content-between" style={{ fontSize: 11 }}>
                <span className="text-muted">{tc("form.balance")}</span>
                {balanceSpan(target, "bankCashTargetBalance")}
              </div>
              {bankCashEval?.hint && (
                <div id="bankCashTargetWarning" className="text-info mt-1" style={{ fontSize: 10 }}>
                  <i className="fas fa-info-circle" aria-hidden="true" />{" "}
                  {tc(`hints.${bankCashEval.hint}`)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const amountReadOnly = computed === "source";
  const amountLabel: ReactNode = (
    <label className="form-label" id="sourceAmountLabel" htmlFor="newSourceAmount">
      <i className="fas fa-money-bill" aria-hidden="true" />{" "}
      {tc(sourceAmountLabelKey(mode, subType))} <span className="text-danger">*</span>
      {manual && (
        <span
          id="sourceAmountModeTag"
          style={{
            fontSize: 9,
            background: "#e65100",
            color: "#fff",
            padding: "1px 5px",
            borderRadius: 3,
            marginLeft: 4,
          }}
        >
          {tc("form.manualTag")}
        </span>
      )}
    </label>
  );

  return (
    <div className="row">
      <div className="col-lg-8">
        <div className="card">
          <div className="card-header bg-primary text-white">
            <h6 className="mb-0">
              <i className="fas fa-plus-circle" aria-hidden="true" /> {tc("form.newTransfer")}
            </h6>
          </div>
          <div className="card-body">
            {error && (
              <ZtoAlert variant="danger" message={tc(error.key)} onClose={() => setError(null)} />
            )}
            <div className="row mb-3 transfer-type-grid">
              {TYPE_CARDS.map((card) => (
                <div className="col-4" key={card.mode}>
                  <button
                    type="button"
                    className={`transfer-type-card ${card.className}${mode === card.mode ? " active" : ""}`}
                    data-type={card.mode}
                    aria-pressed={mode === card.mode}
                    onClick={() => selectMode(card.mode)}
                  >
                    <i className={card.icon} aria-hidden="true" />
                    <div className="title">{tc(card.title)}</div>
                    <div className="desc">{tc(card.desc)}</div>
                  </button>
                </div>
              ))}
            </div>
            <div
              id="transferTypeInfoAlert"
              className="alert alert-info py-2 mb-3"
              style={{ fontSize: 11 }}
              role="status"
            >
              <small>
                <i className="fas fa-info-circle mr-1" aria-hidden="true" />
                {infoText}
              </small>
              {intercompany && source && target && (
                <div>
                  <small>
                    <i className="fas fa-building mr-1" aria-hidden="true" />
                    {intercompanyInfoText(
                      companyName(source.companyId),
                      companyName(target.companyId),
                    )}
                  </small>
                </div>
              )}
            </div>
            {isBankCash ? bankCashSection : standardSection}
            {intercompany && (
              <div className="row mb-3" id="transferReasonRow">
                <div className="col-md-12">
                  <label className="form-label" htmlFor="transferReasonType">
                    <i className="fas fa-handshake" aria-hidden="true" /> {tc("form.reason")}{" "}
                    <span className="text-danger">*</span>
                  </label>
                  <select
                    id="transferReasonType"
                    className="form-control form-control-sm no-select2"
                    value={reason}
                    onChange={(event) => {
                      setReason(event.target.value as IntercompanyReasonType | "");
                      clearError("reason");
                    }}
                    {...a11y("reason")}
                  >
                    <option value="">{tc("form.select")}</option>
                    {reasonOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <FieldError id="transferReasonType" message={messageFor("reason")} />
                </div>
              </div>
            )}
            {isFx && (
              <CollectionSelection
                fund={source}
                selection={selection}
                onChange={changeSelection}
                manual={manual}
              />
            )}
            {isFx && manual && (
              <div
                id="manualSourceAmountWarning"
                className="alert alert-warning py-2 mb-2"
                style={{ fontSize: 11 }}
                role="status"
              >
                <i className="fas fa-exclamation-triangle mr-1" aria-hidden="true" />
                <strong>{tc("collection.manualWarningTitle")}</strong>{" "}
                {tc("collection.manualWarning")}
              </div>
            )}
            <div className="row mb-3">
              {isFx && (
                <div className="col-md-2" id="exchangeCalcModeWrapper">
                  <label className="form-label" htmlFor="exchangeCalcMode">
                    <i className="fas fa-cogs" aria-hidden="true" /> {tc("form.calcMode")}{" "}
                    <span className="text-danger">*</span>
                  </label>
                  <select
                    id="exchangeCalcMode"
                    className="form-control form-control-sm no-select2"
                    value={calcMode}
                    onChange={(event) => setCalcMode(event.target.value as ZtoCalcMode)}
                    {...a11y("calcMode")}
                  >
                    <option value="source-rate">{tc("calcModes.sourceRate")}</option>
                    <option value="rate-target">{tc("calcModes.rateTarget")}</option>
                    <option value="source-target">{tc("calcModes.sourceTarget")}</option>
                  </select>
                  <FieldError id="exchangeCalcMode" message={messageFor("calcMode")} />
                </div>
              )}
              <div className="col-md-3" style={{ paddingRight: 0 }}>
                {amountLabel}
                <div className="input-group input-group-sm">
                  <input
                    type="text"
                    id="newSourceAmount"
                    className={`form-control${amountReadOnly ? " readonly-amount" : ""}`}
                    placeholder="0,00"
                    autoComplete="off"
                    inputMode="decimal"
                    readOnly={amountReadOnly}
                    style={manual ? { borderColor: "#e65100" } : undefined}
                    value={amountReadOnly ? formatAmountInput(sourceAmount) : amountText}
                    onChange={(event) => changeAmount(event.target.value)}
                    {...a11y("amount")}
                  />
                  <div className="input-group-append">
                    <span
                      className="input-group-text"
                      id="sourceCurrencyLabel"
                      style={{ fontSize: 12 }}
                    >
                      {sourceSym}
                    </span>
                  </div>
                </div>
                <FieldError id="newSourceAmount" message={messageFor("amount")} />
                {manual && (
                  <button
                    type="button"
                    id="btnResetToSelectionMode"
                    className="btn btn-xs btn-outline-secondary mt-1"
                    style={{ fontSize: 10, padding: "1px 7px" }}
                    onClick={backToSelection}
                  >
                    <i className="fas fa-undo" aria-hidden="true" /> {tc("form.resetSelection")}
                  </button>
                )}
              </div>
              {isFx && (
                <div
                  className="col-md-1 align-items-end justify-content-center"
                  id="rateCalcSymbolWrapper"
                  style={{ display: "flex", paddingBottom: 2, paddingRight: 0, paddingLeft: 0 }}
                >
                  <button
                    type="button"
                    id="rateCalcSymbolBtn"
                    className={`btn rate-symbol-btn ${operation === "*" ? "rate-symbol-x" : "rate-symbol-div"}`}
                    data-symbol={operation}
                    title={tc("form.rateToggleTitle")}
                    aria-label={tc("form.rateToggleTitle")}
                    aria-pressed={operation === "*"}
                    style={{ fontSize: 13 }}
                    onClick={() => setOperation(operation === "*" ? "/" : "*")}
                  >
                    {operation === "*" ? "x" : "÷"}
                  </button>
                </div>
              )}
              {isFx && (
                <div className="col-md-3" id="rate1Wrapper" style={{ paddingLeft: 0 }}>
                  <label className="form-label" htmlFor="newRate1">
                    <i className="fas fa-percentage" aria-hidden="true" /> {tc("form.rate")}{" "}
                    <span className="text-danger">*</span>
                  </label>
                  <div className="input-group input-group-sm">
                    <input
                      type="number"
                      id="newRate1"
                      className={`form-control${computed === "rate" ? " readonly-amount" : ""}`}
                      step="0.0001"
                      min="0"
                      inputMode="decimal"
                      readOnly={computed === "rate"}
                      value={
                        computed === "rate" ? (fx && fx.rate > 0 ? String(fx.rate) : "") : rateText
                      }
                      onChange={(event) => {
                        setRateText(event.target.value);
                        clearError("rate");
                      }}
                      {...a11y("rate")}
                    />
                    <div className="input-group-append">
                      <span
                        className="input-group-text"
                        id="rateCurrencyLabel"
                        style={{ fontSize: 11 }}
                      >
                        {rateCurrencyLabel(operation, sourceSym, targetSym)}
                      </span>
                    </div>
                  </div>
                  <FieldError id="newRate1" message={messageFor("rate")} />
                </div>
              )}
              {isFx && (
                <div className="col-md-3" id="targetAmountWrapper">
                  <label className="form-label" htmlFor="newTargetAmount">
                    <i className="fas fa-bullseye" aria-hidden="true" /> {tc("form.targetAmount")}{" "}
                    <span className="text-danger">*</span>
                  </label>
                  <div className="input-group input-group-sm">
                    <input
                      type="text"
                      id="newTargetAmount"
                      className={`form-control${computed === "target" ? " readonly-amount" : ""}`}
                      placeholder="0,00"
                      autoComplete="off"
                      inputMode="decimal"
                      readOnly={computed === "target"}
                      value={computed === "target" ? formatAmountInput(targetAmount) : targetText}
                      onChange={(event) => setTargetText(event.target.value)}
                    />
                    <div className="input-group-append">
                      <span
                        className="input-group-text"
                        id="targetCurrencyLabel"
                        style={{ fontSize: 12 }}
                      >
                        {targetSym}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {isFx && (
              <div id="costSection">
                <div className="row mb-3">
                  <div className="col-md-3">
                    <label className="form-label" htmlFor="newKmvRate">
                      {tc("form.kmv")}
                    </label>
                    <input
                      type="number"
                      id="newKmvRate"
                      className="form-control form-control-sm"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={kmvText}
                      onChange={(event) => setKmvText(event.target.value)}
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label" htmlFor="newCommission">
                      {tc("form.commission")}
                    </label>
                    <input
                      type="number"
                      id="newCommission"
                      className="form-control form-control-sm"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={commissionText}
                      onChange={(event) => setCommissionText(event.target.value)}
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label" htmlFor="newTransferFee">
                      {tc("form.fee")}
                    </label>
                    <input
                      type="number"
                      id="newTransferFee"
                      className="form-control form-control-sm"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={feeText}
                      onChange={(event) => setFeeText(event.target.value)}
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label" htmlFor="newCostBank">
                      {tc("form.costBank")}
                    </label>
                    <ZtoSelect
                      id="newCostBank"
                      className="form-control form-control-sm"
                      value={costFundId}
                      onChange={setCostFundId}
                      options={costFundOptions}
                      placeholder={tc("form.select")}
                      disabled={!source}
                    />
                  </div>
                </div>
              </div>
            )}
            <div className="row mb-3">
              <div className="col-md-8">
                <label className="form-label" htmlFor="newDescription">
                  <i className="fas fa-comment" aria-hidden="true" /> {tc("form.description")}
                </label>
                <input
                  type="text"
                  id="newDescription"
                  className="form-control form-control-sm"
                  placeholder={tc("form.optional")}
                  maxLength={500}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label" htmlFor="newDocumentNo">
                  <i className="fas fa-file" aria-hidden="true" /> {tc("form.documentNo")}
                </label>
                <input
                  type="text"
                  id="newDocumentNo"
                  className="form-control form-control-sm"
                  placeholder={tc("form.documentNoPlaceholder")}
                  maxLength={50}
                  value={documentNo}
                  onChange={(event) => setDocumentNo(event.target.value)}
                />
              </div>
            </div>
            <div className="text-right">
              <button type="button" className="btn btn-secondary btn-sm mr-1" onClick={resetForm}>
                <i className="fas fa-times" aria-hidden="true" /> {tc("form.clear")}
              </button>
              <button
                type="button"
                className="btn btn-success"
                id="btnSaveTransfer"
                disabled={saving}
                onClick={save}
              >
                {saving ? (
                  <>
                    <i className="fas fa-spinner fa-spin" aria-hidden="true" /> {tc("form.saving")}
                  </>
                ) : (
                  <>
                    <i className="fas fa-save" aria-hidden="true" /> {tc("form.save")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="col-lg-4">
        <TransferSidePanel
          mode={mode}
          source={sourceAmount}
          target={targetAmount}
          effectiveRate={effectiveRate}
          sourceCurrency={source?.currency ?? ""}
          targetCurrency={target?.currency ?? source?.currency ?? ""}
          costs={costs}
          banks={sourceBranchId ? fundsIn(funds, "BANK", sourceBranchId) : null}
          cashes={sourceBranchId ? fundsIn(funds, "CASH", sourceBranchId) : null}
        />
      </div>
      <NegativeBalanceModal
        info={negative}
        onCancel={() => setNegative(null)}
        onConfirm={() => {
          setNegative(null);
          void submit(draft());
        }}
      />
      <TransferResultModal result={result} onClose={closeResult} />
    </div>
  );
}
