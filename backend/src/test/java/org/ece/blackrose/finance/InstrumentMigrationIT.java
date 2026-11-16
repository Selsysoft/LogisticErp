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
import org.ece.blackrose.finance.domain.CheckBook;
import org.ece.blackrose.finance.domain.CheckLeaf;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.CheckLeafStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.NoteType;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.domain.Instrument;
import org.ece.blackrose.finance.domain.InstrumentMovement;
import org.ece.blackrose.finance.domain.Settlement;
import org.ece.blackrose.finance.repository.FinanceRepositories.CheckBookRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.CheckLeafRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.InstrumentMovementRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.InstrumentRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.SettlementRepository;
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
 * Faz 12.3 göçü (tenant V37 Z08, V38 Z09) boş ve iki şirketli dolu şemada hatasız çalışır; yeni
 * kolonlar boş/varsayılan kalır; numara tekilliği iptal/iade satırlarını dışlar; şirket bileşik
 * FK'leri ve yaprak tekilliği veritabanında korur; yeni entity ve repository eşlemeleri şemayla
 * uyumludur (docs/zto-finans/uygulama/12.3_TASARIM.md §1.3, §2, §6.1).
 */
class InstrumentMigrationIT extends AccountTestSupport {

  private static final LocalDate DATE = LocalDate.of(2026, 1, 15);
  private static final OffsetDateTime TIME =
      OffsetDateTime.of(2026, 1, 15, 9, 0, 0, 0, ZoneOffset.UTC);

  private static final String FK_VIOLATION = "23503";
  private static final String UNIQUE_VIOLATION = "23505";
  private static final String CHECK_VIOLATION = "23514";

  /** Göç öncesi (V36) instrument kolonları: göç bunları değiştirmez. */
  private static final String INSTRUMENT_ROWS =
      "select id, kind, direction, number, bank_name, account_id, endorsed_account_id, branch_id,"
          + " company_id, fund_account_id, amount, currency, due_date, status, deleted"
          + " from %s.instrument order by id";

  private static final List<String> CONSTRAINTS =
      List.of(
          "instrument_id_company_uq",
          "instrument_custody_company_fk",
          "instrument_note_type_ck",
          "instrument_collateral_ck",
          "instrument_dates_ck",
          "instrument_check_leaf_fk",
          "check_book_id_company_uq",
          "check_book_branch_company_fk",
          "check_book_fund_company_fk",
          "check_book_numbers_ck",
          "check_book_codes_ck",
          "check_book_leaf_count_ck",
          "check_leaf_id_company_uq",
          "check_leaf_book_company_fk",
          "check_leaf_fund_company_fk",
          "check_leaf_number_ck",
          "check_leaf_leaf_no_ck",
          "check_leaf_status_ck",
          "check_leaf_used_ck");

  private static final List<String> INDEXES =
      List.of(
          "instrument_number_uq",
          "instrument_due_idx",
          "instrument_account_idx",
          "instrument_movement_fund_idx",
          "check_book_serial_uq",
          "check_book_company_idx",
          "check_leaf_number_uq",
          "check_leaf_book_idx",
          "check_leaf_status_idx",
          "instrument_check_leaf_uq");

  @Autowired DataSource dataSource;
  @Autowired TenantMigrator migrator;
  @Autowired PlatformTransactionManager transactionManager;

  @Autowired InstrumentRepository instruments;
  @Autowired InstrumentMovementRepository movements;
  @Autowired SettlementRepository settlements;
  @Autowired CheckBookRepository books;
  @Autowired CheckLeafRepository leaves;

  // Boş kiracı
  @Test
  void bosKiracidaGocGecerVeTumKisitVeIndekslerOlusur() {
    String s = schemaAtV36();
    migrator.migrate(s);

    assertThat(
            jdbc.queryForList(
                q(
                    s,
                    "select version from %s.flyway_schema_history where success"
                        + " order by installed_rank"),
                String.class))
        .contains("37", "38");
    assertThat(count(s, "check_book")).isZero();
    assertThat(count(s, "check_leaf")).isZero();
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
    assertNumberIndex(s);
    // İkinci çalıştırma bir şey yapmaz.
    assertThat(flyway(s, null).migrate().migrationsExecuted).isZero();
    flyway(s, null).validate();
  }

