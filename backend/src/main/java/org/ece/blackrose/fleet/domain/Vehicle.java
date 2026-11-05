package org.ece.blackrose.fleet.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.fleet.domain.FleetTypes.Ownership;
import org.ece.blackrose.fleet.domain.FleetTypes.VehicleKind;
import org.ece.blackrose.fleet.domain.FleetTypes.VehicleStatus;
import org.ece.blackrose.fleet.web.FleetDtos.SaveVehicleRequest;
import org.hibernate.annotations.SQLRestriction;

/** Çekici, kamyon, kamyonet ve dorse tek kütüktedir; kuralları aynıdır. */
@Entity
@Table(name = "vehicle")
@SQLRestriction("deleted = false")
public class Vehicle extends AuditableEntity {

  @Id private UUID id;
  private String plate;

  @Enumerated(EnumType.STRING)
  private VehicleKind kind;

  private String brand;
  private String model;
  private Integer modelYear;
  private BigDecimal capacityTon;

  @Column(name = "capacity_m3")
  private BigDecimal capacityM3;

  private Integer capacityPallet;
  private String fuelType;

  @Enumerated(EnumType.STRING)
  private Ownership ownership;

  @Enumerated(EnumType.STRING)
  private VehicleStatus status;

  private UUID branchId;
  private BigDecimal odometerKm;

  protected Vehicle() {}

  public Vehicle(String plate, SaveVehicleRequest request) {
    this.id = UUID.randomUUID();
    this.plate = plate;
    update(plate, request);
  }

  public final void update(String plate, SaveVehicleRequest request) {
    this.plate = plate;
    this.kind = request.kind();
    this.brand = request.brand();
    this.model = request.model();
    this.modelYear = request.modelYear();
    this.capacityTon = request.capacityTon();
    this.capacityM3 = request.capacityM3();
    this.capacityPallet = request.capacityPallet();
    this.fuelType = request.fuelType();
    this.ownership = request.ownership();
    this.status = request.status();
    this.branchId = request.branchId();
  }

  /** Geriye dönük girilen kayıt sayacı düşürmez. */
  public void recordOdometer(BigDecimal km) {
    if (km != null && (odometerKm == null || km.compareTo(odometerKm) > 0)) {
      odometerKm = km;
    }
  }

  public UUID getId() {
    return id;
  }

  public String getPlate() {
    return plate;
  }

  public VehicleKind getKind() {
    return kind;
  }

  public String getBrand() {
    return brand;
  }

  public String getModel() {
    return model;
  }

  public Integer getModelYear() {
    return modelYear;
  }

  public BigDecimal getCapacityTon() {
    return capacityTon;
  }

  public BigDecimal getCapacityM3() {
    return capacityM3;
  }

  public Integer getCapacityPallet() {
    return capacityPallet;
  }

  public String getFuelType() {
    return fuelType;
  }

  public Ownership getOwnership() {
    return ownership;
  }

  public VehicleStatus getStatus() {
    return status;
  }

  public UUID getBranchId() {
    return branchId;
  }

  public BigDecimal getOdometerKm() {
    return odometerKm;
  }
}
