package org.ece.blackrose.finance.service;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.OpeningInvoice;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.CurrencyRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.OpeningInvoiceRepository;
import org.ece.blackrose.finance.service.LedgerService.Posting;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.integration.service.CsvRows;
import org.ece.blackrose.integration.service.CsvRows.Line;
import org.ece.blackrose.integration.service.CsvRows.RowException;
import org.ece.blackrose.organization.BranchRepository;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Önceki sistemden cari açılış bakiyelerinin içe aktarılması. Önce önizlenir; içe aktarma ya hep ya
 * hiçtir: tek hatalı satır varsa hiçbir şey yazılmaz (yarım yüklenmiş açılış, hiç yüklenmemişten
 * tehlikelidir). Kodu olmayan cari oluşturulur. Aynı cari ve para biriminde ters çevrilmemiş açılış
 * varsa satır reddedilir; yanlış açılış cari ekstresinden ters çevrilip yeniden yüklenebilir.
 *
 * <p>Bakiye firmanın bakışıyladır: pozitif "cari bize borçlu" (borç), negatif "biz cariye
 * borçluyuz" (alacak).
 */
@Service
public class OpeningBalanceImportService {

  public static final String SOURCE_OPENING = "OPENING";
  static final int MAX_ROWS = 5000;

  /** Satırın durumu: yeni cari açılacak, mevcut cariye yazılacak, sıfır olduğu için atlanacak. */
  public enum RowStatus {
    NEW_ACCOUNT,
    EXISTING_ACCOUNT,
    ZERO,
    ERROR
  }

  @Schema(name = "OpeningBalanceRow")
  public record Row(
      int line,
      String code,
      String name,
      AccountType type,
      String currency,
      BigDecimal balance,
      RowStatus status,
      String error) {}

  @Schema(name = "OpeningBalanceTotal")
  public record Total(String currency, BigDecimal debit, BigDecimal credit) {}

  @Schema(name = "OpeningBalanceResult")
  public record Result(
      boolean applied,
      boolean valid,
      int accountsToCreate,
      int postings,
      List<Total> totals,
      List<Row> rows) {}

  private static final Map<String, AccountType> TYPES = new HashMap<>();

  static {
    for (AccountType type : AccountType.values()) {
      TYPES.put(type.name(), type);
    }
    TYPES.put("MUSTERI", AccountType.CUSTOMER);
    TYPES.put("TEDARIKCI", AccountType.SUPPLIER);
    TYPES.put("TASERON", AccountType.CARRIER);
    TYPES.put("TASIYICI", AccountType.CARRIER);
    TYPES.put("PERSONEL", AccountType.EMPLOYEE);
    TYPES.put("BANKA", AccountType.BANK);
    TYPES.remove(AccountType.LEAD.name());
  }

  private final AccountRepository accounts;
  private final AccountTransactionRepository transactions;
  private final CurrencyRepository currencies;
  private final OpeningInvoiceRepository openingInvoices;
  private final BranchRepository branches;
  private final ExchangeRateService rates;
  private final LedgerService ledger;
  private final TenantClock clock;
  private final AuditService audit;

  public OpeningBalanceImportService(
      AccountRepository accounts,
      AccountTransactionRepository transactions,
      CurrencyRepository currencies,
      OpeningInvoiceRepository openingInvoices,
      BranchRepository branches,
      ExchangeRateService rates,
      LedgerService ledger,
      TenantClock clock,
      AuditService audit) {
    this.accounts = accounts;
    this.transactions = transactions;
    this.currencies = currencies;
    this.openingInvoices = openingInvoices;
    this.branches = branches;
    this.rates = rates;
    this.ledger = ledger;
    this.clock = clock;
    this.audit = audit;
  }

  /** Dosyayı denetler, hiçbir şey yazmaz. */
  @Transactional(readOnly = true)
  public Result preview(byte[] content, UUID branchId, LocalDate date) {
    return check(content, branchId, date).result(false);
  }

