import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAccountList } from "../../../../pages/finance/accountApi";
import { useCompanyName } from "../../../../pages/finance/common";
import {
  allocationWarningText,
  invoiceGapText,
  isMissing,
  settlementErrorKeys,
  type Translate,
} from "../../../../pages/finance/settlementWarnings";
import type { SettlementCheck, SettlementType } from "../../../../pages/finance/types";
import { useBranchTree } from "../../../branch/branchTree";
import { ZtoAlert, ZtoSearchableSelect, formatMoney } from "../../../components";
import type { SearchableOption } from "../../../components";
import { ZTO_FINANS_BASE, ZTO_SLUGS } from "../../navItems";

/*
 * Ödeme/tahsilat modallarının ortak parçaları (12.2a_TASARIM §5.7–§5.9): metin kısayolu, cari seçici
 * (ZTO `#CustomerAccountID` + "+"/yenile düğmeleri), 12.2 uyarı satırı, modal içi hata listesi ve
 * modal kapandıktan sonra gösterilen sabit konumlu ZTO bildirimi (MWG persistent-toast-notifications:
 * modal açıkken bildirim yok).
 */

/** `ztoFinans` ad alanı + `settlementModals.` kısayolu + translation (finance.*) çevirisi. */
export function useModalText() {
  const { t } = useTranslation("ztoFinans");
  const { t: tr, i18n } = useTranslation();
  const tm = useCallback(
    (key: string, values?: Record<string, string | number>) =>
      t(`settlementModals.${key}`, values ?? {}),
    [t],
  );
  /**
   * `finance.error.<KOD>[_<NEDEN>][_<TÜR>]` adaylarından ilk bulunan yerel ileti (`settlementErrorKeys`,
   * en özelden genele — zto-onyuz:F5), hiçbiri yoksa sunucu iletisi (§3.12 son satır).
   */
  const errorMessage = useCallback(
    (
      code: string | null,
      fallback: string,
      opts?: { type?: SettlementType | null; reason?: string | null },
    ) => {
      if (!code) return fallback;
      const key = settlementErrorKeys(code, opts?.type, opts?.reason).find((k) => i18n.exists(k));
      return key ? tr(key) : fallback;
    },
    [i18n, tr],
  );
  return { t, tm, tr, errorMessage };
}

/** Şube ağacından iş yerinin şirketi (yoksa null). */
export function useBranchCompany(branchId: string | null | undefined): string | null {
  const tree = useBranchTree();
  return useMemo(() => {
    if (!branchId || !tree.data) return null;
    for (const company of tree.data) {
      for (const group of company.groups) {
        if (group.branches.some((branch) => branch.id === branchId)) return company.companyId;
      }
    }
    return null;
  }, [tree.data, branchId]);
}

/** İş yerinin adı (yoksa ""). */
export function useBranchName(): (branchId: string | null | undefined) => string {
  const tree = useBranchTree();
  return useCallback(
    (branchId) => {
      if (!branchId || !tree.data) return "";
      for (const company of tree.data) {
        for (const group of company.groups) {
          const found = group.branches.find((branch) => branch.id === branchId);
          if (found) return found.name;
        }
      }
      return "";
    },
    [tree.data],
  );
}

// ---------------------------------------------------------------------------------------------
// Bildirim
// ---------------------------------------------------------------------------------------------

export type Notice = { kind: "success" | "warning"; message: string; title?: string };

const FIXED_STYLE = {
  position: "fixed",
  top: 70,
  right: 20,
  zIndex: 99999,
  minWidth: 300,
} as const;
const WARNING_STYLE = {
  ...FIXED_STYLE,
  minWidth: 400,
  maxWidth: 600,
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
} as const;

/** ZTO hata/uyarı bildirimi 5 sn (ZTO hatası (d) düzeltilir), başarı 3 sn. */
export const SUCCESS_HIDE_MS = 3000;
export const WARNING_HIDE_MS = 5000;

/**
 * ZTO `showSuccessMessage` / `showWarningMessage` (pjs:3962-4020): sağ üstte sabit `.alert`. Başarı
 * `ZtoAlert` ile; uyarı ZTO DOM'uyla (ZtoAlert'te uyarı türü yok). Metin düğüm olarak basılır.
 */
