package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.sql.SQLException;
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
import org.ece.blackrose.finance.domain.Expense;
import org.ece.blackrose.finance.domain.ExpenseItem;
import org.ece.blackrose.finance.domain.ExpenseLine;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.ExpenseContextType;
import org.ece.blackrose.finance.domain.FinanceTypes.ExpenseDepartment;
import org.ece.blackrose.finance.domain.FinanceTypes.ExpensePaymentMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.ExpenseStatus;
import org.ece.blackrose.finance.repository.ExpenseRepositories.ExpenseLineRepository;
import org.ece.blackrose.finance.repository.ExpenseRepositories.ExpenseRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.ExpenseItemRepository;
import org.ece.blackrose.shipment.domain.ShipmentTypes.CostKind;
import org.ece.blackrose.shipment.domain.ShipmentTypes.TripCostStatus;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.TripCostRepository;
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
 * Faz 12.7 göçü (tenant V39 Z20, V40 Z21) boş ve dolu şemada hatasız çalışır; taşeron gider
 * durumları ve belge tarihi doldurulur; aynı adlı kalemler ayrıştırılır; sistem kalemleri ve genel
 * masraf türleri tohumlanır; bağlam ve şirket kısıtları veritabanında korunur; yeni entity ve
 * repository eşlemeleri şemayla uyumludur (docs/zto-finans/uygulama/12.7_TASARIM.md §1.3, §2,
 * §6.1).
 */
class ExpenseMigrationIT extends AccountTestSupport {

  private static final LocalDate DATE = LocalDate.of(2026, 1, 15);
  private static final OffsetDateTime TIME =
      OffsetDateTime.of(2026, 1, 15, 9, 0, 0, 0, ZoneOffset.UTC);

  private static final String FK_VIOLATION = "23503";
  private static final String UNIQUE_VIOLATION = "23505";
  private static final String CHECK_VIOLATION = "23514";

  private static final List<String> CONSTRAINTS =
      List.of(
          "trip_cost_vat_ck",
          "trip_cost_withholding_ck",
          "trip_cost_deduction_ck",
          "trip_cost_payable_ck",
          "trip_cost_status_ck",
          "trip_cost_reversed_ck",
          "trip_cost_rate_ck",
          "shipment_leg_transport_mode_ck",
          "expense_id_company_uq",
          "expense_branch_company_fk",
          "expense_settlement_company_fk",
          "expense_context_type_ck",
          "expense_context_ck",
          "expense_payment_method_ck",
          "expense_supplier_ck",
          "expense_settlement_ck",
          "expense_department_ck",
          "expense_currency_ck",
          "expense_amounts_ck",
          "expense_due_ck",
          "expense_status_ck",
          "expense_reversed_ck",
          "expense_source_ck",
          "expense_line_no_uq",
          "expense_line_amounts_ck");

  private static final List<String> INDEXES =
      List.of(
          "trip_cost_account_idx",
          "trip_cost_leg_kind_idx",
          "expense_item_name_active_uq",
          "expense_company_date_idx",
          "expense_item_date_idx",
          "expense_supplier_idx",
          "expense_replaces_idx",
          "expense_source_uq",
          "expense_idempotency_uq");

  private static final List<String> SYSTEM_CODES =
      List.of("FUEL", "TOLL", "PER_DIEM", "REPAIR", "FINE", "INSURANCE", "TIRE");

  @Autowired DataSource dataSource;
  @Autowired TenantMigrator migrator;
  @Autowired PlatformTransactionManager transactionManager;

  @Autowired ExpenseRepository expenses;
  @Autowired ExpenseLineRepository expenseLines;
  @Autowired ExpenseItemRepository items;
  @Autowired TripCostRepository tripCosts;

  // Boş kiracı
  @Test
  void bosKiracidaGocGecerVeTumKisitVeIndekslerOlusur() {
    String s = schemaAtV38();
    migrator.migrate(s);

    assertThat(
            jdbc.queryForList(
                q(
                    s,
                    "select version from %s.flyway_schema_history where success"
                        + " order by installed_rank"),
                String.class))
        .contains("39", "40");
    assertThat(count(s, "expense")).isZero();
    assertThat(count(s, "expense_line")).isZero();
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
    assertSeeds(s);
    // İkinci çalıştırma bir şey yapmaz.
    assertThat(flyway(s, null).migrate().migrationsExecuted).isZero();
    flyway(s, null).validate();
  }

