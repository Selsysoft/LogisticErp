import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBranchTree } from "../../../branch/branchTree";
import { useFundList, useReplaceTransfer } from "../../../../pages/finance/fundApi";
import type { Fund, FundTransferType, TransferListRow } from "../../../../pages/finance/types";
import {
  ZtoBranchSelect,
  ZtoModal,
  ZtoSelect,
  currencySymbol,
  useZtoSnackbar,
} from "../../../components";
import { parseAmountInput } from "./fxCalcLogic";
import {
  branchIndex,
  editModalStyle,
  errorKey,
  errorParts,
  fundOptionLabel,
  kindsOf,
} from "./transferCenterLogic";
import { bankKey, fundsIn } from "./transferRulesLogic";

type Props = {
  row: TransferListRow | null;
  onHide: () => void;
};

/** Hedef seçenekleri: aynı şirket, aynı para birimi, kaynaktan farklı; Virman'da aynı banka. */
function targetCandidates(
  funds: readonly Fund[],
  kind: Fund["kind"],
  branchId: string,
  source: Fund | null,
  type: FundTransferType,
) {
  return fundsIn(funds, kind, branchId).filter(
    (fund) =>
      !source ||
      (fund.id !== source.id &&
        fund.currency === source.currency &&
        fund.companyId === source.companyId &&
        (type !== "VIREMENT" || bankKey(fund) === bankKey(source))),
  );
}

/**
 * BS-4…BS-9 düzenleme modalları (ZTO BS:2120-2720, bsjs `openTransferEditModal`/`submitTransferEdit`):
 * "Yeniden Yönlendir" (kaynak/hedef iş yeri ve hesap), yön kartı, Tutar, Tarih, Belge No, Açıklama.
 * Kaydet = `replace` (eski transfer ters kayıtla iptal, yeni kodla yeni transfer — OK-12.2-7).
 */
