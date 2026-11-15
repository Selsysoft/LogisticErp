import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { apiRequest } from "../../../../api/client";
import { useAccountBalances } from "../../../../pages/finance/accountApi";
import { useCurrencies } from "../../../../pages/finance/common";
import { useAccountPlans } from "../../../../pages/finance/settlementApi";
import { useBranchTree } from "../../../branch/branchTree";
import { ZtoModal, currencySymbol, formatMoney, formatN2 } from "../../../components";
import type { PostPaymentPlanningModalProps } from "./index";
import { FixedNotice, useModalText, type Notice } from "./parts";
import {
  OPEN_STATUSES,
  canRemove,
  newRow,
  planBody,
  planTotals,
  remainingDebtByCurrency,
  rowFromPlan,
  summarizeResults,
  validateRows,
  type PlanResult,
  type PlanRow,
} from "./postPlanningLogic";
import { apiErrorInfo, todayIso } from "./settlementFormLogic";

/*
 * "Ödeme Başarılı!" plan sonrası modalı (ZTO `_PostPaymentPlanningModal.cshtml`, payments.js
 * 6090-6371; 12.2a_TASARIM §5.10, OK-12.2a-11). Yeni satırlar DRAFT plan (`POST /payment-plans`),
 * kaldırılan DRAFT/REJECTED planlar `POST /payment-plans/{id}/cancel`. "Banka *" sütunu 12.4'e kadar
 * devre dışı ve zorunlu değildir; Kaynak her yeni satırda "Manuel". Şube/iş yeri seçenekleri ödemenin
 * şirketinin ağacından. Statik arka planlı modalda ilk odak "Evet, Planla" (MWG dialog).
 */

