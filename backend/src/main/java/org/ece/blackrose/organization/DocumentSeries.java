package org.ece.blackrose.organization;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditColumns;
import org.ece.blackrose.common.error.BusinessException;
import org.springframework.http.HttpStatus;

/**
 * Şirket başına belge numarası sayacı. {@code year} NULL ise sayaç yıllara bölünmez. Satır yalnız
 * {@code SELECT … FOR UPDATE} altında değiştirilir (sürüm kolonu yok).
 */
@Entity
@Table(name = "document_series")
public class DocumentSeries extends AuditColumns {

  @Id private UUID id;
  private UUID companyId;

  @Enumerated(EnumType.STRING)
  private DocumentType docType;

  private Integer year;
  private String prefix;
  private long nextValue;
  private int padding;

  protected DocumentSeries() {}

  public DocumentSeries(
      UUID companyId, DocumentType docType, Integer year, String prefix, int padding) {
    this.id = UUID.randomUUID();
    this.companyId = companyId;
    this.docType = docType;
    this.year = year;
    this.prefix = prefix;
    this.nextValue = 1;
    this.padding = padding;
  }

  /** Sıradaki değeri döndürür ve sayacı ilerletir. */
  public long take() {
    return nextValue++;
  }

  /** Önek ve sıradaki numara; sayaç geri alınamaz. */
  public void update(String prefix, long nextValue) {
    if (nextValue < this.nextValue) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "DOCUMENT_SERIES_BACKWARDS",
          "Sıradaki numara geri alınamaz.");
    }
    this.prefix = prefix;
    this.nextValue = nextValue;
  }

  /** {@code {prefix}-{yıl}-{sıra}} biçiminde numara. */
  public static String format(String prefix, int year, long value, int padding) {
    return String.format("%s-%d-%0" + padding + "d", prefix, year, value);
  }

  public UUID getId() {
    return id;
  }

  public UUID getCompanyId() {
    return companyId;
  }

  public DocumentType getDocType() {
    return docType;
  }

  public Integer getYear() {
    return year;
  }

  public String getPrefix() {
    return prefix;
  }

  public long getNextValue() {
    return nextValue;
  }

  public int getPadding() {
    return padding;
  }
}
