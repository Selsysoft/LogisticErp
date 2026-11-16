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
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.AccountDocument;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentSide;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.DocumentPaymentMethod;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountDocumentRepository;
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
 * Faz 12.8 göçü (tenant V41 Z42) boş ve dolu şemada hatasız çalışır; mevcut belgelerde kesim kuru
 * boş kalır; kur farkı belgesi ⇔ kaynak hareket kuralı CHECK ile, kaynağıyla aynı şirkette olma
 * bileşik FK ile veritabanında korunur; yeni entity alanları ve repository sorguları şemayla
 * uyumludur (docs/zto-finans/uygulama/12.8_TASARIM.md §1.1, §1.2, §2).
 */
class AccountDocumentFxMigrationIT extends AccountTestSupport {

  private static final LocalDate DATE = LocalDate.of(2026, 1, 15);
  private static final OffsetDateTime TIME =
      OffsetDateTime.of(2026, 1, 15, 9, 0, 0, 0, ZoneOffset.UTC);

  private static final String FK_VIOLATION = "23503";
  private static final String CHECK_VIOLATION = "23514";

  private static final String FX_CHECK = "account_document_fx_ck";
  private static final String FX_COMPANY_FK = "account_document_fx_source_company_fk";

  /** Ad → {@code pg_constraint.contype}. */
  private static final Map<String, String> CONSTRAINTS =
      Map.of(FX_CHECK, "c", "account_transaction_id_company_uq", "u", FX_COMPANY_FK, "f");

  private static final List<String> INDEXES =
      List.of(
          "account_document_fx_source_idx",
          "account_transaction_fx_idx",
          "expense_shipment_idx",
          "expense_vehicle_idx");

  @Autowired DataSource dataSource;
  @Autowired TenantMigrator migrator;
  @Autowired PlatformTransactionManager transactionManager;
  @Autowired AccountDocumentRepository documents;

  // §1.2 adım 4–5: boş kiracı
  @Test
  void bosKiracidaV1denV41eGocGecerVeKisitlarIleIndekslerOlusur() {
    String s = newSchema();
    migrator.migrate(s);

    assertThat(
            jdbc.queryForList(
                q(
                    s,
                    "select version from %s.flyway_schema_history where success"
                        + " order by installed_rank"),
                String.class))
        .contains("1", "40", "41");
    assertThat(count(s, "account_document")).isZero();
    assertSchemaObjects(s);
    // İkinci çalıştırma bir şey yapmaz.
    assertThat(flyway(s, null).migrate().migrationsExecuted).isZero();
    flyway(s, null).validate();
  }

  // §1.2 adım 1–2, 5: dolu kiracı
  @Test
  void doluKiracidaGocGecerVeMevcutBelgelerDegismez() {
    String s = schemaAtV40();
    Fixture f = fixture(s);

    migrator.migrate(s);

    assertThat(
            jdbc.queryForList(
                q(s, "select version from %s.flyway_schema_history where success"), String.class))
        .contains("41");
    Map<String, Object> doc =
        jdbc.queryForMap(
            q(
                s,
                "select document_type, currency, exchange_rate, status, fx_rate, fx_rate_date,"
                    + " fx_source_transaction_id from %s.account_document where id = ?"),
            f.document());
    assertThat(doc.get("document_type")).isEqualTo("SATIS_FATURASI");
    assertThat(doc.get("currency")).isEqualTo("USD");
    assertThat((BigDecimal) doc.get("exchange_rate")).isEqualByComparingTo("34");
    assertThat(doc.get("status")).isEqualTo("OPEN");
    assertThat(doc.get("fx_rate")).isNull();
    assertThat(doc.get("fx_rate_date")).isNull();
    assertThat(doc.get("fx_source_transaction_id")).isNull();
    // Hareket ve masraf satırları dokunulmadan kalır.
    assertThat(count(s, "account_transaction where tl_amount = 3400 and currency = 'USD'"))
        .isEqualTo(2);
    assertThat(count(s, "expense where context_type = 'SHIPMENT' and shipment_id is not null"))
        .isEqualTo(1);
    // Yeni kısıtlar mevcut satırlarla doğrulandı (NOT VALID değil).
    assertThat(
            jdbc.queryForList(
                """
                select c.conname from pg_constraint c
                join pg_namespace n on n.oid = c.connamespace
                where n.nspname = ? and c.convalidated
                """,
                String.class,
                s))
        .containsAll(CONSTRAINTS.keySet());
    assertSchemaObjects(s);
  }

