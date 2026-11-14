package org.ece.blackrose.organization;

import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.DocumentSeriesDtos.DocumentSeriesResponse;
import org.ece.blackrose.organization.DocumentSeriesDtos.UpdateDocumentSeriesRequest;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Şirket belge serilerinin yönetimi. Seri satırı numara verirken olduğu gibi burada da {@code
 * SELECT … FOR UPDATE} ile okunur; geri alma denetimi kilitli (güncel) değerle yapılır, böylece
 * eşzamanlı kesilen fatura numarası yeniden üretilmez.
 */
@Service
public class DocumentSeriesService {

  private final DocumentSeriesRepository series;
  private final CompanyService companies;
  private final TenantClock clock;
  private final AuditService audit;

  public DocumentSeriesService(
      DocumentSeriesRepository series,
      CompanyService companies,
      TenantClock clock,
      AuditService audit) {
    this.series = series;
    this.companies = companies;
    this.clock = clock;
    this.audit = audit;
  }

  @Transactional(readOnly = true)
  public List<DocumentSeriesResponse> list(UUID companyId) {
    companies.findVisible(companyId);
    int year = clock.today().getYear();
    return series.findByCompanyIdOrderByDocTypeAscYearAsc(companyId).stream()
        .map(row -> toResponse(row, year))
        .toList();
  }

  @Transactional
  public DocumentSeriesResponse update(
      UUID companyId, UUID seriesId, UpdateDocumentSeriesRequest request) {
    Company company = companies.findVisible(companyId);
    DocumentSeries row =
        series
            .findForUpdate(seriesId)
            .filter(found -> found.getCompanyId().equals(companyId))
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND,
                        "DOCUMENT_SERIES_NOT_FOUND",
                        "Belge serisi bulunamadı."));
    row.update(request.prefix(), request.nextValue());
    audit.record(
        AuditEvent.DOCUMENT_SERIES_UPDATED,
        company.getCode(),
        "%s %s:%d".formatted(row.getDocType(), row.getPrefix(), row.getNextValue()));
    return toResponse(row, clock.today().getYear());
  }

  private static DocumentSeriesResponse toResponse(DocumentSeries row, int year) {
    return new DocumentSeriesResponse(
        row.getId(),
        row.getCompanyId(),
        row.getDocType(),
        row.getYear(),
        row.getPrefix(),
        row.getNextValue(),
        row.getPadding(),
        DocumentSeries.format(
            row.getPrefix(),
            row.getYear() == null ? year : row.getYear(),
            row.getNextValue(),
            row.getPadding()));
  }
}
