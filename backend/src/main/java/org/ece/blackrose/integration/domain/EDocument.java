package org.ece.blackrose.integration.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.integration.domain.IntegrationTypes.EDocumentKind;
import org.ece.blackrose.integration.domain.IntegrationTypes.EDocumentSource;
import org.ece.blackrose.integration.domain.IntegrationTypes.EDocumentStatus;

/** Entegratöre gönderilen belge. UBL içeriği gönderildiği haliyle saklanır. */
@Entity
@Table(name = "edocument")
public class EDocument extends AuditableEntity {

  @Id private UUID id;

  @Enumerated(EnumType.STRING)
  private EDocumentKind kind;

  @Enumerated(EnumType.STRING)
  private EDocumentSource sourceType;

  private UUID sourceId;
  private String sourceNo;
  private UUID ettn;
  private String provider;
  private String providerRef;

  @Enumerated(EnumType.STRING)
  private EDocumentStatus status;

  private String message;
  private String ubl;

  protected EDocument() {}

  public EDocument(
      EDocumentKind kind,
      EDocumentSource sourceType,
      UUID sourceId,
      String sourceNo,
      UUID ettn,
      String provider,
      String ubl) {
    this.id = UUID.randomUUID();
    this.kind = kind;
    this.sourceType = sourceType;
    this.sourceId = sourceId;
    this.sourceNo = sourceNo;
    this.ettn = ettn;
    this.provider = provider;
    this.ubl = ubl;
    this.status = EDocumentStatus.SENT;
  }

  public void update(EDocumentStatus status, String providerRef, String message) {
    this.status = status;
    if (providerRef != null) {
      this.providerRef = providerRef;
    }
    this.message = message;
  }

  public UUID getId() {
    return id;
  }

  public EDocumentKind getKind() {
    return kind;
  }

  public EDocumentSource getSourceType() {
    return sourceType;
  }

  public UUID getSourceId() {
    return sourceId;
  }

  public String getSourceNo() {
    return sourceNo;
  }

  public UUID getEttn() {
    return ettn;
  }

  public String getProvider() {
    return provider;
  }

  public String getProviderRef() {
    return providerRef;
  }

  public EDocumentStatus getStatus() {
    return status;
  }

  public String getMessage() {
    return message;
  }

  public String getUbl() {
    return ubl;
  }
}
