package org.ece.blackrose.finance.service;

import org.ece.blackrose.finance.domain.FinanceTypes.PlanStatus;
import org.ece.blackrose.finance.domain.PaymentPlan;

/**
 * Ödeme planı onaya gönderildi, onaylandı veya reddedildi. İşlemin içinde yayımlanır; dinleyen
 * bildirimi hazırlar, e-posta işlem kaydedilince gider.
 */
public record PlanDecisionEvent(
    PaymentPlan plan, PlanStatus status, String actorEmail, String note) {}
