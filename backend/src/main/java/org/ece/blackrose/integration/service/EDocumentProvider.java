package org.ece.blackrose.integration.service;

import java.util.UUID;
import org.ece.blackrose.integration.domain.IntegrationTypes.EDocumentKind;
import org.ece.blackrose.integration.domain.IntegrationTypes.EDocumentStatus;

/** Özel entegratör adaptörü. Gerçek sağlayıcı seçilince bu arayüz uygulanır. */
public interface EDocumentProvider {

  record Outgoing(EDocumentKind kind, UUID ettn, String receiverTaxNumber, String ubl) {}

  record Result(EDocumentStatus status, String reference, String message) {}

  String name();

  /** Deneme sağlayıcısı GİB'e gitmez; ekranda bu bilgi gösterilir. */
  boolean isTest();

  Result send(Outgoing document);

  Result status(String reference);

  Result cancel(String reference);
}
