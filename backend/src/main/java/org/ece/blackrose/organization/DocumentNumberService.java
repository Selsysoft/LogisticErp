package org.ece.blackrose.organization;

import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Şirket serisinden belge numarası. Seri satırı {@code SELECT … FOR UPDATE} ile kilitlenir; numara
 * çağıranın işlemi bitene kadar başkasına verilmez (boşluksuz, çiftsiz). Kilit sırası sabittir:
 * önce belge (sefer/depo), sonra seri.
 */
@Service
public class DocumentNumberService {

  private final DocumentSeriesRepository series;

  public DocumentNumberService(DocumentSeriesRepository series) {
    this.series = series;
  }

  @Transactional(propagation = Propagation.MANDATORY)
  public String next(UUID companyId, DocumentType type, LocalDate date) {
    DocumentSeries row =
        series.lockFor(companyId, type, date.getYear()).stream()
            .findFirst()
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.CONFLICT,
                        "DOCUMENT_SERIES_MISSING",
                        "Şirketin belge serisi tanımlı değil."));
    long value = row.take();
    return DocumentSeries.format(row.getPrefix(), date.getYear(), value, row.getPadding());
  }
}
