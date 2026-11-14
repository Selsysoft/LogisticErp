import { CSSProperties, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Fund, FundKind } from "../../../../pages/finance/types";
import { ZtoModal } from "../../../components";
import { fundActivityPath } from "../../navItems";
import { defaultActivityRange, validateActivity } from "./activityLogic";
import { activityFundLabel, todayIso } from "./fundTransactionsLogic";

const ORANGE = "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)";
const HEADER_ICON: CSSProperties = {
  width: 48,
  height: 48,
  background: "rgba(255,255,255,0.2)",
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginRight: 16,
};
const LABEL: CSSProperties = { fontWeight: 600, fontSize: 13, color: "#475569" };
const FOOTER: CSSProperties = { background: "#f8fafc", borderRadius: "0 0 12px 12px" };

export type ActivityReportModalProps = {
  kind: FundKind;
  show: boolean;
  onHide: () => void;
  funds: readonly Fund[];
  /** Açılışta seçili fon (süzgeçteki). */
  initialFundId: string;
};

/**
 * BT-3 / CT-2 Faaliyet Raporu modalı (ZTO BankTransactions/Index.cshtml:574-657 + openActivityReport
 * :774-794; CashTransactions/Index.cshtml:534-600). "Raporu Göster/Aç" FIFO raporunu yeni sekmede açar.
 * Doğrulama metni ZTO `alert` yerine alan altında `role="alert"` (MWG: hata görünür metin + odak).
 */
