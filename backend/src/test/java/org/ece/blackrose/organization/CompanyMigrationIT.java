package org.ece.blackrose.organization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.ece.blackrose.AbstractIntegrationTest;
import org.ece.blackrose.tenant.service.TenantMigrator;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Faz 12.1a göçü (tenant V22–V26, admin V8) mevcut veriye sahip, boş ve bozuk veri taşıyan
 * şemalarda hatasız çalışır. Şema V21'e kadar kurulur, veri şema nitelikli SQL ile yazılır, sonra
 * uygulamanın {@link TenantMigrator}'ı kalan göçü uygular (docs/zto-finans/uygulama/12.1a §7.1).
 */
class CompanyMigrationIT extends AbstractIntegrationTest {

  /** {@code company_id} alan para ve yasal belge tabloları (V24). */
  static final List<String> SCOPED_TABLES =
      List.of(
          "fund_account",
          "fund_transaction",
          "account_transaction",
          "instrument",
          "purchase_invoice",
          "payment_plan",
          "settlement",
          "opening_invoice",
          "vehicle_expense",
          "freight_invoice",
          "warehouse_invoice",
          "quote",
          "contract",
          "edocument");

  @Autowired DataSource dataSource;
  @Autowired JdbcTemplate jdbc;
  @Autowired PlatformTransactionManager transactionManager;
  @Autowired TenantMigrator migrator;

  // G-1
  @Test
  void bosKiracidaVarsayilanSirketVeSerilerOlusur() {
    String s = schemaAtV21();
    migrateRegistered(s, "Boş Lojistik A.Ş.");

    Map<String, Object> company = defaultCompany(s);
    assertThat(company.get("title")).isEqualTo("Boş Lojistik A.Ş.");
    assertThat(company.get("short_name")).isEqualTo("Boş Lojistik A.Ş.");
    assertThat(company.get("code")).isEqualTo("SIRKET1");
    assertThat(company.get("tax_number")).isNull();
    assertThat(company.get("tax_id_type")).isEqualTo("VKN");
    assertThat(count(s, "company")).isEqualTo(1);
    assertThat(count(s, "company_edocument_settings")).isEqualTo(1);
    assertThat(series(s, "FREIGHT_INVOICE").get("next_value")).isEqualTo(1L);
    assertThat(series(s, "WAREHOUSE_INVOICE").get("next_value")).isEqualTo(1L);
    assertThat(series(s, "FREIGHT_INVOICE").get("prefix")).isEqualTo("NF");
    assertThat(series(s, "WAREHOUSE_INVOICE").get("prefix")).isEqualTo("DF");
    assertThat(series(s, "FREIGHT_INVOICE").get("year")).isNull();
    // V25 (NF, DF) + V32 (VRM, SVR; Faz 12.2).
    assertThat(jdbc.queryForObject(q(s, "select count(*) from %s.document_series"), Long.class))
        .isEqualTo(4);
  }