export function EditTransferModal({ row, onHide }: Props) {
  const { t } = useTranslation("ztoFinans");
  const tc = (key: string) => t(`transferCenter.${key}`);
  const snackbar = useZtoSnackbar();
  const funds = useFundList(
    { companyId: null, accountType: "DEMAND", active: true },
    { enabled: !!row },
  );
  const tree = useBranchTree("mine").data;
  const branches = useMemo(() => branchIndex(tree), [tree]);
  const replace = useReplaceTransfer();
  const { resetIdempotencyKey } = replace;
  // SEC-8: düzenlenen satır değişince eski anahtar başka transferin düzenlemesine gitmesin.
  useEffect(() => {
    resetIdempotencyKey();
  }, [row?.id, resetIdempotencyKey]);
  const type = row?.transferType ?? "VIREMENT";
  const [sourceKind, targetKind] = kindsOf(type);
  const style = editModalStyle(type);

  const [sourceBranchId, setSourceBranchId] = useState("");
  const [targetBranchId, setTargetBranchId] = useState("");
  const [sourceFundId, setSourceFundId] = useState("");
  const [targetFundId, setTargetFundId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [documentNo, setDocumentNo] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setSourceBranchId(row.fromBranchId ?? "");
    setTargetBranchId(row.toBranchId ?? "");
    setSourceFundId(row.fromFundId);
    setTargetFundId(row.toFundId);
    setAmount(Number(row.sourceMoney.amount).toFixed(2));
    setDate(row.transferDate);
    setDocumentNo(row.documentNo ?? "");
    setDescription(row.description ?? "");
    setError(null);
  }, [row]);

  const all = funds.data ?? [];
  const sourcePool = fundsIn(all, sourceKind, sourceBranchId);
  const source = sourcePool.find((f) => f.id === sourceFundId) ?? null;
  const targetPool = targetCandidates(all, targetKind, targetBranchId, source, type);
  const target = targetPool.find((f) => f.id === targetFundId) ?? null;
  const sym = currencySymbol(source?.currency ?? row?.sourceMoney.currency ?? "TRY");
  const option = (fund: Fund) => ({ value: fund.id, label: fundOptionLabel(fund, branches) });
  const sourceLabel = sourceKind === "BANK" ? tc("form.sourceBank") : tc("form.sourceCash");
  const targetLabel = targetKind === "BANK" ? tc("form.targetBank") : tc("form.targetCash");

  async function save() {
    if (!row) {
      setError(tc("delete.noId"));
      return;
    }
    const value = parseAmountInput(amount);
    if (!(value > 0)) {
      setError(tc("edit.amountInvalid"));
      return;
    }
    if (!date) {
      setError(tc("edit.dateRequired"));
      return;
    }
    if (!source || !target) {
      setError(tc("validation.banks"));
      return;
    }
    try {
      await replace.mutateAsync({
        id: row.id,
        body: {
          transfer: {
            transferType: type,
            fromFundId: source.id,
            toFundId: target.id,
            money: { amount: value.toFixed(2), currency: source.currency },
            date,
            documentNo: documentNo.trim() || undefined,
            description: description.trim() || undefined,
          },
        },
      });
      snackbar.show(tc("edit.updated"), "success");
      onHide();
    } catch (err) {
      const { code, message } = errorParts(err);
      const key = errorKey(code, source.kind);
      setError(key ? tc(key) : (message ?? tc("edit.failed")));
    }
  }

  const sideCard = (fund: Fund | null, side: "source" | "target", fallback: string | null) => (
    <div className={`edit-transfer-side ${side}`}>
      <div className="edit-transfer-side-icon">
        <i
          className={side === "source" ? "fas fa-arrow-up" : "fas fa-arrow-down"}
          aria-hidden="true"
        />
      </div>
      <div className="edit-transfer-details">
        <div className="edit-transfer-bank-name">
          <span className={`edit-${side}-bank-display`}>
            {fund ? (fund.bankName ?? fund.name) : (fallback ?? "-")}
          </span>
        </div>
        <div className="edit-transfer-workplace-name">
          <span className={`edit-${side}-workplace-display`}>
            {fund ? (branches.get(fund.branchId)?.name ?? "-") : "-"}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <ZtoModal
      show={row !== null}
      onHide={onHide}
      size="lg"
      className="transfer-edit-modal"
      headerClassName={style.headerClassName}
      closeButtonClassName={style.headerClassName.includes("text-white") ? "text-white" : undefined}
      title={
        <>
          <i className={`${style.icon} mr-1`} aria-hidden="true" />
          {tc(style.titleKey)}
        </>
      }
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onHide}>
            {tc("edit.cancel")}
          </button>
          <button
            type="button"
            className={style.saveClassName}
            disabled={replace.isPending}
            onClick={save}
          >
            <i className="fas fa-save" aria-hidden="true" /> {tc("edit.save")}
          </button>
        </>
      }
    >
      {error && (
        <div className="alert alert-danger py-2" role="alert">
          {error}
        </div>
      )}
      <div className="card mb-3" style={{ border: "1px solid #b6d4fe", background: "#f0f5ff" }}>
        <div className="card-body p-2">
          <div className="small text-muted mb-2">
            <i className="fas fa-route mr-1" aria-hidden="true" />
            {tc("edit.reroute")}
          </div>
          <div className="row">
            <div className="col-md-6">
              <label className="mb-1 small" htmlFor="editSourceWorkPlace">
                <i className="fas fa-building text-danger" aria-hidden="true" />{" "}
                {tc("form.sourceWorkPlace")}
              </label>
              <ZtoBranchSelect
                id="editSourceWorkPlace"
                className="form-control form-control-sm edit-source-workplace-select"
                value={sourceBranchId}
                onChange={(id) => {
                  setSourceBranchId(id);
                  setSourceFundId("");
                }}
                companyId={row?.companyId ?? "active"}
              />
              <label className="mb-1 small mt-2" htmlFor="editSourceFund">
                <i
                  className={`fas ${sourceKind === "BANK" ? "fa-university" : "fa-cash-register"} text-danger`}
                  aria-hidden="true"
                />{" "}
                {sourceLabel}
              </label>
              <ZtoSelect
                id="editSourceFund"
                className="form-control form-control-sm edit-source-bank-select"
                value={source?.id ?? ""}
                onChange={setSourceFundId}
                options={sourcePool.map(option)}
                placeholder={tc("form.select")}
              />
            </div>
            <div className="col-md-6">
              <label className="mb-1 small" htmlFor="editTargetWorkPlace">
                <i className="fas fa-building text-success" aria-hidden="true" />{" "}
                {tc("form.targetWorkPlace")}
              </label>
              <ZtoBranchSelect
                id="editTargetWorkPlace"
                className="form-control form-control-sm edit-target-workplace-select"
                value={targetBranchId}
                onChange={(id) => {
                  setTargetBranchId(id);
                  setTargetFundId("");
                }}
                companyId={row?.companyId ?? "active"}
              />
              <label className="mb-1 small mt-2" htmlFor="editTargetFund">
                <i
                  className={`fas ${targetKind === "BANK" ? "fa-university" : "fa-cash-register"} text-success`}
                  aria-hidden="true"
                />{" "}
                {targetLabel}
              </label>
              <ZtoSelect
                id="editTargetFund"
                className={`form-control form-control-sm ${targetKind === "BANK" ? "edit-target-bank-select" : "edit-target-cash-select"}`}
                value={target?.id ?? ""}
                onChange={setTargetFundId}
                options={targetPool.map(option)}
                placeholder={tc("form.select")}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="edit-transfer-direction-card">
        <div className="edit-transfer-direction-flow">
          {sideCard(source, "source", row?.fromFundName ?? null)}
          <div className="edit-transfer-arrow">
            <i className="fas fa-long-arrow-alt-right" aria-hidden="true" />
          </div>
          {sideCard(target, "target", row?.toFundName ?? null)}
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="editSourceAmount">{tc("edit.amount")}</label>
        <div className="input-group">
          <input
            type="number"
            id="editSourceAmount"
            className="form-control edit-source-amount"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <div className="input-group-append">
            <span className="input-group-text edit-source-symbol">{sym}</span>
          </div>
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="editTransferDate">{tc("edit.date")}</label>
        <input
          type="date"
          id="editTransferDate"
          className="form-control edit-transfer-date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </div>
      <div className="form-group">
        <label htmlFor="editDocumentNo">{tc("edit.documentNo")}</label>
        <input
          type="text"
          id="editDocumentNo"
          className="form-control edit-document-no"
          maxLength={50}
          value={documentNo}
          onChange={(event) => setDocumentNo(event.target.value)}
        />
      </div>
      <div className="form-group mb-0">
        <label htmlFor="editDescription">{tc("edit.description")}</label>
        <textarea
          id="editDescription"
          className="form-control edit-description"
          rows={2}
          maxLength={500}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <small className="form-text text-muted mt-2">{tc("edit.note")}</small>
    </ZtoModal>
  );
}