  // §1.3 dolu kiracı
  @Test
  void doluKiracidaDurumTarihVeKalemAdlariDuzenlenir() {
    String s = schemaAtV38();
    Fixture f = fixture(s);

    migrator.migrate(s);

    assertThat(value(s, "trip_cost", f.postedCost(), "status")).isEqualTo("POSTED");
    assertThat(value(s, "trip_cost", f.openCost(), "status")).isEqualTo("OPEN");
    assertThat(count(s, "trip_cost where cost_date is null")).isZero();
    assertThat(
            jdbc.queryForObject(
                q(s, "select cost_date from %s.trip_cost where id = ?"),
                LocalDate.class,
                f.openCost()))
        .isEqualTo(DATE);
    assertThat(
            count(
                s,
                "trip_cost where vat_amount = 0 and withholding_amount = 0"
                    + " and deduction_amount = 0 and replaced_by_id is null"
                    + " and reversed_on is null"))
        .isEqualTo(2);
    // amount/tl_amount değişmez.
    assertThat(count(s, "trip_cost where amount = 750 and tl_amount = 750")).isEqualTo(2);

    assertThat(value(s, "expense_item", f.firstItem(), "name")).isEqualTo("Kirtasiye");
    assertThat(value(s, "expense_item", f.secondItem(), "name")).isEqualTo("kirtasiye (KRT-2)");
    assertThat(count(s, "expense_item where is_system = false and active = true")).isEqualTo(2);
    assertSeeds(s);

    assertThat(value(s, "shipment_leg", f.leg(), "transport_mode")).isEqualTo("ROAD");
  }

  // §1.3 ek denetimler
  @Test
  void kisitlarVeritabanindaKorur() {
    String s = schemaAtV38();
    Fixture f = fixture(s);
    migrator.migrate(s);

    // Geçerli GENERAL nakit masrafı ve şirketiyle uyumlu settlement kabul edilir.
    inRolledBackTransaction(
        () -> {
          UUID settlement = settlement(s, f.companyA(), f.branchA(), f.cashA());
          insert(s, "expense", expense(f, Map.of("settlement_id", settlement)));
        });

    // Bağlam: GENERAL + araç; VEHICLE + yalnız sefer.
    rejected(
        CHECK_VIOLATION,
        "expense_context_ck",
        () -> insert(s, "expense", expense(f, Map.of("vehicle_id", UUID.randomUUID()))));
    rejected(
        CHECK_VIOLATION,
        "expense_context_ck",
        () ->
            insert(
                s,
                "expense",
                expense(f, Map.of("context_type", "VEHICLE", "shipment_id", UUID.randomUUID()))));
    // Cari masrafta tedarikçi zorunlu.
    rejected(
        CHECK_VIOLATION,
        "expense_supplier_ck",
        () -> insert(s, "expense", expense(f, Map.of("payment_method", "ACCOUNT"))));
    rejected(
        CHECK_VIOLATION,
        "expense_department_ck",
        () -> insert(s, "expense", expense(f, Map.of("department", "PRODUCTION"))));
    // Başka şirketin settlement'ı reddedilir.
    rejected(
        FK_VIOLATION,
        "expense_settlement_company_fk",
        () -> {
          UUID other = settlement(s, f.companyX(), f.branchX(), f.cashX());
          insert(s, "expense", expense(f, Map.of("settlement_id", other)));
        });
    // Başka şirketin iş yeri reddedilir.
    rejected(
        FK_VIOLATION,
        "expense_branch_company_fk",
        () -> insert(s, "expense", expense(f, Map.of("branch_id", f.branchX()))));
    // Etkin kalem adı büyük/küçük harf duyarsız tekil.
    rejected(
        UNIQUE_VIOLATION,
        "expense_item_name_active_uq",
        () -> insert(s, "expense_item", item(s, "KRT-3", "KIRTASIYE", TIME)));
    // Taşeron gideri: tevkifat KDV'yi aşamaz, durum listesi, ters kayıt tarihi.
    rejected(
        CHECK_VIOLATION,
        "trip_cost_withholding_ck",
        () ->
            jdbc.update(
                q(
                    s,
                    "update %s.trip_cost set vat_amount = 10, withholding_amount = 20 where id = ?"),
                f.openCost()));
    rejected(
        CHECK_VIOLATION,
        "trip_cost_payable_ck",
        () ->
            jdbc.update(
                q(s, "update %s.trip_cost set deduction_amount = 750 where id = ?"), f.openCost()));
    rejected(
        CHECK_VIOLATION,
        "trip_cost_reversed_ck",
        () ->
            jdbc.update(
                q(s, "update %s.trip_cost set status = 'REVERSED' where id = ?"), f.openCost()));
    rejected(
        CHECK_VIOLATION,
        "shipment_leg_transport_mode_ck",
        () ->
            jdbc.update(
                q(s, "update %s.shipment_leg set transport_mode = 'SPACE' where id = ?"), f.leg()));
  }

