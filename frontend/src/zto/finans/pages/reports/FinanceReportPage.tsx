import { useQuery } from "@tanstack/react-query";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError, apiBlobUrl, apiGet } from "../../../../api/client";
import { hasPermission, useAuthStore } from "../../../../auth/authStore";
import { useActiveCompanyId } from "../../../../auth/companyStore";
import {
  statementQuery,
  useAccount,
  useAccountGroups,
  useDocumentTypes,
} from "../../../../pages/finance/accountApi";
import { useBranches, useCurrencies, useMultiCompany } from "../../../../pages/finance/common";
import {
  useAccountMethods,
  useLedgerAccounts,
  useLedgerSummary,
} from "../../../../pages/finance/reportApi";
import type { ReportType, Statement, StatementLine } from "../../../../pages/finance/types";
import { useCompany } from "../../../../pages/organization/api";
import { mapInChunks } from "../../../a11y/yieldToMain";
import { useBranchTree } from "../../../branch/branchTree";
import { exportExcelWorkbook } from "../../../export";
import { currencySymbol, formatDateTime } from "../../../format";
import { useZtoSnackbar } from "../../../components/ZtoSnackbar";
import { financeReportPath, statementPath, type FinanceReportQuery } from "../../navItems";
import { formatIsoDate, localToday } from "../../reports/reportDates";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { FinanceReportList } from "./FinanceReportList";
import { FinanceReportOverview } from "./FinanceReportOverview";
import { FinanceReportStatement } from "./FinanceReportStatement";
import {
  CHUNK_THRESHOLD,
  COMPANY_CONSOLIDATED,
  EXCEL_FILE_NAME,
  RANGE_PRESETS,
  REPORT_TYPES,
  STATEMENT_PAGE_SIZE,
  apiPeriod,
  branchGroupOptions,
  companySelectValue,
  companyUrlValue,
  fetchStatementCapped,
  frMode,
  frQuery,
  isReportType,
  parseFrState,
  reportCompany,
  resolveBranchIds,
  sheetCell,
  sheetNumberFormats,
  sheetRowCount,
  statementBlocks,
  statementPeriod,
  tableToSheet,
  workplaceOptions,
  type FrMode,
  type FrState,
} from "./financeReportLogic";

type Draft = {
  type: string;
  account: string;
  cur: string;
  branchGroupId: string;
  branchId: string;
  company: string;
  from: string;
  to: string;
};

type Chip = { icon: string; text: string };