  // §1.3 madde 1-2: dolu kiracı
  @Test
  void ikiSirketliDoluKiracidaYeniKolonlarBosVeEskiVeriDegismez() {
    String s = schemaAtV36();
    Fixture f = fixture(s);
    List<Map<String, Object>> before = jdbc.queryForList(q(s, INSTRUMENT_ROWS));
    List<Map<String, Object>> movementsBefore =
        jdbc.queryForList(q(s, "select * from %s.instrument_movement order by id"));

    migrator.migrate(s);

    assertThat(count(s, "instrument")).isEqualTo(5);
    assertThat(jdbc.queryForList(q(s, INSTRUMENT_ROWS))).isEqualTo(before);
    // 1. Yeni kolonlar NULL ya da varsayılan.
    assertThat(
            count(
                s,
                "instrument where issue_date is null and bank_branch is null"
                    + " and drawer_name is null and description is null"
                    + " and custody_fund_id is null and note_type is null"
                    + " and is_collateral = false and settled_date is null"
                    + " and check_leaf_id is null"))
        .isEqualTo(5);
    assertThat(count(s, "instrument_movement where fund_account_id is null")).isEqualTo(6);
    List<Map<String, Object>> movementsAfter =
        jdbc.queryForList(q(s, "select * from %s.instrument_movement order by id"));
    for (int i = 0; i < movementsBefore.size(); i++) {
      Map<String, Object> after = new LinkedHashMap<>(movementsAfter.get(i));
      after.remove("fund_account_id");
      assertThat(after).isEqualTo(movementsBefore.get(i));
    }
    assertThat(
            count(
                s,
                "instrument_movement where movement_type = 'TRANSFERRED' and instrument_id = '"
                    + f.atBank()
                    + "'"))
        .isEqualTo(1);
    // 2. Numara indeksi şirket kolon sırası ve durum koşuluyla yeniden kuruldu.
    assertNumberIndex(s);
  }