  @Test
  void yeniEntityVeRepositoryEslemeleriSemaylaUyumludur() throws Exception {
    World w = world("exp-mig");
    UUID companyA = w.companyAId();
    UUID a1 = UUID.fromString(w.a1());
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    UUID generalType =
        jdbc.queryForObject(
            q(w.schema(), "select id from %s.expense_type where code = 'GENERAL'"), UUID.class);
    Map<String, UUID> ids = new HashMap<>();

    inTenant(
        w,
        () -> {
          ExpenseItem item =
              items.save(new ExpenseItem(generalType, "MK-1", "Ofis Gideri", "Ofis", "Adet"));
          assertThat(items.nextCode()).isPositive();
          assertThat(items.existsByCode("MK-1")).isTrue();
          assertThat(items.existsByNameIgnoreCase("ofis GIDERI")).isTrue();
          assertThat(items.existsByNameIgnoreCase("Yok")).isFalse();
          assertThat(items.existsByNameIgnoreCaseAndIdNot("ofis gideri", item.getId())).isFalse();
          assertThat(items.isInUse(item.getId())).isFalse();
          ids.put("item", item.getId());

          Expense e =
              expenses.save(
                  new Expense(
                      companyA,
                      a1,
                      item.getId(),
                      Expense.ExpenseContext.general(),
                      new Expense.ExpensePayment(ExpensePaymentMethod.ACCOUNT, supplier),
                      new Expense.ExpenseDocument(
                          "F-1",
                          DATE,
                          DATE.plusDays(30),
                          "ALIS_FATURASI",
                          ExpenseDepartment.ADMIN,
                          "Ofis"),
                      new Expense.ExpenseAmounts(
                          "USD",
                          new BigDecimal("30"),
                          DATE,
                          new BigDecimal("100"),
                          BigDecimal.ZERO,
                          new BigDecimal("100"),
                          new BigDecimal("20"),
                          BigDecimal.ZERO,
                          BigDecimal.ZERO,
                          new BigDecimal("120"),
                          new BigDecimal("3600")),
                      null,
                      "exp-mig-key"));
          expenseLines.save(
              new ExpenseLine(
                  e.getId(),
                  1,
                  "Kalem",
                  new BigDecimal("2"),
                  "Adet",
                  new BigDecimal("50"),
                  new ExpenseLine.ExpenseLineAmounts(
                      new BigDecimal("100"),
                      BigDecimal.ZERO,
                      BigDecimal.ZERO,
                      new BigDecimal("100"),
                      new BigDecimal("20"),
                      new BigDecimal("20"),
                      BigDecimal.ZERO,
                      BigDecimal.ZERO,
                      new BigDecimal("120"))));
          ids.put("expense", e.getId());

          // Taşeron gider sorguları şemayla çalışır.
          assertThat(tripCosts.findAnyById(UUID.randomUUID())).isEmpty();
          assertThat(tripCosts.lockById(UUID.randomUUID())).isEmpty();
          assertThat(
                  tripCosts.findByLegIdAndKindOrderByCreatedAt(
                      UUID.randomUUID(), CostKind.SUBCONTRACTOR))
              .isEmpty();
          assertThat(
                  tripCosts.existsByShipmentIdAndKindAndStatus(
                      UUID.randomUUID(), CostKind.SUBCONTRACTOR, TripCostStatus.POSTED))
              .isFalse();
        });

    inTenant(
        w,
        () -> {
          Expense e = expenses.findById(ids.get("expense")).orElseThrow();
          assertThat(e.getStatus()).isEqualTo(ExpenseStatus.POSTED);
          assertThat(e.getContextType()).isEqualTo(ExpenseContextType.GENERAL);
          assertThat(e.total().amount()).isEqualByComparingTo("120");
          assertThat(e.getTlAmount()).isEqualByComparingTo("3600");
          assertThat(expenses.findByIdempotencyKey("exp-mig-key")).isPresent();
          assertThat(expenseLines.findByExpenseIdOrderByLineNo(e.getId()))
              .singleElement()
              .satisfies(l -> assertThat(l.getVatAmount()).isEqualByComparingTo("20"));
          assertThat(items.isInUse(ids.get("item"))).isTrue();

          ExpenseItem item = items.findById(ids.get("item")).orElseThrow();
          assertThat(item.getDescription()).isEqualTo("Ofis");
          assertThat(item.getDefaultUnit()).isEqualTo("Adet");
          assertThat(item.isActive()).isTrue();
          assertThat(item.isSystem()).isFalse();
          item.update(generalType, "Ofis Masrafı", null, "Kutu");
          item.setActive(false);

          Expense locked = expenses.lockById(e.getId()).orElseThrow();
          locked.reverse(DATE, "Hatalı");
        });

    inTenant(
        w,
        () -> {
          assertThat(expenses.findById(ids.get("expense"))).isEmpty();
          Expense reversed = expenses.findAnyById(ids.get("expense")).orElseThrow();
          assertThat(reversed.isReversed()).isTrue();
          assertThat(reversed.isDeleted()).isTrue();
          assertThat(reversed.getReversedOn()).isEqualTo(DATE);
          assertThat(expenses.findByIdempotencyKey("exp-mig-key")).isPresent();
          ExpenseItem item = items.findById(ids.get("item")).orElseThrow();
          assertThat(item.getName()).isEqualTo("Ofis Masrafı");
          assertThat(item.getDefaultUnit()).isEqualTo("Kutu");
          assertThat(item.isActive()).isFalse();
          assertThat(items.findByCode("FUEL").orElseThrow().isSystem()).isTrue();
        });
  }

