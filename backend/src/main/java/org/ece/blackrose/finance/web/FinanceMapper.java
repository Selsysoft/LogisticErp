package org.ece.blackrose.finance.web;

import org.ece.blackrose.finance.domain.AccountTransaction;
import org.ece.blackrose.finance.domain.DensityThreshold;
import org.ece.blackrose.finance.domain.ExchangeRate;
import org.ece.blackrose.finance.domain.ExpenseItem;
import org.ece.blackrose.finance.domain.ExpenseType;
import org.ece.blackrose.finance.domain.FinanceCurrency;
import org.ece.blackrose.finance.domain.FundTransaction;
import org.ece.blackrose.finance.domain.Instrument;
import org.ece.blackrose.finance.domain.InstrumentMovement;
import org.ece.blackrose.finance.domain.PaymentPlan;
import org.ece.blackrose.finance.domain.PaymentPlanEvent;
import org.ece.blackrose.finance.domain.PurchaseInvoice;
import org.ece.blackrose.finance.domain.Settlement;
import org.ece.blackrose.finance.web.FinanceDtos.AccountTransactionResponse;
import org.ece.blackrose.finance.web.FinanceDtos.CurrencyResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExchangeRateResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseItemResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ExpenseTypeResponse;
import org.ece.blackrose.finance.web.FinanceDtos.FundTransactionResponse;
import org.ece.blackrose.finance.web.FinanceDtos.InstrumentMovementResponse;
import org.ece.blackrose.finance.web.FinanceDtos.InstrumentResponse;
import org.ece.blackrose.finance.web.FinanceDtos.PlanEventResponse;
import org.ece.blackrose.finance.web.FinanceDtos.PlanResponse;
import org.ece.blackrose.finance.web.FinanceDtos.PurchaseInvoiceResponse;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ThresholdResponse;
import org.mapstruct.Mapper;

@Mapper
public interface FinanceMapper {

  AccountTransactionResponse toResponse(AccountTransaction transaction);

  FundTransactionResponse toResponse(FundTransaction transaction);

  InstrumentResponse toResponse(Instrument instrument);

  InstrumentMovementResponse toResponse(InstrumentMovement movement);

  SettlementResponse toResponse(Settlement settlement);

  PurchaseInvoiceResponse toResponse(PurchaseInvoice invoice);

  PlanResponse toResponse(PaymentPlan plan);

  PlanEventResponse toResponse(PaymentPlanEvent event);

  ThresholdResponse toResponse(DensityThreshold threshold);

  ExpenseTypeResponse toResponse(ExpenseType type);

  ExpenseItemResponse toResponse(ExpenseItem item);

  CurrencyResponse toResponse(FinanceCurrency currency);

  ExchangeRateResponse toResponse(ExchangeRate rate);
}
