package org.ece.blackrose.warehouse.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.crm.service.PricingService;
import org.ece.blackrose.crm.web.CrmDtos.PriceBreakdown;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.service.LedgerService;
import org.ece.blackrose.finance.service.LedgerService.Posting;
import org.ece.blackrose.tenant.TenantClock;
import org.ece.blackrose.warehouse.domain.HandlingCharge;
import org.ece.blackrose.warehouse.domain.HandlingRate;
import org.ece.blackrose.warehouse.domain.StockItem;
import org.ece.blackrose.warehouse.domain.Warehouse;
import org.ece.blackrose.warehouse.domain.WarehouseContract;
import org.ece.blackrose.warehouse.domain.WarehouseInvoice;
import org.ece.blackrose.warehouse.domain.WarehouseInvoice.Amounts;
import org.ece.blackrose.warehouse.domain.WarehouseTypes.WarehouseInvoiceStatus;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.HandlingChargeRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.HandlingRateRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.StockItemRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.StockMovementRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.WarehouseContractRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.WarehouseInvoiceRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.WarehouseRepository;
import org.ece.blackrose.warehouse.service.StorageCalculator.DailyDelta;
import org.ece.blackrose.warehouse.web.WarehouseDtos.InvoicePreview;
import org.ece.blackrose.warehouse.web.WarehouseDtos.IssueWarehouseInvoiceRequest;
import org.ece.blackrose.warehouse.web.WarehouseDtos.SaveContractRequest;
import org.ece.blackrose.warehouse.web.WarehouseDtos.SaveHandlingRequest;
import org.ece.blackrose.warehouse.web.WarehouseDtos.SaveRateRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 3PL sözleşmesi, elleçleme ve dönemsel fatura. Gelir fatura kesilince cariye yazılır. */
@Service
public class WarehouseBillingService {

  private static final String SOURCE_INVOICE = "WAREHOUSE_INVOICE";
  private static final int MONEY_SCALE = 2;

  private final WarehouseContractRepository contracts;
  private final HandlingRateRepository rates;
  private final HandlingChargeRepository charges;
  private final WarehouseInvoiceRepository invoices;
  private final WarehouseRepository warehouses;
  private final StockItemRepository items;
  private final StockMovementRepository movements;
  private final AccountRepository accounts;
  private final StockService stock;
  private final PricingService pricing;
  private final LedgerService ledger;
  private final TenantClock clock;

  public WarehouseBillingService(
      WarehouseContractRepository contracts,
      HandlingRateRepository rates,
      HandlingChargeRepository charges,
      WarehouseInvoiceRepository invoices,
      WarehouseRepository warehouses,
      StockItemRepository items,
      StockMovementRepository movements,
      AccountRepository accounts,
      StockService stock,
      PricingService pricing,
      LedgerService ledger,
      TenantClock clock) {
    this.clock = clock;
    this.contracts = contracts;
    this.rates = rates;
    this.charges = charges;
    this.invoices = invoices;
    this.warehouses = warehouses;
    this.items = items;
    this.movements = movements;
    this.accounts = accounts;
    this.stock = stock;
    this.pricing = pricing;
    this.ledger = ledger;
  }

