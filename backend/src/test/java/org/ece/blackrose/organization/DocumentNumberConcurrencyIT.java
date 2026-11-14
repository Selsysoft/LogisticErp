package org.ece.blackrose.organization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.stream.LongStream;
import javax.sql.DataSource;
import org.ece.blackrose.AbstractIntegrationTest;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.shipment.service.TripFinanceService;
import org.ece.blackrose.shipment.web.ShipmentDtos.IssueInvoiceRequest;
import org.ece.blackrose.tenant.TenantContext;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.ece.blackrose.tenant.service.TenantMigrator;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Navlun/depo faturası numarası şirket serisinden satır kilidiyle alınır: eşzamanlı kesimde boşluk
 * ve çift yoktur, göçten sonra eski sequence'in devamından başlar ve sequence bir daha ilerlemez.
 */
class DocumentNumberConcurrencyIT extends AbstractIntegrationTest {

  private static final int THREADS = 8;
  private static final int PER_THREAD = 5;

  @Autowired TripFinanceService tripFinance;
  @Autowired DocumentNumberService numbers;
  @Autowired TenantRepository tenants;
  @Autowired TenantMigrator migrator;
  @Autowired JdbcTemplate jdbc;
  @Autowired DataSource dataSource;
  @Autowired PlatformTransactionManager transactionManager;

  @Test
  void ayniSirketteEsZamanliNumaralarBoslukVeCiftOlmadanVerilir() throws Exception {
    String t = "dnc-" + Long.toString(System.nanoTime(), 36);
    createTenant(t);
    String schema = tenants.findByCode(t).orElseThrow().getSchemaName();
    UUID company =
        jdbc.queryForObject(
            "select id from \"%s\".company where is_default".formatted(schema), UUID.class);
    UUID branch =
        UUID.fromString(
            created(t, "/api/v1/organization/branches", Map.of("code", "S1", "name", "Merkez")));
    UUID customer =
        UUID.fromString(
            created(
                t,
                "/api/v1/finance/accounts",
                Map.of("code", "M1", "name", "Müşteri", "type", "CUSTOMER")));
    LocalDate date = tenantToday();

    // 1) 8 iş parçacığı x 5 numara, her biri ayrı işlemde: satır kilidi sırayı korur.
    List<String> direct =
        runParallel(
            THREADS,
            PER_THREAD,
            t,
            schema,
            (worker, i) ->
                new TransactionTemplate(transactionManager)
                    .execute(status -> numbers.next(company, DocumentType.FREIGHT_INVOICE, date)));
    assertThat(direct).doesNotHaveDuplicates();
    assertThat(new TreeSet<>(direct)).isEqualTo(expected(date, 1, THREADS * PER_THREAD));

    // 2) Gerçek fatura kesimi: her iş parçacığı farklı seferleri faturalar; sefer kilidi + seri
    // kilidi çapraz alınır, kilit sırası sabit olduğu için deadlock olmaz. Test havuzu 5
    // bağlantılı ve denetim kaydı ayrı işlem açtığı için 4 iş parçacığı kullanılır.
    int workers = 4;
    int perWorker = 3;
    SchemaRows rows = new SchemaRows(jdbc);
    List<UUID> shipments =
        IntStream.range(0, workers * perWorker)
            .mapToObj(i -> deliveredShipment(rows, schema, "SV-" + i, customer, branch))
            .toList();
    List<String> issued =
        runParallel(
            workers,
            perWorker,
            t,
            schema,
            (worker, i) ->
                tripFinance
                    .issueInvoice(
                        shipments.get(worker * perWorker + i),
                        new IssueInvoiceRequest(date, date.plusDays(30), null))
                    .getNumber());
    int first = THREADS * PER_THREAD + 1;
    assertThat(issued).doesNotHaveDuplicates();
    assertThat(new TreeSet<>(issued))
        .isEqualTo(expected(date, first, first + workers * perWorker - 1));

    assertThat(
            jdbc.queryForObject(
                "select next_value from \"%s\".document_series where doc_type = 'FREIGHT_INVOICE'"
                    .formatted(schema),
                Long.class))
        .isEqualTo(first + workers * perWorker);
    assertThat(
            jdbc.queryForObject(
                "select is_called from \"%s\".freight_invoice_number_seq".formatted(schema),
                Boolean.class))
        .as("sequence artık ilerlemez")
        .isFalse();
    assertThat(
            jdbc.queryForObject(
                "select count(*) from \"%s\".freight_invoice where company_id = ?"
                    .formatted(schema),
                Long.class,
                company))
        .isEqualTo(workers * perWorker);
  }

