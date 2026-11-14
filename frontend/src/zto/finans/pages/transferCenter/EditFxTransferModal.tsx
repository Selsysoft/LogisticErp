import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useFxCandidateAccounts,
  useFxCandidateCollections,
  useFxSources,
  useReplaceTransfer,
  useTransfer,
} from "../../../../pages/finance/fundApi";
import type {
  TransferCostBody,
  TransferListRow,
  TransferSourceBody,
} from "../../../../pages/finance/types";
import {
  ZtoModal,
  currencySymbol,
  formatDate,
  formatN2,
  useZtoSnackbar,
} from "../../../components";
import {
  editTargetAmount,
  fromRateOperation,
  parseAmountInput,
  round,
  toRateOperation,
  type CalcOperation,
} from "./fxCalcLogic";
import { editModalStyle, errorKey, errorParts } from "./transferCenterLogic";

type Props = {
  row: TransferListRow | null;
  onHide: () => void;
};

type BreakItem = {
  id: string;
  code: string;
  date: string;
  sourceFundName: string | null;
  deposited: number;
  used: number;
  max: number;
};

/**
 * BS-3 "Döviz Bozum Düzenle" (ZTO BS:1869-2120, bsjs :2406-3006, :3643-3898). Seçili tahsilatın bu
 * transferde düzenlenebilir en yüksek bozumu = kalan + bu transferin kullandığı; Siparişler gizli (S-6).
 * Kaydet = `replace` (yeni kod, eski transfer ters kayıtla iptal).
 */
