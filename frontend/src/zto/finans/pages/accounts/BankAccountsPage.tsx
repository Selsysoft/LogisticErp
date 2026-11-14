import { createColumnHelper } from "@tanstack/react-table";
import { KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import {
  setBankAccountActive,
  useAccount,
  useBankAccount,
  useBankAccounts,
  useFinanceMutation,
} from "../../../../pages/finance/accountApi";
import { useCan } from "../../../../pages/finance/common";
import type { AccountBankAccount } from "../../../../pages/finance/types";
import {
  ZtoDataTable,
  currencySymbol,
  formatDate,
  formatDateTime,
  useZtoConfirm,
  useZtoSnackbar,
} from "../../../components";
import { errorMessage } from "../../../components/definitionLogic";
import {
  ZTO_FINANS_BASE,
  ZTO_SLUGS,
  bankAccountEditPath,
  newBankAccountPath,
} from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { MenuItem, ZtoMenuButton } from "./AccountsMenu";
import { lastFour } from "./bankAccountLogic";

const column = createColumnHelper<AccountBankAccount>();
const COPY_FEEDBACK_MS = 2000;

/** Maskeli IBAN: ekran okuyucu yıldızları değil "IBAN, son dört hane …" okur (§5.9 MWG). */
function MaskedIban({ value }: { value: string | null }) {
  const { t } = useTranslation();
  if (!value) return null;
  return (
    <>
      <span className="sr-only">{t("common.a11y.ibanLast4", { last4: lastFour(value) })}</span>
      <span aria-hidden="true">{value}</span>
    </>
  );
}

type Panel = { kind: "details" | "transactions"; bank: AccountBankAccount } | null;

/**
 * Carinin banka hesapları (ZTO BankAccounts/Index.cshtml; 12.1 §5.9). IBAN ve hesap no maskeli
 * (OK-13); Sil = pasifleştir, "Pasifleri göster" Blackrose eki. Yan paneller ZTO kayar paneli olarak
 * kalır (dialog'a çevrilmez); açılınca odak panel başlığına, kapanınca satırdaki ⋮ düğmesine döner.
 */
export function BankAccountsPage() {
  useZtoRootClass("zto-page-bank-accounts");
  const { id = "" } = useParams();
  const { t } = useTranslation("ztoFinans");
  const canManage = useCan("FINANCE_MANAGE");
  const snackbar = useZtoSnackbar();
  const { confirm, confirmModal } = useZtoConfirm();
  const [showPassive, setShowPassive] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const account = useAccount(id);
  const banks = useBankAccounts(id, showPassive);
  const b = (key: string) => t(`accounts.bank.${key}`);

  const toggle = useFinanceMutation(
    ({ bankId, active }: { bankId: string; active: boolean }) =>
      setBankAccountActive(bankId, active),
    {
      onSuccess: (_data, { active }) =>
        snackbar.show(active ? b("activated") : b("deleted"), "success"),
      onError: (error) =>
        snackbar.show(
          t("accounts.bank.deleteFailed", { message: errorMessage(error, b("loadFailed")) }),
          "error",
        ),
    },
  );
  const { mutate } = toggle;

  const openPanel = (kind: "details" | "transactions", bank: AccountBankAccount) => {
    // Menü öğesi kapanınca DOM'dan çıkar: odak satırdaki ⋮ tetikleyicisine döner (§5.9 MWG).
    const active = document.activeElement as HTMLElement | null;
    returnFocus.current =
      active?.closest(".btn-group")?.querySelector<HTMLElement>('[aria-haspopup="menu"]') ?? active;
    setPanel({ kind, bank });
  };

  const columns = useMemo(() => {
    const c = (key: string) => t(`accounts.bank.columns.${key}`);
    return [
      column.display({
        id: "rowNo",
        header: c("rowNo"),
        cell: ({ row }) => row.index + 1,
      }),
      column.accessor("holderName", {
        header: c("holder"),
        meta: { cellClassName: "accountHolderName" },
        cell: ({ getValue }) => <b>{getValue()}</b>,
      }),
      column.accessor("bankName", { header: c("bankName"), meta: { cellClassName: "bankName" } }),
      column.accessor((row) => row.branchName ?? "", {
        id: "branchName",
        header: c("branchName"),
        meta: { cellClassName: "branchName" },
      }),
      column.accessor((row) => row.accountNumberMasked ?? "", {
        id: "accountNumber",
        header: c("accountNo"),
        meta: { cellClassName: "accountNumber" },
      }),
      column.accessor((row) => row.ibanMasked ?? "", {
        id: "iban",
        header: c("iban"),
        meta: { cellClassName: "iban iban-column" },
        cell: ({ row }) => <MaskedIban value={row.original.ibanMasked} />,
      }),
      column.accessor("accountKind", {
        header: c("kind"),
        meta: {
          cellClassName: "accountType",
          searchValue: (value: string, row: AccountBankAccount) =>
            `${kindText(value, t)} ${categoryText(row.category, t)}`,
        },
        cell: ({ row }) => (
          <div className="d-flex flex-column">
            <span className="badge badge-info">{kindText(row.original.accountKind, t)}</span>
            <small> ({categoryText(row.original.category, t)})</small>
          </div>
        ),
      }),
      column.accessor("currency", {
        header: c("currency"),
        meta: { cellClassName: "currency" },
        cell: ({ getValue }) => currencySymbol(getValue()),
      }),
      column.display({
        id: "accountType",
        header: c("accountType"),
        meta: { cellClassName: "typeAccount" },
        cell: () => (
          <span className="badge badge-secondary">
            {account.data?.subGroupName ?? account.data?.subGroup ?? ""}
          </span>
        ),
      }),
      column.accessor((row) => row.description ?? "", {
        id: "description",
        header: c("description"),
        meta: { cellClassName: "description" },
      }),
      column.accessor((row) => row.openedOn ?? "", {
        id: "openedOn",
        header: c("openedOn"),
        meta: { cellClassName: "accountOpenDate" },
        cell: ({ getValue }) => formatDate(getValue()),
      }),
      column.accessor((row) => row.lastTransactionOn ?? "", {
        id: "lastTransaction",
        header: c("lastTransaction"),
        meta: { cellClassName: "lastTransactionDate" },
        cell: ({ getValue }) => (getValue() ? formatDate(getValue()) : "-"),
      }),
      column.display({
        id: "actions",
        header: c("actions"),
        enableSorting: false,
        meta: { searchable: false },
        cell: ({ row: { original: bank } }) => (
          <ZtoMenuButton
            buttonClassName="btn btn-dark dropdown-toggle"
            buttonStyle={{ fontSize: 10 }}
            ariaLabel={t("accounts.bank.menu", { name: bank.bankName })}
            label={<i className="fas fa-ellipsis-v" aria-hidden="true" />}
            menuClassName="dropdown-menu dropdown-menu-right"
            align="right"
          >
            <MenuItem
              className="dropdown-item"
              style={{ fontSize: 11 }}
              title={b("details")}
              icon="fas fa-info-circle"
              label={b("details")}
              onSelect={() => openPanel("details", bank)}
            />
            <MenuItem
              className="dropdown-item"
              style={{ fontSize: 11 }}
              title={b("transactions")}
              icon="fas fa-exchange-alt"
              label={b("transactions")}
              onSelect={() => openPanel("transactions", bank)}
            />
            {canManage && (
              <MenuItem
                className="dropdown-item"
                style={{ fontSize: 11 }}
                title={b("edit")}
                icon="fas fa-edit"
                label={b("edit")}
                to={bankAccountEditPath(bank.id)}
              />
            )}
            {canManage &&
              (bank.active ? (
                <MenuItem
                  className="dropdown-item"
                  style={{ fontSize: 11 }}
                  title={b("delete")}
                  icon="fas fa-trash-alt"
                  label={b("delete")}
                  onSelect={async () => {
                    const ok = await confirm({
                      title: b("confirmTitle"),
                      message: b("confirmDelete"),
                      note: null,
                      confirmText: b("delete"),
                      cancelText: b("cancel"),
                      variant: "danger",
                    });
                    if (ok) mutate({ bankId: bank.id, active: false });
                  }}
                />
              ) : (
                <MenuItem
                  className="dropdown-item"
                  style={{ fontSize: 11 }}
                  title={b("activate")}
                  icon="fas fa-undo"
                  label={b("activate")}
                  onSelect={() => mutate({ bankId: bank.id, active: true })}
                />
              ))}
          </ZtoMenuButton>
        ),
      }),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- b/openPanel t'den türetilir
  }, [t, account.data, canManage, confirm, mutate]);

  const rows = banks.data ?? [];
  const name = account.data?.name ?? "";
  const group = account.data?.subGroupName ?? account.data?.subGroup ?? "";
  return (
    <>
      <br />
      <div className="col-md-12 ba-page">
        <div className="row">
          <div className="col-xl-12">
            <section className="card custom-card ba-modern-card">
              <header className="card-header custom-card-header ba-modern-head">
                <div className="ba-head-left">
                  <span className="ba-icon" aria-hidden="true">
                    <i className="fas fa-credit-card" />
                  </span>
                  <div className="ba-title">
                    <h6>
                      <b>{name}</b> ({group}) — {b("pageTitle")}{" "}
                      <span className="ba-count">
                        <i className="fas fa-layer-group" aria-hidden="true" />{" "}
                        {t("accounts.bank.count", { n: rows.length })}
                      </span>
                    </h6>
                    <p>{b("lead")}</p>
                  </div>
                </div>
                <div className="ba-actions">
                  <Link
                    to={`${ZTO_FINANS_BASE}/${ZTO_SLUGS.accounts}`}
                    className="ba-btn ba-btn--muted"
                    title={b("backToAccounts")}
                  >
                    <i className="fas fa-arrow-left" aria-hidden="true" /> {b("backToAccounts")}
                  </Link>
                  {canManage && (
                    <Link to={newBankAccountPath(id)} className="ba-btn ba-btn--primary">
                      <i className="fas fa-plus" aria-hidden="true" /> {b("newBank")}
                    </Link>
                  )}
                </div>
              </header>
              <div className="card-body">
                {(banks.isError || account.isError) && (
                  <div className="alert alert-danger" role="alert">
                    {errorMessage(banks.error ?? account.error, b("loadFailed"))}
                  </div>
                )}
                <div className="form-check mb-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="showPassiveBanks"
                    checked={showPassive}
                    onChange={(event) => setShowPassive(event.target.checked)}
                  />
                  <label className="form-check-label" htmlFor="showPassiveBanks">
                    {t("accounts.filters.showPassive")}
                  </label>
                </div>
                <div className="table-responsive">
                  <ZtoDataTable
                    id="dataTable"
                    columns={columns}
                    data={rows}
                    getRowId={(row) => row.id}
                    tableClassName="table table-hover"
                    tableStyle={{ fontSize: 11 }}
                    pageLength={10}
                    processing={banks.isPending}
                    rowClassName={(row) => (row.active ? undefined : "definition-row--inactive")}
                    emptyText={
                      <div className="ba-empty-inner">
                        <i className="fas fa-credit-card fa-3x" aria-hidden="true" />
                        <h5>{b("emptyTitle")}</h5>
                        <p>{b("emptyText")}</p>
                      </div>
                    }
                  />
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      <SidePanel
        id="bankAccountDetailsPanel"
        icon="fa-credit-card"
        title={b("detailsPanel")}
        open={panel?.kind === "details"}
        onClose={() => {
          setPanel(null);
          returnFocus.current?.focus();
        }}
      >
        {panel?.kind === "details" && <BankDetails id={panel.bank.id} canManage={canManage} />}
      </SidePanel>
      <SidePanel
        id="bankAccountTransactionsPanel"
        icon="fa-exchange-alt"
        title={b("transactionsPanel")}
        open={panel?.kind === "transactions"}
        onClose={() => {
          setPanel(null);
          returnFocus.current?.focus();
        }}
      >
        {panel?.kind === "transactions" && (
          <p className="text-muted" style={{ fontSize: 12 }}>
            {b("transactionsLater")}
          </p>
        )}
      </SidePanel>
      {confirmModal}
    </>
  );
}

function kindText(kind: string, t: (key: string, options?: Record<string, unknown>) => string) {
  return t(`finance.bankAccountKind.${kind}`, { ns: "translation", defaultValue: kind });
}

function categoryText(
  category: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return t(`finance.bankAccountCategory.${category}`, {
    ns: "translation",
    defaultValue: category,
  });
}

/** ZTO `.details-panel` kayar paneli; kapalıyken `inert` (odaklanamaz, okunmaz). */
function SidePanel({
  id,
  icon,
  title,
  open,
  onClose,
  children,
}: {
  id: string;
  icon: string;
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation("ztoFinans");
  const ref = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const el = ref.current as (HTMLDivElement & { inert?: boolean }) | null;
    if (el) el.inert = !open;
    if (open) headingRef.current?.focus();
  }, [open]);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  };
  return (
    <div
      ref={ref}
      id={id}
      className={open ? "details-panel open" : "details-panel"}
      role="region"
      aria-labelledby={`${id}-title`}
      aria-hidden={!open}
      onKeyDown={onKeyDown}
    >
      <div className="details-panel-header">
        <h6 id={`${id}-title`} ref={headingRef} tabIndex={-1}>
          <i className={`fas ${icon}`} aria-hidden="true" /> {title}
        </h6>
        <button
          type="button"
          className="close-btn"
          aria-label={t("accounts.bank.close")}
          onClick={onClose}
        >
          &times;
        </button>
      </div>
      <div className="details-panel-body">{children}</div>
    </div>
  );
}