  // §1.2 adım 3: CHECK ve bileşik FK
  @Test
  void kurFarkiKurallariVeritabanindaKorunur() {
    String s = schemaAtV40();
    Fixture f = fixture(s);
    migrator.migrate(s);

    // Geçerli: kaynaklı TRY kur farkı belgesi, aynı şirket.
    inRolledBackTransaction(() -> insert(s, "account_document", fx(f, Map.of())));
    // Geçerli: PAYABLE yönünde de aynı kural.
    inRolledBackTransaction(() -> insert(s, "account_document", fx(f, Map.of("side", "PAYABLE"))));

    // KUR_FARKI kaynaksız (kur/tarih de boş).
    rejected(
        CHECK_VIOLATION,
        FX_CHECK,
        () -> {
          Map<String, Object> values = fx(f, Map.of());
          values.remove("fx_source_transaction_id");
          values.remove("fx_rate");
          values.remove("fx_rate_date");
          insert(s, "account_document", values);
        });
    // Kaynaklı ama döviz.
    rejected(
        CHECK_VIOLATION,
        FX_CHECK,
        () ->
            insert(
                s,
                "account_document",
                fx(f, Map.of("currency", "USD", "exchange_rate", new BigDecimal("36")))));
    // Kur sıfır.
    rejected(
        CHECK_VIOLATION,
        FX_CHECK,
        () -> insert(s, "account_document", fx(f, Map.of("fx_rate", BigDecimal.ZERO))));
    // Kaynaklı, kur var ama kur tarihi yok.
    rejected(
        CHECK_VIOLATION,
        FX_CHECK,
        () -> {
          Map<String, Object> values = fx(f, Map.of());
          values.remove("fx_rate_date");
          insert(s, "account_document", values);
        });
    // Kaynaklı ama tür KUR_FARKI değil.
    rejected(
        CHECK_VIOLATION,
        FX_CHECK,
        () -> insert(s, "account_document", fx(f, Map.of("document_type", "DIGER"))));
    // Kaynaklı ama deftere yansımıyor.
    rejected(
        CHECK_VIOLATION,
        FX_CHECK,
        () -> {
          Map<String, Object> values = fx(f, Map.of("reflect_to_ledger", false));
          values.remove("ledger_amount");
          insert(s, "account_document", values);
        });
    // Kaynak hareket başka şirkette (belge A şirketinde).
    rejected(
        FK_VIOLATION,
        FX_COMPANY_FK,
        () ->
            insert(
                s,
                "account_document",
                fx(f, Map.of("fx_source_transaction_id", f.transactionX()))));
    // Var olmayan kaynak hareket (V28 tek kolonlu FK ve bileşik FK).
    assertThatThrownBy(
            () ->
                inRolledBackTransaction(
                    () ->
                        insert(
                            s,
                            "account_document",
                            fx(f, Map.of("fx_source_transaction_id", UUID.randomUUID())))))
        .isInstanceOf(DataIntegrityViolationException.class);
    // Kaynaksız sıradan belge (MATCH SIMPLE) etkilenmez.
    inRolledBackTransaction(() -> insert(s, "account_document", plainDocument(f, "DIGER")));
  }