export function EditFxTransferModal({ row, onHide }: Props) {
  const { t } = useTranslation("ztoFinans");
  const tc = (key: string) => t(`transferCenter.${key}`);
  const snackbar = useZtoSnackbar();
  const detail = useTransfer(row?.id);
  const replace = useReplaceTransfer();
  const { resetIdempotencyKey } = replace;
  // SEC-8: düzenlenen satır değişince eski anahtar başka transferin düzenlemesine gitmesin.
  useEffect(() => {
    resetIdempotencyKey();
  }, [row?.id, resetIdempotencyKey]);
  const fundParams = row ? { fundId: row.fromFundId, currency: row.sourceMoney.currency } : null;
  const accounts = useFxCandidateAccounts(fundParams);
  const sources = useFxSources(fundParams);
  const style = editModalStyle("FX_EXCHANGE");

  const [accountId, setAccountId] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [breaks, setBreaks] = useState<Record<string, number>>({});
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [operation, setOperation] = useState<CalcOperation>("*");
  const [date, setDate] = useState("");
  const [documentNo, setDocumentNo] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const collections = useFxCandidateCollections(
    fundParams && accountId ? { ...fundParams, accountId } : null,
  );

  const data = detail.data;
  const ownUse = useMemo(() => {
    const map = new Map<string, number>();
    for (const source of data?.sources ?? []) map.set(source.sourceId, source.usedAmount);
    return map;
  }, [data]);

  useEffect(() => {
    if (!row || !data) return;
    setAccountId(row.collection?.accountId ?? "");
    setCollectionId(data.sources.find((s) => s.kind === "SETTLEMENT")?.sourceId ?? "");
    setBreaks(
      Object.fromEntries(
        data.sources.filter((s) => s.kind === "TRANSFER").map((s) => [s.sourceId, s.usedAmount]),
      ),
    );
    setAmount(Number(data.money.amount).toFixed(2));
    setRate(String(data.rate ?? ""));
    setOperation(fromRateOperation(data.rateOperation));
    setDate(data.transferDate);
    setDocumentNo(data.documentNo ?? "");
    setDescription(data.description ?? "");
    setError(null);
  }, [row, data]);

  const sym = currencySymbol(row?.sourceMoney.currency ?? "");
  const targetSym = currencySymbol(row?.targetMoney.currency ?? "");
  const ownCollection = data?.sources.find(
    (s) => s.kind === "SETTLEMENT" && s.sourceId === collectionId,
  );
  const candidate = collections.data?.find((c) => c.settlementId === collectionId);
  const collection = candidate
    ? {
        date: candidate.date,
        amount: candidate.amount,
        broken: candidate.broken,
        remaining: candidate.remaining,
      }
    : ownCollection
      ? {
          date: ownCollection.date,
          amount: ownCollection.amount,
          broken: ownCollection.amount,
          remaining: 0,
        }
      : null;
  const collectionMax = collection
    ? round(collection.remaining + (ownUse.get(collectionId) ?? 0))
    : 0;
  const accountOptions = [...(accounts.data ?? [])];
  if (
    row?.collection?.accountId &&
    !accountOptions.some((a) => a.accountId === row.collection?.accountId)
  ) {
    accountOptions.push({
      accountId: row.collection.accountId,
      accountCode: "",
      accountName: row.collection.accountName ?? "-",
      collectionCount: 0,
      remainingTotal: 0,
    });
  }
  const collectionOptions = [...(collections.data ?? [])];
  if (ownCollection && !collectionOptions.some((c) => c.settlementId === ownCollection.sourceId)) {
    collectionOptions.push({
      settlementId: ownCollection.sourceId,
      date: ownCollection.date,
      amount: ownCollection.amount,
      broken: ownCollection.amount,
      remaining: 0,
      description: ownCollection.code,
    });
  }
  const breakItems: BreakItem[] = (sources.data ?? []).map((s) => ({
    id: s.transferId,
    code: s.code,
    date: s.date,
    sourceFundName: s.sourceFundName,
    deposited: s.deposited,
    used: s.used,
    max: round(s.remaining + (ownUse.get(s.transferId) ?? 0)),
  }));
  for (const own of data?.sources ?? []) {
    if (own.kind === "TRANSFER" && !breakItems.some((b) => b.id === own.sourceId)) {
      breakItems.push({
        id: own.sourceId,
        code: own.code ?? "-",
        date: own.date,
        sourceFundName: null,
        deposited: own.amount,
        used: own.amount,
        max: own.usedAmount,
      });
    }
  }
  const breakTotal = round(Object.values(breaks).reduce((sum, v) => sum + v, 0));
  const value = parseAmountInput(amount);
  const rateValue = parseAmountInput(rate);
  const target = editTargetAmount(value, rateValue, operation);
  const maxAmount = collection ? round(collectionMax + breakTotal) : 0;
  const exceeds = !!collection && maxAmount > 0 && value > maxAmount;
  const limitText = `${tc("edit.limitHead")} ${formatN2(maxAmount)} ${tc("edit.limitTail")}`;

  async function save() {
    if (!row || !data) {
      setError(tc("edit.loadFailed"));
      return;
    }
    if (!(value > 0)) {
      setError(tc("edit.amountInvalid"));
      return;
    }
    if (exceeds) {
      setError(limitText);
      return;
    }
    if (!date) {
      setError(tc("edit.dateRequired"));
      return;
    }
    const sourceRows: TransferSourceBody[] = [];
    const fromCollection = round(Math.min(collectionMax, value - breakTotal));
    if (collectionId && fromCollection > 0) {
      sourceRows.push({ kind: "SETTLEMENT", id: collectionId, usedAmount: fromCollection });
    }
    for (const [id, used] of Object.entries(breaks)) {
      if (used > 0) sourceRows.push({ kind: "TRANSFER", id, usedAmount: round(used) });
    }
    const costs: TransferCostBody[] = data.costs.map((cost) =>
      cost.kind === "KMV"
        ? { kind: "KMV", ratePercent: cost.ratePercent ?? 0 }
        : { kind: cost.kind, fundAccountId: cost.fundAccountId, amount: Number(cost.money.amount) },
    );
    try {
      await replace.mutateAsync({
        id: row.id,
        body: {
          transfer: {
            transferType: "FX_EXCHANGE",
            fromFundId: data.fromFundId,
            toFundId: data.toFundId,
            money: { amount: value.toFixed(2), currency: data.money.currency },
            targetMoney: { amount: target.toFixed(2), currency: data.targetMoney.currency },
            rate: round(rateValue, 6),
            rateOperation: toRateOperation(operation),
            calcMode: "SOURCE_RATE",
            date,
            documentNo: documentNo.trim() || undefined,
            description: description.trim() || undefined,
            costs: costs.length > 0 ? costs : undefined,
            sources: sourceRows.length > 0 ? sourceRows : undefined,
          },
        },
      });
      snackbar.show(tc("edit.updated"), "success");
      onHide();
    } catch (err) {
      const { code, message } = errorParts(err);
      const key = errorKey(code);
      setError(key ? tc(key) : (message ?? tc("edit.failed")));
    }
  }

  const loadFailed = detail.isError;

  return (
    <ZtoModal
      show={row !== null}
      onHide={onHide}
      size="lg"
      className="transfer-edit-modal"
      rootId="editDovizBozumModal"
      headerClassName={style.headerClassName}
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
            disabled={exceeds || replace.isPending || !data}
            onClick={save}
          >
            <i className="fas fa-save" aria-hidden="true" /> {tc("edit.save")}
          </button>
        </>
      }
    >
      {(error || loadFailed) && (
        <div className="alert alert-danger py-2" role="alert">
          {error ?? tc("edit.loadFailed")}
        </div>
      )}
      <div className="edit-transfer-direction-card">
        <div className="edit-transfer-direction-flow">
          <div className="edit-transfer-side source">
            <div className="edit-transfer-side-icon">
              <i className="fas fa-arrow-up" aria-hidden="true" />
            </div>
            <div className="edit-transfer-details">
              <div className="edit-transfer-bank-name">
                <span className="edit-source-bank-display">{row?.fromFundName ?? "-"}</span>
              </div>
            </div>
          </div>
          <div className="edit-transfer-arrow">
            <i className="fas fa-long-arrow-alt-right" aria-hidden="true" />
          </div>
          <div className="edit-transfer-side target">
            <div className="edit-transfer-side-icon">
              <i className="fas fa-arrow-down" aria-hidden="true" />
            </div>
            <div className="edit-transfer-details">
              <div className="edit-transfer-bank-name">
                <span className="edit-target-bank-display">{row?.toFundName ?? "-"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="card mb-3 edit-collection-selection-card">
        <div className="card-body py-2">
          <div className="form-row">
            <div className="form-group col-md-6 mb-2">
              <label className="mb-1" htmlFor="editExchangeAccount">
                <i className="fas fa-user mr-1" aria-hidden="true" />
                {tc("edit.account")}
              </label>
              <select
                id="editExchangeAccount"
                className="form-control form-control-sm edit-exchange-customer-account no-select2"
                value={accountId}
                onChange={(event) => {
                  setAccountId(event.target.value);
                  setCollectionId("");
                }}
              >
                <option value="">{tc("form.select")}</option>
                {accountOptions.map((account) => (
                  <option key={account.accountId} value={account.accountId}>
                    {account.accountCode
                      ? `${account.accountCode} - ${account.accountName}`
                      : account.accountName}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group col-md-6 mb-2">
              <label className="mb-1" htmlFor="editExchangeCollection">
                <i className="fas fa-file-invoice mr-1" aria-hidden="true" />
                {tc("edit.collection")}
              </label>
              <select
                id="editExchangeCollection"
                className="form-control form-control-sm edit-exchange-collection no-select2"
                value={collectionId}
                disabled={!accountId}
                onChange={(event) => setCollectionId(event.target.value)}
              >
                <option value="">{accountId ? tc("form.select") : tc("edit.pickAccount")}</option>
                {collectionOptions.map((c) => (
                  <option key={c.settlementId} value={c.settlementId}>
                    {`${formatDate(c.date)} | ${formatN2(c.amount)} ${sym}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {accounts.isSuccess && accountOptions.length === 0 && (
            <div
              className="alert alert-warning py-1 px-2 mb-0 mt-2 edit-exchange-collection-alert"
              style={{ fontSize: 11 }}
            >
              <i className="fas fa-exclamation-triangle mr-1" aria-hidden="true" />
              {tc("edit.noCollection")}
            </div>
          )}
        </div>
      </div>
      {collection && (
        <div className="card mb-3 edit-collection-card">
          <div className="edit-collection-header">
            <div className="edit-collection-title">
              <i className="fas fa-hand-holding-usd" aria-hidden="true" />
              <span>{tc("edit.summary")}</span>
            </div>
            <span className="edit-collection-badge">{tc("edit.summaryBadge")}</span>
          </div>
          <div className="card-body py-2">
            <div className="edit-collection-meta">
              <span className="edit-collection-account">{row?.collection?.accountName ?? "-"}</span>
              <span className="edit-collection-date">{formatDate(collection.date)}</span>
            </div>
            <div className="edit-collection-metrics">
              {(
                [
                  ["metric-total", "edit.total", collection.amount],
                  ["metric-exchanged", "edit.broken", collection.broken],
                  ["metric-remaining", "edit.remaining", collection.remaining],
                ] as const
              ).map(([className, key, amountValue]) => (
                <div className={`edit-collection-metric ${className}`} key={key}>
                  <div className="edit-collection-metric-label">{tc(key)}</div>
                  <div className="edit-collection-metric-value">
                    <span>{formatN2(amountValue)}</span>
                    <span className="edit-source-symbol">{sym}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="edit-collection-max-wrap">
              <span className="edit-collection-max-label">{tc("edit.max")}</span>
              <span className="edit-collection-max-value">
                <span className="edit-collection-max">{formatN2(collectionMax)}</span>
                <span className="edit-source-symbol">{sym}</span>
              </span>
            </div>
          </div>
        </div>
      )}
      {exceeds && (
        <div
          className="alert alert-danger py-2 px-3 mb-3 edit-collection-limit-warning"
          role="alert"
        >
          {limitText}
        </div>
      )}
      {breakItems.length > 0 && (
        <div className="edit-break-source-section mb-3">
          <hr style={{ margin: "6px 0" }} />
          <div className="d-flex justify-content-between align-items-center mb-1">
            <span style={{ fontSize: 11, fontWeight: 700, color: "#7b1fa2" }}>
              <i className="fas fa-link" aria-hidden="true" /> {tc("collection.breakSources")}
            </span>
            <div>
              <span style={{ fontSize: 11, color: "#555" }}>{tc("edit.totalLabel")}</span>{" "}
              <strong className="text-primary edit-break-src-total">{formatN2(breakTotal)}</strong>{" "}
              <span className="edit-break-src-sym text-primary">{sym}</span>
            </div>
          </div>
          <div
            className="info-alert"
            style={{
              fontSize: 10,
              padding: "3px 7px",
              background: "#f3e5f5",
              border: "1px solid #ce93d8",
              color: "#4a148c",
              borderRadius: 4,
              marginBottom: 5,
            }}
          >
            <i className="fas fa-info-circle" aria-hidden="true" /> {tc("edit.breakInfo")}
          </div>
          <div
            style={{ overflowX: "auto" }}
            role="region"
            aria-label={tc("collection.breakSources")}
            tabIndex={0}
          >
            <table className="table table-sm mb-0" style={{ fontSize: 10, minWidth: 560 }}>
              <thead className="thead-light">
                <tr>
                  <th style={{ width: 28 }} aria-label={tc("collection.selectAll")} />
                  <th>{tc("edit.codeDate")}</th>
                  <th>{tc("collection.sourceBank")}</th>
                  <th className="text-right">{tc("collection.deposited")}</th>
                  <th className="text-right">{tc("collection.used")}</th>
                  <th className="text-right">{tc("collection.remaining")}</th>
                  <th style={{ width: 130 }}>{tc("collection.toUse")}</th>
                </tr>
              </thead>
              <tbody className="edit-break-src-body">
                {breakItems.map((item) => {
                  const checked = item.id in breaks;
                  return (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={item.code}
                          checked={checked}
                          onChange={(event) => {
                            const next = { ...breaks };
                            if (event.target.checked) next[item.id] = item.max;
                            else delete next[item.id];
                            setBreaks(next);
                          }}
                        />
                      </td>
                      <td>
                        <strong>{item.code}</strong>
                        <div className="text-muted">{formatDate(item.date)}</div>
                      </td>
                      <td>{item.sourceFundName ?? "-"}</td>
                      <td className="text-right">{formatN2(item.deposited)}</td>
                      <td className="text-right">{formatN2(item.used)}</td>
                      <td className="text-right">{formatN2(item.max)}</td>
                      <td>
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          aria-label={`${item.code} ${tc("collection.toUse")}`}
                          min={0}
                          max={item.max}
                          step={0.01}
                          disabled={!checked}
                          value={checked ? String(breaks[item.id]) : ""}
                          onChange={(event) => {
                            const v = Math.min(
                              Math.max(0, Number(event.target.value) || 0),
                              item.max,
                            );
                            setBreaks({ ...breaks, [item.id]: round(v) });
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {(collection || breakTotal > 0) && (
        <div
          className="edit-source-combined-display alert alert-info py-1 mb-2"
          style={{ fontSize: 11 }}
        >
          <i className="fas fa-calculator mr-1" aria-hidden="true" />
          <span>{tc("edit.combined")}</span>{" "}
          <strong className="edit-src-combined-total">{formatN2(maxAmount || breakTotal)}</strong>{" "}
          <span className="edit-src-combined-sym">{sym}</span>
        </div>
      )}
      <div className="form-group">
        <label htmlFor="editFxSourceAmount">{tc("edit.amount")}</label>
        <div className="input-group">
          <input
            type="number"
            id="editFxSourceAmount"
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
        <label htmlFor="editFxTargetAmount">{tc("edit.targetAmount")}</label>
        <div className="input-group">
          <input
            type="text"
            id="editFxTargetAmount"
            className="form-control edit-target-amount"
            readOnly
            value={target > 0 ? target.toFixed(2) : "0.00"}
          />
          <div className="input-group-append">
            <span className="input-group-text edit-target-symbol">{targetSym}</span>
          </div>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group col-6">
          <label htmlFor="editFxRate">{tc("edit.rate")}</label>
          <input
            type="number"
            id="editFxRate"
            className="form-control edit-rate1"
            min="0.000001"
            step="0.000001"
            inputMode="decimal"
            value={rate}
            onChange={(event) => setRate(event.target.value)}
          />
        </div>
        <div className="form-group col-6">
          <label htmlFor="editFxOperation">{tc("edit.operation")}</label>
          <select
            id="editFxOperation"
            className="form-control edit-operation no-select2"
            value={operation}
            onChange={(event) => setOperation(event.target.value as CalcOperation)}
          >
            <option value="*">{tc("edit.multiply")}</option>
            <option value="/">{tc("edit.divide")}</option>
          </select>
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="editFxDate">{tc("edit.date")}</label>
        <input
          type="date"
          id="editFxDate"
          className="form-control edit-transfer-date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </div>
      <div className="form-group">
        <label htmlFor="editFxDocumentNo">{tc("edit.documentNo")}</label>
        <input
          type="text"
          id="editFxDocumentNo"
          className="form-control edit-document-no"
          maxLength={50}
          value={documentNo}
          onChange={(event) => setDocumentNo(event.target.value)}
        />
      </div>
      <div className="form-group mb-0">
        <label htmlFor="editFxDescription">{tc("edit.description")}</label>
        <textarea
          id="editFxDescription"
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
