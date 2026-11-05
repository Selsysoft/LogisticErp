package org.ece.blackrose.customs.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.customs.domain.CustomsTypes.PermitKind;
import org.ece.blackrose.customs.web.CustomsDtos.SavePermitRequest;
import org.hibernate.annotations.SQLRestriction;

/** Uluslararası geçiş izni. Kota, kaç seferde kullanılabileceğidir. */
@Entity
@Table(name = "road_permit")
@SQLRestriction("deleted = false")
public class RoadPermit extends AuditableEntity {

  @Id private UUID id;
  private String number;

  @Enumerated(EnumType.STRING)
  private PermitKind kind;

  private String country;
  private LocalDate validFrom;
  private LocalDate validTo;
  private int quota;

  protected RoadPermit() {}

  public RoadPermit(SavePermitRequest request) {
    this.id = UUID.randomUUID();
    this.number = request.number();
    this.kind = request.kind();
    this.country = request.country();
    this.validFrom = request.validFrom();
    this.validTo = request.validTo();
    this.quota = request.quota();
  }

  public boolean validOn(LocalDate date) {
    return !date.isBefore(validFrom) && !date.isAfter(validTo);
  }

  public UUID getId() {
    return id;
  }

  public String getNumber() {
    return number;
  }

  public PermitKind getKind() {
    return kind;
  }

  public String getCountry() {
    return country;
  }

  public LocalDate getValidFrom() {
    return validFrom;
  }

  public LocalDate getValidTo() {
    return validTo;
  }

  public int getQuota() {
    return quota;
  }
}
