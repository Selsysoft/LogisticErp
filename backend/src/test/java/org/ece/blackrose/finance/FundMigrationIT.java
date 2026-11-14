package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import javax.sql.DataSource;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.AccountDocumentType;
import org.ece.blackrose.finance.domain.FinIncomeExpense;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentSide;
import org.ece.blackrose.finance.domain.FinanceTypes.FundAccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.FundCategory;
import org.ece.blackrose.finance.domain.FinanceTypes.FundDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.domain.FinanceTypes.FundOpeningStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.FundTransferType;
import org.ece.blackrose.finance.domain.FinanceTypes.FxCalcMode;
import org.ece.blackrose.finance.domain.FinanceTypes.IncomeExpenseCategory;
import org.ece.blackrose.finance.domain.FinanceTypes.IncomeExpenseDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.IntercompanyReason;
import org.ece.blackrose.finance.domain.FinanceTypes.RateOperation;
import org.ece.blackrose.finance.domain.FinanceTypes.TransferCostKind;
import org.ece.blackrose.finance.domain.FinanceTypes.TransferSourceKind;
import org.ece.blackrose.finance.domain.FinanceTypes.TransferStatus;
import org.ece.blackrose.finance.domain.FundAccount;
import org.ece.blackrose.finance.domain.FundOpening;
import org.ece.blackrose.finance.domain.FundTransaction;
import org.ece.blackrose.finance.domain.FundTransfer;
import org.ece.blackrose.finance.domain.FundTransfer.FxTerms;
import org.ece.blackrose.finance.domain.FundTransferCost;
import org.ece.blackrose.finance.domain.FundTransferSource;
import org.ece.blackrose.finance.domain.IntercompanyTransfer;
import org.ece.blackrose.finance.domain.IntercompanyTransfer.Side;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountDocumentTypeRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundAccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.SettlementRepository;
import org.ece.blackrose.finance.repository.FundRepositories.FinIncomeExpenseRepository;
import org.ece.blackrose.finance.repository.FundRepositories.FundOpeningRepository;
import org.ece.blackrose.finance.repository.FundRepositories.FundTransferCostRepository;
import org.ece.blackrose.finance.repository.FundRepositories.FundTransferRepository;
import org.ece.blackrose.finance.repository.FundRepositories.FundTransferSourceRepository;
import org.ece.blackrose.finance.repository.FundRepositories.IntercompanyTransferRepository;
import org.ece.blackrose.finance.service.FundLedgerService;
import org.ece.blackrose.finance.service.FundLedgerService.FundPosting;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.tenant.TenantContext;
import org.ece.blackrose.tenant.service.TenantMigrator;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Faz 12.2 göçü (tenant V31–V34) boş ve iki şirketli dolu şemada hatasız çalışır, fon bakiyelerini
 * değiştirmez, şirket başına transfer serilerini tohumlar; kısıtlar veritabanında korur; yeni
 * entity ve repository eşlemeleri şemayla uyumludur (docs/zto-finans/uygulama/12.2_TASARIM.md §1,
 * §2, §6.1).
 */
class FundMigrationIT extends AccountTestSupport {

  private static final LocalDate DATE = LocalDate.of(2026, 1, 15);
  private static final OffsetDateTime TIME =
      OffsetDateTime.of(2026, 1, 15, 9, 0, 0, 0, ZoneOffset.UTC);

  private static final String BALANCES =
      "select fund_account_id, sum(case when direction = 'IN' then amount else -amount end) as b"
          + " from %s.fund_transaction where deleted = false group by fund_account_id"
          + " order by fund_account_id";

  private static final String LEDGER_ROWS =
      "select id, fund_account_id, company_id, direction, amount, currency, exchange_rate,"
          + " tl_amount, transaction_date, description, source_type, source_id, deleted"
          + " from %s.fund_transaction order by id";

  @Autowired DataSource dataSource;
  @Autowired TenantMigrator migrator;
  @Autowired PlatformTransactionManager transactionManager;

  @Autowired FundAccountRepository funds;
  @Autowired SettlementRepository settlements;
  @Autowired AccountDocumentTypeRepository documentTypes;
  @Autowired FundOpeningRepository openings;
  @Autowired FundTransferRepository transfers;
  @Autowired FundTransferCostRepository costs;
  @Autowired FundTransferSourceRepository sources;
  @Autowired IntercompanyTransferRepository intercompany;
  @Autowired FinIncomeExpenseRepository incomeExpenses;
  @Autowired FundLedgerService fundLedger;

  // G-1
  @Test
  void bosKiracidaGocGecerVeVarsayilanSirketSerileriTohumlanir() {
    String s = schemaAtV30();
    migrator.migrate(s);

    assertThat(
            jdbc.queryForList(
                q(
                    s,
                    "select version from %s.flyway_schema_history where success"
                        + " order by installed_rank"),
                String.class))
        .contains("31", "32", "33", "34");
    assertThat(seriesPrefixes(s, defaultCompany(s)))
        .containsExactlyInAnyOrderEntriesOf(
            Map.of("FUND_TRANSFER", "VRM", "INTERCOMPANY_TRANSFER", "SVR"));
    assertInvoiceFlags(s);
    for (String table :
        List.of(
            "fund_account",
            "fund_opening",
            "fund_transfer",
            "fund_transfer_cost",
            "fund_transfer_source",
            "intercompany_transfer",
            "fin_income_expense")) {
      assertThat(count(s, table)).as(table).isZero();
    }
    // İkinci çalıştırma bir şey yapmaz.
    assertThat(flyway(s, null).migrate().migrationsExecuted).isZero();
    flyway(s, null).validate();
  }

