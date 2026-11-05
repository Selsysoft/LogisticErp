package org.ece.blackrose.integration.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.ece.blackrose.common.audit.AuditableEntity;

/** Firmanın e-belgede görünen vergi bilgileri. Tek satırdır. */
@Entity
@Table(name = "edocument_settings")
public class EDocumentSettings extends AuditableEntity {

  @Id private Integer id;
  private String taxNumber;
  private String taxOffice;
  private String address;

  protected EDocumentSettings() {}

  public void update(String taxNumber, String taxOffice, String address) {
    this.taxNumber = taxNumber;
    this.taxOffice = taxOffice;
    this.address = address;
  }

  public String getTaxNumber() {
    return taxNumber;
  }

  public String getTaxOffice() {
    return taxOffice;
  }

  public String getAddress() {
    return address;
  }
}