export function FixedNotice({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const { tm } = useModalText();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (notice.kind !== "warning") return;
    const timer = setTimeout(() => close.current(), WARNING_HIDE_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  if (notice.kind === "success") {
    return (
      <div style={FIXED_STYLE} className="zto-settlement-notice">
        <ZtoAlert
          variant="success"
          autoHideMs={SUCCESS_HIDE_MS}
          onClose={onClose}
          message={
            <>
              <strong>
                <i className="fas fa-check-circle" aria-hidden="true" /> {tm("shared.success")}
              </strong>{" "}
              {notice.message}
            </>
          }
        />
      </div>
    );
  }
  return (
    <div
      className="alert alert-warning alert-dismissible fade show zto-settlement-notice"
      role="alert"
      style={WARNING_STYLE}
    >
      <div className="d-flex align-items-start">
        <div className="mr-2" style={{ fontSize: 20 }} aria-hidden="true">
          <i className="fas fa-exclamation-triangle" />
        </div>
        <div style={{ flex: 1 }}>
          <strong>{notice.title ?? tm("shared.warning")}</strong>
          <div style={{ fontSize: 13, marginTop: 5 }}>{notice.message}</div>
        </div>
      </div>
      <button type="button" className="close" aria-label={tm("shared.close")} onClick={onClose}>
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// 12.2 uyarı satırı (şirket dağılımı + eksik fatura)
// ---------------------------------------------------------------------------------------------

/**
 * Tutarın altındaki 12.2 uyarı satırları (`settlementWarnings`): CONFIRM `small.text-danger`, INFO ve
 * eksik fatura `small.text-warning`, her biri `role="note"`. Tahsilatta yalnız INFO + eksik fatura.
 * Kap her zaman DOM'dadır (`role="status"`): metin değişince duyurulur.
 */
export function WarningLines({
  type,
  check,
  id,
}: {
  type: SettlementType;
  check: SettlementCheck | null | undefined;
  id: string;
}) {
  const { tr } = useModalText();
  const companyName = useCompanyName();
  const translate: Translate = (key, values) => tr(key, values);
  const money = (amount: number, currency: string) => formatMoney(amount, currency);
  const warnings = (check?.warnings ?? []).filter(
    (warning) => type === "PAYMENT" || warning.severity === "INFO",
  );
  const gaps = (check?.invoiceGaps ?? []).filter(isMissing);
  return (
    <div id={id} role="status" className="settlement-warning-lines">
      {warnings.map((warning) => (
        <small
          key={`${warning.code}-${warning.currency}-${warning.companyId}`}
          role="note"
          className={`d-block ${warning.severity === "CONFIRM" ? "text-danger" : "text-warning"}`}
        >
          {allocationWarningText(warning, companyName, money, translate)}
        </small>
      ))}
      {gaps.map((gap) => (
        <small
          key={`gap-${gap.side}-${gap.currency}-${gap.companyId ?? ""}`}
          role="note"
          className="d-block text-warning"
        >
          {invoiceGapText(gap, money, translate)}
        </small>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Modal içi hata listesi
// ---------------------------------------------------------------------------------------------

/**
 * ZTO doğrulama `.alert` listesi (ZTO `<br>` birleştirmesi yerine `ul`; görünüm aynı satırlar). Her
 * madde `<alan id>-error` kimliğini taşır; alan `aria-describedby` ile ona bağlanır (fieldA11yProps).
 * Sunucu hatası (`server`) başlıklı ve `role="alert"`.
 */
export function ErrorBox({
  items,
  server,
}: {
  items: { id: string; text: string }[];
  server?: { title: string; message: string } | null;
}) {
  if (items.length === 0 && !server) return null;
  return (
    <>
      {server && (
        <div className="alert alert-warning" role="alert">
          <i className="fas fa-exclamation-circle" aria-hidden="true" />{" "}
          <strong>{server.title}</strong>
          <div style={{ fontSize: 13, marginTop: 5 }}>{server.message}</div>
        </div>
      )}
      {items.length > 0 && (
        <div className="alert alert-warning settlement-validation">
          <ul className="mb-0 pl-3">
            {items.map((item) => (
              <li key={`${item.id}-${item.text}`} id={item.id}>
                {item.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Cari seçici (ZTO #CustomerAccountID)
// ---------------------------------------------------------------------------------------------

export type AccountSelectProps = {
  id: string;
  value: string;
  onChange: (accountId: string) => void;
  label: string;
  help: string;
  /** Ekle kipinde "+" ve yenile düğmeleri (düzenlemede yok). */
  showActions: boolean;
  /** Listede olmayan (pasif) kaydın carisi. */
  extra?: SearchableOption | null;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
};

/** Cari seçeneği "kod - ad (grup)" (Ödemeler süzgeciyle aynı biçim). */
export function accountOptionLabel(account: {
  code: string;
  name: string;
  subGroupName?: string | null;
}): string {
  return account.subGroupName
    ? `${account.code} - ${account.name} (${account.subGroupName})`
    : `${account.code} - ${account.name}`;
}

export function AccountSelect({
  id,
  value,
  onChange,
  label,
  help,
  showActions,
  extra,
  disabled,
  invalid,
  describedBy,
}: AccountSelectProps) {
  const { tm } = useModalText();
  const accounts = useAccountList({ active: true });
  const options = useMemo(() => {
    const list: SearchableOption[] = (accounts.data ?? []).map((account) => ({
      value: account.id,
      label: accountOptionLabel(account),
    }));
    if (extra && !list.some((option) => option.value === extra.value)) list.unshift(extra);
    return list;
  }, [accounts.data, extra]);
  const labelId = `${id}-label`;
  return (
    <div className="form-group">
      <div className="d-flex align-items-center justify-content-between mb-1">
        <label id={labelId} htmlFor={id} className="required-field mb-0">
          <i className="fas fa-user-tie" aria-hidden="true" /> {label}
        </label>
        {showActions && (
          <div>
            <a
              href={`${ZTO_FINANS_BASE}/${ZTO_SLUGS.newAccount}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline-success btn-sm py-0 px-1"
              title={tm("shared.newAccount")}
              aria-label={tm("shared.newAccount")}
              style={{ fontSize: 11, lineHeight: 1.5 }}
            >
              <i className="fas fa-plus" aria-hidden="true" />
            </a>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm py-0 px-1 ml-1 btn-refresh-customer-accounts"
              title={tm("shared.refreshAccounts")}
              aria-label={tm("shared.refreshAccounts")}
              style={{ fontSize: 11, lineHeight: 1.5 }}
              onClick={() => void accounts.refetch()}
            >
              <i
                className={`fas fa-sync-alt${accounts.isFetching ? " fa-spin" : ""}`}
                aria-hidden="true"
              />
            </button>
          </div>
        )}
      </div>
      <ZtoSearchableSelect
        id={id}
        ariaLabelledBy={describedBy ? `${labelId} ${describedBy}` : labelId}
        value={value}
        onChange={onChange}
        options={options}
        placeholder={tm("shared.select")}
        searchPlaceholder={tm("shared.searchAccount")}
        noResultsText={accounts.isFetching ? tm("shared.searching") : tm("shared.noResults")}
        disabled={disabled}
        className={invalid ? "zt-payment-select2 is-invalid" : "zt-payment-select2"}
      />
      <small className="form-text text-muted">{help}</small>
    </div>
  );
}

/** Yardım satırı kısayolu. */
export function Help({ children, icon }: { children: ReactNode; icon?: string }) {
  return (
    <small className="form-text text-muted">
      {icon && (
        <>
          <i className={`fas ${icon}`} aria-hidden="true" />{" "}
        </>
      )}
      {children}
    </small>
  );
}

/** 12.3/12.4 devre dışı alanının görünmez nedeni (görünüm değişmez; MWG §5.9). */
export function PhaseNote({ id, step }: { id: string; step: "12.3" | "12.4" }) {
  const { tm } = useModalText();
  return (
    <small id={id} className="sr-only">
      {tm(step === "12.3" ? "shared.phase123" : "shared.phase124")}
    </small>
  );
}