export function PostPaymentPlanningModal({
  show,
  onHide,
  settlement,
  account,
  onSaved,
}: PostPaymentPlanningModalProps) {
  const { tm } = useModalText();
  const client = useQueryClient();
  const titleId = `${useId()}ppTitle`;
  const currencies = useCurrencies();
  const tree = useBranchTree();
  const balances = useAccountBalances(show ? account.id : undefined, {
    groupBy: "COMPANY",
    companyId: settlement.companyId,
  });
  const plans = useAccountPlans(show ? account.id : null, OPEN_STATUSES);
  const [section, setSection] = useState<"A" | "B">("A");
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [cancelled, setCancelled] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const nextIndex = useRef(0);
  const yesRef = useRef<HTMLButtonElement>(null);

  const groups = useMemo(
    () =>
      (tree.data ?? [])
        .filter((company) => company.companyId === settlement.companyId)
        .flatMap((company) => company.groups)
        .filter((group) => group.groupActive)
        .map((group) => ({
          groupId: groupKeyOf(group.groupId),
          groupName: group.groupName,
          branches: group.branches,
        })),
    [tree.data, settlement.companyId],
  );
  const groupOfBranch = useMemo(() => {
    const map = new Map<string, { groupId: string; groupName: string; branchName: string }>();
    for (const company of tree.data ?? []) {
      for (const group of company.groups) {
        for (const branch of group.branches) {
          map.set(branch.id, {
            groupId: groupKeyOf(group.groupId),
            groupName: group.groupName,
            branchName: branch.name,
          });
        }
      }
    }
    return map;
  }, [tree.data]);

  // Açılış: mevcut açık planlar salt okunur satırlar; varsa doğrudan B bölümü.
  const initialized = useRef(false);
  useEffect(() => {
    if (!show) {
      initialized.current = false;
      return;
    }
    if (initialized.current || plans.isPending) return;
    initialized.current = true;
    const existing = (plans.data?.content ?? []).filter((plan) =>
      OPEN_STATUSES.includes(plan.status),
    );
    nextIndex.current = 0;
    const loaded = existing.map((plan) => rowFromPlan(++nextIndex.current, plan));
    setRows(loaded);
    setCancelled([]);
    setErrors([]);
    setSection(loaded.length > 0 ? "B" : "A");
  }, [show, plans.isPending, plans.data]);

  const remaining = remainingDebtByCurrency(balances.data?.rows, settlement.companyId);

  const addRow = () =>
    setRows((current) => [
      ...current,
      newRow(++nextIndex.current, todayIso(), settlement.money.currency),
    ]);

  const showTable = () => {
    setSection("B");
    if (rows.length === 0) addRow();
  };

  const update = (index: number, patch: Partial<PlanRow>) =>
    setRows((current) => current.map((row) => (row.index === index ? { ...row, ...patch } : row)));

  const remove = (row: PlanRow) => {
    if (row.planId) setCancelled((current) => [...current, row.planId as string]);
    setRows((current) => current.filter((item) => item.index !== row.index));
  };

  const close = () => {
    if (!saving) onHide();
  };

  const save = async () => {
    const found = validateRows(rows, account.id);
    if (found.length > 0) {
      setErrors([...new Set(found)].map((key) => tm(`plan.${key}`)));
      return;
    }
    setErrors([]);
    const fresh = rows.filter((row) => !row.readOnly);
    if (fresh.length === 0 && cancelled.length === 0) {
      onHide();
      return;
    }
    setSaving(true);
    const results: PlanResult[] = [];
    for (const row of fresh) {
      try {
        await apiRequest("POST", "/finance/payment-plans", planBody(row, account.id));
        results.push({ ok: true });
      } catch (error) {
        results.push({ ok: false, message: apiErrorInfo(error).message });
      }
    }
    for (const id of cancelled) {
      try {
        await apiRequest("POST", `/finance/payment-plans/${encodeURIComponent(id)}/cancel`, {
          note: tm("plan.cancelNote"),
        });
        results.push({ ok: true });
      } catch (error) {
        results.push({ ok: false, message: apiErrorInfo(error).message });
      }
    }
    setSaving(false);
    await client.invalidateQueries({ queryKey: ["finance"] });
    const summary = summarizeResults(results);
    if (summary.failed === 0) {
      onHide();
      setNotice({ kind: "success", message: tm("plan.saved") });
      onSaved?.();
      return;
    }
    if (summary.success > 0) onSaved?.();
    setErrors([
      summary.success > 0
        ? tm("plan.partial", { success: summary.success, failed: summary.failed })
        : tm("plan.saveFailed"),
      ...summary.messages.map((message) => tm("plan.error", { message })),
    ]);
  };

  const totals = planTotals(rows);

  return (
    <>
      <ZtoModal
        show={show}
        onHide={close}
        bare
        size="xl"
        backdrop="static"
        keyboard={false}
        rootId="postPaymentPlanningModal"
        ariaLabelledBy={titleId}
        onEntered={() => {
          if (section === "A") yesRef.current?.focus();
        }}
      >
        <div
          className="modal-header"
          style={{
            background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
            padding: "15px 20px",
          }}
        >
          <div className="d-flex align-items-center">
            <div
              style={{
                width: 45,
                height: 45,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
              }}
            >
              <i
                className="fas fa-check-circle text-white"
                style={{ fontSize: 22 }}
                aria-hidden="true"
              />
            </div>
            <div>
              <h5 className="modal-title text-white mb-0" style={{ fontWeight: 600 }} id={titleId}>
                <i className="fas fa-money-bill-wave mr-2" aria-hidden="true" />
                {tm("plan.title")}
              </h5>
              <small className="text-white-50">{tm("plan.subtitle")}</small>
            </div>
          </div>
          <button
            type="button"
            className="close text-white"
            aria-label={tm("shared.close")}
            onClick={close}
            disabled={saving}
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>

        <div className="modal-body" style={{ padding: 20 }}>
          <div
            className="alert"
            id="paymentSummaryAlert"
            style={{
              background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
              border: "1px solid #86efac",
              borderRadius: 8,
              marginBottom: 20,
            }}
          >
            <div className="row">
              <div className="col-md-6">
                <div className="d-flex align-items-center mb-2">
                  <i className="fas fa-user-tie text-success mr-2" aria-hidden="true" />
                  <div>
                    <small className="text-muted d-block" style={{ fontSize: 10 }}>
                      {tm("plan.account")}
                    </small>
                    <strong id="ppAccountName" style={{ color: "#166534" }}>
                      {account.name}
                    </strong>
                    <small className="text-muted ml-1" id="ppAccountCode">
                      {account.code}
                    </small>
                  </div>
                </div>
              </div>
              <div className="col-md-6 text-md-right">
                <div className="d-flex align-items-center justify-content-md-end">
                  <i className="fas fa-receipt text-success mr-2" aria-hidden="true" />
                  <div>
                    <small className="text-muted d-block" style={{ fontSize: 10 }}>
                      {tm("plan.paid")}
                    </small>
                    <strong id="ppPaidAmount" style={{ color: "#166534", fontSize: 18 }}>
                      {formatMoney(settlement.money.amount, settlement.money.currency)}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            className="card mb-3"
            style={{
              borderRadius: 8,
              border: "2px solid #f59e0b",
              background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
            }}
          >
            <div className="card-body py-3">
              <div className="row align-items-center">
                <div className="col-md-7">
                  <div className="d-flex align-items-center">
                    <div
                      style={{
                        width: 50,
                        height: 50,
                        borderRadius: 8,
                        background: "linear-gradient(135deg, #f59e0b, #d97706)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 12,
                      }}
                    >
                      <i
                        className="fas fa-exclamation-triangle text-white"
                        style={{ fontSize: 20 }}
                        aria-hidden="true"
                      />
                    </div>
                    <div>
                      <h6 className="mb-0" style={{ color: "#92400e", fontWeight: 600 }}>
                        <i className="fas fa-info-circle mr-1" aria-hidden="true" />
                        {tm("plan.remainingTitle")}
                      </h6>
                      <small className="text-muted">{tm("plan.remainingText")}</small>
                    </div>
                  </div>
                </div>
                <div className="col-md-5 text-md-right mt-2 mt-md-0">
                  <div
                    id="ppRemainingDebtList"
                    style={{
                      background: "#fff",
                      borderRadius: 8,
                      padding: "10px 15px",
                      display: "inline-block",
                      border: "1px solid #fcd34d",
                      minWidth: 150,
                    }}
                  >
                    <small className="text-muted d-block" style={{ fontSize: 10 }}>
                      {tm("plan.remainingList")}
                    </small>
                    <div id="ppRemainingDebtRows">
                      {balances.isPending ? (
                        <span style={{ color: "#9ca3af", fontSize: 13 }}>—</span>
                      ) : balances.isError ? (
                        <span style={{ color: "#9ca3af", fontSize: 13 }}>
                          {tm("plan.loadFailed")}
                        </span>
                      ) : remaining.length === 0 ? (
                        <span style={{ color: "#16a34a", fontSize: 14, fontWeight: 600 }}>
                          {tm("plan.noDebt")}
                        </span>
                      ) : (
                        remaining.map((row) => (
                          <div
                            key={row.currency}
                            style={{ color: "#dc2626", fontSize: 20, fontWeight: 700 }}
                          >
                            {formatMoney(row.amount, row.currency)}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {errors.length > 0 && (
            <div className="alert alert-danger" role="alert">
              {errors.map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          )}

          {section === "A" ? (
            <div id="ppNoPlansSection">
              <div className="text-center mb-3">
                <h5 style={{ color: "#1e3a5f", fontWeight: 600 }}>
                  <i className="fas fa-calendar-plus text-primary mr-2" aria-hidden="true" />
                  {tm("plan.question")}
                </h5>
                <p className="text-muted mb-0" style={{ fontSize: 13 }}>
                  {tm("plan.questionHelp")}
                </p>
              </div>
            </div>
          ) : (
            <div id="ppPlanTableSection">
              <div className="field-group">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <div className="field-group-title mb-0" id="ppPlanTableTitle">
                    <i className="fas fa-list" aria-hidden="true" /> {tm("plan.tableTitle")}
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-success"
                    onClick={addRow}
                    disabled={saving}
                  >
                    <i className="fas fa-plus" aria-hidden="true" /> {tm("plan.addRow")}
                  </button>
                </div>
                <div
                  className="table-responsive"
                  role="region"
                  aria-labelledby="ppPlanTableTitle"
                  tabIndex={0}
                >
                  <table className="table table-sm table-bordered mb-0" id="ppPaymentPlanRows">
                    <thead className="thead-light">
                      <tr>
                        <th style={{ width: 30 }}>#</th>
                        <th>{tm("plan.colDate")}</th>
                        <th>{tm("plan.colAmount")}</th>
                        <th style={{ width: 90 }}>{tm("plan.colCurrency")}</th>
                        <th>{tm("plan.colDescription")}</th>
                        <th>{tm("plan.colGroup")}</th>
                        <th>{tm("plan.colBranch")}</th>
                        <th>{tm("plan.colBank")}</th>
                        <th style={{ width: 70 }}>{tm("plan.colSource")}</th>
                        <th style={{ width: 36 }}>
                          <span className="sr-only">{tm("plan.colDelete")}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody id="ppPaymentPlantbody">
                      {rows.map((row) => (
                        <PlanRowView
                          key={row.index}
                          row={row}
                          groups={groups}
                          currencies={currencies.data ?? []}
                          info={groupOfBranch.get(row.branchId)}
                          onChange={(patch) => update(row.index, patch)}
                          onRemove={() => remove(row)}
                          disabled={saving}
                        />
                      ))}
                    </tbody>
                    <tfoot>
                      {totals.length === 0 ? (
                        <tr className="table-info font-weight-bold">
                          <td colSpan={2}>{tm("plan.total")}</td>
                          <td colSpan={2} id="ppPlanTotalAmount">
                            {formatN2(0)}
                          </td>
                          <td colSpan={6} />
                        </tr>
                      ) : (
                        totals.map((total, index) => (
                          <tr key={total.currency} className="table-info font-weight-bold">
                            <td colSpan={2} style={index > 0 ? { borderTop: 0 } : undefined}>
                              {index === 0 ? tm("plan.total") : ""}
                            </td>
                            <td colSpan={2}>
                              {formatN2(total.total)} {currencySymbol(total.currency)}
                            </td>
                            <td colSpan={6} />
                          </tr>
                        ))
                      )}
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        <div
          className="modal-footer"
          style={{ background: "#f8fafc", padding: "15px 20px", borderTop: "1px solid #e2e8f0" }}
        >
          {section === "A" ? (
            <div id="ppInitialButtons" className="w-100">
              <div className="row">
                <div className="col-6">
                  <button
                    type="button"
                    className="btn btn-lg btn-block"
                    onClick={close}
                    style={{
                      background: "#f1f5f9",
                      color: "#475569",
                      border: "1px solid #cbd5e1",
                      borderRadius: 8,
                      fontWeight: 600,
                    }}
                  >
                    <i className="fas fa-clock mr-2" aria-hidden="true" />
                    {tm("plan.later")}
                  </button>
                </div>
                <div className="col-6">
                  <button
                    ref={yesRef}
                    type="button"
                    className="btn btn-lg btn-block btn-success"
                    onClick={showTable}
                    style={{
                      borderRadius: 8,
                      fontWeight: 600,
                      background: "linear-gradient(135deg, #10b981, #059669)",
                    }}
                  >
                    <i className="fas fa-calendar-plus mr-2" aria-hidden="true" />
                    {tm("plan.yes")}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div id="ppTableButtons" className="w-100">
              <div className="d-flex justify-content-end" style={{ gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={close}
                  disabled={saving}
                  style={{ borderRadius: 8, fontWeight: 600, padding: "10px 24px" }}
                >
                  <i className="fas fa-times mr-2" aria-hidden="true" />
                  {tm("plan.close")}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  id="ppSaveBtn"
                  onClick={() => void save()}
                  disabled={saving}
                  aria-busy={saving || undefined}
                  style={{
                    borderRadius: 8,
                    fontWeight: 600,
                    padding: "10px 24px",
                    background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                  }}
                >
                  <i
                    className={saving ? "fas fa-spinner fa-spin mr-2" : "fas fa-save mr-2"}
                    aria-hidden="true"
                  />
                  {tm("plan.save")}
                </button>
              </div>
            </div>
          )}
        </div>
      </ZtoModal>
      {notice && !show && <FixedNotice notice={notice} onClose={() => setNotice(null)} />}
    </>
  );
}

/** "Diğer" (grupsuz iş yerleri) grubunun kimliği null; seçenek değeri için sabit anahtar. */
function groupKeyOf(groupId: string | null): string {
  return groupId ?? "__other";
}

type Group = {
  groupId: string;
  groupName: string;
  branches: { id: string; name: string; active: boolean }[];
};

function PlanRowView({
  row,
  groups,
  currencies,
  info,
  onChange,
  onRemove,
  disabled,
}: {
  row: PlanRow;
  groups: Group[];
  currencies: { code: string; name: string }[];
  info: { groupId: string; groupName: string; branchName: string } | undefined;
  onChange: (patch: Partial<PlanRow>) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const { tm } = useModalText();
  const label = (column: string) => tm("plan.rowLabel", { index: row.index, column });
  const group = groups.find((item) => item.groupId === row.groupKey);
  const symbol = currencySymbol(row.currency);
  const plain = (text: string) => (
    <span className="form-control-plaintext form-control-sm px-1">{text || "—"}</span>
  );

  return (
    <tr data-row-index={row.index} data-plan-id={row.planId ?? 0} data-source-type={row.source}>
      <td className="text-center align-middle">{row.index}</td>
      <td>
        <input
          type="date"
          className="form-control form-control-sm pp-plan-date"
          value={row.date}
          readOnly={row.readOnly}
          required
          aria-label={label(tm("plan.colDate"))}
          onChange={(event) => onChange({ date: event.target.value })}
          disabled={disabled}
        />
      </td>
      <td>
        <div className="input-group input-group-sm">
          <input
            type="number"
            className="form-control pp-plan-amount"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder={tm("plan.amountPlaceholder")}
            value={row.amount}
            readOnly={row.readOnly}
            required
            aria-label={label(tm("plan.colAmount"))}
            onChange={(event) => onChange({ amount: event.target.value })}
            disabled={disabled}
          />
          <div className="input-group-append">
            <span className="input-group-text pp-plan-currency-symbol">{symbol}</span>
          </div>
        </div>
      </td>
      <td>
        {row.readOnly ? (
          plain(symbol)
        ) : (
          <select
            className="form-control form-control-sm pp-plan-currency no-select2"
            value={row.currency}
            aria-label={label(tm("plan.colCurrency"))}
            onChange={(event) => onChange({ currency: event.target.value })}
            disabled={disabled}
          >
            <option value="">{tm("plan.currencyPlaceholder")}</option>
            {currencies.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currencySymbol(currency.code)}
              </option>
            ))}
          </select>
        )}
      </td>
      <td>
        <input
          type="text"
          className="form-control form-control-sm pp-plan-desc"
          value={row.description}
          readOnly={row.readOnly}
          maxLength={500}
          placeholder={tm("plan.descriptionPlaceholder")}
          aria-label={label(tm("plan.colDescription"))}
          onChange={(event) => onChange({ description: event.target.value })}
          disabled={disabled}
        />
      </td>
      <td>
        {row.readOnly ? (
          plain(info?.groupName ?? "")
        ) : (
          <select
            className="form-control form-control-sm pp-plan-branch no-select2"
            value={row.groupKey}
            aria-label={label(tm("plan.colGroup"))}
            onChange={(event) => onChange({ groupKey: event.target.value, branchId: "" })}
            disabled={disabled}
          >
            <option value="">{tm("plan.groupPlaceholder")}</option>
            {groups.map((item) => (
              <option key={item.groupId} value={item.groupId}>
                {item.groupName}
              </option>
            ))}
          </select>
        )}
      </td>
      <td>
        {row.readOnly ? (
          plain(info?.branchName ?? "")
        ) : (
          <select
            className="form-control form-control-sm pp-plan-workplace no-select2"
            value={row.branchId}
            aria-label={label(tm("plan.colBranch"))}
            onChange={(event) => onChange({ branchId: event.target.value })}
            disabled={disabled || !group}
          >
            <option value="">{tm("plan.branchPlaceholder")}</option>
            {(group?.branches ?? [])
              .filter((branch) => branch.active)
              .map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
          </select>
        )}
      </td>
      <td>
        {row.readOnly ? (
          plain("")
        ) : (
          <>
            <select
              className="form-control form-control-sm pp-plan-bank no-select2"
              disabled
              title={tm("shared.phase124")}
              aria-label={label(tm("plan.colBank"))}
              aria-describedby={`ppBankPhase${row.index}`}
            >
              <option value="">{tm("plan.bankPlaceholder")}</option>
            </select>
            <small id={`ppBankPhase${row.index}`} className="sr-only">
              {tm("shared.phase124")}
            </small>
          </>
        )}
      </td>
      <td className="text-center align-middle">
        <span
          className={`badge badge-sm ${row.source === "INVOICE" ? "badge-warning" : "badge-primary"}`}
        >
          {row.source === "INVOICE" ? tm("plan.invoice") : tm("plan.manual")}
        </span>
      </td>
      <td className="text-center align-middle">
        {canRemove(row) ? (
          <button
            type="button"
            className="btn btn-xs btn-danger"
            aria-label={tm("plan.removeRow")}
            title={tm("plan.removeRow")}
            onClick={onRemove}
            disabled={disabled}
          >
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        ) : (
          <i
            className="fas fa-lock text-muted"
            role="img"
            title={tm("plan.locked")}
            aria-label={tm("plan.locked")}
          />
        )}
      </td>
    </tr>
  );
}
