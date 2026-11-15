package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import javax.sql.DataSource;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.AllocationTargetType;
import org.ece.blackrose.finance.domain.FinanceTypes.DailyReportSort;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementChannel;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementLockReason;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.domain.Settlement;
import org.ece.blackrose.finance.domain.SettlementAllocation;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountBankAccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.SettlementAllocationRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.SettlementRepository;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.tenant.TenantContext;
import org.ece.blackrose.tenant.service.TenantMigrator;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Faz 12.2a göçü (tenant V35 Z15, V36 Z16) boş ve iki şirketli dolu şemada hatasız çalışır; iptal
 * edilmiş kayıtların iptal tarihini ters satırlardan doldurur, defter satırlarını ve bakiyeleri
 * değiştirmez; yeni kısıtlar veritabanında korur; yeni entity ve repository eşlemeleri şemayla
 * uyumludur (docs/zto-finans/uygulama/12.2a_TASARIM.md §1, §2, §6.1).
 */
class SettlementMigrationIT extends AccountTestSupport {

  private static final LocalDate DATE = LocalDate.of(2026, 1, 15);
  private static final OffsetDateTime TIME =
      OffsetDateTime.of(2026, 1, 15, 9, 0, 0, 0, ZoneOffset.UTC);

  private static final String CHECK_VIOLATION = "23514";
  private static final String FK_VIOLATION = "23503";
  private static final String UNIQUE_VIOLATION = "23505";

  private static final String ACCOUNT_BALANCES =
      "select account_id, company_id, currency,"
          + " sum(case when direction = 'DEBIT' then amount else -amount end) as b"
          + " from %s.account_transaction where deleted = false"
          + " group by account_id, company_id, currency order by account_id, company_id, currency";

  private static final String FUND_BALANCES =
      "select fund_account_id, sum(case when direction = 'IN' then amount else -amount end) as b"
          + " from %s.fund_transaction where deleted = false group by fund_account_id"
          + " order by fund_account_id";

  /** Göç öncesi (V34) settlement kolonları: göç bunları değiştirmez. */
  private static final String SETTLEMENT_ROWS =
      "select id, type, method, account_id, branch_id, company_id, fund_account_id, instrument_id,"
          + " expense_item_id, plan_id, amount, currency, settlement_date, description, status,"
          + " idempotency_key, created_by, created_at, updated_by, updated_at, deleted"
          + " from %s.settlement order by id";

  private static final List<String> CONSTRAINTS =
      List.of(
          "account_bank_account_id_account_uq",
          "settlement_channel_ck",
          "settlement_counterparty_account_ck",
          "settlement_counterparty_bank_fk",
          "settlement_corrects_fk",
          "settlement_corrects_self_ck",
          "settlement_reversed_on_ck",
          "purchase_invoice_id_company_uq",
          "freight_invoice_id_company_uq",
          "warehouse_invoice_id_company_uq",
          "opening_invoice_id_company_uq",
          "account_document_id_company_uq",
          "settlement_allocation_settlement_fk",
          "settlement_allocation_purchase_fk",
          "settlement_allocation_freight_fk",
          "settlement_allocation_warehouse_fk",
          "settlement_allocation_opening_fk",
          "settlement_allocation_document_fk",
          "settlement_allocation_amount_ck",
          "settlement_allocation_currency_ck",
          "settlement_allocation_type_ck",
          "settlement_allocation_one_target_ck",
          "settlement_allocation_target_match_ck");

  private static final List<String> INDEXES =
      List.of(
          "settlement_corrects_uq",
          "settlement_list_idx",
          "settlement_account_date_idx",
          "settlement_document_no_idx",
          "settlement_counterparty_bank_idx",
          "vehicle_expense_settlement_idx",
          "settlement_allocation_target_uq",
          "settlement_allocation_settlement_idx",
          "settlement_allocation_purchase_idx",
          "settlement_allocation_freight_idx",
          "settlement_allocation_warehouse_idx",
          "settlement_allocation_opening_idx",
          "settlement_allocation_document_idx");

  @Autowired DataSource dataSource;
  @Autowired TenantMigrator migrator;
  @Autowired PlatformTransactionManager transactionManager;

  @Autowired SettlementRepository settlements;
  @Autowired SettlementAllocationRepository allocations;
  @Autowired AccountBankAccountRepository bankAccounts;

  // M-1
  @Test
  void bosKiracidaGocGecerVeTumKisitVeIndekslerOlusur() {
    String s = schemaAtV34();
    migrator.migrate(s);

    assertThat(
            jdbc.queryForList(
                q(
                    s,
                    "select version from %s.flyway_schema_history where success"
                        + " order by installed_rank"),
                String.class))
        .contains("35", "36");
    assertGuarantees(s);
    assertThat(count(s, "settlement")).isZero();
    assertThat(count(s, "settlement_allocation")).isZero();
    assertThat(
            jdbc.queryForList(
                """
                select c.conname from pg_constraint c
                join pg_namespace n on n.oid = c.connamespace
                where n.nspname = ?
                """,
                String.class,
                s))
        .containsAll(CONSTRAINTS);
    assertThat(
            jdbc.queryForList(
                "select indexname from pg_indexes where schemaname = ?", String.class, s))
        .containsAll(INDEXES);
    // İkinci çalıştırma bir şey yapmaz.
    assertThat(flyway(s, null).migrate().migrationsExecuted).isZero();
    flyway(s, null).validate();
  }