  // §1.3 madde 3-8
  @Test
  void kisitlarVeritabanindaKorur() {
    String s = schemaAtV36();
    Fixture f = fixture(s);
    migrator.migrate(s);

    // 3. İptal/iade edilen iki çek aynı numarayı taşır; etkin iki çek taşıyamaz.
    inRolledBackTransaction(
        () -> {
          instrument(s, f.companyA(), f.branchA(), f.customer(), "5555555", "CANCELLED", Map.of());
          instrument(s, f.companyA(), f.branchA(), f.customer(), "5555555", "CANCELLED", Map.of());
          instrument(s, f.companyA(), f.branchA(), f.customer(), "5555555", "RETURNED", Map.of());
          instrument(s, f.companyA(), f.branchA(), f.customer(), "5555555", "PORTFOLIO", Map.of());
        });
    rejected(
        UNIQUE_VIOLATION,
        "instrument_number_uq",
        () -> {
          instrument(s, f.companyA(), f.branchA(), f.customer(), "6666666", "PORTFOLIO", Map.of());
          instrument(s, f.companyA(), f.branchA(), f.customer(), "6666666", "AT_BANK", Map.of());
        });
    // V24 D2 korunur: aynı numara başka şirkette serbest (fixture'da var); aynı şirkette değil.
    rejected(
        UNIQUE_VIOLATION,
        "instrument_number_uq",
        () ->
            instrument(
                s, f.companyA(), f.branchA(), f.customer(), "1234567", "PORTFOLIO", Map.of()));

    // 4. Emanet kasası çekin şirketinde olmalı.
    rejected(
        FK_VIOLATION,
        "instrument_custody_company_fk",
        () ->
            jdbc.update(
                q(s, "update %s.instrument set custody_fund_id = ? where id = ?"),
                f.cashX(),
                f.portfolio()));
    jdbc.update(
        q(s, "update %s.instrument set custody_fund_id = ? where id = ?"),
        f.cashA(),
        f.portfolio());

    // Ek kolon kısıtları: senet türü yalnız senette, teminat yalnız senette, keşide ≤ vade.
    rejected(
        CHECK_VIOLATION,
        "instrument_note_type_ck",
        () ->
            jdbc.update(
                q(s, "update %s.instrument set note_type = 'PLAIN' where id = ?"), f.portfolio()));
    rejected(
        CHECK_VIOLATION,
        "instrument_collateral_ck",
        () ->
            jdbc.update(
                q(s, "update %s.instrument set is_collateral = true where id = ?"), f.portfolio()));
    rejected(
        CHECK_VIOLATION,
        "instrument_dates_ck",
        () ->
            jdbc.update(
                q(s, "update %s.instrument set issue_date = due_date + 1 where id = ?"),
                f.portfolio()));

    // 5. Koçan ve yaprak şirket kapsamı.
    UUID bookA = book(s, f.companyA(), f.branchA(), f.bankA(), "SERI-A");
    rejected(
        FK_VIOLATION,
        "check_leaf_book_company_fk",
        () -> leaf(s, f.companyX(), bookA, f.bankX(), 1, "0000001", "UNUSED"));
    rejected(
        FK_VIOLATION,
        "check_book_fund_company_fk",
        () -> book(s, f.companyA(), f.branchA(), f.bankX(), "SERI-Y"));
    rejected(
        CHECK_VIOLATION,
        "check_book_numbers_ck",
        () ->
            insert(
                s,
                "check_book",
                bookRow(f.companyA(), f.branchA(), f.bankA(), "SERI-Z", "0000010", "0000001")));
    rejected(
        CHECK_VIOLATION,
        "check_leaf_used_ck",
        () -> leaf(s, f.companyA(), bookA, f.bankA(), 1, "0000099", "USED"));
    rejected(
        CHECK_VIOLATION,
        "check_leaf_number_ck",
        () -> leaf(s, f.companyA(), bookA, f.bankA(), 1, "123", "UNUSED"));
    UUID leafA = leaf(s, f.companyA(), bookA, f.bankA(), 1, "0000001", "UNUSED");
    UUID bookX = book(s, f.companyX(), f.branchX(), f.bankX(), "SERI-X");
    UUID leafX = leaf(s, f.companyX(), bookX, f.bankX(), 1, "0000001", "UNUSED");

    // 6. Çek başka şirketin yaprağına bağlanamaz.
    rejected(
        FK_VIOLATION,
        "instrument_check_leaf_fk",
        () ->
            jdbc.update(
                q(s, "update %s.instrument set check_leaf_id = ? where id = ?"),
                leafX,
                f.issued()));

    // 7. Aynı fonda aynı yaprak numarası ikinci kez eklenemez (başka fonda serbest).
    rejected(
        UNIQUE_VIOLATION,
        "check_leaf_number_uq",
        () -> leaf(s, f.companyA(), bookA, f.bankA(), 2, "0000001", "UNUSED"));

    // 8. Etkin iki çek aynı yaprağı gösteremez; iptal edilen gösterebilir.
    jdbc.update(q(s, "update %s.instrument set check_leaf_id = ? where id = ?"), leafA, f.issued());
    rejected(
        UNIQUE_VIOLATION,
        "instrument_check_leaf_uq",
        () ->
            instrument(
                s,
                f.companyA(),
                f.branchA(),
                f.customer(),
                "7777777",
                "ISSUED",
                Map.of("direction", "ISSUED", "check_leaf_id", leafA)));
    instrument(
        s,
        f.companyA(),
        f.branchA(),
        f.customer(),
        "7777777",
        "CANCELLED",
        Map.of("direction", "ISSUED", "check_leaf_id", leafA));
    assertThat(count(s, "instrument where check_leaf_id = '" + leafA + "'")).isEqualTo(2);
  }

