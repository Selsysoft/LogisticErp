package org.ece.blackrose.integration.service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.ece.blackrose.integration.domain.IntegrationTypes.EDocumentStatus;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Deneme sağlayıcısı. Hiçbir yere belge göndermez. Üretim profilinde hiç oluşmaz; yanlışlıkla yasal
 * belge gönderilmiş sanılamaz. Alıcı vergi numarası 000 ile başlıyorsa belgeyi reddeder.
 */
@Component
@Profile("!prod")
@ConditionalOnProperty(name = "app.integration.edocument.provider", havingValue = "mock")
public class MockEDocumentProvider implements EDocumentProvider {

  private static final String REJECT_PREFIX = "000";

  private final Map<String, Boolean> rejected = new ConcurrentHashMap<>();

  @Override
  public String name() {
    return "MOCK";
  }

  @Override
  public boolean isTest() {
    return true;
  }

  @Override
  public Result send(Outgoing document) {
    String reference = "MOCK-" + document.ettn();
    rejected.put(
        reference,
        document.receiverTaxNumber() != null
            && document.receiverTaxNumber().startsWith(REJECT_PREFIX));
    return new Result(EDocumentStatus.SENT, reference, "Deneme sağlayıcısına iletildi.");
  }

  @Override
  public Result status(String reference) {
    return Boolean.TRUE.equals(rejected.get(reference))
        ? new Result(EDocumentStatus.REJECTED, reference, "Alıcı vergi numarası geçersiz.")
        : new Result(EDocumentStatus.ACCEPTED, reference, "Deneme sağlayıcısı kabul etti.");
  }

  @Override
  public Result cancel(String reference) {
    return new Result(EDocumentStatus.CANCELLED, reference, "Deneme sağlayıcısında iptal edildi.");
  }
}
