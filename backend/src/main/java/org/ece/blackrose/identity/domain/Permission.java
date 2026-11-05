package org.ece.blackrose.identity.domain;

/** Sabit izin listesi. Yeni izin eklemek PATRON rolüne otomatik yansır. */
public enum Permission {
  USER_VIEW("identity"),
  USER_MANAGE("identity"),
  ROLE_MANAGE("identity"),
  AUDIT_VIEW("identity"),
  BRANCH_VIEW("organization"),
  BRANCH_MANAGE("organization"),
  FINANCE_VIEW("finance"),
  FINANCE_MANAGE("finance"),
  FINANCE_PAYMENT_CREATE("finance"),
  FINANCE_APPROVE("finance"),
  CRM_VIEW("crm"),
  CRM_EDIT("crm"),
  SHIPMENT_VIEW("shipment"),
  SHIPMENT_DISPATCH("shipment"),
  SHIPMENT_INVOICE("shipment"),
  FLEET_VIEW("fleet"),
  FLEET_EDIT("fleet"),
  WAREHOUSE_VIEW("warehouse"),
  WAREHOUSE_EDIT("warehouse"),
  WAREHOUSE_INVOICE("warehouse"),
  CUSTOMS_VIEW("customs"),
  CUSTOMS_EDIT("customs"),
  DRIVER_APP("driver"),
  INTEGRATION_VIEW("integration"),
  REPORT_VIEW("report"),
  SUBSCRIPTION_VIEW("subscription");

  private final String module;

  Permission(String module) {
    this.module = module;
  }

  public String getModule() {
    return module;
  }
}
