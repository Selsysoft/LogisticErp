// Yazdırma (Buttons print karşılığı): tablo yeni bir pencerede kurulur ve yazdırılır. Gizli iframe
// kullanılmaz (X-Frame-Options/frame-ancestors); içerik yalnız DOM API + textContent ile yazılır
// (innerHTML/document.write yok). Satır içi <style> CSP style-src 'unsafe-inline' ile serbesttir.
import { cellText, type ExportCell } from "./cells";

export interface PrintOptions {
  title?: string;
  headers: string[];
  rows: ExportCell[][];
}

/** Yazdırma görünümü stili (Bootstrap table-bordered benzeri, A4'e sığan yazı boyu). */
export const PRINT_CSS = [
  "@page { margin: 12mm; }",
  "body { font-family: 'Open Sans', Arial, sans-serif; font-size: 11px; color: #212529; margin: 0; }",
  "h1 { font-size: 18px; font-weight: bold; text-align: center; margin: 0 0 12px; }",
  "table { width: 100%; border-collapse: collapse; }",
  "th, td { border: 1px solid #dee2e6; padding: 4px 6px; text-align: left; vertical-align: top; }",
  "thead th { background: #f8f9fa; border-bottom-width: 2px; }",
  "thead { display: table-header-group; }",
  "tr { page-break-inside: avoid; }",
  "td.dt-right { text-align: right; }",
].join("\n");

/** Belgeyi yazdırma görünümüyle doldurur (body.dt-print-view, Buttons gibi). */
export function buildPrintDocument(doc: Document, options: PrintOptions): void {
  const { title, headers, rows } = options;
  doc.title = title ?? "";
  const style = doc.createElement("style");
  style.textContent = PRINT_CSS;
  doc.head.appendChild(style);
  doc.body.className = "dt-print-view";

  if (title) {
    const h1 = doc.createElement("h1");
    h1.textContent = title;
    doc.body.appendChild(h1);
  }
  const table = doc.createElement("table");
  table.className = "table table-bordered dataTable";
  const thead = doc.createElement("thead");
  const headRow = doc.createElement("tr");
  for (const header of headers) {
    const th = doc.createElement("th");
    th.textContent = header;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = doc.createElement("tbody");
  for (const row of rows) {
    const tr = doc.createElement("tr");
    headers.forEach((_, c) => {
      const td = doc.createElement("td");
      const value = row[c];
      td.textContent = cellText(value);
      if (typeof value === "number") td.className = "dt-right";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  doc.body.appendChild(table);
}

/**
 * Yeni pencere açar, tabloyu yazar ve yazdırma penceresini açar; yazdırma bitince pencere kapanır.
 * Açılır pencere engellenirse false döner.
 */
export function printTable(options: PrintOptions, win: Window = window): boolean {
  const printWindow = win.open("", "_blank");
  if (!printWindow) return false;
  try {
    // Açılan sayfa açanı göremesin (noopener window.open'ın dönüşünü null yapacağı için sonradan).
    printWindow.opener = null;
  } catch {
    // Bazı tarayıcılarda salt okunur; önemsiz.
  }
  buildPrintDocument(printWindow.document, options);
  printWindow.addEventListener("afterprint", () => printWindow.close());
  printWindow.focus();
  printWindow.print();
  return true;
}
