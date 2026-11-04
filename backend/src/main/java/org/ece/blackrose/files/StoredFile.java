package org.ece.blackrose.files;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "stored_file")
@SQLRestriction("deleted = false")
public class StoredFile extends AuditableEntity {

  @Id private UUID id;
  private String ownerType;
  private UUID ownerId;
  private String fileName;
  private String contentType;
  private long sizeBytes;
  private String storageKey;

  protected StoredFile() {}

  public StoredFile(
      UUID id,
      String ownerType,
      UUID ownerId,
      String fileName,
      String contentType,
      long sizeBytes,
      String storageKey) {
    this.id = id;
    this.ownerType = ownerType;
    this.ownerId = ownerId;
    this.fileName = fileName;
    this.contentType = contentType;
    this.sizeBytes = sizeBytes;
    this.storageKey = storageKey;
  }

  public UUID getId() {
    return id;
  }

  public String getOwnerType() {
    return ownerType;
  }

  public UUID getOwnerId() {
    return ownerId;
  }

  public String getFileName() {
    return fileName;
  }

  public String getContentType() {
    return contentType;
  }

  public long getSizeBytes() {
    return sizeBytes;
  }

  public String getStorageKey() {
    return storageKey;
  }
}
