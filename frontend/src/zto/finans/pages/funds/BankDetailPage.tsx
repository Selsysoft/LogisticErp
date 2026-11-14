import { CSSProperties, ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "../../../../auth/authStore";
import { useCan, useMultiCompany } from "../../../../pages/finance/common";
import { useFund, useFundCanDelete, useFundTransactions } from "../../../../pages/finance/fundApi";
import { useBranchTree } from "../../../branch/branchTree";
import {
  ZtoAuditCell,
  currencySymbol,
  formatDate,
  formatDateTime,
  formatN2,
} from "../../../components";
import { errorMessage } from "../../../components/definitionLogic";
import {
  ZTO_FINANS_BASE,
  ZTO_SLUGS,
  bankEditPath,
  fundExtractPath,
  fundTransactionsPath,
  transferCenterPath,
} from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { ZtoPageLoading } from "../../ZtoSuspenseOutlet";
import { accountingKeyOf, todayIso } from "../fundTransactions/fundTransactionsLogic";
import type { FundFlash } from "./BanksPage";
import { FundDeleteModal } from "./FundDeleteModal";
import {
  accountTypeMeta,
  branchIndex,
  companyNames,
  deleteBlockedReason,
  signedAmountText,
} from "./fundsLogic";

const PAGE: CSSProperties = { paddingTop: 24, paddingBottom: 24 };
const SCROLL: CSSProperties = { maxHeight: 600, overflowY: "auto" };
const DESC: CSSProperties = { fontSize: 11, color: "#64748b", marginTop: 5 };

/**
 * Banka Hesap Detayı (ZTO BankIntroduction/Details.cshtml:193-537; 12.2 §5.7). "Son İşlemler" tek fon,
 * `to=bugün`, `size=20`, `from` yok (ileri tarihliler hariç — ZTO B18); işaret ve renk yönden, sembol
 * para biriminden (ZTO B3). (≥ 2 şirket) "Şirket" satırı Blackrose eki.
 */
export function BankDetailPage() {
  useZtoRootClass("zto-page-bank-detail");
  const { id = "" } = useParams();
  const { t } = useTranslation("ztoFinans");
  const navigate = useNavigate();
  const canManage = useCan("FINANCE_MANAGE");
  const multiCompany = useMultiCompany();
  const me = useAuthStore((state) => state.me);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = todayIso();
  const fund = useFund(id);
  const canDelete = useFundCanDelete(id);
  const recent = useFundTransactions(
    { kind: "BANK", fundIds: [id], to: today, companyId: null },
    0,
    20,
  );
  const tree = useBranchTree();
  const branches = useMemo(() => branchIndex(tree.data), [tree.data]);
  const companies = useMemo(() => companyNames(me?.companies), [me?.companies]);
  const d = (key: string, options?: Record<string, unknown>) => t(`funds.detail.${key}`, options);

  if (fund.isPending) return <ZtoPageLoading />;
  if (fund.isError || !fund.data) {
    return (
      <div className="container-fluid" style={PAGE}>
        <div className="alert alert-danger" role="alert">
          {errorMessage(fund.error, d("loadFailed"))}
        </div>
      </div>
    );
  }
  const data = fund.data;
  const type = data.accountType ?? "DEMAND";
  const meta = accountTypeMeta(type);
  const demand = type === "DEMAND";
  const credit = type === "CREDIT";
  const symbol = currencySymbol(data.currency);
  const branch = branches.get(data.branchId);
  const allowed = canDelete.data?.allowed === true;
  const reason =
    canDelete.data && !allowed
      ? deleteBlockedReason(canDelete.data.reasons, {
          intro: t("funds.deleteModal.introBank"),
          outro: t("funds.deleteModal.outro"),
          companyDefault: t("funds.deleteModal.companyDefault"),
          item: (kind, count) =>
            t(
              `funds.deleteModal.reasons.${kind === "FUND_TRANSACTION" ? "FUND_TRANSACTION_BANK" : kind}`,
              {
                count,
                kind,
                defaultValue: t("funds.deleteModal.reasons.other", { count, kind }),
              },
            ),
        })
      : "";
  const balanceClass = credit ? "credit" : data.currentBalance < 0 ? "negative" : "";
  const typeDisplay = t(`funds.common.accountTypeDisplay.${type}`);
  const transactionsPath = fundTransactionsPath("BANK", { fundId: data.id });
  const listPath = `${ZTO_FINANS_BASE}/${ZTO_SLUGS.banks}`;
  const rows = recent.data?.content ?? [];
  const row = (label: string, value: ReactNode) => (
    <div className="info-row">
      <div className="info-label">{label}</div>
      <div className="info-value">{value}</div>
    </div>
  );

  return (
    <div className="container-fluid" style={PAGE}>
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap">
        <div className="d-flex align-items-center">
          <Link
            to={listPath}
            className="erp-btn erp-btn-secondary mr-3"
            title={t("funds.common.backToList")}
          >
            <i className="fas fa-arrow-left" aria-hidden="true" />
            <span className="d-none d-md-inline">{t("funds.common.back")}</span>
          </Link>
          <div className="erp-header-icon" aria-hidden="true">
            <i className="fas fa-university" />
          </div>
          <div>
            <h5 className="mb-0 font-weight-bold">{d("title")}</h5>
            <div className="erp-breadcrumb">
              <Link to={`${ZTO_FINANS_BASE}/${ZTO_SLUGS.accounts}`}>
                {t("funds.common.finance")}
              </Link>
              <span className="separator" aria-hidden="true">
                /
              </span>
              <Link to={listPath}>{t("funds.banks.title")}</Link>
              <span className="separator" aria-hidden="true">
                /
              </span>
              <span aria-current="page">{d("crumb")}</span>
            </div>
          </div>
        </div>
        <div className="action-buttons">
          <ZtoAuditCell
            createdBy={data.createdBy}
            createdAt={data.createdAt}
            updatedBy={data.updatedBy}
            updatedAt={data.updatedAt}
            updateCount={data.updateCount}
          />
          {demand && canManage && (
            <Link to={bankEditPath(data.id)} className="erp-btn erp-btn-warning">
              <i className="fas fa-edit" aria-hidden="true" />
              <span>{d("edit")}</span>
            </Link>
          )}
          <Link to={transactionsPath} className="erp-btn erp-btn-primary">
            <i className="fas fa-exchange-alt" aria-hidden="true" />
            <span>{d("allTransactions")}</span>
          </Link>
          {demand && canManage && allowed && (
            <button
              type="button"
              className="erp-btn erp-btn-danger"
              onClick={() => setDeleting(true)}
            >
              <i className="fas fa-trash-alt" aria-hidden="true" />
              <span>{d("delete")}</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      {canDelete.data && !allowed && reason && (
        <div className="danger-box">
          <i className="fas fa-exclamation-triangle" aria-hidden="true" />{" "}
          <strong>{d("blocked")}</strong>
          <p className="mb-0 mt-2">{reason}</p>
        </div>
      )}
      {!demand && (
        <div className="warning-box">
          <i className="fas fa-info-circle" aria-hidden="true" />{" "}
          <strong>{d("managedTitle", { type: t(`funds.common.accountTypes.${type}`) })}</strong>
          <p className="mb-0 mt-2">{d("managedText")}</p>
        </div>
      )}

      <div className="row">
        <div className="col-lg-8">
          <div className={`balance-display ${balanceClass}`.trim()}>
            <div className="balance-label">{credit ? d("creditDebt") : d("currentBalance")}</div>
            <div className="balance-amount">
              {formatN2(data.currentBalance)} {symbol}
            </div>
          </div>

          <div className="detail-card">
            <div className="detail-card-header">
              <h6 className="mb-0">
                <i className="fas fa-info-circle mr-2" aria-hidden="true" />
                {d("general")}
              </h6>
            </div>
            <div className="detail-card-body">
              {row(d("bankCode"), data.code)}
              {row(d("bankName"), data.name)}
              {data.bankBranchName && row(d("branchName"), data.bankBranchName)}
              {row(
                d("accountType"),
                <span className={`account-type-badge type-${meta.slug}`}>
                  <i className={`fas ${meta.icon}`} aria-hidden="true" /> {typeDisplay}
                </span>,
              )}
              {data.accountNo && row(d("accountNo"), data.accountNo)}
              {data.iban && row(d("iban"), data.iban)}
              {row(d("currency"), `${symbol} - ${data.currency}`)}
              {branch?.name && row(d("workPlace"), branch.name)}
              {branch?.groupName && row(d("branchProvince"), branch.groupName)}
              {multiCompany && row(d("company"), companies.get(data.companyId) ?? "")}
              {row(d("createdAt"), formatDateTime(data.createdAt))}
              {row(
                d("status"),
                data.active ? (
                  <span className="badge badge-success">
                    <i className="fas fa-check" aria-hidden="true" /> {d("active")}
                  </span>
                ) : (
                  <span className="badge badge-danger">
                    <i className="fas fa-times" aria-hidden="true" /> {d("passive")}
                  </span>
                ),
              )}
            </div>
          </div>

          {data.description && (
            <div className="detail-card">
              <div className="detail-card-header">
                <h6 className="mb-0">
                  <i className="fas fa-comment-alt mr-2" aria-hidden="true" />
                  {d("description")}
                </h6>
              </div>
              <div className="detail-card-body">
                <p className="mb-0">{data.description}</p>
              </div>
            </div>
          )}

          <div className="detail-card">
            <div className="detail-card-header">
              <h6 className="mb-0">
                <i className="fas fa-link mr-2" aria-hidden="true" />
                {d("modules")}
              </h6>
            </div>
            <div className="detail-card-body">
              {row(
                d("moduleTransactions"),
                <Link to={transactionsPath} className="btn btn-sm btn-primary">
                  <i className="fas fa-exchange-alt" aria-hidden="true" /> {d("openTransactions")}
                </Link>,
              )}
              {demand &&
                row(
                  d("moduleTransfer"),
                  <Link
                    to={transferCenterPath({
                      tab: "new",
                      sourceFundId: data.id,
                      sourceBranchId: data.branchId,
                    })}
                    className="btn btn-sm btn-success"
                  >
                    <i className="fas fa-exchange-alt" aria-hidden="true" /> {d("openTransfer")}
                  </Link>,
                )}
              {row(
                d("moduleExtract"),
                <a
                  href={fundExtractPath("BANK", data.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-light"
                >
                  <i className="fas fa-file-alt" aria-hidden="true" /> {d("openExtract")}
                  <span className="sr-only"> {t("funds.common.opensInNewTab")}</span>
                </a>,
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="detail-card">
            <div className="detail-card-header">
              <h6 className="mb-0" id="recentTitle">
                <i className="fas fa-history mr-2" aria-hidden="true" />
                {d("recent")}
              </h6>
              <Link to={transactionsPath} className="btn btn-sm btn-light">
                {d("seeAll")}
              </Link>
            </div>
            <div
              className="detail-card-body"
              style={SCROLL}
              role="region"
              aria-labelledby="recentTitle"
              tabIndex={0}
            >
              {rows.length > 0 ? (
                rows.map((tx) => {
                  const income = tx.direction === "IN";
                  const key = accountingKeyOf("BANK", tx.accountingType);
                  return (
                    <div
                      key={tx.id}
                      className={`transaction-item ${income ? "income" : "expense"}`}
                    >
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <div>
                          <div className="transaction-type">
                            <i
                              className={`fas ${income ? "fa-arrow-down" : "fa-arrow-up"}`}
                              aria-hidden="true"
                            />{" "}
                            {d(income ? "incoming" : "outgoing")} -{" "}
                            {key ? t(`fundTransactions.accountingTypes.${key}`) : tx.accountingType}
                          </div>
                          <div className="transaction-date">
                            <i className="far fa-calendar" aria-hidden="true" />{" "}
                            {formatDate(tx.transactionDate)}
                          </div>
                        </div>
                        <div className={`transaction-amount ${income ? "income" : "expense"}`}>
                          {signedAmountText(tx.direction, formatN2(tx.amount))}{" "}
                          {currencySymbol(tx.currency)}
                        </div>
                      </div>
                      {tx.description && <div style={DESC}>{tx.description}</div>}
                    </div>
                  );
                })
              ) : (
                <div className="text-center text-muted py-4">
                  <i className="fas fa-inbox fa-2x mb-2" aria-hidden="true" />
                  <p className="mb-0">{d("noTransactions")}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <FundDeleteModal
        fund={deleting ? data : null}
        onHide={() => setDeleting(false)}
        onDeleted={() => {
          const flash: FundFlash = { variant: "success", message: t("funds.banks.deleted") };
          navigate(listPath, { state: { flash } });
        }}
        onDeactivated={() => {
          setDeleting(false);
          void fund.refetch();
        }}
        onError={(message) => {
          setDeleting(false);
          setError(message);
        }}
      />
    </div>
  );
}
