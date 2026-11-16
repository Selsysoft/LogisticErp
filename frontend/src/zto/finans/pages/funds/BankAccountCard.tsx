import { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ZtoTooltip, formatN2 } from "../../../components";
import {
  bankDetailPath,
  bankEditPath,
  checksPath,
  fundExtractPath,
  fundTransactionsPath,
  transferCenterPath,
  type TransferTypeParam,
} from "../../navItems";
import {
  MenuDivider,
  MenuItem,
  PhaseButton,
  PhaseMenuItem,
  ZtoMenuButton,
} from "../accounts/AccountsMenu";
import { FundSparkline } from "./FundSparkline";
import { Marked } from "./FundListParts";
import { accountTypeMeta, balanceClass, settlementPath, type FundCard } from "./fundsLogic";

const BTN: CSSProperties = {
  borderRadius: 6,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 10,
};
const DIVIDER: CSSProperties = { width: 1, height: 50, background: "#dee2e6" };
const ROW_GAP: CSSProperties = { gap: 15 };
const PASSIVE: CSSProperties = { opacity: 0.6 };
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
const INFO_LINK: CSSProperties = { color: "inherit", textDecoration: "none" };
const PURPLE: CSSProperties = {
  ...BTN,
  background: "#8b5cf6",
  borderColor: "#8b5cf6",
  color: "white",
};

export type BankAccountCardProps = {
  card: FundCard;
  /** Bakiye çubuğu yüzdesi (aynı grup + para birimi). */
  pct: number;
  words: readonly string[];
  deltas: readonly number[] | null;
  canManage: boolean;
  canPost: boolean;
  multiCompany: boolean;
  onDelete: (card: FundCard) => void;
};

/**
 * Banka hesabı kartı (ZTO _AccountCardsListPartial.cshtml:40-350; 12.2 §5.5 madde 8). Pasif hesap
 * gri + "Pasif" rozeti (Blackrose eki, OK-12.2-9). Kart tıklanabilir alanı `<a>` (yeni sekme,
 * `rel="noopener"`; MWG — `div onClick` değil). ⋮ menüsü ZtoMenuButton (12.1 ortak menüsü; klavye
 * ok tuşları, Esc odağı tetikleyiciye döndürür).
 */
