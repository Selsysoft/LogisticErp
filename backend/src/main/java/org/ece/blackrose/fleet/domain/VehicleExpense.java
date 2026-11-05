package org.ece.blackrose.fleet.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.fleet.domain.FleetTypes.ExpenseKind;
import org.ece.blackrose.fleet.web.FleetDtos.SaveVehicleExpenseRequest;
import org.hibernate.annotations.SQLRestriction;

/** Bakım, onarım, lastik veya yakıt kaydı; finans kaydıyla birlikte oluşur. */
@Entity
@Table(name = "vehicle_expense")
@SQLRestriction("deleted = false")
public class VehicleExpense extends AuditableEntity {

  @Id private UUID id;
  private UUID vehicleId;

  @Enumerated(EnumType.STRING)
  private ExpenseKind kind;

  private LocalDate expenseDate;
  private BigDecimal odometerKm;
  private String description;
  private BigDecimal amount;
  private String currency;
  private BigDecimal tlAmount;
  private UUID branchId;
  private UUID supplierAccountId;
  private UUID fundAccountId;
  private UUID settlementId;
  private BigDecimal liters;
  private String station;
  private String tirePosition;
  private LocalDate nextDueDate;
  private BigDecimal nextDueKm;

  protected VehicleExpense() {}

  public VehicleExpense(UUID vehicleId, SaveVehicleExpenseRequest request, BigDecimal tlAmount) {
    this.id = UUID.randomUUID();
    this.vehicleId = vehicleId;
    this.kind = request.kind();
    this.expenseDate = request.date();
    this.odometerKm = request.odometerKm();
    this.description = request.description();
    this.amount = request.money().amount();
    this.currency = request.money().currency();
    this.tlAmount = tlAmount;
    this.branchId = request.branchId();
    this.supplierAccountId = request.supplierAccountId();
    this.fundAccountId = request.fundAccountId();
    this.liters = request.liters();
    this.station = request.station();
    this.tirePosition = request.tirePosition();
    this.nextDueDate = request.nextDueDate();
    this.nextDueKm = request.nextDueKm();
  }

  public void linkSettlement(UUID settlementId) {
    this.settlementId = settlementId;
  }

  public Money getMoney() {
    return new Money(amount, currency);
  }

  public UUID getId() {
    return id;
  }

  public UUID getVehicleId() {
    return vehicleId;
  }

  public ExpenseKind getKind() {
    return kind;
  }

  public LocalDate getExpenseDate() {
    return expenseDate;
  }

  public BigDecimal getOdometerKm() {
    return odometerKm;
  }

  public String getDescription() {
    return description;
  }

  public BigDecimal getTlAmount() {
    return tlAmount;
  }

  public UUID getBranchId() {
    return branchId;
  }

  public UUID getSupplierAccountId() {
    return supplierAccountId;
  }

  public UUID getFundAccountId() {
    return fundAccountId;
  }

  public UUID getSettlementId() {
    return settlementId;
  }

  public BigDecimal getLiters() {
    return liters;
  }

  public String getStation() {
    return station;
  }

  public String getTirePosition() {
    return tirePosition;
  }

  public LocalDate getNextDueDate() {
    return nextDueDate;
  }

  public BigDecimal getNextDueKm() {
    return nextDueKm;
  }
}