  // Entity ve repository eşlemeleri (ddl-auto none: kolon adları yalnız çalışırken doğrulanır)
  @Test
  void yeniEntityVeRepositoryEslemeleriSemaylaUyumludur() throws Exception {
    World w = world("ins-mig");
    UUID companyA = w.companyAId();
    UUID a1 = UUID.fromString(w.a1());
    UUID fundA1 = UUID.fromString(w.fundA1());
    UUID customer = account(w, AccountType.CUSTOMER, null);
    Map<String, UUID> ids = new HashMap<>();

    inTenant(
        w,
        () -> {
          CheckBook book =
              books.save(
                  new CheckBook(
                      companyA, a1, fundA1, "SER-1", "0012", "0345", "0000001", "0000003", 3));
          ids.put("book", book.getId());
          for (int i = 1; i <= 3; i++) {
            CheckLeaf leaf =
                leaves.save(
                    new CheckLeaf(
                        companyA, book.getId(), fundA1, i, "000000" + i, "MICR-" + i + "-0012"));
            ids.put("leaf" + i, leaf.getId());
          }
          leaves.flush();
          CheckLeaf used = leaves.findForUpdate(ids.get("leaf1")).orElseThrow();
          used.use(TODAY);

          Instrument issued =
              instruments.save(
                  new Instrument(
                      InstrumentKind.CHECK,
                      InstrumentDirection.ISSUED,
                      "0000001",
                      "Ziraat",
                      customer,
                      a1,
                      companyA,
                      Money.of("50", "TRY"),
                      TODAY.plusDays(30),
                      InstrumentStatus.ISSUED));
          issued.withDetails(TODAY, "Merkez", null, "Açıklama", null);
          issued.attachLeaf(used.getId());
          issued.assignFund(fundA1);
          ids.put("issued", issued.getId());
          movements.save(
              new InstrumentMovement(
                  issued.getId(), null, InstrumentStatus.ISSUED, TODAY, null, fundA1));

          Instrument note =
              instruments.save(
                  new Instrument(
                      InstrumentKind.NOTE,
                      InstrumentDirection.RECEIVED,
                      "SN-1",
                      null,
                      customer,
                      a1,
                      companyA,
                      Money.of("70", "TRY"),
                      TODAY.plusDays(60),
                      InstrumentStatus.PORTFOLIO));
          note.withDetails(TODAY, null, "Ahmet Keşideci", null, NoteType.ORDER);
          note.assignCustody(fundA1);
          ids.put("note", note.getId());

          Settlement origin =
              settlements.save(
                  new Settlement(
                      SettlementType.PAYMENT,
                      SettlementMethod.CHECK,
                      customer,
                      a1,
                      companyA,
                      null,
                      issued.getId(),
                      null,
                      null,
                      Money.of("50", "TRY"),
                      TODAY,
                      null,
                      null));
          ids.put("origin", origin.getId());
          // Alınan senette ödeme kaydı köken değil (ciro biçimi).
          settlements.save(
              new Settlement(
                  SettlementType.PAYMENT,
                  SettlementMethod.CHECK,
                  customer,
                  a1,
                  companyA,
                  null,
                  note.getId(),
                  null,
                  null,
                  Money.of("70", "TRY"),
                  TODAY,
                  null,
                  null));
        });

    inTenant(
        w,
        () -> {
          CheckLeaf used = leaves.findById(ids.get("leaf1")).orElseThrow();
          assertThat(used.getStatus()).isEqualTo(CheckLeafStatus.USED);
          assertThat(used.getUsedDate()).isEqualTo(TODAY);
          assertThat(used.getNumber()).isEqualTo("0000001");
          assertThat(used.getLeafNo()).isEqualTo(1);
          assertThat(used.getMicrCode()).isEqualTo("MICR-1-0012");
          assertThat(used.getCompanyId()).isEqualTo(companyA);
          assertThat(used.getCheckBookId()).isEqualTo(ids.get("book"));
          used.release();
          used.voidLeaf("Ödeme iptali");
          CheckLeaf spare = leaves.findById(ids.get("leaf3")).orElseThrow();
          spare.softDelete();

          CheckBook book = books.findById(ids.get("book")).orElseThrow();
          assertThat(book.getCompanyId()).isEqualTo(companyA);
          assertThat(book.getBranchId()).isEqualTo(a1);
          assertThat(book.getFundAccountId()).isEqualTo(fundA1);
          assertThat(book.getSerialNo()).isEqualTo("SER-1");
          assertThat(book.getBankCode()).isEqualTo("0012");
          assertThat(book.getBranchCode()).isEqualTo("0345");
          assertThat(book.getStartNumber()).isEqualTo("0000001");
          assertThat(book.getEndNumber()).isEqualTo("0000003");
          assertThat(book.getLeafCount()).isEqualTo(3);
          assertThat(books.existsByFundAccountIdAndSerialNoAndDeletedFalse(fundA1, "SER-1"))
              .isTrue();
          assertThat(books.existsByFundAccountIdAndSerialNoAndDeletedFalse(fundA1, "SER-2"))
              .isFalse();

          Instrument issued = instruments.findById(ids.get("issued")).orElseThrow();
          assertThat(issued.getIssueDate()).isEqualTo(TODAY);
          assertThat(issued.getBankBranch()).isEqualTo("Merkez");
          assertThat(issued.getDescription()).isEqualTo("Açıklama");
          assertThat(issued.getCheckLeafId()).isEqualTo(ids.get("leaf1"));
          assertThat(issued.isCollateral()).isFalse();
          issued.changeNumber("0000002");
          issued.changeBankName("Garanti");
          issued.changeDueDate(TODAY.plusDays(40));
          issued.markSettled(TODAY);
          issued.clearFund();
          Instrument note = instruments.findById(ids.get("note")).orElseThrow();
          assertThat(note.getNoteType()).isEqualTo(NoteType.ORDER);
          assertThat(note.getDrawerName()).isEqualTo("Ahmet Keşideci");
          assertThat(note.getCustodyFundId()).isEqualTo(fundA1);
          note.clearCustody();
          note.endorseTo(customer);
          note.clearEndorsement();

          assertThat(
                  movements
                      .findByInstrumentIdAndDeletedFalseOrderByCreatedAt(ids.get("issued"))
                      .get(0)
                      .getFundAccountId())
              .isEqualTo(fundA1);
          assertThat(
                  instruments.findByCheckLeafIdAndDeletedFalse(ids.get("leaf1")).stream()
                      .map(Instrument::getId))
              .containsExactly(ids.get("issued"));
          // Köken: verilen çekte ödeme; alınan senetteki ödeme (ciro biçimi) köken değil.
          assertThat(settlements.findOriginByInstrumentId(ids.get("issued")))
              .map(Settlement::getId)
              .contains(ids.get("origin"));
          assertThat(settlements.findOriginByInstrumentId(ids.get("note"))).isEmpty();
        });

    inTenant(
        w,
        () -> {
          CheckLeaf voided = leaves.findById(ids.get("leaf1")).orElseThrow();
          assertThat(voided.getStatus()).isEqualTo(CheckLeafStatus.VOID);
          assertThat(voided.getVoidReason()).isEqualTo("Ödeme iptali");
          assertThat(voided.getUsedDate()).isNull();
          assertThat(leaves.findById(ids.get("leaf3"))).isEmpty();
          assertThat(leaves.findNumbersByFundAccountId(fundA1))
              .containsExactlyInAnyOrder("0000001", "0000002");
          assertThat(leaves.findByFundAccountIdAndNumberAndDeletedFalse(fundA1, "0000002"))
              .map(CheckLeaf::getId)
              .contains(ids.get("leaf2"));
          assertThat(leaves.findByFundAccountIdAndNumberAndDeletedFalse(fundA1, "0000003"))
              .isEmpty();
          assertThatThrownBy(() -> voided.use(TODAY)).isInstanceOf(IllegalStateException.class);
          assertThatThrownBy(voided::release).isInstanceOf(IllegalStateException.class);
          assertThatThrownBy(() -> voided.voidLeaf("x")).isInstanceOf(IllegalStateException.class);
          assertThatThrownBy(voided::softDelete).isInstanceOf(IllegalStateException.class);

          Instrument issued = instruments.findById(ids.get("issued")).orElseThrow();
          assertThat(issued.getNumber()).isEqualTo("0000002");
          assertThat(issued.getBankName()).isEqualTo("Garanti");
          assertThat(issued.getDueDate()).isEqualTo(TODAY.plusDays(40));
          assertThat(issued.getSettledDate()).isEqualTo(TODAY);
          assertThat(issued.getFundAccountId()).isNull();
          Instrument note = instruments.findById(ids.get("note")).orElseThrow();
          assertThat(note.getCustodyFundId()).isNull();
          assertThat(note.getEndorsedAccountId()).isNull();

          // Numara tekilliği: enum ve metin imzaları, excludeId, banka adı eşlemesi.
          assertThat(
                  instruments.existsActiveNumber(
                      companyA,
                      InstrumentKind.CHECK,
                      InstrumentDirection.ISSUED,
                      "0000002",
                      "Garanti",
                      null))
              .isTrue();
          assertThat(
                  instruments.existsActiveNumber(
                      companyA,
                      InstrumentKind.CHECK,
                      InstrumentDirection.ISSUED,
                      "0000002",
                      "Garanti",
                      issued.getId()))
              .isFalse();
          assertThat(
                  instruments.existsActiveNumber(
                      companyA,
                      InstrumentKind.CHECK,
                      InstrumentDirection.ISSUED,
                      "0000002",
                      null,
                      null))
              .isFalse();
          assertThat(
                  instruments.existsActiveNumber(
                      w.companyBId(),
                      InstrumentKind.CHECK,
                      InstrumentDirection.ISSUED,
                      "0000002",
                      "Garanti",
                      null))
              .isFalse();
          assertThat(
                  instruments.findActiveByNumber(
                      companyA,
                      InstrumentKind.NOTE,
                      InstrumentDirection.RECEIVED,
                      "SN-1",
                      null,
                      null))
              .map(Instrument::getId)
              .contains(ids.get("note"));
          issued.moveTo(InstrumentStatus.CANCELLED);
          instruments.flush();
          assertThat(
                  instruments.findActiveByNumber(
                      companyA,
                      InstrumentKind.CHECK,
                      InstrumentDirection.ISSUED,
                      "0000002",
                      "Garanti",
                      null))
              .isEmpty();
        });
  }

