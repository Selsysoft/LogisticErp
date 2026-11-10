package org.ece.blackrose.finance.service;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.AccountTransaction;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.PlanStatus;
import org.ece.blackrose.finance.domain.OpeningInvoice;
import org.ece.blackrose.finance.domain.OpeningInvoice.Kind;
import org.ece.blackrose.finance.domain.PaymentPlan;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.CurrencyRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.OpeningInvoiceRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.PaymentPlanRepository;
import org.ece.blackrose.finance.service.LedgerService.Posting;
import org.ece.blackrose.finance.web.FinanceDtos.CreatePlanRequest;
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
 * Önceki sistemden açık (ödenmemiş) faturalar. Tutar, faturanın açık kalan kısmıdır. Her satır cari
 * hareketine fatura tarihiyle yazılır (yaşlandırma doğru çıkar). Müşteri faturası nakit öngörüsüne
 * vadesiyle girer; tedarikçi/taşeron faturası taslak bir ödeme planı oluşturur (ödeme takvimi, pano
 * ve günlük özet onu gösterir). Kendi fatura numaralandırmamıza ve gelir raporlarına girmez.
 *
 * <p>Aynı cari ve para biriminde açılış bakiyesi ile açık fatura birlikte yüklenemez: bakiye iki
 * kez sayılır. Önce önizlenir; içe aktarma ya hep ya hiçtir.
 */
@Service
public class OpeningInvoiceImportService {

  public static final String SOURCE = "OPENING_INVOICE";
  static final int MAX_ROWS = 10000;

  public enum RowStatus {
    READY,
    ERROR
  }

  @Schema(name = "OpeningInvoiceRow")
  public record Row(
      int line,
      String accountCode,
      String accountName,
      Kind kind,
      String number,
      LocalDate invoiceDate,
      LocalDate dueDate,
      String currency,
      BigDecimal amount,
      RowStatus status,
      String error) {}

  @Schema(name = "OpeningInvoiceTotal")
  public record Total(Kind kind, String currency, BigDecimal amount, int count) {}

  @Schema(name = "OpeningInvoiceResult")
  public record Result(boolean applied, boolean valid, List<Total> totals, List<Row> rows) {}

  private record Columns(
      int account, int number, int invoiceDate, int dueDate, int amount, int currency, int rate) {}

  private record Parsed(Row row, Account account, BigDecimal rate) {}

  private final AccountRepository accounts;
  private final AccountTransactionRepository transactions;
  private final OpeningInvoiceRepository invoices;
  private final PaymentPlanRepository plans;
  private final CurrencyRepository currencies;
  private final BranchRepository branches;
  private final ExchangeRateService rates;
  private final LedgerService ledger;
  private final PaymentPlanService planService;
  private final TenantClock clock;
  private final AuditService audit;

  public OpeningInvoiceImportService(
      AccountRepository accounts,
      AccountTransactionRepository transactions,
      OpeningInvoiceRepository invoices,
      PaymentPlanRepository plans,
      CurrencyRepository currencies,
      BranchRepository branches,
      ExchangeRateService rates,
      LedgerService ledger,
      PaymentPlanService planService,
      TenantClock clock,
      AuditService audit) {
    this.accounts = accounts;
    this.transactions = transactions;
    this.invoices = invoices;
    this.plans = plans;
    this.currencies = currencies;
    this.branches = branches;
    this.rates = rates;
    this.ledger = ledger;
    this.planService = planService;
    this.clock = clock;
    this.audit = audit;
  }

  @Transactional(readOnly = true)
  public Result preview(byte[] content, UUID branchId) {
    return result(check(content, branchId), false);
  }