  /**
   * B2: seri düzenlemesi numara verirken aynı satır kilidini alır. Yönetici ekranda okuduğu eski
   * {@code nextValue} ile yalnız öneki değiştirmeye çalışırken faturalar kesilirse ya kilitli
   * güncel değer korunur ya da 422 {@code DOCUMENT_SERIES_BACKWARDS} döner; numara asla tekrar
   * üretilmez.
   */
  @Test
  void seriDuzenlemesiEsZamanliNumaraVerilirkenNumarayiGeriAlmaz() throws Exception {
    String t = "dns-" + Long.toString(System.nanoTime(), 36);
    createTenant(t);
    String schema = tenants.findByCode(t).orElseThrow().getSchemaName();
    UUID company =
        jdbc.queryForObject(
            "select id from \"%s\".company where is_default".formatted(schema), UUID.class);
    UUID series =
        jdbc.queryForObject(
            "select id from \"%s\".document_series where doc_type = 'FREIGHT_INVOICE'"
                .formatted(schema),
            UUID.class);
    LocalDate date = tenantToday();
    String path = "/api/v1/organization/companies/" + company + "/document-series/" + series;
    // Test havuzu 5 bağlantılı; düzenleme işlemi denetim kaydı için ikinci bağlantı açar.
    int workers = 3;
    int perWorker = 6;
    ExecutorService pool = Executors.newSingleThreadExecutor();
    try {
      Future<List<String>> numbersFuture =
          pool.submit(
              () ->
                  runParallel(
                      workers,
                      perWorker,
                      t,
                      schema,
                      (worker, i) ->
                          new TransactionTemplate(transactionManager)
                              .execute(
                                  status ->
                                      numbers.next(company, DocumentType.FREIGHT_INVOICE, date))));
      List<Integer> statuses = new ArrayList<>();
      for (int i = 0; i < 6; i++) {
        statuses.add(
            mvc.perform(
                    put(path)
                        .with(asOwner(t))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                            json.writeValueAsString(
                                Map.of("prefix", i % 2 == 0 ? "NFA" : "NFB", "nextValue", 1))))
                .andReturn()
                .getResponse()
                .getStatus());
      }
      List<String> issued = numbersFuture.get(2, TimeUnit.MINUTES);
      assertThat(statuses).allMatch(status -> status == 200 || status == 422);
      List<Long> sequence =
          issued.stream().map(number -> Long.parseLong(number.replaceAll("^.*-", ""))).toList();
      assertThat(sequence).doesNotHaveDuplicates();
      assertThat(new TreeSet<>(sequence))
          .isEqualTo(
              LongStream.rangeClosed(1, workers * perWorker)
                  .boxed()
                  .collect(Collectors.toCollection(TreeSet::new)));
      assertThat(
              jdbc.queryForObject(
                  "select next_value from \"%s\".document_series where id = ?".formatted(schema),
                  Long.class,
                  series))
          .isEqualTo(workers * perWorker + 1L);
    } finally {
      pool.shutdownNow();
    }
    // Geri alma her zaman reddedilir; ileri alma ve önek değişikliği kabul edilir.
    mvc.perform(
            put(path)
                .with(asOwner(t))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("prefix", "NF", "nextValue", 5))))
        .andExpect(status().isUnprocessableEntity());
    mvc.perform(
            put(path)
                .with(asOwner(t))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("prefix", "NF", "nextValue", 100))))
        .andExpect(status().isOk());
    TenantContext.set(t, schema);
    try {
      String next =
          new TransactionTemplate(transactionManager)
              .execute(status -> numbers.next(company, DocumentType.FREIGHT_INVOICE, date));
      assertThat(next).isEqualTo("NF-%d-000100".formatted(date.getYear()));
    } finally {
      TenantContext.clear();
    }
  }

  /**
   * B2 (belirlenimci): numara veren işlem seri satırını kilitliyken gelen düzenleme, satır kilidini
   * bekler; kilit bırakılınca güncel (taahhüt edilmiş) değeri okur ve ekranda kalan bayat {@code
   * nextValue} ile 422 {@code DOCUMENT_SERIES_BACKWARDS} alır. Kilitsiz okuma bayat 1'i okuyup
   * yazardı (200) ve aynı numara yeniden verilirdi.
   */
  @Test
  void seriDuzenlemesiNumaraKilidiniBeklerVeBayatDegeriYazamaz() throws Exception {
    String t = "dnl-" + Long.toString(System.nanoTime(), 36);
    createTenant(t);
    String schema = tenants.findByCode(t).orElseThrow().getSchemaName();
    UUID company =
        jdbc.queryForObject(
            "select id from \"%s\".company where is_default".formatted(schema), UUID.class);
    UUID series =
        jdbc.queryForObject(
            "select id from \"%s\".document_series where doc_type = 'FREIGHT_INVOICE'"
                .formatted(schema),
            UUID.class);
    LocalDate date = tenantToday();
    String path = "/api/v1/organization/companies/" + company + "/document-series/" + series;

    java.util.concurrent.CountDownLatch locked = new java.util.concurrent.CountDownLatch(1);
    java.util.concurrent.CountDownLatch release = new java.util.concurrent.CountDownLatch(1);
    ExecutorService pool = Executors.newFixedThreadPool(2);
    try {
      Future<String> holder =
          pool.submit(
              () -> {
                TenantContext.set(t, schema);
                try {
                  return new TransactionTemplate(transactionManager)
                      .execute(
                          status -> {
                            String number =
                                numbers.next(company, DocumentType.FREIGHT_INVOICE, date);
                            locked.countDown();
                            try {
                              release.await(1, TimeUnit.MINUTES);
                            } catch (InterruptedException ex) {
                              Thread.currentThread().interrupt();
                            }
                            return number;
                          });
                } finally {
                  TenantContext.clear();
                }
              });
      assertThat(locked.await(1, TimeUnit.MINUTES)).isTrue();

      Future<org.springframework.mock.web.MockHttpServletResponse> stale =
          pool.submit(
              () ->
                  mvc.perform(
                          put(path)
                              .with(asOwner(t))
                              .contentType(MediaType.APPLICATION_JSON)
                              .content(
                                  json.writeValueAsString(Map.of("prefix", "NFA", "nextValue", 1))))
                      .andReturn()
                      .getResponse());

      // Düzenleme satır kilidinde bekliyor (uyku yok; bekleyen sorgu görünene kadar yoklanır).
      long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
      boolean waiting = false;
      while (!waiting && System.nanoTime() < deadline) {
        Integer count =
            jdbc.queryForObject(
                "select count(*) from pg_stat_activity where wait_event_type = 'Lock'"
                    + " and query ilike '%document_series%'",
                Integer.class);
        waiting = count != null && count > 0;
        if (!waiting) {
          Thread.onSpinWait();
        }
      }
      assertThat(waiting).as("düzenleme satır kilidini beklemeli").isTrue();
      assertThat(stale.isDone()).isFalse();

      release.countDown();
      assertThat(holder.get(1, TimeUnit.MINUTES))
          .isEqualTo("NF-%d-000001".formatted(date.getYear()));
      org.springframework.mock.web.MockHttpServletResponse response =
          stale.get(1, TimeUnit.MINUTES);
      assertThat(response.getStatus()).isEqualTo(422);
      assertThat(
              json.readTree(response.getContentAsString(java.nio.charset.StandardCharsets.UTF_8))
                  .get("code")
                  .asText())
          .isEqualTo("DOCUMENT_SERIES_BACKWARDS");
    } finally {
      release.countDown();
      pool.shutdownNow();
    }
    Map<String, Object> row =
        jdbc.queryForMap(
            "select next_value, prefix from \"%s\".document_series where id = ?".formatted(schema),
            series);
    assertThat(((Number) row.get("next_value")).longValue()).isEqualTo(2L);
    assertThat(row.get("prefix")).isEqualTo("NF");
    TenantContext.set(t, schema);
    try {
      String next =
          new TransactionTemplate(transactionManager)
              .execute(status -> numbers.next(company, DocumentType.FREIGHT_INVOICE, date));
      assertThat(next).isEqualTo("NF-%d-000002".formatted(date.getYear()));
    } finally {
      TenantContext.clear();
    }
  }

  /**
   * B3: seri satır kilidi şirket başınadır. A'nın serisi açık bir işlemde kilitliyken B numara
   * almaya devam eder (B'nin işi A'nın kilidi bırakılmadan biter); iki şirketin paralel kesimi
   * kendi serisinde boşluksuz ve çiftsiz kalır.
   */
  @Test
  void ikiSirketinSerileriBirbiriniBeklemez() throws Exception {
    String t = "dn2-" + Long.toString(System.nanoTime(), 36);
    createTenant(t);
    String schema = tenants.findByCode(t).orElseThrow().getSchemaName();
    UUID companyA =
        jdbc.queryForObject(
            "select id from \"%s\".company where is_default".formatted(schema), UUID.class);
    UUID companyB =
        UUID.fromString(
            created(
                t,
                "/api/v1/organization/companies",
                Map.of("code", "SIR2", "title", "Beta", "shortName", "Beta", "taxIdType", "VKN")));
    LocalDate date = tenantToday();
    String year = String.valueOf(date.getYear());

    java.util.concurrent.CountDownLatch locked = new java.util.concurrent.CountDownLatch(1);
    java.util.concurrent.CountDownLatch release = new java.util.concurrent.CountDownLatch(1);
    ExecutorService pool = Executors.newFixedThreadPool(2);
    try {
      Future<String> holder =
          pool.submit(
              () -> {
                TenantContext.set(t, schema);
                try {
                  return new TransactionTemplate(transactionManager)
                      .execute(
                          status -> {
                            String number =
                                numbers.next(companyA, DocumentType.FREIGHT_INVOICE, date);
                            locked.countDown();
                            try {
                              release.await(1, TimeUnit.MINUTES);
                            } catch (InterruptedException ex) {
                              Thread.currentThread().interrupt();
                            }
                            return number;
                          });
                } finally {
                  TenantContext.clear();
                }
              });
      assertThat(locked.await(1, TimeUnit.MINUTES)).isTrue();
      Future<List<String>> other =
          pool.submit(
              () ->
                  runParallel(
                      1,
                      3,
                      t,
                      schema,
                      (worker, i) ->
                          new TransactionTemplate(transactionManager)
                              .execute(
                                  status ->
                                      numbers.next(companyB, DocumentType.FREIGHT_INVOICE, date))));
      // A'nın kilidi hâlâ tutuluyor: B'nin numaraları yine de alınır.
      List<String> bNumbers = other.get(1, TimeUnit.MINUTES);
      assertThat(holder.isDone()).isFalse();
      release.countDown();
      assertThat(holder.get(1, TimeUnit.MINUTES)).isEqualTo("NF-" + year + "-000001");
      assertThat(bNumbers)
          .containsExactly(
              "SIR2-NF-" + year + "-000001",
              "SIR2-NF-" + year + "-000002",
              "SIR2-NF-" + year + "-000003");
    } finally {
      release.countDown();
      pool.shutdownNow();
    }

    // İki şirket paralel: her biri kendi serisinde boşluksuz ve çiftsiz.
    UUID[] companies = {companyA, companyB};
    List<String> issued =
        runParallel(
            2,
            5,
            t,
            schema,
            (worker, i) ->
                new TransactionTemplate(transactionManager)
                    .execute(
                        status ->
                            numbers.next(companies[worker], DocumentType.FREIGHT_INVOICE, date)));
    assertThat(issued).doesNotHaveDuplicates();
    assertThat(issued.stream().filter(n -> n.startsWith("NF-")).collect(Collectors.toSet()))
        .isEqualTo(expected(date, 2, 6));
    assertThat(issued.stream().filter(n -> n.startsWith("SIR2-")).count()).isEqualTo(5);
    Set<Long> bSequence =
        issued.stream()
            .filter(n -> n.startsWith("SIR2-"))
            .map(n -> Long.parseLong(n.replaceAll("^.*-", "")))
            .collect(Collectors.toCollection(TreeSet::new));
    Set<Long> expectedB =
        LongStream.rangeClosed(4, 8).boxed().collect(Collectors.toCollection(TreeSet::new));
    assertThat(bSequence).isEqualTo(expectedB);
  }

  private interface Job {
    String run(int worker, int index);
  }

  private static List<String> runParallel(
      int workers, int perWorker, String tenant, String schema, Job job) throws Exception {
    ExecutorService pool = Executors.newFixedThreadPool(workers);
    try {
      List<Future<List<String>>> futures = new ArrayList<>();
      for (int w = 0; w < workers; w++) {
        int worker = w;
        Callable<List<String>> task =
            () -> {
              TenantContext.set(tenant, schema);
              try {
                List<String> out = new ArrayList<>();
                for (int i = 0; i < perWorker; i++) {
                  out.add(job.run(worker, i));
                }
                return out;
              } finally {
                TenantContext.clear();
              }
            };
        futures.add(pool.submit(task));
      }
      List<String> all = new ArrayList<>();
      for (Future<List<String>> future : futures) {
        all.addAll(future.get(2, TimeUnit.MINUTES));
      }
      return all;
    } finally {
      pool.shutdownNow();
    }
  }

  private static Set<String> expected(LocalDate date, int from, int to) {
    return IntStream.rangeClosed(from, to)
        .mapToObj(i -> "NF-%d-%06d".formatted(date.getYear(), i))
        .collect(Collectors.toCollection(TreeSet::new));
  }

  @Test
  void gocSonrasiIlkNumaraSequenceDevamidirVeSequenceIlerlemez() {
    String schema = "dnm_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    Flyway.configure()
        .dataSource(dataSource)
        .schemas(schema)
        .defaultSchema(schema)
        .locations("classpath:db/migration/tenant")
        .target("21")
        .load()
        .migrate();
    jdbc.queryForObject(
        "select setval('\"%s\".freight_invoice_number_seq', 7, true)".formatted(schema),
        Long.class);
    migrator.migrate(schema);
    UUID company =
        jdbc.queryForObject(
            "select id from \"%s\".company where is_default".formatted(schema), UUID.class);
    LocalDate date = LocalDate.of(2026, 11, 13);

    assertThat(next(schema, company, DocumentType.FREIGHT_INVOICE, date))
        .isEqualTo("NF-2026-000008");
    assertThat(next(schema, company, DocumentType.FREIGHT_INVOICE, date))
        .isEqualTo("NF-2026-000009");
    assertThat(next(schema, company, DocumentType.WAREHOUSE_INVOICE, date))
        .isEqualTo("DF-2026-000001");
    assertThat(
            jdbc.queryForObject(
                "select last_value from \"%s\".freight_invoice_number_seq".formatted(schema),
                Long.class))
        .isEqualTo(7);

    // Yıla özel seri varsa yıllara bölünmeyen seriden önce gelir.
    new SchemaRows(jdbc)
        .insert(
            schema,
            "document_series",
            new HashMap<>(
                Map.of(
                    "company_id",
                    company,
                    "doc_type",
                    "FREIGHT_INVOICE",
                    "year",
                    2027,
                    "prefix",
                    "NF27",
                    "next_value",
                    5,
                    "padding",
                    4)));
    assertThat(next(schema, company, DocumentType.FREIGHT_INVOICE, LocalDate.of(2027, 1, 2)))
        .isEqualTo("NF27-2027-0005");
    assertThat(next(schema, company, DocumentType.FREIGHT_INVOICE, date))
        .isEqualTo("NF-2026-000010");

    assertThatThrownBy(() -> next(schema, UUID.randomUUID(), DocumentType.FREIGHT_INVOICE, date))
        .isInstanceOfSatisfying(
            BusinessException.class,
            ex -> assertThat(ex.getCode()).isEqualTo("DOCUMENT_SERIES_MISSING"));
    assertThatThrownBy(() -> numbers.next(company, DocumentType.FREIGHT_INVOICE, date))
        .as("numara yalnız çağıranın işlemi içinde alınır")
        .isInstanceOf(IllegalTransactionStateException.class);
  }

  private String next(String schema, UUID company, DocumentType type, LocalDate date) {
    TenantContext.set("dnm", schema);
    try {
      return new TransactionTemplate(transactionManager)
          .execute(status -> numbers.next(company, type, date));
    } finally {
      TenantContext.clear();
    }
  }

  private static UUID deliveredShipment(
      SchemaRows rows, String schema, String number, UUID customer, UUID branch) {
    return rows.insert(
        schema,
        "shipment",
        Map.of(
            "number",
            number,
            "account_id",
            customer,
            "branch_id",
            branch,
            "status",
            "DELIVERED",
            "net_amount",
            new BigDecimal("100"),
            "vat_amount",
            new BigDecimal("20"),
            "withholding_amount",
            BigDecimal.ZERO,
            "total_amount",
            new BigDecimal("120"),
            "breakdown",
            "{}"));
  }

  private String created(String t, String path, Object body) throws Exception {
    return body(mvc.perform(
                post(path)
                    .with(asOwner(t))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(body)))
            .andExpect(status().isCreated()))
        .get("id")
        .asText();
  }
}
