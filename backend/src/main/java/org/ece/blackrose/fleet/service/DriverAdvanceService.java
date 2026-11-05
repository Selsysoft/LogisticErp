package org.ece.blackrose.fleet.service;

import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.domain.FundAccount;
import org.ece.blackrose.finance.domain.Settlement;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundAccountRepository;
import org.ece.blackrose.finance.service.SettlementService;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementRequest;
import org.ece.blackrose.fleet.domain.Driver;
import org.ece.blackrose.fleet.repository.FleetRepositories.DriverRepository;
import org.ece.blackrose.fleet.web.FleetDtos.DriverAdvanceRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Sürücüye verilen avans: para hesaptan çıkar, sürücü carisine BORÇ yazılır. */
@Service
public class DriverAdvanceService {

  private final DriverRepository drivers;
  private final FundAccountRepository funds;
  private final SettlementService settlements;

  public DriverAdvanceService(
      DriverRepository drivers, FundAccountRepository funds, SettlementService settlements) {
    this.drivers = drivers;
    this.funds = funds;
    this.settlements = settlements;
  }

  @Transactional
  public Settlement giveAdvance(
      UUID driverId, DriverAdvanceRequest request, String idempotencyKey) {
    Driver driver =
        drivers
            .findById(driverId)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "DRIVER_NOT_FOUND", "Sürücü bulunamadı."));
    FundAccount fund =
        funds
            .findById(request.fundAccountId())
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "FUND_NOT_FOUND", "Banka/kasa hesabı bulunamadı."));
    return settlements.create(
        SettlementType.PAYMENT,
        new SettlementRequest(
            SettlementMethod.valueOf(fund.getKind().name()),
            driver.getAccountId(),
            request.branchId(),
            fund.getId(),
            null,
            null,
            null,
            request.money(),
            request.date(),
            request.description() == null ? "Sürücü avansı" : request.description(),
            request.exchangeRate()),
        idempotencyKey,
        null);
  }
}