  // §2: entity ve repository eşlemesi
  @Test
  void entityVeRepositoryEslemeleriSemaylaUyumludur() throws Exception {
    World w = world("fx-mig");
    UUID companyA = w.companyAId();
    UUID a1 = UUID.fromString(w.a1());
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID tx = manual(w, customer, w.a1(), Direction.DEBIT, "100", "USD");
    UUID untouched = manual(w, customer, w.a1(), Direction.DEBIT, "50", "USD");
    Map<String, UUID> ids = new HashMap<>();

    // Alan doğrulaması: üç değer zorunlu, yalnız kur farkı türü bağlanır.
    AccountDocument other = fxDocument(customer, a1, companyA, "DIGER");
    assertThatThrownBy(() -> other.linkFxSource(tx, new BigDecimal("36.5"), DATE))
        .isInstanceOf(IllegalStateException.class);
    AccountDocument draft = fxDocument(customer, a1, companyA, AccountDocument.TYPE_FX);
    assertThatThrownBy(() -> draft.linkFxSource(null, BigDecimal.ONE, DATE))
        .isInstanceOf(NullPointerException.class);
    assertThatThrownBy(() -> draft.linkFxSource(tx, null, DATE))
        .isInstanceOf(NullPointerException.class);
    assertThatThrownBy(() -> draft.linkFxSource(tx, BigDecimal.ONE, null))
        .isInstanceOf(NullPointerException.class);
    assertThat(draft.getFxSourceTransactionId()).isNull();
    assertThat(draft.getFxRate()).isNull();
    assertThat(draft.getFxRateDate()).isNull();

    inTenant(
        w,
        () -> {
          AccountDocument doc = fxDocument(customer, a1, companyA, AccountDocument.TYPE_FX);
          doc.linkFxSource(tx, new BigDecimal("36.512345"), DATE);
          documents.save(doc);
          ids.put("doc", doc.getId());
        });

    inTenant(
        w,
        () -> {
          AccountDocument doc = documents.findById(ids.get("doc")).orElseThrow();
          assertThat(doc.getDocumentType()).isEqualTo("KUR_FARKI");
          assertThat(doc.getFxSourceTransactionId()).isEqualTo(tx);
          assertThat(doc.getFxRate()).isEqualByComparingTo("36.512345");
          assertThat(doc.getFxRateDate()).isEqualTo(DATE);
          assertThat(
                  documents.existsByFxSourceTransactionIdAndStatusAndDeletedFalse(
                      tx, AccountDocumentStatus.OPEN))
              .isTrue();
          assertThat(
                  documents.existsByFxSourceTransactionIdAndStatusAndDeletedFalse(
                      tx, AccountDocumentStatus.CANCELLED))
              .isFalse();
          assertThat(
                  documents.existsByFxSourceTransactionIdAndStatusAndDeletedFalse(
                      untouched, AccountDocumentStatus.OPEN))
              .isFalse();
          assertThat(
                  documents.findFirstByFxSourceTransactionIdAndStatusAndDeletedFalse(
                      tx, AccountDocumentStatus.OPEN))
              .hasValueSatisfying(d -> assertThat(d.getId()).isEqualTo(ids.get("doc")));
          documents.findForUpdate(ids.get("doc")).orElseThrow().cancel(DATE, "Test iptal");
        });

    inTenant(
        w,
        () -> {
          assertThat(
                  documents.findFirstByFxSourceTransactionIdAndStatusAndDeletedFalse(
                      tx, AccountDocumentStatus.OPEN))
              .isEmpty();
          assertThat(
                  documents.findFirstByFxSourceTransactionIdAndStatusAndDeletedFalse(
                      tx, AccountDocumentStatus.CANCELLED))
              .isPresent();
          // İptalden sonra aynı kaynağa yeni açık belge kesilebilir (V28 fx_source_uq yalnız OPEN).
          AccountDocument again = fxDocument(customer, a1, companyA, AccountDocument.TYPE_FX);
          again.linkFxSource(tx, new BigDecimal("37"), DATE.plusDays(1));
          documents.save(again);
        });

    // Silinmiş belge sorgulara girmez.
    jdbc.update(
        q(w.schema(), "update %s.account_document set deleted = true where id = ?"),
        ids.get("doc"));
    inTenant(
        w,
        () -> {
          assertThat(
                  documents.existsByFxSourceTransactionIdAndStatusAndDeletedFalse(
                      tx, AccountDocumentStatus.CANCELLED))
              .isFalse();
          assertThat(
                  documents.existsByFxSourceTransactionIdAndStatusAndDeletedFalse(
                      tx, AccountDocumentStatus.OPEN))
              .isTrue();
        });
  }

  private static AccountDocument fxDocument(UUID account, UUID branch, UUID company, String type) {
    return new AccountDocument(
        account,
        branch,
        company,
        AccountDocumentSide.RECEIVABLE,
        type,
        "KF-" + UUID.randomUUID().toString().substring(0, 8),
        DATE,
        null,
        new Money(new BigDecimal("150"), "TRY"),
        null,
        DocumentPaymentMethod.OTHER,
        "Kur farkı",
        true,
        new BigDecimal("150"),
        null);
  }

  private void assertSchemaObjects(String s) {
    Map<String, String> found = new HashMap<>();
    jdbc.query(
        """
        select c.conname, c.contype::text as contype from pg_constraint c
        join pg_namespace n on n.oid = c.connamespace
        where n.nspname = ?
        """,
        rs -> {
          found.put(rs.getString("conname"), rs.getString("contype"));
        },
        s);
    assertThat(found).containsAllEntriesOf(CONSTRAINTS);
    assertThat(
            jdbc.queryForList(
                "select indexname from pg_indexes where schemaname = ?", String.class, s))
        .containsAll(INDEXES);
    assertThat(
            jdbc.queryForList(
                """
                select column_name || ':' || data_type from information_schema.columns
                where table_schema = ? and table_name = 'account_document'
                  and column_name in ('fx_rate', 'fx_rate_date')
                """,
                String.class,
                s))
        .containsExactlyInAnyOrder("fx_rate:numeric", "fx_rate_date:date");
  }

  private record Fixture(
      UUID companyA,
      UUID companyX,
      UUID branchA,
      UUID branchX,
      UUID customer,
      UUID document,
      UUID transactionA,
      UUID transactionX,
      UUID expense) {}

