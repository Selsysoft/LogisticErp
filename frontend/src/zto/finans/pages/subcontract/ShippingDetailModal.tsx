import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useDocumentTypes } from "../../../../pages/finance/accountApi";
import type { SubcontractCostRow } from "../../../../pages/operations/types";
import { ZtoModal, currencySymbol } from "../../../components";
import { accountTransactionsPath } from "../../navItems";
import { formatIsoDate } from "../expenses/expenseDates";
import { financeOf, formatN0, vehicleNo } from "./subcontractLogic";

type Props = {
  row: SubcontractCostRow | null;
  show: boolean;
  onHide: () => void;
  onExited?: () => void;
};

type Item = { icon: string; label: string; value: ReactNode; highlight?: boolean };

/**
 * "Sevk Nakliye Firması Detayları" (ZTO CompanySalesDetails.cshtml:971-1010, kart düzeni :1786-2060;
 * 12.7_TASARIM §5.7). Salt okunur: satırın maliyet alanları ve cariye yazılan hareket (`ledger`); ek
 * uç yok. ZTO'daki satış/palet/lokasyon kartları Blackrose seferinde karşılığı olmadığından yoktur.
 */
export function ShippingDetailModal({ row, show, onHide, onExited }: Props) {
  const { t } = useTranslation("ztoFinans");
  const s = (key: string) => t(`salesTruckExpenses.shipping.${key}`);
  const f = (key: string) => s(`fields.${key}`);
  const documentTypes = useDocumentTypes();

  const content = () => {
    if (!row) return null;
    const currency = row.money?.currency ?? null;
    const amounts = financeOf(row);
    const money = (value: string) => (row.money ? formatN0(value, currency) : "-");
    const documentTypeName =
      documentTypes.data?.find((type) => type.code === row.documentType)?.name ?? row.documentType;
    const cards: Array<{ key: string; tone: string; icon: string; items: Item[] }> = [
      {
        key: "basic",
        tone: "primary",
        icon: "fa-file-alt",
        items: [
          { icon: "fa-hashtag", label: f("vehicleNo"), value: vehicleNo(row) },
          { icon: "fa-tags", label: f("batchNo"), value: row.cargoDescription },
          { icon: "fa-building", label: f("customer"), value: row.customerName },
        ],
      },
      {
        key: "vehicle",
        tone: "info",
        icon: "fa-truck",
        items: [
          { icon: "fa-id-card", label: f("plate"), value: row.vehiclePlate },
          { icon: "fa-id-card", label: f("trailerPlate"), value: row.trailerPlate },
          { icon: "fa-user-tie", label: f("driver"), value: row.driverName },
        ],
      },
      {
        key: "transport",
        tone: "warning",
        icon: "fa-shipping-fast",
        items: [
          { icon: "fa-building", label: f("carrier"), value: row.carrierName },
          {
            icon: "fa-truck-loading",
            label: f("amount"),
            value: row.money ? formatN0(row.money.amount, currency) : null,
            highlight: true,
          },
          {
            icon: "fa-money-bill-wave",
            label: f("currency"),
            value: currency ? `${currencySymbol(currency)} ${currency}` : null,
          },
          {
            icon: "fa-route",
            label: f("transportMode"),
            value: t(`salesTruckExpenses.transportMode.${row.transportMode}`),
          },
        ],
      },
      {
        key: "document",
        tone: "purple",
        icon: "fa-file-invoice",
        items: [
          { icon: "fa-receipt", label: f("invoiceNo"), value: row.freightInvoiceNumber },
          { icon: "fa-file-alt", label: f("documentNo"), value: row.documentNo },
          { icon: "fa-file-alt", label: f("documentType"), value: documentTypeName },
          { icon: "fa-calendar-alt", label: f("costDate"), value: formatIsoDate(row.costDate) },
        ],
      },
      {
        key: "price",
        tone: "orange",
        icon: "fa-coins",
        items: [
          { icon: "fa-percent", label: f("vat"), value: money(amounts.vat) },
          { icon: "fa-minus-circle", label: f("withholding"), value: money(amounts.withholding) },
          { icon: "fa-dollar-sign", label: f("total"), value: money(amounts.total) },
          { icon: "fa-tag", label: f("deduction"), value: money(amounts.deduction) },
          {
            icon: "fa-balance-scale",
            label: f("balance"),
            value: money(amounts.balance),
            highlight: true,
          },
        ],
      },
      {
        key: "account",
        tone: "primary",
        icon: "fa-user-circle",
        items: row.ledger
          ? [
              {
                icon: "fa-calendar-check",
                label: f("transactionDate"),
                value: formatIsoDate(row.ledger.transactionDate),
              },
              {
                icon: "fa-align-left",
                label: f("transactionDescription"),
                value: row.ledger.description,
              },
              {
                icon: "fa-external-link-alt",
                label: f("statement"),
                value: row.carrierAccountId ? (
                  <Link
                    to={accountTransactionsPath(row.carrierAccountId)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {f("statementLink")}
                  </Link>
                ) : null,
              },
            ]
          : [{ icon: "fa-info-circle", label: f("statement"), value: s("notPosted") }],
      },
    ];
    return (
      <div className="row">
        {!row.costId && (
          <div className="col-12 text-center py-2 text-muted">
            <i className="fas fa-info-circle mb-2" aria-hidden="true" /> <p>{s("noCost")}</p>
          </div>
        )}
        {cards.map((card) => (
          <div className="col-xl-4 col-lg-4 col-md-6" key={card.key}>
            <div className={`modern-stat-card ${card.tone}`}>
              <div className="stat-header">
                <div className={`stat-icon ${card.tone}`}>
                  <i className={`fas ${card.icon}`} aria-hidden="true" />
                </div>
                <div className="stat-title">{s(`cards.${card.key}`)}</div>
              </div>
              <div className="stat-content">
                {card.items.map((item) => (
                  <div className="stat-item" key={`${card.key}-${item.label}`}>
                    <i className={`fas ${item.icon} stat-item-icon`} aria-hidden="true" />
                    <span className="stat-item-label">{item.label}</span>
                    <span
                      className={item.highlight ? "stat-item-value highlight" : "stat-item-value"}
                    >
                      {item.value === null || item.value === undefined || item.value === ""
                        ? "-"
                        : item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <ZtoModal
      show={show}
      onHide={onHide}
      onExited={onExited}
      size="xl"
      scrollable
      rootId="shippingDetailModal"
      id="shippingDetailModal"
      className="transaction-detail-modal"
      headerClassName="bg-info text-white"
      closeButtonClassName="text-white"
      title={
        <>
          <i className="fas fa-shipping-fast mr-2" aria-hidden="true" />
          {s("title")}
        </>
      }
      footer={
        <button type="button" className="btn btn-secondary" onClick={onHide}>
          {s("close")}
        </button>
      }
    >
      {row ? (
        <div id="shippingDetailContent">
          <div className="row" id="shippingColumnsSection">
            <div className="col-12">
              <div className="card border-purple shadow-sm">
                <div className="card-body p-3">
                  <div id="shippingColumnsContent">{content()}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div id="shippingDetailLoading" className="text-center py-5">
          <div className="spinner-border text-info" role="status">
            <span className="sr-only">{s("loading")}</span>
          </div>
          <p className="mt-2">{s("loading")}</p>
        </div>
      )}
    </ZtoModal>
  );
}
