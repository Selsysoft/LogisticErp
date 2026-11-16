import { createColumnHelper } from "@tanstack/react-table";
import { CSSProperties, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { InstrumentListItem } from "../../../../pages/finance/types";
import { ZtoDataTable, ZtoModal, formatDate, formatMoneyValue } from "../../../components";

const column = createColumnHelper<InstrumentListItem>();
const INFO: CSSProperties = { fontSize: 12, borderRadius: 10 };
const TABLE_BOX: CSSProperties = {
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: "6px 10px",
  boxShadow: "0 2px 10px rgba(15,23,42,.05)",
};
const NOWRAP: CSSProperties = { whiteSpace: "nowrap" };

type Props = {
  show: boolean;
  onHide: () => void;
  /** Ciro edilebilir çekler (`endorsable=true` liste sorgusu). */
  rows: InstrumentListItem[];
  loading: boolean;
  /** "Ciro Et": M1 kapanır, `PaymentModal` ciro kipinde açılır (yalnız POST izni). */
  onEndorse?: (item: InstrumentListItem) => void;
  /** "Kasaya Tahsil": durum modalı "Kasaya Tahsil Et" ön seçili (yalnız izinli geçişte). */
  onCollectToCash?: (item: InstrumentListItem) => void;
};

/**
 * M1 "Ciro Edilebilir Çekler" (ZTO Checks.cshtml:1125-1176 + openCiroModal :4511-4557; 12.3 §5.4).
 * DataTables: sayfa 10, arama açık, sıra Vade T. artan. Satırlar düz metin (ZTO `ztCiroEsc`).
 */
export function EndorsableChecksModal({
  show,
  onHide,
  rows,
  loading,
  onEndorse,
  onCollectToCash,
}: Props) {
  const { t } = useTranslation("ztoFinans");
  const e = (key: string) => t(`checks.endorsable.${key}`);

  const columns = useMemo(
    () => [
      column.accessor("number", {
        id: "number",
        header: e("number"),
        cell: ({ getValue }) => <b>{getValue()}</b>,
      }),
      column.accessor((row) => row.bankName ?? "", {
        id: "bank",
        header: e("bank"),
        cell: ({ getValue }) => getValue() || "-",
      }),
      column.accessor((row) => row.drawerName ?? row.accountName ?? "", {
        id: "drawer",
        header: e("drawer"),
        cell: ({ getValue }) => getValue() || "-",
      }),
      column.accessor((row) => row.accountName ?? "", {
        id: "payee",
        header: e("payee"),
        cell: ({ getValue }) => getValue() || "-",
      }),
      column.accessor((row) => Number(row.money.amount), {
        id: "amount",
        header: () => <span className="d-block text-right">{e("amount")}</span>,
        cell: ({ row }) => (
          <span className="d-block text-right">
            <b>{formatMoneyValue(row.original.money)}</b>
          </span>
        ),
      }),
      column.accessor((row) => row.issueDate ?? "", {
        id: "issueDate",
        header: e("issueDate"),
        cell: ({ getValue }) => (getValue() ? formatDate(getValue()) : "-"),
      }),
      column.accessor("dueDate", {
        id: "dueDate",
        header: e("dueDate"),
        cell: ({ getValue }) => formatDate(getValue()),
      }),
      column.accessor((row) => row.custodyFundName ?? "", {
        id: "holding",
        header: e("holding"),
        cell: ({ getValue }) =>
          getValue() ? (
            <>
              <i className="fas fa-wallet" aria-hidden="true" /> {getValue()}
            </>
          ) : (
            <span className="text-muted">{e("inHand")}</span>
          ),
      }),
      column.display({
        id: "status",
        header: e("status"),
        cell: () => (
          <span className="badge badge-info">{t("instruments.status.check.PORTFOLIO")}</span>
        ),
      }),
      column.display({
        id: "action",
        header: () => <span className="d-block text-center">{e("action")}</span>,
        enableSorting: false,
        meta: { exportable: false },
        cell: ({ row }) => (
          <div className="text-center" style={NOWRAP}>
            {onEndorse && (
              <button type="button" className="btn-ciro-et" onClick={() => onEndorse(row.original)}>
                <i className="fas fa-exchange-alt" aria-hidden="true" /> {e("endorse")}
              </button>
            )}{" "}
            {onCollectToCash && row.original.allowedTransitions.includes("COLLECTED_TO_CASH") && (
              <button
                type="button"
                className="btn btn-sm btn-success"
                onClick={() => onCollectToCash(row.original)}
              >
                <i className="fas fa-cash-register" aria-hidden="true" /> {e("collectToCash")}
              </button>
            )}
          </div>
        ),
      }),
    ],
    // e/t aynı dil örneğinden türer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, onEndorse, onCollectToCash],
  );

  return (
    <ZtoModal
      show={show}
      onHide={onHide}
      size="xl"
      className="erp-modal"
      rootId="ciroChecksModal"
      closeButtonClassName="text-white"
      title={
        <span style={{ color: "#fff", fontWeight: 700 }}>
          <i className="fas fa-exchange-alt" aria-hidden="true" /> {e("title")}
        </span>
      }
      footer={
        <button type="button" className="btn btn-secondary" onClick={onHide}>
          {e("close")}
        </button>
      }
    >
      <>
        <div className="alert alert-info" style={INFO}>
          <i className="fas fa-info-circle" aria-hidden="true" /> {e("info")}
        </div>
        <div
          className="table-responsive"
          style={TABLE_BOX}
          role="region"
          aria-label={e("title")}
          tabIndex={0}
        >
          <ZtoDataTable
            id="ciroChecksTable"
            columns={columns}
            data={rows}
            getRowId={(row) => row.id}
            tableClassName="table table-hover ciro-modern-tbl"
            tableStyle={{ width: "100%" }}
            pageLength={10}
            order={[{ id: "dueDate", desc: false }]}
            emptyText={
              loading ? (
                <span className="text-center py-3">
                  <i className="fas fa-spinner fa-spin" aria-hidden="true" /> {e("loading")}
                </span>
              ) : (
                <span className="text-center text-muted py-3">{e("empty")}</span>
              )
            }
          />
        </div>
      </>
    </ZtoModal>
  );
}