  // G-2
  @Test
  void ikiSirketliDoluKiracidaBakiyelerDegismezVeSirketOnekleriTohumlanir() {
    String s = schemaAtV30();
    Fixture f = fixture(s);
    List<Map<String, Object>> balancesBefore = jdbc.queryForList(q(s, BALANCES));
    List<Map<String, Object>> rowsBefore = jdbc.queryForList(q(s, LEDGER_ROWS));

    migrator.migrate(s);

    // §1.5-1: mevcut hesaplar vadesiz ve aktif; yeni alanlar boş.
    assertThat(count(s, "fund_account")).isEqualTo(4);
    assertThat(count(s, "fund_account where account_type <> 'DEMAND' or not active")).isZero();
    assertThat(
            count(
                s,
                "fund_account where update_count <> 0 or account_no_enc is not null"
                    + " or account_no_masked is not null or bank_branch_name is not null"
                    + " or description is not null"))
        .isZero();
    // §1.5-2 ve -5: bakiyeler ve eski hareketler (TRANSFER çifti dahil) birebir aynı.
    assertThat(jdbc.queryForList(q(s, BALANCES))).isEqualTo(balancesBefore);
    assertThat(jdbc.queryForList(q(s, LEDGER_ROWS))).isEqualTo(rowsBefore);
    assertThat(count(s, "fund_transaction where category is not null")).isZero();
    assertThat(count(s, "fund_transaction where source_type = 'TRANSFER'")).isEqualTo(2);
    assertThat(balancesBefore).hasSize(3);
    // §1.5-3: silinmemiş her şirkette iki seri; varsayılanda sonek, diğerinde ilk 4 harf/rakam.
    assertThat(seriesPrefixes(s, f.companyA()))
        .containsExactlyInAnyOrderEntriesOf(
            Map.of("FUND_TRANSFER", "VRM", "INTERCOMPANY_TRANSFER", "SVR"));
    assertThat(seriesPrefixes(s, f.companyX()))
        .containsExactlyInAnyOrderEntriesOf(
            Map.of("FUND_TRANSFER", "CODE-VRM", "INTERCOMPANY_TRANSFER", "CODE-SVR"));
    assertThat(seriesPrefixes(s, f.deletedCompany())).isEmpty();
    assertThat(
            count(
                s,
                "document_series where doc_type in ('FUND_TRANSFER', 'INTERCOMPANY_TRANSFER')"
                    + " and (next_value <> 1 or padding <> 6 or year is not null"
                    + " or prefix !~ '^[A-Z0-9-]{1,10}$')"))
        .isZero();
    // Eski seriler dokunulmadı.
    assertThat(
            count(s, "document_series where doc_type in ('FREIGHT_INVOICE', 'WAREHOUSE_INVOICE')"))
        .isEqualTo(2);
    // §1.5-4
    assertInvoiceFlags(s);
  }

  // G-3
  @Test
  void kisitlarVeritabanindaKorur() {
    String s = schemaAtV30();
    Fixture f = fixture(s);
    migrator.migrate(s);

    // Banka/kasa tanımı
    rejected(
        "fund_account_cash_type_ck",
        () ->
            insert(
                s,
                "fund_account",
                fund(
                    f.companyA(),
                    f.branchA(),
                    "K-KRD",
                    "CASH",
                    "TRY",
                    Map.of("account_type", "CREDIT"))));
    rejected(
        "fund_account_type_ck",
        () ->
            insert(
                s,
                "fund_account",
                fund(
                    f.companyA(), f.branchA(), "B-X", "BANK", "TRY", Map.of("account_type", "X"))));
    rejected(
        "fund_account_account_no_ck",
        () ->
            insert(
                s,
                "fund_account",
                fund(
                    f.companyA(),
                    f.branchA(),
                    "B-NO",
                    "BANK",
                    "TRY",
                    Map.of("account_no_enc", "e"))));
    inRolledBackTransaction(
        () ->
            insert(
                s,
                "fund_account",
                fund(
                    f.companyA(),
                    f.branchA(),
                    "B-KRD",
                    "BANK",
                    "TRY",
                    Map.of(
                        "account_type",
                        "CREDIT",
                        "account_no_enc",
                        "e",
                        "account_no_masked",
                        "****1234"))));
    rejected(
        "fund_transaction_category_ck",
        () ->
            insert(
                s,
                "fund_transaction",
                ledger(f.bankA(), f.companyA(), "IN", "10", "MANUAL", Map.of("category", "X"))));

    // Açılış
    rejected(
        "fund_opening_active_uq",
        () -> {
          insert(s, "fund_opening", opening(f, Map.of()));
          insert(s, "fund_opening", opening(f, Map.of()));
        });
    rejected(
        "fund_opening_reverse_ck",
        () -> insert(s, "fund_opening", opening(f, Map.of("status", "REVERSED"))));
    rejected(
        "fund_opening_fund_company_fk",
        () -> insert(s, "fund_opening", opening(f, Map.of("company_id", f.companyX()))));
    inRolledBackTransaction(
        () -> {
          insert(s, "fund_opening", opening(f, Map.of("status", "REVERSED", "reversed_at", DATE)));
          insert(s, "fund_opening", opening(f, Map.of()));
        });

    // Transfer
    rejected(
        "fund_transfer_currency_ck",
        () ->
            insert(
                s,
                "fund_transfer",
                transfer(f, "EFT", f.bankA(), "TRY", f.usdA(), "USD", Map.of())));
    rejected(
        "fund_transfer_target_company_fk",
        () ->
            insert(
                s,
                "fund_transfer",
                transfer(f, "EFT", f.bankA(), "TRY", f.cashX(), "TRY", Map.of())));
    rejected(
        "fund_transfer_funds_ck",
        () ->
            insert(
                s,
                "fund_transfer",
                transfer(f, "VIREMENT", f.bankA(), "TRY", f.bankA(), "TRY", Map.of())));
    rejected(
        "fund_transfer_fx_ck",
        () ->
            insert(
                s,
                "fund_transfer",
                transfer(
                    f,
                    "FX_EXCHANGE",
                    f.bankA(),
                    "TRY",
                    f.usdA(),
                    "USD",
                    Map.of("target_amount", new BigDecimal("100")))));
    rejected(
        "fund_transfer_code_uq",
        () -> {
          insert(
              s, "fund_transfer", transfer(f, "EFT", f.bankA(), "TRY", f.cashA(), "TRY", Map.of()));
          insert(
              s,
              "fund_transfer",
              transfer(f, "WIRE", f.cashA(), "TRY", f.bankA(), "TRY", Map.of()));
        });
    inRolledBackTransaction(
        () -> {
          UUID fx =
              insert(
                  s,
                  "fund_transfer",
                  transfer(
                      f,
                      "FX_EXCHANGE",
                      f.bankA(),
                      "TRY",
                      f.usdA(),
                      "USD",
                      Map.of(
                          "target_amount",
                          new BigDecimal("100"),
                          "rate",
                          new BigDecimal("30"),
                          "rate_operation",
                          "DIVIDE")));
          insert(
              s,
              "fund_transfer_source",
              Map.of(
                  "transfer_id",
                  fx,
                  "company_id",
                  f.companyA(),
                  "source_kind",
                  "SETTLEMENT",
                  "settlement_id",
                  f.settlementA(),
                  "used_amount",
                  BigDecimal.TEN));
          insert(
              s,
              "fund_transfer_cost",
              cost(
                  fx,
                  f,
                  Map.of(
                      "cost_kind",
                      "KMV",
                      "rate_percent",
                      BigDecimal.ONE,
                      "base_amount",
                      BigDecimal.TEN)));
        });
    rejected(
        "fund_transfer_source_settlement_fk",
        () -> {
          UUID t =
              insert(
                  s,
                  "fund_transfer",
                  transfer(f, "EFT", f.bankA(), "TRY", f.cashA(), "TRY", Map.of()));
          insert(
              s,
              "fund_transfer_source",
              Map.of(
                  "transfer_id",
                  t,
                  "company_id",
                  f.companyA(),
                  "source_kind",
                  "SETTLEMENT",
                  "settlement_id",
                  f.settlementX(),
                  "used_amount",
                  BigDecimal.TEN));
        });
    rejected(
        "fund_transfer_cost_kmv_ck",
        () -> {
          UUID t =
              insert(
                  s,
                  "fund_transfer",
                  transfer(f, "EFT", f.bankA(), "TRY", f.cashA(), "TRY", Map.of()));
          insert(s, "fund_transfer_cost", cost(t, f, Map.of("cost_kind", "KMV")));
        });

    // Şirketler arası virman
    rejected(
        "intercompany_transfer_companies_ck",
        () ->
            insert(
                s,
                "intercompany_transfer",
                intercompany(f, f.companyA(), f.branchA(), f.bankA(), f.settlementA(), Map.of())));
    rejected(
        "intercompany_transfer_type_ck",
        () ->
            insert(
                s,
                "intercompany_transfer",
                intercompany(
                    f,
                    f.companyX(),
                    f.branchX(),
                    f.cashX(),
                    f.settlementX(),
                    Map.of("transfer_type", "VIREMENT"))));
    rejected(
        "intercompany_transfer_collection_fk",
        () ->
            insert(
                s,
                "intercompany_transfer",
                intercompany(f, f.companyX(), f.branchX(), f.cashX(), f.settlementA2(), Map.of())));
    inRolledBackTransaction(
        () ->
            insert(
                s,
                "intercompany_transfer",
                intercompany(f, f.companyX(), f.branchX(), f.cashX(), f.settlementX(), Map.of())));

    // Gelir/gider
    rejected(
        "fin_income_expense_category_ck",
        () -> insert(s, "fin_income_expense", income(f, Map.of("category", "X"))));
    rejected(
        "fin_income_expense_source_uq",
        () -> {
          UUID source = UUID.randomUUID();
          insert(s, "fin_income_expense", income(f, Map.of("source_id", source)));
          insert(s, "fin_income_expense", income(f, Map.of("source_id", source)));
        });
    rejected(
        "fin_income_expense_fund_company_fk",
        () -> insert(s, "fin_income_expense", income(f, Map.of("fund_account_id", f.cashX()))));

    // Geri alınan işlemlerden kalıntı yok.
    for (String table :
        List.of(
            "fund_opening",
            "fund_transfer",
            "fund_transfer_cost",
            "fund_transfer_source",
            "intercompany_transfer",
            "fin_income_expense")) {
      assertThat(count(s, table)).as(table).isZero();
    }
    assertThat(count(s, "fund_account")).isEqualTo(4);
  }

