import { createColumnHelper } from "@tanstack/react-table";
import { ReactNode, Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ZtoBranchMultiSelect,
  ZtoBranchSelect,
  ZtoChartLazy,
  ZtoConfirmModal,
  ZtoDataTable,
  ZtoGroupStatChips,
  ZtoModal,
  ZtoPageHeader,
  ZtoPopover,
  ZtoSelect,
  ZtoTooltip,
  ZTO_DOM,
  buildStatGroups,
  formatDate,
  formatDateTime,
  formatMoney,
  formatN2,
  formatNumber,
  parseTrNumber,
  useZtoConfirm,
} from "../../components";
import {
  buildShowcaseTransactions,
  countByDescription,
  monthlyTotals,
  SHOWCASE_BRANCH_TREE,
  SHOWCASE_SELECT_OPTIONS,
  showcaseWorkPlaceNames,
  type ShowcaseTransaction,
} from "../showcaseData";

const PAGE_STYLE = { paddingLeft: 25 } as const;
const CHART_BOX_STYLE = { height: 280 } as const;

const ICONS = [
  "fas fa-university",
  "fas fa-cash-register",
  "fas fa-hand-holding-usd",
  "fas fa-money-check",
  "fas fa-file-invoice-dollar",
  "fas fa-exchange-alt",
  "fas fa-truck-moving",
  "fas fa-user-tie",
  "fas fa-calendar-day",
  "fas fa-chart-line",
  "far fa-calendar-alt",
  "fas fa-spinner fa-spin",
];

const column = createColumnHelper<ShowcaseTransaction>();

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card mb-4">
      <div className="card-header">
        <i className="fas fa-table mr-1" aria-hidden="true" />
        {title}
      </div>
      <div className="card-body">{children}</div>
    </div>
  );
}

