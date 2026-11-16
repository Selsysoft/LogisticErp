import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ZtoModal } from "../../../components";
import { checkDetailedReportPath } from "../../navItems";
import { todayIso } from "../fundTransactions/fundTransactionsLogic";
import { firstOfMonth, validateReportRange } from "./checkReportLogic";

type Props = {
  show: boolean;
  onHide: () => void;
  /** Rapor yeni sekmede açılır (test için değiştirilebilir). */
  openWindow?: (url: string) => void;
};

/**
 * M7 "Detaylı Çek Raporu" (ZTO Checks.cshtml:2648-2680 + openCheckDetailedReportModal :5484-5520;
 * 12.3 §5.4). Varsayılan aralık ayın ilk günü … bugün (ZTO JS); başlangıç > bitiş ise ileti ve gönderim
 * yok. "Raporu Görüntüle" kabuksuz rapor sayfasını yeni sekmede açar.
 */
export function CheckReportModal({ show, onHide, openWindow }: Props) {
  const { t } = useTranslation("ztoFinans");
  const r = (key: string) => t(`checks.report.${key}`);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const startRef = useRef<HTMLInputElement>(null);

  // ZTO: alan boşsa açılışta doldurulur (son seçim korunur).
  useEffect(() => {
    if (!show) return;
    const today = todayIso();
    setFrom((value) => value || firstOfMonth(today));
    setTo((value) => value || today);
    setError(null);
  }, [show]);

  const view = () => {
    const key = validateReportRange(from, to);
    if (key) {
      setError(t(key));
      startRef.current?.focus();
      return;
    }
    const url = checkDetailedReportPath({ from, to });
    onHide();
    (openWindow ?? ((target: string) => window.open(target, "_blank", "noopener")))(url);
  };

  return (
    <ZtoModal
      show={show}
      onHide={onHide}
      centered
      rootId="checkDetailedReportModal"
      headerClassName="bg-primary text-white"
      closeButtonClassName="text-white"
      title={
        <>
          <i className="fas fa-chart-bar mr-2" aria-hidden="true" /> {r("modalTitle")}
        </>
      }
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onHide}>
            {r("cancel")}
          </button>
          <button type="button" className="btn btn-primary" onClick={view}>
            <i className="fas fa-search mr-1" aria-hidden="true" />
            {r("view")}
          </button>
        </>
      }
    >
      <div className="form-group">
        <label htmlFor="reportStartDate">
          <strong>{r("start")}</strong>
        </label>
        <input
          type="date"
          className="form-control"
          id="reportStartDate"
          ref={startRef}
          value={from}
          required
          aria-invalid={!!error}
          aria-describedby={error ? "reportDateError" : undefined}
          onChange={(event) => {
            setFrom(event.target.value);
            setError(null);
          }}
        />
      </div>
      <div className="form-group mb-0">
        <label htmlFor="reportEndDate">
          <strong>{r("end")}</strong>
        </label>
        <input
          type="date"
          className="form-control"
          id="reportEndDate"
          value={to}
          required
          aria-invalid={!!error}
          aria-describedby={error ? "reportDateError" : undefined}
          onChange={(event) => {
            setTo(event.target.value);
            setError(null);
          }}
        />
      </div>
      {error && (
        <div className="alert alert-warning mt-2 mb-0" id="reportDateError" role="alert">
          <i className="fas fa-exclamation-triangle" aria-hidden="true" /> {error}
        </div>
      )}
      <small className="text-muted d-block mt-2">{r("note")}</small>
    </ZtoModal>
  );
}
