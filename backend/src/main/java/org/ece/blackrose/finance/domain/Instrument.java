package org.ece.blackrose.finance.domain;

import jakarta.persistence.Column;
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
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.NoteType;
import org.hibernate.annotations.SQLRestriction;

/** Çek veya senet. Geçiş kuralları {@code InstrumentRules} içindeki tabloda tanımlıdır. */
@Entity
@Table(name = "instrument")
@SQLRestriction("deleted = false")
public class Instrument extends AuditableEntity {

  @Id private UUID id;

  @Enumerated(EnumType.STRING)
  private InstrumentKind kind;

  @Enumerated(EnumType.STRING)
  private InstrumentDirection direction;

  private String number;
  private String bankName;
  private UUID accountId;
  private UUID endorsedAccountId;
  private UUID branchId;
  private UUID companyId;
  private UUID fundAccountId;
  private BigDecimal amount;
  private String currency;
  private LocalDate dueDate;

  @Enumerated(EnumType.STRING)
  private InstrumentStatus status;

  // 12.3 (V37/V38)
  private LocalDate issueDate;
  private String bankBranch;
  private String drawerName;
  private String description;

  /** Portföydeki çekin fiziken durduğu CASH fon (para hareketi değil). */
  private UUID custodyFundId;

  @Enumerated(EnumType.STRING)
  private NoteType noteType;

  /** Teminat senedi; 12.3'te yazılmaz (OK-12.3-7). */
  @Column(name = "is_collateral", insertable = false, updatable = false)
  private boolean collateral;

  private LocalDate settledDate;
  private UUID checkLeafId;

  protected Instrument() {}

  public Instrument(
      InstrumentKind kind,
      InstrumentDirection direction,
      String number,
      String bankName,
      UUID accountId,
      UUID branchId,
      UUID companyId,
      Money money,
      LocalDate dueDate,
      InstrumentStatus status) {
    this.id = UUID.randomUUID();
    this.kind = kind;
    this.direction = direction;
    this.number = number;
    this.bankName = bankName;
    this.accountId = accountId;
    this.branchId = branchId;
    this.companyId = companyId;
    this.amount = money.amount();
    this.currency = money.currency();
    this.dueDate = dueDate;
    this.status = status;
  }

  public void moveTo(InstrumentStatus status) {
    this.status = status;
  }

  public void assignFund(UUID fundAccountId) {
    this.fundAccountId = fundAccountId;
  }

  public void endorseTo(UUID accountId) {
    this.endorsedAccountId = accountId;
  }

  /** Finansal olmayan ek alanlar: kurucudan sonra ve düzenlemede (PATCH) çağrılır. */
  public void withDetails(
      LocalDate issueDate,
      String bankBranch,
      String drawerName,
      String description,
      NoteType noteType) {
    this.issueDate = issueDate;
    this.bankBranch = bankBranch;
    this.drawerName = drawerName;
    this.description = description;
    this.noteType = noteType;
  }

  /** Yalnız düzenleme (PATCH); numara denetimi serviste. */
  public void changeNumber(String number) {
    this.number = number;
  }

  /** Yalnız düzenleme (PATCH). */
  public void changeBankName(String bankName) {
    this.bankName = bankName;
  }

  /** Yalnız düzenleme (PATCH); açık durum denetimi serviste. */
  public void changeDueDate(LocalDate dueDate) {
    this.dueDate = dueDate;
  }

  public void assignCustody(UUID fundId) {
    this.custodyFundId = fundId;
  }

  public void clearCustody() {
    this.custodyFundId = null;
  }

  /** {@code AT_BANK → PORTFOLIO}: banka bağı düşer. */
  public void clearFund() {
    this.fundAccountId = null;
  }

  /** Ciro iptali: çek portföye döner, ciro edilen cari boşalır. */
  public void clearEndorsement() {
    this.endorsedAccountId = null;
  }

  public void attachLeaf(UUID leafId) {
    this.checkLeafId = leafId;
  }

  /** Tahsil/ödeme tarihi ({@code COLLECTED}, {@code COLLECTED_TO_CASH}, {@code PAID}). */
  public void markSettled(LocalDate date) {
    this.settledDate = date;
  }

  /**
   * Cari taşımada keşideci/veren cariyi değiştirir. Şirket, durum ve fon değişmez.
   *
   * @return kart {@code from} carisine bağlıydı ve taşındıysa true
   */
  public boolean reassignAccount(UUID from, UUID to) {
    if (from == null || !from.equals(accountId)) {
      return false;
    }
    this.accountId = to;
    return true;
  }

  /**
   * Cari taşımada ciro edilen (lehtar) cariyi değiştirir. Şirket, durum ve fon değişmez.
   *
   * @return ciro {@code from} carisineydi ve taşındıysa true
   */
  public boolean reassignEndorsee(UUID from, UUID to) {
    if (from == null || !from.equals(endorsedAccountId)) {
      return false;
    }
    this.endorsedAccountId = to;
    return true;
  }

  public Money getMoney() {
    return new Money(amount, currency);
  }

  public UUID getId() {
    return id;
  }

  public InstrumentKind getKind() {
    return kind;
  }

  public InstrumentDirection getDirection() {
    return direction;
  }

  public String getNumber() {
    return number;
  }

  public String getBankName() {
    return bankName;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public UUID getEndorsedAccountId() {
    return endorsedAccountId;
  }

  public UUID getBranchId() {
    return branchId;
  }

  public UUID getFundAccountId() {
    return fundAccountId;
  }

  public LocalDate getDueDate() {
    return dueDate;
  }

  public InstrumentStatus getStatus() {
    return status;
  }

  public UUID getCompanyId() {
    return companyId;
  }

  public LocalDate getIssueDate() {
    return issueDate;
  }

  public String getBankBranch() {
    return bankBranch;
  }

  public String getDrawerName() {
    return drawerName;
  }

  public String getDescription() {
    return description;
  }

  public UUID getCustodyFundId() {
    return custodyFundId;
  }

  public NoteType getNoteType() {
    return noteType;
  }

  public boolean isCollateral() {
    return collateral;
  }

  public LocalDate getSettledDate() {
    return settledDate;
  }

  public UUID getCheckLeafId() {
    return checkLeafId;
  }
}
