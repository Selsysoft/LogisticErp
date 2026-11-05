package org.ece.blackrose.saas.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.saas.domain.SaasTypes.LimitedResource;

/** Boş sınır, sınırsız demektir. */
@Entity
@Table(name = "plan", schema = "admin")
public class Plan extends AuditableEntity {

  public static final String TRIAL_CODE = "DENEME";

  @Id private UUID id;
  private String code;
  private String name;
  private BigDecimal monthlyPrice;
  private String currency;
  private Integer maxUsers;
  private Integer maxVehicles;
  private Integer maxShipmentsMonth;
  private boolean active;

  protected Plan() {}

  public Plan(String code) {
    this.id = UUID.randomUUID();
    this.code = code;
  }

  public void update(
      String name,
      BigDecimal monthlyPrice,
      String currency,
      Integer maxUsers,
      Integer maxVehicles,
      Integer maxShipmentsMonth,
      boolean active) {
    this.name = name;
    this.monthlyPrice = monthlyPrice;
    this.currency = currency;
    this.maxUsers = maxUsers;
    this.maxVehicles = maxVehicles;
    this.maxShipmentsMonth = maxShipmentsMonth;
    this.active = active;
  }

  public Integer limitOf(LimitedResource resource) {
    return switch (resource) {
      case USERS -> maxUsers;
      case VEHICLES -> maxVehicles;
      case SHIPMENTS_MONTH -> maxShipmentsMonth;
    };
  }

  public boolean isPaid() {
    return monthlyPrice.signum() > 0;
  }

  public UUID getId() {
    return id;
  }

  public String getCode() {
    return code;
  }

  public String getName() {
    return name;
  }

  public BigDecimal getMonthlyPrice() {
    return monthlyPrice;
  }

  public String getCurrency() {
    return currency;
  }

  public Integer getMaxUsers() {
    return maxUsers;
  }

  public Integer getMaxVehicles() {
    return maxVehicles;
  }

  public Integer getMaxShipmentsMonth() {
    return maxShipmentsMonth;
  }

  public boolean isActive() {
    return active;
  }
}