export function ActivityReportModal({
  kind,
  show,
  onHide,
  funds,
  initialFundId,
}: ActivityReportModalProps) {
  const { t } = useTranslation("ztoFinans");
  const titleId = useId();
  const bank = kind === "BANK";
  const today = todayIso();
  const [fundId, setFundId] = useState(initialFundId);
  const [range, setRange] = useState(() => defaultActivityRange(today));
  const [error, setError] = useState<string | null>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const a = (key: string) => t(`fundTransactions.activity.${key}`);
  const typeLabel = (fund: Fund) => t(`funds.common.accountTypes.${fund.accountType ?? "DEMAND"}`);

  const open = () => {
    const problem = validateActivity(fundId, range.from, range.to);
    if (problem) {
      setError(
        problem === "fundRequired" ? a(bank ? "fundRequiredBank" : "fundRequiredCash") : a(problem),
      );
      if (problem === "fundRequired") selectRef.current?.focus();
      return;
    }
    window.open(fundActivityPath(fundId, range), "_blank", "noopener");
    onHide();
  };

  const errorId = `${titleId}-error`;
  const select = (
    <select
      ref={selectRef}
      id={bank ? "activityReportBank" : "activityReportCash"}
      className="form-control no-select2"
      style={{
        borderRadius: 8,
        border: bank ? "1px solid #e2e8f0" : "2px solid #fde68a",
        fontSize: 13,
      }}
      value={fundId}
      aria-invalid={error !== null && !fundId}
      aria-describedby={error !== null && !fundId ? errorId : undefined}
      onChange={(event) => {
        setFundId(event.target.value);
        setError(null);
      }}
    >
      <option value="">{bank ? a("allBanks") : a("chooseCash")}</option>
      {funds.map((fund) => (
        <option key={fund.id} value={fund.id}>
          {activityFundLabel(fund, kind, typeLabel(fund))}
        </option>
      ))}
    </select>
  );
  const dateInput = (field: "from" | "to", id: string, label?: string) => (
    <input
      type="date"
      id={id}
      className="form-control"
      aria-label={label}
      value={range[field]}
      style={{
        borderRadius: 8,
        border: bank ? "1px solid #e2e8f0" : "2px solid #fde68a",
        padding: bank ? 10 : undefined,
        fontSize: 13,
      }}
      onChange={(event) => {
        setRange((current) => ({ ...current, [field]: event.target.value }));
        setError(null);
      }}
    />
  );

  return (
    <ZtoModal
      show={show}
      onHide={onHide}
      size={undefined}
      centered={!bank}
      rootId={bank ? "activityReportModal" : "cashActivityReportModal"}
      bare
      ariaLabelledBy={titleId}
      dialogClassName={bank ? "modal-md" : undefined}
      onEntered={() => selectRef.current?.focus()}
    >
      <div
        className="modal-header"
        style={{
          background: ORANGE,
          color: "white",
          borderRadius: "12px 12px 0 0",
          padding: bank ? "20px 24px" : undefined,
        }}
      >
        <div className="d-flex align-items-center">
          <div style={HEADER_ICON} aria-hidden="true">
            <i
              className={`fas ${bank ? "fa-chart-bar" : "fa-chart-line"}`}
              style={{ fontSize: 24 }}
            />
          </div>
          <div>
            <h5
              className="modal-title mb-0"
              id={titleId}
              style={{ fontWeight: 600, fontSize: bank ? 18 : undefined }}
            >
              {a(bank ? "titleBank" : "titleCash")}
            </h5>
            <small style={{ opacity: 0.9, fontSize: bank ? 13 : undefined }}>
              {a(bank ? "subtitleBank" : "subtitleCash")}
            </small>
          </div>
        </div>
        <button
          type="button"
          className="close text-white"
          style={{ opacity: 1 }}
          aria-label={a("cancel")}
          onClick={onHide}
        >
          <i className="fas fa-times" aria-hidden="true" />
        </button>
      </div>
      <div className="modal-body" style={{ padding: 24 }}>
        {bank ? (
          <>
            <div className="mb-4">
              <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
                <i className="fas fa-info-circle mr-2 text-warning" aria-hidden="true" />
                {a("infoBank")}
              </p>
            </div>
            <div className="form-group">
              <label className="form-label" style={LABEL} htmlFor="activityReportBank">
                <i className="fas fa-university mr-2" aria-hidden="true" />
                {a("selectBank")}
              </label>
              {select}
            </div>
            <div className="form-group">
              <span className="form-label d-block" style={LABEL} id={`${titleId}-range`}>
                <i className="fas fa-calendar mr-2" aria-hidden="true" />
                {a("range")}
              </span>
              <div className="row" role="group" aria-labelledby={`${titleId}-range`}>
                <div className="col-6">
                  {dateInput("from", "activityReportStartDate", a("rangeStart"))}
                </div>
                <div className="col-6">
                  {dateInput("to", "activityReportEndDate", a("rangeEnd"))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="form-group">
              <label style={LABEL} htmlFor="activityReportCash">
                <i className="fas fa-cash-register mr-2 text-warning" aria-hidden="true" />
                {a("selectCash")}
              </label>
              {select}
            </div>
            <div className="row">
              <div className="col-md-6">
                <div className="form-group">
                  <label style={LABEL} htmlFor="activityReportStartDate">
                    <i className="fas fa-calendar mr-2 text-warning" aria-hidden="true" />
                    {a("start")}
                  </label>
                  {dateInput("from", "activityReportStartDate")}
                </div>
              </div>
              <div className="col-md-6">
                <div className="form-group">
                  <label style={LABEL} htmlFor="activityReportEndDate">
                    <i className="fas fa-calendar mr-2 text-warning" aria-hidden="true" />
                    {a("end")}
                  </label>
                  {dateInput("to", "activityReportEndDate")}
                </div>
              </div>
            </div>
            <div
              className="alert alert-info"
              style={{
                fontSize: 12,
                borderLeft: "4px solid #f59e0b",
                background: "#fffbeb",
                color: "#92400e",
                borderRadius: 8,
              }}
            >
              <i className="fas fa-info-circle mr-2" aria-hidden="true" />
              {a("infoCash")}
            </div>
          </>
        )}
        {error && (
          <div id={errorId} className="invalid-feedback d-block" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="modal-footer" style={{ ...FOOTER, padding: bank ? "16px 24px" : undefined }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onHide}>
          <i className="fas fa-times mr-1" aria-hidden="true" />
          {a("cancel")}
        </button>
        <button
          type="button"
          className="btn btn-warning btn-sm"
          style={bank ? { fontWeight: 600 } : undefined}
          onClick={open}
        >
          <i className={`fas ${bank ? "fa-chart-bar" : "fa-chart-line"} mr-1`} aria-hidden="true" />
          {a(bank ? "show" : "open")}
        </button>
      </div>
    </ZtoModal>
  );
}
