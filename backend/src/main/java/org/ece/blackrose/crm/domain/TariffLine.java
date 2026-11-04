package org.ece.blackrose.crm.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.crm.domain.CrmTypes.PriceUnit;
import org.ece.blackrose.crm.domain.CrmTypes.TariffLineKind;
import org.hibernate.annotations.SQLRestriction;

/** Güzergâh satırı öncelikli; güzergâh bulunamazsa mesafe satırı kullanılır. */
@Entity
@Table(name = "tariff_line")
@SQLRestriction("deleted = false")
public class TariffLine extends AuditableEntity {

  @Id private UUID id;
  private UUID tariffId;

  @Enumerated(EnumType.STRING)
  private TariffLineKind kind;

  private String origin;
  private String destination;
  private String vehicleType;

  @Enumerated(EnumType.STRING)
  private PriceUnit unit;

  private BigDecimal unitPrice;
  private BigDecimal minAmount;

  protected TariffLine() {}

  public TariffLine(
      UUID tariffId,
      TariffLineKind kind,
      String origin,
      String destination,
      String vehicleType,
      PriceUnit unit,
      BigDecimal unitPrice,
      BigDecimal minAmount) {
    this.id = UUID.randomUUID();
    this.tariffId = tariffId;
    this.kind = kind;
    this.origin = origin;
    this.destination = destination;
    this.vehicleType = vehicleType;
    this.unit = unit;
    this.unitPrice = unitPrice;
    this.minAmount = minAmount;
  }

  public UUID getId() {
    return id;
  }

  public UUID getTariffId() {
    return tariffId;
  }

  public TariffLineKind getKind() {
    return kind;
  }

  public String getOrigin() {
    return origin;
  }

  public String getDestination() {
    return destination;
  }

  public String getVehicleType() {
    return vehicleType;
  }

  public PriceUnit getUnit() {
    return unit;
  }

  public BigDecimal getUnitPrice() {
    return unitPrice;
  }

  public BigDecimal getMinAmount() {
    return minAmount;
  }
}