  // M-2 (G-1 … G-4)
  @Test
  void ikiSirketliDoluKiracidaIptalTarihleriDolarVeDefterDegismez() {
    String s = schemaAtV34();
    Fixture f = fixture(s);
    List<Map<String, Object>> accountBalances = jdbc.queryForList(q(s, ACCOUNT_BALANCES));
    List<Map<String, Object>> fundBalances = jdbc.queryForList(q(s, FUND_BALANCES));
    List<Map<String, Object>> accountRows =
        jdbc.queryForList(q(s, "select * from %s.account_transaction order by id"));
    List<Map<String, Object>> fundRows =
        jdbc.queryForList(q(s, "select * from %s.fund_transaction order by id"));
    List<Map<String, Object>> settlementRows = jdbc.queryForList(q(s, SETTLEMENT_ROWS));

    migrator.migrate(s);

    // G-1, G-2
    assertGuarantees(s);
    assertThat(count(s, "settlement")).isEqualTo(10);
    assertThat(count(s, "settlement where status = 'REVERSED'")).isEqualTo(3);
    // G-3: bakiyeler ve defter satırları birebir aynı (iki şirket, cari ve fon).
    assertThat(accountBalances).hasSizeGreaterThanOrEqualTo(6);
    assertThat(fundBalances).hasSize(4);
    assertThat(jdbc.queryForList(q(s, ACCOUNT_BALANCES))).isEqualTo(accountBalances);
    assertThat(jdbc.queryForList(q(s, FUND_BALANCES))).isEqualTo(fundBalances);
    assertThat(jdbc.queryForList(q(s, "select * from %s.account_transaction order by id")))
        .isEqualTo(accountRows);
    assertThat(jdbc.queryForList(q(s, "select * from %s.fund_transaction order by id")))
        .isEqualTo(fundRows);
    assertThat(jdbc.queryForList(q(s, SETTLEMENT_ROWS))).isEqualTo(settlementRows);
    // G-4: cari ters satırı fon ters satırından önce gelir; carisiz kayıtta fon ters satırı;
    // hiç ters satırı olmayan kayıtta son güncellemenin İstanbul günü.
    assertThat(reversedOn(s, f.reversedCollection())).isEqualTo(DATE.plusDays(3));
    assertThat(reversedOn(s, f.reversedExpense())).isEqualTo(DATE.plusDays(2));
    assertThat(reversedOn(s, f.reversedBare())).isEqualTo(LocalDate.of(2026, 1, 21));
    assertThat(count(s, "settlement where status = 'POSTED' and reversed_on is not null")).isZero();
    assertThat(count(s, "settlement where reverse_reason is not null")).isZero();
    assertThat(count(s, "settlement_allocation")).isZero();
    // Bileşik FK hedefleri dolu tablolarda da kuruldu.
    for (String table :
        List.of(
            "purchase_invoice",
            "freight_invoice",
            "warehouse_invoice",
            "opening_invoice",
            "account_document")) {
      assertThat(count(s, table)).as(table).isEqualTo(1);
    }
  }

