package org.ece.blackrose.crm.service;

import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.crm.domain.CrmTypes.TariffLineKind;
import org.ece.blackrose.crm.domain.Tariff;
import org.ece.blackrose.crm.domain.TariffLine;
import org.ece.blackrose.crm.domain.TaxRate;
import org.ece.blackrose.crm.repository.CrmRepositories.TariffLineRepository;
import org.ece.blackrose.crm.repository.CrmRepositories.TariffRepository;
import org.ece.blackrose.crm.repository.CrmRepositories.TaxRateRepository;
import org.ece.blackrose.crm.web.CrmDtos.SaveTariffLineRequest;
import org.ece.blackrose.crm.web.CrmDtos.SaveTariffRequest;
import org.ece.blackrose.crm.web.CrmDtos.SaveTaxRateRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class TariffService {

  private final TariffRepository tariffs;
  private final TariffLineRepository lines;
  private final TaxRateRepository taxRates;

  public TariffService(
      TariffRepository tariffs, TariffLineRepository lines, TaxRateRepository taxRates) {
    this.tariffs = tariffs;
    this.lines = lines;
    this.taxRates = taxRates;
  }

  @Transactional(readOnly = true)
  public List<Tariff> list() {
    return tariffs.findAll();
  }

  @Transactional
  public Tariff create(SaveTariffRequest request) {
    if (tariffs.findByCode(request.code()).isPresent()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "TARIFF_CODE_TAKEN", "Bu tarife kodu kullanımda.");
    }
    ensureDates(request);
    return tariffs.save(new Tariff(request));
  }

  @Transactional
  public Tariff update(UUID id, SaveTariffRequest request) {
    ensureDates(request);
    Tariff tariff = find(id);
    tariff.update(request);
    return tariff;
  }

  @Transactional(readOnly = true)
  public List<TariffLine> linesOf(UUID tariffId) {
    find(tariffId);
    return lines.findByTariffId(tariffId);
  }

  @Transactional
  public TariffLine addLine(UUID tariffId, SaveTariffLineRequest request) {
    find(tariffId);
    if (request.kind() == TariffLineKind.ROUTE
        && (!StringUtils.hasText(request.origin())
            || !StringUtils.hasText(request.destination()))) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "ROUTE_REQUIRED",
          "Güzergâh satırında çıkış ve varış zorunludur.");
    }
    return lines.save(
        new TariffLine(
            tariffId,
            request.kind(),
            blankToNull(request.origin()),
            blankToNull(request.destination()),
            blankToNull(request.vehicleType()),
            request.unit(),
            request.unitPrice(),
            request.minAmount()));
  }

  @Transactional
  public void deleteLine(UUID lineId) {
    lines.findById(lineId).ifPresent(TariffLine::markDeleted);
  }

  @Transactional(readOnly = true)
  public List<TaxRate> listTaxRates() {
    return taxRates.findAll();
  }

  @Transactional
  public TaxRate createTaxRate(SaveTaxRateRequest request) {
    if (taxRates.findByCode(request.code()).isPresent()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "TAX_RATE_CODE_TAKEN", "Bu vergi kodu kullanımda.");
    }
    if (request.withholdingNumerator() > request.withholdingDenominator()) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "WITHHOLDING_INVALID", "Tevkifat oranı 1'den büyük olamaz.");
    }
    return taxRates.save(
        new TaxRate(
            request.code(),
            request.name(),
            request.vatPercent(),
            request.withholdingNumerator(),
            request.withholdingDenominator()));
  }

  private Tariff find(UUID id) {
    return tariffs
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "TARIFF_NOT_FOUND", "Tarife bulunamadı."));
  }

  private static void ensureDates(SaveTariffRequest request) {
    if (request.validTo() != null && request.validTo().isBefore(request.validFrom())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "TARIFF_DATES_INVALID", "Bitiş tarihi başlangıçtan önce olamaz.");
    }
  }

  private static String blankToNull(String value) {
    return StringUtils.hasText(value) ? value.trim() : null;
  }
}