  /**
   * V40 şemasında iki şirket; A'da dövizli satış faturası belgesi, iki şirkette birer dövizli cari
   * hareket ve sefer bağlamlı bir masraf.
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
    UUID customer = account(s, "MUS-1", "CUSTOMER", "MUSTERI");

    Map<String, Object> doc = plainDocumentValues(customer, branchA, companyA, "SATIS_FATURASI");
    doc.put("currency", "USD");
    doc.put("exchange_rate", new BigDecimal("34"));
    doc.put("amount", new BigDecimal("100"));
    doc.put("ledger_amount", new BigDecimal("100"));
    UUID document = insert(s, "account_document", doc);

    UUID transactionA = transaction(s, customer, branchA, companyA);
    UUID transactionX = transaction(s, customer, branchX, companyX);

    UUID item =
        jdbc.queryForObject(q(s, "select id from %s.expense_item where code = 'FUEL'"), UUID.class);
    Map<String, Object> shipment = new HashMap<>();
    shipment.put("account_id", customer);
    shipment.put("branch_id", branchA);
    shipment.put("status", "PLANNED");
    shipment.put("created_at", TIME);
    UUID shipmentId = insert(s, "shipment", shipment);
    Map<String, Object> expense = new HashMap<>();
    expense.put("company_id", companyA);
    expense.put("branch_id", branchA);
    expense.put("expense_item_id", item);
    expense.put("context_type", "SHIPMENT");
    expense.put("shipment_id", shipmentId);
    expense.put("payment_method", "CASH");
    expense.put("document_type", "KASA_FISI");
    expense.put("department", "OPERATION");
    expense.put("currency", "TRY");
    expense.put("invoice_date", DATE);
    expense.put("rate_date", DATE);
    UUID expenseId = insert(s, "expense", expense);

    return new Fixture(
        companyA,
        companyX,
        branchA,
        branchX,
        customer,
        document,
        transactionA,
        transactionX,
        expenseId);
  }

  private UUID transaction(String s, UUID account, UUID branch, UUID company) {
    Map<String, Object> values = new HashMap<>();
    values.put("account_id", account);
    values.put("branch_id", branch);
    values.put("company_id", company);
    values.put("direction", "DEBIT");
    values.put("amount", new BigDecimal("100"));
    values.put("currency", "USD");
    values.put("exchange_rate", new BigDecimal("34"));
    values.put("rate_date", DATE);
    values.put("tl_amount", new BigDecimal("3400"));
    values.put("transaction_date", DATE);
    values.put("source_type", "MANUAL");
    values.put("source_id", UUID.randomUUID());
    return insert(s, "account_transaction", values);
  }

  /** A şirketindeki kaynağa bağlı geçerli kur farkı belgesi; {@code overrides} değiştirir. */
  private static Map<String, Object> fx(Fixture f, Map<String, Object> overrides) {
    Map<String, Object> values =
        plainDocumentValues(f.customer(), f.branchA(), f.companyA(), "KUR_FARKI");
    values.put("fx_source_transaction_id", f.transactionA());
    values.put("fx_rate", new BigDecimal("36.5"));
    values.put("fx_rate_date", DATE.plusDays(10));
    values.putAll(overrides);
    return values;
  }

  private static Map<String, Object> plainDocument(Fixture f, String type) {
    return plainDocumentValues(f.customer(), f.branchA(), f.companyA(), type);
  }

  private static Map<String, Object> plainDocumentValues(
      UUID account, UUID branch, UUID company, String type) {
    Map<String, Object> values = new HashMap<>();
    values.put("account_id", account);
    values.put("branch_id", branch);
    values.put("company_id", company);
    values.put("side", "RECEIVABLE");
    values.put("document_type", type);
    values.put("document_no", "B-" + UUID.randomUUID().toString().substring(0, 8));
    values.put("document_date", DATE);
    values.put("amount", new BigDecimal("250"));
    values.put("currency", "TRY");
    values.put("payment_method", "OTHER");
    values.put("reflect_to_ledger", true);
    values.put("ledger_amount", new BigDecimal("250"));
    values.put("status", "OPEN");
    return values;
  }

  private UUID account(String s, String code, String type, String subGroup) {
    Map<String, Object> values = new HashMap<>();
    values.put("code", code);
    values.put("name", code);
    values.put("type", type);
    values.put("sub_group", subGroup);
    return insert(s, "account", values);
  }

  private UUID defaultCompany(String s) {
    return jdbc.queryForObject(q(s, "select id from %s.company where is_default"), UUID.class);
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

  private static String newSchema() {
    return "fxmig_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
  }

  private String schemaAtV40() {
    String schema = newSchema();
    flyway(schema, "40").migrate();
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
   * ExpenseMigrationIT} deseni).
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
