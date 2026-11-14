import { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ZtoTooltip, formatDate, formatN2 } from "../../../components";
import {
  cashEditPath,
  fundExtractPath,
  fundTransactionsPath,
  transferCenterPath,
  type TransferTypeParam,
} from "../../navItems";
import { MenuDivider, MenuItem, ZtoMenuButton } from "../accounts/AccountsMenu";
import { FundSparkline } from "./FundSparkline";
import { Marked } from "./FundListParts";
import { settlementPath, type FundCard } from "./fundsLogic";

const BTN: CSSProperties = { borderRadius: 6, fontSize: 10 };
const DIVIDER: CSSProperties = { width: 1, height: 50, background: "#dee2e6" };
const ROW_GAP: CSSProperties = { gap: 15 };
const PASSIVE: CSSProperties = { opacity: 0.6 };
const ICON_BOX: CSSProperties = {
  width: 45,
  height: 45,
  borderRadius: 10,
  background: "linear-gradient(135deg, #f59e0b, #d97706)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginRight: 15,
};
const CODE_BADGE: CSSProperties = { fontSize: 10 };
const SMALL_LABEL: CSSProperties = { fontSize: 9, color: "#94a3b8" };
const FUTURE: CSSProperties = {
  fontSize: 9,
  color: "#92400e",
  background: "#fef3c7",
  border: "1px solid #fde68a",
  borderRadius: 6,
  padding: "2px 6px",
  display: "inline-block",
  cursor: "help",
};

export type CashCardProps = {
  card: FundCard;
  pct: number;
  words: readonly string[];
  deltas: readonly number[] | null;
  canManage: boolean;
  canPost: boolean;
  multiCompany: boolean;
  onDetail: (card: FundCard) => void;
  onDelete: (card: FundCard) => void;
};

/**
 * Kasa kartı (ZTO _CashCardsListPartial.cshtml:14-221; 12.2 §5.8). "Güncel Bakiye" renk sınıfsız (ZTO
 * birebir). ⋮ "Bu Kasaya" bağlantıları hedef iş yeri + hedef kasa gönderir (ZTO :167, :173; F4).
 */
