package org.ece.blackrose.fleet.service;

import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.ExpenseItem;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.domain.FundAccount;
import org.ece.blackrose.finance.domain.Settlement;
import org.ece.blackrose.finance.repository.FinanceRepositories.ExpenseItemRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundAccountRepository;
import org.ece.blackrose.finance.service.ExchangeRateService;
import org.ece.blackrose.finance.service.LedgerService;
import org.ece.blackrose.finance.service.LedgerService.Posting;
import org.ece.blackrose.finance.service.SettlementService;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementRequest;
import org.ece.blackrose.fleet.domain.FleetTypes.ExpenseKind;
import org.ece.blackrose.fleet.domain.Vehicle;
import org.ece.blackrose.fleet.domain.VehicleExpense;
import org.ece.blackrose.fleet.repository.FleetRepositories.VehicleExpenseRepository;
import org.ece.blackrose.fleet.repository.FleetRepositories.VehicleRepository;
import org.ece.blackrose.fleet.web.FleetDtos.SaveVehicleExpenseRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Araç giderini finansa tek işlemde yazar. Tedarikçi seçildiyse carisine ALACAK (borcumuz), hesap
 * seçildiyse banka/kasadan doğrudan ödeme oluşur. Finans kaydı başarısızsa gider de oluşmaz.
 */
@Service
public class VehicleExpenseService {

  private static final String SOURCE_VEHICLE_EXPENSE = "VEHICLE_EXPENSE";

  private final VehicleExpenseRepository expenses;
  private final VehicleRepository vehicles;
  private final ExpenseItemRepository expenseItems;
  private final FundAccountRepository funds;
  private final LedgerService ledger;
  private final SettlementService settlements;
  private final ExchangeRateService rates;

  public VehicleExpenseService(
      VehicleExpenseRepository expenses,
      VehicleRepository vehicles,
      ExpenseItemRepository expenseItems,
      FundAccountRepository funds,
      LedgerService ledger,
      SettlementService settlements,
      ExchangeRateService rates) {
    this.expenses = expenses;
    this.vehicles = vehicles;
    this.expenseItems = expenseItems;
    this.funds = funds;
    this.ledger = ledger;
    this.settlements = settlements;
    this.rates = rates;
  }

  @Transactional(readOnly = true)
  public Page<VehicleExpense> list(UUID vehicleId, ExpenseKind kind, Pageable pageable) {
    return expenses.search(vehicleId, kind, pageable);
  }

  @Transactional
  public VehicleExpense create(UUID vehicleId, SaveVehicleExpenseRequest request) {
    Vehicle vehicle =
        vehicles
            .findForUpdate(vehicleId)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "VEHICLE_NOT_FOUND", "Araç bulunamadı."));
    validate(request);
    var conversion = rates.convert(request.money(), request.date(), request.exchangeRate());
    VehicleExpense expense =
        expenses.save(new VehicleExpense(vehicleId, request, conversion.tlAmount()));
    String description = describe(vehicle, request);
    if (request.supplierAccountId() != null) {
      ledger.post(
          new Posting(
              request.supplierAccountId(),
              request.branchId(),
              Direction.CREDIT,
              request.money(),
              request.date(),
              description,
              SOURCE_VEHICLE_EXPENSE,
              expense.getId(),
              request.exchangeRate()));
    } else {
      expense.linkSettlement(payDirectly(expense.getId(), request, description).getId());
    }
    vehicle.recordOdometer(request.odometerKm());
    return expense;
  }

  /** Gideri silmek yerine finans kaydını ters çevirir ve gideri raporlardan çıkarır. */
  @Transactional
  public void reverse(UUID id, LocalDate date) {
    VehicleExpense expense =
        expenses
            .findById(id)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "EXPENSE_NOT_FOUND", "Gider bulunamadı."));
    String description = "Araç gideri iptali";
    if (expense.getSettlementId() != null) {
      settlements.reverse(expense.getSettlementId(), date, description);
    } else {
      ledger.reverseSource(SOURCE_VEHICLE_EXPENSE, id, date, description);
    }
    expense.markDeleted();
  }

  private Settlement payDirectly(
      UUID expenseId, SaveVehicleExpenseRequest request, String description) {
    FundAccount fund =
        funds
            .findById(request.fundAccountId())
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "FUND_NOT_FOUND", "Banka/kasa hesabı bulunamadı."));
    SettlementMethod method = SettlementMethod.valueOf(fund.getKind().name());
    return settlements.create(
        SettlementType.PAYMENT,
        new SettlementRequest(
            method,
            null,
            request.branchId(),
            fund.getId(),
            expenseItemId(request.kind()),
            null,
            null,
            request.money(),
            request.date(),
            description,
            request.exchangeRate()),
        SOURCE_VEHICLE_EXPENSE + ":" + expenseId,
        null);
  }

  /** Doğrudan ödeme gider kalemi ister; tanım silinmişse açık hata verilir. */
  private UUID expenseItemId(ExpenseKind kind) {
    String code =
        switch (kind) {
          case FUEL -> "FUEL";
          case TIRE -> "TIRE";
          case MAINTENANCE, REPAIR -> "REPAIR";
        };
    return expenseItems
        .findByCode(code)
        .map(ExpenseItem::getId)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "EXPENSE_ITEM_MISSING",
                    "Gider kalemi tanımlı değil: " + code));
  }

  private static void validate(SaveVehicleExpenseRequest request) {
    boolean supplier = request.supplierAccountId() != null;
    boolean fund = request.fundAccountId() != null;
    if (supplier == fund) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "EXPENSE_TARGET_REQUIRED",
          "Tedarikçi veya banka/kasa hesabından yalnız biri seçilmelidir.");
    }
    if (request.money().amount().signum() <= 0) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "AMOUNT_INVALID", "Tutar sıfırdan büyük olmalıdır.");
    }
    if (request.kind() == ExpenseKind.FUEL
        && (request.liters() == null || request.odometerKm() == null)) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "FUEL_DATA_REQUIRED", "Yakıt kaydında litre ve km zorunludur.");
    }
  }

  private static String describe(Vehicle vehicle, SaveVehicleExpenseRequest request) {
    String text = request.description() == null ? "" : " · " + request.description();
    return vehicle.getPlate() + " " + request.kind() + text;
  }
}