  private void assertSeeds(String s) {
    assertThat(
            jdbc.queryForList(
                q(s, "select code from %s.expense_item where is_system order by code"),
                String.class))
        .containsExactlyInAnyOrderElementsOf(SYSTEM_CODES);
    assertThat(
            jdbc.queryForList(
                q(s, "select code from %s.expense_type where deleted = false"), String.class))
        .contains("VEHICLE", "GENERAL", "OPERATION");
  }

  private record Fixture(
      UUID companyA,
      UUID companyX,
      UUID branchA,
      UUID branchX,
      UUID cashA,
      UUID cashX,
      UUID supplier,
      UUID leg,
      UUID postedCost,
      UUID openCost,
      UUID firstItem,
      UUID secondItem,
      UUID generalItem) {}

  /**
   * V38 şemasında iki şirket; bir taşeron etabı, biri kapanışta yazılmış iki taşeron gideri; yalnız
   * büyük/küçük harfle ayrışan iki kullanıcı kalemi (ASCII: PostgreSQL {@code lower()} Türkçe İ'yi
   * yerel ayara bağlı çevirir).
   */
  private Fixture fixture(String s) {
    UUID companyA = defaultCompany(s);
    UUID companyX =
        insert(
            s,
            "company",
            Map.of(
                "code", "CODE_X1", "title", "X Lojistik", "short_name", "X", "is_default", false));
    UUID branchA = insert(s, "branch", Map.of("code", "A1", "name", "A1", "company_id", companyA));
    UUID branchX = insert(s, "branch", Map.of("code", "X1", "name", "X1", "company_id", companyX));
    UUID cashA = insert(s, "fund_account", fund(companyA, branchA, "KASA-A"));
    UUID cashX = insert(s, "fund_account", fund(companyX, branchX, "KASA-X"));
    UUID customer = account(s, "MUS-1");
    UUID supplier = account(s, "TED-1");

    Map<String, Object> shipment = new HashMap<>();
    shipment.put("account_id", customer);
    shipment.put("branch_id", branchA);
    shipment.put("status", "PLANNED");
    shipment.put("created_at", TIME);
    UUID shipmentId = insert(s, "shipment", shipment);
    UUID leg =
        insert(
            s,
            "shipment_leg",
            Map.of(
                "shipment_id", shipmentId,
                "sequence_no", 1,
                "carrier_account_id", supplier));
    UUID postedCost = tripCost(s, shipmentId, leg, supplier, TIME);
    UUID openCost = tripCost(s, shipmentId, leg, supplier, null);

    UUID firstItem = insert(s, "expense_item", item(s, "KRT-1", "Kirtasiye", TIME));
    UUID secondItem = insert(s, "expense_item", item(s, "KRT-2", "kirtasiye", TIME.plusHours(1)));
    return new Fixture(
        companyA,
        companyX,
        branchA,
        branchX,
        cashA,
        cashX,
        supplier,
        leg,
        postedCost,
        openCost,
        firstItem,
        secondItem,
        firstItem);
  }

