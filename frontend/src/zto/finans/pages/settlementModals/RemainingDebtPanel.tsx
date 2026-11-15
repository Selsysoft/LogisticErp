import { useId, useMemo, useState, type ReactNode } from "react";
import { useAccount, useAccountBalances } from "../../../../pages/finance/accountApi";
import { useAccountPlans } from "../../../../pages/finance/settlementApi";
import { invoiceGapText, isMissing } from "../../../../pages/finance/settlementWarnings";
import { currencySymbol, formatMoney, formatN2 } from "../../../components";
import type { RemainingDebtPanelProps } from "./index";
import {
  INFO_NOTE_STYLE,
  WORKPLACE_GRADIENT,
  approvalBadge,
  approvalGradient,
  approvalState,
  balanceCardStyle,
  branchBalances,
  cardColor,
  currenciesOf,
  dateStatus,
  infoNoteKind,
  planSummary,
  planningBadge,
  planningGradient,
  timelineSteps,
  type Badge,
} from "./panelLogic";
import { useBranchName, useModalText } from "./parts";
import { remainingDebtByCurrency } from "./postPlanningLogic";
import { dottedDate, todayIso } from "./settlementFormLogic";

/*
 * Kalan borç ve planlama paneli (ZTO `#remainingDebtInfo`, payments.js buildDetailedDebtInfoHtml
 * 4560-4777; 12.2a_TASARIM §5.9, S-14). Kaynaklar: cari kartı, şirket (+ akordeon 1 açılınca iş yeri)
 * kırılımlı bakiye, açık ödeme planları; altında 12.2 eksik fatura satırı. ZTO'nun bağlam uyarıları
 * (showContextualWarnings) modal içinde toast olmadığından panelde not satırıdır (MWG
 * persistent-toast-notifications). Akordeonlar Bootstrap collapse düğmeleri (`aria-expanded`,
 * `aria-controls`; ok tuşu gezinmesi yok — MWG accordion).
 */

function BadgeView({ badge, text }: { badge: Badge; text: string }) {
  return (
    <span
      className={`badge ${badge.className}`}
      style={{ fontSize: 10, color: "white", padding: "4px 8px" }}
    >
      <i className={`fas ${badge.icon} mr-1`} style={{ color: "white" }} aria-hidden="true" />
      {text}
    </span>
  );
}

