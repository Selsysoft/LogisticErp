package org.ece.blackrose.common.audit;

import jakarta.persistence.Column;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.MappedSuperclass;
import java.time.Instant;
import org.springframework.data.annotation.CreatedBy;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedBy;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/**
 * Yalnız denetim kolonları ({@code deleted} yok). Silinmeyen ayar/sayaç tabloları içindir; silinen
 * kayıtlar {@link AuditableEntity} kullanır.
 */
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class AuditColumns {

  @CreatedBy
  @Column(nullable = false, updatable = false)
  private String createdBy;

  @CreatedDate
  @Column(nullable = false, updatable = false)
  private Instant createdAt;

  @LastModifiedBy
  @Column(nullable = false)
  private String updatedBy;

  @LastModifiedDate
  @Column(nullable = false)
  private Instant updatedAt;

  public String getCreatedBy() {
    return createdBy;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public String getUpdatedBy() {
    return updatedBy;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }
}
