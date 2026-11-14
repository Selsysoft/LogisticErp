package org.ece.blackrose.organization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.AccountTestSupport;
import org.ece.blackrose.finance.domain.AccountBankAccount;
import org.ece.blackrose.finance.domain.AccountBankAccount.BankAccountData;
import org.ece.blackrose.finance.domain.AccountCompanyLimit;
import org.ece.blackrose.finance.domain.AccountDocument;
import org.ece.blackrose.finance.domain.AccountDocumentTax;
import org.ece.blackrose.finance.domain.AccountDocumentType;
import org.ece.blackrose.finance.domain.AccountGroup;
import org.ece.blackrose.finance.domain.AccountRollover;
import org.ece.blackrose.finance.domain.AccountTransfer;
import org.ece.blackrose.finance.domain.AccountTransferInstrument;
import org.ece.blackrose.finance.domain.AccountTransferLine;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentSide;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.BankAccountCategory;
import org.ece.blackrose.finance.domain.FinanceTypes.BankAccountKind;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.DocumentAudience;
import org.ece.blackrose.finance.domain.FinanceTypes.DocumentPaymentMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentMovementType;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;
import org.ece.blackrose.finance.domain.InstrumentMovement;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountBankAccountRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountCompanyLimitRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountDocumentRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountDocumentTaxRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountDocumentTypeRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountGroupRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountRolloverRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountTransferInstrumentRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountTransferLineRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountTransferRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.InstrumentMovementRepository;
import org.ece.blackrose.finance.service.AccountTaxNumberBackfill;
import org.ece.blackrose.identity.security.PersonalDataProtector;
import org.ece.blackrose.tenant.TenantContext;
import org.ece.blackrose.tenant.service.TenantMigrator;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.output.MigrateResult;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Faz 12.1 göçü (tenant V27–V30) boş ve dolu şemada hatasız çalışır; kısıtlar veritabanında korur;
 * cari TCKN'leri uygulama içinde şifreli kolonlara taşınır; yeni entity ve repository eşlemeleri
 * şemayla uyumludur (docs/zto-finans/uygulama/12.1_TASARIM.md §1, §2, §6.1).
 */
class AccountMigrationIT extends AccountTestSupport {

  private static final String TCKN = "10000000146";

  @Autowired DataSource dataSource;
  @Autowired TenantMigrator migrator;
  @Autowired AccountTaxNumberBackfill backfill;
  @Autowired PersonalDataProtector protector;
  @Autowired PlatformTransactionManager transactionManager;

  @Autowired AccountRepository accounts;
  @Autowired AccountTransactionRepository transactions;
  @Autowired InstrumentMovementRepository movements;
  @Autowired AccountGroupRepository groups;
  @Autowired AccountCompanyLimitRepository limits;
  @Autowired AccountBankAccountRepository bankAccounts;
  @Autowired AccountDocumentTypeRepository documentTypes;
  @Autowired AccountDocumentRepository documents;
  @Autowired AccountDocumentTaxRepository documentTaxes;
  @Autowired AccountRolloverRepository rollovers;
  @Autowired AccountTransferRepository transfers;
  @Autowired AccountTransferLineRepository transferLines;
  @Autowired AccountTransferInstrumentRepository transferInstruments;

  // M-1
  @Test
  void bosKiracidaTohumlarOlusur() {
    String s = schemaAtV26();
    migrator.migrate(s);

    assertSeeds(s);
  }

  // M-2
  @Test
  void doluKiracidaKartlarVarsayilanGrubaBaglanirVeDefterDegismez() {
    String s = schemaAtV26();
    Fixture f = fixture(s);
    Map<String, Object> before = ledgerTotals(s);

    migrator.migrate(s);

    assertSeeds(s);
    assertThat(count(s, "account where sub_group is null")).isZero();
    assertThat(
            count(
                s,
                "account a where not exists (select 1 from %s.account_group g"
                    + " where g.account_type = a.type and g.code = a.sub_group)"))
        .isZero();
    for (AccountType type : AccountType.values()) {
      assertThat(
              jdbc.queryForList(
                  q(s, "select distinct sub_group from %s.account where type = ?"),
                  String.class,
                  type.name()))
          .as(type.name())
          .containsExactly(type.defaultSubGroup());
    }
    assertThat(
            jdbc.queryForObject(
                q(s, "select sub_group from %s.account where id = ?"), String.class, f.deleted()))
        .isEqualTo("GENEL");
    assertThat(count(s, "account where not active or update_count <> 0")).isZero();
    assertThat(count(s, "account")).isEqualTo(8);
    assertThat(ledgerTotals(s)).isEqualTo(before);
    assertThat(count(s, "instrument_movement")).isEqualTo(2);
    assertThat(count(s, "instrument_movement where movement_type <> 'STATUS'")).isZero();
  }