  @Transactional
  public WarehouseContract createContract(SaveContractRequest request) {
    if (!accounts.existsById(request.accountId())) {
      throw new BusinessException(HttpStatus.NOT_FOUND, "ACCOUNT_NOT_FOUND", "Cari bulunamadı.");
    }
    lockWarehouse(request.warehouseId());
    if (request.endDate().isBefore(request.startDate())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "PERIOD_INVALID", "Bitiş tarihi başlangıçtan önce olamaz.");
    }
    if (contracts.overlaps(
        request.accountId(), request.warehouseId(), request.startDate(), request.endDate())) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "CONTRACT_OVERLAP",
          "Bu müşteri ve depo için aynı dönemde başka sözleşme var.");
    }
    return contracts.save(new WarehouseContract(request));
  }

  @Transactional
  public HandlingRate saveRate(UUID contractId, SaveRateRequest request) {
    findContract(contractId);
    return rates
        .findByContractIdAndKind(contractId, request.kind())
        .map(
            rate -> {
              rate.changePrice(request.unitPrice());
              return rate;
            })
        .orElseGet(
            () -> rates.save(new HandlingRate(contractId, request.kind(), request.unitPrice())));
  }

  @Transactional
  public HandlingCharge addHandling(UUID contractId, SaveHandlingRequest request) {
    WarehouseContract contract = findContract(contractId);
    lockWarehouse(contract.getWarehouseId());
    if (!contract.covers(request.date())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "DATE_OUT_OF_CONTRACT", "Tarih sözleşme dönemi dışında.");
    }
    stock.ensureDateOpen(contract.getAccountId(), contract.getWarehouseId(), request.date());
    HandlingRate rate =
        rates
            .findByContractIdAndKind(contractId, request.kind())
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.CONFLICT,
                        "RATE_NOT_DEFINED",
                        "Bu elleçleme için sözleşmede fiyat yok."));
    BigDecimal amount =
        rate.getUnitPrice()
            .multiply(request.quantity())
            .setScale(MONEY_SCALE, RoundingMode.HALF_UP);
    return charges.save(
        new HandlingCharge(
            contractId,
            request.kind(),
            request.quantity(),
            rate.getUnitPrice(),
            amount,
            request.date(),
            request.shipmentId(),
            request.note()));
  }

  @Transactional
  public void removeHandling(UUID chargeId) {
    HandlingCharge charge =
        charges
            .findById(chargeId)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "CHARGE_NOT_FOUND", "Elleçleme kaydı bulunamadı."));
    if (charge.getInvoiceId() != null) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "CHARGE_BILLED", "Faturalanmış elleçleme silinemez.");
    }
    charge.markDeleted();
  }

  @Transactional(readOnly = true)
  public InvoicePreview preview(UUID contractId, LocalDate from, LocalDate to) {
    WarehouseContract contract = findContract(contractId);
    ensurePeriod(contract, from, to);
    Amounts amounts = calculate(contract, from, to);
    PriceBreakdown price = price(contract, amounts);
    String currency = contract.getCurrency();
    return new InvoicePreview(
        from,
        to,
        amounts.storageQuantity(),
        new Money(amounts.storage(), currency),
        new Money(amounts.handling(), currency),
        new Money(price.net(), currency),
        new Money(price.vat(), currency),
        new Money(price.withholding(), currency),
        new Money(price.total(), currency));
  }

  @Transactional
  public WarehouseInvoice issue(UUID contractId, IssueWarehouseInvoiceRequest request) {
    WarehouseContract contract = findContract(contractId);
    Warehouse warehouse = lockWarehouse(contract.getWarehouseId());
    ensurePeriod(contract, request.from(), request.to());
    if (request.dueDate().isBefore(request.invoiceDate())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "INVOICE_DATES_INVALID", "Vade, fatura tarihinden önce olamaz.");
    }
    if (invoices.overlaps(contractId, request.from(), request.to())) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "PERIOD_ALREADY_INVOICED", "Bu dönemin faturası zaten kesilmiş.");
    }
    Amounts amounts = calculate(contract, request.from(), request.to());
    if (amounts.storage().add(amounts.handling()).signum() <= 0) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "NOTHING_TO_BILL", "Bu dönemde faturalanacak tutar yok.");
    }
    PriceBreakdown price = price(contract, amounts);
    String number = "DF-%d-%06d".formatted(request.invoiceDate().getYear(), invoices.nextNumber());
    WarehouseInvoice invoice =
        invoices.save(
            new WarehouseInvoice(
                number,
                contract,
                warehouse.getBranchId(),
                request.from(),
                request.to(),
                request.invoiceDate(),
                request.dueDate(),
                amounts,
                price));
    charges
        .findByContractIdAndInvoiceIdIsNullAndChargedOnBetween(
            contractId, request.from(), request.to())
        .forEach(charge -> charge.bill(invoice.getId()));
    ledger.post(
        new Posting(
            invoice.getAccountId(),
            invoice.getBranchId(),
            Direction.DEBIT,
            invoice.getTotal(),
            request.invoiceDate(),
            "Depo faturası " + number,
            SOURCE_INVOICE,
            invoice.getId(),
            request.exchangeRate()));
    return invoice;
  }

  /** Cariye ters kayıt yazar, elleçlemeleri serbest bırakır ve dönemi yeniden açar. */
  @Transactional
  public WarehouseInvoice cancel(UUID invoiceId, LocalDate date) {
    WarehouseInvoice invoice = findInvoice(invoiceId);
    if (invoice.getStatus() == WarehouseInvoiceStatus.CANCELLED) {
      return invoice;
    }
    lockWarehouse(findContract(invoice.getContractId()).getWarehouseId());
    ledger.reverseSource(SOURCE_INVOICE, invoiceId, date, "Fatura iptali " + invoice.getNumber());
    charges.findByInvoiceId(invoiceId).forEach(charge -> charge.bill(null));
    invoice.cancel();
    return invoice;
  }

  @Transactional(readOnly = true)
  public WarehouseInvoice findInvoice(UUID id) {
    return invoices
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "INVOICE_NOT_FOUND", "Fatura bulunamadı."));
  }

  private Amounts calculate(WarehouseContract contract, LocalDate from, LocalDate to) {
    List<DailyDelta> deltas =
        movements.dailyQuantities(contract.getAccountId(), contract.getWarehouseId(), to).stream()
            .map(row -> new DailyDelta(row.getItemId(), row.getMovedOn(), row.getQuantity()))
            .toList();
    Map<UUID, BigDecimal> factors =
        items
            .findAllById(deltas.stream().map(DailyDelta::itemId).collect(Collectors.toSet()))
            .stream()
            .collect(Collectors.toMap(StockItem::getId, StockItem::getUnitsPerBillingUnit));
    BigDecimal quantity = StorageCalculator.billingUnitDays(deltas, factors, from, to);
    BigDecimal storage =
        quantity.multiply(contract.getStorageRate()).setScale(MONEY_SCALE, RoundingMode.HALF_UP);
    BigDecimal handling =
        charges
            .findByContractIdAndInvoiceIdIsNullAndChargedOnBetween(contract.getId(), from, to)
            .stream()
            .map(HandlingCharge::getAmount)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    return new Amounts(quantity, storage, handling);
  }

  private PriceBreakdown price(WarehouseContract contract, Amounts amounts) {
    return pricing.manual(
        amounts.storage().add(amounts.handling()), contract.getCurrency(), contract.getTaxRateId());
  }

  private void ensurePeriod(WarehouseContract contract, LocalDate from, LocalDate to) {
    if (to.isBefore(from)) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "PERIOD_INVALID", "Bitiş tarihi başlangıçtan önce olamaz.");
    }
    if (to.isAfter(clock.today())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "PERIOD_IN_FUTURE", "Henüz gelmemiş günler faturalanamaz.");
    }
    if (!contract.covers(from) || !contract.covers(to)) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "DATE_OUT_OF_CONTRACT", "Dönem sözleşme dışında.");
    }
  }

  private WarehouseContract findContract(UUID id) {
    return contracts
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "CONTRACT_NOT_FOUND", "Sözleşme bulunamadı."));
  }

  private Warehouse lockWarehouse(UUID id) {
    return warehouses
        .findForUpdate(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "WAREHOUSE_NOT_FOUND", "Depo bulunamadı."));
  }
}
