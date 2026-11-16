import { CSSProperties, KeyboardEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../../auth/authStore";
import { useActiveCompanyId } from "../../../../auth/companyStore";
import { useCurrencies, useMultiCompany } from "../../../../pages/finance/common";
import { useBalanceSheet } from "../../../../pages/finance/reportApi";
import type {
  BalanceSheet,
  BalanceSheetCurrency,
  BalanceSheetWorkplace,
} from "../../../../pages/finance/types";
import { ZtoSelect } from "../../../components/ZtoSelect";
import { currencySymbol } from "../../../format";
import { accountTransactionsPath } from "../../navItems";
import { formatIsoDate, isIsoDate, localToday } from "../../reports/reportDates";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import {
  NET_COLORS,
  absText,
  balanceClass,
  filterAccounts,
  groupWorkplaces,
  hasValue,
  intercompanyRows,
  intercompanyView,
  isNonNegative,
  issuedTotal,
  n0,
  netArrow,
  netKind,
  rateInfo,
  receivedTotal,
} from "./balanceSheetLogic";

const CONSOLIDATED = "all";

// ZTO satır içi stilleri (FBS:466-853) birebir.
const RIGHT_COL: CSSProperties = { paddingTop: 60 };
const SMALL_11: CSSProperties = { fontSize: 11 };
const FLEX_GAP_10: CSSProperties = { gap: 10 };
const LIABILITY_VALUE: CSSProperties = { color: "#fee2e2" };
const HEADER_ROW: CSSProperties = { display: "flex", alignItems: "center", gap: 6 };
const SYMBOL_ROW: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const BADGE_9: CSSProperties = { fontSize: 9 };
const EMPTY_MARGIN: CSSProperties = { margin: 6 };
const LINK_RESET: CSSProperties = { textDecoration: "none" };
const NAME_BOX: CSSProperties = { overflow: "hidden", minWidth: 0 };
const RIGHT_TEXT: CSSProperties = { textAlign: "right" };
const ARROW_8: CSSProperties = { fontSize: 8 };
const IWP_ICON: CSSProperties = { fontSize: 10 };
const IWP_NAME: CSSProperties = { color: "#1e293b", marginLeft: 3 };
const IWP_DIRECTION: CSSProperties = { color: "#64748b" };
const TCMB_ROW: CSSProperties = { padding: "0 14px 10px" };
const TCMB_RATES: CSSProperties = { color: "#475569" };
// Blackrose ekleri.
const CONTROLS: CSSProperties = { gap: 6 };
const INFO_LINE: CSSProperties = { fontSize: 11, padding: "4px 10px 0" };
const GROUP_HEAD: CSSProperties = { gap: 8 };

/**
 * Finansal Varlıklar & Bilanço (ZTO FinancialBalanceSheet/Index; 12.8_TASARIM §5.6). Genel özet şirket
 * düzeyi brüt (Rev 1 F2, OK-12.8-24); iş yeri kartları iş yeri görünümü (akordeon; MWG `accordion`:
 * ZTO `div.fbs-wp-header` korunur, `role="button"` + `aria-expanded`, Enter/Space, ok tuşu yok).
 * Döviz bakiyeleri asOf kuruyla tek değerleme (OK-12.8-25); KMH ve açık kaynaklı kur farkı bilgi
 * satırları (Rev 1 F6/F1). Stok ve iş yerleri arası ticari borç kartları yazılmaz (MX1 §2.8).
 */
export function BalanceSheetPage() {
  useZtoRootClass("zto-page-financial-balance-sheet");
  const { t } = useTranslation("ztoFinans");
  const multiCompany = useMultiCompany();
  const activeCompanyId = useActiveCompanyId();
  const me = useAuthStore((state) => state.me);
  const companies = useMemo(
    () => (me?.companies ?? []).filter((company) => company.active),
    [me?.companies],
  );
  const [today] = useState(() => localToday());
  const [asOf, setAsOf] = useState(today);
  const [company, setCompany] = useState(activeCompanyId ?? CONSOLIDATED);
  const wellFormedAsOf = isIsoDate(asOf);
  const validAsOf = wellFormedAsOf && asOf <= today;
  const sheet = useBalanceSheet(
    {
      asOf: validAsOf ? asOf : today,
      companyId: multiCompany ? (company === CONSOLIDATED ? null : company) : undefined,
    },
    { enabled: validAsOf },
  );
  const companyName = (id: string) => companies.find((c) => c.id === id)?.shortName ?? null;

  return (
    <div className="col-md-12">
      <div className="row">
        <div className="col-md-7">
          <div className="content fbs-page-header">
            <h5>
              <i className="fas fa-balance-scale-right" aria-hidden="true" />{" "}
              <b>{t("balanceSheet.title")}</b>
            </h5>
            <p className="page-subtitle">{t("balanceSheet.subtitle")}</p>
            <hr />
          </div>
        </div>
        <div className="col-md-5 text-right" style={RIGHT_COL}>
          <div
            className="d-flex justify-content-end align-items-center flex-wrap mb-1"
            style={CONTROLS}
          >
            {multiCompany && (
              <>
                <label className="mb-0" htmlFor="fbsCompany" style={SMALL_11}>
                  {t("balanceSheet.company")}
                </label>
                <ZtoSelect
                  id="fbsCompany"
                  className="form-control form-control-sm no-select2"
                  value={company}
                  onChange={setCompany}
                  placeholder={null}
                  options={[
                    { value: CONSOLIDATED, label: t("balanceSheet.consolidated") },
                    ...companies.map((c) => ({ value: c.id, label: c.shortName })),
                  ]}
                />
              </>
            )}
            <label className="mb-0" htmlFor="fbsAsOf" style={SMALL_11}>
              {t("balanceSheet.asOf")}
            </label>
            <input
              type="date"
              id="fbsAsOf"
              className="form-control form-control-sm"
              style={{ width: "auto" }}
              value={asOf}
              max={today}
              aria-invalid={!validAsOf || undefined}
              aria-describedby={validAsOf ? undefined : "fbsAsOfError"}
              onChange={(event) => setAsOf(event.target.value)}
            />
            {!validAsOf && (
              <div id="fbsAsOfError" className="invalid-feedback d-block" role="alert">
                {t(wellFormedAsOf ? "balanceSheet.asOfInvalid" : "balanceSheet.asOfMissing")}
              </div>
            )}
          </div>
          <small className="text-muted" style={SMALL_11}>
            <i className="fas fa-info-circle" aria-hidden="true" /> {t("balanceSheet.rateDate")}:{" "}
            <strong>{formatIsoDate(validAsOf ? sheet.data?.rateDate : null) || "-"}</strong>
          </small>
        </div>
      </div>

      {/* Geçersiz/ileri tarihte önbellekteki (bugünün) bilanço gösterilmez: seçilen tarihinmiş gibi görünürdü. */}
      {!validAsOf ? null : sheet.isPending ? (
        <p className="text-muted">{t("balanceSheet.loading")}</p>
      ) : sheet.error ? (
        <div className="alert alert-danger" role="alert">
          {t("balanceSheet.error", { message: sheet.error.message })}
        </div>
      ) : sheet.data ? (
        <BalanceSheetBody
          sheet={sheet.data}
          multiCompany={multiCompany}
          companyName={companyName}
        />
      ) : null}
    </div>
  );
}

function BalanceSheetBody({
  sheet,
  multiCompany,
  companyName,
}: {
  sheet: BalanceSheet;
  multiCompany: boolean;
  companyName: (id: string) => string | null;
}) {
  const { t } = useTranslation("ztoFinans");
  const positive = isNonNegative(sheet.netTl);
  const groups = groupWorkplaces(sheet);

  return (
    <>
      <div className="fbs-grand-summary">
        <div
          className="d-flex justify-content-between align-items-center flex-wrap"
          style={FLEX_GAP_10}
        >
          <div>
            <div className="gs-title">
              <i className="fas fa-coins" aria-hidden="true" /> {t("balanceSheet.grand.assets")}
            </div>
            <div className="gs-value">{n0(sheet.assetsTl)} ₺</div>
            <div className="gs-subtitle">{t("balanceSheet.grand.assetsHint")}</div>
          </div>
          <div className="gs-divider" />
          <div>
            <div className="gs-title">
              <i className="fas fa-arrow-down" aria-hidden="true" />{" "}
              {t("balanceSheet.grand.liabilities")}
            </div>
            <div className="gs-value" style={LIABILITY_VALUE}>
              {n0(sheet.liabilitiesTl)} ₺
            </div>
            <div className="gs-subtitle">{t("balanceSheet.grand.liabilitiesHint")}</div>
          </div>
          <div className="gs-divider" />
          <div>
            <div className="gs-title">
              <i className="fas fa-chart-line" aria-hidden="true" /> {t("balanceSheet.grand.net")}
            </div>
            <div className="gs-value" style={{ color: positive ? "#bbf7d0" : "#fee2e2" }}>
              {n0(sheet.netTl)} ₺
            </div>
            <div className="gs-subtitle">
              {positive ? t("balanceSheet.grand.positive") : t("balanceSheet.grand.negative")}
            </div>
          </div>
          <div className="gs-divider" />
          <div>
            <div className="gs-title">
              <i className="fas fa-building" aria-hidden="true" />{" "}
              {t("balanceSheet.grand.workplaces")}
            </div>
            <div className="gs-value">{sheet.workplaceCount}</div>
            <div className="gs-subtitle">{t("balanceSheet.grand.workplacesHint")}</div>
          </div>
        </div>
      </div>
      {sheet.missingRates.length > 0 && (
        <div className="alert alert-warning" role="status">
          {t("balanceSheet.grand.missingRates", { currencies: sheet.missingRates.join(", ") })}
        </div>
      )}
      <small className="text-muted d-block mb-2">{t("balanceSheet.grand.note")}</small>

      {sheet.workplaces.length === 0 ? (
        <div className="fbs-empty">
          <i className="fas fa-info-circle" aria-hidden="true" />{" "}
          {t("balanceSheet.emptyWorkplaces")}
        </div>
      ) : (
        groups.map((group) => (
          <div
            key={group.companyId}
            className="fbs-company-group"
            data-company-id={group.companyId}
          >
            {multiCompany && (
              <div className="d-flex align-items-center flex-wrap mt-3 mb-2" style={GROUP_HEAD}>
                <h6 className="mb-0">
                  <i className="fas fa-landmark mr-1" aria-hidden="true" />
                  {group.companyName}
                </h6>
                <span className="badge badge-light">
                  <i className="fas fa-exchange-alt mr-1" aria-hidden="true" />
                  {t("balanceSheet.companyGroup.workplaceCount", {
                    count: group.workplaces.length,
                  })}
                </span>
                {group.summary && (
                  <small className="text-muted">
                    {t("balanceSheet.companyGroup.assets")}: {n0(group.summary.assetsTl)} ₺ ·{" "}
                    {t("balanceSheet.companyGroup.liabilities")}: {n0(group.summary.liabilitiesTl)}{" "}
                    ₺ · {t("balanceSheet.companyGroup.net")}: {n0(group.summary.netTl)} ₺
                  </small>
                )}
              </div>
            )}
            {group.workplaces.map((workplace) => (
              <WorkplaceCard
                key={workplace.branchId}
                workplace={workplace}
                sheet={sheet}
                companyName={companyName}
              />
            ))}
          </div>
        ))
      )}
      {sheet.creditDepositPending && (
        <small className="text-muted d-block mt-2">{t("balanceSheet.creditDepositPending")}</small>
      )}
    </>
  );
}

function WorkplaceCard({
  workplace,
  sheet,
  companyName,
}: {
  workplace: BalanceSheetWorkplace;
  sheet: BalanceSheet;
  companyName: (id: string) => string | null;
}) {
  const { t } = useTranslation("ztoFinans");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const bodyId = `wp-body-${workplace.branchId}`;
  const accounts = filterAccounts(workplace.accounts, query);
  const intercompany = intercompanyRows(sheet.intercompany, workplace.companyId);
  const rates = rateInfo(sheet.rates, workplace.currencies);

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
    event.preventDefault();
    setOpen((value) => !value);
  };

  return (
    <div className={`fbs-wp-card${open ? " is-open" : ""}`} data-wp-id={workplace.branchId}>
      <div
        className="fbs-wp-header"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onKey}
      >
        <div style={HEADER_ROW}>
          <i className="fas fa-chevron-right accordion-chevron" aria-hidden="true" />
          <div className="wp-name">
            <i className="fas fa-industry text-primary" aria-hidden="true" /> {workplace.branchName}
            {workplace.branchGroupName && (
              <>
                {" "}
                <span className="wp-branch">
                  <i className="fas fa-map-marker-alt" aria-hidden="true" />{" "}
                  {workplace.branchGroupName}
                </span>
              </>
            )}
          </div>
          <div className="wp-mini-totals">
            <span className="mini-stat mini-assets" title={t("balanceSheet.card.assetsTitle")}>
              <i className="fas fa-arrow-up" aria-hidden="true" /> {n0(workplace.assetsTl)} ₺
            </span>
            <span className="mini-stat mini-debt" title={t("balanceSheet.card.debtTitle")}>
              <i className="fas fa-arrow-down" aria-hidden="true" /> {n0(workplace.liabilitiesTl)} ₺
            </span>
            <span className="mini-stat mini-networth" title={t("balanceSheet.card.netTitle")}>
              <i className="fas fa-balance-scale" aria-hidden="true" /> {n0(workplace.netTl)} ₺
            </span>
          </div>
        </div>
        <div className="wp-stats-mini">
          <span className="stat-chip">
            <i className="fas fa-coins mr-1" aria-hidden="true" />
            {t("balanceSheet.card.currencyCount", { count: workplace.currencyCount })}
          </span>
          <span className="stat-chip">
            <i className="fas fa-users mr-1" aria-hidden="true" />
            {t("balanceSheet.card.accountCount", { count: workplace.accountCount })}
          </span>
        </div>
      </div>

      <div className="fbs-wp-collapse" id={bodyId} hidden={!open}>
        <div className="fbs-wp-body-scroll">
          <div className="fbs-wp-body">
            <div>
              {workplace.currencies.length === 0 ? (
                <div className="fbs-empty">
                  <i className="fas fa-info-circle" aria-hidden="true" />{" "}
                  {t("balanceSheet.block.empty")}
                </div>
              ) : (
                workplace.currencies.map((block) => (
                  <CurrencyBlock key={block.currency} block={block} />
                ))
              )}
            </div>

            <div className="fbs-right-panel">
              <div className="fbs-side-card">
                <div className="sc-header">
                  <h6>
                    <i className="fas fa-users mr-1" aria-hidden="true" />{" "}
                    {t("balanceSheet.accounts.title")}
                  </h6>
                  <span className="badge badge-light" style={BADGE_9}>
                    {workplace.accounts.length}
                  </span>
                </div>
                <input
                  type="text"
                  className="fbs-cari-search"
                  placeholder={t("balanceSheet.accounts.search")}
                  aria-label={t("balanceSheet.accounts.search")}
                  autoComplete="off"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <div className="sc-body" id={`cariList_${workplace.branchId}`}>
                  {workplace.accounts.length === 0 ? (
                    <div className="fbs-empty" style={EMPTY_MARGIN}>
                      <i className="fas fa-info-circle" aria-hidden="true" />{" "}
                      {t("balanceSheet.accounts.empty")}
                    </div>
                  ) : (
                    accounts.map((account, index) => {
                      const balances = account.balances.map((balance) => {
                        const kind = netKind(balance.amount);
                        const arrow = netArrow(balance.amount);
                        return (
                          <div
                            key={balance.currency}
                            className={`fbs-cari-balance ${balanceClass(balance.amount)}`}
                            title={t(`balanceSheet.block.${kind}`)}
                          >
                            {n0(absText(balance.amount))} {currencySymbol(balance.currency)}
                            {arrow && (
                              <>
                                {" "}
                                <i className={`fas ${arrow}`} style={ARROW_8} aria-hidden="true" />
                              </>
                            )}
                          </div>
                        );
                      });
                      if (account.masked || !account.accountId) {
                        return (
                          <div key={`masked-${index}`} className="fbs-cari-item">
                            <div style={NAME_BOX}>
                              <div className="fbs-cari-name">
                                {t("balanceSheet.accounts.masked")}
                              </div>
                              <div className="fbs-cari-group">{account.subGroupName}</div>
                            </div>
                            <div style={RIGHT_TEXT}>{balances}</div>
                          </div>
                        );
                      }
                      return (
                        <a
                          key={account.accountId}
                          href={accountTransactionsPath(account.accountId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="fbs-cari-item"
                          style={LINK_RESET}
                          title={`${account.accountName} — ${account.subGroupName} (${t("balanceSheet.accounts.newTab")})`}
                        >
                          <div style={NAME_BOX}>
                            <div className="fbs-cari-name">{account.accountName}</div>
                            <div className="fbs-cari-group">
                              {account.subGroupName} · {account.accountCode}
                            </div>
                          </div>
                          <div style={RIGHT_TEXT}>{balances}</div>
                        </a>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="fbs-side-card">
                <div className="sc-header">
                  <h6>
                    <i className="fas fa-exchange-alt mr-1" aria-hidden="true" />{" "}
                    {t("balanceSheet.intercompany.title")}
                  </h6>
                  <span className="badge badge-light" style={BADGE_9}>
                    {intercompany.length}
                  </span>
                </div>
                <div className="sc-body">
                  {intercompany.length === 0 ? (
                    <div className="fbs-empty" style={EMPTY_MARGIN}>
                      <i className="fas fa-info-circle" aria-hidden="true" />{" "}
                      {t("balanceSheet.intercompany.empty")}
                    </div>
                  ) : (
                    intercompany.map((item) => {
                      const view = intercompanyView(item.amount);
                      return (
                        <div key={item.key} className="fbs-iwp-item">
                          <div>
                            <i
                              className="fas fa-industry text-muted"
                              style={IWP_ICON}
                              aria-hidden="true"
                            />
                            <strong style={IWP_NAME}>
                              {companyName(item.row.representsCompanyId) ?? item.row.accountName}
                            </strong>{" "}
                            <span className="fbs-iwp-arrow">
                              <i className={view.icon} aria-hidden="true" />
                            </span>{" "}
                            <small style={IWP_DIRECTION}>
                              {t(`balanceSheet.intercompany.${view.direction}`)}
                            </small>
                          </div>
                          <strong style={{ color: view.color }}>
                            {n0(absText(item.amount))} {currencySymbol(item.currency)}
                          </strong>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="fbs-wp-footer">
            <div className="footer-stat assets">
              <div className="stat-label">
                <i className="fas fa-arrow-up" aria-hidden="true" />{" "}
                {t("balanceSheet.footer.assets")}
              </div>
              <div className="stat-value">{n0(workplace.assetsTl)} ₺</div>
            </div>
            <div className="footer-stat liabilities">
              <div className="stat-label">
                <i className="fas fa-arrow-down" aria-hidden="true" />{" "}
                {t("balanceSheet.footer.liabilities")}
              </div>
              <div className="stat-value">{n0(workplace.liabilitiesTl)} ₺</div>
            </div>
            <div className="footer-stat networth">
              <div className="stat-label">
                <i className="fas fa-balance-scale" aria-hidden="true" />{" "}
                {t("balanceSheet.footer.net")}
              </div>
              <div className="stat-value">{n0(workplace.netTl)} ₺</div>
            </div>
          </div>

          <div className="fbs-tcmb-info" style={TCMB_ROW}>
            <i className="fas fa-info-circle" aria-hidden="true" />{" "}
            {t("balanceSheet.footer.rates", { date: formatIsoDate(sheet.rateDate) || "-" })}{" "}
            <span style={TCMB_RATES}>{rates}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CurrencyBlock({ block }: { block: BalanceSheetCurrency }) {
  const { t } = useTranslation("ztoFinans");
  const currencies = useCurrencies();
  const name = currencies.data?.find((c) => c.code === block.currency)?.name ?? block.currency;
  const kind = netKind(block.net);
  const colors = NET_COLORS[kind];
  const symbol = currencySymbol(block.currency);
  const arrow = netArrow(block.net);
  const countText = (checks: number, notes: number) =>
    t("balanceSheet.block.checks", { count: checks }) +
    (notes > 0 ? ` · ${t("balanceSheet.block.notes", { count: notes })}` : "");

  return (
    <div className="fbs-currency-block" data-currency={block.currency}>
      <div className="cb-header">
        <div style={SYMBOL_ROW}>
          <span className="cb-symbol">{symbol}</span>
          <span className="cb-name">{name}</span>
        </div>
        <span
          className="cb-net-badge"
          style={{
            background: colors.bg,
            color: colors.color,
            border: `1px solid ${colors.color}`,
          }}
        >
          {t(`balanceSheet.block.${kind}`)}
        </span>
      </div>

      <div className="cb-stats-grid">
        <div className="stat-cell debt">
          <div className="stat-label">
            <i className="fas fa-arrow-down" aria-hidden="true" /> {t("balanceSheet.block.debt")}
          </div>
          <div className="stat-value">
            {n0(block.debt)} {symbol}
          </div>
        </div>
        <div className="stat-cell payment">
          <div className="stat-label">
            <i className="fas fa-check-circle" aria-hidden="true" />{" "}
            {t("balanceSheet.block.payment")}
          </div>
          <div className="stat-value">
            {n0(block.payment)} {symbol}
          </div>
        </div>
        <div className="stat-cell credit">
          <div className="stat-label">
            <i className="fas fa-arrow-up" aria-hidden="true" />{" "}
            {t("balanceSheet.block.receivable")}
          </div>
          <div className="stat-value">
            {n0(block.receivable)} {symbol}
          </div>
        </div>
        <div className="stat-cell collect">
          <div className="stat-label">
            <i className="fas fa-hand-holding-usd" aria-hidden="true" />{" "}
            {t("balanceSheet.block.collection")}
          </div>
          <div className="stat-value">
            {n0(block.collection)} {symbol}
          </div>
        </div>
      </div>

      <div className="liquidity-row">
        <div className="liq-cell bank">
          <div className="liq-label">
            <i className="fas fa-university" aria-hidden="true" /> {t("balanceSheet.block.bank")}
          </div>
          <div className="liq-value">
            {n0(block.bank)} {symbol}
          </div>
        </div>
        <div className="liq-cell cash">
          <div className="liq-label">
            <i className="fas fa-money-bill-wave" aria-hidden="true" />{" "}
            {t("balanceSheet.block.cash")}
          </div>
          <div className="liq-value">
            {n0(block.cash)} {symbol}
          </div>
        </div>
        <div className="liq-cell cek-in">
          <div className="liq-label">
            <i className="fas fa-arrow-circle-down" aria-hidden="true" />{" "}
            {t("balanceSheet.block.received")}
          </div>
          <div className="liq-value">
            {n0(receivedTotal(block))} {symbol}
          </div>
          <div className="liq-count">
            {countText(block.receivedCheckCount, block.receivedNoteCount)}
          </div>
        </div>
        <div className="liq-cell cek-out">
          <div className="liq-label">
            <i className="fas fa-arrow-circle-up" aria-hidden="true" />{" "}
            {t("balanceSheet.block.issued")}
          </div>
          <div className="liq-value">
            {n0(issuedTotal(block))} {symbol}
          </div>
          <div className="liq-count">
            {countText(block.issuedCheckCount, block.issuedNoteCount)}
          </div>
        </div>
      </div>

      <div className="cb-net-summary" style={{ background: colors.bg, borderColor: colors.color }}>
        <span>
          <i className="fas fa-balance-scale" aria-hidden="true" /> {t("balanceSheet.block.net")}
        </span>
        <strong style={{ color: colors.color }}>
          {n0(absText(block.net))} {symbol}
          {arrow && (
            <>
              {" "}
              <i className={`fas ${arrow}`} aria-hidden="true" />
            </>
          )}
        </strong>
      </div>
      {hasValue(block.bankOverdraft) && (
        <small className="text-muted d-block" style={INFO_LINE}>
          {t("balanceSheet.block.overdraft", { amount: `${n0(block.bankOverdraft)} ${symbol}` })}
        </small>
      )}
      {block.currency === "TRY" && hasValue(block.fxAdjustment) && (
        <small className="text-muted d-block" style={INFO_LINE}>
          {t("balanceSheet.block.fxAdjustment", { amount: `${n0(block.fxAdjustment)} ${symbol}` })}
        </small>
      )}
    </div>
  );
}
