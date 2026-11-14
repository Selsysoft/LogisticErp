package org.ece.blackrose.finance.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinIncomeExpense;
import org.ece.blackrose.finance.domain.FinanceTypes.IncomeExpenseCategory;
import org.ece.blackrose.finance.domain.FinanceTypes.IncomeExpenseDirection;
import org.ece.blackrose.finance.repository.FundRepositories.FinIncomeExpenseRepository;
import org.ece.blackrose.finance.service.ExchangeRateService.Conversion;
import org.ece.blackrose.organization.CompanyResolver;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Bilgi amaçlı gelir/gider defterinin ({@code fin_income_expense}) tek yazıcısı (12.2_TASARIM
 * §3.5). Nakit değildir; nakit {@link FundLedgerService}'tedir. 12.2'de döviz bozumu kur farkı
 * ({@code FX_DIFF}) ve transfer masrafı ({@code BANK_CHARGE}) yazılır. Kayıt değişmez; geri alma
 * ters kayıttır ({@code source_type = 'REVERSAL'}).
 */
@Service
public class IncomeExpenseService {

  private final FinIncomeExpenseRepository rows;
  private final ExchangeRateService rates;
  private final CompanyResolver companies;

  public IncomeExpenseService(
      FinIncomeExpenseRepository rows, ExchangeRateService rates, CompanyResolver companies) {
    this.rows = rows;
    this.rates = rates;
    this.companies = companies;
  }

  /**
   * Aynı {@code (sourceType, sourceId, category)} varsa mevcut kayıt döner (idempotent). Kur {@link
   * ExchangeRateService#convert} ile dondurulur; {@code manualRate} yalnız kur tablosunda kur
   * yokken (döviz bozumunda kullanıcının işlem kuru) doludur. Şirket iş yerinden gelir.
   */
  @SuppressWarnings("java:S107")
  @Transactional
  public FinIncomeExpense record(
      IncomeExpenseDirection direction,
      IncomeExpenseCategory category,
      String sourceType,
      UUID sourceId,
      LocalDate date,
      Money money,
      UUID branchId,
      UUID fundAccountId,
      String description,
      BigDecimal manualRate) {
    return rows.findFirstBySourceTypeAndSourceIdAndCategory(sourceType, sourceId, category)
        .orElseGet(
            () -> {
              Conversion conversion = rates.convert(money, date, manualRate);
              return rows.save(
                  new FinIncomeExpense(
                      companies.companyOf(branchId),
                      branchId,
                      direction,
                      category,
                      sourceType,
                      sourceId,
                      date,
                      money,
                      conversion.rate(),
                      conversion.rateDate(),
                      conversion.tlAmount(),
                      fundAccountId,
                      LedgerDescriptions.fit(description)));
            });
  }

  /**
   * Kaynağın her kaydını aynı tutar/kur/kategoriyle ters yönde yazar ({@code source_id} = asıl
   * kayıt); ikinci çağrı yeni kayıt üretmez.
   */
  @Transactional
  public void reverseSource(String sourceType, UUID sourceId, LocalDate date, String description) {
    for (FinIncomeExpense row : rows.findBySourceTypeAndSourceId(sourceType, sourceId)) {
      if (rows.findFirstBySourceTypeAndSourceIdAndCategory(
              FinIncomeExpense.SOURCE_REVERSAL, row.getId(), row.getCategory())
          .isEmpty()) {
        rows.save(FinIncomeExpense.reversalOf(row, date, LedgerDescriptions.fit(description)));
      }
    }
  }
}
