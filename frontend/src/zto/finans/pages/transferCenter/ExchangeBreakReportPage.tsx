import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useFxReport } from "../../../../pages/finance/fundApi";
import type { FxReportRow } from "../../../../pages/finance/types";
import { currencySymbol, formatDate, formatN2 } from "../../../components";
import { PhaseButton } from "../accounts/AccountsMenu";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import {
  buildReportGroups,
  depthColor,
  depthPrefix,
  pageGroups,
  pageInfoText,
  percentText,
  totalBrokenText,
  type ReportCollection,
  type ReportTransferNode,
} from "./exchangeBreakReportLogic";
import { defaultRange } from "./transferCenterLogic";

const PAGE_SIZES = [10, 25, 50, 100];
const COLUMN_COUNT = 18;
const DIRECT_PAD = 8;

/**
 * Döviz Bozum & Tahsilat İzlenebilirliği (ZTO Views/BankStatement/ExchangeBreakReport.cshtml; yeni
 * sekme). 12.2'de tablo görünümü + istatistik kartları + arama + sayfalama + yazdırma; SVG ağaç
 * (Grafik) 12.2b'de — geçiş düğmesi pasif. "Siparişler" sütunu yok (S-6).
 */
export function ExchangeBreakReportPage() {
  useZtoRootClass("zto-page-exchange-break-report");
  const { t } = useTranslation("ztoFinans");
  const tc = (key: string) => t(`transferCenter.report.${key}`);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initial = useMemo(() => {
    const fallback = defaultRange();
    return {
      from: searchParams.get("from") || fallback.from,
      to: searchParams.get("to") || fallback.to,
    };
  }, [searchParams]);
  const [draft, setDraft] = useState(initial);
  const [range, setRange] = useState(initial);
  const [size, setSize] = useState(10);
  const [page, setPage] = useState(1);
  const [term, setTerm] = useState("");
  const report = useFxReport(range);
  const groups = useMemo(() => buildReportGroups(report.data), [report.data]);
  const current = pageGroups(groups, term, page, size);
  const stats = report.data?.stats;
  const message = report.isPending ? tc("loading") : report.isError ? tc("loadError") : null;

  return (
    <div className="container-fluid px-3 pt-1">
      <div id="eb-toolbar">
        <h5 className="mb-0 mr-2">
          <i className="fas fa-project-diagram mr-1 text-warning" aria-hidden="true" />
          {tc("title")}
        </h5>
        <label className="mb-0 small" htmlFor="ebS">
          {tc("start")}
        </label>
        <input
          type="date"
          id="ebS"
          className="form-control form-control-sm"
          style={{ width: 140 }}
          value={draft.from}
          onChange={(event) => setDraft((d) => ({ ...d, from: event.target.value }))}
        />
        <label className="mb-0 small" htmlFor="ebE">
          {tc("end")}
        </label>
        <input
          type="date"
          id="ebE"
          className="form-control form-control-sm"
          style={{ width: 140 }}
          value={draft.to}
          onChange={(event) => setDraft((d) => ({ ...d, to: event.target.value }))}
        />
        <button
          type="button"
          className="btn btn-sm btn-primary"
          id="btnRef"
          onClick={() => {
            setRange(draft);
            setPage(1);
            if (draft.from === range.from && draft.to === range.to) void report.refetch();
          }}
        >
          <i className="fas fa-sync-alt mr-1" aria-hidden="true" />
          {tc("refresh")}
        </button>
        <PhaseButton step="12.2b" className="btn btn-sm btn-outline-info" title={tc("chartView")}>
          <i className="fas fa-project-diagram" id="btnToggleViewIcon" aria-hidden="true" />
          <span className="sr-only">{tc("chartView")}</span>
        </PhaseButton>
        <button
          type="button"
          className="btn btn-sm btn-outline-dark no-print"
          id="btnPrintTable"
          title={tc("print")}
          aria-label={tc("print")}
          onClick={() => window.print()}
        >
          <i className="fas fa-print" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary ml-auto"
          onClick={() => navigate(-1)}
        >
          <i className="fas fa-arrow-left mr-1" aria-hidden="true" />
          {tc("back")}
        </button>
      </div>

      <div id="eb-stats" style={{ display: "flex" }}>
        <Stat label={tc("statCollection")} id="stCol" value={stats?.collectionCount ?? 0} />
        <Stat label={tc("statFx")} id="stTr" value={stats?.fxCount ?? 0} />
        <Stat label={tc("statDirect")} id="stDir" value={stats?.fxWithoutCollection ?? 0} />
        <Stat
          label={tc("statUnexchanged")}
          id="stUnexchanged"
          value={stats?.unbrokenCollectionCount ?? 0}
          color="#e65100"
        />
        <Stat label={tc("statTotal")} id="stAmt" value={stats ? totalBrokenText(stats) : "-"} />
      </div>

      <div id="eb-wrap">
        <div id="eb-table-wrap" style={{ display: "block" }}>
          <div id="eb-table-tools" className="no-print" style={{ display: "flex" }}>
            <div className="left-tools">
              <label htmlFor="ebTablePageSize" className="mb-0 small">
                {tc("pageSize")}
              </label>
              <select
                id="ebTablePageSize"
                className="form-control form-control-sm"
                style={{ width: 84 }}
                value={size}
                onChange={(event) => {
                  setSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <input
                type="search"
                id="ebTableSearch"
                className="form-control form-control-sm"
                placeholder={tc("search")}
                aria-label={tc("search")}
                value={term}
                onChange={(event) => {
                  setTerm(event.target.value);
                  setPage(1);
                }}
              />
              <span id="eb-page-info" role="status">
                {pageInfoText(current)}
              </span>
            </div>
            <div className="right-tools">
              <button
                id="ebPrevPage"
                className="btn btn-sm btn-outline-secondary"
                type="button"
                aria-label={tc("previous")}
                disabled={current.page <= 1}
                onClick={() => setPage(current.page - 1)}
              >
                <i className="fas fa-chevron-left" aria-hidden="true" />
              </button>
              <span id="ebPageText" className="small text-muted">
                {current.page}/{current.totalPages}
              </span>
              <button
                id="ebNextPage"
                className="btn btn-sm btn-outline-secondary"
                type="button"
                aria-label={tc("next")}
                disabled={current.page >= current.totalPages}
                onClick={() => setPage(current.page + 1)}
              >
                <i className="fas fa-chevron-right" aria-hidden="true" />
              </button>
            </div>
          </div>
          <table className="table table-sm table-bordered table-hover" id="eb-table">
            <caption className="sr-only">{tc("title")}</caption>
            <thead>
              <tr>
                <th>{tc("colDate")}</th>
                <th>{tc("colDocument")}</th>
                <th>{tc("colAccount")}</th>
                <th className="text-right">{tc("colAmount")}</th>
                <th className="text-center">{tc("colCount")}</th>
                <th className="text-right">{tc("colBroken")}</th>
                <th className="text-right">{tc("colRemaining")}</th>
                <th>{tc("colProgress")}</th>
                <th style={{ minWidth: 200 }}>{tc("colCode")}</th>
                <th>{tc("colFxDate")}</th>
                <th>{tc("colSourceBank")}</th>
                <th>{tc("colTargetBank")}</th>
                <th className="text-right">{tc("colSourceAmount")}</th>
                <th className="text-right">{tc("colTargetAmount")}</th>
                <th className="text-right">{tc("colRate")}</th>
                <th>{tc("colStatus")}</th>
                <th className="text-right">{tc("colCost")}</th>
                <th>{tc("colDescription")}</th>
              </tr>
            </thead>
            <tbody id="ebTableBody">
              {message ? (
                <tr>
                  <td colSpan={COLUMN_COUNT} className="text-center text-muted py-3">
                    {message}
                  </td>
                </tr>
              ) : current.items.length === 0 ? (
                <tr>
                  <td colSpan={COLUMN_COUNT} className="text-center text-muted py-3">
                    {tc("empty")}
                  </td>
                </tr>
              ) : (
                <ReportRows items={current.items} />
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  id,
  value,
  color,
}: {
  label: string;
  id: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div className="eb-stat">
      <div className="lbl">{label}</div>
      <div className="val" id={id} style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

function CollectionCells({
  collection,
  rowSpan,
  count,
  exchanged,
  remaining,
  percent,
  accent,
}: {
  collection: ReportCollection;
  rowSpan?: number;
  count: number;
  exchanged: number;
  remaining: number;
  percent: number;
  accent?: boolean;
}) {
  const sym = currencySymbol(collection.currency);
  return (
    <>
      <td
        className="eb-col-cell"
        rowSpan={rowSpan}
        style={accent ? { borderLeft: "3px solid #e65100" } : undefined}
      >
        {formatDate(collection.date) || "-"}
      </td>
      <td className="eb-col-cell" rowSpan={rowSpan}>
        {collection.code || "-"}
      </td>
      <td className="eb-col-cell" rowSpan={rowSpan}>
        {collection.accountName || "-"}
      </td>
      <td className="text-right eb-col-cell" rowSpan={rowSpan}>
        {formatN2(collection.amount)} {sym}
      </td>
      <td className="text-center eb-col-cell" rowSpan={rowSpan}>
        {count}
      </td>
      <td className="text-right eb-col-cell" rowSpan={rowSpan}>
        {formatN2(exchanged)} {sym}
      </td>
      <td className="text-right eb-col-cell" rowSpan={rowSpan}>
        {formatN2(remaining)} {sym}
      </td>
      <td className="eb-col-cell" rowSpan={rowSpan}>
        <div className="eb-progress-wrap">
          <div
            className="eb-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
          >
            <span style={{ width: `${percent.toFixed(2)}%` }} />
          </div>
          <div className="eb-progress-meta">{percentText(percent)}</div>
        </div>
      </td>
    </>
  );
}

function TransferCells({ node }: { node: ReportTransferNode }) {
  const { t } = useTranslation("ztoFinans");
  const tc = (key: string) => t(`transferCenter.report.${key}`);
  const { row, depth } = node;
  const color = depthColor(depth);
  const op = row.rateOperation === "DIVIDE" ? "÷" : "×";
  return (
    <>
      <td style={{ paddingLeft: 6 + depth * 18 }}>
        {depth > 0 ? (
          <span
            style={{
              fontSize: 9,
              background: color.badge,
              color: "#fff",
              padding: "1px 4px",
              borderRadius: 2,
              marginRight: 3,
            }}
          >
            {`${depth + 1}. ${tc("levelTag")}`}
          </span>
        ) : (
          <>
            <span className="eb-transfer-tag">{tc("breakTag")}</span>{" "}
          </>
        )}
        {depthPrefix(depth)}
        {row.code || "-"}
        <SourceBadges row={row} />
      </td>
      <td>{formatDate(row.date) || "-"}</td>
      <td>{row.sourceFundName || "-"}</td>
      <td>{row.targetFundName || "-"}</td>
      <td className="text-right">
        {formatN2(row.sourceMoney.amount)} <small>{currencySymbol(row.sourceMoney.currency)}</small>
      </td>
      <td className="text-right">
        {formatN2(row.targetMoney.amount)} <small>{currencySymbol(row.targetMoney.currency)}</small>
      </td>
      <td className="text-right">
        {formatN2(row.rate)} ({op})
      </td>
      <td>{tc(`status.${row.status}`)}</td>
      <td className="text-right">{row.fxDiffTl ? formatN2(row.fxDiffTl) : "-"}</td>
      <td>-</td>
    </>
  );
}

/** Önceki bozumdan beslenen bozumlarda kaynak rozetleri (ZTO `buildSrcBadges`, sade). */
function SourceBadges({ row }: { row: FxReportRow }) {
  const { t } = useTranslation("ztoFinans");
  const breaks = row.sources.filter((s) => s.kind === "TRANSFER");
  if (breaks.length === 0) return null;
  const sym = currencySymbol(row.sourceMoney.currency);
  return (
    <div style={{ marginTop: 3, lineHeight: 1.5 }}>
      {breaks.map((source) => (
        <div
          key={source.id}
          style={{
            marginTop: 2,
            background: "#fce4ec",
            border: "1px solid #ef9a9a",
            borderRadius: 3,
            padding: "2px 5px",
            fontSize: 9,
            minWidth: 130,
          }}
        >
          <div style={{ color: "#c62828", fontWeight: 600 }}>{source.code || "-"}</div>
          <div>
            {formatN2(source.used)} {sym} {t("transferCenter.report.used")}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportRows({ items }: { items: ReturnType<typeof pageGroups>["items"] }) {
  const { t } = useTranslation("ztoFinans");
  const tc = (key: string) => t(`transferCenter.report.${key}`);
  let directHeadShown = false;
  return (
    <>
      {items.map((group, index) => {
        if (group.type === "collection") {
          const rowSpan = Math.max(group.transfers.length, 1);
          const cells = (
            <CollectionCells
              collection={group.collection}
              rowSpan={rowSpan}
              count={group.breakCount}
              exchanged={group.exchanged}
              remaining={group.remaining}
              percent={group.percent}
            />
          );
          if (group.transfers.length === 0) {
            return (
              <tr key={`c${group.collection.id}`}>
                {cells}
                <td colSpan={10} className="text-center text-muted">
                  {tc("noBreak")}
                </td>
              </tr>
            );
          }
          return (
            <Fragment key={`c${group.collection.id}`}>
              {group.transfers.map((node, i) => (
                <tr key={node.row.transferId} style={{ background: depthColor(node.depth).bg }}>
                  {i === 0 && cells}
                  <TransferCells node={node} />
                </tr>
              ))}
            </Fragment>
          );
        }
        if (group.type === "unexchanged") {
          return (
            <tr
              key={`u${group.collection.id}`}
              style={{ background: "#fff8f3", borderLeft: "3px solid #e65100" }}
            >
              <CollectionCells
                collection={group.collection}
                count={0}
                exchanged={0}
                remaining={group.collection.amount}
                percent={0}
                accent
              />
              <td colSpan={10} className="text-center">
                <span
                  style={{
                    fontSize: 10,
                    background: "#fff3e0",
                    color: "#e65100",
                    border: "1px solid #ffcc80",
                    borderRadius: 10,
                    padding: "2px 10px",
                    fontWeight: 600,
                  }}
                >
                  <i
                    className="fas fa-ban"
                    style={{ fontSize: 9, marginRight: 3 }}
                    aria-hidden="true"
                  />
                  {tc("neverBroken")}
                </span>
              </td>
            </tr>
          );
        }
        const head = !directHeadShown;
        directHeadShown = true;
        return (
          <Fragment key={`d${index}`}>
            {head && (
              <tr className="eb-dir-head">
                <td colSpan={COLUMN_COUNT}>{tc("directHead")}</td>
              </tr>
            )}
            {group.transfers.map((node, i) => (
              <tr key={node.row.transferId} style={{ background: depthColor(node.depth).bg }}>
                {i === 0 && (
                  <td
                    colSpan={DIRECT_PAD}
                    rowSpan={group.transfers.length}
                    style={{ background: "#f9f9f9" }}
                  >
                    <span className="eb-dir-tag">{tc("directTag")}</span>
                  </td>
                )}
                <TransferCells node={node} />
              </tr>
            ))}
          </Fragment>
        );
      })}
    </>
  );
}
