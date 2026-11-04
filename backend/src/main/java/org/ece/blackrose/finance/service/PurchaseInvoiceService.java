package org.ece.blackrose.finance.service;

import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.InvoiceStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.PlanStatus;
import org.ece.blackrose.finance.domain.PaymentPlan;
import org.ece.blackrose.finance.domain.PurchaseInvoice;
import org.ece.blackrose.finance.repository.FinanceRepositories.PaymentPlanRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.PurchaseInvoiceRepository;
import org.ece.blackrose.finance.service.LedgerService.Posting;
import org.ece.blackrose.finance.web.FinanceDtos.CreatePlanRequest;
import org.ece.blackrose.finance.web.FinanceDtos.CreatePurchaseInvoiceRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Tedarikçi/taşeron faturası: tedarikçi carisine ALACAK yazar ve taslak ödeme planı açar. */
@Service
public class PurchaseInvoiceService {

  private static final String SOURCE_INVOICE = "PURCHASE_INVOICE";

  private final PurchaseInvoiceRepository invoices;
  private final PaymentPlanRepository planRepository;
  private final PaymentPlanService plans;
  private final LedgerService ledger;

  public PurchaseInvoiceService(
      PurchaseInvoiceRepository invoices,
      PaymentPlanRepository planRepository,
      PaymentPlanService plans,
      LedgerService ledger) {
    this.invoices = invoices;
    this.planRepository = planRepository;
    this.plans = plans;
    this.ledger = ledger;
  }

  @Transactional(readOnly = true)
  public Page<PurchaseInvoice> list(Pageable pageable) {
    return invoices.findAll(pageable);
  }

  @Transactional
  public PurchaseInvoice create(CreatePurchaseInvoiceRequest request) {
    if (!request.net().currency().equals(request.vat().currency())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "CURRENCY_MISMATCH", "Net ve KDV aynı para biriminde olmalıdır.");
    }
    if (invoices.findByAccountIdAndNumber(request.accountId(), request.number()).isPresent()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "INVOICE_NUMBER_TAKEN", "Bu fatura zaten kayıtlı.");
    }
    PurchaseInvoice invoice =
        invoices.save(
            new PurchaseInvoice(
                request.accountId(),
                request.branchId(),
                request.number(),
                request.invoiceDate(),
                request.dueDate(),
                request.net(),
                request.vat(),
                request.description()));
    ledger.post(
        new Posting(
            request.accountId(),
            request.branchId(),
            Direction.CREDIT,
            invoice.getTotal(),
            request.invoiceDate(),
            "Fatura " + request.number(),
            SOURCE_INVOICE,
            invoice.getId(),
            request.exchangeRate()));
    plans.create(
        new CreatePlanRequest(
            request.accountId(),
            request.branchId(),
            invoice.getTotal(),
            request.dueDate(),
            "Fatura " + request.number()),
        invoice.getId());
    return invoice;
  }

  /** Ödenmiş faturanın iptali önce ödemenin çözülmesini gerektirir, bu yüzden reddedilir. */
  @Transactional
  public PurchaseInvoice cancel(UUID id, LocalDate date) {
    PurchaseInvoice invoice =
        invoices
            .findById(id)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "INVOICE_NOT_FOUND", "Fatura bulunamadı."));
    if (invoice.getStatus() == InvoiceStatus.CANCELLED) {
      return invoice;
    }
    for (PaymentPlan plan : planRepository.findByPurchaseInvoiceId(id)) {
      if (plan.getStatus() == PlanStatus.PAID) {
        throw new BusinessException(
            HttpStatus.CONFLICT, "INVOICE_PAID", "Ödenmiş fatura iptal edilemez.");
      }
      if (plan.getStatus() != PlanStatus.CANCELLED) {
        plans.cancel(plan.getId(), "Fatura iptali");
      }
    }
    ledger.reverseSource(SOURCE_INVOICE, id, date, "Fatura iptali " + invoice.getNumber());
    invoice.cancel();
    return invoice;
  }
}
