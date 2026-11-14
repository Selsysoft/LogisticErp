package org.ece.blackrose.organization;

/** Şirket serisinden numara alan belge türleri ({@code document_series.doc_type}). */
public enum DocumentType {
  FREIGHT_INVOICE,
  WAREHOUSE_INVOICE,
  /** Şirket içi banka/kasa transferi (V32 tohumu; önek VRM / {KOD4}-VRM). */
  FUND_TRANSFER,
  /** Şirketler arası virman (V32 tohumu; önek SVR / {KOD4}-SVR). */
  INTERCOMPANY_TRANSFER
}