  // M-3 (G-5)
  @Test
  void kisitlarVeritabanindaKorur() {
    String s = schemaAtV34();
    Fixture f = fixture(s);
    migrator.migrate(s);

    // --- settlement (V35)
    rejected(
        CHECK_VIOLATION,
        "settlement_channel_ck",
        () ->
            insert(
                s,
                "settlement",
                settlement(
                    f.branchA(), f.companyA(), f.cashA(), Map.of("channel", "CREDIT_CARD"))));
    rejected(
        CHECK_VIOLATION,
        "settlement_channel_ck",
        () ->
            insert(
                s,
                "settlement",
                settlement(
                    f.branchA(),
                    f.companyA(),
                    f.bankA(),
                    Map.of("method", "BANK", "channel", "WIRE"))));
    rejected(
        FK_VIOLATION,
        "settlement_counterparty_bank_fk",
        () ->
            insert(
                s,
                "settlement",
                settlement(
                    f.branchA(),
                    f.companyA(),
                    f.bankA(),
                    Map.of(
                        "method",
                        "BANK",
                        "account_id",
                        f.supplier(),
                        "counterparty_bank_account_id",
                        f.customerBank()))));
    rejected(
        CHECK_VIOLATION,
        "settlement_counterparty_account_ck",
        () ->
            insert(
                s,
                "settlement",
                settlement(
                    f.branchA(),
                    f.companyA(),
                    f.cashA(),
                    Map.of("counterparty_bank_account_id", f.customerBank()))));
    rejected(
        FK_VIOLATION,
        "settlement_corrects_fk",
        () ->
            insert(
                s,
                "settlement",
                settlement(
                    f.branchA(),
                    f.companyA(),
                    f.cashA(),
                    Map.of("corrects_settlement_id", f.collectionX()))));
    rejected(
        UNIQUE_VIOLATION,
        "settlement_corrects_uq",
        () -> {
          insert(
              s,
              "settlement",
              settlement(
                  f.branchA(),
                  f.companyA(),
                  f.cashA(),
                  Map.of("corrects_settlement_id", f.reversedCollection())));
          insert(
              s,
              "settlement",
              settlement(
                  f.branchA2(),
                  f.companyA(),
                  f.bankA(),
                  Map.of("method", "BANK", "corrects_settlement_id", f.reversedCollection())));
        });
    rejected(
        CHECK_VIOLATION,
        "settlement_corrects_self_ck",
        () -> {
          UUID self = UUID.randomUUID();
          insert(
              s,
              "settlement",
              settlement(
                  f.branchA(),
                  f.companyA(),
                  f.cashA(),
                  Map.of("id", self, "corrects_settlement_id", self)));
        });
    rejected(
        CHECK_VIOLATION,
        "settlement_reversed_on_ck",
        () ->
            insert(
                s,
                "settlement",
                settlement(f.branchA(), f.companyA(), f.cashA(), Map.of("status", "REVERSED"))));
    rejected(
        CHECK_VIOLATION,
        "settlement_reversed_on_ck",
        () ->
            insert(
                s,
                "settlement",
                settlement(f.branchA(), f.companyA(), f.cashA(), Map.of("reversed_on", DATE))));
    // Geçerli biçimler: kart kanalı, carinin kendi hesabı, aynı şirkette düzeltme zinciri,
    // gerekçeli iptal; silinmiş düzeltme ikinci düzeltmeyi engellemez.
    inRolledBackTransaction(
        () -> {
          insert(
              s,
              "settlement",
              settlement(
                  f.branchA(),
                  f.companyA(),
                  f.bankA(),
                  Map.of(
                      "method",
                      "BANK",
                      "channel",
                      "CREDIT_CARD",
                      "account_id",
                      f.customer(),
                      "counterparty_bank_account_id",
                      f.customerBank(),
                      "document_no",
                      "DEK-1",
                      "corrects_settlement_id",
                      f.reversedCollection())));
          insert(
              s,
              "settlement",
              settlement(
                  f.branchA(),
                  f.companyA(),
                  f.cashA(),
                  Map.of(
                      "status",
                      "REVERSED",
                      "reversed_on",
                      DATE,
                      "reverse_reason",
                      "Yanlış tutar",
                      "corrects_settlement_id",
                      f.reversedExpense(),
                      "deleted",
                      true)));
          insert(
              s,
              "settlement",
              settlement(
                  f.branchA(),
                  f.companyA(),
                  f.cashA(),
                  Map.of("corrects_settlement_id", f.reversedExpense())));
        });

    // --- settlement_allocation (V36)
    rejected(
        CHECK_VIOLATION,
        "settlement_allocation_one_target_ck",
        () ->
            insert(
                s,
                "settlement_allocation",
                allocation(
                    f.paymentA(),
                    f.companyA(),
                    "PURCHASE_INVOICE",
                    Map.of(
                        "purchase_invoice_id",
                        f.purchaseA(),
                        "freight_invoice_id",
                        f.freightA()))));
    rejected(
        CHECK_VIOLATION,
        "settlement_allocation_one_target_ck",
        () ->
            insert(
                s,
                "settlement_allocation",
                allocation(f.paymentA(), f.companyA(), "PURCHASE_INVOICE", Map.of())));
    rejected(
        CHECK_VIOLATION,
        "settlement_allocation_target_match_ck",
        () ->
            insert(
                s,
                "settlement_allocation",
                allocation(
                    f.paymentA(),
                    f.companyA(),
                    "FREIGHT_INVOICE",
                    Map.of("purchase_invoice_id", f.purchaseA()))));
    rejected(
        CHECK_VIOLATION,
        "settlement_allocation_amount_ck",
        () ->
            insert(
                s,
                "settlement_allocation",
                allocation(
                    f.paymentA(),
                    f.companyA(),
                    "PURCHASE_INVOICE",
                    Map.of("purchase_invoice_id", f.purchaseA(), "amount", BigDecimal.ZERO))));
    rejected(
        CHECK_VIOLATION,
        "settlement_allocation_currency_ck",
        () ->
            insert(
                s,
                "settlement_allocation",
                allocation(
                    f.paymentA(),
                    f.companyA(),
                    "PURCHASE_INVOICE",
                    Map.of("purchase_invoice_id", f.purchaseA(), "currency", "tr1"))));
    rejected(
        UNIQUE_VIOLATION,
        "settlement_allocation_target_uq",
        () -> {
          insert(
              s,
              "settlement_allocation",
              allocation(
                  f.paymentA(),
                  f.companyA(),
                  "PURCHASE_INVOICE",
                  Map.of("purchase_invoice_id", f.purchaseA())));
          insert(
              s,
              "settlement_allocation",
              allocation(
                  f.paymentA(),
                  f.companyA(),
                  "PURCHASE_INVOICE",
                  Map.of("purchase_invoice_id", f.purchaseA())));
        });
    // Settlement başka şirketin.
    rejected(
        FK_VIOLATION,
        "settlement_allocation_settlement_fk",
        () ->
            insert(
                s,
                "settlement_allocation",
                allocation(
                    f.collectionX(),
                    f.companyA(),
                    "PURCHASE_INVOICE",
                    Map.of("purchase_invoice_id", f.purchaseA()))));
    // Her hedef türünde başka şirketin belgesi.
    rejected(
        FK_VIOLATION,
        "settlement_allocation_purchase_fk",
        () ->
            insert(
                s,
                "settlement_allocation",
                allocation(
                    f.collectionX(),
                    f.companyX(),
                    "PURCHASE_INVOICE",
                    Map.of("purchase_invoice_id", f.purchaseA()))));
    rejected(
        FK_VIOLATION,
        "settlement_allocation_freight_fk",
        () ->
            insert(
                s,
                "settlement_allocation",
                allocation(
                    f.collectionX(),
                    f.companyX(),
                    "FREIGHT_INVOICE",
                    Map.of("freight_invoice_id", f.freightA()))));
    rejected(
        FK_VIOLATION,
        "settlement_allocation_document_fk",
        () ->
            insert(
                s,
                "settlement_allocation",
                allocation(
                    f.collectionX(),
                    f.companyX(),
                    "ACCOUNT_DOCUMENT",
                    Map.of("account_document_id", f.documentA()))));
    rejected(
        FK_VIOLATION,
        "settlement_allocation_warehouse_fk",
        () ->
            insert(
                s,
                "settlement_allocation",
                allocation(
                    f.paymentA(),
                    f.companyA(),
                    "WAREHOUSE_INVOICE",
                    Map.of("warehouse_invoice_id", f.warehouseX()))));
    rejected(
        FK_VIOLATION,
        "settlement_allocation_opening_fk",
        () ->
            insert(
                s,
                "settlement_allocation",
                allocation(
                    f.paymentA(),
                    f.companyA(),
                    "OPENING_INVOICE",
                    Map.of("opening_invoice_id", f.openingX()))));
    // Geçerli: her tür kendi şirketinde; silinmiş eşleşme aynı hedefi yeniden engellemez;
    // iptal edilmiş settlement'ın satırı kalır (S-3, geçerlilik sorguda).
    inRolledBackTransaction(
        () -> {
          insert(
              s,
              "settlement_allocation",
              allocation(
                  f.paymentA(),
                  f.companyA(),
                  "PURCHASE_INVOICE",
                  Map.of("purchase_invoice_id", f.purchaseA(), "deleted", true)));
          insert(
              s,
              "settlement_allocation",
              allocation(
                  f.paymentA(),
                  f.companyA(),
                  "PURCHASE_INVOICE",
                  Map.of("purchase_invoice_id", f.purchaseA())));
          insert(
              s,
              "settlement_allocation",
              allocation(
                  f.paymentA(),
                  f.companyA(),
                  "FREIGHT_INVOICE",
                  Map.of("freight_invoice_id", f.freightA())));
          insert(
              s,
              "settlement_allocation",
              allocation(
                  f.reversedCollection(),
                  f.companyA(),
                  "ACCOUNT_DOCUMENT",
                  Map.of("account_document_id", f.documentA())));
          insert(
              s,
              "settlement_allocation",
              allocation(
                  f.collectionX(),
                  f.companyX(),
                  "WAREHOUSE_INVOICE",
                  Map.of("warehouse_invoice_id", f.warehouseX())));
          insert(
              s,
              "settlement_allocation",
              allocation(
                  f.collectionX(),
                  f.companyX(),
                  "OPENING_INVOICE",
                  Map.of("opening_invoice_id", f.openingX())));
          assertThat(count(s, "settlement_allocation")).isEqualTo(6);
        });

    // Geri alınan işlemlerden kalıntı yok.
    assertThat(count(s, "settlement_allocation")).isZero();
    assertThat(count(s, "settlement")).isEqualTo(10);
  }