  private UUID tripCost(String s, UUID shipment, UUID leg, UUID supplier, OffsetDateTime posted) {
    Map<String, Object> values = new HashMap<>();
    values.put("shipment_id", shipment);
    values.put("leg_id", leg);
    values.put("kind", "SUBCONTRACTOR");
    values.put("account_id", supplier);
    values.put("amount", new BigDecimal("750"));
    values.put("tl_amount", new BigDecimal("750"));
    values.put("currency", "TRY");
    if (posted != null) {
      values.put("posted_at", posted);
    }
    values.put("created_at", TIME);
    return insert(s, "trip_cost", values);
  }

  private Map<String, Object> item(String s, String code, String name, OffsetDateTime createdAt) {
    Map<String, Object> values = new HashMap<>();
    values.put(
        "expense_type_id",
        jdbc.queryForObject(
            q(s, "select id from %s.expense_type where code = 'VEHICLE'"), UUID.class));
    values.put("code", code);
    values.put("name", name);
    values.put("created_by", "kullanici");
    values.put("created_at", createdAt);
    return values;
  }

  /** Geçerli GENERAL nakit masraf satırı; {@code overrides} kolonları değiştirir. */
  private static Map<String, Object> expense(Fixture f, Map<String, Object> overrides) {
    Map<String, Object> values = new HashMap<>();
    values.put("company_id", f.companyA());
    values.put("branch_id", f.branchA());
    values.put("expense_item_id", f.generalItem());
    values.put("payment_method", "CASH");
    values.put("document_type", "KASA_FISI");
    values.put("department", "ADMIN");
    values.put("currency", "TRY");
    values.put("invoice_date", DATE);
    values.put("rate_date", DATE);
    values.putAll(overrides);
    return values;
  }

  private UUID settlement(String s, UUID company, UUID branch, UUID fund) {
    Map<String, Object> values = new HashMap<>();
    values.put("type", "PAYMENT");
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

  private UUID account(String s, String code) {
    Map<String, Object> values = new HashMap<>();
    values.put("code", code);
    values.put("name", code);
    values.put("type", code.startsWith("TED") ? "SUPPLIER" : "CUSTOMER");
    values.put("sub_group", code.startsWith("TED") ? "GENEL" : "MUSTERI");
    return insert(s, "account", values);
  }

  private static Map<String, Object> fund(UUID company, UUID branch, String code) {
    Map<String, Object> values = new HashMap<>();
    values.put("code", code);
    values.put("name", code);
    values.put("kind", "CASH");
    values.put("currency", "TRY");
    values.put("branch_id", branch);
    values.put("company_id", company);
    return values;
  }

  private UUID defaultCompany(String s) {
    return jdbc.queryForObject(q(s, "select id from %s.company where is_default"), UUID.class);
  }

  private String value(String s, String table, UUID id, String column) {
    return jdbc.queryForObject(
        q(s, "select " + column + " from %s." + table + " where id = ?"), String.class, id);
  }

  /**
   * İşlem içinde çalışır; kısıt ihlaliyle işlem geri alınır, kalıntı kalmaz. Beklenen SQLSTATE ve
   * kısıt adı doğrulanır.
   */
  private void rejected(String sqlState, String constraint, Runnable work) {
    assertThatThrownBy(() -> inRolledBackTransaction(work))
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

  private String schemaAtV38() {
    String schema = "emig_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    flyway(schema, "38").migrate();
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
   * InstrumentMigrationIT} deseni).
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
