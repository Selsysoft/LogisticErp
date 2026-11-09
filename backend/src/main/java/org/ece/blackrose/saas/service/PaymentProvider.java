package org.ece.blackrose.saas.service;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Ödeme sağlayıcısı sınırı. Kart bilgisi bu sistemde saklanmaz; sağlayıcı kendi kayıtlı ödeme
 * yöntemini kullanır. Aynı anahtarla gelen tekrar deneme ikinci kez tahsil etmemelidir.
 */
public interface PaymentProvider {

  record ChargeRequest(
      UUID invoiceId,
      String idempotencyKey,
      String tenantCode,
      BigDecimal amount,
      String currency) {}

  record ChargeResult(boolean success, String reference, String message) {}

  ChargeResult charge(ChargeRequest request);

  /** Konsolda gösterilecek sağlayıcı adı. */
  String describe();

  /** Deneme sağlayıcısı gerçek tahsilat yapmaz; konsol bunu uyarı olarak gösterir. */
  default boolean test() {
    return false;
  }

  /** Yalnız dev/test içindir. Kodu "-fail" ile biten firmanın ödemesi reddedilir. */
  @Component
  @Profile("!prod")
  @ConditionalOnProperty(name = "app.saas.payment.provider", havingValue = "mock")
  class MockPaymentProvider implements PaymentProvider {

    private static final String FAILING_SUFFIX = "-fail";

    @Override
    public ChargeResult charge(ChargeRequest request) {
      if (request.tenantCode().endsWith(FAILING_SUFFIX)) {
        return new ChargeResult(false, null, "Deneme sağlayıcısı ödemeyi reddetti.");
      }
      return new ChargeResult(true, "MOCK-" + request.idempotencyKey(), null);
    }

    @Override
    public String describe() {
      return "Deneme sağlayıcısı";
    }

    @Override
    public boolean test() {
      return true;
    }
  }

  /** Tanımlı sağlayıcıyı seçer. Yoksa fatura açık kalır ve ödeme elle işlenir. */
  @Component
  class PaymentProviders {

    private final List<PaymentProvider> providers;

    public PaymentProviders(List<PaymentProvider> providers) {
      this.providers = providers;
    }

    public java.util.Optional<PaymentProvider> configured() {
      return providers.stream().findFirst();
    }
  }
}