  // M-4
  @Test
  void yeniEntityVeRepositoryEslemeleriSemaylaUyumludur() throws Exception {
    World w = world("stl-mig");
    UUID companyA = w.companyAId();
    UUID a1 = UUID.fromString(w.a1());
    UUID fundA1 = UUID.fromString(w.fundA1());
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    UUID customerBank =
        insert(
            w.schema(),
            "account_bank_account",
            Map.of("account_id", customer, "account_number_enc", "e", "bank_name", "Ziraat"));
    Map<AllocationTargetType, UUID> targets =
        invoices(w.schema(), companyA, a1, a1, companyA, a1, customer, supplier);
    Map<String, UUID> ids = new HashMap<>();

    inTenant(
        w,
        () -> {
          Settlement card =
              settlements.save(
                  new Settlement(
                          SettlementType.PAYMENT,
                          SettlementMethod.BANK,
                          customer,
                          a1,
                          companyA,
                          fundA1,
                          null,
                          null,
                          null,
                          Money.of("120", "TRY"),
                          TODAY,
                          "Kart ödemesi",
                          "idem-stl-card")
                      .withDetails("DEK-1", SettlementChannel.CREDIT_CARD, customerBank, null));
          ids.put("card", card.getId());
          Settlement old =
              settlements.save(
                  new Settlement(
                      SettlementType.PAYMENT,
                      SettlementMethod.CASH,
                      customer,
                      a1,
                      companyA,
                      fundA1,
                      null,
                      null,
                      null,
                      Money.of("100", "TRY"),
                      TODAY.minusDays(1),
                      null,
                      null));
          assertThat(old.getChannel()).isNull();
          old.markReversed(TODAY.minusDays(1), "  Yanlış tutar  ");
          ids.put("old", old.getId());
          settlements.flush();
          for (AllocationTargetType type : AllocationTargetType.values()) {
            SettlementAllocation allocation =
                SettlementAllocation.of(
                    card.getId(), companyA, type, targets.get(type), Money.of("10.5", "TRY"));
            allocations.save(allocation);
            ids.put(type.name(), allocation.getId());
          }
        });

    inTenant(
        w,
        () -> {
          Settlement corrected =
              settlements.save(
                  new Settlement(
                          SettlementType.PAYMENT,
                          SettlementMethod.BANK,
                          customer,
                          a1,
                          companyA,
                          fundA1,
                          null,
                          null,
                          null,
                          Money.of("110", "TRY"),
                          TODAY.minusDays(1),
                          null,
                          "idem-stl-fix")
                      .withDetails(null, null, null, ids.get("old")));
          ids.put("corrected", corrected.getId());
          // Banka dışı yöntemde kanal savunmacı olarak boş kalır; gerekçe yoksa boş saklanır.
          Settlement cash =
              new Settlement(
                      SettlementType.COLLECTION,
                      SettlementMethod.CASH,
                      null,
                      a1,
                      companyA,
                      fundA1,
                      null,
                      null,
                      null,
                      Money.of("5", "TRY"),
                      TODAY,
                      null,
                      null)
                  .withDetails("F-1", SettlementChannel.CREDIT_CARD, null, null);
          assertThat(cash.getChannel()).isNull();
          cash.markReversed(TODAY, "   ");
          assertThat(cash.getReverseReason()).isNull();
          cash.markReversed(TODAY, null);
          assertThat(cash.getReverseReason()).isNull();
          settlements.save(cash);
          ids.put("cash", cash.getId());
        });

    inTenant(
        w,
        () -> {
          Settlement card = settlements.findById(ids.get("card")).orElseThrow();
          assertThat(card.getDocumentNo()).isEqualTo("DEK-1");
          assertThat(card.getChannel()).isEqualTo(SettlementChannel.CREDIT_CARD);
          assertThat(card.getCounterpartyBankAccountId()).isEqualTo(customerBank);
          assertThat(card.getCorrectsSettlementId()).isNull();
          assertThat(card.getReverseReason()).isNull();
          assertThat(card.getReversedOn()).isNull();
          assertThat(card.getIdempotencyKey()).isEqualTo("idem-stl-card");
          assertThat(card.getStatus()).isEqualTo(SettlementStatus.POSTED);

          Settlement old = settlements.findById(ids.get("old")).orElseThrow();
          assertThat(old.getStatus()).isEqualTo(SettlementStatus.REVERSED);
          assertThat(old.getReversedOn()).isEqualTo(TODAY.minusDays(1));
          assertThat(old.getReverseReason()).isEqualTo("Yanlış tutar");
          assertThat(old.getChannel()).isNull();

          Settlement corrected = settlements.findByCorrectsSettlementId(old.getId()).orElseThrow();
          assertThat(corrected.getId()).isEqualTo(ids.get("corrected"));
          // Banka yönteminde kanal verilmezse havale/EFT.
          assertThat(corrected.getChannel()).isEqualTo(SettlementChannel.TRANSFER);
          assertThat(corrected.getDocumentNo()).isNull();
          assertThat(settlements.findByCorrectsSettlementId(card.getId())).isEmpty();

          Settlement cash = settlements.findById(ids.get("cash")).orElseThrow();
          assertThat(cash.getDocumentNo()).isEqualTo("F-1");
          assertThat(cash.getChannel()).isNull();
          assertThat(cash.getReversedOn()).isEqualTo(TODAY);

          List<SettlementAllocation> rows =
              allocations.findBySettlementIdAndDeletedFalse(card.getId());
          assertThat(rows).hasSize(AllocationTargetType.values().length);
          for (SettlementAllocation row : rows) {
            assertThat(row.getId()).isEqualTo(ids.get(row.getTargetType().name()));
            assertThat(row.getSettlementId()).isEqualTo(card.getId());
            assertThat(row.getCompanyId()).isEqualTo(companyA);
            assertThat(row.getTargetId()).isEqualTo(targets.get(row.getTargetType()));
            assertThat(row.getMoney()).isEqualTo(Money.of("10.5", "TRY"));
            assertThat(row.getAmount()).isEqualByComparingTo("10.5");
            assertThat(row.getCurrency()).isEqualTo("TRY");
            assertThat(row.isDeleted()).isFalse();
            assertThat(row.getCreatedBy()).isNotBlank();
            assertOnlyTargetColumn(row);
          }
          rows.get(0).markDeleted();
        });

    inTenant(
        w,
        () -> {
          assertThat(allocations.findBySettlementIdAndDeletedFalse(ids.get("card")))
              .hasSize(AllocationTargetType.values().length - 1);
          assertThat(allocations.findAll()).hasSize(AllocationTargetType.values().length);
          assertThat(bankAccounts.findByIdAndAccountIdAndDeletedFalse(customerBank, customer))
              .isPresent();
          assertThat(bankAccounts.findByIdAndAccountIdAndDeletedFalse(customerBank, supplier))
              .isEmpty();
          assertThat(settlements.existsVehicleExpenseLink(ids.get("card"))).isFalse();
        });

    // Araç gideri bağı: silinmiş gider bağ sayılmaz.
    UUID vehicle = insert(w.schema(), "vehicle", Map.of("plate", "34ABC01"));
    insert(
        w.schema(),
        "vehicle_expense",
        Map.of(
            "vehicle_id",
            vehicle,
            "branch_id",
            a1,
            "company_id",
            companyA,
            "settlement_id",
            ids.get("cash"),
            "deleted",
            true));
    insert(
        w.schema(),
        "vehicle_expense",
        Map.of(
            "vehicle_id",
            vehicle,
            "branch_id",
            a1,
            "company_id",
            companyA,
            "settlement_id",
            ids.get("card")));
    inTenant(
        w,
        () -> {
          assertThat(settlements.existsVehicleExpenseLink(ids.get("card"))).isTrue();
          assertThat(settlements.existsVehicleExpenseLink(ids.get("cash"))).isFalse();
        });

    // Yeni sabitler (B2–B4 kullanır).
    assertThat(SettlementLockReason.valueOf("TRANSFERRED")).isNotNull();
    assertThat(SettlementLockReason.values()).hasSize(8);
    assertThat(DailyReportSort.values())
        .containsExactly(DailyReportSort.TIME_ASC, DailyReportSort.TIME_DESC);
    assertThat(AuditEvent.valueOf("SETTLEMENT_CORRECTED")).isNotNull();
    assertThat(AuditEvent.valueOf("SETTLEMENT_REVERSED")).isNotNull();
  }