export function BankAccountCard({
  card,
  pct,
  words,
  deltas,
  canManage,
  canPost,
  multiCompany,
  onDelete,
}: BankAccountCardProps) {
  const { t } = useTranslation("ztoFinans");
  const { t: tc } = useTranslation();
  const fund = card.fund;
  const type = fund.accountType ?? "DEMAND";
  const meta = accountTypeMeta(type);
  const demand = type === "DEMAND";
  const credit = type === "CREDIT";
  const m = (key: string) => t(`funds.card.menu.${key}`);
  const transfer = (transferType: TransferTypeParam, role: "source" | "target") =>
    transferCenterPath(
      role === "source"
        ? { tab: "new", transferType, sourceFundId: fund.id, sourceBranchId: fund.branchId }
        : { tab: "new", transferType, targetFundId: fund.id, targetBranchId: fund.branchId },
    );
  const iconBox: CSSProperties = {
    width: 30,
    height: 30,
    borderRadius: 10,
    background: `linear-gradient(135deg, ${meta.color}, ${meta.color}dd)`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 15,
  };
  const symbol = card.symbol;
  const typeDisplay = t(`funds.common.accountTypeDisplay.${type}`);
  const newTab = tc("common.a11y.opensInNewTab");

  return (
    <div
      className={`account-card type-${meta.slug}`}
      style={fund.active ? undefined : PASSIVE}
      data-definition-id={fund.id}
      data-bank-name={card.chipKey}
      data-workplace-name={card.workPlaceName || t("funds.common.undefined")}
      data-currency-symbol={symbol}
      data-acc-type={type}
      data-balance={String(fund.currentBalance)}
    >
      <div className="account-progress-bar" style={{ width: `${pct.toFixed(2)}%` }} />
      <div className="d-flex align-items-center">
        <div style={iconBox} aria-hidden="true">
          <i className={`fas ${meta.icon} text-white`} />
        </div>
        <a
          className="account-info account-info-clickable"
          data-bank-id={fund.id}
          title={t("funds.card.goTransactions")}
          href={fundTransactionsPath("BANK", { fundId: fund.id })}
          target="_blank"
          rel="noopener noreferrer"
          style={INFO_LINK}
        >
          <div className="account-name">
            <Marked text={fund.name} words={words} />
            {fund.bankBranchName && (
              <span className="text-muted">
                {" "}
                - <Marked text={fund.bankBranchName} words={words} />
              </span>
            )}
            {!fund.active && (
              <span className="badge badge-secondary ml-1">{t("funds.common.passive")}</span>
            )}
            <span className="sr-only"> {newTab}</span>
          </div>
          <div className="account-details">
            <span className="mr-3">
              <i className="fas fa-hashtag" aria-hidden="true" />{" "}
              <Marked text={fund.code} words={words} />
            </span>
            {fund.iban && (
              <span className="mr-3">
                <i className="fas fa-credit-card" aria-hidden="true" />{" "}
                <Marked text={fund.iban} words={words} />
              </span>
            )}
            <span className="mr-3">
              <i className="fas fa-coins" aria-hidden="true" /> {symbol}
            </span>
            {card.workPlaceName && (
              <span>
                <i className="fas fa-building" aria-hidden="true" />{" "}
                <Marked text={card.workPlaceName} words={words} />
              </span>
            )}
            {multiCompany && card.companyName && (
              <span className="ml-3">
                <i className="fas fa-landmark" aria-hidden="true" />{" "}
                <Marked text={card.companyName} words={words} />
              </span>
            )}
          </div>
        </a>
      </div>

      <div className="d-flex align-items-center" style={ROW_GAP}>
        <FundSparkline fundId={fund.id} current={fund.currentBalance} deltas={deltas} />
        <div className="account-balance">
          <div className={`balance-value ${balanceClass(fund)}`}>
            {formatN2(fund.currentBalance)} {symbol}
          </div>
          <div className="balance-label">
            {credit ? t("funds.card.debtBalance") : t("funds.card.currentBalance")}
          </div>
          {demand && (
            <div className="balance-label" style={SMALL_LABEL}>
              {t("funds.card.periodOpening")} {formatN2(fund.openingBalance)} {symbol}
            </div>
          )}
          {fund.futureCount > 0 && (
            <ZtoTooltip
              content={`${t("funds.card.futureTitleBank")} ${t("funds.card.futureNet", {
                amount: `${formatN2(fund.futureNet)} ${symbol}`,
              })}`}
            >
              <div className="balance-label mt-1" style={FUTURE} tabIndex={0}>
                <i className="fas fa-clock" aria-hidden="true" />{" "}
                {t("funds.card.future", { count: fund.futureCount })} ({formatN2(fund.futureNet)}{" "}
                {symbol})
              </div>
            </ZtoTooltip>
          )}
        </div>

        <div style={DIVIDER} />

        <Link
          to={fundTransactionsPath("BANK", { fundId: fund.id })}
          className="btn btn-sm btn-primary"
          title={t("funds.card.transactionsTitle")}
          style={BTN}
        >
          <i className="fas fa-exchange-alt mr-1" aria-hidden="true" />{" "}
          {t("funds.card.transactions")}
        </Link>

        {demand && (
          <>
            <div style={DIVIDER} />
            <PhaseButton
              step="12.4"
              className="btn btn-sm btn-info"
              style={BTN}
              title={t("funds.card.planTitle")}
            >
              <i className="fas fa-file-invoice-dollar mr-1" aria-hidden="true" />{" "}
              {t("funds.card.plan")}
            </PhaseButton>
            {canPost && (
              <>
                <div style={DIVIDER} />
                <a
                  href={settlementPath("PAYMENT", "BANK", fund.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-warning"
                  title={m("payment")}
                  style={BTN}
                >
                  <i className="fas fa-university mr-1" aria-hidden="true" />{" "}
                  {t("funds.card.payment")}
                  <span className="sr-only"> {newTab}</span>
                </a>
                <div style={DIVIDER} />
                <a
                  href={settlementPath("COLLECTION", "BANK", fund.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-success"
                  title={m("collection")}
                  style={BTN}
                >
                  <i className="fas fa-hand-holding-usd mr-1" aria-hidden="true" />{" "}
                  {t("funds.card.collection")}
                  <span className="sr-only"> {newTab}</span>
                </a>
              </>
            )}
          </>
        )}
        {credit && (
          <>
            <div style={DIVIDER} />
            <PhaseButton
              step="12.5"
              className="btn btn-sm btn-warning quick-action-btn"
              style={BTN}
              title={t("funds.card.creditTitle")}
            >
              <i className="fas fa-hand-holding-usd mr-1" aria-hidden="true" />{" "}
              {t("funds.card.credit")}
            </PhaseButton>
          </>
        )}
        {type === "DEPOSIT" && (
          <>
            <div style={DIVIDER} />
            <PhaseButton
              step="12.6"
              className="btn btn-sm btn-success quick-action-btn"
              style={BTN}
              title={m("deposits")}
            >
              <i className="fas fa-piggy-bank mr-1" aria-hidden="true" /> {t("funds.card.deposit")}
            </PhaseButton>
          </>
        )}
        {type === "INVESTMENT" && (
          <>
            <div style={DIVIDER} />
            <ZtoTooltip content={t("funds.common.outOfScope")}>
              <button
                type="button"
                className="btn btn-sm btn-purple quick-action-btn"
                style={PURPLE}
                aria-disabled="true"
                title={m("investments")}
              >
                <i className="fas fa-chart-line mr-1" aria-hidden="true" />{" "}
                {t("funds.card.investment")}
                <span className="sr-only"> ({t("funds.common.outOfScope")})</span>
              </button>
            </ZtoTooltip>
          </>
        )}

        <div style={DIVIDER} />
        <Link
          to={bankDetailPath(fund.id)}
          className="btn btn-sm btn-primary"
          title={t("funds.card.detail")}
          style={BTN}
        >
          <i className="fas fa-eye mr-1" aria-hidden="true" /> {t("funds.card.detail")}
        </Link>
        <div style={DIVIDER} />

        <div className="account-actions">
          <ZtoMenuButton
            buttonClassName="btn btn-sm btn-outline-secondary dropdown-toggle mr-2"
            label={<i className="fas fa-ellipsis-v" aria-hidden="true" />}
            ariaLabel={t("funds.card.actions", { name: fund.name })}
            menuClassName="dropdown-menu dropdown-menu-right"
            align="right"
          >
            <MenuItem
              icon="fas fa-eye text-info"
              label={<span>{m("detail")}</span>}
              to={bankDetailPath(fund.id)}
              className="dropdown-item"
            />
            <MenuItem
              icon="fas fa-exchange-alt text-primary"
              label={<span>{m("bankTransactions")}</span>}
              to={fundTransactionsPath("BANK", { fundId: fund.id })}
              className="dropdown-item"
            />
            {demand ? (
              <>
                <MenuDivider />
                <PhaseMenuItem
                  icon="fas fa-file-invoice-dollar text-success"
                  label={<span>{m("plan")}</span>}
                  step="12.4"
                  className="dropdown-item"
                />
                <MenuDivider />
                <MenuItem
                  icon="fas fa-exchange-alt text-primary"
                  label={<span>{m("virement")}</span>}
                  href={transfer("virman", "source")}
                  newTab
                  className="dropdown-item"
                />
                <MenuItem
                  icon="fas fa-paper-plane text-info"
                  label={<span>{m("eftSend")}</span>}
                  href={transfer("eft", "source")}
                  newTab
                  className="dropdown-item"
                />
                <MenuItem
                  icon="fas fa-random text-secondary"
                  label={<span>{m("wireSend")}</span>}
                  href={transfer("havale", "source")}
                  newTab
                  className="dropdown-item"
                />
                <MenuItem
                  icon="fas fa-arrow-down text-success"
                  label={<span>{m("eftReceive")}</span>}
                  href={transfer("eft", "target")}
                  newTab
                  className="dropdown-item"
                />
                <MenuItem
                  icon="fas fa-arrow-down text-secondary"
                  label={<span>{m("wireReceive")}</span>}
                  href={transfer("havale", "target")}
                  newTab
                  className="dropdown-item"
                />
                <MenuItem
                  icon="fas fa-coins text-warning"
                  label={<span>{m("fx")}</span>}
                  href={transfer("exchange", "source")}
                  newTab
                  className="dropdown-item"
                />
                <MenuItem
                  icon="fas fa-piggy-bank text-success"
                  label={<span>{m("bankToCash")}</span>}
                  href={transfer("bankcash", "source")}
                  newTab
                  className="dropdown-item"
                />
                <MenuItem
                  icon="fas fa-university text-info"
                  label={<span>{m("cashToThisBank")}</span>}
                  href={transfer("cashbank", "target")}
                  newTab
                  className="dropdown-item"
                />
                <MenuDivider />
                {canPost && (
                  <>
                    <MenuItem
                      icon="fas fa-university text-secondary"
                      label={<span>{m("payment")}</span>}
                      href={settlementPath("PAYMENT", "BANK", fund.id)}
                      newTab
                      className="dropdown-item"
                    />
                    <MenuItem
                      icon="fas fa-hand-holding-usd text-success"
                      label={<span>{m("collection")}</span>}
                      href={settlementPath("COLLECTION", "BANK", fund.id)}
                      newTab
                      className="dropdown-item"
                    />
                    <MenuItem
                      icon="fas fa-money-check text-warning"
                      label={<span>{m("checkPayment")}</span>}
                      href={checksPath({
                        bankId: fund.id,
                        workPlaceId: fund.branchId,
                        currencyId: fund.currency,
                        openCheckPaymentModal: true,
                      })}
                      newTab
                      className="dropdown-item"
                    />
                  </>
                )}
                <MenuDivider />
                <MenuItem
                  icon="fas fa-file-alt text-dark"
                  label={<span>{m("extract")}</span>}
                  href={fundExtractPath("BANK", fund.id)}
                  newTab
                  className="dropdown-item"
                />
                {canManage && (
                  <>
                    <MenuItem
                      icon="fas fa-edit text-warning"
                      label={<span>{m("edit")}</span>}
                      to={bankEditPath(fund.id)}
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
              </>
            ) : (
              <>
                <MenuDivider />
                {credit && (
                  <PhaseMenuItem
                    icon="fas fa-hand-holding-usd text-warning"
                    label={<span>{m("creditDetail")}</span>}
                    step="12.5"
                    className="dropdown-item"
                  />
                )}
                {type === "DEPOSIT" && (
                  <PhaseMenuItem
                    icon="fas fa-piggy-bank text-success"
                    label={<span>{m("deposits")}</span>}
                    step="12.6"
                    className="dropdown-item"
                  />
                )}
                {type === "INVESTMENT" && (
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    className="dropdown-item disabled"
                    aria-disabled="true"
                    title={t("funds.common.outOfScope")}
                  >
                    <i className="fas fa-chart-line text-purple" aria-hidden="true" />{" "}
                    <span>{m("investments")}</span>
                    <span className="sr-only"> ({t("funds.common.outOfScope")})</span>
                  </button>
                )}
                <MenuDivider />
                <MenuItem
                  icon="fas fa-file-alt text-dark"
                  label={<span>{m("extract")}</span>}
                  href={fundExtractPath("BANK", fund.id)}
                  newTab
                  className="dropdown-item"
                />
                {canManage && (
                  <>
                    <MenuItem
                      icon="fas fa-edit text-warning"
                      label={<span>{m("edit")}</span>}
                      to={bankEditPath(fund.id)}
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
                <MenuDivider />
                <span className="dropdown-item text-muted" style={NOTE}>
                  <i className="fas fa-lock" aria-hidden="true" />
                  <span>{t("funds.card.menu.managedNote", { type: typeDisplay })}</span>
                </span>
              </>
            )}
          </ZtoMenuButton>
        </div>
      </div>
    </div>
  );
}

const NOTE: CSSProperties = { fontSize: 10, pointerEvents: "none" };
