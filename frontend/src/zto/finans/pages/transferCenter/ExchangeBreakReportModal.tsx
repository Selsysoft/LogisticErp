import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ZtoModal } from "../../../components";
import { exchangeBreakReportPath } from "../../navItems";
import { defaultRange } from "./transferCenterLogic";

type Props = { show: boolean; onHide: () => void };

/**
 * BS-1 "Döviz Bozum & Tahsilat İzlenebilirliği" (ZTO BS:850-886, bsjs :4282-4296): Başlangıç (−7) /
 * Bitiş (+1); "Raporu Görüntüle" raporu yeni sekmede açar.
 */
export function ExchangeBreakReportModal({ show, onHide }: Props) {
  const { t } = useTranslation("ztoFinans");
  const tc = (key: string) => t(`transferCenter.reportModal.${key}`);
  const [range, setRange] = useState(defaultRange);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (show) {
      setRange(defaultRange());
      setError(null);
    }
  }, [show]);

  function open() {
    if (!range.from || !range.to) {
      setError(tc("rangeRequired"));
      return;
    }
    window.open(exchangeBreakReportPath(range), "_blank", "noopener");
    onHide();
  }

  return (
    <ZtoModal
      show={show}
      onHide={onHide}
      // Yalnız kökte (rootId); aynı id .modal-dialog'da da olunca DOM'da iki kez geçiyordu.
      rootId="exchangeBreakReportModal"
      title={
        <>
          <i className="fas fa-project-diagram mr-2" aria-hidden="true" />
          {tc("title")}
        </>
      }
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onHide}>
            {tc("cancel")}
          </button>
          <button
            type="button"
            className="btn btn-success btn-sm"
            id="btnGoToExchangeBreakReport"
            onClick={open}
          >
            <i className="fas fa-chart-bar mr-1" aria-hidden="true" /> {tc("view")}
          </button>
        </>
      }
    >
      <p className="text-muted small">{tc("text")}</p>
      {error && (
        <div className="alert alert-danger py-1 small" role="alert">
          {error}
        </div>
      )}
      <div className="form-group row align-items-center">
        <label className="col-sm-4 col-form-label col-form-label-sm" htmlFor="ebStartDate">
          {tc("startDate")}
        </label>
        <div className="col-sm-8">
          <input
            type="date"
            id="ebStartDate"
            className="form-control form-control-sm"
            value={range.from}
            onChange={(event) => setRange((r) => ({ ...r, from: event.target.value }))}
          />
        </div>
      </div>
      <div className="form-group row align-items-center">
        <label className="col-sm-4 col-form-label col-form-label-sm" htmlFor="ebEndDate">
          {tc("endDate")}
        </label>
        <div className="col-sm-8">
          <input
            type="date"
            id="ebEndDate"
            className="form-control form-control-sm"
            value={range.to}
            onChange={(event) => setRange((r) => ({ ...r, to: event.target.value }))}
          />
        </div>
      </div>
    </ZtoModal>
  );
}
