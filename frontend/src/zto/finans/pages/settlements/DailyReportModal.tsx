import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SettlementType } from "../../../../pages/finance/types";
import { ZtoBranchMultiSelect, ZtoModal } from "../../../components";
import { dailySettlementReportPath } from "../../navItems";
import { todayIso } from "../fundTransactions/fundTransactionsLogic";

type Props = {
  type: SettlementType;
  show: boolean;
  onHide: () => void;
};

/**
 * "Günlük Ödeme Raporu" / "Günlük Tahsilat Raporu" modalı (ZTO Payments.cshtml:450-535,
 * Collections.cshtml:477-560; açılış betiği :1956-2071). Rapor tarihi + şube gruplu iş yeri çoklu
 * seçimi (`dpr`/`dcr` önekli ZTO işaretlemesi); "… Raporu Al" raporu yeni sekmede açar.
 */
export function DailyReportModal({ type, show, onHide }: Props) {
  const { t } = useTranslation("ztoFinans");
  const ns = type === "PAYMENT" ? "payments" : "collections";
  const prefix = type === "PAYMENT" ? "dpr" : "dcr";
  const dateId = type === "PAYMENT" ? "dailyPaymentReportDate" : "dailyCollectionReportDate";
  const [date, setDate] = useState(todayIso());
  const [workPlaceIds, setWorkPlaceIds] = useState<string[]>([]);

  useEffect(() => {
    if (show) setDate((current) => current || todayIso());
  }, [show]);

  const open = () => {
    const reportDate = date.trim() || todayIso();
    onHide();
    window.open(
      dailySettlementReportPath(type, { reportDate, workPlaceIds }),
      "_blank",
      "noopener",
    );
  };

  return (
    <ZtoModal
      show={show}
      onHide={onHide}
      rootId={type === "PAYMENT" ? "dailyPaymentReportModal" : "dailyCollectionReportModal"}
      headerClassName="bg-info text-white"
      closeButtonClassName="text-white"
      title={
        <>
          <i className="fas fa-calendar-day mr-2" aria-hidden="true" />
          {t(`${ns}.dailyModal.title`)}
        </>
      }
      footer={
        <>
          <button type="button" className="btn btn-light" onClick={onHide}>
            <i className="fas fa-times mr-1" aria-hidden="true" />
            {t("payments.list.dailyModal.cancel")}
          </button>
          <button type="button" className="btn btn-info" onClick={open}>
            <i className="fas fa-external-link-alt mr-1" aria-hidden="true" />
            {t(`${ns}.dailyModal.submit`)}
          </button>
        </>
      }
    >
      <div className="form-group">
        <label htmlFor={dateId} className="font-weight-bold mb-2">
          {t("payments.list.dailyModal.date")}
        </label>
        <input
          type="date"
          id={dateId}
          className="form-control"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        <small className="form-text text-muted">{t(`${ns}.dailyModal.help`)}</small>
      </div>
      <ZtoBranchMultiSelect
        variant="list"
        classPrefix={prefix}
        value={workPlaceIds}
        onChange={setWorkPlaceIds}
      />
    </ZtoModal>
  );
}