  // G-4
  @Test
  void yeniEntityVeRepositoryEslemeleriSemaylaUyumludur() throws Exception {
    World w = world("fund-mig");
    UUID companyA = w.companyAId();
    UUID companyB = w.companyBId();
    UUID a1 = UUID.fromString(w.a1());
    UUID b1 = UUID.fromString(w.b1());
    UUID fundA1 = UUID.fromString(w.fundA1());
    UUID fundA2 = UUID.fromString(w.fundA2());
    UUID fundB1 = UUID.fromString(w.fundB1());
    UUID settlementA = settlement(w.schema(), "PAYMENT", a1, companyA, fundA1);
    UUID settlementB = settlement(w.schema(), "COLLECTION", b1, companyB, fundB1);
    UUID collectionA = settlement(w.schema(), "COLLECTION", a1, companyA, fundA1);
    Map<String, UUID> ids = new HashMap<>();

    inTenant(
        w,
        () -> {
          FundAccount usd =
              funds.save(
                  new FundAccount(
                      "USD-A1",
                      "Dolar Hesabı",
                      FundKind.BANK,
                      "USD",
                      a1,
                      companyA,
                      "Ziraat",
                      "TR330006100519786457841326",
                      false,
                      FundAccountType.DEMAND,
                      "enc",
                      "****1326",
                      "Kadıköy",
                      "Döviz hesabı"));
          ids.put("usd", usd.getId());
          FundAccount kasa = funds.findById(fundA1).orElseThrow();
          FundOpening opening =
              openings.save(new FundOpening(kasa, FundDirection.OUT, Money.of("100", "TRY"), DATE));
          ids.put("opening", opening.getId());

          FundTransfer virman =
              transfers.save(
                  new FundTransfer(
                      companyA,
                      "VRM-2026-000001",
                      FundTransferType.CASH_TO_CASH,
                      TODAY,
                      fundA1,
                      Money.of("50", "TRY"),
                      fundA2,
                      Money.of("50", "TRY"),
                      null,
                      "D-1",
                      "Kasadan kasaya",
                      true,
                      null,
                      "idem-ft"));
          FundTransfer fx =
              new FundTransfer(
                  companyA,
                  "VRM-2026-000002",
                  FundTransferType.FX_EXCHANGE,
                  TODAY,
                  fundA1,
                  Money.of("3000", "TRY"),
                  usd.getId(),
                  Money.of("100", "USD"),
                  new FxTerms(new BigDecimal("30"), RateOperation.DIVIDE, FxCalcMode.SOURCE_RATE),
                  null,
                  "Bozum",
                  false,
                  virman.getId(),
                  null);
          fx.setFxDiffTl(new BigDecimal("12.5"));
          transfers.save(fx);
          ids.put("virman", virman.getId());
          ids.put("fx", fx.getId());
          costs.save(
              new FundTransferCost(
                  fx.getId(),
                  companyA,
                  TransferCostKind.KMV,
                  fundA1,
                  new BigDecimal("0.2"),
                  new BigDecimal("3000"),
                  Money.of("6", "TRY"),
                  null));
          sources.save(
              FundTransferSource.ofSettlement(
                  fx.getId(), companyA, collectionA, new BigDecimal("40")));
          sources.save(
              FundTransferSource.ofTransfer(fx.getId(), companyA, virman.getId(), BigDecimal.TEN));

          IntercompanyTransfer ict =
              new IntercompanyTransfer(
                  "SVR-2026-000001",
                  FundTransferType.EFT,
                  IntercompanyReason.DEBT_PAID,
                  TODAY,
                  new Side(companyA, a1, fundA1),
                  new Side(companyB, b1, fundB1),
                  Money.of("75", "TRY"),
                  "EFT-1",
                  "Borç ödemesi",
                  "idem-ict");
          ict.attachSettlements(settlementA, settlementB);
          intercompany.save(ict);
          ids.put("ict", ict.getId());

          FinIncomeExpense fxDiff =
              incomeExpenses.save(
                  new FinIncomeExpense(
                      companyA,
                      a1,
                      IncomeExpenseDirection.INCOME,
                      IncomeExpenseCategory.FX_DIFF,
                      "FUND_TRANSFER",
                      fx.getId(),
                      TODAY,
                      Money.of("12.5", "TRY"),
                      BigDecimal.ONE,
                      TODAY,
                      new BigDecimal("12.5"),
                      usd.getId(),
                      "Kur farkı"));
          ids.put("fxDiff", fxDiff.getId());
          incomeExpenses.save(FinIncomeExpense.reversalOf(fxDiff, TODAY, "İptal"));

          // Fon defteri: kategori yazılır, ters kayıt kategoriyi kopyalar; eski kurucu kategorisiz.
          FundTransaction posted =
              fundLedger.post(
                  new FundPosting(
                      fundA2,
                      FundDirection.IN,
                      Money.of("20", "TRY"),
                      TODAY,
                      "Gelir",
                      "MANUAL",
                      UUID.randomUUID(),
                      null,
                      FundCategory.INCOME));
          ids.put("posted", posted.getId());
          FundTransaction reversal = fundLedger.reverse(posted, TODAY, "Ters");
          assertThat(reversal.getCategory()).isEqualTo(FundCategory.INCOME);
          assertThat(reversal.getDirection()).isEqualTo(FundDirection.OUT);
          FundTransaction plain =
              fundLedger.post(
                  new FundPosting(
                      fundA2,
                      FundDirection.IN,
                      Money.of("5", "TRY"),
                      TODAY,
                      "Düz",
                      "MANUAL",
                      UUID.randomUUID(),
                      null));
          assertThat(plain.getCategory()).isNull();
        });

    inTenant(
        w,
        () -> {
          // Fon hesabı yeni alanları
          FundAccount usd = funds.findById(ids.get("usd")).orElseThrow();
          assertThat(usd.getAccountType()).isEqualTo(FundAccountType.DEMAND);
          assertThat(usd.getAccountNoEnc()).isEqualTo("enc");
          assertThat(usd.getAccountNoMasked()).isEqualTo("****1326");
          assertThat(usd.getBankBranchName()).isEqualTo("Kadıköy");
          assertThat(usd.getDescription()).isEqualTo("Döviz hesabı");
          assertThat(usd.isActive()).isTrue();
          assertThat(usd.getUpdateCount()).isZero();
          usd.updateDetails(null, null, "Moda", null);
          usd.deactivate();
          usd.incrementUpdateCount();
          FundAccount kasa = funds.findById(fundA1).orElseThrow();
          assertThat(kasa.getAccountType()).isEqualTo(FundAccountType.DEMAND);
          assertThat(kasa.isActive()).isTrue();
          assertThat(kasa.getAccountNoMasked()).isNull();

          // Açılış
          FundOpening opening =
              openings
                  .findFirstByFundAccountIdAndStatus(fundA1, FundOpeningStatus.POSTED)
                  .orElseThrow();
          assertThat(opening.getId()).isEqualTo(ids.get("opening"));
          assertThat(opening.getCompanyId()).isEqualTo(companyA);
          assertThat(opening.getFundAccountId()).isEqualTo(fundA1);
          assertThat(opening.getDirection()).isEqualTo(FundDirection.OUT);
          assertThat(opening.getAmount()).isEqualByComparingTo("100");
          assertThat(opening.getCurrency()).isEqualTo("TRY");
          assertThat(opening.getMoney()).isEqualTo(new Money(opening.getAmount(), "TRY"));
          assertThat(opening.signedAmount()).isEqualByComparingTo("-100");
          assertThat(opening.getOpeningDate()).isEqualTo(DATE);
          assertThat(opening.getReversedAt()).isNull();
          assertThat(openings.findActiveForUpdate(fundA1)).isPresent();
          assertThat(openings.findActiveForUpdate(fundA2)).isEmpty();
          opening.markReversed(DATE);
          assertThat(opening.getStatus()).isEqualTo(FundOpeningStatus.REVERSED);

          // Transfer
          FundTransfer virman = transfers.findByIdempotencyKey("idem-ft").orElseThrow();
          assertThat(virman.getId()).isEqualTo(ids.get("virman"));
          assertThat(virman.getCompanyId()).isEqualTo(companyA);
          assertThat(virman.getCode()).isEqualTo("VRM-2026-000001");
          assertThat(virman.getTransferType()).isEqualTo(FundTransferType.CASH_TO_CASH);
          assertThat(virman.getTransferDate()).isEqualTo(TODAY);
          assertThat(virman.getSourceFundId()).isEqualTo(fundA1);
          assertThat(virman.getTargetFundId()).isEqualTo(fundA2);
          assertThat(virman.getSourceMoney().amount()).isEqualByComparingTo("50");
          assertThat(virman.getTargetMoney().currency()).isEqualTo("TRY");
          assertThat(virman.getRate()).isNull();
          assertThat(virman.getRateOperation()).isNull();
          assertThat(virman.getCalcMode()).isNull();
          assertThat(virman.getFxDiffTl()).isNull();
          assertThat(virman.getDocumentNo()).isEqualTo("D-1");
          assertThat(virman.getDescription()).isEqualTo("Kasadan kasaya");
          assertThat(virman.isRulesChecked()).isTrue();
          assertThat(virman.getStatus()).isEqualTo(TransferStatus.POSTED);
          assertThat(virman.getReplacesTransferId()).isNull();
          assertThat(virman.getIdempotencyKey()).isEqualTo("idem-ft");
          assertThat(transfers.existsByReplacesTransferId(virman.getId())).isTrue();

          FundTransfer fx = transfers.findForUpdate(ids.get("fx")).orElseThrow();
          assertThat(fx.getSourceMoney()).isEqualTo(new Money(fx.getSourceMoney().amount(), "TRY"));
          assertThat(fx.getTargetMoney().amount()).isEqualByComparingTo("100");
          assertThat(fx.getTargetMoney().currency()).isEqualTo("USD");
          assertThat(fx.getRate()).isEqualByComparingTo("30");
          assertThat(fx.getRateOperation()).isEqualTo(RateOperation.DIVIDE);
          assertThat(fx.getCalcMode()).isEqualTo(FxCalcMode.SOURCE_RATE);
          assertThat(fx.getFxDiffTl()).isEqualByComparingTo("12.5");
          assertThat(fx.isRulesChecked()).isFalse();
          assertThat(fx.getReplacesTransferId()).isEqualTo(virman.getId());
          assertThat(fx.getIdempotencyKey()).isNull();
          assertThat(transfers.existsByReplacesTransferId(fx.getId())).isFalse();

          // Masraf ve kaynaklar
          FundTransferCost kmv = costs.findByTransferId(fx.getId()).get(0);
          assertThat(kmv.getId()).isNotNull();
          assertThat(kmv.getTransferId()).isEqualTo(fx.getId());
          assertThat(kmv.getCompanyId()).isEqualTo(companyA);
          assertThat(kmv.getCostKind()).isEqualTo(TransferCostKind.KMV);
          assertThat(kmv.getFundAccountId()).isEqualTo(fundA1);
          assertThat(kmv.getRatePercent()).isEqualByComparingTo("0.2");
          assertThat(kmv.getBaseAmount()).isEqualByComparingTo("3000");
          assertThat(kmv.getMoney().amount()).isEqualByComparingTo("6");
          assertThat(kmv.getExpenseItemId()).isNull();
          List<FundTransferSource> used = sources.findByTransferId(fx.getId());
          assertThat(used)
              .extracting(FundTransferSource::getSourceKind)
              .containsExactlyInAnyOrder(
                  TransferSourceKind.SETTLEMENT, TransferSourceKind.TRANSFER);
          FundTransferSource fromSettlement =
              used.stream()
                  .filter(u -> u.getSourceKind() == TransferSourceKind.SETTLEMENT)
                  .findFirst()
                  .orElseThrow();
          assertThat(fromSettlement.getId()).isNotNull();
          assertThat(fromSettlement.getTransferId()).isEqualTo(fx.getId());
          assertThat(fromSettlement.getCompanyId()).isEqualTo(companyA);
          assertThat(fromSettlement.getSettlementId()).isEqualTo(collectionA);
          assertThat(fromSettlement.getSourceTransferId()).isNull();
          assertThat(fromSettlement.getUsedAmount()).isEqualByComparingTo("40");
          assertThat(
                  used.stream()
                      .filter(u -> u.getSourceKind() == TransferSourceKind.TRANSFER)
                      .findFirst()
                      .orElseThrow()
                      .getSourceTransferId())
              .isEqualTo(virman.getId());
          assertThat(sources.existsActiveBySettlementId(collectionA)).isTrue();
          assertThat(sources.existsActiveBySettlementId(settlementA)).isFalse();
          fx.markReversed(TODAY, "Hatalı kur");
          assertThat(fx.getStatus()).isEqualTo(TransferStatus.REVERSED);
          assertThat(fx.getReversedAt()).isEqualTo(TODAY);
          assertThat(fx.getReversalReason()).isEqualTo("Hatalı kur");
          assertThatThrownBy(() -> fx.markReversed(TODAY, "Tekrar"))
              .isInstanceOfSatisfying(
                  BusinessException.class,
                  e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(e.getCode()).isEqualTo("TRANSFER_ALREADY_REVERSED");
                  });
          transfers.flush();
          assertThat(sources.existsActiveBySettlementId(collectionA)).isFalse();

          // Şirketler arası virman
          IntercompanyTransfer ict = intercompany.findByIdempotencyKey("idem-ict").orElseThrow();
          assertThat(ict.getId()).isEqualTo(ids.get("ict"));
          assertThat(ict.getCode()).isEqualTo("SVR-2026-000001");
          assertThat(ict.getTransferType()).isEqualTo(FundTransferType.EFT);
          assertThat(ict.getReasonType()).isEqualTo(IntercompanyReason.DEBT_PAID);
          assertThat(ict.getTransferDate()).isEqualTo(TODAY);
          assertThat(ict.getFromCompanyId()).isEqualTo(companyA);
          assertThat(ict.getToCompanyId()).isEqualTo(companyB);
          assertThat(ict.getFromBranchId()).isEqualTo(a1);
          assertThat(ict.getToBranchId()).isEqualTo(b1);
          assertThat(ict.getFromFundId()).isEqualTo(fundA1);
          assertThat(ict.getToFundId()).isEqualTo(fundB1);
          assertThat(ict.getMoney().amount()).isEqualByComparingTo("75");
          assertThat(ict.getPaymentSettlementId()).isEqualTo(settlementA);
          assertThat(ict.getCollectionSettlementId()).isEqualTo(settlementB);
          assertThat(ict.getDocumentNo()).isEqualTo("EFT-1");
          assertThat(ict.getDescription()).isEqualTo("Borç ödemesi");
          assertThat(ict.getStatus()).isEqualTo(TransferStatus.POSTED);
          assertThat(ict.getIdempotencyKey()).isEqualTo("idem-ict");
          assertThat(intercompany.findForUpdate(ict.getId())).isPresent();
          assertThat(intercompany.existsBySettlement(settlementA)).isTrue();
          assertThat(intercompany.existsBySettlement(settlementB)).isTrue();
          assertThat(intercompany.existsBySettlement(collectionA)).isFalse();
          assertThat(intercompany.findBySettlement(settlementB))
              .get()
              .extracting(IntercompanyTransfer::getId)
              .isEqualTo(ict.getId());
          assertThat(intercompany.findBySettlement(collectionA)).isEmpty();
          ict.markReversed(TODAY, "Yanlış hesap");
          assertThat(ict.getReversedAt()).isEqualTo(TODAY);
          assertThat(ict.getReversalReason()).isEqualTo("Yanlış hesap");
          assertThatThrownBy(() -> ict.markReversed(TODAY, "Tekrar"))
              .isInstanceOf(BusinessException.class);

          // Gelir/gider
          List<FinIncomeExpense> rows =
              incomeExpenses.findBySourceTypeAndSourceId("FUND_TRANSFER", fx.getId());
          assertThat(rows).hasSize(1);
          FinIncomeExpense fxDiff = rows.get(0);
          assertThat(fxDiff.getId()).isEqualTo(ids.get("fxDiff"));
          assertThat(fxDiff.getCompanyId()).isEqualTo(companyA);
          assertThat(fxDiff.getBranchId()).isEqualTo(a1);
          assertThat(fxDiff.getDirection()).isEqualTo(IncomeExpenseDirection.INCOME);
          assertThat(fxDiff.getCategory()).isEqualTo(IncomeExpenseCategory.FX_DIFF);
          assertThat(fxDiff.getSourceType()).isEqualTo("FUND_TRANSFER");
          assertThat(fxDiff.getSourceId()).isEqualTo(fx.getId());
          assertThat(fxDiff.getTransactionDate()).isEqualTo(TODAY);
          assertThat(fxDiff.getMoney().amount()).isEqualByComparingTo("12.5");
          assertThat(fxDiff.getExchangeRate()).isEqualByComparingTo("1");
          assertThat(fxDiff.getRateDate()).isEqualTo(TODAY);
          assertThat(fxDiff.getTlAmount()).isEqualByComparingTo("12.5");
          assertThat(fxDiff.getFundAccountId()).isEqualTo(ids.get("usd"));
          assertThat(fxDiff.getDescription()).isEqualTo("Kur farkı");
          FinIncomeExpense reversal =
              incomeExpenses
                  .findBySourceTypeAndSourceId(FinIncomeExpense.SOURCE_REVERSAL, fxDiff.getId())
                  .get(0);
          assertThat(reversal.getDirection()).isEqualTo(IncomeExpenseDirection.EXPENSE);
          assertThat(reversal.getCategory()).isEqualTo(IncomeExpenseCategory.FX_DIFF);
          assertThat(reversal.getTlAmount()).isEqualByComparingTo("12.5");
          assertThat(reversal.getDescription()).isEqualTo("İptal");
          assertThat(IncomeExpenseDirection.EXPENSE.opposite())
              .isEqualTo(IncomeExpenseDirection.INCOME);
          assertThat(
                  incomeExpenses.existsBySourceTypeAndSourceIdAndCategory(
                      "FUND_TRANSFER", fx.getId(), IncomeExpenseCategory.FX_DIFF))
              .isTrue();
          assertThat(
                  incomeExpenses.existsBySourceTypeAndSourceIdAndCategory(
                      "FUND_TRANSFER", fx.getId(), IncomeExpenseCategory.BANK_CHARGE))
              .isFalse();

          // Fon defteri kategorisi kalıcı
          assertThat(
                  jdbc.queryForList(
                      "select category from \"%s\".fund_transaction where id = ? or source_id = ?"
                          .formatted(w.schema()),
                      String.class,
                      ids.get("posted"),
                      ids.get("posted")))
              .containsExactly("INCOME", "INCOME");

          // Belge türü bayrağı
          assertThat(
                  documentTypes
                      .findById(
                          new AccountDocumentType.Key(AccountDocumentSide.PAYABLE, "ALIS_FATURASI"))
                      .orElseThrow()
                      .isCountsAsInvoice())
              .isTrue();
          assertThat(
                  documentTypes
                      .findById(
                          new AccountDocumentType.Key(
                              AccountDocumentSide.RECEIVABLE, "SEVK_IRSALIYESI"))
                      .orElseThrow()
                      .isCountsAsInvoice())
              .isFalse();

          // Fon ve settlement repository genişlemeleri
          assertThat(funds.isUsed(fundA1)).isTrue();
          assertThat(funds.isUsed(ids.get("usd"))).isTrue();
          assertThat(funds.lockAll(List.of(fundA2, fundA1)))
              .containsExactlyInAnyOrder(fundA1, fundA2);
          assertThat(settlements.findForUpdate(settlementA)).isPresent();
          // Sıra: tür (BANK < CASH), hesap türü, banka adı, ad.
          assertThat(funds.searchFiltered(BranchFilter.all(companyA), null, null, null, null))
              .extracting(FundAccount::getCode)
              .containsExactly("USD-A1", "KASA-A1", "KASA-A2");
          assertThat(
                  funds.searchFiltered(
                      BranchFilter.all(null), FundKind.CASH, FundAccountType.DEMAND, true, "TRY"))
              .extracting(FundAccount::getCode)
              .containsExactlyInAnyOrder("KASA-A1", "KASA-A2", "KASA-B1");
          assertThat(
                  funds.searchFiltered(
                      BranchFilter.limited(companyA, List.of(a1)),
                      FundKind.BANK,
                      null,
                      null,
                      "USD"))
              .extracting(FundAccount::getCode)
              .containsExactly("USD-A1");
          assertThat(
                  funds.searchFiltered(
                      BranchFilter.all(companyB), null, FundAccountType.CREDIT, null, null))
              .isEmpty();
        });