  /** Hatasız dosyayı tek işlemde yazar; hata varsa hiçbir şey yazılmaz. */
  @Transactional
  public Result apply(byte[] content, UUID branchId, LocalDate date) {
    Checked checked = check(content, branchId, date);
    if (!checked.valid()) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "OPENING_IMPORT_INVALID",
          "Dosyada hatalı satır var; önizlemedeki hataları düzeltip yeniden yükleyin.");
    }
    Map<String, UUID> created = new HashMap<>();
    int posted = 0;
    for (Parsed parsed : checked.parsed()) {
      // Sıfır bakiyeli yeni cari de açılır: açık faturası ayrıca yüklenecek cariler böyle açılır.
      if (parsed.balance().signum() == 0 && parsed.existing() != null) {
        continue;
      }
      UUID accountId =
          parsed.existing() != null
              ? parsed.existing().getId()
              : created.computeIfAbsent(
                  parsed.code(),
                  code ->
                      accounts
                          .save(
                              new Account(
                                  code, parsed.name(), parsed.type(), parsed.taxNumber(), null))
                          .getId());
      if (parsed.balance().signum() == 0) {
        continue;
      }
      ledger.post(
          new Posting(
              accountId,
              branchId,
              parsed.balance().signum() > 0 ? Direction.DEBIT : Direction.CREDIT,
              new Money(parsed.balance().abs(), parsed.currency()),
              date,
              "Açılış bakiyesi",
              SOURCE_OPENING,
              UUID.randomUUID(),
              parsed.rate()));
      posted++;
    }
    audit.record(
        AuditEvent.OPENING_BALANCES_IMPORTED,
        date.toString(),
        created.size() + " yeni cari, " + posted + " açılış hareketi");
    return checked.result(true);
  }

  private record Parsed(
      int line,
      String code,
      String name,
      AccountType type,
      String taxNumber,
      String currency,
      BigDecimal balance,
      BigDecimal rate,
      Account existing) {}

  private record Checked(List<Parsed> parsed, List<Row> rows) {

    boolean valid() {
      return !rows.isEmpty() && rows.stream().noneMatch(row -> row.status() == RowStatus.ERROR);
    }

    Result result(boolean applied) {
      Map<String, BigDecimal[]> sums = new LinkedHashMap<>();
      for (Row row : rows) {
        if (row.status() == RowStatus.ERROR || row.balance() == null) {
          continue;
        }
        BigDecimal[] sum = sums.computeIfAbsent(row.currency(), c -> new BigDecimal[] {ZERO, ZERO});
        if (row.balance().signum() > 0) {
          sum[0] = sum[0].add(row.balance());
        } else {
          sum[1] = sum[1].add(row.balance().negate());
        }
      }
      List<Total> totals = new ArrayList<>();
      sums.forEach((currency, sum) -> totals.add(new Total(currency, sum[0], sum[1])));
      long newAccounts =
          rows.stream()
              .filter(row -> row.status() == RowStatus.NEW_ACCOUNT)
              .map(Row::code)
              .distinct()
              .count();
      int postings =
          (int)
              rows.stream()
                  .filter(
                      row ->
                          (row.status() == RowStatus.NEW_ACCOUNT
                                  || row.status() == RowStatus.EXISTING_ACCOUNT)
                              && row.balance().signum() != 0)
                  .count();
      return new Result(applied, valid(), (int) newAccounts, postings, totals, rows);
    }
  }

  private static final BigDecimal ZERO = BigDecimal.ZERO;

  private Checked check(byte[] content, UUID branchId, LocalDate date) {
    if (branchId == null || !branches.existsById(branchId)) {
      throw new BusinessException(HttpStatus.BAD_REQUEST, "BRANCH_INVALID", "Şube seçilmelidir.");
    }
    if (date == null || date.isAfter(clock.today())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "OPENING_DATE_INVALID", "Açılış tarihi ileri bir gün olamaz.");
    }
    Columns columns = Columns.of(CsvRows.header(content));
    List<Line> lines = CsvRows.parse(content);
    if (lines.size() > MAX_ROWS) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "OPENING_IMPORT_TOO_LARGE",
          "Dosyada en çok " + MAX_ROWS + " satır olabilir.");
    }
    List<Parsed> parsed = new ArrayList<>();
    List<Row> rows = new ArrayList<>();
    Map<String, Parsed> byCode = new HashMap<>();
    for (Line line : lines) {
      String code = line.text(columns.code());
      String name = line.text(columns.name());
      try {
        Parsed row = parse(line, columns, date);
        String key = row.code() + "|" + row.currency();
        Parsed sameCode = byCode.get(row.code());
        if (byCode.containsKey(key)) {
          throw new RowException(
              "Aynı cari ve para birimi dosyada iki kez var (" + row.code() + ").");
        }
        if (sameCode != null
            && (!sameCode.name().equals(row.name()) || sameCode.type() != row.type())) {
          throw new RowException("Aynı kodlu satırlarda ad veya tür farklı.");
        }
        byCode.put(key, row);
        byCode.putIfAbsent(row.code(), row);
        parsed.add(row);
        RowStatus status =
            row.existing() == null
                ? RowStatus.NEW_ACCOUNT
                : row.balance().signum() == 0 ? RowStatus.ZERO : RowStatus.EXISTING_ACCOUNT;
        rows.add(
            new Row(
                line.number(),
                row.code(),
                row.name(),
                row.type(),
                row.currency(),
                row.balance(),
                status,
                null));
      } catch (RowException | BusinessException ex) {
        rows.add(
            new Row(line.number(), code, name, null, null, null, RowStatus.ERROR, ex.getMessage()));
      }
    }
    if (lines.isEmpty()) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "OPENING_IMPORT_EMPTY", "Dosyada başlıktan sonra satır yok.");
    }
    return new Checked(parsed, rows);
  }

  private Parsed parse(Line line, Columns columns, LocalDate date) {
    String code = line.required(columns.code(), "Kod");
    if (code.length() > 50) {
      throw new RowException("Kod en çok 50 karakter olabilir.");
    }
    String typeText = line.required(columns.type(), "Tür");
    AccountType type = TYPES.get(normalize(typeText));
    if (type == null) {
      throw new RowException(
          "Tür tanınmadı: " + typeText + " (Müşteri, Tedarikçi, Taşeron, Personel, Banka).");
    }
    String currency =
        Optional.ofNullable(columns.currency() < 0 ? null : line.text(columns.currency()))
            .map(value -> value.toUpperCase(Locale.ROOT))
            .orElse("TRY");
    if (!currencies.existsById(currency)) {
      throw new RowException("Para birimi tanımlı değil: " + currency);
    }
    String amountText = line.required(columns.balance(), "Bakiye");
    if (CsvRows.ambiguousThousands(amountText)) {
      throw new RowException(
          "Bakiye belirsiz: "
              + amountText
              + ". Ondalık için virgül kullanın (1.500,00) veya ayırıcısız yazın (1500).");
    }
    BigDecimal balance = CsvRows.amount(amountText, "Bakiye");
    if (balance.scale() > 2) {
      throw new RowException("Bakiyede en çok iki ondalık olabilir: " + amountText);
    }
    BigDecimal rate =
        columns.rate() < 0 || line.text(columns.rate()) == null
            ? null
            : CsvRows.amount(line.text(columns.rate()), "Kur");

    Account existing = accounts.findByCode(code).orElse(null);
    String name;
    if (existing != null) {
      if (existing.getType() != type) {
        throw new RowException(
            "Mevcut cari " + code + " türü farklı (" + existing.getType() + ").");
      }
      name = existing.getName();
      if (balance.signum() != 0
          && openingInvoices.existsByAccountIdAndCurrencyAndStatus(
              existing.getId(), currency, OpeningInvoice.Status.OPEN)) {
        throw new RowException(
            code
                + " için "
                + currency
                + " açık fatura yüklenmiş; bakiyeyi faturalar oluşturur, ikisi birlikte"
                + " yüklenemez.");
      }
      if (balance.signum() != 0 && transactions.hasActiveOpening(existing.getId(), currency)) {
        throw new RowException(
            code
                + " için "
                + currency
                + " açılış bakiyesi zaten var; önce ekstreden ters çevirin.");
      }
    } else {
      name = line.required(columns.name(), "Ad");
      if (name.length() > 200) {
        throw new RowException("Ad en çok 200 karakter olabilir.");
      }
    }
    if (balance.signum() != 0) {
      // Kur yoksa satırda görünsün; içe aktarmada hata çıkmasın.
      rates.convert(new Money(balance.abs(), currency), date, rate);
    }
    String taxNumber = columns.taxNumber() < 0 ? null : line.text(columns.taxNumber());
    if (taxNumber != null && taxNumber.length() > 20) {
      throw new RowException("Vergi no en çok 20 karakter olabilir.");
    }
    return new Parsed(
        line.number(), code, name, type, taxNumber, currency, balance, rate, existing);
  }

  static String normalize(String value) {
    return CsvRows.normalize(value);
  }

  /** Sütunlar başlık adıyla bulunur; sıra serbesttir. */
  private record Columns(
      int code, int name, int type, int currency, int balance, int taxNumber, int rate) {

    static Columns of(List<String> header) {
      Map<String, Integer> index = CsvRows.headerIndex(header);
      int code = find(index, "KOD", "CARI_KOD", "CARI_KODU");
      int name = find(index, "AD", "UNVAN", "CARI_ADI");
      int type = find(index, "TUR", "TIP", "CARI_TURU");
      int balance = find(index, "BAKIYE", "TUTAR");
      List<String> missing = new ArrayList<>();
      if (code < 0) {
        missing.add("kod");
      }
      if (name < 0) {
        missing.add("ad");
      }
      if (type < 0) {
        missing.add("tür");
      }
      if (balance < 0) {
        missing.add("bakiye");
      }
      if (!missing.isEmpty()) {
        throw new BusinessException(
            HttpStatus.BAD_REQUEST,
            "OPENING_IMPORT_HEADER",
            "Başlıkta şu sütunlar bulunamadı: " + String.join(", ", missing) + ".");
      }
      return new Columns(
          code,
          name,
          type,
          find(index, "PARA_BIRIMI", "DOVIZ", "PB"),
          balance,
          find(index, "VERGI_NO", "VKN"),
          find(index, "KUR"));
    }

    private static int find(Map<String, Integer> index, String... names) {
      return CsvRows.column(index, names);
    }
  }
}
