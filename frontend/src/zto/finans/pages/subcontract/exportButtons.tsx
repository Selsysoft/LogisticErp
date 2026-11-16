import type { ZtoButtonConfig } from "../../../components";

/**
 * ZTO SalesTruckExpenses düğmeleri (Index.cshtml:572-608, CompanySalesDetails.cshtml:1052-1091):
 * Kopyala, Excel, Yazdır, PDF; dışa aktarımda işlem sütunu hariç (`exportExcludeLastColumn`).
 */
export function salesTruckButtons(labels: {
  copy: string;
  excel: string;
  print: string;
  pdf: string;
}): ZtoButtonConfig[] {
  return [
    {
      extend: "copy",
      className: "btn btn-grey rounded",
      text: (
        <>
          <i className="fa fa-copy" aria-hidden="true" /> {labels.copy}
        </>
      ),
    },
    {
      extend: "excel",
      className: "btn btn-green rounded",
      text: (
        <>
          <i className="fa fa-file-excel" aria-hidden="true" /> {labels.excel}
        </>
      ),
    },
    {
      extend: "print",
      className: "btn btn-blue rounded",
      text: (
        <>
          <i className="fa fa-print" aria-hidden="true" /> {labels.print}
        </>
      ),
    },
    {
      extend: "pdf",
      className: "btn btn-red rounded",
      text: (
        <>
          <i className="fa fa-file-pdf" aria-hidden="true" /> {labels.pdf}
        </>
      ),
    },
  ];
}