/** Detay paneli: `GET /bank-accounts/{id}`; MANAGE sahibine tam IBAN + Kopyala (MWG copy-button). */
function BankDetails({ id, canManage }: { id: string; canManage: boolean }) {
  const { t } = useTranslation("ztoFinans");
  const detail = useBankAccount(id);
  if (detail.isPending) return <i className="fas fa-spinner fa-spin" aria-hidden="true" />;
  if (detail.isError) {
    return (
      <div className="alert alert-danger" role="alert">
        {errorMessage(detail.error, t("accounts.bank.loadFailed"))}
      </div>
    );
  }
  const bank = detail.data;
  const c = (key: string) => t(`accounts.bank.columns.${key}`);
  const row = (label: string, value: ReactNode) => (
    <>
      <p>
        <strong>{label}:</strong> <span className="detail-value">{value || "-"}</span>
      </p>
      <hr />
    </>
  );
  const fullIban = canManage ? bank.iban : null;
  return (
    <div>
      {row(c("holder"), bank.holderName)}
      {row(c("bankName"), bank.bankName)}
      {row(c("branchName"), bank.branchName)}
      {row(c("accountNo"), (canManage ? bank.accountNumber : null) ?? bank.accountNumberMasked)}
      {row(
        c("iban"),
        fullIban ? (
          <>
            {fullIban} <CopyButton text={fullIban} />
          </>
        ) : (
          <MaskedIban value={bank.ibanMasked} />
        ),
      )}
      {row(c("kind"), `${kindText(bank.accountKind, t)} (${categoryText(bank.category, t)})`)}
      {row(c("currency"), currencySymbol(bank.currency))}
      {row(c("description"), bank.description)}
      {row(c("openedOn"), formatDate(bank.openedOn))}
      {row(c("lastTransaction"), bank.lastTransactionOn ? formatDate(bank.lastTransactionOn) : "-")}
      {row(
        t("accounts.bank.status"),
        t(bank.active ? "accounts.detail.active" : "accounts.detail.passive"),
      )}
      {row(t("accounts.bank.createdAt"), formatDateTime(bank.createdAt))}
    </div>
  );
}