export function CashCard({
  card,
  pct,
  words,
  deltas,
  canManage,
  canPost,
  multiCompany,
  onDetail,
  onDelete,
}: CashCardProps) {
  const { t } = useTranslation("ztoFinans");
  const { t: tc } = useTranslation();
  const fund = card.fund;
  const m = (key: string) => t(`funds.cashCard.menu.${key}`);
  const transfer = (transferType: TransferTypeParam, role: "source" | "target") =>
    transferCenterPath(
      role === "source"
        ? { tab: "new", transferType, sourceFundId: fund.id, sourceBranchId: fund.branchId }
        : { tab: "new", transferType, targetFundId: fund.id, targetBranchId: fund.branchId },
    );
  const newTab = tc("common.a11y.opensInNewTab");
  const unknown = t("funds.common.unknown");

  return (
    <div
      className="cash-card searchable-card"
      style={fund.active ? undefined : PASSIVE}
      data-definition-id={fund.id}
      data-workplace={fund.branchId}
      data-cash-name={card.chipKey}
      data-workplace-name={card.workPlaceName || unknown}
      data-currency-symbol={card.symbol}
      data-balance={String(fund.currentBalance)}
    >
      <div className="account-progress-bar" style={{ width: `${pct.toFixed(2)}%` }} />
      <div className="d-flex align-items-center">
        <div style={ICON_BOX} aria-hidden="true">
          <i className="fas fa-cash-register text-white" />
        </div>
        <div className="cash-info">
          <div className="cash-name">
            <Marked text={fund.name} words={words} />{" "}
            {fund.code && (
              <span className="badge badge-secondary" style={CODE_BADGE}>
                <Marked text={fund.code} words={words} />
              </span>
            )}
            {!fund.active && (
              <span className="badge badge-secondary ml-1">{t("funds.common.passive")}</span>
            )}
          </div>
          <div className="cash-details">
            <span className="cash-detail-item">
              <i className="fas fa-coins" aria-hidden="true" />
              <span className="currency-badge">
                <i className="fas fa-money-bill-wave" aria-hidden="true" /> {card.symbol}
              </span>
            </span>
            <span className="cash-detail-item">
              <i className="fas fa-map-marker-alt" aria-hidden="true" />
              <span className="branch-badge">
                <i className="fas fa-building" aria-hidden="true" />{" "}
                <Marked text={card.branchGroupName || unknown} words={words} />
              </span>
            </span>
            <span className="cash-detail-item">
              <i className="fas fa-industry" aria-hidden="true" />{" "}
              <Marked text={card.workPlaceName || unknown} words={words} />
            </span>
            {multiCompany && card.companyName && (
              <span className="cash-detail-item">
                <i className="fas fa-landmark" aria-hidden="true" />{" "}
                <Marked text={card.companyName} words={words} />
              </span>
            )}
            {fund.openingDate && (
              <span className="cash-detail-item">
                <i className="fas fa-calendar-alt" aria-hidden="true" />
                <span>{formatDate(fund.openingDate)}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="d-flex align-items-center" style={ROW_GAP}>
        <FundSparkline fundId={fund.id} current={fund.currentBalance} deltas={deltas} />
        <div className="cash-balance">
          <div className="balance-value">
            {formatN2(fund.currentBalance)} {card.symbol}
          </div>
          <div className="balance-label">{t("funds.card.currentBalance")}</div>
          <div className="balance-label" style={SMALL_LABEL}>
            {t("funds.card.periodOpening")} {formatN2(fund.openingBalance)} {card.symbol}
          </div>
          {fund.futureCount > 0 && (
            <ZtoTooltip content={t("funds.card.futureTitleCash")}>
              <div className="balance-label mt-1" style={FUTURE} tabIndex={0}>
                <i className="fas fa-clock" aria-hidden="true" />{" "}
                {t("funds.card.future", { count: fund.futureCount })} ({formatN2(fund.futureNet)}{" "}
                {card.symbol})
              </div>
            </ZtoTooltip>
          )}
        </div>
        <div style={DIVIDER} />
        <Link
          to={fundTransactionsPath("CASH", { fundId: fund.id })}
          className="btn btn-sm btn-primary"
          style={BTN}
        >
          <i className="fas fa-exchange-alt mr-1" aria-hidden="true" />{" "}
          {t("funds.cashCard.transactions")}
        </Link>
        {canPost && (
          <>
            <div style={DIVIDER} />
            <a
              className="btn btn-sm btn-warning"
              target="_blank"
              rel="noopener noreferrer"
              href={settlementPath("PAYMENT", "CASH", fund.id)}
              style={BTN}
            >
              <i className="fas fa-cash-register mr-1" aria-hidden="true" />{" "}
              {t("funds.cashCard.payment")}
              <span className="sr-only"> {newTab}</span>
            </a>
            <div style={DIVIDER} />
            <a
              className="btn btn-sm btn-success"
              target="_blank"
              rel="noopener noreferrer"
              href={settlementPath("COLLECTION", "CASH", fund.id)}
              style={BTN}
            >
              <i className="fas fa-hand-holding-usd mr-1" aria-hidden="true" />{" "}
              {t("funds.cashCard.collection")}
              <span className="sr-only"> {newTab}</span>
            </a>
          </>
        )}
        <div style={DIVIDER} />
        <button
          type="button"
          className="btn btn-sm btn-info"
          style={BTN}
          onClick={() => onDetail(card)}
        >
          <i className="fas fa-eye mr-1" aria-hidden="true" /> {t("funds.cashCard.detail")}
        </button>
        <div style={DIVIDER} />
        <div className="cash-actions">
          <ZtoMenuButton
            buttonClassName="btn btn-sm btn-outline-secondary dropdown-toggle"
            label={<i className="fas fa-ellipsis-v" aria-hidden="true" />}
            ariaLabel={t("funds.card.actions", { name: fund.name })}
            menuClassName="dropdown-menu dropdown-menu-right"
            align="right"
          >
            <MenuItem
              icon="fas fa-eye text-info"
              label={<span>{m("detail")}</span>}
              className="dropdown-item"
              onSelect={() => onDetail(card)}
            />
            <MenuItem
              icon="fas fa-exchange-alt text-primary"
              label={<span>{m("cashTransactions")}</span>}
              to={fundTransactionsPath("CASH", { fundId: fund.id })}
              className="dropdown-item"
            />
            <MenuDivider />
            <MenuItem
              icon="fas fa-university text-info"
              label={<span>{m("cashToBank")}</span>}
              href={transfer("cashbank", "source")}
              newTab
              className="dropdown-item"
            />
            <MenuItem
              icon="fas fa-random text-warning"
              label={<span>{m("cashToCash")}</span>}
              href={transfer("cashcash", "source")}
              newTab
              className="dropdown-item"
            />
            <MenuItem
              icon="fas fa-arrow-down text-success"
              label={<span>{m("bankToThisCash")}</span>}
              href={transfer("bankcash", "target")}
              newTab
              className="dropdown-item"
            />
            <MenuItem
              icon="fas fa-arrow-down text-warning"
              label={<span>{m("cashToThisCash")}</span>}
              href={transfer("cashcash", "target")}
              newTab
              className="dropdown-item"
            />
            {canPost && (
              <>
                <MenuItem
                  icon="fas fa-cash-register text-secondary"
                  label={<span>{m("payment")}</span>}
                  href={settlementPath("PAYMENT", "CASH", fund.id)}
                  newTab
                  className="dropdown-item"
                />
                <MenuItem
                  icon="fas fa-hand-holding-usd text-success"
                  label={<span>{m("collection")}</span>}
                  href={settlementPath("COLLECTION", "CASH", fund.id)}
                  newTab
                  className="dropdown-item"
                />
              </>
            )}
            <MenuItem
              icon="fas fa-file-alt text-dark"
              label={<span>{m("extract")}</span>}
              href={fundExtractPath("CASH", fund.id)}
              newTab
              className="dropdown-item"
            />
            {canManage && (
              <>
                <MenuDivider />
                <MenuItem
                  icon="fas fa-edit text-warning"
                  label={<span>{m("edit")}</span>}
                  to={cashEditPath(fund.id)}
                  className="dropdown-item"
                />
                <MenuItem
                  icon="fas fa-trash-alt"
                  label={<span>{m("delete")}</span>}
                  className="dropdown-item text-danger"
                  onSelect={() => onDelete(card)}
                />
              </>
            )}
          </ZtoMenuButton>
        </div>
      </div>
    </div>
  );
}
