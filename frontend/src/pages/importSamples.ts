/**
 * İçe aktarma pencerelerindeki "Örnek dosya" içerikleri. docs/ornekler altındaki dosyalarla aynı
 * tutulur (importSamples.test.ts denetler); geçiş rehberi o dosyaları gösterir.
 */
export const OPENING_BALANCE_SAMPLE =
  "Kod;Ad;Tür;Para birimi;Bakiye;Kur;Vergi no\n" +
  "M001;Örnek Müşteri A.Ş.;Müşteri;TRY;1500,00;;1234567890\n" +
  "T001;Örnek Tedarikçi Ltd.;Tedarikçi;TRY;-2500,00;;\n" +
  "M002;Örnek Dış Müşteri;Müşteri;EUR;200,00;35,40;\n";

export const OPENING_INVOICE_SAMPLE =
  "Cari kodu;Belge no;Belge tarihi;Vade;Tutar;Para birimi;Kur\n" +
  "M001;ABC2026000123;15.09.2026;15.11.2026;12500,00;TRY;\n" +
  "M001;ABC2026000187;01.10.2026;30.11.2026;4200,00;TRY;\n" +
  "T001;F-7781;20.10.2026;20.12.2026;8000,00;TRY;\n" +
  "M002;EXP-55;05.10.2026;04.12.2026;1500,00;EUR;35,40\n";

export const OPENING_STOCK_SAMPLE =
  "Müşteri kodu;Ürün kodu;Ürün adı;Birim;Göz;Lot;Son kullanma;Miktar\n" +
  "M001;UN-50;Un 50 kg;ÇUVAL;A-01;L2401;31.12.2027;120\n" +
  "M001;UN-50;Un 50 kg;ÇUVAL;A-02;L2401;31.12.2027;35\n" +
  "M002;YAG-5;Ayçiçek yağı 5 L;KOLİ;B-07;;;12,5\n";

/** Excel'in Türkçe karakterleri doğru açması için UTF-8 imiyle (BOM) indirir. */
export function downloadCsv(content: string, fileName: string) {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