/** Seçili şirketin logosu (12.1 Ekstre başlığı kaynağı); konsolidede yok. */
function useCompanyLogo(companyId: string | null) {
  const company = useCompany(companyId ?? undefined);
  const [url, setUrl] = useState<string | null>(null);
  const fileId = companyId ? company.data?.logoFileId : null;
  useEffect(() => {
    if (!fileId) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let created: string | null = null;
    apiBlobUrl(`/files/${fileId}/content`)
      .then((value) => {
        created = value;
        if (!cancelled) setUrl(value);
      })
      .catch(() => setUrl(null));
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [fileId]);
  return url;
}

/**
 * Finans Raporları (ZTO FinanceReport/Index + _ReportLayout/_ReportHeader/_ReportFilterBar; 12.8_TASARIM
 * §5.5). Kabuk içi sayfa (OK-12.8-14; yazdırmada kabuk gizlenir). Üç kip tek sayfada: genel bakış
 * (tür × para birimi), liste (cari × şirket × para birimi), cari ekstre. Durum URL'de (`type`,
 * `range`, `from`, `to`, `cur`, `account`, `branchGroupId` = ZTO `bp`, `branchId` = ZTO `wp`,
 * `companyId`); iç bağlantılar tüm süzgeçleri korur. FA6 ikonları FA5 karşılığıyla (Rev 1 FE-FA6-ICONS).
 */
export function FinanceReportPage() {
  useZtoRootClass("zto-page-finance-report");
  const { t } = useTranslation("ztoFinans");
  const { t: tc } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const snackbar = useZtoSnackbar();
  const me = useAuthStore((state) => state.me);
  const canPersonnel = hasPermission(me, "FINANCE_EMPLOYEE_VIEW");
  const multiCompany = useMultiCompany();
  const activeCompanyId = useActiveCompanyId();
  const companies = useMemo(
    () => (me?.companies ?? []).filter((company) => company.active),
    [me?.companies],
  );
  const [today] = useState(() => localToday());
  const rootRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const state = useMemo(
    () => parseFrState(params, today, canPersonnel),
    [params, today, canPersonnel],
  );
  const mode = frMode(state);
  const tree = useBranchTree("mine");
  const scope = resolveBranchIds(state.branchId, state.branchGroupId, tree.data);
  const companyId = reportCompany(state.companyId, multiCompany);
  const effectiveCompanyId = companyId === undefined ? activeCompanyId : companyId;
  const currencies = useCurrencies();
  const period = apiPeriod(state.range);
  const scopeReady = scope.ready && !scope.empty;
  const base = {
    ...period,
    currency: state.cur || undefined,
    companyId,
    branchIds: scope.ids,
  };

  const accounts = useLedgerAccounts(
    { ...base, reportType: (state.type ?? "SALES") as ReportType },
    { enabled: mode === "list" && scopeReady },
  );
  const typeRejected =
    mode === "list" &&
    accounts.error instanceof Error &&
    (accounts.error as ApiError).body?.code === "REPORT_TYPE_NOT_FOUND";
  const effectiveMode: FrMode = typeRejected ? "overview" : mode;
  const summary = useLedgerSummary(base, { enabled: effectiveMode === "overview" && scopeReady });

  // Ekstre kipi: cari kartı, ekstre (en çok 30 × 2000 satır), yöntem kırılımı.
  const statementOn = effectiveMode === "statement" && scopeReady;
  const account = useAccount(statementOn ? state.account : undefined);
  const stmtPeriod = statementPeriod(state.range);
  const statement = useQuery({
    queryKey: [
      "finance",
      "account-statement",
      "finance-report",
      state.account,
      stmtPeriod,
      companyId ?? null,
      effectiveCompanyId,
      scope.ids ?? null,
    ],
    queryFn: () =>
      fetchStatementCapped((page) =>
        apiGet<Statement>(
          statementQuery(
            state.account,
            { ...stmtPeriod, companyId, branchIds: scope.ids },
            page,
            STATEMENT_PAGE_SIZE,
            activeCompanyId,
          ),
        ),
      ),
    enabled: statementOn,
  });
  const methods = useAccountMethods(
    { accountId: state.account, ...period, companyId, branchIds: scope.ids },
    { enabled: statementOn },
  );
  // "Oluşturma" çipi: etkin kipi besleyen sorgunun veri zamanı (ZTO `_ReportHeader` her GET'te sunucu
  // saatini yazar); süzgeç/yenileme sonrası güncellenir, önbellekten gelen veride o verinin zamanı.
  const activeUpdatedAt =
    effectiveMode === "overview"
      ? summary.dataUpdatedAt
      : effectiveMode === "list"
        ? accounts.dataUpdatedAt
        : statement.dataUpdatedAt;
  const generatedAt = useMemo(
    () => (activeUpdatedAt > 0 ? new Date(activeUpdatedAt) : new Date()),
    [activeUpdatedAt],
  );
  const documentTypes = useDocumentTypes();
  const accountGroups = useAccountGroups();
  const branches = useBranches();

  const currencyName = useCallback(
    (code: string) => {
      const name = currencies.data?.find((currency) => currency.code === code)?.name;
      const symbol = currencySymbol(code);
      return name ? `${name} (${symbol})` : symbol;
    },
    [currencies.data],
  );
  const branchName = useCallback(
    (id: string) =>
      branches.data?.find((branch) => branch.id === id)?.name ??
      t("financeReport.statement.unknownWorkplace"),
    [branches.data, t],
  );
  const typeName = useCallback(
    (line: StatementLine) => {
      const code = line.documentType;
      if (!code || code === "SETTLEMENT") return "";
      const named = documentTypes.data?.find((type) => type.code === code)?.name;
      return named ?? tc(`finance.source.${code}`, { defaultValue: "" });
    },
    [documentTypes.data, tc],
  );

  const blocks = useMemo(
    () => (statement.data ? statementBlocks(statement.data.statement, state.cur) : []),
    [statement.data, state.cur],
  );
  const href = (target: { type?: ReportType | null; account?: string | null }) =>
    financeReportPath(frQuery(state, target));
  const accountType = (() => {
    const group = accountGroups.data?.find((g) => g.code === account.data?.subGroup);
    const type = group?.reportType;
    if (isReportType(type) && (type !== "PERSONNEL" || canPersonnel)) return type;
    return state.type;
  })();

  // Başlık ve çipler (ZTO `_ReportHeader`, Index.cshtml:30-78).
  const typeTitle = state.type ? t(`financeReport.types.${state.type}`) : "";
  const subject =
    effectiveMode === "statement"
      ? account.data
        ? t("financeReport.statementTitleOf", { name: account.data.name })
        : t("financeReport.statementTitle")
      : effectiveMode === "list"
        ? typeTitle
        : t("financeReport.overviewTitle");
  const range = state.range;
  const periodLabel = range.isAll
    ? t("financeReport.chips.allTime")
    : range.from === range.to
      ? formatIsoDate(range.to)
      : `${formatIsoDate(range.from)} – ${formatIsoDate(range.to)}`;
  const groupOptions = branchGroupOptions(tree.data);
  const allWorkplaces = workplaceOptions(tree.data, "");
  const companyLabel = (id: string | null) =>
    id
      ? (companies.find((c) => c.id === id)?.shortName ?? `#${id}`)
      : t("financeReport.filter.consolidated");
  const chips: Chip[] = [
    { icon: "far fa-calendar", text: t("financeReport.chips.period", { value: periodLabel }) },
  ];
  if (effectiveMode === "list" && state.type) {
    chips.push({
      icon: "fas fa-layer-group",
      text: t("financeReport.chips.report", { value: typeTitle }),
    });
  }
  if (effectiveMode === "statement" && account.data) {
    chips.push({
      icon: "fas fa-user-tie",
      text: t("financeReport.chips.account", {
        value: `${account.data.code} ${account.data.name}`,
      }),
    });
  }
  if (state.cur) {
    chips.push({
      icon: "fas fa-coins",
      text: t("financeReport.chips.currency", {
        value: currencies.data?.find((c) => c.code === state.cur)?.name ?? state.cur,
      }),
    });
  }
  if (state.branchGroupId) {
    chips.push({
      icon: "fas fa-sitemap",
      text: t("financeReport.chips.branchGroup", {
        value:
          groupOptions.find((o) => o.value === state.branchGroupId)?.label ??
          `#${state.branchGroupId}`,
      }),
    });
  }
  if (state.branchId) {
    chips.push({
      icon: "fas fa-building",
      text: t("financeReport.chips.workplace", {
        value: allWorkplaces.find((o) => o.value === state.branchId)?.label ?? `#${state.branchId}`,
      }),
    });
  }
  if (multiCompany) {
    chips.push({
      icon: "fas fa-building",
      text: t("financeReport.chips.company", { value: companyLabel(effectiveCompanyId) }),
    });
  }
  if (me?.branchScope === "LIMITED") {
    chips.push({ icon: "fas fa-filter", text: t("financeReport.chips.scoped") });
  }
  chips.push({
    icon: "far fa-clock",
    text: t("financeReport.chips.generated", { value: formatDateTime(generatedAt) }),
  });
  const logoUrl = useCompanyLogo(effectiveCompanyId);

  const hasContent =
    effectiveMode === "overview"
      ? !!summary.data
      : effectiveMode === "list"
        ? (accounts.data?.rows.length ?? 0) > 0
        : !!account.data && blocks.length > 0;

  // "Cari" seçenekleri: listede görünen satırların carileri; ekstrede o cari (Index.cshtml:80-83).
  const accountOptions = useMemo(() => {
    if (effectiveMode === "statement") {
      return [
        {
          value: state.account,
          label: account.data ? `${account.data.code} ${account.data.name}` : state.account,
        },
      ];
    }
    if (effectiveMode !== "list") return [];
    const seen = new Map<string, string>();
    for (const row of accounts.data?.rows ?? []) {
      if (!seen.has(row.accountId))
        seen.set(row.accountId, `${row.accountCode} ${row.accountName}`);
    }
    const collator = new Intl.Collator("tr");
    return [...seen]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => collator.compare(a.label, b.label));
  }, [effectiveMode, state.account, account.data, accounts.data]);

  const onExcel = async () => {
    const root = rootRef.current;
    if (!root || exporting) return;
    setExporting(true);
    try {
      const tables = Array.from(root.querySelectorAll<HTMLTableElement>("table[data-fr-sheet]"));
      const sheets = tables.map(tableToSheet);
      // 500+ satırda hücre dönüşümü 50 ms bütçeli parçalarla (MWG break-up-long-tasks).
      const chunked = sheetRowCount(sheets) >= CHUNK_THRESHOLD;
      const workbookSheets = [];
      for (const sheet of sheets) {
        const rows = chunked
          ? await mapInChunks(sheet.rows, (row) => row.map(sheetCell))
          : sheet.rows.map((row) => row.map(sheetCell));
        workbookSheets.push({
          name: sheet.name,
          headers: sheet.headers,
          rows,
          numberFormats: sheetNumberFormats(sheet),
        });
      }
      await exportExcelWorkbook({ fileName: EXCEL_FILE_NAME, sheets: workbookSheets });
    } catch {
      snackbar.show(t("financeReport.actions.excelFailed"), "error");
    } finally {
      setExporting(false);
    }
  };

  const loading =
    !scope.ready ||
    (effectiveMode === "overview" && summary.isPending && scopeReady) ||
    (effectiveMode === "list" && accounts.isPending && scopeReady) ||
    (effectiveMode === "statement" && (account.isPending || statement.isPending) && scopeReady);
  const queryError =
    effectiveMode === "overview"
      ? summary.error
      : effectiveMode === "list"
        ? accounts.error
        : statement.error;

  let content: ReactNode = null;
  if (loading) {
    content = <p className="rp-note">{t("financeReport.notices.loading")}</p>;
  } else if (effectiveMode === "statement") {
    if (account.isError || !account.data) {
      content = (
        <div className="rp-card rp-empty">
          <h2>{t("financeReport.statement.notFound")}</h2>
        </div>
      );
    } else if (queryError) {
      content = <ErrorNotice message={queryError.message} />;
    } else {
      content = (
        <FinanceReportStatement
          account={account.data}
          blocks={blocks}
          truncated={statement.data?.truncated ?? false}
          methods={methods.data ?? []}
          backHref={accountType ? href({ type: accountType }) : null}
          legacyHref={statementPath(account.data.id)}
          openingDate={range.isAll ? null : range.from}
          branchName={branchName}
          typeName={typeName}
          currencyName={currencyName}
        />
      );
    }
  } else if (queryError) {
    content = <ErrorNotice message={queryError.message} />;
  } else if (effectiveMode === "list") {
    content =
      accounts.data || scope.empty ? (
        <FinanceReportList
          key={params.toString()}
          data={
            accounts.data ?? {
              reportType: state.type ?? "",
              side: "RECEIVABLE",
              from: null,
              to: range.to,
              postPeriodCount: 0,
              rows: [],
            }
          }
          typeTitle={typeTitle}
          today={today}
          showCompany={multiCompany && effectiveCompanyId === null}
          accountHref={(id) => href({ type: state.type, account: id })}
          currencyName={currencyName}
        />
      ) : null;
  } else {
    content = (
      <FinanceReportOverview
        rows={summary.data?.rows ?? []}
        showPersonnel={canPersonnel && !(summary.data?.personnelHidden ?? true)}
        typeHref={(type) => href({ type })}
        currencyName={currencyName}
      />
    );
  }

  return (
    <div className="rp-page" ref={rootRef}>
      <div className="rp-wrap fr-page" data-fr-mode={effectiveMode}>
        <div className="rp-card rp-head">
          {logoUrl && <img className="rp-logo" src={logoUrl} alt="" />}
          <div className="rp-head-text">
            <h1>{subject}</h1>
            <div className="rp-chips" id="frChips">
              {chips.map((chip) => (
                <span key={chip.text} className="rp-chip">
                  <i className={chip.icon} aria-hidden="true" />
                  {chip.text}
                </span>
              ))}
            </div>
          </div>
          {hasContent && (
            <div className="rp-actions">
              <button
                type="button"
                className="rp-btn"
                id="frExcel"
                onClick={() => void onExcel()}
                aria-busy={exporting}
              >
                <i className="fas fa-file-excel" aria-hidden="true" />{" "}
                {t("financeReport.actions.excel")}
              </button>
              <button type="button" className="rp-btn" id="frPrint" onClick={() => window.print()}>
                <i className="fas fa-print" aria-hidden="true" /> {t("financeReport.actions.print")}
              </button>
            </div>
          )}
        </div>
        <FilterBar
          key={params.toString()}
          state={state}
          canPersonnel={canPersonnel}
          multiCompany={multiCompany}
          activeCompanyId={activeCompanyId}
          companies={companies}
          currencies={currencies.data ?? []}
          groupOptions={groupOptions}
          tree={tree.data}
          accountOptions={accountOptions}
          onApply={(query) => navigate(financeReportPath(query))}
        />
        {(state.invalidType || typeRejected) && (
          <div className="rp-notice">
            <i className="fas fa-info-circle" aria-hidden="true" />{" "}
            {t("financeReport.notices.invalidType")}
          </div>
        )}
        {state.range.invalid && (
          <div className="rp-notice">
            <i className="fas fa-info-circle" aria-hidden="true" />{" "}
            {t("financeReport.notices.invalidDate")}
          </div>
        )}
        {content}
      </div>
    </div>
  );
}

