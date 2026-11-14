import { useEffect, useMemo, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import {
  createTransfer,
  reverseTransfer,
  useFinanceMutation,
  useIdempotencyKey,
  useTransferHistory,
  useTransferable,
} from "../../../../pages/finance/accountApi";
import { today } from "../../../../pages/finance/common";
import type { Account, TransferableTransaction } from "../../../../pages/finance/types";
import {
  CT_TARGET_SEARCH_IDS,
  ZtoAccountSearch,
  ZtoModal,
  currencySymbol,
  formatDate,
  formatN2,
  useZtoSnackbar,
} from "../../../components";
import { useCdDialogs } from "./TransactionDialogs";
import { KIND_BADGE, apiErrorOf } from "./transactionsLogic";
import {
  groupByCurrency,
  groupByWorkplace,
  groupState,
  isSelectable,
  pruneSelection,
  selectionSummary,
  sixMonthsAgo,
  toggleGroup,
  toggleRow,
  validateTransfer,
  type CurrencyGroup,
  type TransferGroupBy,
} from "./transferLogic";

export type CariTransferModalProps = {
  show: boolean;
  onHide: () => void;
  account: Account;
};

/** Grup "tümünü seç" kutusu: `indeterminate` DOM özelliği + aria-checked="mixed" (MWG `checkbox`). */
function GroupCheckbox({
  state,
  onChange,
  label,
  className,
}: {
  state: "checked" | "unchecked" | "mixed";
  onChange: (checked: boolean) => void;
  label: string;
  className: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "mixed";
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className={className}
      checked={state === "checked"}
      aria-checked={state === "mixed" ? "mixed" : state === "checked"}
      aria-label={label}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

/**
 * Cari Taşıma (ZTO Transactions.cshtml:3550-4059): `#cariTasimaModal` (.modal kökü, `.modal-dialog.ct-modal-90`),
 * hedef cari araması (aynı hesap grubu), gruplama (Para Birimi / İş Yeri), aynı çeke bağlı satırlar birlikte
 * seçilir, açık planlı satır pasif; onay `ctConfirmModal`; Geçmiş Taşımalar + Blackrose "Geri Al".
 */
export function CariTransferModal({ show, onHide, account }: CariTransferModalProps) {
  const { t } = useTranslation("ztoFinans");
  const snackbar = useZtoSnackbar();
  const dialogs = useCdDialogs();
  const [target, setTarget] = useState<{ id: string; label: string } | null>(null);
  const [description, setDescription] = useState("");
  const [groupBy, setGroupBy] = useState<TransferGroupBy>("workplace");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const idempotencyKey = useIdempotencyKey(show);
  const confirmCancelRef = useRef<HTMLButtonElement>(null);

  const transferable = useTransferable(account.id, { enabled: show });
  const rows = useMemo(() => transferable.data ?? [], [transferable.data]);

  useEffect(() => {
    if (show) {
      setTarget(null);
      setDescription("");
      setSelected(new Set());
      setGroupBy("workplace");
    }
  }, [show]);
  useEffect(() => setSelected((s) => pruneSelection(s, rows)), [rows]);

  const summary = useMemo(() => selectionSummary(selected, rows), [selected, rows]);
  const unknown = t("transactions.workplace.unknown");
  const workplaceGroups = useMemo(() => groupByWorkplace(rows, unknown), [rows, unknown]);
  const currencyGroups = useMemo(() => groupByCurrency(rows), [rows]);

  const transfer = useFinanceMutation(
    () =>
      createTransfer(
        {
          fromAccountId: account.id,
          toAccountId: target!.id,
          transactionIds: rows
            .filter((r) => selected.has(r.transactionId))
            .map((r) => r.transactionId),
          description: description.trim() || undefined,
        },
        idempotencyKey,
      ),
    {
      onSuccess: (result) => {
        const moved = result.lines.length;
        const parts = [t("transactions.transfer.result", { count: moved })];
        if (result.checkCount)
          parts.push(t("transactions.transfer.resultChecks", { count: result.checkCount }));
        if (result.noteCount)
          parts.push(t("transactions.transfer.resultNotes", { count: result.noteCount }));
        setConfirmOpen(false);
        onHide();
        snackbar.show(parts.join(" "), "success");
      },
      onError: (e) => {
        setConfirmOpen(false);
        const api = apiErrorOf(e);
        dialogs.notify(
          api
            ? t("transactions.transfer.error", { message: api.message })
            : t("transactions.transfer.serverError"),
          "error",
        );
      },
    },
  );

  const submit = () => {
    const problem = validateTransfer(target?.id ?? null, selected, rows);
    if (problem) {
      dialogs.notify(
        t(problem === "empty" ? "transactions.transfer.empty" : `transactions.transfer.${problem}`),
        "warning",
      );
      return;
    }
    setConfirmOpen(true);
  };

  const renderRow = (x: TransferableTransaction) => {
    const blocked = !isSelectable(x);
    const checkboxId = `ct-chk-${x.transactionId}`;
    return (
      <tr
        key={x.transactionId}
        className={blocked ? "ct-blocked" : undefined}
        title={blocked ? t("transactions.transfer.blocked") : undefined}
      >
        <td>
          <input
            type="checkbox"
            id={checkboxId}
            className="ct-chk"
            checked={selected.has(x.transactionId)}
            disabled={blocked}
            aria-describedby={blocked ? `${checkboxId}-blocked` : undefined}
            onChange={(e) => setSelected((s) => toggleRow(s, rows, x, e.target.checked))}
          />
          {blocked && (
            <span id={`${checkboxId}-blocked`} className="sr-only">
              {t("transactions.transfer.blocked")}
            </span>
          )}
        </td>
        <td>
          <label htmlFor={checkboxId} className="mb-0">
            <span
              className={`badge ${KIND_BADGE[x.kind as keyof typeof KIND_BADGE] ?? "badge-secondary"}`}
            >
              {t(`transactions.kind.${x.kind}`, { defaultValue: x.kind })}
            </span>
          </label>
        </td>
        <td>{formatDate(x.transactionDate)}</td>
        <td>{x.documentNo ?? ""}</td>
        <td>{x.branchName || "-"}</td>
        <td className="text-right">{`${formatN2(x.amount * x.sign)} ${currencySymbol(x.currency)}`}</td>
        <td>{x.description ?? ""}</td>
        <td>
          {x.instruments.map((i) => (
            <span
              key={i.id}
              className={i.kind === "CHECK" ? "badge badge-info mr-1" : "badge badge-warning mr-1"}
              title={`${t(i.kind === "CHECK" ? "transactions.transfer.check" : "transactions.transfer.note")}: ${i.number}`}
            >
              <i
                className={i.kind === "CHECK" ? "fas fa-money-check" : "fas fa-file-signature"}
                aria-hidden="true"
              />{" "}
              {i.number ||
                t(
                  i.kind === "CHECK" ? "transactions.transfer.check" : "transactions.transfer.note",
                )}
            </span>
          ))}
        </td>
      </tr>
    );
  };

  const currencyGroupView = (group: CurrencyGroup) => (
    <div className="ct-cur-group mb-2" key={group.key}>
      <div className="ct-cur-header">
        <i className="fas fa-coins" aria-hidden="true" />{" "}
        {t("transactions.transfer.currencyGroup", { currency: currencySymbol(group.currency) })}
        <span className="badge badge-light float-right">
          {t("transactions.transfer.movements", { count: group.items.length })}
        </span>
      </div>
      <div className="ct-cur-body">
        <div className="table-responsive">
          <table className="table table-sm table-hover mb-0" style={{ fontSize: 12 }}>
            <thead className="thead-light">
              <tr>
                <th scope="col" style={{ width: 34 }}>
                  <GroupCheckbox
                    className="ct-cur-selall"
                    state={groupState(selected, group.items)}
                    label={t("transactions.transfer.selectGroup")}
                    onChange={(checked) =>
                      setSelected((s) => toggleGroup(s, rows, group.items, checked))
                    }
                  />
                </th>
                <th scope="col">{t("transactions.transfer.type")}</th>
                <th scope="col">{t("transactions.transfer.date")}</th>
                <th scope="col">{t("transactions.transfer.documentNo")}</th>
                <th scope="col">{t("transactions.transfer.workplace")}</th>
                <th scope="col" className="text-right">
                  {t("transactions.transfer.amount")}
                </th>
                <th scope="col">{t("transactions.transfer.descriptionCol")}</th>
                <th scope="col">{t("transactions.transfer.instruments")}</th>
              </tr>
            </thead>
            <tbody>{group.items.map(renderRow)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <ZtoModal
        show={show}
        onHide={onHide}
        rootId="cariTasimaModal"
        dialogClassName="ct-modal-90"
        scrollable
        headerClassName="bg-primary text-white py-2"
        closeButtonClassName="text-white"
        footerClassName="justify-content-between py-2"
        title={
          <span style={{ fontSize: 15 }}>
            <i className="fas fa-exchange-alt" aria-hidden="true" />{" "}
            {t("transactions.transfer.title")}
          </span>
        }
        footer={
          <>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              id="btnCtHistory"
              onClick={() => setHistoryOpen(true)}
            >
              <i className="fas fa-history" aria-hidden="true" />{" "}
              {t("transactions.transfer.history")}
            </button>
            <div>
              <button type="button" className="btn btn-sm btn-secondary" onClick={onHide}>
                {t("transactions.transfer.close")}
              </button>{" "}
              <button
                type="button"
                className="btn btn-sm btn-primary"
                id="btnCtTransfer"
                onClick={submit}
              >
                <i className="fas fa-exchange-alt" aria-hidden="true" />{" "}
                {t("transactions.transfer.submit")}
              </button>
            </div>
          </>
        }
      >
        <div className="alert alert-info py-2 mb-2" style={{ fontSize: 12 }}>
          <i className="fas fa-info-circle" aria-hidden="true" />{" "}
          {t("transactions.transfer.source")}: <strong>{account.name}</strong> —{" "}
          {t("transactions.transfer.sourceInfo")}
        </div>
        <div className="form-row">
          <div className="col-md-7 mb-2">
            <label
              id="ctTargetLabel"
              htmlFor="ctTargetSearch"
              style={{ fontSize: 12, fontWeight: 600 }}
            >
              <i className="fas fa-user-tag" aria-hidden="true" />{" "}
              {t("transactions.transfer.target")}{" "}
              <small className="text-muted" style={{ fontWeight: 400 }}>
                ({t("transactions.transfer.sameGroup")}: {account.subGroupName})
              </small>
            </label>
            <ZtoAccountSearch
              variant="listGroup"
              ids={CT_TARGET_SEARCH_IDS}
              placeholder={t("transactions.transfer.targetPlaceholder")}
              emptyText={t("transactions.transfer.noResult")}
              minLength={2}
              delayMs={300}
              subGroup={account.subGroup}
              excludeId={account.id}
              value={target}
              ariaLabelledBy="ctTargetLabel"
              labelOf={(hit) => `${hit.code} - ${hit.name}`}
              renderItem={(hit) => `${hit.code} - ${hit.name}`}
              onSelect={(hit) => setTarget({ id: hit.id, label: `${hit.code} - ${hit.name}` })}
              onClear={() => setTarget(null)}
              onInputChange={() => setTarget(null)}
            />
            {target && (
              <small id="ctTargetSelected" className="text-success" style={{ fontSize: 12 }}>
                ✓ {target.label}
              </small>
            )}
          </div>
          <div className="col-md-5 mb-2">
            <label htmlFor="ctDescription" style={{ fontSize: 12, fontWeight: 600 }}>
              <i className="fas fa-sticky-note" aria-hidden="true" />{" "}
              {t("transactions.transfer.description")}
            </label>
            <input
              type="text"
              id="ctDescription"
              className="form-control form-control-sm"
              placeholder={t("transactions.transfer.descriptionPlaceholder")}
              maxLength={500}
              autoComplete="off"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <div
          className="d-flex justify-content-between align-items-center mt-2 mb-1 flex-wrap"
          style={{ gap: 6 }}
        >
          <span style={{ fontSize: 12, fontWeight: 600 }}>
            <i className="fas fa-list" aria-hidden="true" /> {t("transactions.transfer.rows")}
          </span>
          <div className="d-flex align-items-center" style={{ gap: 8 }}>
            <span style={{ fontSize: 11, color: "#6c757d" }} id="ctGroupByLabel">
              {t("transactions.transfer.groupBy")}:
            </span>
            <div className="btn-group btn-group-sm" role="group" aria-labelledby="ctGroupByLabel">
              {(["currency", "workplace"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`btn btn-outline-primary ct-groupby-btn${groupBy === mode ? " active" : ""}`}
                  aria-pressed={groupBy === mode}
                  style={{ fontSize: 11, padding: "2px 8px" }}
                  onClick={() => setGroupBy(mode)}
                >
                  <i
                    className={mode === "currency" ? "fas fa-coins" : "fas fa-building"}
                    aria-hidden="true"
                  />{" "}
                  {t(
                    mode === "currency"
                      ? "transactions.transfer.byCurrency"
                      : "transactions.transfer.byWorkplace",
                  )}
                </button>
              ))}
            </div>
            <span id="ctSelectedCount" className="badge badge-secondary" role="status">
              {t("transactions.transfer.selected", { count: summary.count })}
            </span>
          </div>
        </div>
        <div id="ctTxnGroups" style={{ overflow: "visible" }}>
          {transferable.isPending ? (
            <div className="text-center text-muted py-3">{t("transactions.transfer.loading")}</div>
          ) : transferable.isError ? (
            <div className="text-center text-danger py-3">
              {t("transactions.transfer.loadError")}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center text-muted py-3">{t("transactions.transfer.empty")}</div>
          ) : groupBy === "currency" ? (
            currencyGroups.map(currencyGroupView)
          ) : (
            workplaceGroups.map((w) => (
              <div className="ct-wp-group mb-3" key={w.key}>
                <div className="ct-wp-header">
                  <label
                    className="ct-wp-selall-wrap mb-0 mr-1"
                    title={t("transactions.transfer.selectWorkplace")}
                  >
                    <GroupCheckbox
                      className="ct-wp-selall"
                      state={groupState(selected, w.items)}
                      label={t("transactions.transfer.selectWorkplace")}
                      onChange={(checked) =>
                        setSelected((s) => toggleGroup(s, rows, w.items, checked))
                      }
                    />
                  </label>
                  <i className="fas fa-building" aria-hidden="true" />{" "}
                  {t("transactions.transfer.workplaceGroup", { name: w.label })}
                  <span className="badge badge-light float-right">
                    {t("transactions.transfer.movements", { count: w.items.length })}
                  </span>
                </div>
                <div className="ct-wp-body">{w.currencies.map(currencyGroupView)}</div>
              </div>
            ))
          )}
        </div>
        <div className="alert alert-info py-2 mt-2 mb-0" style={{ fontSize: 12 }}>
          <i className="fas fa-money-check" aria-hidden="true" />{" "}
          {t("transactions.transfer.instrumentNote")}
        </div>
      </ZtoModal>

      <ZtoModal
        show={show && confirmOpen}
        onHide={() => (transfer.isPending ? undefined : setConfirmOpen(false))}
        rootId="ctConfirmModal"
        centered
        headerClassName="bg-warning text-dark py-2"
        footerClassName="py-2"
        onEntered={() => confirmCancelRef.current?.focus()}
        title={
          <span style={{ fontSize: 15 }}>
            <i className="fas fa-exclamation-triangle" aria-hidden="true" />{" "}
            {t("transactions.transfer.confirmTitle")}
          </span>
        }
        footer={
          <>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              ref={confirmCancelRef}
              disabled={transfer.isPending}
              onClick={() => setConfirmOpen(false)}
            >
              {t("transactions.transfer.giveUp")}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-success"
              id="ctConfirmYes"
              disabled={transfer.isPending}
              aria-busy={transfer.isPending}
              onClick={() => transfer.mutate(undefined)}
            >
              <i
                className={transfer.isPending ? "fas fa-spinner fa-spin" : "fas fa-exchange-alt"}
                aria-hidden="true"
              />{" "}
              {transfer.isPending
                ? t("transactions.transfer.moving")
                : t("transactions.transfer.confirmYes")}
            </button>
          </>
        }
      >
        <p id="ctConfirmText" style={{ fontSize: 13, marginBottom: 8 }}>
          <Trans
            t={t}
            i18nKey="transactions.transfer.confirmText"
            values={{ count: summary.count, target: target?.label ?? "" }}
            components={{ b: <b /> }}
          />
        </p>
        {(summary.checkCount > 0 || summary.noteCount > 0) && (
          <div
            id="ctConfirmWarn"
            className="alert alert-warning py-2 mb-2"
            style={{ fontSize: 12 }}
          >
            {summary.checkCount > 0 && (
              <div>
                <i className="fas fa-money-check" aria-hidden="true" />{" "}
                {t("transactions.transfer.confirmChecks", { count: summary.checkCount })}
              </div>
            )}
            {summary.noteCount > 0 && (
              <div className={summary.checkCount ? "mt-1" : undefined}>
                <i className="fas fa-file-signature" aria-hidden="true" />{" "}
                {t("transactions.transfer.confirmNotes", { count: summary.noteCount })}
              </div>
            )}
          </div>
        )}
        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 0 }}>
          <i className="fas fa-question-circle text-warning" aria-hidden="true" />{" "}
          {t("transactions.transfer.confirmQuestion")}
        </p>
      </ZtoModal>

      <TransferHistoryModal
        show={show && historyOpen}
        onHide={() => setHistoryOpen(false)}
        account={account}
        dialogs={dialogs}
      />
      {dialogs.dialogs}
    </>
  );
}

/** Geçmiş Cari Taşıma İşlemleri (TR:3605-3656) + Blackrose eki Durum ve "Geri Al" (MANAGE). */
function TransferHistoryModal({
  show,
  onHide,
  account,
  dialogs,
}: {
  show: boolean;
  onHide: () => void;
  account: Account;
  dialogs: ReturnType<typeof useCdDialogs>;
}) {
  const { t } = useTranslation("ztoFinans");
  const snackbar = useZtoSnackbar();
  const [start, setStart] = useState(() => sixMonthsAgo(today()));
  const [end, setEnd] = useState(() => today());
  const [applied, setApplied] = useState({ from: sixMonthsAgo(today()), to: today() });
  const history = useTransferHistory(
    { accountId: account.id, from: applied.from || undefined, to: applied.to || undefined },
    { enabled: show },
  );

  const reverse = useFinanceMutation((id: string) => reverseTransfer(id), {
    onSuccess: () => snackbar.show(t("transactions.transfer.reversed"), "success"),
    onError: (e) => {
      const api = apiErrorOf(e);
      dialogs.notify(api?.message || t("transactions.transfer.serverError"), "error");
    },
  });

  const reset = () => {
    const range = { from: sixMonthsAgo(today()), to: today() };
    setStart(range.from);
    setEnd(range.to);
    setApplied(range);
  };
  const rows = history.data?.content ?? [];
  const seenTransfers = new Set<string>();

  return (
    <ZtoModal
      show={show}
      onHide={onHide}
      rootId="cariTasimaHistoryModal"
      size="xl"
      centered
      headerClassName="bg-secondary text-white py-2"
      closeButtonClassName="text-white"
      footerClassName="py-2"
      title={
        <span style={{ fontSize: 15 }}>
          <i className="fas fa-history" aria-hidden="true" />{" "}
          {t("transactions.transfer.historyTitle")}
        </span>
      }
      footer={
        <button type="button" className="btn btn-sm btn-secondary" onClick={onHide}>
          {t("transactions.transfer.close")}
        </button>
      }
    >
      <div className="form-row align-items-end mb-2">
        <div className="col-auto mb-1">
          <label
            className="mb-1"
            htmlFor="ctHistStart"
            style={{ fontSize: 11, fontWeight: 600, color: "#4b5563" }}
          >
            {t("transactions.transfer.historyStart")}
          </label>
          <input
            type="date"
            id="ctHistStart"
            className="form-control form-control-sm"
            style={{ fontSize: 12 }}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="col-auto mb-1">
          <label
            className="mb-1"
            htmlFor="ctHistEnd"
            style={{ fontSize: 11, fontWeight: 600, color: "#4b5563" }}
          >
            {t("transactions.transfer.historyEnd")}
          </label>
          <input
            type="date"
            id="ctHistEnd"
            className="form-control form-control-sm"
            style={{ fontSize: 12 }}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <div className="col-auto mb-1">
          <button
            type="button"
            id="ctHistFilter"
            className="btn btn-sm btn-primary"
            onClick={() => setApplied({ from: start, to: end })}
          >
            <i className="fas fa-filter" aria-hidden="true" /> {t("transactions.transfer.filter")}
          </button>
        </div>
        <div className="col-auto mb-1">
          <button
            type="button"
            id="ctHistReset"
            className="btn btn-sm btn-outline-secondary"
            title={t("transactions.transfer.lastSixMonths")}
            onClick={reset}
          >
            <i className="fas fa-undo" aria-hidden="true" />{" "}
            {t("transactions.transfer.lastSixMonths")}
          </button>
        </div>
      </div>
      <div className="table-responsive">
        <table
          id="ctHistoryTable"
          className="table table-sm table-striped mb-0"
          style={{ fontSize: 12, width: "100%" }}
        >
          <thead className="thead-light">
            <tr>
              <th scope="col">{t("transactions.transfer.date")}</th>
              <th scope="col">{t("transactions.transfer.from")}</th>
              <th scope="col" className="text-center" style={{ width: 34 }}>
                <span className="sr-only">→</span>
              </th>
              <th scope="col">{t("transactions.transfer.to")}</th>
              <th scope="col">{t("transactions.transfer.type")}</th>
              <th scope="col" className="text-right">
                {t("transactions.transfer.amount")}
              </th>
              <th scope="col">{t("transactions.transfer.check")}</th>
              <th scope="col">{t("transactions.transfer.user")}</th>
              <th scope="col">{t("transactions.transfer.status")}</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody id="ctHistoryBody">
            {history.isPending ? (
              <tr>
                <td colSpan={10} className="text-center text-muted py-3">
                  {t("transactions.transfer.loading")}
                </td>
              </tr>
            ) : history.isError ? (
              <tr>
                <td colSpan={10} className="text-center text-danger py-3">
                  {t("transactions.transfer.historyError")}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center text-muted py-3">
                  {t("transactions.transfer.noRecords")}
                </td>
              </tr>
            ) : (
              rows.map((h) => {
                const first = !seenTransfers.has(h.transferId);
                seenTransfers.add(h.transferId);
                const posted = h.status === "POSTED";
                return (
                  <tr key={h.lineId}>
                    <td>{formatDate(h.transferDate)}</td>
                    <td>{h.fromAccountName}</td>
                    <td className="text-center">
                      <i className="fas fa-arrow-right text-primary" aria-hidden="true" />
                    </td>
                    <td>{h.toAccountName}</td>
                    <td>
                      <span
                        className={`badge ${KIND_BADGE[h.kind as keyof typeof KIND_BADGE] ?? "badge-secondary"}`}
                      >
                        {t(`transactions.kind.${h.kind}`, { defaultValue: h.kind })}
                      </span>
                    </td>
                    <td className="text-right">{`${formatN2(h.amount)} ${currencySymbol(h.currency)}`}</td>
                    <td>
                      {h.instrumentNumbers.length > 0 && (
                        <span className="badge badge-info" title={h.instrumentNumbers.join(", ")}>
                          <i className="fas fa-money-check" aria-hidden="true" />
                          <span className="sr-only">{h.instrumentNumbers.join(", ")}</span>
                        </span>
                      )}
                    </td>
                    <td>{h.createdBy}</td>
                    <td>
                      <span className={posted ? "badge badge-success" : "badge badge-secondary"}>
                        {t(
                          posted
                            ? "transactions.transfer.statusPosted"
                            : "transactions.transfer.statusReversed",
                        )}
                      </span>
                    </td>
                    <td className="text-nowrap">
                      {posted && first && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          disabled={reverse.isPending}
                          onClick={async () => {
                            const ok = await dialogs.confirm(
                              t("transactions.transfer.reverseConfirm"),
                              {
                                confirmText: t("transactions.transfer.reverse"),
                                confirmClass: "btn-danger",
                              },
                            );
                            if (ok) reverse.mutate(h.transferId);
                          }}
                        >
                          <i className="fas fa-undo" aria-hidden="true" />{" "}
                          {t("transactions.transfer.reverse")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </ZtoModal>
  );
}