/**
 * IBAN kopyala (MWG copy-button): `type="button"` + `aria-label`; hemen yanında başta boş
 * `role="status"` baloncuk hem görünür hem okunur geri bildirimdir ("Kopyalandı"/"Kopyalanamadı"),
 * 2 sn sonra temizlenir; düğme geri bildirim sırasında devre dışı bırakılmaz. Invoker Commands Baseline
 * "Newly available" olduğundan tıklama dinleyicisi (kılavuzun geri dönüşü).
 */
function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const { t: tz } = useTranslation("ztoFinans");
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const last = useRef("");
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    clearTimeout(timer.current);
    let ok = false;
    try {
      await navigator.clipboard.writeText(text.replace(/\s+/g, ""));
      ok = true;
    } catch {
      ok = false;
    }
    let next = ok ? t("common.a11y.copied") : t("common.a11y.copyFailed");
    // VoiceOver aynı iletiyi ikinci kez okumaz: tekrarında görünmez boşluk eklenir.
    if (next === last.current) next += " ";
    last.current = next;
    setState(ok ? "copied" : "failed");
    setMessage("");
    requestAnimationFrame(() => setMessage(next));
    timer.current = setTimeout(() => {
      setState("idle");
      setMessage("");
    }, COPY_FEEDBACK_MS);
  };
  return (
    <span className="copy" style={{ position: "relative", display: "inline-flex", gap: 4 }}>
      <button
        type="button"
        className={state === "copied" ? "btn btn-sm btn-success" : "btn btn-sm btn-outline-primary"}
        style={{ minInlineSize: 24, minBlockSize: 24, padding: "0 6px", fontSize: 11 }}
        aria-label={t("common.a11y.copyIban")}
        title={tz("accounts.bank.copy")}
        data-copied={state === "copied" ? "" : undefined}
        data-failed={state === "failed" ? "" : undefined}
        onClick={copy}
      >
        <i className={state === "copied" ? "fas fa-check" : "fas fa-copy"} aria-hidden="true" />
      </button>
      <span className="tip small text-muted" role="status">
        {message}
      </span>
    </span>
  );
}