  private static void assertOnlyTargetColumn(SettlementAllocation row) {
    Map<AllocationTargetType, UUID> columns = new EnumMap<>(AllocationTargetType.class);
    columns.put(AllocationTargetType.PURCHASE_INVOICE, row.getPurchaseInvoiceId());
    columns.put(AllocationTargetType.FREIGHT_INVOICE, row.getFreightInvoiceId());
    columns.put(AllocationTargetType.WAREHOUSE_INVOICE, row.getWarehouseInvoiceId());
    columns.put(AllocationTargetType.OPENING_INVOICE, row.getOpeningInvoiceId());
    columns.put(AllocationTargetType.ACCOUNT_DOCUMENT, row.getAccountDocumentId());
    columns.forEach(
        (type, value) -> {
          if (type == row.getTargetType()) {
            assertThat(value).as(type.name()).isNotNull();
          } else {
            assertThat(value).as(type.name()).isNull();
          }
        });
  }

  // --- doğrulama yardımcıları

  /** G-1 ve G-2. */
  private void assertGuarantees(String s) {
    assertThat(count(s, "settlement where status = 'REVERSED' and reversed_on is null")).isZero();
    assertThat(
            count(
                s,
                "settlement where channel is not null or document_no is not null"
                    + " or corrects_settlement_id is not null"
                    + " or counterparty_bank_account_id is not null"))
        .isZero();
  }

  private LocalDate reversedOn(String s, UUID settlement) {
    return jdbc.queryForObject(
        q(s, "select reversed_on from %s.settlement where id = ?"), LocalDate.class, settlement);
  }

  // --- kurulum

  /**
   * Göç öncesi (V34) veri: varsayılan şirket A (iş yerleri A1, A2), ikinci şirket X (X1, X2);
   * müşteri, tedarikçi ve karşılıklı grup carileri; iki şirkette kasa ve banka; nakit/banka ödeme
   * ve tahsilatlar; cari ve fon ters satırlı iptal edilmiş tahsilat, yalnız fon ters satırlı
   * carisiz araç gideri ödemesi, ters satırı hiç olmayan iptal; şirketler arası virman bacakları;
   * çekli tahsilat; alış, navlun, depo, açılış faturası ve Borç Ekle belgesi.
   */
  private record Fixture(
      UUID companyA,
      UUID companyX,
      UUID branchA,
      UUID branchA2,
      UUID branchX,
      UUID branchX2,
      UUID customer,
      UUID supplier,
      UUID cashA,
      UUID bankA,
      UUID cashX,
      UUID bankX,
      UUID customerBank,
      UUID paymentA,
      UUID collectionX,
      UUID reversedCollection,
      UUID reversedExpense,
      UUID reversedBare,
      UUID purchaseA,
      UUID freightA,
      UUID warehouseX,
      UUID openingX,
      UUID documentA) {}