  private record Fixture(
      UUID companyA,
      UUID companyX,
      UUID branchA,
      UUID branchX,
      UUID customer,
      UUID bankA,
      UUID cashA,
      UUID bankX,
      UUID cashX,
      UUID portfolio,
      UUID atBank,
      UUID issued) {}

  /**
   * V36 şemasında iki şirket: A'da portföy, bankada, cirolu ve ödenmiş verilen çek; X'te A'daki
   * portföy çekiyle aynı numara (V24 D2); bankadaki çekte cari taşıma (TRANSFERRED) hareketi.
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
    UUID customer = account(s, "MUS-1");
    UUID customer2 = account(s, "MUS-2");
    UUID supplier = account(s, "TED-1");
    UUID bankA = insert(s, "fund_account", fund(companyA, branchA, "BNK-A", "BANK"));
    UUID cashA = insert(s, "fund_account", fund(companyA, branchA, "KASA-A", "CASH"));
    UUID bankX = insert(s, "fund_account", fund(companyX, branchX, "BNK-X", "BANK"));
    UUID cashX = insert(s, "fund_account", fund(companyX, branchX, "KASA-X", "CASH"));

    UUID portfolio = instrument(s, companyA, branchA, customer, "1234567", "PORTFOLIO", Map.of());
    instrument(s, companyX, branchX, customer, "1234567", "PORTFOLIO", Map.of());
    UUID atBank =
        instrument(
            s, companyA, branchA, customer, "AB-1", "AT_BANK", Map.of("fund_account_id", bankA));
    UUID endorsed =
        instrument(
            s,
            companyA,
            branchA,
            customer,
            "EN-1",
            "ENDORSED",
            Map.of("endorsed_account_id", supplier));
    UUID issued =
        instrument(
            s,
            companyA,
            branchA,
            supplier,
            "PD-1",
            "PAID",
            Map.of("direction", "ISSUED", "fund_account_id", bankA));
    movement(s, portfolio, null, "PORTFOLIO", Map.of());
    movement(s, atBank, "PORTFOLIO", "AT_BANK", Map.of());
    movement(s, endorsed, "PORTFOLIO", "ENDORSED", Map.of());
    movement(s, issued, "ISSUED", "PAID", Map.of());
    movement(s, issued, null, "ISSUED", Map.of());
    UUID transfer =
        insert(
            s,
            "account_transfer",
            Map.of("from_account_id", customer, "to_account_id", customer2, "transfer_date", DATE));
    movement(
        s,
        atBank,
        "AT_BANK",
        "AT_BANK",
        Map.of(
            "movement_type",
            "TRANSFERRED",
            "from_account_id",
            customer,
            "to_account_id",
            customer2,
            "account_transfer_id",
            transfer));
    return new Fixture(
        companyA, companyX, branchA, branchX, customer, bankA, cashA, bankX, cashX, portfolio,
        atBank, issued);
  }

  private UUID instrument(
      String s,
      UUID company,
      UUID branch,
      UUID account,
      String number,
      String status,
      Map<String, Object> extra) {
    Map<String, Object> values = new HashMap<>();
    values.put("kind", "CHECK");
    values.put("direction", "RECEIVED");
    values.put("number", number);
    values.put("bank_name", "Ziraat");
    values.put("account_id", account);
    values.put("branch_id", branch);
    values.put("company_id", company);
    values.put("amount", new BigDecimal("100"));
    values.put("currency", "TRY");
    values.put("due_date", DATE.plusDays(30));
    values.put("status", status);
    values.putAll(extra);
    return insert(s, "instrument", values);
  }

  private void movement(
      String s, UUID instrument, String from, String to, Map<String, Object> extra) {
    Map<String, Object> values = new HashMap<>();
    values.put("instrument_id", instrument);
    values.put("from_status", from);
    values.put("to_status", to);
    values.put("movement_date", DATE);
    values.putAll(extra);
    insert(s, "instrument_movement", values);
  }

  private UUID book(String s, UUID company, UUID branch, UUID fund, String serial) {
    return insert(s, "check_book", bookRow(company, branch, fund, serial, "0000001", "0000050"));
  }

  private static Map<String, Object> bookRow(
      UUID company, UUID branch, UUID fund, String serial, String start, String end) {
    Map<String, Object> values = new HashMap<>();
    values.put("company_id", company);
    values.put("branch_id", branch);
    values.put("fund_account_id", fund);
    values.put("serial_no", serial);
    values.put("start_number", start);
    values.put("end_number", end);
    values.put("leaf_count", 50);
    return values;
  }

  private UUID leaf(
      String s, UUID company, UUID book, UUID fund, int leafNo, String number, String status) {
    Map<String, Object> values = new HashMap<>();
    values.put("company_id", company);
    values.put("check_book_id", book);
    values.put("fund_account_id", fund);
    values.put("leaf_no", leafNo);
    values.put("number", number);
    values.put("status", status);
    return insert(s, "check_leaf", values);
  }

  private UUID account(String s, String code) {
    Map<String, Object> values = new HashMap<>();
    values.put("code", code);
    values.put("name", code);
    values.put("type", code.startsWith("TED") ? "SUPPLIER" : "CUSTOMER");
    values.put("sub_group", code.startsWith("TED") ? "GENEL" : "MUSTERI");
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

  private void assertNumberIndex(String s) {
    String def =
        jdbc.queryForObject(
            "select pg_get_indexdef(to_regclass(?))",
            String.class,
            "\"" + s + "\".instrument_number_uq");
    assertThat(def).contains("(company_id, kind, direction").contains("status");
    assertThat(def).contains("CANCELLED").contains("RETURNED");
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

  private String schemaAtV36() {
    String schema = "imig_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    flyway(schema, "36").migrate();
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
   * SettlementMigrationIT} deseni).
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
