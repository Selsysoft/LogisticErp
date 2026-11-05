package org.ece.blackrose.integration.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.integration.domain.IntegrationTypes.ImportKind;

/** HGS/OGS veya yakıt kartı dosyası. Gider, seçilen cariye yazılır. */
@Entity
@Table(name = "import_batch")
public class ImportBatch extends AuditableEntity {

  @Id private UUID id;

  @Enumerated(EnumType.STRING)
  private ImportKind kind;

  private String fileName;
  private UUID accountId;
  private UUID branchId;
  private int duplicates;

  protected ImportBatch() {}

  public ImportBatch(ImportKind kind, String fileName, UUID accountId, UUID branchId) {
    this.id = UUID.randomUUID();
    this.kind = kind;
    this.fileName = fileName;
    this.accountId = accountId;
    this.branchId = branchId;
  }

  public void countDuplicates(int count) {
    duplicates = count;
  }

  public UUID getId() {
    return id;
  }

  public ImportKind getKind() {
    return kind;
  }

  public String getFileName() {
    return fileName;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public UUID getBranchId() {
    return branchId;
  }

  public int getDuplicates() {
    return duplicates;
  }
}
