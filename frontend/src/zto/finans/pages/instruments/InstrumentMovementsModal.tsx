import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAccountList } from "../../../../pages/finance/accountApi";
import { useInstrumentMovements } from "../../../../pages/finance/instrumentApi";
import { ZtoModal, formatDate, formatMoneyValue } from "../../../components";
import { movementIcon, movementParties, type MovementSide } from "./checksLogic";
import type { InstrumentMovementsModalProps } from "./index";
import { statusLabelKey } from "./instrumentLogic";

const ARROW_COL = { width: 30 } as const;
const ARROW_CELL = { width: 30, padding: 0 } as const;

/**
 * M2 "Çek Hareket Geçmişi" (ZTO Checks.cshtml:1179-1220 + showCheckMovements :5248-5318; 12.3 §5.4).
 * Senetler de içe aktarır (başlık ve bilgi metni türe göre). Hareketler `movements` verilmezse
 * `useInstrumentMovements` ile okunur. Sunucu metni düz metin olarak basılır (ZTO `ztEscapeHtml`).
 */
export function InstrumentMovementsModal({
  show,
  onHide,
  instrument,
  movements,
}: InstrumentMovementsModalProps) {
  const { t } = useTranslation("ztoFinans");
  const m = (key: string, values?: Record<string, unknown>) => t(`checks.movements.${key}`, values);
  const query = useInstrumentMovements(instrument?.id, { enabled: show && !movements });
  const rows = useMemo(() => movements ?? query.data ?? [], [movements, query.data]);
  const hasTransfer = rows.some((row) => row.movementType === "TRANSFERRED");
  const accounts = useAccountList({}, { enabled: show && hasTransfer });
  const accountName = useCallback(
    (id: string | null) => (id ? (accounts.data?.find((a) => a.id === id)?.name ?? null) : null),
    [accounts.data],
  );
  const note = instrument?.kind === "NOTE";
  const loading = !movements && query.isPending;
  const sideText = (value: MovementSide) => (value.kind === "key" ? t(value.key) : value.text);

  let body;
  if (loading) {
    body = (
      <tr>
        <td colSpan={7} className="text-center">
          <i className="fas fa-spinner fa-spin" aria-hidden="true" /> {m("loading")}
        </td>
      </tr>
    );
  } else if (!movements && query.isError) {
    body = (
      <tr>
        <td colSpan={7} className="text-center text-danger">
          {m("failed")}
        </td>
      </tr>
    );
  } else if (rows.length === 0) {
    body = (
      <tr>
        <td colSpan={7} className="text-center">
          {m("empty")}
        </td>
      </tr>
    );
  } else if (instrument) {
    body = rows.map((row, index) => {
      const icon = movementIcon(row, index);
      const parties = movementParties(row, instrument, index, accountName);
      const type =
        row.movementType === "TRANSFERRED"
          ? m("transferred")
          : t(
              statusLabelKey(
                instrument.kind,
                instrument.direction,
                row.toStatus as typeof instrument.status,
              ),
            );
      return (
        <tr key={row.id}>
          <td>{formatDate(row.movementDate)}</td>
          <td>
            <span className={icon.className}>
              <i className={`fas ${icon.icon} mr-1`} aria-hidden="true" />
              {type}
            </span>
          </td>
          <td>{sideText(parties.from)}</td>
          <td className="text-center" style={ARROW_CELL}>
            <i className="fas fa-arrow-right text-muted" aria-hidden="true" />
          </td>
          <td>{sideText(parties.to)}</td>
          <td>{(instrument.employeeMasked ? null : row.note) || "-"}</td>
          <td>
            <small>{formatDate(row.movementDate)}</small>
          </td>
        </tr>
      );
    });
  }

  const number = instrument?.number ?? "";
  return (
    <ZtoModal
      show={show}
      onHide={onHide}
      size="lg"
      className="erp-modal"
      rootId="checkMovementsModal"
      title={
        <>
          <i className="fas fa-history" aria-hidden="true" /> {m(note ? "titleNote" : "title")}
        </>
      }
      footer={
        <button type="button" className="btn btn-secondary" onClick={onHide}>
          {m("close")}
        </button>
      }
    >
      <div className="row mb-3">
        <div className="col-md-12">
          <div className="alert alert-info" id="movementCheckInfo" role="status">
            <i className="fas fa-info-circle" aria-hidden="true" /> <strong>{number}</strong>{" "}
            {loading ? m("infoLoading") : m(note ? "infoNote" : "info")}
            {instrument && !loading && (
              <span className="d-block small mt-1">
                {[
                  instrument.bankName,
                  formatMoneyValue(instrument.money),
                  m("due", { date: formatDate(instrument.dueDate) }),
                ]
                  .filter(Boolean)
                  .join(" • ")}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="table-responsive">
        <table className="table table-sm table-bordered" id="movementsTable">
          <thead>
            <tr>
              <th scope="col">{m("date")}</th>
              <th scope="col">{m("type")}</th>
              <th scope="col">{m("from")}</th>
              <th scope="col" style={ARROW_COL}>
                <span className="sr-only">→</span>
              </th>
              <th scope="col">{m("to")}</th>
              <th scope="col">{m("description")}</th>
              <th scope="col">{m("createdAt")}</th>
            </tr>
          </thead>
          <tbody id="movementsTableBody">{body}</tbody>
        </table>
      </div>
    </ZtoModal>
  );
}
