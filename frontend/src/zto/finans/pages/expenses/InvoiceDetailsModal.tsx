import { useTranslation } from "react-i18next";
import { useExpense } from "../../../../pages/finance/expenseApi";
import type { ExpenseLine } from "../../../../pages/finance/types";
import { ZtoModal, formatN2 } from "../../../components";
import { sumDec } from "../../../decimal";
import { moneyText } from "./expenseListLogic";

const TABLE_STYLE = { fontSize: 11 } as const;
const MONEY_KEYS = [
  "subTotal",
  "discountAmount",
  "netAmount",
  "vatAmount",
  "withholdingAmount",
  "otherTaxAmount",
  "totalAmount",
] as const;

type Props = {
  /** Açık modalın masraf kimliği; null → kapalı. */
  expenseId: string | null;
  /** Başlıktaki belge no (satırdan; yoksa "-"). */
  invoiceNumber: string | null;
  onHide: () => void;
};

/**
 * Fatura Detayları (ZTO ExpenseGroupDetails.cshtml #invoiceDetailsModal :598-674; 12.7_TASARIM §5.5).
 * Satırlar `GET /finance/expenses/{id}` yanıtından; tutarlar masrafın para biriminde (ZTO her zaman ₺
 * yazıyordu). Toplamlar ondalık metinle (`sumDec`) toplanır.
 */
export function InvoiceDetailsModal({ expenseId, invoiceNumber, onHide }: Props) {
  const { t } = useTranslation("ztoFinans");
  const k = (key: string) => t(`expenses.invoiceDetails.${key}`);
  const detail = useExpense(expenseId);
  const lines: ExpenseLine[] = detail.data?.lines ?? [];
  const currency = detail.data?.currency ?? "TRY";
  const money = (value: string) => moneyText(value, currency);
  const totals = Object.fromEntries(
    MONEY_KEYS.map((key) => [key, sumDec(lines.map((line) => line[key]))]),
  ) as Record<(typeof MONEY_KEYS)[number], string>;

  return (
    <ZtoModal
      show={expenseId !== null}
      onHide={onHide}
      id="invoiceDetailsModal"
      size="xl"
      centered
      scrollable
      titleAs="h6"
      headerClassName="bg-info text-white"
      closeButtonClassName="text-white"
      title={
        <>
          <i className="fas fa-file-invoice-dollar" aria-hidden="true" /> {k("title")}{" "}
          <span id="modalInvoiceNumber">{invoiceNumber || "-"}</span>
        </>
      }
      footer={
        <button type="button" className="btn btn-secondary" onClick={onHide}>
          <i className="fas fa-times" aria-hidden="true" /> {k("close")}
        </button>
      }
    >
      {detail.isPending && (
        <div id="detailsLoadingSpinner" className="text-center py-5">
          <div className="spinner-border text-info" role="status">
            <span className="sr-only">{k("loading")}</span>
          </div>
          <p className="mt-2 text-muted">{k("loadingText")}</p>
        </div>
      )}
      {detail.isSuccess && (
        <div id="detailsContent">
          <div className="table-responsive">
            <table
              className="table table-striped table-hover table-sm"
              id="detailsTable"
              style={TABLE_STYLE}
            >
              <thead className="thead-dark">
                <tr>
                  <th scope="col">{k("no")}</th>
                  <th scope="col">{k("description")}</th>
                  <th scope="col">{k("quantity")}</th>
                  <th scope="col">{k("unit")}</th>
                  <th scope="col">{k("unitPrice")}</th>
                  <th scope="col">{k("subTotal")}</th>
                  <th scope="col">{k("discountRate")}</th>
                  <th scope="col">{k("discountAmount")}</th>
                  <th scope="col">{k("netAmount")}</th>
                  <th scope="col">{k("vatRate")}</th>
                  <th scope="col">{k("vatAmount")}</th>
                  <th scope="col">{k("withholding")}</th>
                  <th scope="col">{k("otherTax")}</th>
                  <th scope="col" className="bg-success text-white">
                    {k("total")}
                  </th>
                </tr>
              </thead>
              <tbody id="detailsTableBody">
                {lines.map((line, index) => (
                  <tr key={line.id}>
                    <td>{index + 1}</td>
                    <td>{line.description || "-"}</td>
                    <td>{formatN2(line.quantity)}</td>
                    <td>{line.unit || "-"}</td>
                    <td>{money(line.unitPrice)}</td>
                    <td>{money(line.subTotal)}</td>
                    <td>{formatN2(line.discountRate)}%</td>
                    <td>{money(line.discountAmount)}</td>
                    <td className="font-weight-bold">{money(line.netAmount)}</td>
                    <td>{formatN2(line.vatRate)}%</td>
                    <td>{money(line.vatAmount)}</td>
                    <td>{money(line.withholdingAmount)}</td>
                    <td>{money(line.otherTaxAmount)}</td>
                    <td className="bg-light font-weight-bold">{money(line.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="table-secondary font-weight-bold">
                <tr>
                  <td colSpan={5} className="text-right">
                    <strong>{k("grandTotal")}</strong>
                  </td>
                  <td id="footerSubTotal">{money(totals.subTotal)}</td>
                  <td />
                  <td id="footerDiscountAmount">{money(totals.discountAmount)}</td>
                  <td id="footerNetAmount">{money(totals.netAmount)}</td>
                  <td />
                  <td id="footerTaxAmount">{money(totals.vatAmount)}</td>
                  <td id="footerWithholdingTax">{money(totals.withholdingAmount)}</td>
                  <td id="footerOtherTaxes">{money(totals.otherTaxAmount)}</td>
                  <td className="bg-success text-white" id="footerTotalAmount">
                    {money(totals.totalAmount)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {lines.length === 0 && (
            <div className="alert alert-info mt-3" id="noDetailsAlert">
              <i className="fas fa-info-circle" aria-hidden="true" /> {k("empty")}
            </div>
          )}
        </div>
      )}
      {detail.isError && (
        <div id="detailsErrorAlert" className="alert alert-danger" role="alert">
          <i className="fas fa-exclamation-triangle" aria-hidden="true" />{" "}
          <span id="errorMessage">{detail.error.message || k("error")}</span>
        </div>
      )}
    </ZtoModal>
  );
}
