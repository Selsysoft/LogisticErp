package org.ece.blackrose.crm.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.MoneyRounding;
import org.ece.blackrose.crm.domain.Contract;
import org.ece.blackrose.crm.domain.CrmTypes.ContractStatus;
import org.ece.blackrose.crm.domain.CrmTypes.PriceUnit;
import org.ece.blackrose.crm.domain.CrmTypes.TariffLineKind;
import org.ece.blackrose.crm.domain.CrmTypes.TariffSource;
import org.ece.blackrose.crm.domain.Tariff;
import org.ece.blackrose.crm.domain.TariffLine;
import org.ece.blackrose.crm.domain.TaxRate;
import org.ece.blackrose.crm.repository.CrmRepositories.ContractRepository;
import org.ece.blackrose.crm.repository.CrmRepositories.TariffLineRepository;
import org.ece.blackrose.crm.repository.CrmRepositories.TariffRepository;
import org.ece.blackrose.crm.repository.CrmRepositories.TaxRateRepository;
import org.ece.blackrose.crm.web.CrmDtos.PriceBreakdown;
import org.ece.blackrose.crm.web.CrmDtos.PriceComponent;
import org.ece.blackrose.crm.web.CrmDtos.PriceRequest;
import org.ece.blackrose.tenant.TenantContext;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Deterministik fiyat motoru. Tarife önceliği: açık seçim, aktif sözleşme, müşteriye özel, genel.
 * Satır önceliği: güzergâh, sonra mesafe; araç tipi tutan satır genel satırdan önce gelir.
 */
@Service
public class PricingService {

  private static final BigDecimal HUNDRED = new BigDecimal("100");
  private static final Locale TURKISH = Locale.forLanguageTag("tr");

  private record Resolved(Tariff tariff, TariffSource source, Contract contract) {}

  private final TariffRepository tariffs;
  private final TariffLineRepository lines;
  private final TaxRateRepository taxRates;
  private final ContractRepository contracts;
  private final TenantRepository tenants;

  public PricingService(
      TariffRepository tariffs,
      TariffLineRepository lines,
      TaxRateRepository taxRates,
      ContractRepository contracts,
      TenantRepository tenants) {
    this.tariffs = tariffs;
    this.lines = lines;
    this.taxRates = taxRates;
    this.contracts = contracts;
    this.tenants = tenants;
  }

