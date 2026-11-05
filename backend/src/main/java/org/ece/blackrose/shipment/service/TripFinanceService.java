package org.ece.blackrose.shipment.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.service.ExchangeRateService;
import org.ece.blackrose.finance.service.LedgerService;
import org.ece.blackrose.finance.service.LedgerService.Posting;
import org.ece.blackrose.finance.service.PaymentPlanService;
import org.ece.blackrose.finance.web.FinanceDtos.CreatePlanRequest;
import org.ece.blackrose.fleet.domain.VehicleExpense;
import org.ece.blackrose.fleet.repository.FleetRepositories.VehicleExpenseRepository;
import org.ece.blackrose.shipment.domain.FreightInvoice;
import org.ece.blackrose.shipment.domain.Shipment;
import org.ece.blackrose.shipment.domain.ShipmentTypes.CostKind;
import org.ece.blackrose.shipment.domain.ShipmentTypes.InvoiceStatus;
import org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus;
import org.ece.blackrose.shipment.domain.TripCost;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.FreightInvoiceRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.TripCostRepository;
import org.ece.blackrose.shipment.web.ShipmentDtos.CloseShipmentRequest;
import org.ece.blackrose.shipment.web.ShipmentDtos.IssueInvoiceRequest;
import org.ece.blackrose.shipment.web.ShipmentDtos.ProfitResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.SaveCostRequest;
import org.ece.blackrose.tenant.TenantClock;
import org.ece.blackrose.tenant.TenantContext;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Operasyondan finansa geçiş. Gelir yalnız fatura kesilince, giderler yalnız sefer kapanınca
 * yazılır. Kayıtlar kaynak belgeye bağlı olduğu için tekrar denemede çoğalmaz.
 */
@Service
public class TripFinanceService {

  private static final String SOURCE_INVOICE = "FREIGHT_INVOICE";
  private static final String SOURCE_COST = "TRIP_COST";
  private static final BigDecimal HUNDRED = new BigDecimal("100");
  private static final int PERCENT_SCALE = 2;

  public record InvoicePdf(String fileName, byte[] content) {}

  private final ShipmentRepository shipments;
  private final FreightInvoiceRepository invoices;
  private final TripCostRepository costs;
  private final VehicleExpenseRepository vehicleExpenses;
  private final ShipmentService shipmentService;
  private final LedgerService ledger;
  private final PaymentPlanService plans;
  private final ExchangeRateService rates;
  private final ShipmentViews views;
  private final TenantRepository tenants;
  private final TenantClock clock;

  public TripFinanceService(
      ShipmentRepository shipments,
      FreightInvoiceRepository invoices,
      TripCostRepository costs,
      VehicleExpenseRepository vehicleExpenses,
      ShipmentService shipmentService,
      LedgerService ledger,
      PaymentPlanService plans,
      ExchangeRateService rates,
      ShipmentViews views,
      TenantRepository tenants,
      TenantClock clock) {
    this.shipments = shipments;
    this.invoices = invoices;
    this.costs = costs;
    this.vehicleExpenses = vehicleExpenses;
    this.shipmentService = shipmentService;
    this.ledger = ledger;
    this.plans = plans;
    this.rates = rates;
    this.views = views;
    this.tenants = tenants;
    this.clock = clock;
  }