  // M-3
  @Test
  void kisitlarVeritabanindaKorur() {
    String s = schemaAtV26();
    Fixture f = fixture(s);
    migrator.migrate(s);
    SchemaRows rows = new SchemaRows(jdbc);
    UUID other =
        rows.insert(
            s,
            "company",
            Map.of(
                "code", "SIRKET2", "title", "İkinci", "short_name", "İkinci", "is_default", false));

    rejected(
        "account_sub_group_fk",
        () ->
            rows.insert(
                s, "account", Map.of("code", "X1", "type", "CUSTOMER", "sub_group", "GENEL")));
    rejected(
        "account_tax_number_hash_ck",
        () ->
            rows.insert(
                s,
                "account",
                Map.of(
                    "code",
                    "X2",
                    "type",
                    "CUSTOMER",
                    "sub_group",
                    "MUSTERI",
                    "tax_number_enc",
                    "e")));

    // Banka hesabı
    rejected(
        "account_bank_account_iban_or_number_ck",
        () -> rows.insert(s, "account_bank_account", bank(f.customer(), Map.of())));
    rejected(
        "account_bank_account_iban_hash_ck",
        () -> rows.insert(s, "account_bank_account", bank(f.customer(), Map.of("iban_enc", "e"))));
    Map<String, Object> iban = Map.of("iban_enc", "e", "iban_hash", "h".repeat(64));
    rejected(
        "account_bank_account_iban_uq",
        () -> {
          rows.insert(s, "account_bank_account", bank(f.customer(), iban));
          rows.insert(s, "account_bank_account", bank(f.supplier(), iban));
        });
    inRolledBackTransaction(
        () -> {
          rows.insert(s, "account_bank_account", bank(f.customer(), iban));
          Map<String, Object> passive = new HashMap<>(iban);
          passive.put("active", false);
          rows.insert(s, "account_bank_account", bank(f.supplier(), passive));
        });

    // Borç/Alacak belgesi
    rejected(
        "account_document_ledger_ck",
        () -> rows.insert(s, "account_document", document(f, Map.of("ledger_amount", "NULL"))));
    rejected(
        "account_document_ledger_ck",
        () ->
            rows.insert(
                s,
                "account_document",
                document(f, Map.of("reflect_to_ledger", false, "ledger_amount", BigDecimal.TEN))));
    rejected(
        "account_document_cancel_ck",
        () -> rows.insert(s, "account_document", document(f, Map.of("status", "CANCELLED"))));
    rejected(
        "account_document_branch_company_fk",
        () -> rows.insert(s, "account_document", document(f, Map.of("company_id", other))));
    rejected(
        "account_document_type_fk",
        () ->
            rows.insert(
                s, "account_document", document(f, Map.of("document_type", "ALIS_FATURASI"))));
    inRolledBackTransaction(() -> rows.insert(s, "account_document", document(f, Map.of())));

    // Devir
    rejected(
        "account_rollover_active_uq",
        () -> {
          rows.insert(s, "account_rollover", rollover(f.customer(), 1, true, false));
          rows.insert(s, "account_rollover", rollover(f.customer(), 2, true, false));
        });
    rejected(
        "account_rollover_deleted_ck",
        () -> rows.insert(s, "account_rollover", rollover(f.customer(), 3, true, true)));

    // Taşıma
    rejected(
        "account_transfer_accounts_ck",
        () ->
            rows.insert(
                s,
                "account_transfer",
                Map.of("from_account_id", f.customer(), "to_account_id", f.customer())));
    rejected(
        "account_transfer_line_tx_uq",
        () -> {
          UUID transfer =
              rows.insert(
                  s,
                  "account_transfer",
                  Map.of("from_account_id", f.customer(), "to_account_id", f.supplier()));
          rows.insert(s, "account_transfer_line", line(f, transfer));
          rows.insert(s, "account_transfer_line", line(f, transfer));
        });
    rejected(
        "instrument_movement_transfer_ck",
        () -> {
          UUID transfer =
              rows.insert(
                  s,
                  "account_transfer",
                  Map.of("from_account_id", f.customer(), "to_account_id", f.supplier()));
          Map<String, Object> movement = new HashMap<>();
          movement.put("instrument_id", f.instrument());
          movement.put("movement_type", "TRANSFERRED");
          movement.put("from_status", "PORTFOLIO");
          movement.put("to_status", "ENDORSED");
          movement.put("from_account_id", f.customer());
          movement.put("to_account_id", f.supplier());
          movement.put("account_transfer_id", transfer);
          rows.insert(s, "instrument_movement", movement);
        });

    // Geri alınan işlemlerden kalıntı yok.
    for (String table :
        List.of(
            "account_bank_account",
            "account_document",
            "account_rollover",
            "account_transfer",
            "account_transfer_line")) {
      assertThat(count(s, table)).as(table).isZero();
    }
    assertThat(count(s, "account")).isEqualTo(8);
  }

