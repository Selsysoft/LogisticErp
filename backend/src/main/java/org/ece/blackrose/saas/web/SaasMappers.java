package org.ece.blackrose.saas.web;

import org.ece.blackrose.saas.domain.SaasInvoice;
import org.ece.blackrose.saas.web.SaasDtos.InvoiceResponse;

final class SaasMappers {

  private SaasMappers() {}

  static InvoiceResponse toResponse(SaasInvoice invoice, String tenantCode) {
    return new InvoiceResponse(
        invoice.getId(),
        invoice.getTenantId(),
        tenantCode,
        invoice.getNumber(),
        invoice.getPlanName(),
        invoice.getPeriodStart(),
        invoice.getPeriodEnd(),
        invoice.getAmount(),
        invoice.getCurrency(),
        invoice.getStatus(),
        invoice.getIssuedOn(),
        invoice.getDueOn(),
        invoice.getPaidOn(),
        invoice.getPaymentRef(),
        invoice.getFailedAttempts(),
        invoice.getReminderCount());
  }
}
