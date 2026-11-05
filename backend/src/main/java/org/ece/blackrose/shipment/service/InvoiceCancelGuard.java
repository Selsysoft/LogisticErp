package org.ece.blackrose.shipment.service;

import java.util.UUID;

/** Sevkiyatın e-belge modülüne bağımlı olmadan fatura iptalini sormasını sağlar. */
public interface InvoiceCancelGuard {

  /** İptal edilemiyorsa hata fırlatır. */
  void ensureCancellable(UUID invoiceId);
}