  // M-5
  @Test
  void gocIkinciKezCalisincaHicbirSeyYapmaz() {
    String s = schemaAtV26();
    migrator.migrate(s);

    MigrateResult again = flyway(s, null).migrate();
    assertThat(again.migrationsExecuted).isZero();
    flyway(s, null).validate();
    assertThat(
            jdbc.queryForList(
                q(
                    s,
                    "select version from %s.flyway_schema_history where success order by installed_rank"),
                String.class))
        .contains("26", "27", "28", "29", "30");
  }

  // M-6
  @Test
  void bireyselCariTckniSifreliKolonlaraTasinir() {
    String s = schemaAtV26();
    Fixture f = fixture(s);
    jdbc.update(q(s, "update %s.account set tax_number = ? where id = ?"), TCKN, f.customer());
    jdbc.update(q(s, "update %s.account set tax_number = '12345678901' where id = ?"), f.deleted());
    jdbc.update(q(s, "update %s.account set tax_number = '1234567890' where id = ?"), f.supplier());
    jdbc.update(
        q(s, "update %s.account set tax_number = '11111111110' where id = ?"), f.intercompany());
    migrator.migrate(s);

    assertThat(backfill.backfill(s)).isEqualTo(2);

    Map<String, Object> customer = accountRow(s, f.customer());
    assertThat(customer.get("tax_number")).isNull();
    assertThat((String) customer.get("tax_number_enc")).doesNotContain(TCKN);
    assertThat(protector.decrypt((String) customer.get("tax_number_enc"))).isEqualTo(TCKN);
    assertThat((String) customer.get("tax_number_hash"))
        .matches("[0-9a-f]{64}")
        .isEqualTo(protector.hash(TCKN));
    assertThat(customer.get("tax_number_masked")).isEqualTo("*******0146");
    Map<String, Object> deleted = accountRow(s, f.deleted());
    assertThat(deleted.get("tax_number")).isNull();
    assertThat(deleted.get("tax_number_masked")).isEqualTo("*******8901");
    assertThat(accountRow(s, f.supplier()).get("tax_number")).isEqualTo("1234567890");
    assertThat(accountRow(s, f.supplier()).get("tax_number_enc")).isNull();
    assertThat(accountRow(s, f.intercompany()).get("tax_number")).isEqualTo("11111111110");
    assertThat(accountRow(s, f.intercompany()).get("tax_number_enc")).isNull();

    // İkinci çalıştırma bir şey yapmaz; uygulama açılışındaki sessiz sürüm de aynı.
    assertThat(backfill.backfill(s)).isZero();
    assertThat(backfill.backfillQuietly(s)).isZero();
    assertThat(backfill.backfillQuietly("Geçersiz; şema")).isEqualTo(-1);

    // Şifreli adres TEXT kolonuna sığar (1000 Türkçe karakter).
    String address = "ğüşİöçĞÜŞıÖÇ ".repeat(80).substring(0, 1000);
    jdbc.update(
        q(s, "update %s.account set address_enc = ? where id = ?"),
        protector.encrypt(address),
        f.customer());
    assertThat(protector.decrypt((String) accountRow(s, f.customer()).get("address_enc")))
        .isEqualTo(address);
  }