/** Ortak bileşenlerin canlı vitrini; yalnız geliştirme ortamında yönlendirilir (App.tsx). */
export function ShowcasePage() {
  const { t } = useTranslation("ztoFinans");
  const rows = useMemo(() => buildShowcaseTransactions(), []);
  const workPlaces = useMemo(() => showcaseWorkPlaceNames(), []);
  const statGroups = useMemo(
    () => buildStatGroups(workPlaces, (name) => name, t("branch.undefinedGroup")),
    [workPlaces, t],
  );

  const [account, setAccount] = useState("a2");
  const [tab, setTab] = useState(0);
  const [branch, setBranch] = useState("");
  const [liveBranch, setLiveBranch] = useState("");
  const [listValue, setListValue] = useState<string[]>([]);
  const [dropdownValue, setDropdownValue] = useState<string[]>([]);
  const [liveList, setLiveList] = useState<string[]>([]);
  const [chip, setChip] = useState<string | null>(null);
  const [firstModal, setFirstModal] = useState(false);
  const [secondModal, setSecondModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [lastAnswer, setLastAnswer] = useState<string>("");
  const { confirm, confirmModal } = useZtoConfirm();

  const columns = useMemo(
    () => [
      column.accessor("date", {
        header: t("pages.showcase.colDate"),
        cell: (info) => formatDate(info.getValue()),
        meta: { exportValue: (row) => formatDate(row.date) },
      }),
      column.accessor("documentNo", { header: t("pages.showcase.colDocumentNo") }),
      column.accessor("description", { header: t("pages.showcase.colDescription") }),
      column.accessor("debit", {
        header: t("pages.showcase.colDebit"),
        cell: (info) => (info.getValue() ? formatN2(info.getValue()) : ""),
        meta: { className: "text-right", exportValue: (row) => row.debit },
      }),
      column.accessor("credit", {
        header: t("pages.showcase.colCredit"),
        cell: (info) => (info.getValue() ? formatN2(info.getValue()) : ""),
        meta: { className: "text-right", exportValue: (row) => row.credit },
      }),
      column.accessor("balance", {
        header: t("pages.showcase.colBalance"),
        cell: (info) => formatMoney(info.getValue()),
        meta: { className: "text-right font-weight-bold", exportValue: (row) => row.balance },
      }),
    ],
    [t],
  );

  const monthly = useMemo(() => monthlyTotals(rows), [rows]);
  const kinds = useMemo(() => countByDescription(rows), [rows]);
  const filteredRows = chip
    ? rows.filter((_, i) => (workPlaces[i] || t("branch.undefinedGroup")) === chip)
    : rows;

  const askPrimary = async () => {
    const ok = await confirm({ variant: "primary", message: t("pages.showcase.confirmPrimary") });
    setLastAnswer(ok ? t("common.yes") : t("common.no"));
  };

  const fakeDelete = () =>
    new Promise<void>((resolve) => {
      setTimeout(() => {
        setDeleteModal(false);
        setLastAnswer(t("common.delete"));
        resolve();
      }, 800);
    });

  return (
    <div className="container-fluid" style={PAGE_STYLE}>
      <div className="card mt-4 mb-4">
        <ZtoPageHeader
          icon="fas fa-th-large"
          title={t("pages.showcase.title")}
          breadcrumb={[
            { icon: "fas fa-chart-line", label: t("nav.root") },
            { label: t("pages.showcase.title") },
          ]}
          back={{ to: "/zto-finans/cari-hareketler" }}
          actions={
            <span className="erp-info-chip chip-info">
              <i className="fas fa-flask" aria-hidden="true" /> DEV
            </span>
          }
        />
        <div className="card-body">
          <p className="text-muted mb-0">{t("pages.showcase.subtitle")}</p>
        </div>
      </div>

      <Section title={`${t("pages.showcase.tableSection")} — ${t("pages.showcase.tableButtons")}`}>
        <div className="table-responsive">
          <ZtoDataTable
            id="showcaseButtonsTable"
            columns={columns}
            data={filteredRows}
            dom={ZTO_DOM.buttons}
            buttons={["copy", "excel", "pdf", "print"]}
            exportTitle={t("pages.showcase.statementTitle")}
            fileName="cari-ekstre"
            tableClassName="table table-bordered table-hover"
            order={[{ id: "date", desc: false }]}
          />
        </div>
      </Section>

      <Section title={`${t("pages.showcase.tableSection")} — ${t("pages.showcase.tableCore")}`}>
        <ZtoDataTable
          id="showcaseCoreTable"
          columns={columns}
          data={rows}
          dom={ZTO_DOM.core}
          pageLength={25}
          tableClassName="table table-bordered table-sm"
        />
      </Section>

      <Section title={t("pages.showcase.chipsSection")}>
        <ZtoGroupStatChips groups={statGroups} active={chip} onSelect={setChip} />
        <p className="small text-muted mt-2 mb-0">
          {t("pages.showcase.activeChip")}: <strong>{chip ?? t("pages.showcase.none")}</strong>
        </p>
      </Section>

      <Section title={t("pages.showcase.selectSection")}>
        <div className="form-row">
          <div className="form-group col-md-4">
            <label htmlFor="showcaseAccount">{t("pages.showcase.accountLabel")}</label>
            <ZtoSelect
              id="showcaseAccount"
              value={account}
              onChange={setAccount}
              options={SHOWCASE_SELECT_OPTIONS}
            />
            <small className="form-text text-muted">
              {t("pages.showcase.selectedValue")}: {account || t("pages.showcase.none")}
            </small>
          </div>
          <div className="form-group col-md-4">
            <label htmlFor="showcaseAccountGroup">{t("pages.showcase.inputGroupLabel")}</label>
            <div className="input-group">
              <ZtoSelect
                id="showcaseAccountGroup"
                value={account}
                onChange={setAccount}
                options={SHOWCASE_SELECT_OPTIONS}
              />
              <div className="input-group-append">
                <button type="button" className="btn btn-outline-primary">
                  <i className="fas fa-plus" aria-hidden="true" /> {t("pages.showcase.newButton")}
                </button>
              </div>
            </div>
          </div>
        </div>
        <ul className="nav nav-tabs mt-2" role="tablist">
          {(["tabFirst", "tabSecond", "tabDisabled"] as const).map((key, index) => (
            <li className="nav-item" key={key} role="presentation">
              <button
                type="button"
                role="tab"
                aria-selected={tab === index}
                className={
                  index === 2 ? "nav-link disabled" : tab === index ? "nav-link active" : "nav-link"
                }
                disabled={index === 2}
                onClick={() => setTab(index)}
              >
                <i className="fas fa-list" aria-hidden="true" />
                {t(`pages.showcase.${key}`)}
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("pages.showcase.branchSection")}>
        <div className="row">
          <div className="col-lg-6">
            <h6 className="font-weight-bold">{t("pages.showcase.sampleTree")}</h6>
            <div className="form-group">
              <label htmlFor="showcaseBranch">{t("pages.showcase.singleBranch")}</label>
              <ZtoBranchSelect
                id="showcaseBranch"
                value={branch}
                onChange={setBranch}
                tree={SHOWCASE_BRANCH_TREE}
                allowAll
              />
            </div>
            <div className="form-group">
              <div className="small text-muted mb-1">{t("pages.showcase.branchList")}</div>
              <ZtoBranchMultiSelect
                variant="list"
                value={listValue}
                onChange={setListValue}
                tree={SHOWCASE_BRANCH_TREE}
              />
            </div>
            <div className="form-group">
              <div className="small text-muted mb-1">{t("pages.showcase.branchDropdown")}</div>
              <ZtoBranchMultiSelect
                variant="dropdown"
                value={dropdownValue}
                onChange={setDropdownValue}
                tree={SHOWCASE_BRANCH_TREE}
              />
            </div>
            <small className="text-muted">
              {t("pages.showcase.selectedValue")}:{" "}
              {[branch, ...listValue, "|", ...dropdownValue].filter(Boolean).join(", ")}
            </small>
          </div>
          <div className="col-lg-6">
            <h6 className="font-weight-bold">{t("pages.showcase.liveTree")}</h6>
            <div className="form-group">
              <label htmlFor="showcaseLiveBranch">{t("pages.showcase.singleBranch")}</label>
              <ZtoBranchSelect
                id="showcaseLiveBranch"
                value={liveBranch}
                onChange={setLiveBranch}
              />
            </div>
            <ZtoBranchMultiSelect
              variant="list"
              classPrefix="dcr"
              value={liveList}
              onChange={setLiveList}
            />
          </div>
        </div>
      </Section>

      <Section title={t("pages.showcase.modalSection")}>
        <div className="d-flex flex-wrap" style={{ gap: 8 }}>
          <button type="button" className="btn btn-primary" onClick={() => setFirstModal(true)}>
            <i className="fas fa-window-restore mr-1" aria-hidden="true" />
            {t("pages.showcase.openModal")}
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setDeleteModal(true)}>
            <i className="fas fa-trash mr-1" aria-hidden="true" />
            {t("pages.showcase.confirmDelete")}
          </button>
          <button type="button" className="btn btn-outline-primary" onClick={askPrimary}>
            <i className="fas fa-question-circle mr-1" aria-hidden="true" />
            {t("pages.showcase.confirmPrimary")}
          </button>
        </div>
        <p className="small text-muted mt-2 mb-0">
          {t("pages.showcase.confirmResult")}: <strong>{lastAnswer || "—"}</strong>
        </p>
        <ZtoModal
          show={firstModal}
          onHide={() => setFirstModal(false)}
          title={t("pages.showcase.stackedTitle")}
          footer={
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setFirstModal(false)}
              >
                {t("common.close")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setSecondModal(true)}
              >
                {t("pages.showcase.openSecond")}
              </button>
            </>
          }
        >
          <p>{t("pages.showcase.stackedBody")}</p>
          <ZtoSelect value={account} onChange={setAccount} options={SHOWCASE_SELECT_OPTIONS} />
        </ZtoModal>
        <ZtoModal
          show={secondModal}
          onHide={() => setSecondModal(false)}
          title={t("pages.showcase.secondTitle")}
          size="sm"
          centered
        >
          {t("pages.showcase.secondBody")}
        </ZtoModal>
        <ZtoConfirmModal
          show={deleteModal}
          onConfirm={fakeDelete}
          onCancel={() => setDeleteModal(false)}
        />
        {confirmModal}
      </Section>

      <Section title={t("pages.showcase.tooltipSection")}>
        <div className="d-flex flex-wrap align-items-center" style={{ gap: 16 }}>
          <ZtoTooltip content={t("pages.showcase.tooltipContent")}>
            <button type="button" className="btn btn-outline-secondary">
              {t("pages.showcase.tooltipText")}
            </button>
          </ZtoTooltip>
          <ZtoPopover
            title={t("pages.showcase.popoverTitle")}
            content={t("pages.showcase.popoverContent")}
          >
            <button type="button" className="btn btn-outline-info">
              <i className="fas fa-coins mr-1" aria-hidden="true" />
              {t("pages.showcase.popoverButton")}
            </button>
          </ZtoPopover>
        </div>
      </Section>

      <Section title={t("pages.showcase.formatSection")}>
        <table className="table table-sm table-bordered mb-0">
          <tbody>
            <FormatRow code="formatN2(1234567.891)" value={formatN2(1234567.891)} />
            <FormatRow code="formatNumber(0.5, 0)" value={formatNumber(0.5, 0)} />
            <FormatRow code='formatMoney(-1250.5, "TRY")' value={formatMoney(-1250.5, "TRY")} />
            <FormatRow code='formatMoney(980.5, "EUR")' value={formatMoney(980.5, "EUR")} />
            <FormatRow code='formatDate("2026-11-13")' value={formatDate("2026-11-13")} />
            <FormatRow
              code='formatDateTime("2026-11-13T14:05:00")'
              value={formatDateTime("2026-11-13T14:05:00")}
            />
            <FormatRow code='parseTrNumber("1.234,56")' value={String(parseTrNumber("1.234,56"))} />
          </tbody>
        </table>
      </Section>

      <Section title={t("pages.showcase.chartSection")}>
        <Suspense
          fallback={
            <div className="spinner-border text-primary" role="status">
              <span className="sr-only">{t("common.loading")}</span>
            </div>
          }
        >
          <div className="row">
            <div className="col-lg-7" style={CHART_BOX_STYLE}>
              <ZtoChartLazy
                type="bar"
                title={t("pages.showcase.barTitle")}
                height={260}
                valueFormat={{ currency: "TRY" }}
                data={{
                  labels: monthly.labels,
                  datasets: [
                    { label: t("pages.showcase.colDebit"), data: monthly.debit },
                    { label: t("pages.showcase.colCredit"), data: monthly.credit },
                  ],
                }}
              />
            </div>
            <div className="col-lg-5" style={CHART_BOX_STYLE}>
              <ZtoChartLazy
                type="pie"
                title={t("pages.showcase.pieTitle")}
                height={260}
                valueFormat="integer"
                legend="right"
                data={{ labels: kinds.labels, datasets: [{ data: kinds.values }] }}
              />
            </div>
          </div>
        </Suspense>
      </Section>

      <Section title={t("pages.showcase.iconSection")}>
        <div className="d-flex flex-wrap" style={{ gap: 16 }}>
          {ICONS.map((icon) => (
            <span key={icon} className="text-center small text-muted" style={{ width: 120 }}>
              <i className={`${icon} fa-2x d-block mb-1 text-primary`} aria-hidden="true" />
              {icon}
            </span>
          ))}
        </div>
      </Section>

      <Section title={t("pages.showcase.bootstrapSection")}>
        <div className="row">
          <div className="col-md-6">
            <form onSubmit={(event) => event.preventDefault()}>
              <div className="form-group">
                <label htmlFor="showcaseText">{t("pages.showcase.formLabel")}</label>
                <input id="showcaseText" className="form-control" defaultValue="Blackrose" />
                <small className="form-text text-muted">{t("pages.showcase.formHelp")}</small>
              </div>
              <div className="form-group">
                <label htmlFor="showcaseNative">{t("pages.showcase.formSelect")}</label>
                <select id="showcaseNative" className="form-control form-control-sm">
                  <option>TRY</option>
                  <option>USD</option>
                  <option>EUR</option>
                </select>
              </div>
              <div className="form-check mb-3">
                <input id="showcaseCheck" type="checkbox" className="form-check-input" />
                <label htmlFor="showcaseCheck" className="form-check-label">
                  {t("pages.showcase.formCheck")}
                </label>
              </div>
              <div className="btn-toolbar" style={{ gap: 6 }}>
                <button type="button" className="btn btn-primary">
                  {t("common.save")}
                </button>
                <button type="button" className="btn btn-success">
                  {t("common.add")}
                </button>
                <button type="button" className="btn btn-warning">
                  {t("common.edit")}
                </button>
                <button type="button" className="btn btn-danger">
                  {t("common.delete")}
                </button>
                <button type="button" className="btn btn-secondary btn-sm">
                  {t("common.cancel")}
                </button>
                <button type="button" className="erp-btn erp-btn-primary">
                  <i className="fas fa-plus" aria-hidden="true" />{" "}
                  <span>{t("common.newRecord")}</span>
                </button>
              </div>
            </form>
          </div>
          <div className="col-md-6">
            <div className="card shadow-sm mb-3">
              <div className="card-body">
                <h5 className="card-title">{t("pages.showcase.cardTitle")}</h5>
                <p className="card-text">{t("pages.showcase.cardText")}</p>
                <span className="badge badge-success mr-1">{t("common.yes")}</span>
                <span className="badge badge-danger">{t("common.no")}</span>
              </div>
            </div>
            <div className="alert alert-info">{t("pages.showcase.alertInfo")}</div>
            <div className="alert alert-warning mb-0">{t("pages.showcase.alertWarning")}</div>
          </div>
        </div>
      </Section>
    </div>
  );
}

function FormatRow({ code, value }: { code: string; value: string }) {
  return (
    <tr>
      <td>
        <code>{code}</code>
      </td>
      <td className="text-right">{value}</td>
    </tr>
  );
}