  private Fixture fixture(String s) {
    UUID companyA = defaultCompany(s);
    UUID companyX =
        insert(
            s,
            "company",
            Map.of(
                "code", "CODE_X1", "title", "X Lojistik", "short_name", "X", "is_default", false));
    UUID branchA = insert(s, "branch", Map.of("code", "A1", "name", "A1", "company_id", companyA));
    UUID branchA2 = insert(s, "branch", Map.of("code", "A2", "name", "A2", "company_id", companyA));
    UUID branchX = insert(s, "branch", Map.of("code", "X1", "name", "X1", "company_id", companyX));
    UUID branchX2 = insert(s, "branch", Map.of("code", "X2", "name", "X2", "company_id", companyX));

    UUID customer = account(s, "MUS-1", "CUSTOMER", "MUSTERI", Map.of());
    UUID supplier = account(s, "TED-1", "SUPPLIER", "GENEL", Map.of());
    UUID groupX =
        account(
            s, "GS-X", "INTERCOMPANY", "GRUP_SIRKETI", Map.of("represents_company_id", companyX));
    UUID groupA =
        account(
            s, "GS-A", "INTERCOMPANY", "GRUP_SIRKETI", Map.of("represents_company_id", companyA));
    UUID customerBank =
        insert(
            s,
            "account_bank_account",
            Map.of("account_id", customer, "account_number_enc", "e", "bank_name", "Ziraat"));
    insert(
        s,
        "account_bank_account",
        Map.of("account_id", supplier, "account_number_enc", "e", "bank_name", "Garanti"));

    UUID cashA = insert(s, "fund_account", fund(companyA, branchA, "KASA-A", "CASH"));
    UUID bankA = insert(s, "fund_account", fund(companyA, branchA2, "BNK-A", "BANK"));
    UUID cashX = insert(s, "fund_account", fund(companyX, branchX2, "KASA-X", "CASH"));
    UUID bankX = insert(s, "fund_account", fund(companyX, branchX, "BNK-X", "BANK"));

    // Nakit ödeme (A) ve banka tahsilatı (A2), banka tahsilatı (X) ve nakit ödeme (X2).
    UUID paymentA =
        posted(s, "PAYMENT", "CASH", supplier, branchA, companyA, cashA, "100", Map.of());
    posted(s, "COLLECTION", "BANK", customer, branchA2, companyA, bankA, "300", Map.of());
    UUID collectionX =
        posted(s, "COLLECTION", "BANK", customer, branchX, companyX, bankX, "80", Map.of());
    posted(s, "PAYMENT", "CASH", supplier, branchX2, companyX, cashX, "50", Map.of());

    // İptal edilmiş nakit tahsilat: cari ters satırı D+3, fon ters satırı D+4 (cari önce gelir).
    UUID reversedCollection =
        insert(
            s,
            "settlement",
            settlementRow(
                "COLLECTION",
                "CASH",
                customer,
                branchA,
                companyA,
                cashA,
                "40",
                Map.of("status", "REVERSED")));
    UUID original =
        accountTx(
            s, customer, branchA, companyA, "CREDIT", "40", DATE, "SETTLEMENT", reversedCollection);
    accountTx(
        s, customer, branchA, companyA, "DEBIT", "40", DATE.plusDays(3), "REVERSAL", original);
    UUID fundOriginal =
        fundTx(s, cashA, companyA, "IN", "40", DATE, "SETTLEMENT", reversedCollection);
    fundTx(s, cashA, companyA, "OUT", "40", DATE.plusDays(4), "REVERSAL", fundOriginal);

    // İptal edilmiş carisiz araç gideri ödemesi: yalnız fon ters satırı (D+2).
    UUID reversedExpense =
        insert(
            s,
            "settlement",
            settlementRow(
                "PAYMENT",
                "CASH",
                null,
                branchA,
                companyA,
                cashA,
                "25",
                Map.of("status", "REVERSED")));
    UUID expenseFund = fundTx(s, cashA, companyA, "OUT", "25", DATE, "SETTLEMENT", reversedExpense);
    fundTx(s, cashA, companyA, "IN", "25", DATE.plusDays(2), "REVERSAL", expenseFund);
    UUID vehicle = insert(s, "vehicle", Map.of("plate", "34ABC01"));
    insert(
        s,
        "vehicle_expense",
        Map.of(
            "vehicle_id",
            vehicle,
            "branch_id",
            branchA,
            "company_id",
            companyA,
            "fund_account_id",
            cashA,
            "settlement_id",
            reversedExpense,
            "amount",
            new BigDecimal("25"),
            "currency",
            "TRY"));

    // Ters satırı olmayan iptal: son güncelleme 20.01 22:30 UTC = 21.01 İstanbul.
    UUID reversedBare =
        insert(
            s,
            "settlement",
            settlementRow(
                "PAYMENT",
                "CASH",
                supplier,
                branchX2,
                companyX,
                cashX,
                "10",
                Map.of(
                    "status",
                    "REVERSED",
                    "updated_at",
                    OffsetDateTime.of(2026, 1, 20, 22, 30, 0, 0, ZoneOffset.UTC))));

    // Şirketler arası virman bacakları (A → X).
    UUID icPayment =
        posted(s, "PAYMENT", "BANK", groupX, branchA2, companyA, bankA, "60", Map.of());
    UUID icCollection =
        posted(s, "COLLECTION", "BANK", groupA, branchX, companyX, bankX, "60", Map.of());
    insert(
        s,
        "intercompany_transfer",
        Map.ofEntries(
            Map.entry("code", "SVR-2026-000001"),
            Map.entry("transfer_type", "EFT"),
            Map.entry("reason_type", "DEBT_PAID"),
            Map.entry("transfer_date", DATE),
            Map.entry("from_company_id", companyA),
            Map.entry("to_company_id", companyX),
            Map.entry("from_branch_id", branchA2),
            Map.entry("to_branch_id", branchX),
            Map.entry("from_fund_id", bankA),
            Map.entry("to_fund_id", bankX),
            Map.entry("amount", new BigDecimal("60")),
            Map.entry("currency", "TRY"),
            Map.entry("payment_settlement_id", icPayment),
            Map.entry("collection_settlement_id", icCollection)));

    // Çekli tahsilat (fon hareketi yok).
    UUID check =
        insert(
            s,
            "instrument",
            Map.ofEntries(
                Map.entry("kind", "CHECK"),
                Map.entry("direction", "RECEIVED"),
                Map.entry("number", "1234567"),
                Map.entry("account_id", customer),
                Map.entry("branch_id", branchA),
                Map.entry("company_id", companyA),
                Map.entry("amount", new BigDecimal("70")),
                Map.entry("currency", "TRY"),
                Map.entry("due_date", DATE.plusDays(30)),
                Map.entry("status", "PORTFOLIO")));
    UUID checkCollection =
        insert(
            s,
            "settlement",
            settlementRow(
                "COLLECTION",
                "CHECK",
                customer,
                branchA,
                companyA,
                null,
                "70",
                Map.of("instrument_id", check)));
    accountTx(s, customer, branchA, companyA, "CREDIT", "70", DATE, "SETTLEMENT", checkCollection);

    Map<AllocationTargetType, UUID> invoices =
        invoices(s, companyA, branchA, branchA2, companyX, branchX, customer, supplier);
    accountTx(
        s,
        supplier,
        branchA,
        companyA,
        "CREDIT",
        "500",
        DATE,
        "PURCHASE_INVOICE",
        invoices.get(AllocationTargetType.PURCHASE_INVOICE));
    accountTx(
        s,
        customer,
        branchA2,
        companyA,
        "DEBIT",
        "900",
        DATE,
        "FREIGHT_INVOICE",
        invoices.get(AllocationTargetType.FREIGHT_INVOICE));
    accountTx(
        s,
        customer,
        branchA,
        companyA,
        "DEBIT",
        "150",
        DATE,
        "ACCOUNT_DOCUMENT",
        invoices.get(AllocationTargetType.ACCOUNT_DOCUMENT));
    accountTx(
        s,
        customer,
        branchX,
        companyX,
        "DEBIT",
        "250",
        DATE,
        "WAREHOUSE_INVOICE",
        invoices.get(AllocationTargetType.WAREHOUSE_INVOICE));

    return new Fixture(
        companyA,
        companyX,
        branchA,
        branchA2,
        branchX,
        branchX2,
        customer,
        supplier,
        cashA,
        bankA,
        cashX,
        bankX,
        customerBank,
        paymentA,
        collectionX,
        reversedCollection,
        reversedExpense,
        reversedBare,
        invoices.get(AllocationTargetType.PURCHASE_INVOICE),
        invoices.get(AllocationTargetType.FREIGHT_INVOICE),
        invoices.get(AllocationTargetType.WAREHOUSE_INVOICE),
        invoices.get(AllocationTargetType.OPENING_INVOICE),
        invoices.get(AllocationTargetType.ACCOUNT_DOCUMENT));
  }

