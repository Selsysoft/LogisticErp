import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAccountHistory } from "../../../../pages/finance/accountApi";
import type { Account } from "../../../../pages/finance/types";
import { accountEditPath } from "../../navItems";
import { currencySymbol, formatDateTime, formatN2 } from "../../../components";

export type CariSidebarProps = {
  account: Account;
  branchName: string;
  canEdit: boolean;
};

/**
 * Cari Bilgileri kayar paneli (ZTO Transactions.cshtml:121-200 #cariSidebar). Adres satırı `address`
 * doluysa; 12.2'den itibaren detay yanıtında FINANCE_VIEW ile herkese gelir (K-12.2-5; 12.1 OK-38/SEC-11
 * geri alındı, liste yanıtında yine null). Vergi no TCKN ise sunucudan maskeli gelir. ZTO yalnız
 * :hover ile açılır; klavye için sap düğmesi `aria-expanded`, Escape kapatır ve odak sapa döner (MWG).
 */
export function CariSidebar({ account, branchName, canEdit }: CariSidebarProps) {
  const { t } = useTranslation("ztoFinans");
  const [open, setOpen] = useState(false);
  const handleRef = useRef<HTMLButtonElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const history = useAccountHistory(account.id);
  const v = (value: string | null | undefined) => (value && value.trim() !== "" ? value : "-");
  const symbol = currencySymbol(account.defaultCurrency ?? "TRY");

  useEffect(() => {
    if (open) headRef.current?.focus();
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
      handleRef.current?.focus();
    }
  };

  const row = (label: string, value: string) => (
    <div className="cari-row">
      <span className="cari-lbl">{label}</span>
      <span className="cari-val">{value}</span>
    </div>
  );
  const section = (icon: string, label: string) => (
    <div className="cari-sec">
      <i className={icon} aria-hidden="true" /> {label}
    </div>
  );
  const historyText = (history.data ?? [])
    .map(
      (h) =>
        `${formatDateTime(h.at)} ${h.actorEmail ?? ""}: ${h.event}${h.details ? ` — ${h.details}` : ""}`,
    )
    .join("\n");

  return (
    <div id="cariSidebar" className={open ? "cari-open" : undefined} onKeyDown={onKeyDown}>
      <button
        type="button"
        ref={handleRef}
        className="cari-handle"
        title={t("transactions.sidebar.handle")}
        aria-label={t("transactions.sidebar.handle")}
        aria-expanded={open}
        aria-controls="cariSidebarPanel"
        onClick={() => setOpen((o) => !o)}
      >
        <i className="fas fa-address-card" aria-hidden="true" />
      </button>
      <div
        className="cari-panel"
        id="cariSidebarPanel"
        role="region"
        aria-label={t("transactions.sidebar.handle")}
      >
        <div className="cari-panel-head" ref={headRef} tabIndex={-1}>
          <i className="fas fa-user-tie" aria-hidden="true" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="cari-name">{account.name}</div>
            <div className="cari-sub">
              {account.code} · {account.subGroupName}
            </div>
          </div>
          {canEdit && (
            <a
              href={accountEditPath(account.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="cari-edit-btn"
              title={t("transactions.sidebar.edit")}
              aria-label={`${t("transactions.sidebar.edit")} ${t("translation:common.a11y.opensInNewTab")}`}
            >
              <i className="fas fa-edit" aria-hidden="true" />
            </a>
          )}
        </div>
        {section("fas fa-id-card", t("transactions.sidebar.basic"))}
        {row(t("transactions.sidebar.code"), v(account.code))}
        {row(t("transactions.sidebar.group"), v(account.subGroupName))}
        {row(t("transactions.sidebar.branch"), v(branchName))}
        {row(t("transactions.sidebar.phone"), v(account.phone))}
        {section("fas fa-coins", t("transactions.sidebar.tax"))}
        {row(t("transactions.sidebar.taxNumber"), v(account.taxNumber))}
        {row(t("transactions.sidebar.taxOffice"), v(account.taxOffice))}
        {row(
          t("transactions.sidebar.companyType"),
          account.companyType ? t(`translation:finance.companyType.${account.companyType}`) : "-",
        )}
        {row(
          t("transactions.sidebar.currency"),
          account.defaultCurrency ? `${account.defaultCurrency} (${symbol})` : "-",
        )}
        {row(
          t("transactions.sidebar.creditLimit"),
          `${formatN2(account.creditLimit ?? 0)} ${symbol}`,
        )}
        {row(t("transactions.sidebar.riskLimit"), `${formatN2(account.riskLimit ?? 0)} ${symbol}`)}
        {section("fas fa-address-book", t("transactions.sidebar.contact"))}
        {row(t("transactions.sidebar.email"), v(account.email))}
        {row(t("transactions.sidebar.website"), v(account.website))}
        {row(t("transactions.sidebar.contactName"), v(account.contactName))}
        {row(t("transactions.sidebar.contactTitle"), v(account.contactTitle))}
        {row(t("transactions.sidebar.contactMobile"), v(account.contactMobile))}
        {section("fas fa-map-marker-alt", t("transactions.sidebar.address"))}
        {account.address ? row(t("transactions.sidebar.addressLine"), account.address) : null}
        {row(t("transactions.sidebar.city"), v(account.city))}
        {row(t("transactions.sidebar.district"), v(account.district))}
        {row(t("transactions.sidebar.country"), v(account.country))}
        {row(t("transactions.sidebar.postalCode"), v(account.postalCode))}
        {section("fas fa-file-invoice", t("transactions.sidebar.payment"))}
        {row(t("transactions.sidebar.paymentTerms"), v(account.paymentTerms))}
        {row(t("transactions.sidebar.notes"), v(account.notes))}
        {section("fas fa-history", t("transactions.sidebar.record"))}
        {row(t("transactions.sidebar.createdAt"), formatDateTime(account.createdAt) || "-")}
        {row(t("transactions.sidebar.createdBy"), v(account.createdBy))}
        {row(
          t("transactions.sidebar.updatedAt"),
          account.updateCount > 0 ? formatDateTime(account.updatedAt) : "-",
        )}
        {row(
          t("transactions.sidebar.updatedBy"),
          account.updateCount > 0 ? v(account.updatedBy) : "-",
        )}
        {section("fas fa-list-ul", t("transactions.sidebar.history"))}
        <div
          style={{
            maxHeight: 130,
            overflowY: "auto",
            background: "#f8fafc",
            border: "1px solid #eef2f7",
            borderRadius: 8,
            padding: "6px 8px",
            fontSize: 10,
            lineHeight: 1.55,
            color: "#475569",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {historyText || t("transactions.sidebar.historyEmpty")}
        </div>
      </div>
    </div>
  );
}
