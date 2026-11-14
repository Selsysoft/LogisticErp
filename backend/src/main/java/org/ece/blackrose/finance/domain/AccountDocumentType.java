package org.ece.blackrose.finance.domain;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentSide;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.DocumentAudience;
import org.hibernate.annotations.SQLRestriction;

/**
 * Borç/Alacak Ekle belge türü (tohum V28). Aynı kod iki yönde bulunabilir ("Hizmet Faturası"), bu
 * yüzden anahtar {@code (side, code)} çiftidir.
 */
@Entity
@Table(name = "account_document_type")
@IdClass(AccountDocumentType.Key.class)
@SQLRestriction("deleted = false")
public class AccountDocumentType extends AuditableEntity {

  /** Bileşik anahtar; OpenAPI şema adı başka {@code Key} kayıtlarıyla çakışmasın diye ayrı. */
  @Schema(name = "AccountDocumentTypeKey")
  public record Key(AccountDocumentSide side, String code) implements Serializable {}

  @Id
  @Enumerated(EnumType.STRING)
  private AccountDocumentSide side;

  @Id private String code;

  private String name;

  @Enumerated(EnumType.STRING)
  private DocumentAudience audience;

  /** ZTO isFaturaType: vergi kırılımı (iskonto, KDV, stopaj) bölümü açılır. */
  private boolean invoiceSection;

  private boolean penalty;
  private boolean isDefault;
  private boolean selectable;
  private int sortOrder;
  private boolean active;

  protected AccountDocumentType() {}

  /** Tür bu cari türüne açık mı (ZTO: müşteride ceza/kesinti listesi, diğerlerinde faturalar). */
  public boolean allowedFor(AccountType type) {
    return audience == DocumentAudience.ALL
        || (audience == DocumentAudience.CUSTOMER) == (type == AccountType.CUSTOMER);
  }

  public AccountDocumentSide getSide() {
    return side;
  }

  public String getCode() {
    return code;
  }

  public String getName() {
    return name;
  }

  public DocumentAudience getAudience() {
    return audience;
  }

  public boolean isInvoiceSection() {
    return invoiceSection;
  }

  public boolean isPenalty() {
    return penalty;
  }

  public boolean isDefault() {
    return isDefault;
  }

  public boolean isSelectable() {
    return selectable;
  }

  public int getSortOrder() {
    return sortOrder;
  }

  public boolean isActive() {
    return active;
  }
}
