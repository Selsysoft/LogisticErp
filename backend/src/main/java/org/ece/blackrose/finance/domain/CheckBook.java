package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

/**
 * Çek koçanı (V38 {@code check_book}). Şirket kapsamı bileşik FK ile; {@code branchId} fondan
 * kopyalanır. 12.3'te koçan silinmez (12.3_TASARIM §2.1).
 */
@Entity
@Table(name = "check_book")
@SQLRestriction("deleted = false")
public class CheckBook extends AuditableEntity {

  @Id private UUID id;
  private UUID companyId;
  private UUID branchId;
  private UUID fundAccountId;
  private String serialNo;
  private String bankCode;
  private String branchCode;
  private String startNumber;
  private String endNumber;
  private int leafCount;

  protected CheckBook() {}

  public CheckBook(
      UUID companyId,
      UUID branchId,
      UUID fundAccountId,
      String serialNo,
      String bankCode,
      String branchCode,
      String startNumber,
      String endNumber,
      int leafCount) {
    this.id = UUID.randomUUID();
    this.companyId = companyId;
    this.branchId = branchId;
    this.fundAccountId = fundAccountId;
    this.serialNo = serialNo;
    this.bankCode = bankCode;
    this.branchCode = branchCode;
    this.startNumber = startNumber;
    this.endNumber = endNumber;
    this.leafCount = leafCount;
  }

  public UUID getId() {
    return id;
  }

  public UUID getCompanyId() {
    return companyId;
  }

  public UUID getBranchId() {
    return branchId;
  }

  public UUID getFundAccountId() {
    return fundAccountId;
  }

  public String getSerialNo() {
    return serialNo;
  }

  public String getBankCode() {
    return bankCode;
  }

  public String getBranchCode() {
    return branchCode;
  }

  public String getStartNumber() {
    return startNumber;
  }

  public String getEndNumber() {
    return endNumber;
  }

  public int getLeafCount() {
    return leafCount;
  }
}
