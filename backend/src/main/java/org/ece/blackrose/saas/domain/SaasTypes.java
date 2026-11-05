package org.ece.blackrose.saas.domain;

public final class SaasTypes {

  private SaasTypes() {}

  public enum SubscriptionStatus {
    TRIAL,
    ACTIVE,
    PAST_DUE,
    SUSPENDED,
    CANCELLED
  }

  public enum SuspendReason {
    TRIAL_ENDED,
    PAYMENT,
    MANUAL
  }

  public enum SaasInvoiceStatus {
    ISSUED,
    PAID,
    VOID
  }

  public enum LimitedResource {
    USERS("kullanıcı"),
    VEHICLES("araç"),
    SHIPMENTS_MONTH("aylık sefer");

    private final String label;

    LimitedResource(String label) {
      this.label = label;
    }

    public String label() {
      return label;
    }
  }
}
