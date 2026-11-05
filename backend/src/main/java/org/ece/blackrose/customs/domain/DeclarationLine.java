package org.ece.blackrose.customs.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.customs.web.CustomsDtos.SaveLineRequest;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "customs_declaration_line")
@SQLRestriction("deleted = false")
public class DeclarationLine extends AuditableEntity {

  @Id private UUID id;
  private UUID declarationId;
  private String hsCode;
  private String description;
  private BigDecimal quantity;
  private BigDecimal weightKg;
  private BigDecimal valueAmount;

  protected DeclarationLine() {}

  public DeclarationLine(UUID declarationId, SaveLineRequest request) {
    this.id = UUID.randomUUID();
    this.declarationId = declarationId;
    this.hsCode = request.hsCode();
    this.description = request.description();
    this.quantity = request.quantity();
    this.weightKg = request.weightKg();
    this.valueAmount = request.value();
  }

  public UUID getId() {
    return id;
  }

  public UUID getDeclarationId() {
    return declarationId;
  }

  public String getHsCode() {
    return hsCode;
  }

  public String getDescription() {
    return description;
  }

  public BigDecimal getQuantity() {
    return quantity;
  }

  public BigDecimal getWeightKg() {
    return weightKg;
  }

  public BigDecimal getValueAmount() {
    return valueAmount;
  }
}
