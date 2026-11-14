package org.ece.blackrose.crm.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.crm.domain.Contract;
import org.ece.blackrose.crm.domain.CrmTypes.ContractStatus;
import org.ece.blackrose.crm.repository.CrmRepositories.ContractRepository;
import org.ece.blackrose.crm.repository.CrmRepositories.TariffRepository;
import org.ece.blackrose.crm.web.CrmDtos.SaveContractRequest;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.organization.CompanyResolver;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Bir müşterinin aynı şirkette aynı dönemde tek aktif sözleşmesi olur; fiyat buradan belirlenir.
 */
@Service
public class ContractService {

  private final ContractRepository contracts;
  private final TariffRepository tariffs;
  private final CustomerService customers;
  private final CompanyResolver companies;
  private final BranchScopeService scope;

  public ContractService(
      ContractRepository contracts,
      TariffRepository tariffs,
      CustomerService customers,
      CompanyResolver companies,
      BranchScopeService scope) {
    this.scope = scope;
    this.companies = companies;
    this.contracts = contracts;
    this.tariffs = tariffs;
    this.customers = customers;
  }

  @Transactional(readOnly = true)
  public Page<Contract> list(UUID accountId, Pageable pageable) {
    List<UUID> visible = scope.limited() ? scope.visibleCompanyIds() : null;
    return contracts.search(
        accountId,
        visible == null,
        visible == null || visible.isEmpty() ? List.of(BranchFilter.NONE) : visible,
        pageable);
  }

  @Transactional
  public Contract create(SaveContractRequest request) {
    UUID companyId =
        companies.forNewDocument(
            request.companyId() != null
                ? request.companyId()
                : scope.defaultCompanyForNew(companies.defaultCompanyId()));
    scope.requireCompanyVisible(companyId);
    return create(
        request.accountId(),
        companyId,
        null,
        request.tariffId(),
        request.startDate(),
        request.endDate(),
        request.paymentTermDays(),
        request.fuelSurchargePercent(),
        request.waitingHourlyFee(),
        request.specialTerms());
  }

  @Transactional
  public Contract create(
      UUID accountId,
      UUID companyId,
      UUID quoteId,
      UUID tariffId,
      LocalDate start,
      LocalDate end,
      Integer paymentTermDays,
      BigDecimal fuelSurchargePercent,
      BigDecimal waitingHourlyFee,
      String specialTerms) {
    customers.find(accountId);
    if (end.isBefore(start)) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "CONTRACT_DATES_INVALID",
          "Bitiş tarihi başlangıçtan önce olamaz.");
    }
    if (tariffId != null && !tariffs.existsById(tariffId)) {
      throw new BusinessException(HttpStatus.BAD_REQUEST, "TARIFF_NOT_FOUND", "Tarife bulunamadı.");
    }
    if (!contracts.overlapping(accountId, companyId, ContractStatus.ACTIVE, start, end).isEmpty()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "CONTRACT_OVERLAP", "Bu dönemde müşterinin aktif sözleşmesi var.");
    }
    String number = "S-%06d".formatted(contracts.nextNumber());
    return contracts.save(
        new Contract(
            number,
            accountId,
            companyId,
            quoteId,
            tariffId,
            start,
            end,
            paymentTermDays,
            fuelSurchargePercent,
            waitingHourlyFee,
            specialTerms));
  }

  @Transactional
  public Contract changeStatus(UUID id, ContractStatus status) {
    Contract contract =
        contracts
            .findById(id)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "CONTRACT_NOT_FOUND", "Sözleşme bulunamadı."));
    scope.requireCompanyVisible(contract.getCompanyId());
    if (contract.getStatus() != ContractStatus.ACTIVE || status == ContractStatus.ACTIVE) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "CONTRACT_INVALID_STATE", "Yalnız aktif sözleşme kapatılabilir.");
    }
    contract.moveTo(status);
    return contract;
  }
}