function AccordionItem({
  id,
  index,
  open,
  onToggle,
  background,
  icon,
  title,
  badge,
  children,
}: {
  id: string;
  index: number;
  open: boolean;
  onToggle: () => void;
  background: string;
  icon: string;
  title: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const collapseId = `${id}_collapse${index}`;
  const headingId = `${id}_heading${index}`;
  return (
    <div className="accordion-item" style={{ border: "none", marginBottom: 8 }}>
      <div className="accordion-header" id={headingId}>
        <button
          className={open ? "accordion-btn" : "accordion-btn collapsed"}
          type="button"
          aria-expanded={open}
          aria-controls={collapseId}
          onClick={onToggle}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 12px",
            background,
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          <span
            className="text-white"
            style={{
              display: "flex",
              alignItems: "center",
              color: "#ffffff",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <i className={`fas ${icon} mr-2`} aria-hidden="true" /> {title}
            {badge}
          </span>
          <i
            className={`fas ${open ? "fa-chevron-up" : "fa-chevron-down"} accordion-icon`}
            style={{ color: "#ffffff", fontSize: 11, transition: "transform 0.3s" }}
            aria-hidden="true"
          />
        </button>
      </div>
      <div
        id={collapseId}
        className={open ? "collapse show" : "collapse"}
        aria-labelledby={headingId}
      >
        <div
          className="accordion-body"
          style={{
            padding: 12,
            background: "#f8fafc",
            borderRadius: "0 0 6px 6px",
            border: "1px solid #e2e8f0",
            borderTop: "none",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function RemainingDebtPanel({ accountId, companyId }: RemainingDebtPanelProps) {
  const { tm, tr } = useModalText();
  const uniqueId = `debtAccordion_${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const toggle = (index: number) =>
    setOpen((current) => ({ ...current, [index]: !current[index] }));

  const account = useAccount(accountId);
  const balances = useAccountBalances(accountId, { groupBy: "COMPANY", companyId });
  const branchRows = useAccountBalances(open[1] ? accountId : undefined, {
    groupBy: "BRANCH",
    companyId,
  });
  const plans = useAccountPlans(accountId);
  const branchName = useBranchName();
  const today = todayIso();

  const summary = useMemo(() => planSummary(plans.data?.content, today), [plans.data, today]);
  const currencies = currenciesOf(balances.data?.rows);
  const [pickedCurrency, setPickedCurrency] = useState<string | null>(null);
  const mainCurrency =
    account.data?.defaultCurrency ?? currencies[0] ?? summary.plan?.money.currency ?? "TRY";
  const workplaceCurrency =
    pickedCurrency && currencies.includes(pickedCurrency)
      ? pickedCurrency
      : (currencies[0] ?? null);

  if (account.isPending || balances.isPending || plans.isPending) {
    return (
      <div
        className="card"
        style={{
          borderRadius: 8,
          marginBottom: 15,
          background: "white",
          border: "1px solid #e2e8f0",
        }}
      >
        <div className="card-body text-center py-4" role="status">
          <i className="fas fa-spinner fa-spin fa-2x text-primary" aria-hidden="true" />
          <p className="mb-0 mt-2 text-muted">{tm("debtPanel.loading")}</p>
        </div>
      </div>
    );
  }
  const failure = account.error ?? balances.error ?? plans.error;
  if (failure || !account.data) {
    return (
      <div
        className="alert alert-danger"
        role="alert"
        style={{ borderRadius: 8, borderLeft: "4px solid #ef4444" }}
      >
        <i className="fas fa-exclamation-triangle" aria-hidden="true" />{" "}
        <strong>{tm("debtPanel.connectionError")}</strong>{" "}
        {tm("debtPanel.connectionErrorText", {
          message: failure instanceof Error ? failure.message : "",
        })}
      </div>
    );
  }

  const data = account.data;
  const color = cardColor(summary);
  const hasDebt = remainingDebtByCurrency(balances.data?.rows, companyId).length > 0;
  const noteKind = infoNoteKind(summary, hasDebt);
  const note = INFO_NOTE_STYLE[noteKind];
  const approval = approvalState(summary);
  const planMoney = summary.plan
    ? formatMoney(summary.plan.money.amount, summary.plan.money.currency)
    : "";
  const gaps = (balances.data?.invoiceGaps ?? [])
    .filter(isMissing)
    .filter((gap) => (companyId === null ? gap.companyId === null : gap.companyId === companyId));
  const workplaces = workplaceCurrency
    ? branchBalances(branchRows.data?.rows, workplaceCurrency)
    : [];
  const noteValues = {
    count: Math.abs(summary.daysRemaining),
  };

  return (
    <div
      className="card"
      style={{
        borderRadius: 8,
        borderLeft: `4px solid ${color}`,
        marginBottom: 15,
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      <div
        className="card-header py-2"
        style={{
          background: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <div className="d-flex justify-content-between align-items-center flex-wrap">
          <div className="d-flex align-items-center">
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 6,
                background: `linear-gradient(135deg, ${color}, ${color})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 10,
              }}
            >
              <i
                className="fas fa-user-tie text-white"
                style={{ fontSize: 14 }}
                aria-hidden="true"
              />
            </div>
            <div>
              <h6 className="mb-0" style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                {data.code} - {data.name}
              </h6>
              <small className="text-muted" style={{ fontSize: 10 }}>
                <i className="fas fa-tag" aria-hidden="true" /> {data.subGroupName} |{" "}
                <i className="fas fa-coins" aria-hidden="true" />{" "}
                {tm("debtPanel.currencyLabel", { symbol: currencySymbol(mainCurrency) })}
              </small>
            </div>
          </div>
          <div className="d-flex align-items-center gap-2 mt-2 mt-md-0">
            <BadgeView
              badge={planningBadge(summary)}
              text={tm(`debtPanel.${planningBadge(summary).key}`)}
            />{" "}
            <BadgeView
              badge={approvalBadge(approval)}
              text={tm(`debtPanel.${approvalBadge(approval).key}`)}
            />
          </div>
        </div>
      </div>

      <div className="card-body py-2">
        <div className="accordion" id={uniqueId}>
          <AccordionItem
            id={uniqueId}
            index={1}
            open={!!open[1]}
            onToggle={() => toggle(1)}
            background={WORKPLACE_GRADIENT}
            icon="fa-industry"
            title={tm("debtPanel.workPlaceTitle")}
          >
            <div className="mb-3 pb-2" style={{ borderBottom: "1px solid #e2e8f0" }}>
              <small className="text-muted d-block mb-2" style={{ fontSize: 10, fontWeight: 600 }}>
                <i className="fas fa-filter" aria-hidden="true" /> {tm("debtPanel.currencyFilter")}
              </small>
              <div id={`workPlaceCurrencyButtons_${uniqueId}`} className="d-flex flex-wrap">
                {currencies.length === 0 ? (
                  <small className="text-muted" style={{ fontSize: 10 }}>
                    {tm("debtPanel.noCurrency")}
                  </small>
                ) : (
                  currencies.map((code) => {
                    const active = code === workplaceCurrency;
                    return (
                      <button
                        key={code}
                        type="button"
                        className={
                          active ? "workplace-currency-btn active" : "workplace-currency-btn"
                        }
                        aria-pressed={active}
                        title={code}
                        onClick={() => setPickedCurrency(code)}
                      >
                        <i
                          className="fas fa-coins mr-1"
                          style={{ fontSize: 9, color: active ? "white" : undefined }}
                          aria-hidden="true"
                        />
                        {currencySymbol(code)}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
            <div
              id={`workPlaceBalancesContainer_${uniqueId}`}
              style={{ maxHeight: 150, overflowY: "auto" }}
              tabIndex={0}
              role="region"
              aria-label={tm("debtPanel.workPlaceTitle")}
            >
              {branchRows.isPending ? (
                <div className="text-center py-3" role="status">
                  <i className="fas fa-spinner fa-spin text-primary" aria-hidden="true" />
                  <p className="mb-0 mt-2 text-muted" style={{ fontSize: 11 }}>
                    {tm("debtPanel.workPlaceLoading")}
                  </p>
                </div>
              ) : workplaces.length === 0 ? (
                <div className="text-center text-muted py-2" style={{ fontSize: 11 }}>
                  {tm("debtPanel.workPlaceEmpty")}
                </div>
              ) : (
                workplaces.map((wp) => {
                  const style = balanceCardStyle(wp.sign);
                  const symbol = currencySymbol(workplaceCurrency);
                  return (
                    <div
                      key={wp.branchId}
                      className="workplace-balance-card"
                      style={{
                        border: `1px solid ${style.border}`,
                        background: style.bg,
                        borderRadius: 6,
                        padding: 10,
                        marginBottom: 8,
                      }}
                    >
                      <div className="d-flex justify-content-between align-items-center">
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 12,
                              color: "#1e293b",
                              marginBottom: 4,
                            }}
                          >
                            <i
                              className="fas fa-industry mr-1"
                              style={{ color: "#64748b" }}
                              aria-hidden="true"
                            />
                            {branchName(wp.branchId) || "-"}
                          </div>
                          <div className="row" style={{ fontSize: 10 }}>
                            <Amount label={tm("debtPanel.debt")} className="text-danger">
                              {formatN2(wp.debt)} {symbol}
                            </Amount>
                            <Amount label={tm("debtPanel.payment")} className="text-success">
                              {formatN2(wp.payment)} {symbol}
                            </Amount>
                            <Amount label={tm("debtPanel.receivable")} className="text-primary">
                              {formatN2(wp.receivable)} {symbol}
                            </Amount>
                            <Amount label={tm("debtPanel.collection")} className="text-info">
                              {formatN2(wp.collection)} {symbol}
                            </Amount>
                          </div>
                        </div>
                        <div
                          className="text-right"
                          style={{
                            minWidth: 120,
                            paddingLeft: 10,
                            borderLeft: `2px solid ${style.border}`,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 9,
                              color: "#64748b",
                              textTransform: "uppercase",
                              marginBottom: 2,
                            }}
                          >
                            {tm("debtPanel.net")}
                          </div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: style.color }}>
                            {formatN2(wp.net)} {symbol}
                          </div>
                          <span
                            className={`badge ${style.badge} text-white`}
                            style={{ fontSize: 9, padding: "2px 6px", marginTop: 2 }}
                          >
                            {wp.sign > 0
                              ? tm("debtPanel.netCredit")
                              : wp.sign < 0
                                ? tm("debtPanel.netDebt")
                                : tm("debtPanel.netZero")}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </AccordionItem>

          <AccordionItem
            id={uniqueId}
            index={2}
            open={!!open[2]}
            onToggle={() => toggle(2)}
            background={planningGradient(summary)}
            icon="fa-calendar-alt"
            title={tm("debtPanel.planningTitle")}
            badge={
              summary.plan ? (
                <span
                  className="badge badge-light ml-2"
                  style={{ color: "black", fontSize: 9, padding: "2px 6px" }}
                >
                  {dottedDate(summary.plan.dueDate)}
                </span>
              ) : undefined
            }
          >
            {summary.plan ? (
              <PlanningContent
                summary={summary}
                planMoney={planMoney}
                branchName={branchName(summary.plan.branchId)}
              />
            ) : (
              <div style={{ textAlign: "center", padding: 20 }}>
                <i className="fas fa-calendar-times fa-2x text-muted mb-2" aria-hidden="true" />
                <p className="mb-0 text-muted" style={{ fontSize: 12 }}>
                  {tm("debtPanel.noPlan")}
                </p>
              </div>
            )}
          </AccordionItem>

          {summary.hasPlan && (
            <AccordionItem
              id={uniqueId}
              index={3}
              open={!!open[3]}
              onToggle={() => toggle(3)}
              background={approvalGradient(summary)}
              icon="fa-tasks"
              title={tm("debtPanel.approvalTitle")}
              badge={
                <span
                  className="badge badge-light ml-2"
                  style={{ color: "black", fontSize: 9, padding: "2px 6px" }}
                >
                  {tm(`debtPanel.${approvalBadge(approval).key}`)}
                </span>
              }
            >
              <div style={{ background: "#ffffff", padding: 10, borderRadius: 6 }}>
                {timelineSteps(summary).map((step, index, steps) => {
                  const lit = step.completed || step.active;
                  return (
                    <div
                      key={step.key}
                      className="d-flex align-items-start mb-2"
                      style={{ position: "relative" }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "50%",
                          background: lit ? step.color : "#e2e8f0",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          zIndex: 2,
                        }}
                      >
                        <i
                          className={`fas ${step.icon}`}
                          style={{ fontSize: 12, color: lit ? "#ffffff" : "#94a3b8" }}
                          aria-hidden="true"
                        />
                      </div>
                      {index < steps.length - 1 && (
                        <div
                          style={{
                            position: "absolute",
                            left: 15,
                            top: 32,
                            width: 2,
                            height: "calc(100% + 8px)",
                            background: lit ? step.color : "#e2e8f0",
                            zIndex: 1,
                          }}
                        />
                      )}
                      <div className="ml-3 flex-grow-1" style={{ paddingBottom: 8 }}>
                        <strong style={{ fontSize: 12, color: lit ? "#1e293b" : "#94a3b8" }}>
                          {tm(`debtPanel.${step.key}`)}
                        </strong>
                        {step.active && !step.completed && (
                          <span className="badge badge-warning ml-2" style={{ fontSize: 9 }}>
                            {tm("debtPanel.waiting")}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </AccordionItem>
          )}
        </div>

        <div className="mt-2">
          <div
            style={{
              background: note.bg,
              padding: "10px 15px",
              borderRadius: 6,
              borderLeft: `3px solid ${note.border}`,
            }}
          >
            <small style={{ color: note.color, fontSize: 11 }}>
              <i className={`fas ${note.icon} mr-1`} aria-hidden="true" />
              <strong>{tm("debtPanel.noteLead")}</strong>{" "}
              {tm(`debtPanel.note${noteKind[0].toUpperCase()}${noteKind.slice(1)}`, noteValues)}
            </small>
          </div>
        </div>

        {(summary.isOverdue || summary.isToday || summary.hasApprovalPending) && (
          <div className="mt-2" role="note">
            {summary.isOverdue && summary.plan && (
              <div className="alert alert-warning py-1 px-2 mb-1" style={{ fontSize: 12 }}>
                {tm("debtPanel.alertOverdue", {
                  date: dottedDate(summary.plan.dueDate),
                  count: Math.abs(summary.daysRemaining),
                })}
              </div>
            )}
            {summary.isToday && (
              <div className="alert alert-warning py-1 px-2 mb-1" style={{ fontSize: 12 }}>
                {tm("debtPanel.alertToday", { amount: planMoney })}
              </div>
            )}
            {summary.hasApprovalPending && (
              <div className="alert alert-info py-1 px-2 mb-1" style={{ fontSize: 12 }}>
                {tm("debtPanel.alertPending", {
                  amount: formatMoney(
                    summary.pendingAmount,
                    summary.plan?.money.currency ?? mainCurrency,
                  ),
                })}
              </div>
            )}
          </div>
        )}

        {gaps.length > 0 && (
          <div className="mt-2" role="note">
            {gaps.map((gap) => (
              <small
                key={`${gap.side}-${gap.currency}-${gap.companyId ?? ""}`}
                className="d-block text-warning"
              >
                {invoiceGapText(gap, formatMoney, (key, values) => tr(key, values))}
              </small>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Amount({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <div className="col-3">
      <span className="text-muted">{label}</span> <strong className={className}>{children}</strong>
    </div>
  );
}

function PlanningContent({
  summary,
  planMoney,
  branchName,
}: {
  summary: ReturnType<typeof planSummary>;
  planMoney: string;
  branchName: string;
}) {
  const { tm } = useModalText();
  const status = dateStatus(summary);
  const plan = summary.plan;
  if (!plan) return null;
  const statusText = summary.isOverdue
    ? tm("debtPanel.daysOverdue", { count: Math.abs(summary.daysRemaining) })
    : summary.isToday
      ? tm("debtPanel.dueToday")
      : tm("debtPanel.daysLeft", { count: summary.daysRemaining });
  return (
    <div
      style={{
        background: status.bg,
        padding: 15,
        borderRadius: 6,
        borderLeft: `4px solid ${status.border}`,
      }}
    >
      <div className="row" style={{ fontSize: 12 }}>
        <div className="col-md-3 col-6 mb-2">
          <PlanLabel icon={`fa-calendar-day ${status.className}`}>
            {tm("debtPanel.planDate")}
          </PlanLabel>
          <div style={{ fontSize: 15, fontWeight: 700 }} className={status.className}>
            {dottedDate(plan.dueDate)}
          </div>
          <div className={status.className} style={{ fontSize: 11, fontWeight: 600 }}>
            <i className={`fas ${status.icon} mr-1`} aria-hidden="true" />
            {statusText}
          </div>
        </div>
        <div className="col-md-3 col-6 mb-2">
          <PlanLabel icon="fa-coins text-primary">{tm("debtPanel.planAmount")}</PlanLabel>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1e40af" }}>{planMoney}</div>
        </div>
        <div className="col-md-3 col-6 mb-2">
          <PlanLabel icon="fa-map-marker-alt text-secondary">
            {tm("debtPanel.planBranch")}
          </PlanLabel>
          <div style={{ fontSize: 12, color: "#334155" }}>
            <span className="text-muted">-</span>
          </div>
        </div>
        <div className="col-md-3 col-6 mb-2">
          <PlanLabel icon="fa-building text-secondary">{tm("debtPanel.planWorkPlace")}</PlanLabel>
          <div style={{ fontSize: 12, color: "#334155" }}>
            {branchName || <span className="text-muted">-</span>}
          </div>
        </div>
      </div>
      <div className="row mt-2" style={{ fontSize: 12 }}>
        <div className="col-md-6 col-12 mb-2">
          <PlanLabel icon="fa-university text-secondary">{tm("debtPanel.planBank")}</PlanLabel>
          <div style={{ fontSize: 12, color: "#334155" }}>
            <span className="text-muted">{tm("debtPanel.unspecified")}</span>
          </div>
        </div>
        <div className="col-md-6 col-12 mb-2">
          <PlanLabel icon="fa-comment text-secondary">{tm("debtPanel.planDescription")}</PlanLabel>
          <div style={{ fontSize: 12, color: "#334155" }}>
            {plan.description || <span className="text-muted">-</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanLabel({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="d-flex align-items-center mb-1">
      <i className={`fas ${icon} mr-1`} style={{ fontSize: 11 }} aria-hidden="true" />
      <strong style={{ fontSize: 10, color: "#64748b" }}>{children}</strong>
    </div>
  );
}