  @Transactional
  public FreightInvoice issueInvoice(UUID shipmentId, IssueInvoiceRequest request) {
    Shipment shipment = shipmentService.lock(shipmentId);
    if (shipment.getStatus() != ShipmentStatus.DELIVERED) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "INVOICE_NOT_ALLOWED", "Yalnız teslim edilmiş sefer faturalanır.");
    }
    if (request.dueDate().isBefore(request.invoiceDate())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "INVOICE_DATES_INVALID", "Vade, fatura tarihinden önce olamaz.");
    }
    var conversion =
        rates.convert(shipment.getNet(), request.invoiceDate(), request.exchangeRate());
    String number =
        "NF-%d-%06d".formatted(request.invoiceDate().getYear(), shipments.nextInvoiceNumber());
    FreightInvoice invoice =
        invoices.save(
            new FreightInvoice(
                number, shipment, request.invoiceDate(), request.dueDate(), conversion.tlAmount()));
    ledger.post(
        new Posting(
            shipment.getAccountId(),
            shipment.getBranchId(),
            Direction.DEBIT,
            invoice.getTotal(),
            request.invoiceDate(),
            "Navlun faturası " + number,
            SOURCE_INVOICE,
            invoice.getId(),
            request.exchangeRate()));
    shipmentService.move(shipment, ShipmentStatus.INVOICED, number);
    return invoice;
  }

  @Transactional
  public FreightInvoice cancelInvoice(UUID invoiceId, LocalDate date) {
    FreightInvoice invoice = findInvoice(invoiceId);
    if (invoice.getStatus() == InvoiceStatus.CANCELLED) {
      return invoice;
    }
    Shipment shipment = shipmentService.lock(invoice.getShipmentId());
    if (shipment.getStatus() != ShipmentStatus.INVOICED) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "INVOICE_NOT_CANCELLABLE",
          "Kapanmış seferin faturası iptal edilemez.");
    }
    ledger.reverseSource(SOURCE_INVOICE, invoiceId, date, "Fatura iptali " + invoice.getNumber());
    invoice.cancel();
    shipmentService.move(shipment, ShipmentStatus.DELIVERED, "İptal " + invoice.getNumber());
    return invoice;
  }

  @Transactional(readOnly = true)
  public FreightInvoice invoiceOf(UUID shipmentId) {
    return invoices.findByShipmentIdAndStatus(shipmentId, InvoiceStatus.ISSUED).orElse(null);
  }

  @Transactional(readOnly = true)
  public InvoicePdf invoicePdf(UUID invoiceId) {
    FreightInvoice invoice = findInvoice(invoiceId);
    String company =
        tenants.findByCode(TenantContext.currentCode().orElseThrow()).orElseThrow().getName();
    return new InvoicePdf(
        invoice.getNumber() + ".pdf",
        ShipmentPdf.invoice(invoice, company, views.accountName(invoice.getAccountId())));
  }

  @Transactional(readOnly = true)
  public List<TripCost> costsOf(UUID shipmentId) {
    return live(costs.findByShipmentIdOrderByCreatedAt(shipmentId));
  }

  /** Ters kayıtla iptal edilen araç gideri artık sefer maliyeti değildir. */
  private List<TripCost> live(List<TripCost> list) {
    Set<UUID> linked =
        list.stream()
            .map(TripCost::getVehicleExpenseId)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
    Set<UUID> existing =
        vehicleExpenses.findAllById(linked).stream()
            .map(VehicleExpense::getId)
            .collect(Collectors.toSet());
    return list.stream()
        .filter(
            cost ->
                cost.getVehicleExpenseId() == null || existing.contains(cost.getVehicleExpenseId()))
        .toList();
  }

  @Transactional
  public TripCost addCost(UUID shipmentId, SaveCostRequest request) {
    Shipment shipment = shipmentService.lock(shipmentId);
    if (shipment.getStatus() == ShipmentStatus.CLOSED
        || shipment.getStatus() == ShipmentStatus.CANCELLED) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "SHIPMENT_NOT_EDITABLE", "Kapanmış sefere gider eklenemez.");
    }
    boolean toAccount = request.accountId() != null;
    boolean linked = request.vehicleExpenseId() != null;
    if (toAccount == linked) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "COST_TARGET_REQUIRED",
          "Cari veya araç giderinden yalnız biri seçilmelidir.");
    }
    return linked ? linkExpense(shipment, request) : addAccountCost(shipment, request);
  }

  private TripCost linkExpense(Shipment shipment, SaveCostRequest request) {
    if (costs.findByVehicleExpenseId(request.vehicleExpenseId()).isPresent()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "EXPENSE_ALREADY_LINKED", "Bu araç gideri başka bir sefere bağlı.");
    }
    VehicleExpense expense =
        vehicleExpenses
            .findById(request.vehicleExpenseId())
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "EXPENSE_NOT_FOUND", "Araç gideri bulunamadı."));
    TripCost cost =
        new TripCost(
            shipment.getId(),
            request.legId(),
            request.kind(),
            null,
            expense.getId(),
            expense.getMoney(),
            expense.getTlAmount(),
            request.description() != null ? request.description() : expense.getDescription());
    return costs.save(cost);
  }

  private TripCost addAccountCost(Shipment shipment, SaveCostRequest request) {
    Money money = request.money();
    if (money == null || money.amount().signum() <= 0) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "AMOUNT_INVALID", "Tutar sıfırdan büyük olmalıdır.");
    }
    LocalDate date = request.date() != null ? request.date() : clock.today();
    var conversion = rates.convert(money, date, request.exchangeRate());
    return costs.save(
        new TripCost(
            shipment.getId(),
            request.legId(),
            request.kind(),
            request.accountId(),
            null,
            money,
            conversion.tlAmount(),
            request.description()));
  }

  @Transactional
  public void removeCost(UUID costId) {
    TripCost cost =
        costs
            .findById(costId)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "COST_NOT_FOUND", "Gider bulunamadı."));
    if (cost.getPostedAt() != null) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "COST_POSTED", "Finansa yazılmış gider silinemez.");
    }
    cost.markDeleted();
  }

  /**
   * Cariye bağlı giderleri borç ve taslak ödeme planı olarak yazar. Kapanmış sefer yeniden
   * kapatılırsa hiçbir kayıt oluşmaz.
   */
  @Transactional
  public Shipment close(UUID shipmentId, CloseShipmentRequest request) {
    Shipment shipment = shipmentService.lock(shipmentId);
    if (shipment.getStatus() == ShipmentStatus.CLOSED) {
      return shipment;
    }
    if (shipment.getStatus() != ShipmentStatus.INVOICED) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "CLOSE_NOT_ALLOWED", "Yalnız faturalanmış sefer kapatılır.");
    }
    Instant now = Instant.now();
    for (TripCost cost : costs.findByShipmentIdOrderByCreatedAt(shipmentId)) {
      if (cost.getAccountId() == null || cost.getPostedAt() != null) {
        continue;
      }
      String description = shipment.getNumber() + " " + costLabel(cost.getKind());
      ledger.post(
          new Posting(
              cost.getAccountId(),
              shipment.getBranchId(),
              Direction.CREDIT,
              cost.getMoney(),
              request.date(),
              description,
              SOURCE_COST,
              cost.getId(),
              null));
      plans.create(
          new CreatePlanRequest(
              cost.getAccountId(),
              shipment.getBranchId(),
              cost.getMoney(),
              request.dueDate(),
              description),
          null);
      cost.markPosted(now);
    }
    shipmentService.move(shipment, ShipmentStatus.CLOSED, null);
    return shipment;
  }

  /** Cari ekstresinde ve ödeme planında görünen gider adı. */
  private static String costLabel(CostKind kind) {
    return switch (kind) {
      case FUEL -> "yakıt";
      case TOLL -> "geçiş ücreti";
      case PER_DIEM -> "harcırah";
      case SUBCONTRACTOR -> "taşeron";
      case BORDER_FEE -> "sınır geçiş ücreti";
      case OTHER -> "diğer gider";
    };
  }

  @Transactional(readOnly = true)
  public ProfitResponse profit(UUID shipmentId) {
    Shipment shipment = shipments.findById(shipmentId).orElseThrow();
    return profitRows(List.of(shipment)).get(0);
  }

  @Transactional(readOnly = true)
  public List<ProfitResponse> profitBetween(LocalDate from, LocalDate to) {
    return profitRows(
        shipments
            .findByPlannedPickupBetweenOrderByPlannedPickup(
                clock.startOf(from), clock.startOf(to.plusDays(1)))
            .stream()
            .filter(shipment -> shipment.getStatus() != ShipmentStatus.CANCELLED)
            .toList());
  }

  private List<ProfitResponse> profitRows(List<Shipment> list) {
    List<UUID> ids = list.stream().map(Shipment::getId).toList();
    Map<UUID, BigDecimal> costTotals =
        live(costs.findByShipmentIdIn(ids)).stream()
            .collect(
                Collectors.groupingBy(
                    TripCost::getShipmentId,
                    Collectors.reducing(BigDecimal.ZERO, TripCost::getTlAmount, BigDecimal::add)));
    Map<UUID, FreightInvoice> invoiceByShipment =
        ShipmentViews.index(
            invoices.findByShipmentIdInAndStatus(ids, InvoiceStatus.ISSUED),
            FreightInvoice::getShipmentId);
    Map<UUID, String> names =
        views.accountNames(list.stream().map(Shipment::getAccountId).collect(Collectors.toSet()));
    List<ProfitResponse> rows = new ArrayList<>();
    for (Shipment shipment : list) {
      FreightInvoice invoice = invoiceByShipment.get(shipment.getId());
      BigDecimal revenue = invoice != null ? invoice.getNetTl() : estimateRevenue(shipment);
      BigDecimal cost = costTotals.getOrDefault(shipment.getId(), BigDecimal.ZERO);
      BigDecimal margin = revenue == null ? null : revenue.subtract(cost);
      BigDecimal percent =
          revenue == null || revenue.signum() == 0
              ? null
              : margin.multiply(HUNDRED).divide(revenue, PERCENT_SCALE, RoundingMode.HALF_UP);
      rows.add(
          new ProfitResponse(
              shipment.getId(),
              shipment.getNumber(),
              names.get(shipment.getAccountId()),
              shipment.getStatus(),
              revenue,
              cost,
              margin,
              percent,
              invoice != null));
    }
    return rows;
  }

  /** Fatura kesilmeden gelir tahminidir; kur bulunamazsa boş döner. */
  private BigDecimal estimateRevenue(Shipment shipment) {
    try {
      return rates
          .convert(shipment.getNet(), clock.dateOf(shipment.getPlannedPickup()), null)
          .tlAmount();
    } catch (BusinessException ex) {
      return null;
    }
  }

  private FreightInvoice findInvoice(UUID id) {
    return invoices
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "INVOICE_NOT_FOUND", "Fatura bulunamadı."));
  }
}