  /**
   * Beş hedef türünde birer belge: alış faturası, navlun faturası ve Borç Ekle belgesi şirket A'da
   * ({@code branchA}/{@code branchA2}), depo ve açılış faturası {@code companyX}'te.
   */
  private Map<AllocationTargetType, UUID> invoices(
      String s,
      UUID companyA,
      UUID branchA,
      UUID branchA2,
      UUID companyX,
      UUID branchX,
      UUID customer,
      UUID supplier) {
    Map<AllocationTargetType, UUID> ids = new EnumMap<>(AllocationTargetType.class);
    ids.put(
        AllocationTargetType.PURCHASE_INVOICE,
        insert(
            s,
            "purchase_invoice",
            Map.ofEntries(
                Map.entry("account_id", supplier),
                Map.entry("branch_id", branchA),
                Map.entry("company_id", companyA),
                Map.entry("number", "AF-1"),
                Map.entry("total_amount", new BigDecimal("500")),
                Map.entry("currency", "TRY"),
                Map.entry("status", "OPEN"))));
    UUID shipment =
        insert(
            s,
            "shipment",
            Map.of("number", "SEV-1", "account_id", customer, "branch_id", branchA2));
    ids.put(
        AllocationTargetType.FREIGHT_INVOICE,
        insert(
            s,
            "freight_invoice",
            Map.ofEntries(
                Map.entry("number", "NF-1"),
                Map.entry("shipment_id", shipment),
                Map.entry("account_id", customer),
                Map.entry("branch_id", branchA2),
                Map.entry("company_id", companyA),
                Map.entry("total_amount", new BigDecimal("900")),
                Map.entry("currency", "TRY"),
                Map.entry("status", "ISSUED"))));
    UUID warehouse =
        insert(s, "warehouse", Map.of("code", "DEPO-1", "name", "Depo", "branch_id", branchX));
    UUID contract =
        insert(
            s,
            "warehouse_contract",
            Map.of("account_id", customer, "warehouse_id", warehouse, "currency", "TRY"));
    ids.put(
        AllocationTargetType.WAREHOUSE_INVOICE,
        insert(
            s,
            "warehouse_invoice",
            Map.ofEntries(
                Map.entry("number", "DF-1"),
                Map.entry("contract_id", contract),
                Map.entry("account_id", customer),
                Map.entry("branch_id", branchX),
                Map.entry("company_id", companyX),
                Map.entry("total_amount", new BigDecimal("250")),
                Map.entry("currency", "TRY"),
                Map.entry("status", "ISSUED"))));
    ids.put(
        AllocationTargetType.OPENING_INVOICE,
        insert(
            s,
            "opening_invoice",
            Map.ofEntries(
                Map.entry("account_id", customer),
                Map.entry("branch_id", branchX),
                Map.entry("company_id", companyX),
                Map.entry("kind", "RECEIVABLE"),
                Map.entry("number", "AC-1"),
                Map.entry("total_amount", new BigDecimal("75")),
                Map.entry("currency", "TRY"),
                Map.entry("status", "OPEN"))));
    ids.put(
        AllocationTargetType.ACCOUNT_DOCUMENT,
        insert(
            s,
            "account_document",
            Map.ofEntries(
                Map.entry("account_id", customer),
                Map.entry("branch_id", branchA),
                Map.entry("company_id", companyA),
                Map.entry("side", "RECEIVABLE"),
                Map.entry("document_type", "SATIS_FATURASI"),
                Map.entry("document_no", "BE-1"),
                Map.entry("document_date", DATE),
                Map.entry("amount", new BigDecimal("150")),
                Map.entry("currency", "TRY"),
                Map.entry("payment_method", "BANK"),
                Map.entry("reflect_to_ledger", true),
                Map.entry("ledger_amount", new BigDecimal("150")),
                Map.entry("status", "OPEN"))));
    return ids;
  }