  /** Yeni entity'ler ve repository sorguları gerçek kiracı şemasında çalışır. */
  @Test
  void entityVeRepositoryEslemeleriSemaylaUyumludur() throws Exception {
    World w = world("acc-mig");
    UUID customer = account(w, AccountType.CUSTOMER, "ACENTE");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    UUID a1 = UUID.fromString(w.a1());
    UUID tx = manual(w, customer, w.a1(), Direction.DEBIT, "100", "TRY");
    UUID instrument =
        new SchemaRows(jdbc)
            .insert(
                w.schema(),
                "instrument",
                Map.of(
                    "kind",
                    "CHECK",
                    "direction",
                    "RECEIVED",
                    "number",
                    "C-1",
                    "account_id",
                    customer,
                    "branch_id",
                    a1,
                    "company_id",
                    w.companyAId(),
                    "status",
                    "PORTFOLIO"));

    inTenant(
        w,
        () -> {
          assertThat(accounts.findForUpdate(customer).orElseThrow().getSubGroup())
              .isEqualTo("ACENTE");
          assertThat(accounts.findById(supplier).orElseThrow().getSubGroup()).isEqualTo("GENEL");
          assertThat(accounts.findById(supplier).orElseThrow().isActive()).isTrue();
          assertThat(transactions.findForUpdate(tx)).isPresent();
          assertThat(transactions.findAllForUpdate(List.of(tx))).hasSize(1);

          List<AccountGroup> all = groups.findAllByOrderBySortOrder();
          assertThat(all).hasSize(14);
          assertThat(all.get(0).getCode()).isEqualTo("MUSTERI");
          assertThat(groups.findByAccountTypeAndTypeDefaultTrue(AccountType.CARRIER))
              .get()
              .extracting(AccountGroup::getCode)
              .isEqualTo("TASERON_NAKLIYECI");
          AccountGroup group = groups.findForUpdate("MUSTERI").orElseThrow();
          assertThat(group.issueNextCode()).isEqualTo("MUS-000001");
          assertThat(group.issueNextCode()).isEqualTo("MUS-000002");

          List<AccountDocumentType> types =
              documentTypes.findAllByActiveTrueOrderBySideAscSortOrderAsc();
          assertThat(types).hasSize(31);
          AccountDocumentType service =
              documentTypes
                  .findById(new AccountDocumentType.Key(AccountDocumentSide.PAYABLE, "CEZA_BIZE"))
                  .orElseThrow();
          assertThat(service.isPenalty()).isTrue();
          assertThat(service.getAudience()).isEqualTo(DocumentAudience.ALL);
        });
    // Sayaç işlem sonunda yazıldı.
    assertThat(
            jdbc.queryForObject(
                "select next_code from \"%s\".account_group where code = 'MUSTERI'"
                    .formatted(w.schema()),
                Long.class))
        .isEqualTo(3);

    inTenant(
        w,
        () -> {
          limits.save(
              new AccountCompanyLimit(customer, w.companyAId(), BigDecimal.TEN, BigDecimal.ONE));
          AccountBankAccount bank =
              bankAccounts.save(
                  new AccountBankAccount(
                      customer,
                      new BankAccountData(
                          "Ziraat",
                          "Kadıköy",
                          null,
                          null,
                          protector.encrypt("TR330006100519786457841326"),
                          protector.hash("TR330006100519786457841326"),
                          "TR33 **** 1326",
                          "Cari Sahibi",
                          "TRY",
                          null,
                          null,
                          TODAY,
                          null)));
          assertThat(bank.getAccountKind()).isEqualTo(BankAccountKind.DEMAND);
          assertThat(bank.getCategory()).isEqualTo(BankAccountCategory.SUB);
          AccountDocument document =
              documents.save(
                  new AccountDocument(
                      customer,
                      a1,
                      w.companyAId(),
                      AccountDocumentSide.RECEIVABLE,
                      "SATIS_FATURASI",
                      "F-1",
                      TODAY,
                      TODAY.plusDays(30),
                      Money.of("1000", "TRY"),
                      null,
                      DocumentPaymentMethod.BANK,
                      "Satış",
                      true,
                      new BigDecimal("1080"),
                      "idem-1"));
          documentTaxes.save(
              AccountDocumentTax.compute(
                  document.getId(), new BigDecimal("1000"), null, new BigDecimal("8"), null, null));
          AccountRollover first = rollovers.save(new AccountRollover(customer, TODAY, "2026"));
          first.activate();
          rollovers.save(new AccountRollover(customer, TODAY.plusDays(1), "2027"));
          AccountTransfer transfer =
              transfers.save(new AccountTransfer(customer, supplier, TODAY, "Taşıma", "idem-t"));
          transferLines.save(
              new AccountTransferLine(
                  transfer.getId(),
                  tx,
                  a1,
                  w.companyAId(),
                  Direction.DEBIT,
                  Money.of("100", "TRY")));
          transferInstruments.save(
              new AccountTransferInstrument(transfer.getId(), instrument, true, false));
          movements.save(
              InstrumentMovement.transferred(
                  instrument,
                  InstrumentStatus.PORTFOLIO,
                  TODAY,
                  customer,
                  supplier,
                  transfer.getId(),
                  "Cari taşıma"));
        });

    inTenant(
        w,
        () -> {
          assertThat(limits.findAllByAccountId(customer)).hasSize(1);
          assertThat(limits.findByAccountIdAndCompanyId(customer, w.companyAId())).isPresent();
          String hash = protector.hash("TR330006100519786457841326");
          assertThat(bankAccounts.findAllByAccountIdOrderByCreatedAt(customer)).hasSize(1);
          assertThat(bankAccounts.existsByIbanHashAndActiveTrue(hash)).isTrue();
          UUID bankId = bankAccounts.findAllByAccountIdOrderByCreatedAt(customer).get(0).getId();
          assertThat(bankAccounts.existsByIbanHashAndActiveTrueAndIdNot(hash, bankId)).isFalse();
          assertThat(bankAccounts.search(null, "", null, true, "", PageRequest.of(0, 10)))
              .hasSize(1);
          assertThat(
                  bankAccounts.search(
                      customer, "TRY", true, false, "ziraat", PageRequest.of(0, 10)))
              .hasSize(1);
          assertThat(bankAccounts.search(null, "", false, true, "", PageRequest.of(0, 10)))
              .isEmpty();

          AccountDocument document = documents.findByIdempotencyKey("idem-1").orElseThrow();
          assertThat(documents.findForUpdate(document.getId())).isPresent();
          assertThat(documentTaxes.findById(document.getId()).orElseThrow().getNetPayable())
              .isEqualByComparingTo("1080");
          assertThat(
                  documents.search(
                      customer,
                      null,
                      null,
                      null,
                      null,
                      null,
                      null,
                      BranchFilter.all(null),
                      PageRequest.of(0, 10)))
              .hasSize(1);
          assertThat(
                  documents.search(
                      customer,
                      AccountDocumentSide.RECEIVABLE,
                      "SATIS_FATURASI",
                      true,
                      AccountDocumentStatus.OPEN,
                      TODAY,
                      TODAY,
                      BranchFilter.limited(w.companyAId(), List.of(UUID.fromString(w.a1()))),
                      PageRequest.of(0, 10)))
              .hasSize(1);
          assertThat(
                  documents.search(
                      customer,
                      null,
                      null,
                      false,
                      null,
                      null,
                      null,
                      BranchFilter.all(w.companyBId()),
                      PageRequest.of(0, 10)))
              .isEmpty();

          AccountRollover first = rollovers.findActive(customer).orElseThrow();
          assertThat(rollovers.findAllByAccount(customer, false)).hasSize(2);
          assertThat(rollovers.findAllByAccount(customer, true)).isEmpty();
          assertThat(rollovers.dateTaken(customer, TODAY, BranchFilter.NONE)).isTrue();
          assertThat(rollovers.dateTaken(customer, TODAY, first.getId())).isFalse();
          UUID second =
              rollovers.findAllByAccount(customer, false).stream()
                  .filter(r -> !r.isActive())
                  .findFirst()
                  .orElseThrow()
                  .getId();
          assertThat(rollovers.setActiveOnly(customer, second, "test@blackrose.test")).isEqualTo(2);
          assertThat(rollovers.findActive(customer).orElseThrow().getId()).isEqualTo(second);
          assertThat(rollovers.setActiveOnly(customer, second, "test@blackrose.test")).isZero();

          AccountTransfer transfer = transfers.findByIdempotencyKey("idem-t").orElseThrow();
          assertThat(transfers.findForUpdate(transfer.getId())).isPresent();
          assertThat(transferLines.findAllByAccountTransferId(transfer.getId())).hasSize(1);
          assertThat(transferLines.existsByAccountTransactionIdAndActiveTrue(tx)).isTrue();
          assertThat(transferInstruments.findAllByAccountTransferId(transfer.getId()))
              .singleElement()
              .extracting(AccountTransferInstrument::isMovedDrawer)
              .isEqualTo(true);
          assertThat(movements.findByInstrumentIdAndDeletedFalseOrderByCreatedAt(instrument))
              .singleElement()
              .satisfies(
                  m -> {
                    assertThat(m.getMovementType()).isEqualTo(InstrumentMovementType.TRANSFERRED);
                    assertThat(m.getToAccountId()).isEqualTo(supplier);
                  });
        });
  }