  // G-2, G-9
  @Test
  void hareketliKiracidaTumKayitlarVarsayilanSirketeBaglanir() {
    String s = schemaAtV21();
    SchemaRows rows = new SchemaRows(jdbc);
    jdbc.update(
        q(s, "update %s.edocument_settings set tax_number = '1234567890', tax_office = 'Kadıköy'"));
    UUID branch = rows.insert(s, "branch", Map.of("code", "S1", "name", "Merkez"));
    UUID gone = rows.insert(s, "branch", Map.of("code", "S2", "name", "Eski", "deleted", true));
    UUID customer = rows.insert(s, "account", Map.of("code", "M1", "type", "CUSTOMER"));
    UUID fund =
        rows.insert(s, "fund_account", Map.of("code", "B1", "kind", "BANK", "branch_id", branch));
    rows.insert(s, "fund_transaction", Map.of("fund_account_id", fund, "direction", "IN"));
    rows.insert(s, "account_transaction", Map.of("account_id", customer, "branch_id", branch));
    rows.insert(s, "account_transaction", Map.of("account_id", customer, "branch_id", gone));
    rows.insert(
        s,
        "settlement",
        Map.of("account_id", customer, "branch_id", branch, "fund_account_id", fund));
    rows.insert(
        s,
        "instrument",
        Map.of(
            "account_id",
            customer,
            "branch_id",
            branch,
            "fund_account_id",
            fund,
            "status",
            "AT_BANK"));
    UUID purchase =
        rows.insert(s, "purchase_invoice", Map.of("account_id", customer, "branch_id", branch));
    rows.insert(
        s,
        "payment_plan",
        Map.of("account_id", customer, "branch_id", branch, "purchase_invoice_id", purchase));
    rows.insert(
        s,
        "opening_invoice",
        Map.of("account_id", customer, "branch_id", branch, "number", "A-1", "status", "OPEN"));
    UUID vehicle = rows.insert(s, "vehicle", Map.of("plate", "34ABC01"));
    rows.insert(
        s,
        "vehicle_expense",
        Map.of("vehicle_id", vehicle, "branch_id", branch, "fund_account_id", fund));
    UUID shipment =
        rows.insert(
            s, "shipment", Map.of("number", "SV-1", "account_id", customer, "branch_id", branch));
    UUID invoice =
        rows.insert(
            s,
            "freight_invoice",
            Map.of(
                "number",
                "NF-2026-000007",
                "shipment_id",
                shipment,
                "account_id",
                customer,
                "branch_id",
                branch));
    jdbc.queryForObject(
        q(s, "select setval('%s.freight_invoice_number_seq', 7, true)"), Long.class);
    UUID warehouse = rows.insert(s, "warehouse", Map.of("code", "D1", "branch_id", branch));
    UUID storage =
        rows.insert(
            s, "warehouse_contract", Map.of("account_id", customer, "warehouse_id", warehouse));
    rows.insert(
        s,
        "warehouse_invoice",
        Map.of(
            "number",
            "DF-2026-000003",
            "contract_id",
            storage,
            "account_id",
            customer,
            "branch_id",
            branch));
    UUID quote = rows.insert(s, "quote", Map.of("number", "T-1", "account_id", customer));
    rows.insert(s, "contract", Map.of("number", "S-1", "account_id", customer, "quote_id", quote));
    rows.insert(s, "contract", Map.of("number", "S-2", "account_id", customer));
    UUID waybill =
        rows.insert(
            s,
            "shipment_document",
            Map.of("shipment_id", shipment, "type", "WAYBILL", "number", "IR-1"));
    rows.insert(s, "edocument", Map.of("source_type", "FREIGHT_INVOICE", "source_id", invoice));
    rows.insert(s, "edocument", Map.of("source_type", "WAYBILL", "source_id", waybill));

    migrateRegistered(s, "Dolu Lojistik");

    Map<String, Object> company = defaultCompany(s);
    UUID companyId = (UUID) company.get("id");
    assertThat(company.get("tax_number")).isEqualTo("1234567890");
    assertThat(company.get("tax_office")).isEqualTo("Kadıköy");
    assertThat(
            jdbc.queryForObject(
                q(s, "select count(*) from %s.branch where company_id = ?"), Long.class, companyId))
        .isEqualTo(2);
    for (String table : SCOPED_TABLES) {
      assertThat(
              jdbc.queryForObject(
                  q(s, "select count(*) from %s." + table + " where company_id is distinct from ?"),
                  Long.class,
                  companyId))
          .as(table)
          .isZero();
      assertThat(jdbc.queryForObject(q(s, "select count(*) from %s." + table), Long.class))
          .as(table)
          .isPositive();
    }
    assertThat(
            jdbc.queryForObject(
                q(s, "select count(*) from %s.account where company_id is not null"), Long.class))
        .isZero();
    assertThat(series(s, "FREIGHT_INVOICE").get("next_value")).isEqualTo(8L);
    assertThat(series(s, "WAREHOUSE_INVOICE").get("next_value")).isEqualTo(4L);
    assertThat(indexDef(s, "opening_invoice_number_uq"))
        .contains("(company_id, account_id, number)");

    // G-9: şirket başına çek tekilliği ve fonun şirketini koruyan bileşik FK'ler
    assertThat(indexDef(s, "instrument_number_uq")).contains("(company_id, kind, direction");
    assertThat(indexDef(s, "freight_invoice_company_number_uq")).contains("(company_id, number)");
    assertThat(indexDef(s, "warehouse_invoice_company_number_uq")).contains("(company_id, number)");
    assertThat(
            jdbc.queryForObject(
                """
                select count(*) from pg_constraint c
                join pg_namespace n on n.oid = c.connamespace
                where n.nspname = ? and c.contype = 'f' and c.convalidated
                  and c.conname in ('instrument_fund_company_fk', 'settlement_fund_company_fk',
                                    'vehicle_expense_fund_company_fk', 'fund_account_branch_company_fk',
                                    'account_transaction_branch_company_fk',
                                    'fund_transaction_fund_company_fk', 'company_default_fund_fk',
                                    'branch_group_company_fk')
                """,
                Long.class,
                s))
        .isEqualTo(8);
    // Sütun içi "number UNIQUE" kısıtları kaldırıldı; numara artık şirket başına tekil.
    // (V36'nın bileşik FK hedefi UNIQUE (id, company_id) numarayı kapsamaz, sayılmaz.)
    assertThat(
            jdbc.queryForObject(
                """
                select count(*) from pg_constraint c
                where c.contype = 'u' and c.conrelid in (to_regclass(?), to_regclass(?))
                  and c.conname not in ('freight_invoice_id_company_uq',
                                        'warehouse_invoice_id_company_uq')
                """,
                Long.class,
                "\"" + s + "\".freight_invoice",
                "\"" + s + "\".warehouse_invoice"))
        .isZero();
    // Bileşik FK veritabanında da korur: başka şirketin şubesiyle hareket yazılamaz.
    UUID other =
        rows.insert(
            s,
            "company",
            Map.of(
                "code", "SIRKET2", "title", "İkinci", "short_name", "İkinci", "is_default", false));
    assertThatThrownBy(
            () ->
                rows.insert(
                    s,
                    "account_transaction",
                    Map.of("account_id", customer, "branch_id", branch, "company_id", other)))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  // G-3
  @Test
  void kiraciKaydiOlmayanSemadaSirketAdiVarsayilandir() {
    String s = schemaAtV21();
    migrator.migrate(s);

    assertThat(defaultCompany(s).get("title")).isEqualTo("Şirket");
    assertThat(count(s, "company_edocument_settings")).isEqualTo(1);
  }

  // G-4
  @ParameterizedTest
  @CsvSource(
      delimiter = '|',
      nullValues = "NULL",
      value = {
        "12 345|NULL|VKN",
        "1234567890123|NULL|VKN",
        "0123456789A|0123456789|VKN",
        "01234567890|NULL|VKN",
        "10000000146|10000000146|TCKN",
        "  |NULL|VKN"
      })
  void gecersizVergiNumarasiAtilir(String raw, String expected, String type) {
    String s = schemaAtV21();
    jdbc.update(q(s, "update %s.edocument_settings set tax_number = ?"), raw);
    migrator.migrate(s);

    Map<String, Object> company = defaultCompany(s);
    assertThat(company.get("tax_number")).isEqualTo(expected);
    assertThat(company.get("tax_id_type")).isEqualTo(type);
  }

  // G-5
  @Test
  void eBelgeAyarSatiriYoksaDaSirketOlusur() {
    String s = schemaAtV21();
    jdbc.update(q(s, "delete from %s.edocument_settings"));
    migrator.migrate(s);

    assertThat(count(s, "company")).isEqualTo(1);
    assertThat(defaultCompany(s).get("tax_number")).isNull();
  }

  @Test
  void silinmisEBelgeAyariOkunmaz() {
    String s = schemaAtV21();
    jdbc.update(q(s, "update %s.edocument_settings set tax_number = '1234567890', deleted = true"));
    migrator.migrate(s);

    assertThat(defaultCompany(s).get("tax_number")).isNull();
  }

  // G-6
  @Test
  void seriSequenceIleMevcutNumaralarinBuyugundenDevamEder() {
    String s = schemaAtV21();
    SchemaRows rows = new SchemaRows(jdbc);
    UUID branch = rows.insert(s, "branch", Map.of("code", "S1", "name", "Merkez"));
    UUID customer = rows.insert(s, "account", Map.of("code", "M1", "type", "CUSTOMER"));
    UUID shipment =
        rows.insert(
            s, "shipment", Map.of("number", "SV-1", "account_id", customer, "branch_id", branch));
    rows.insert(
        s,
        "freight_invoice",
        Map.of(
            "number",
            "NF-2026-000050",
            "shipment_id",
            shipment,
            "account_id",
            customer,
            "branch_id",
            branch));
    jdbc.queryForObject(
        q(s, "select setval('%s.freight_invoice_number_seq', 5, false)"), Long.class);
    jdbc.queryForObject(
        q(s, "select setval('%s.warehouse_invoice_number_seq', 9, true)"), Long.class);
    migrator.migrate(s);

    assertThat(series(s, "FREIGHT_INVOICE").get("next_value")).isEqualTo(51L);
    assertThat(series(s, "WAREHOUSE_INVOICE").get("next_value")).isEqualTo(10L);
  }

  // G-8: şema denetimi (satır sayımı başka testlerin açtığı planlardan etkilenmesin diye).
  @ParameterizedTest
  @CsvSource({"max_companies, plan_max_companies_ck", "max_branches, plan_max_branches_ck"})
  void planSinirlariBosBaslarVeSifirReddedilir(String column, String constraint) {
    Map<String, Object> definition =
        jdbc.queryForMap(
            "select is_nullable, column_default, data_type from information_schema.columns"
                + " where table_schema = 'admin' and table_name = 'plan' and column_name = ?",
            column);
    assertThat(definition.get("is_nullable")).isEqualTo("YES");
    assertThat(definition.get("column_default")).as("varsayılansız: sınırsız başlar").isNull();
    assertThat(definition.get("data_type")).isEqualTo("integer");
    assertThat(
            jdbc.queryForObject(
                "select pg_get_constraintdef(c.oid) from pg_constraint c"
                    + " join pg_class t on t.oid = c.conrelid"
                    + " join pg_namespace n on n.oid = t.relnamespace"
                    + " where n.nspname = 'admin' and t.relname = 'plan' and c.contype = 'c'"
                    + " and c.conname = ?",
                String.class,
                constraint))
        .contains(column)
        .contains(">= 1");

    // İhlal denemesi geri alınan işlemde: kalıntı satır kalmaz.
    String code = "MIG-" + UUID.randomUUID().toString().substring(0, 8);
    TransactionTemplate tx = new TransactionTemplate(transactionManager);
    assertThatThrownBy(
            () ->
                tx.executeWithoutResult(
                    status -> {
                      new SchemaRows(jdbc)
                          .insert(
                              "admin",
                              "plan",
                              Map.of(
                                  "code",
                                  code,
                                  "monthly_price",
                                  BigDecimal.TEN,
                                  "currency",
                                  "TRY",
                                  column,
                                  0));
                    }))
        .isInstanceOf(DataIntegrityViolationException.class);
    assertThat(
            jdbc.queryForObject("select count(*) from admin.plan where code = ?", Long.class, code))
        .isZero();
  }

  @Test
  void kullaniciKapsamiVarsayilaniTumuDur() {
    String s = schemaAtV21();
    SchemaRows rows = new SchemaRows(jdbc);
    rows.insert(s, "app_user", Map.of("email", "a@b.test"));
    migrator.migrate(s);

    assertThat(jdbc.queryForObject(q(s, "select branch_scope from %s.app_user"), String.class))
        .isEqualTo("ALL");
    assertThat(
            jdbc.queryForObject(
                q(s, "select count(*) from %s.role_permission where permission = 'COMPANY_MANAGE'"),
                Long.class))
        .isEqualTo(1);
  }

  // Yardımcılar

  private String schemaAtV21() {
    String schema = "mig_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    Flyway.configure()
        .dataSource(dataSource)
        .schemas(schema)
        .defaultSchema(schema)
        .locations("classpath:db/migration/tenant")
        .target("21")
        .load()
        .migrate();
    return schema;
  }

  /** {@code admin.tenant} satırı göç sırasında var olur (V23 kiracı adını okur). */
  private void migrateRegistered(String schema, String name) {
    UUID id = UUID.randomUUID();
    new SchemaRows(jdbc)
        .insert(
            "admin",
            "tenant",
            Map.of(
                "id",
                id,
                "code",
                schema.replace('_', '-'),
                "name",
                name,
                "schema_name",
                schema,
                "status",
                "PROVISIONING",
                "time_zone",
                "Europe/Istanbul",
                "rounding_mode",
                "HALF_UP"));
    try {
      migrator.migrate(schema);
    } finally {
      jdbc.update("delete from admin.tenant where id = ?", id);
    }
  }

  private Map<String, Object> defaultCompany(String s) {
    return jdbc.queryForMap(q(s, "select * from %s.company where is_default and not deleted"));
  }

  private Map<String, Object> series(String s, String type) {
    return jdbc.queryForMap(
        q(s, "select * from %s.document_series where doc_type = ? and year is null"), type);
  }

  private long count(String s, String table) {
    return jdbc.queryForObject(q(s, "select count(*) from %s." + table), Long.class);
  }

  private String indexDef(String s, String index) {
    return jdbc.queryForObject(
        "select pg_get_indexdef(to_regclass(?))", String.class, "\"" + s + "\"." + index);
  }

  private static String q(String schema, String sql) {
    return sql.replace("%s", "\"" + schema + "\"");
  }
}