  @Transactional(readOnly = true)
  public PriceBreakdown price(PriceRequest request) {
    MoneyRounding rounding = rounding();
    Resolved resolved = resolveTariff(request);
    Tariff tariff = resolved.tariff();
    TariffLine line = selectLine(tariff, request);
    Contract contract = resolved.contract();

    List<PriceComponent> components = new ArrayList<>();
    BigDecimal base = rounding.apply(baseAmount(line, request));
    String basis = line.getUnit() + " x " + line.getUnitPrice();
    if (line.getMinAmount() != null && base.compareTo(line.getMinAmount()) < 0) {
      base = rounding.apply(line.getMinAmount());
      basis = "MIN " + line.getMinAmount();
    }
    components.add(new PriceComponent("BASE_" + line.getKind(), basis, base));

    BigDecimal fuelPercent =
        contract != null && contract.getFuelSurchargePercent() != null
            ? contract.getFuelSurchargePercent()
            : tariff.getFuelSurchargePercent();
    addPercent(components, "FUEL_SURCHARGE", base, fuelPercent, rounding);

    BigDecimal waitingFee =
        contract != null && contract.getWaitingHourlyFee() != null
            ? contract.getWaitingHourlyFee()
            : tariff.getWaitingHourlyFee();
    addQuantity(components, "WAITING", request.waitingHours(), waitingFee, rounding);
    addQuantity(
        components,
        "EXTRA_STOP",
        request.extraStops() == null ? null : BigDecimal.valueOf(request.extraStops()),
        tariff.getExtraStopFee(),
        rounding);
    if (request.adr()) {
      addPercent(components, "ADR", base, tariff.getAdrPercent(), rounding);
    }
    addPercent(components, "INSURANCE", base, tariff.getInsurancePercent(), rounding);
    if (request.tollAmount() != null && request.tollAmount().signum() > 0) {
      components.add(
          new PriceComponent("TOLL", "PASS_THROUGH", rounding.apply(request.tollAmount())));
    }

    BigDecimal net =
        components.stream().map(PriceComponent::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
    UUID taxRateId = request.taxRateId() != null ? request.taxRateId() : tariff.getTaxRateId();
    return withTax(
        resolved.source(),
        tariff.getId(),
        tariff.getCode(),
        contract == null ? null : contract.getId(),
        line.getId(),
        tariff.getCurrency(),
        components,
        net,
        taxRateId,
        rounding);
  }

  /** Tarife dışı, elle verilmiş net tutara yalnız vergi hesabı uygular. */
  @Transactional(readOnly = true)
  public PriceBreakdown manual(BigDecimal manualNet, String currency, UUID taxRateId) {
    MoneyRounding rounding = rounding();
    BigDecimal net = rounding.apply(manualNet);
    return withTax(
        TariffSource.MANUAL,
        null,
        null,
        null,
        null,
        currency,
        List.of(new PriceComponent("MANUAL", "MANUAL", net)),
        net,
        taxRateId,
        rounding);
  }

  private PriceBreakdown withTax(
      TariffSource source,
      UUID tariffId,
      String tariffCode,
      UUID contractId,
      UUID lineId,
      String currency,
      List<PriceComponent> components,
      BigDecimal net,
      UUID taxRateId,
      MoneyRounding rounding) {
    BigDecimal vatPercent = BigDecimal.ZERO;
    BigDecimal vat = BigDecimal.ZERO;
    BigDecimal withholding = BigDecimal.ZERO;
    if (taxRateId != null) {
      TaxRate rate =
          taxRates
              .findById(taxRateId)
              .orElseThrow(
                  () ->
                      new BusinessException(
                          HttpStatus.BAD_REQUEST, "TAX_RATE_NOT_FOUND", "Vergi oranı bulunamadı."));
      vatPercent = rate.getVatPercent();
      vat = rounding.apply(net.multiply(vatPercent).divide(HUNDRED, 10, RoundingMode.HALF_UP));
      withholding =
          rounding.apply(
              vat.multiply(BigDecimal.valueOf(rate.getWithholdingNumerator()))
                  .divide(
                      BigDecimal.valueOf(rate.getWithholdingDenominator()),
                      10,
                      RoundingMode.HALF_UP));
    }
    return new PriceBreakdown(
        source,
        tariffId,
        tariffCode,
        contractId,
        lineId,
        currency,
        List.copyOf(components),
        net,
        vatPercent,
        vat,
        withholding,
        net.add(vat).subtract(withholding));
  }

  private Resolved resolveTariff(PriceRequest request) {
    LocalDate date = request.date();
    if (request.tariffId() != null) {
      Tariff tariff =
          tariffs
              .findById(request.tariffId())
              .filter(candidate -> candidate.isValidOn(date))
              .orElseThrow(PricingService::noTariff);
      return new Resolved(tariff, TariffSource.EXPLICIT, activeContract(request).orElse(null));
    }
    Optional<Contract> contract = activeContract(request);
    if (contract.isPresent() && contract.get().getTariffId() != null) {
      Tariff tariff =
          tariffs
              .findById(contract.get().getTariffId())
              .filter(candidate -> candidate.isValidOn(date))
              .orElseThrow(PricingService::noTariff);
      return new Resolved(tariff, TariffSource.CONTRACT, contract.get());
    }
    if (request.accountId() != null) {
      List<Tariff> own = tariffs.validForAccount(request.accountId(), date);
      if (!own.isEmpty()) {
        return new Resolved(own.get(0), TariffSource.CUSTOMER, contract.orElse(null));
      }
    }
    List<Tariff> general = tariffs.validGeneral(date);
    if (general.isEmpty()) {
      throw noTariff();
    }
    return new Resolved(general.get(0), TariffSource.GENERAL, contract.orElse(null));
  }

  private Optional<Contract> activeContract(PriceRequest request) {
    if (request.accountId() == null) {
      return Optional.empty();
    }
    return contracts
        .overlapping(request.accountId(), ContractStatus.ACTIVE, request.date(), request.date())
        .stream()
        .findFirst();
  }

  private TariffLine selectLine(Tariff tariff, PriceRequest request) {
    List<TariffLine> all = lines.findByTariffId(tariff.getId());
    String origin = normalize(request.origin());
    String destination = normalize(request.destination());
    String vehicle = request.vehicleType() == null ? null : normalize(request.vehicleType());
    Comparator<TariffLine> order =
        Comparator.comparing((TariffLine line) -> line.getVehicleType() == null)
            .thenComparing(line -> line.getId().toString());

    Optional<TariffLine> route =
        all.stream()
            .filter(line -> line.getKind() == TariffLineKind.ROUTE)
            .filter(line -> origin.equals(normalize(line.getOrigin())))
            .filter(line -> destination.equals(normalize(line.getDestination())))
            .filter(line -> vehicleMatches(line, vehicle))
            .min(order);
    if (route.isPresent()) {
      return route.get();
    }
    return all.stream()
        .filter(line -> line.getKind() == TariffLineKind.DISTANCE)
        .filter(line -> vehicleMatches(line, vehicle))
        .min(order)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "NO_TARIFF_LINE",
                    "Bu güzergâh ve araç için tarife satırı bulunamadı."));
  }

  private static boolean vehicleMatches(TariffLine line, String vehicle) {
    return line.getVehicleType() == null
        || (vehicle != null && vehicle.equals(normalize(line.getVehicleType())));
  }

  private static BigDecimal baseAmount(TariffLine line, PriceRequest request) {
    PriceUnit unit = line.getUnit();
    BigDecimal quantity =
        switch (unit) {
          case TRIP -> BigDecimal.ONE;
          case TON -> request.weightTon();
          case PALLET -> request.pallets() == null ? null : BigDecimal.valueOf(request.pallets());
          case KM -> request.distanceKm();
        };
    if (quantity == null) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "PRICE_INPUT_MISSING",
          "Fiyat hesabı için " + unit + " miktarı girilmelidir.");
    }
    return quantity.multiply(line.getUnitPrice());
  }

  private static void addPercent(
      List<PriceComponent> components,
      String code,
      BigDecimal base,
      BigDecimal percent,
      MoneyRounding rounding) {
    if (percent != null && percent.signum() > 0) {
      BigDecimal amount =
          rounding.apply(base.multiply(percent).divide(HUNDRED, 10, RoundingMode.HALF_UP));
      components.add(
          new PriceComponent(code, "%" + percent.stripTrailingZeros().toPlainString(), amount));
    }
  }

  private static void addQuantity(
      List<PriceComponent> components,
      String code,
      BigDecimal quantity,
      BigDecimal fee,
      MoneyRounding rounding) {
    if (quantity != null && quantity.signum() > 0 && fee != null) {
      components.add(
          new PriceComponent(code, quantity + " x " + fee, rounding.apply(quantity.multiply(fee))));
    }
  }

  private static String normalize(String value) {
    return value == null ? "" : value.trim().toUpperCase(TURKISH);
  }

  private MoneyRounding rounding() {
    return tenants
        .findByCode(TenantContext.currentCode().orElseThrow())
        .orElseThrow()
        .moneyRounding();
  }

  private static BusinessException noTariff() {
    return new BusinessException(
        HttpStatus.UNPROCESSABLE_ENTITY, "NO_TARIFF", "Geçerli tarife bulunamadı.");
  }
}