function ErrorNotice({ message }: { message: string }) {
  const { t } = useTranslation("ztoFinans");
  return (
    <div className="rp-notice bad" role="alert">
      <i className="fas fa-exclamation-triangle" aria-hidden="true" />{" "}
      {t("financeReport.notices.error", { message })}
    </div>
  );
}

type FilterBarProps = {
  state: FrState;
  canPersonnel: boolean;
  multiCompany: boolean;
  activeCompanyId: string | null;
  companies: ReadonlyArray<{ id: string; shortName: string }>;
  currencies: ReadonlyArray<{ code: string; name: string }>;
  groupOptions: ReadonlyArray<{ value: string; label: string }>;
  tree: Parameters<typeof workplaceOptions>[0];
  accountOptions: ReadonlyArray<{ value: string; label: string }>;
  onApply: (query: FinanceReportQuery) => void;
};

/**
 * Süzgeç çubuğu (ZTO `_ReportFilterBar.cshtml`): ilk öğe gizli submit (Enter = Filtrele), hazır aralık
 * düğmeleri `name=range` (öncelikli; tarih kutularındaki değişiklik gönderilir ama düğme aralığı
 * kazanır), tarih kutuları, seçiciler (Rapor türü, Cari, Para birimi, Şube, İş yeri, Blackrose eki
 * Şirket), Filtrele + Sıfırla. Şube seçimi iş yeri seçeneklerini süzer.
 */