  // --- kurulum

  /** Göç öncesi (V26) veri: 7 türün her biri, silinmiş tedarikçi, grup carisi, hareketler, çek. */
  private record Fixture(
      UUID company,
      UUID branch,
      UUID customer,
      UUID supplier,
      UUID deleted,
      UUID intercompany,
      UUID transaction,
      UUID instrument) {}

  private Fixture fixture(String s) {
    SchemaRows rows = new SchemaRows(jdbc);
    UUID company =
        jdbc.queryForObject(q(s, "select id from %s.company where is_default"), UUID.class);
    UUID branch =
        rows.insert(s, "branch", Map.of("code", "S1", "name", "Merkez", "company_id", company));
    Map<AccountType, UUID> byType = new HashMap<>();
    for (AccountType type : AccountType.values()) {
      Map<String, Object> values = new HashMap<>();
      values.put("code", "K-" + type.name());
      values.put("name", type.name());
      values.put("type", type.name());
      if (type == AccountType.INTERCOMPANY) {
        values.put("represents_company_id", company);
      }
      byType.put(type, rows.insert(s, "account", values));
    }
    UUID deleted =
        rows.insert(
            s,
            "account",
            Map.of("code", "K-SIL", "name", "Silinmiş", "type", "SUPPLIER", "deleted", true));
    UUID customer = byType.get(AccountType.CUSTOMER);
    UUID transaction = null;
    int i = 0;
    for (String source : List.of("MANUAL", "SETTLEMENT", "OPENING", "MANUAL")) {
      Map<String, Object> values = new HashMap<>();
      values.put("account_id", customer);
      values.put("branch_id", branch);
      values.put("company_id", company);
      values.put("direction", i % 2 == 0 ? "DEBIT" : "CREDIT");
      values.put("amount", new BigDecimal(100 + i));
      values.put("tl_amount", new BigDecimal(100 + i));
      values.put("source_type", source);
      values.put("source_id", UUID.randomUUID());
      values.put("deleted", i == 3);
      UUID id = rows.insert(s, "account_transaction", values);
      transaction = transaction == null ? id : transaction;
      i++;
    }
    UUID instrument =
        rows.insert(
            s,
            "instrument",
            Map.of(
                "kind",
                "CHECK",
                "direction",
                "RECEIVED",
                "number",
                "C-1",
                "account_id",
                customer,
                "branch_id",
                branch,
                "company_id",
                company,
                "status",
                "PORTFOLIO"));
    rows.insert(
        s, "instrument_movement", Map.of("instrument_id", instrument, "to_status", "PORTFOLIO"));
    rows.insert(
        s,
        "instrument_movement",
        Map.of("instrument_id", instrument, "from_status", "PORTFOLIO", "to_status", "AT_BANK"));
    return new Fixture(
        company,
        branch,
        customer,
        byType.get(AccountType.SUPPLIER),
        deleted,
        byType.get(AccountType.INTERCOMPANY),
        transaction,
        instrument);
  }