  private UUID account(
      String s, String code, String type, String subGroup, Map<String, Object> extra) {
    Map<String, Object> values = new HashMap<>();
    values.put("code", code);
    values.put("name", code);
    values.put("type", type);
    values.put("sub_group", subGroup);
    values.putAll(extra);
    return insert(s, "account", values);
  }

  private static Map<String, Object> fund(UUID company, UUID branch, String code, String kind) {
    Map<String, Object> values = new HashMap<>();
    values.put("code", code);
    values.put("name", code);
    values.put("kind", kind);
    values.put("currency", "TRY");
    values.put("branch_id", branch);
    values.put("company_id", company);
    return values;
  }

  /** POSTED settlement + cari satırı (cariliyse) + fon satırı (fonluysa). */
  private UUID posted(
      String s,
      String type,
      String method,
      UUID account,
      UUID branch,
      UUID company,
      UUID fund,
      String amount,
      Map<String, Object> extra) {
    UUID id =
        insert(
            s,
            "settlement",
            settlementRow(type, method, account, branch, company, fund, amount, extra));
    boolean payment = type.equals("PAYMENT");
    if (account != null) {
      accountTx(
          s,
          account,
          branch,
          company,
          payment ? "DEBIT" : "CREDIT",
          amount,
          DATE,
          "SETTLEMENT",
          id);
    }
    if (fund != null) {
      fundTx(s, fund, company, payment ? "OUT" : "IN", amount, DATE, "SETTLEMENT", id);
    }
    return id;
  }

  private static Map<String, Object> settlementRow(
      String type,
      String method,
      UUID account,
      UUID branch,
      UUID company,
      UUID fund,
      String amount,
      Map<String, Object> extra) {
    Map<String, Object> values = new HashMap<>();
    values.put("type", type);
    values.put("method", method);
    values.put("account_id", account);
    values.put("branch_id", branch);
    values.put("company_id", company);
    values.put("fund_account_id", fund);
    values.put("amount", new BigDecimal(amount));
    values.put("currency", "TRY");
    values.put("settlement_date", DATE);
    values.put("status", "POSTED");
    values.putAll(extra);
    return values;
  }

  /** V36 şemasında (M-3) eklenen settlement satırı: nakit, carisiz, POSTED. */
  private static Map<String, Object> settlement(
      UUID branch, UUID company, UUID fund, Map<String, Object> extra) {
    return settlementRow("PAYMENT", "CASH", null, branch, company, fund, "10", extra);
  }

  private static Map<String, Object> allocation(
      UUID settlement, UUID company, String targetType, Map<String, Object> extra) {
    Map<String, Object> values = new HashMap<>();
    values.put("settlement_id", settlement);
    values.put("company_id", company);
    values.put("target_type", targetType);
    values.put("amount", BigDecimal.TEN);
    values.put("currency", "TRY");
    values.putAll(extra);
    return values;
  }

  private UUID accountTx(
      String s,
      UUID account,
      UUID branch,
      UUID company,
      String direction,
      String amount,
      LocalDate date,
      String sourceType,
      UUID sourceId) {
    Map<String, Object> values = new HashMap<>();
    values.put("account_id", account);
    values.put("branch_id", branch);
    values.put("company_id", company);
    values.put("direction", direction);
    values.put("amount", new BigDecimal(amount));
    values.put("currency", "TRY");
    values.put("exchange_rate", BigDecimal.ONE);
    values.put("rate_date", date);
    values.put("tl_amount", new BigDecimal(amount));
    values.put("transaction_date", date);
    values.put("description", sourceType);
    values.put("source_type", sourceType);
    values.put("source_id", sourceId);
    return insert(s, "account_transaction", values);
  }

  private UUID fundTx(
      String s,
      UUID fund,
      UUID company,
      String direction,
      String amount,
      LocalDate date,
      String sourceType,
      UUID sourceId) {
    Map<String, Object> values = new HashMap<>();
    values.put("fund_account_id", fund);
    values.put("company_id", company);
    values.put("direction", direction);
    values.put("amount", new BigDecimal(amount));
    values.put("currency", "TRY");
    values.put("exchange_rate", BigDecimal.ONE);
    values.put("rate_date", date);
    values.put("tl_amount", new BigDecimal(amount));
    values.put("transaction_date", date);
    values.put("description", sourceType);
    values.put("source_type", sourceType);
    values.put("source_id", sourceId);
    return insert(s, "fund_transaction", values);
  }

  private UUID defaultCompany(String s) {
    return jdbc.queryForObject(q(s, "select id from %s.company where is_default"), UUID.class);
  }

  /**
   * Ekleme bir işlem içinde yapılır; kısıt ihlaliyle işlem geri alınır, kalıntı kalmaz. Beklenen
   * SQLSTATE ve kısıt adı doğrulanır.
   */
  private void rejected(String sqlState, String constraint, Runnable insert) {
    assertThatThrownBy(() -> inRolledBackTransaction(insert))
        .isInstanceOf(DataIntegrityViolationException.class)
        .hasMessageContaining(constraint)
        .satisfies(
            e -> {
              Throwable cause = ((DataIntegrityViolationException) e).getMostSpecificCause();
              assertThat(cause).isInstanceOf(SQLException.class);
              assertThat(((SQLException) cause).getSQLState()).as(constraint).isEqualTo(sqlState);
            });
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

  private String schemaAtV34() {
    String schema = "smig_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    flyway(schema, "34").migrate();
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
   * FundMigrationIT} deseni).
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