    // Pasifleştirme ve ayrıntı güncellemesi yazıldı.
    Map<String, Object> usdRow =
        jdbc.queryForMap(
            "select active, update_count, account_no_enc, account_no_masked, bank_branch_name"
                + " from \"%s\".fund_account where id = ?".formatted(w.schema()),
            ids.get("usd"));
    assertThat(usdRow)
        .containsEntry("active", false)
        .containsEntry("update_count", 1)
        .containsEntry("account_no_enc", null)
        .containsEntry("account_no_masked", null)
        .containsEntry("bank_branch_name", "Moda");
    assertThat(
            jdbc.queryForObject(
                "select count(*) from \"%s\".fund_opening where status = 'REVERSED'"
                    .formatted(w.schema()),
                Long.class))
        .isEqualTo(1);
    inTenant(
        w,
        () -> {
          FundAccount usd = funds.findById(ids.get("usd")).orElseThrow();
          usd.activate();
          assertThat(usd.isActive()).isTrue();
          assertThat(funds.searchFiltered(BranchFilter.all(companyA), null, null, false, null))
              .isEmpty();
        });
  }

  // --- kurulum

  /**
   * Göç öncesi (V30) veri: varsayılan şirket A (iş yeri A1), ikinci şirket CODE_X1 (iş yeri X1),
   * silinmiş şirket; A'da TRY banka, USD banka, TRY kasa; X'te TRY kasa; elle hareketler, eski
   * başlıksız TRANSFER çifti, silinmiş hareket, iki şirkette settlement ve fon hareketi.
   */
  private record Fixture(
      UUID companyA,
      UUID companyX,
      UUID deletedCompany,
      UUID branchA,
      UUID branchX,
      UUID bankA,
      UUID usdA,
      UUID cashA,
      UUID cashX,
      UUID settlementA,
      UUID settlementA2,
      UUID settlementX) {}

  private Fixture fixture(String s) {
    UUID companyA = defaultCompany(s);
    UUID companyX =
        insert(
            s,
            "company",
            Map.of(
                "code", "CODE_X1", "title", "X Lojistik", "short_name", "X", "is_default", false));
    UUID deletedCompany =
        insert(
            s,
            "company",
            Map.of(
                "code",
                "SIL1",
                "title",
                "Silinmiş",
                "short_name",
                "Sil",
                "is_default",
                false,
                "deleted",
                true));
    UUID branchA = insert(s, "branch", Map.of("code", "A1", "name", "A1", "company_id", companyA));
    UUID branchX = insert(s, "branch", Map.of("code", "X1", "name", "X1", "company_id", companyX));
    UUID bankA =
        insert(s, "fund_account", fund(companyA, branchA, "BNK-A", "BANK", "TRY", Map.of()));
    UUID usdA =
        insert(s, "fund_account", fund(companyA, branchA, "USD-A", "BANK", "USD", Map.of()));
    UUID cashA =
        insert(s, "fund_account", fund(companyA, branchA, "KASA-A", "CASH", "TRY", Map.of()));
    UUID cashX =
        insert(s, "fund_account", fund(companyX, branchX, "KASA-X", "CASH", "TRY", Map.of()));

    insert(s, "fund_transaction", ledger(bankA, companyA, "IN", "1000", "MANUAL", Map.of()));
    insert(
        s,
        "fund_transaction",
        ledger(bankA, companyA, "IN", "999", "MANUAL", Map.of("deleted", true)));
    UUID legacy = UUID.randomUUID();
    insert(
        s,
        "fund_transaction",
        ledger(bankA, companyA, "OUT", "200", "TRANSFER", Map.of("source_id", legacy)));
    insert(
        s,
        "fund_transaction",
        ledger(cashA, companyA, "IN", "200", "TRANSFER", Map.of("source_id", legacy)));
    insert(s, "fund_transaction", ledger(cashX, companyX, "IN", "500", "MANUAL", Map.of()));
    UUID settlementA = settlement(s, "PAYMENT", branchA, companyA, cashA);
    insert(
        s,
        "fund_transaction",
        ledger(cashA, companyA, "OUT", "50", "SETTLEMENT", Map.of("source_id", settlementA)));
    UUID settlementA2 = settlement(s, "COLLECTION", branchA, companyA, bankA);
    UUID settlementX = settlement(s, "COLLECTION", branchX, companyX, cashX);
    insert(
        s,
        "fund_transaction",
        ledger(cashX, companyX, "IN", "70", "SETTLEMENT", Map.of("source_id", settlementX)));
    return new Fixture(
        companyA,
        companyX,
        deletedCompany,
        branchA,
        branchX,
        bankA,
        usdA,
        cashA,
        cashX,
        settlementA,
        settlementA2,
        settlementX);
  }

  private static Map<String, Object> fund(
      UUID company,
      UUID branch,
      String code,
      String kind,
      String currency,
      Map<String, Object> extra) {
    Map<String, Object> values = new HashMap<>();
    values.put("code", code);
    values.put("name", code);
    values.put("kind", kind);
    values.put("currency", currency);
    values.put("branch_id", branch);
    values.put("company_id", company);
    values.putAll(extra);
    return values;
  }

  private static Map<String, Object> ledger(
      UUID fund,
      UUID company,
      String direction,
      String amount,
      String sourceType,
      Map<String, Object> extra) {
    Map<String, Object> values = new HashMap<>();
    values.put("fund_account_id", fund);
    values.put("company_id", company);
    values.put("direction", direction);
    values.put("amount", new BigDecimal(amount));
    values.put("currency", "TRY");
    values.put("exchange_rate", BigDecimal.ONE);
    values.put("rate_date", DATE);
    values.put("tl_amount", new BigDecimal(amount));
    values.put("transaction_date", DATE);
    values.put("description", sourceType);
    values.put("source_type", sourceType);
    values.put("source_id", UUID.randomUUID());
    values.putAll(extra);
    return values;
  }

  private UUID settlement(String s, String type, UUID branch, UUID company, UUID fund) {
    Map<String, Object> values = new HashMap<>();
    values.put("type", type);
    values.put("method", "CASH");
    values.put("branch_id", branch);
    values.put("company_id", company);
    values.put("fund_account_id", fund);
    values.put("amount", new BigDecimal("50"));
    values.put("currency", "TRY");
    values.put("settlement_date", DATE);
    values.put("status", "POSTED");
    return insert(s, "settlement", values);
  }

  private static Map<String, Object> opening(Fixture f, Map<String, Object> extra) {
    Map<String, Object> values = new HashMap<>();
    values.put("fund_account_id", f.bankA());
    values.put("company_id", f.companyA());
    values.put("direction", "IN");
    values.put("amount", BigDecimal.TEN);
    values.put("currency", "TRY");
    values.put("opening_date", DATE);
    values.putAll(extra);
    return values;
  }

  private static Map<String, Object> transfer(
      Fixture f,
      String type,
      UUID source,
      String sourceCurrency,
      UUID target,
      String targetCurrency,
      Map<String, Object> extra) {
    Map<String, Object> values = new HashMap<>();
    values.put("company_id", f.companyA());
    values.put("code", "VRM-2026-000001");
    values.put("transfer_type", type);
    values.put("transfer_date", DATE);
    values.put("source_fund_id", source);
    values.put("source_amount", new BigDecimal("3000"));
    values.put("source_currency", sourceCurrency);
    values.put("target_fund_id", target);
    values.put("target_amount", new BigDecimal("3000"));
    values.put("target_currency", targetCurrency);
    values.putAll(extra);
    return values;
  }

  private static Map<String, Object> cost(UUID transfer, Fixture f, Map<String, Object> extra) {
    Map<String, Object> values = new HashMap<>();
    values.put("transfer_id", transfer);
    values.put("company_id", f.companyA());
    values.put("cost_kind", "FEE");
    values.put("fund_account_id", f.bankA());
    values.put("amount", BigDecimal.ONE);
    values.put("currency", "TRY");
    values.putAll(extra);
    return values;
  }

  /** A'dan ({@code bankA}, ödeme {@code settlementA}) verilen alıcı şirkete virman satırı. */
  private static Map<String, Object> intercompany(
      Fixture f,
      UUID toCompany,
      UUID toBranch,
      UUID toFund,
      UUID collection,
      Map<String, Object> extra) {
    Map<String, Object> values = new HashMap<>();
    values.put("code", "SVR-2026-000001");
    values.put("transfer_type", "EFT");
    values.put("reason_type", "DEBT_PAID");
    values.put("transfer_date", DATE);
    values.put("from_company_id", f.companyA());
    values.put("to_company_id", toCompany);
    values.put("from_branch_id", f.branchA());
    values.put("to_branch_id", toBranch);
    values.put("from_fund_id", f.bankA());
    values.put("to_fund_id", toFund);
    values.put("amount", new BigDecimal("50"));
    values.put("currency", "TRY");
    values.put("payment_settlement_id", f.settlementA());
    values.put("collection_settlement_id", collection);
    values.putAll(extra);
    return values;
  }

  private static Map<String, Object> income(Fixture f, Map<String, Object> extra) {
    Map<String, Object> values = new HashMap<>();
    values.put("company_id", f.companyA());
    values.put("branch_id", f.branchA());
    values.put("direction", "INCOME");
    values.put("category", "FX_DIFF");
    values.put("source_type", "FUND_TRANSFER");
    values.put("source_id", UUID.randomUUID());
    values.put("transaction_date", DATE);
    values.put("amount", BigDecimal.TEN);
    values.put("currency", "TRY");
    values.put("exchange_rate", BigDecimal.ONE);
    values.put("rate_date", DATE);
    values.put("tl_amount", BigDecimal.TEN);
    values.put("fund_account_id", f.bankA());
    values.putAll(extra);
    return values;
  }

  private void assertInvoiceFlags(String s) {
    assertThat(count(s, "account_document_type where counts_as_invoice")).isEqualTo(12);
    assertThat(
            count(
                s,
                "account_document_type where code = 'SEVK_IRSALIYESI' and not counts_as_invoice"))
        .isEqualTo(2);
    assertThat(
            count(
                s,
                "account_document_type where side = 'PAYABLE' and code = 'YURT_DISI_FATURA'"
                    + " and counts_as_invoice"))
        .isEqualTo(1);
  }

  private Map<String, String> seriesPrefixes(String s, UUID company) {
    return jdbc
        .queryForList(
            q(
                s,
                "select doc_type, prefix from %s.document_series where company_id = ?"
                    + " and doc_type in ('FUND_TRANSFER', 'INTERCOMPANY_TRANSFER')"),
            company)
        .stream()
        .collect(Collectors.toMap(r -> (String) r.get("doc_type"), r -> (String) r.get("prefix")));
  }

  private UUID defaultCompany(String s) {
    return jdbc.queryForObject(q(s, "select id from %s.company where is_default"), UUID.class);
  }

  /** Ekleme bir işlem içinde yapılır; kısıt ihlaliyle işlem geri alınır, kalıntı kalmaz. */
  private void rejected(String constraint, Runnable insert) {
    assertThatThrownBy(() -> inRolledBackTransaction(insert))
        .isInstanceOf(DataIntegrityViolationException.class)
        .hasMessageContaining(constraint);
  }

  private void inRolledBackTransaction(Runnable work) {
    TransactionTemplate tx = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
    tx.executeWithoutResult(
        status -> {
          status.setRollbackOnly();
          work.run();
        });
  }

  private void inTenant(World w, Runnable work) {
    TenantContext.set(w.t(), w.schema());
    try {
      new TransactionTemplate(transactionManager).executeWithoutResult(status -> work.run());
    } finally {
      TenantContext.clear();
    }
  }

  private String schemaAtV30() {
    String schema = "fmig_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    flyway(schema, "30").migrate();
    return schema;
  }

  private Flyway flyway(String schema, String target) {
    var config =
        Flyway.configure()
            .dataSource(dataSource)
            .schemas(schema)
            .defaultSchema(schema)
            .locations("classpath:db/migration/tenant");
    if (target != null) {
      config.target(target);
    }
    return config.load();
  }

  /**
   * Şema nitelikli satır ekler ve kimliğini döner. Verilmeyen NOT NULL (varsayılansız) kolonlar
   * türüne göre sahte değerle doldurulur; yabancı anahtarlar açıkça verilir ({@code
   * organization.SchemaRows} deseni; o sınıf paket içidir).
   */
  private UUID insert(String schema, String table, Map<String, Object> values) {
    Map<String, Object> row = new LinkedHashMap<>(values);
    List<Map<String, Object>> columns =
        jdbc.queryForList(
            """
            select column_name, data_type, character_maximum_length
            from information_schema.columns
            where table_schema = ? and table_name = ? and is_nullable = 'NO'
              and column_default is null
            order by ordinal_position
            """,
            schema,
            table);
    for (Map<String, Object> column : columns) {
      String name = (String) column.get("column_name");
      if (!row.containsKey(name)) {
        row.put(
            name,
            dummy(name, (String) column.get("data_type"), column.get("character_maximum_length")));
      }
    }
    List<String> names = new ArrayList<>(row.keySet());
    jdbc.update(
        "insert into \"%s\".%s (%s) values (%s)"
            .formatted(
                schema,
                table,
                String.join(", ", names),
                names.stream().map(n -> "?").collect(Collectors.joining(", "))),
        row.values().toArray());
    return (UUID) row.get("id");
  }

  private static Object dummy(String name, String type, Object length) {
    return switch (type) {
      case "uuid" -> UUID.randomUUID();
      case "character varying", "text" -> "X";
      case "character" ->
          name.equals("currency") ? "TRY" : "X".repeat(((Number) length).intValue());
      case "numeric", "integer", "bigint", "smallint" -> 1;
      case "boolean" -> false;
      case "date" -> DATE;
      case "timestamp with time zone" -> TIME;
      default -> throw new IllegalArgumentException(name + " için sahte değer yok: " + type);
    };
  }

  private long count(String s, String fromWhere) {
    return jdbc.queryForObject(q(s, "select count(*) from %s." + fromWhere), Long.class);
  }

  private static String q(String schema, String sql) {
    return sql.replace("%s", "\"" + schema + "\"");
  }
}