  private static Map<String, Object> bank(UUID account, Map<String, Object> extra) {
    Map<String, Object> values = new HashMap<>();
    values.put("account_id", account);
    values.put("bank_name", "Ziraat");
    values.put("currency", "TRY");
    values.putAll(extra);
    return values;
  }

  private static Map<String, Object> document(Fixture f, Map<String, Object> extra) {
    Map<String, Object> values = new HashMap<>();
    values.put("account_id", f.customer());
    values.put("branch_id", f.branch());
    values.put("company_id", f.company());
    values.put("side", "RECEIVABLE");
    values.put("document_type", "SATIS_FATURASI");
    values.put("document_no", "F-1");
    values.put("document_date", LocalDate.of(2026, 11, 14));
    values.put("amount", BigDecimal.TEN);
    values.put("currency", "TRY");
    values.put("payment_method", "CASH");
    values.put("ledger_amount", BigDecimal.TEN);
    extra.forEach((k, v) -> values.put(k, "NULL".equals(v) ? null : v));
    return values;
  }

  private static Map<String, Object> rollover(
      UUID account, int day, boolean active, boolean deleted) {
    Map<String, Object> values = new HashMap<>();
    values.put("account_id", account);
    values.put("rollover_date", LocalDate.of(2026, 1, day));
    values.put("season_name", "Sezon " + day);
    values.put("active", active);
    values.put("deleted", deleted);
    if (deleted) {
      values.put("deleted_at", SchemaRows.TIME);
    }
    return values;
  }