function FilterBar(props: FilterBarProps) {
  const { t } = useTranslation("ztoFinans");
  const { state } = props;
  const pendingRange = useRef<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => ({
    type: state.type ?? "",
    account: state.account,
    cur: state.cur,
    branchGroupId: state.branchGroupId,
    branchId: state.branchId,
    company: companySelectValue(state.companyId, props.activeCompanyId),
    from: state.range.isAll ? "" : (state.range.from ?? ""),
    to: state.range.isAll ? "" : state.range.to,
  }));
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const workplaces = workplaceOptions(props.tree, draft.branchGroupId);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const range = pendingRange.current;
    pendingRange.current = null;
    props.onApply({
      type: isReportType(draft.type) ? draft.type : undefined,
      range: range ? (range as FinanceReportQuery["range"]) : undefined,
      from: range ? undefined : draft.from || undefined,
      to: range ? undefined : draft.to || undefined,
      cur: draft.cur || undefined,
      account: draft.account || undefined,
      branchGroupId: draft.branchGroupId || undefined,
      branchId: draft.branchId || undefined,
      companyId: props.multiCompany
        ? companyUrlValue(draft.company, props.activeCompanyId) || undefined
        : undefined,
    });
  };

  const types = REPORT_TYPES.filter((type) => type !== "PERSONNEL" || props.canPersonnel);

  return (
    <form className="rp-card rp-filter-card" id="frForm" onSubmit={onSubmit} noValidate>
      <button type="submit" className="rp-hidden-submit" tabIndex={-1} aria-hidden="true" />
      <div className="rp-filter">
        <div
          className="rp-presets"
          role="group"
          aria-label={t("financeReport.filter.presetsLabel")}
        >
          {RANGE_PRESETS.map((preset) => {
            const active = state.range.preset === preset;
            return (
              <button
                key={preset}
                type="submit"
                name="range"
                value={preset}
                className={`rp-btn rp-preset${active ? " active" : ""}`}
                aria-pressed={active}
                onClick={() => {
                  pendingRange.current = preset;
                }}
              >
                {t(`financeReport.filter.presets.${preset}`)}
              </button>
            );
          })}
        </div>
        <div className="rp-fields">
          <div className="rp-field">
            <label htmlFor="frFrom">{t("financeReport.filter.from")}</label>
            <input
              type="date"
              id="frFrom"
              name="from"
              value={draft.from}
              onChange={(event) => set({ from: event.target.value })}
            />
          </div>
          <div className="rp-field">
            <label htmlFor="frTo">{t("financeReport.filter.to")}</label>
            <input
              type="date"
              id="frTo"
              name="to"
              value={draft.to}
              onChange={(event) => set({ to: event.target.value })}
            />
          </div>
          <div className="rp-field">
            <label htmlFor="frtype">{t("financeReport.filter.type")}</label>
            <select
              id="frtype"
              name="type"
              value={draft.type}
              onChange={(event) => set({ type: event.target.value })}
            >
              <option value="">{t("financeReport.filter.typeAll")}</option>
              {types.map((type) => (
                <option key={type} value={type}>
                  {t(`financeReport.types.${type}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="rp-field">
            <label htmlFor="fraccount">{t("financeReport.filter.account")}</label>
            <select
              id="fraccount"
              name="account"
              value={draft.account}
              onChange={(event) => set({ account: event.target.value })}
            >
              <option value="">{t("financeReport.filter.all")}</option>
              {props.accountOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="rp-field">
            <label htmlFor="frcur">{t("financeReport.filter.currency")}</label>
            <select
              id="frcur"
              name="cur"
              value={draft.cur}
              onChange={(event) => set({ cur: event.target.value })}
            >
              <option value="">{t("financeReport.filter.all")}</option>
              {props.currencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {`${currency.name} (${currencySymbol(currency.code)})`}
                </option>
              ))}
            </select>
          </div>
          <div className="rp-field">
            <label htmlFor="frbp">{t("financeReport.filter.branchGroup")}</label>
            <select
              id="frbp"
              name="branchGroupId"
              value={draft.branchGroupId}
              onChange={(event) => {
                const branchGroupId = event.target.value;
                const keep = workplaceOptions(props.tree, branchGroupId).some(
                  (option) => option.value === draft.branchId,
                );
                set({ branchGroupId, branchId: keep ? draft.branchId : "" });
              }}
            >
              <option value="">{t("financeReport.filter.all")}</option>
              {props.groupOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="rp-field">
            <label htmlFor="frwp">{t("financeReport.filter.workplace")}</label>
            <select
              id="frwp"
              name="branchId"
              value={draft.branchId}
              onChange={(event) => set({ branchId: event.target.value })}
            >
              <option value="">{t("financeReport.filter.all")}</option>
              {workplaces.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {props.multiCompany && (
            <div className="rp-field">
              <label htmlFor="frcompanyId">{t("financeReport.filter.company")}</label>
              <select
                id="frcompanyId"
                name="companyId"
                value={draft.company}
                onChange={(event) => set({ company: event.target.value })}
              >
                <option value={COMPANY_CONSOLIDATED}>
                  {t("financeReport.filter.consolidated")}
                </option>
                {props.companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.shortName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="rp-buttons">
            <button type="submit" className="rp-btn primary">
              <i className="fas fa-filter" aria-hidden="true" /> {t("financeReport.filter.apply")}
            </button>
            <Link className="rp-btn" to={financeReportPath()}>
              <i className="fas fa-undo-alt" aria-hidden="true" /> {t("financeReport.filter.reset")}
            </Link>
          </div>
        </div>
      </div>
    </form>
  );
}
