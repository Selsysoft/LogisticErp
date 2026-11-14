import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useFxCandidateAccounts,
  useFxCandidateCollections,
  useFxSources,
} from "../../../../pages/finance/fundApi";
import type { Fund } from "../../../../pages/finance/types";
import { ZtoSelect, currencySymbol, formatDate, formatN2 } from "../../../components";
import { round } from "./fxCalcLogic";
import type { FxSelection } from "./transferCenterLogic";

type Props = {
  fund: Fund | null;
  selection: FxSelection;
  onChange: (selection: FxSelection) => void;
  /** Manuel tutar kipi: seçimler pasif ve soluk (ZTO `setManualSourceMode`). */
  manual: boolean;
};

/**
 * `#collectionSelectionSection` (ZTO BS:1517-1650): cari → tahsilat → detay kartı ve "Önceki Döviz
 * Bozum Kaynakları". "Siparişler" tablosu yazılmaz (S-6).
 */
export function CollectionSelection({ fund, selection, onChange, manual }: Props) {
  const { t } = useTranslation("ztoFinans");
  const params = fund ? { fundId: fund.id, currency: fund.currency } : null;
  const accounts = useFxCandidateAccounts(params);
  const collections = useFxCandidateCollections(
    params && selection.accountId ? { ...params, accountId: selection.accountId } : null,
  );
  const sources = useFxSources(params);
  const [warn, setWarn] = useState<Record<string, number>>({});
  const warnTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(warnTimer.current), []);

  const sym = currencySymbol(fund?.currency ?? "");
  const collection = collections.data?.find((c) => c.settlementId === selection.collectionId);
  const noAccounts = !!fund && accounts.isSuccess && accounts.data.length === 0;
  const breakItems = sources.data ?? [];
  const breakTotal = Object.values(selection.breaks).reduce((sum, value) => sum + value, 0);

  function pickAccount(accountId: string) {
    onChange({ ...selection, accountId, collectionId: "", collectionRemaining: 0 });
  }

  function pickCollection(collectionId: string) {
    const found = collections.data?.find((c) => c.settlementId === collectionId);
    onChange({ ...selection, collectionId, collectionRemaining: found?.remaining ?? 0 });
  }

  function toggleBreak(id: string, remaining: number, checked: boolean) {
    const breaks = { ...selection.breaks };
    if (checked) breaks[id] = round(remaining);
    else delete breaks[id];
    onChange({ ...selection, breaks });
  }

  function setBreak(id: string, remaining: number, text: string) {
    const value = Number(text);
    const clamped = Number.isFinite(value) ? Math.min(Math.max(0, value), remaining) : 0;
    if (value > remaining) {
      setWarn((w) => ({ ...w, [id]: remaining }));
      clearTimeout(warnTimer.current);
      warnTimer.current = setTimeout(() => setWarn({}), 2500);
    }
    onChange({ ...selection, breaks: { ...selection.breaks, [id]: round(clamped) } });
  }

  const accountPlaceholder = !fund
    ? t("transferCenter.edit.pickSourceBank")
    : t("transferCenter.form.select");
  const disabledStyle = manual ? { opacity: 0.45 } : undefined;

  return (
    <div id="collectionSelectionSection" className="collection-section" style={disabledStyle}>
      <div className="section-header">
        <i className="fas fa-receipt" aria-hidden="true" /> {t("transferCenter.collection.title")}
      </div>
      <div className="section-body">
        <div className="info-alert">
          {" "}
          <i className="fas fa-info" aria-hidden="true" /> {t("transferCenter.collection.info")}
        </div>
        <div className="row mb-2">
          <div className="col-md-6">
            <label className="form-label" htmlFor="exchangeCustomerAccount">
              <i className="fas fa-user" aria-hidden="true" />{" "}
              {t("transferCenter.collection.account")}
            </label>
            <select
              id="exchangeCustomerAccount"
              className="form-control form-control-sm no-select2"
              value={selection.accountId}
              disabled={manual || !fund || noAccounts}
              onChange={(event) => pickAccount(event.target.value)}
            >
              <option value="">{accountPlaceholder}</option>
              {accounts.data?.map((account) => (
                <option key={account.accountId} value={account.accountId}>
                  {`${account.accountCode} - ${account.accountName} (${account.collectionCount} ${t("transferCenter.collection.collectionsShort")}, ${formatN2(account.remainingTotal)} ${sym})`}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-6">
            <label className="form-label" htmlFor="exchangeCollection">
              <i className="fas fa-file-invoice" aria-hidden="true" />{" "}
              {t("transferCenter.collection.collections")}
            </label>
            <ZtoSelect
              id="exchangeCollection"
              className="form-control form-control-sm"
              value={selection.collectionId}
              onChange={pickCollection}
              disabled={manual || !selection.accountId}
              placeholder={
                selection.accountId
                  ? t("transferCenter.form.select")
                  : t("transferCenter.collection.pickAccount")
              }
              options={(collections.data ?? []).map((c) => ({
                value: c.settlementId,
                label: `${formatDate(c.date)} | ${formatN2(c.amount)} ${sym} | ${t("transferCenter.collection.remaining")}: ${formatN2(c.remaining)} ${sym}${c.description ? ` | ${c.description}` : ""}`,
              }))}
            />
          </div>
        </div>
        {noAccounts && (
          <div
            id="exchangeCollectionBankAlert"
            className="alert alert-warning py-1 mb-2"
            style={{ fontSize: 11 }}
            role="status"
          >
            <i className="fas fa-exclamation-triangle" aria-hidden="true" />{" "}
            <span>{t("transferCenter.collection.none")}</span>
          </div>
        )}
        {collection && (
          <div id="collectionDetailCard" className="collection-detail-card">
            <div className="detail-row">
              <div className="detail-item">
                <div className="detail-label">{t("transferCenter.collection.date")}</div>
                <div className="detail-value" id="detailCollectionDate">
                  {formatDate(collection.date) || "-"}
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-label">{t("transferCenter.collection.amount")}</div>
                <div className="detail-value text-primary" id="detailCollectionAmount">
                  {formatN2(collection.amount)} {sym}
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-label">{t("transferCenter.collection.broken")}</div>
                <div className="detail-value text-warning" id="detailExchangedAmount">
                  {formatN2(collection.broken)} {sym}
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-label">{t("transferCenter.collection.remaining")}</div>
                <div className="detail-value text-success" id="detailRemainingAmount">
                  {formatN2(collection.remaining)} {sym}
                </div>
              </div>
            </div>
          </div>
        )}
        {breakItems.length > 0 && (
          <div id="exchangeBreakSourceSection" style={{ marginTop: 14 }}>
            <hr style={{ margin: "8px 0" }} />
            <div className="d-flex justify-content-between align-items-center mb-1">
              <span style={{ fontSize: 11, fontWeight: 700, color: "#7b1fa2" }}>
                <i className="fas fa-link" aria-hidden="true" />{" "}
                {t("transferCenter.collection.breakSources")}
              </span>
              <div>
                <span style={{ fontSize: 11, color: "#555" }}>
                  {t("transferCenter.collection.totalSelected")}
                </span>{" "}
                <strong className="text-primary" id="totalBreakSourceAmount">
                  {formatN2(breakTotal)}
                </strong>{" "}
                <span id="breakSourceCurrencySymbol" className="text-primary">
                  {sym}
                </span>
              </div>
            </div>
            <div
              className="info-alert"
              style={{
                fontSize: 10,
                padding: "4px 8px",
                background: "#f3e5f5",
                border: "1px solid #ce93d8",
                color: "#4a148c",
                borderRadius: 4,
                marginBottom: 6,
              }}
            >
              <i className="fas fa-info-circle" aria-hidden="true" />{" "}
              {t("transferCenter.collection.breakInfo")}
            </div>
            <div className="orders-table-container">
              <table className="table orders-table mb-0" style={{ fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>
                      <input
                        type="checkbox"
                        id="selectAllBreakSources"
                        aria-label={t("transferCenter.collection.selectAll")}
                        disabled={manual}
                        checked={breakItems.every((item) => item.transferId in selection.breaks)}
                        onChange={(event) => {
                          const breaks: Record<string, number> = {};
                          if (event.target.checked) {
                            for (const item of breakItems)
                              breaks[item.transferId] = round(item.remaining);
                          }
                          onChange({ ...selection, breaks });
                        }}
                      />
                    </th>
                    <th>{t("transferCenter.collection.code")}</th>
                    <th>{t("transferCenter.collection.date")}</th>
                    <th>{t("transferCenter.collection.sourceBank")}</th>
                    <th className="text-right">{t("transferCenter.collection.deposited")}</th>
                    <th className="text-right">{t("transferCenter.collection.used")}</th>
                    <th className="text-right">{t("transferCenter.collection.remaining")}</th>
                    <th style={{ width: 150, minWidth: 120 }}>
                      {t("transferCenter.collection.toUse")}
                    </th>
                  </tr>
                </thead>
                <tbody id="breakSourceTableBody">
                  {breakItems.map((item) => {
                    const checked = item.transferId in selection.breaks;
                    return (
                      <tr key={item.transferId}>
                        <td>
                          <input
                            type="checkbox"
                            className="break-source-checkbox"
                            aria-label={item.code}
                            checked={checked}
                            disabled={manual}
                            onChange={(event) =>
                              toggleBreak(item.transferId, item.remaining, event.target.checked)
                            }
                          />
                        </td>
                        <td>
                          <span className="badge badge-warning" style={{ fontSize: 10 }}>
                            {item.code}
                          </span>
                        </td>
                        <td>{formatDate(item.date)}</td>
                        <td>
                          <small>{item.sourceFundName ?? "-"}</small>
                        </td>
                        <td className="text-right">
                          {formatN2(item.deposited)} <small>{sym}</small>
                        </td>
                        <td className="text-right text-warning">
                          {formatN2(item.used)} <small>{sym}</small>
                        </td>
                        <td className="text-right text-success">
                          {formatN2(item.remaining)} <small>{sym}</small>
                        </td>
                        <td>
                          <div className="input-group input-group-sm">
                            <input
                              type="number"
                              className="form-control break-source-input"
                              aria-label={`${item.code} ${t("transferCenter.collection.toUse")}`}
                              placeholder="0,00"
                              min={0}
                              max={item.remaining}
                              step={0.01}
                              inputMode="decimal"
                              disabled={!checked || manual}
                              value={checked ? String(selection.breaks[item.transferId]) : ""}
                              onChange={(event) =>
                                setBreak(item.transferId, item.remaining, event.target.value)
                              }
                            />
                            <div className="input-group-append">
                              <span className="input-group-text" style={{ fontSize: 9 }}>
                                {sym}
                              </span>
                            </div>
                          </div>
                          {warn[item.transferId] !== undefined && (
                            <div className="text-danger" style={{ fontSize: 9 }} role="status">
                              {`${t("transferCenter.collection.max")} ${formatN2(warn[item.transferId])}`}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
