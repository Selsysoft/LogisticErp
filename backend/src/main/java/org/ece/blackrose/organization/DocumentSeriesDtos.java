package org.ece.blackrose.organization;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.util.UUID;

/** Şirket belge serileri (12.1a §5.1). */
public final class DocumentSeriesDtos {

  private DocumentSeriesDtos() {}

  /** {@code sample}: bugünün yılıyla sıradaki numara (ör. {@code NF-2026-000123}). */
  public record DocumentSeriesResponse(
      UUID id,
      UUID companyId,
      DocumentType docType,
      Integer year,
      String prefix,
      long nextValue,
      int padding,
      String sample) {}

  /** Sıradaki numara geri alınamaz (422 {@code DOCUMENT_SERIES_BACKWARDS}). */
  public record UpdateDocumentSeriesRequest(
      @NotBlank @Pattern(regexp = "^[A-Z0-9-]{1,10}$") String prefix,
      @NotNull @Min(1) Long nextValue) {}
}