  @Transactional
  public Result apply(byte[] content, UUID branchId) {
    List<Parsed> parsed = check(content, branchId);
    if (parsed.stream().anyMatch(p -> p.row().status() == RowStatus.ERROR)) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "OPENING_INVOICE_INVALID",
          "Dosyada hatalı satır var; önizlemedeki hataları düzeltip yeniden yükleyin.");
    }
    for (Parsed p : parsed) {
      Row row = p.row();
      Money money = new Money(row.amount(), row.currency());
      OpeningInvoice invoice =
          invoices.save(
              new OpeningInvoice(
                  p.account().getId(),
                  branchId,
                  row.kind(),
                  row.number(),
                  row.invoiceDate(),
                  row.dueDate(),
                  money));
      ledger.post(
          new Posting(
              p.account().getId(),
              branchId,
              row.kind() == Kind.RECEIVABLE ? Direction.DEBIT : Direction.CREDIT,
              money,
              row.invoiceDate(),
              "Açılış faturası " + row.number(),
              SOURCE,
              invoice.getId(),
              p.rate()));
      if (row.kind() == Kind.PAYABLE) {
        PaymentPlan plan =
            planService.create(
                new CreatePlanRequest(
                    p.account().getId(),
                    branchId,
                    money,
                    row.dueDate(),
                    "Açılış faturası " + row.number()),
                null);
        invoice.linkPlan(plan.getId());
      }
    }
    audit.record(AuditEvent.OPENING_INVOICES_IMPORTED, null, parsed.size() + " açık fatura");
    return result(parsed, true);
  }

  /**
   * Yanlış yüklenen açık faturayı ekstreden geri alır: cari hareketi ters çevrilir, fatura iptal
   * edilir, bağlı ödeme planı iptal olur. Ödemesi yapılmış faturanın planı geri alınamaz.
   */
  @Transactional
  public AccountTransaction reverse(
      AccountTransaction original, LocalDate date, String description) {
    OpeningInvoice invoice =
        invoices
            .findById(original.getSourceId())
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "INVOICE_NOT_FOUND", "Açılış faturası bulunamadı."));
    if (invoice.getPaymentPlanId() != null) {
      PaymentPlan plan = plans.findById(invoice.getPaymentPlanId()).orElseThrow();
      if (plan.getStatus() == PlanStatus.PAID) {
        throw new BusinessException(
            HttpStatus.CONFLICT,
            "OPENING_INVOICE_PAID",
            "Ödeme planı ödenmiş açılış faturası geri alınamaz; önce ödemeyi ters çevirin.");
      }
      if (plan.getStatus() != PlanStatus.CANCELLED) {
        planService.cancel(plan.getId(), "Açılış faturası geri alındı");
      }
    }
    invoice.cancel();
    return ledger.reverse(original, date, description);
  }

  private List<Parsed> check(byte[] content, UUID branchId) {
    if (branchId == null || !branches.existsById(branchId)) {
      throw new BusinessException(HttpStatus.BAD_REQUEST, "BRANCH_INVALID", "Şube seçilmelidir.");
    }
    Columns columns = columns(CsvRows.header(content));
    List<Line> lines = CsvRows.parse(content);
    if (lines.isEmpty()) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "OPENING_IMPORT_EMPTY", "Dosyada başlıktan sonra satır yok.");
    }
    if (lines.size() > MAX_ROWS) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "OPENING_IMPORT_TOO_LARGE",
          "Dosyada en çok " + MAX_ROWS + " satır olabilir.");
    }
    LocalDate today = clock.today();
    Set<String> seen = new HashSet<>();
    List<Parsed> parsed = new ArrayList<>();
    for (Line line : lines) {
      try {
        parsed.add(parse(line, columns, today, seen));
      } catch (RowException | BusinessException ex) {
        parsed.add(
            new Parsed(
                new Row(
                    line.number(),
                    line.text(columns.account()),
                    null,
                    null,
                    line.text(columns.number()),
                    null,
                    null,
                    null,
                    null,
                    RowStatus.ERROR,
                    ex.getMessage()),
                null,
                null));
      }
    }
    return parsed;
  }

  private Parsed parse(Line line, Columns columns, LocalDate today, Set<String> seen) {
    String code = line.required(columns.account(), "Cari kodu");
    Account account =
        accounts
            .findByCode(code)
            .orElseThrow(() -> new RowException("Cari yok: " + code + ". Önce cariyi açın."));
    Kind kind;
    if (account.getType() == AccountType.CUSTOMER) {
      kind = Kind.RECEIVABLE;
    } else if (account.getType() == AccountType.SUPPLIER
        || account.getType() == AccountType.CARRIER) {
      kind = Kind.PAYABLE;
    } else {
      throw new RowException(code + " müşteri, tedarikçi veya taşeron carisi değil.");
    }
    String number = line.required(columns.number(), "Belge no");
    if (number.length() > 50) {
      throw new RowException("Belge no en çok 50 karakter olabilir.");
    }
    LocalDate invoiceDate = date(line.required(columns.invoiceDate(), "Belge tarihi"), "Belge");
    LocalDate dueDate = date(line.required(columns.dueDate(), "Vade"), "Vade");
    if (invoiceDate.isAfter(today)) {
      throw new RowException("Belge tarihi ileri bir gün olamaz.");
    }
    if (dueDate.isBefore(invoiceDate)) {
      throw new RowException("Vade belge tarihinden önce olamaz.");
    }
    String amountText = line.required(columns.amount(), "Tutar");
    if (CsvRows.ambiguousThousands(amountText)) {
      throw new RowException(
          "Tutar belirsiz: "
              + amountText
              + ". Ondalık için virgül kullanın (1.500,00) veya ayırıcısız yazın (1500).");
    }
    BigDecimal amount = CsvRows.amount(amountText, "Tutar");
    if (amount.signum() <= 0) {
      throw new RowException(
          "Tutar sıfırdan büyük olmalıdır; iade ve mahsuplar için açılış bakiyesi kullanılmaz,"
              + " faturanın açık kalan tutarını yazın.");
    }
    if (amount.scale() > 2) {
      throw new RowException("Tutarda en çok iki ondalık olabilir.");
    }
    String currency =
        Optional.ofNullable(columns.currency() < 0 ? null : line.text(columns.currency()))
            .map(value -> value.toUpperCase(Locale.ROOT))
            .orElse("TRY");
    if (!currencies.existsById(currency)) {
      throw new RowException("Para birimi tanımlı değil: " + currency);
    }
    BigDecimal rate =
        columns.rate() < 0 || line.text(columns.rate()) == null
            ? null
            : CsvRows.amount(line.text(columns.rate()), "Kur");
    if (!seen.add(code + "|" + number)) {
      throw new RowException("Aynı cari ve belge no dosyada iki kez var.");
    }
    if (invoices.existsByAccountIdAndNumberAndStatus(
        account.getId(), number, OpeningInvoice.Status.OPEN)) {
      throw new RowException("Bu belge zaten yüklenmiş: " + number);
    }
    if (transactions.hasActiveOpening(account.getId(), currency)) {
      throw new RowException(
          code
              + " için "
              + currency
              + " açılış bakiyesi yüklenmiş; açık faturalar bakiyeyi ayrıca oluşturur, ikisi"
              + " birlikte yüklenemez.");
    }
    // Kur yoksa satırda görünsün.
    rates.convert(new Money(amount, currency), invoiceDate, rate);
    return new Parsed(
        new Row(
            line.number(),
            code,
            account.getName(),
            kind,
            number,
            invoiceDate,
            dueDate,
            currency,
            amount,
            RowStatus.READY,
            null),
        account,
        rate);
  }

  private static LocalDate date(String text, String label) {
    try {
      return CsvRows.date(text);
    } catch (RuntimeException ex) {
      throw new RowException(label + " tarihi okunamadı: " + text);
    }
  }

  private static Result result(List<Parsed> parsed, boolean applied) {
    List<Row> rows = parsed.stream().map(Parsed::row).toList();
    boolean valid = rows.stream().noneMatch(row -> row.status() == RowStatus.ERROR);
    Map<String, Total> totals = new LinkedHashMap<>();
    for (Row row : rows) {
      if (row.status() == RowStatus.ERROR) {
        continue;
      }
      String key = row.kind() + "|" + row.currency();
      Total sum =
          totals.getOrDefault(key, new Total(row.kind(), row.currency(), BigDecimal.ZERO, 0));
      totals.put(
          key,
          new Total(row.kind(), row.currency(), sum.amount().add(row.amount()), sum.count() + 1));
    }
    return new Result(applied, valid, List.copyOf(totals.values()), rows);
  }

  private static Columns columns(List<String> header) {
    Map<String, Integer> index = CsvRows.headerIndex(header);
    int account = CsvRows.column(index, "CARI_KODU", "KOD", "CARI");
    int number = CsvRows.column(index, "BELGE_NO", "FATURA_NO", "BELGE");
    int invoiceDate = CsvRows.column(index, "BELGE_TARIHI", "FATURA_TARIHI", "TARIH");
    int dueDate = CsvRows.column(index, "VADE", "VADE_TARIHI");
    int amount = CsvRows.column(index, "TUTAR", "ACIK_TUTAR", "BAKIYE");
    List<String> missing = new ArrayList<>();
    if (account < 0) {
      missing.add("cari kodu");
    }
    if (number < 0) {
      missing.add("belge no");
    }
    if (invoiceDate < 0) {
      missing.add("belge tarihi");
    }
    if (dueDate < 0) {
      missing.add("vade");
    }
    if (amount < 0) {
      missing.add("tutar");
    }
    if (!missing.isEmpty()) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "OPENING_IMPORT_HEADER",
          "Başlıkta şu sütunlar bulunamadı: " + String.join(", ", missing) + ".");
    }
    return new Columns(
        account,
        number,
        invoiceDate,
        dueDate,
        amount,
        CsvRows.column(index, "PARA_BIRIMI", "DOVIZ", "PB"),
        CsvRows.column(index, "KUR"));
  }
}
