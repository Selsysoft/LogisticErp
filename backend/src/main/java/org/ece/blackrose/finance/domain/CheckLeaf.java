package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.finance.domain.FinanceTypes.CheckLeafStatus;
import org.hibernate.annotations.SQLRestriction;

/**
 * Koçandaki tek çek kağıdı (V38 {@code check_leaf}). Çek → yaprak bağı yalnız {@code
 * instrument.check_leaf_id} üzerindedir. Geçersiz geçiş {@link IllegalStateException} fırlatır;
 * servis önce denetler (12.3_TASARIM §2.1).
 */
@Entity
@Table(name = "check_leaf")
@SQLRestriction("deleted = false")
public class CheckLeaf extends AuditableEntity {

  @Id private UUID id;
  private UUID companyId;
  private UUID checkBookId;
  private UUID fundAccountId;
  private int leafNo;
  private String number;
  private String micrCode;

  @Enumerated(EnumType.STRING)
  private CheckLeafStatus status;

  private LocalDate usedDate;
  private String voidReason;

  protected CheckLeaf() {}

  public CheckLeaf(
      UUID companyId,
      UUID checkBookId,
      UUID fundAccountId,
      int leafNo,
      String number,
      String micrCode) {
    this.id = UUID.randomUUID();
    this.companyId = companyId;
    this.checkBookId = checkBookId;
    this.fundAccountId = fundAccountId;
    this.leafNo = leafNo;
    this.number = number;
    this.micrCode = micrCode;
    this.status = CheckLeafStatus.UNUSED;
  }

  /** {@code UNUSED → USED}: yaprak bir çekte kullanıldı. */
  public void use(LocalDate date) {
    require(status == CheckLeafStatus.UNUSED, "use");
    this.status = CheckLeafStatus.USED;
    this.usedDate = date;
  }

  /** {@code USED → UNUSED}: düzeltmede yaprak serbest kalır (OK-12.3-6). */
  public void release() {
    require(status == CheckLeafStatus.USED, "release");
    this.status = CheckLeafStatus.UNUSED;
    this.usedDate = null;
  }

  /** {@code UNUSED|USED → VOID}: kağıt iptal edildi. */
  public void voidLeaf(String reason) {
    require(status != CheckLeafStatus.VOID, "void");
    this.status = CheckLeafStatus.VOID;
    this.voidReason = reason;
  }

  /** Yalnız kullanılmamış yaprak silinir. */
  public void softDelete() {
    require(status == CheckLeafStatus.UNUSED, "delete");
    markDeleted();
  }

  private void require(boolean allowed, String action) {
    if (!allowed) {
      throw new IllegalStateException("Yaprak " + status + " durumunda: " + action);
    }
  }

  public UUID getId() {
    return id;
  }

  public UUID getCompanyId() {
    return companyId;
  }

  public UUID getCheckBookId() {
    return checkBookId;
  }

  public UUID getFundAccountId() {
    return fundAccountId;
  }

  public int getLeafNo() {
    return leafNo;
  }

  public String getNumber() {
    return number;
  }

  public String getMicrCode() {
    return micrCode;
  }

  public CheckLeafStatus getStatus() {
    return status;
  }

  public LocalDate getUsedDate() {
    return usedDate;
  }

  public String getVoidReason() {
    return voidReason;
  }
}