  private static Map<String, Object> line(Fixture f, UUID transfer) {
    Map<String, Object> values = new HashMap<>();
    values.put("account_transfer_id", transfer);
    values.put("account_transaction_id", f.transaction());
    values.put("branch_id", f.branch());
    values.put("company_id", f.company());
    values.put("direction", "DEBIT");
    values.put("amount", BigDecimal.TEN);
    values.put("currency", "TRY");
    return values;
  }

  private void assertSeeds(String s) {
    assertThat(count(s, "account_group")).isEqualTo(14);
    assertThat(
            jdbc.queryForObject(
                q(
                    s,
                    "select count(distinct account_type) from %s.account_group where type_default"),
                Long.class))
        .isEqualTo(7);
    assertThat(count(s, "account_group where type_default")).isEqualTo(7);
    assertThat(count(s, "account_document_type")).isEqualTo(31);
    assertThat(count(s, "account_document_type where side = 'RECEIVABLE'")).isEqualTo(11);
    assertThat(count(s, "account_document_type where side = 'PAYABLE'")).isEqualTo(20);
    assertThat(
            jdbc.queryForObject(
                q(
                    s,
                    "select coalesce(max(c), 0) from (select count(*) c from %s.account_document_type"
                        + " where is_default group by side, audience) x"),
                Long.class))
        .isEqualTo(1);
    assertThat(
            jdbc.queryForList(
                q(
                    s,
                    "select r.code from %s.role_permission p join %s.role r on r.id = p.role_id"
                        + " where p.permission = 'FINANCE_EMPLOYEE_VIEW'"),
                String.class))
        .containsExactly("FINANCE_SUPER");
  }

  private Map<String, Object> ledgerTotals(String s) {
    return jdbc.queryForMap(
        q(
            s,
            "select count(*) as n, sum(amount) as amount, sum(tl_amount) as tl"
                + " from %s.account_transaction"));
  }

  private Map<String, Object> accountRow(String s, UUID id) {
    return jdbc.queryForMap(q(s, "select * from %s.account where id = ?"), id);
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

  private String schemaAtV26() {
    String schema = "mig_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    flyway(schema, "26").migrate();
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

  private long count(String s, String fromWhere) {
    return jdbc.queryForObject(q(s, "select count(*) from %s." + fromWhere), Long.class);
  }

  private static String q(String schema, String sql) {
    return sql.replace("%s", "\"" + schema + "\"");
  }
}
