package org.ece.blackrose.finance.web;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.common.web.NullableInSchema;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.AllocationTargetType;
import org.ece.blackrose.finance.domain.FinanceTypes.CheckLeafStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.CompanyType;
import org.ece.blackrose.finance.domain.FinanceTypes.DensityLevel;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.DocumentPaymentMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.ExpenseContextType;
import org.ece.blackrose.finance.domain.FinanceTypes.ExpenseDepartment;
import org.ece.blackrose.finance.domain.FinanceTypes.ExpensePaymentMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.ExpenseStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.FundAccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.FundCategory;
import org.ece.blackrose.finance.domain.FinanceTypes.FundDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentMovementType;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.InvoiceStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.NoteType;
import org.ece.blackrose.finance.domain.FinanceTypes.PlanStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementChannel;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementLockReason;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementWarningCode;
import org.ece.blackrose.finance.domain.FinanceTypes.WarningSeverity;
import org.ece.blackrose.finance.web.AccountDtos.AccountCompanyLimitResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountInvoiceGapResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountPlanSummaryResponse;
import org.ece.blackrose.finance.web.AccountDtos.CurrencyAmountResponse;
import org.ece.blackrose.finance.web.AccountDtos.SaveBankAccountRequest;

public final class FinanceDtos {

  private FinanceDtos() {}

  /**
   * Cari kartı. MUI yalnız ilk beş alanı gönderir; {@code code} boşsa hesap grubundan üretilir.
   * Diğer alanlar ZTO formundandır (12.1 §4.1).
   */
  public record SaveAccountRequest(
      @Size(max = 50) String code,
      @NotBlank @Size(max = 200) String name,
      @NotNull AccountType type,
      @Size(max = 20) String taxNumber,
      UUID branchId,
      @Size(max = 30) String subGroup,
      UUID companyId,
      @Pattern(regexp = "^[A-Z]{3}$") String defaultCurrency,
      @PositiveOrZero BigDecimal creditLimit,
      @PositiveOrZero BigDecimal riskLimit,
      @Size(max = 100) String taxOffice,
      CompanyType companyType,
      @Size(max = 30) String phone,
      @Email @Size(max = 254) String email,
      @Size(max = 200) String website,
      @Size(max = 200) String contactName,
      @Size(max = 100) String contactTitle,
      @Size(max = 30) String contactMobile,
      @Size(max = 1000) String address,
      @Size(max = 100) String city,
      @Size(max = 100) String district,
      @Size(max = 100) String country,
      @Size(max = 20) String postalCode,
      @Size(max = 1000) String paymentTerms,
      @Size(max = 2000) String notes,
      @Valid List<SaveBankAccountRequest> bankAccounts) {}

  /**
   * Bakiye satırı. {@code companyId}/{@code branchId} yalnız şirket/iş yeri kırılımında dolu;
   * {@code debt}, {@code payment}, {@code receivable}, {@code collection} hareket türü toplamları
   * (12.1 §3.5).
   */
  public record BalanceResponse(
      String currency,
      BigDecimal debit,
      BigDecimal credit,
      BigDecimal balance,
      BigDecimal tlBalance,
      UUID companyId,
      UUID branchId,
      BigDecimal debt,
      BigDecimal payment,
      BigDecimal receivable,
      BigDecimal collection) {}

  /**
   * Cari kartı yanıtı. {@code taxNumber}: VKN düz; TCKN listede ve izinsiz detayda maskeli ({@code
   * taxNumberMasked}). {@code address} ve {@code companyLimits} yalnız detayda; adres yalnız
   * FINANCE_MANAGE sahibine çözülür.
   */
  public record AccountResponse(
      UUID id,
      String code,
      String name,
      AccountType type,
      String taxNumber,
      boolean taxNumberMasked,
      UUID branchId,
      UUID companyId,
      UUID representsCompanyId,
      List<BalanceResponse> balances,
      String subGroup,
      String subGroupName,
      boolean active,
      String defaultCurrency,
      BigDecimal creditLimit,
      BigDecimal riskLimit,
      List<AccountCompanyLimitResponse> companyLimits,
      String taxOffice,
      CompanyType companyType,
      String phone,
      String email,
      String website,
      String contactName,
      String contactTitle,
      String contactMobile,
      String address,
      String city,
      String district,
      String country,
      String postalCode,
      String paymentTerms,
      String notes,
      AccountPlanSummaryResponse planSummary,
      String createdBy,
      Instant createdAt,
      String updatedBy,
      Instant updatedAt,
      int updateCount) {}

  public record ManualAccountTransactionRequest(
      @NotNull UUID branchId,
      @NotNull Direction direction,
      @NotNull @Valid Money money,
      @NotNull LocalDate date,
      @Size(max = 500) String description,
      @Positive BigDecimal exchangeRate) {}

  public record ReverseRequest(@NotNull LocalDate date, @Size(max = 500) String description) {}

  public record AccountTransactionResponse(
      UUID id,
      UUID accountId,
      UUID branchId,
      UUID companyId,
      Direction direction,
      Money money,
      BigDecimal exchangeRate,
      LocalDate rateDate,
      BigDecimal tlAmount,
      LocalDate transactionDate,
      String description,
      String sourceType,
      UUID sourceId) {}

  /**
   * Ekstre satırı. {@code date} etkin tarihtir (belge tarihi tabanında belge tarihi); {@code
   * balance} satırın para birimindeki dönem başı + yürüyen bakiye. 12.1 eklemeleri (§4.5) eski
   * alanlardan sonra gelir.
   */
  public record StatementLine(
      UUID id,
      LocalDate date,
      String direction,
      BigDecimal amount,
      BigDecimal exchangeRate,
      BigDecimal tlAmount,
      String description,
      String sourceType,
      BigDecimal balance,
      String currency,
      UUID companyId,
      UUID branchId,
      UUID sourceId,
      String kind,
      int sign,
      boolean reversal,
      boolean reversed,
      String transferRole,
      String documentNo,
      String documentType,
      LocalDate documentDate,
      LocalDate dueDate,
      String paymentMethod,
      String createdBy,
      Instant createdAt) {

    /** Banka/kasa ekstresi satırı: cari hareketine özgü 12.1 alanları boştur. */
    public StatementLine(
        UUID id,
        LocalDate date,
        String direction,
        BigDecimal amount,
        BigDecimal exchangeRate,
        BigDecimal tlAmount,
        String description,
        String sourceType,
        BigDecimal balance) {
      this(
          id,
          date,
          direction,
          amount,
          exchangeRate,
          tlAmount,
          description,
          sourceType,
          balance,
          null,
          null,
          null,
          null,
          null,
          0,
          false,
          false,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null);
    }
  }

  /**
   * {@code currency} verilmeyen (çok para birimli) ekstrede {@code currency} ve {@code
   * openingBalance} boştur; para birimi başına açılış {@code openingBalances}'tadır.
   */
  public record StatementResponse(
      String currency,
      BigDecimal openingBalance,
      List<CurrencyAmountResponse> openingBalances,
      List<StatementLine> lines,
      int page,
      int size,
      long totalElements,
      int totalPages) {

    /** Banka/kasa ekstresi (para birimi tek; para birimi başına açılış listesi yok). */
    public StatementResponse(
        String currency,
        BigDecimal openingBalance,
        List<StatementLine> lines,
        int page,
        int size,
        long totalElements,
        int totalPages) {
      this(currency, openingBalance, List.of(), lines, page, size, totalElements, totalPages);
    }
  }

  /**
   * Yaşlandırma satırı (12.8 §3.4.2; alanlar eklemeli, sayı biçimi korunur). {@code total} {@code
   * notDue}'yu da içerir (işlem tarihi tabanında {@code notDue = 0}); {@code tlTotal} işlem günü
   * kuruyla. {@code phone} personel carisinde boş.
   */
  public record AgingResponse(
      UUID accountId,
      String accountName,
      String currency,
      BigDecimal days0To30,
      BigDecimal days31To60,
      BigDecimal days61To90,
      BigDecimal daysOver90,
      BigDecimal total,
      String accountCode,
      String subGroup,
      String subGroupName,
      @NullableInSchema String phone,
      BigDecimal notDue,
      BigDecimal tlTotal) {}

  /**
   * Yeni banka/kasa hesabı. 12.2: hesap türü (kullanıcı yolunda yalnız DEMAND), hesap no (şifreli
   * saklanır), banka şube adı, açıklama, aktiflik ve işaretli açılış bakiyesi (12.2_TASARIM §4.1).
   * {@code openingRate} döviz cinsi açılışın elle kuru (TL'de yok sayılır; o tarihte kur yoksa
   * zorunlu — OK-12.2-37).
   */
  public record CreateFundRequest(
      @NotBlank @Size(max = 50) String code,
      @NotBlank @Size(max = 200) String name,
      @NotNull FundKind kind,
      @NotBlank @Size(min = 3, max = 3) String currency,
      @NotNull UUID branchId,
      @Size(max = 100) String bankName,
      @Size(max = 34) String iban,
      boolean allowNegative,
      FundAccountType accountType,
      @Size(max = 40) String accountNo,
      @Size(max = 100) String bankBranchName,
      @Size(max = 500) String description,
      Boolean active,
      @Digits(integer = 15, fraction = 2) BigDecimal openingBalance,
      LocalDate openingDate,
      @Positive BigDecimal openingRate) {}

  /**
   * Hesap düzenleme. {@code accountNo}, {@code bankBranchName}, {@code description} verildiği gibi
   * yazılır (null siler, {@code bankName}/{@code iban} gibi); {@code active} ve {@code
   * openingBalance} null ise değişmez. {@code openingRate} döviz cinsi açılışın elle kuru (TL'de
   * yok sayılır; kur tablosu boşken zorunlu — OK-12.2-37).
   */
  public record UpdateFundRequest(
      @NotBlank @Size(max = 200) String name,
      @NotNull UUID branchId,
      @Size(max = 100) String bankName,
      @Size(max = 34) String iban,
      boolean allowNegative,
      @Size(max = 40) String accountNo,
      @Size(max = 100) String bankBranchName,
      @Size(max = 500) String description,
      Boolean active,
      @Digits(integer = 15, fraction = 2) BigDecimal openingBalance,
      LocalDate openingDate,
      @Positive BigDecimal openingRate) {}

  /**
   * Banka/kasa hesabı. {@code balance} tüm tarihlerin bakiyesi; {@code currentBalance} {@code asOf}
   * dahil, {@code futureCount}/{@code futureNet} {@code asOf} sonrası hareketler. {@code accountNo}
   * her zaman maskelidir.
   */
  public record FundResponse(
      UUID id,
      String code,
      String name,
      FundKind kind,
      String currency,
      UUID branchId,
      UUID companyId,
      String bankName,
      String iban,
      boolean allowNegative,
      BigDecimal balance,
      FundAccountType accountType,
      String accountNo,
      String bankBranchName,
      String description,
      boolean active,
      BigDecimal currentBalance,
      int futureCount,
      BigDecimal futureNet,
      BigDecimal openingBalance,
      LocalDate openingDate,
      long transactionCount) {}

  /** Manuel hareket; {@code category} EXPENSE/INCOME/OTHER (boşsa OTHER). */
  public record ManualFundTransactionRequest(
      @NotNull FundDirection direction,
      @NotNull @Valid Money money,
      @NotNull LocalDate date,
      @Size(max = 500) String description,
      @Positive BigDecimal exchangeRate,
      FundCategory category) {}

  public record TransferRequest(
      @NotNull UUID fromFundId,
      @NotNull UUID toFundId,
      @NotNull @Valid Money money,
      @NotNull LocalDate date,
      @Size(max = 500) String description,
      @Positive BigDecimal exchangeRate) {}

  public record FundTransactionResponse(
      UUID id,
      UUID fundAccountId,
      FundDirection direction,
      Money money,
      BigDecimal tlAmount,
      LocalDate transactionDate,
      String description,
      String sourceType,
      UUID sourceId,
      UUID companyId,
      FundCategory category) {}

  public record TransferResponse(UUID transferId) {}

  /**
   * Yeni çek/senet. {@code fundAccountId}: ödemede çekin çekildiği banka hesabı, tahsilatta {@code
   * initialStatus = AT_BANK} iken yatırılan banka hesabı. {@code initialStatus} yalnız tahsilatta
   * ({@code PORTFOLIO} varsayılan; {@code AT_BANK} yalnız çekte, fon hareketi yazmaz — 12.2a §3.2).
   * 12.3 §4.1: {@code custodyFundId} portföydeki alınan çekin emanet kasası (CASH), {@code
   * checkLeafId} kendi çekimizle ödemede koçan yaprağı, {@code noteType} yalnız senette ({@code
   * null} → {@code PLAIN}), {@code drawerName} yalnız alınan çek/senette.
   */
  public record NewInstrument(
      @NotNull InstrumentKind kind,
      @NotBlank @Size(max = 50) String number,
      @Size(max = 100) String bankName,
      @NotNull LocalDate dueDate,
      @NullableInSchema UUID fundAccountId,
      @NullableInSchema InstrumentStatus initialStatus,
      @NullableInSchema LocalDate issueDate,
      @NullableInSchema @Size(max = 100) String bankBranch,
      @NullableInSchema @Size(max = 200) String drawerName,
      @NullableInSchema @Size(max = 500) String description,
      @NullableInSchema UUID custodyFundId,
      @NullableInSchema UUID checkLeafId,
      @NullableInSchema NoteType noteType) {

    /** 12.2 biçimi (yalnız dört alan). */
    public NewInstrument(InstrumentKind kind, String number, String bankName, LocalDate dueDate) {
      this(kind, number, bankName, dueDate, null, null);
    }

    /** 12.2a biçimi (12.3 ek alanları boş). */
    public NewInstrument(
        InstrumentKind kind,
        String number,
        String bankName,
        LocalDate dueDate,
        UUID fundAccountId,
        InstrumentStatus initialStatus) {
      this(
          kind,
          number,
          bankName,
          dueDate,
          fundAccountId,
          initialStatus,
          null,
          null,
          null,
          null,
          null,
          null,
          null);
    }
  }

  /**
   * Çek/senet liste satırı (12.3 §4.3; eski {@code InstrumentResponse} alanlarının üst kümesi).
   * İzinsiz kullanıcıda personel carili satırın cari, keşideci ve açıklama alanları {@code null}
   * ({@code employeeMasked = true}, {@code allowedTransitions} boş); ciro edilen personel carisi de
   * maskelenir. {@code originSettlement*}: çeki kaydeden ödeme/tahsilat (en eskisi).
   */
  public record InstrumentListItemResponse(
      UUID id,
      InstrumentKind kind,
      InstrumentDirection direction,
      String number,
      @NullableInSchema String bankName,
      @NullableInSchema String bankBranch,
      @NullableInSchema LocalDate issueDate,
      LocalDate dueDate,
      Money money,
      InstrumentStatus status,
      @NullableInSchema UUID accountId,
      @NullableInSchema String accountCode,
      @NullableInSchema String accountName,
      @NullableInSchema AccountType accountType,
      boolean employeeMasked,
      @NullableInSchema UUID endorsedAccountId,
      @NullableInSchema String endorsedAccountName,
      @NullableInSchema String drawerName,
      UUID branchId,
      String branchName,
      UUID companyId,
      String companyName,
      @NullableInSchema UUID fundAccountId,
      @NullableInSchema String fundName,
      @NullableInSchema FundKind fundKind,
      @NullableInSchema String fundBankName,
      @NullableInSchema UUID custodyFundId,
      @NullableInSchema String custodyFundName,
      @NullableInSchema UUID checkLeafId,
      @NullableInSchema UUID checkBookId,
      @NullableInSchema String checkBookSerial,
      @NullableInSchema Integer leafNo,
      @NullableInSchema String description,
      @NullableInSchema NoteType noteType,
      boolean collateral,
      @NullableInSchema LocalDate settledDate,
      @NullableInSchema UUID originSettlementId,
      @NullableInSchema SettlementStatus originSettlementStatus,
      int movementCount,
      @NullableInSchema LocalDate lastMovementDate,
      List<InstrumentStatus> allowedTransitions) {}

  /** {@code GET /instruments/{id}}: satır ve hareket geçmişi. */
  public record InstrumentDetailResponse(
      InstrumentListItemResponse item, List<InstrumentMovementResponse> movements) {}

  /**
   * Çek numarası ön denetimi (12.3 §3.9). {@code valid}: biçim (CHECK 7 hane); çakışan satır kapsam
   * dışında ya da maskeliyse {@code conflictAccountName = null}.
   */
  public record InstrumentNumberCheckResponse(
      boolean valid,
      boolean available,
      @NullableInSchema UUID conflictId,
      @NullableInSchema InstrumentStatus conflictStatus,
      @NullableInSchema String conflictAccountName) {}

  /**
   * Çek/senet durum geçişi. {@code custodyFundId}: {@code AT_BANK → PORTFOLIO} geçişinde çekin
   * tutulacağı kasa (sunucuda isteğe bağlı, OK-12.3-19).
   */
  public record InstrumentTransitionRequest(
      @NotNull InstrumentStatus toStatus,
      UUID fundAccountId,
      @NotNull LocalDate date,
      @Size(max = 500) String note,
      @Positive BigDecimal exchangeRate,
      @NullableInSchema UUID custodyFundId) {

    /** 12.2a biçimi (emanet kasası yok). */
    public InstrumentTransitionRequest(
        InstrumentStatus toStatus,
        UUID fundAccountId,
        LocalDate date,
        String note,
        BigDecimal exchangeRate) {
      this(toStatus, fundAccountId, date, note, exchangeRate, null);
    }
  }

  /**
   * Çek/senedin finansal olmayan alanlarının düzeltmesi (PATCH, 12.3 §3.2): yalnız gönderilen (null
   * olmayan) alanlar değişir; {@code bankBranch}, {@code drawerName}, {@code description} boş
   * metinle temizlenir. Defter ve hareket satırı yazılmaz.
   */
  public record InstrumentUpdateRequest(
      @NullableInSchema @Size(max = 50) String number,
      @NullableInSchema @Size(max = 100) String bankName,
      @NullableInSchema @Size(max = 100) String bankBranch,
      @NullableInSchema LocalDate issueDate,
      @NullableInSchema LocalDate dueDate,
      @NullableInSchema @Size(max = 200) String drawerName,
      @NullableInSchema @Size(max = 500) String description,
      @NullableInSchema NoteType noteType) {}

  /**
   * Portföydeki alınan çekin emanet kasasını değiştirir (PUT custody, 12.3 §3.2); {@code
   * custodyFundId = null} emaneti kaldırır. Para hareketi değildir.
   */
  public record InstrumentCustodyRequest(
      @NullableInSchema UUID custodyFundId,
      @NotNull LocalDate date,
      @NullableInSchema @Size(max = 500) String note) {}

  /**
   * Yeni çek koçanı (12.3 §3.6). Numaralar 7 hane; banka/şube kodu ikisi birlikte boş ya da ikisi
   * de 4 hane (MICR). Biçim hataları servis tarafında 400 {@code CHECK_BOOK_INVALID} döner.
   */
  public record CheckBookRequest(
      @NotNull UUID fundAccountId,
      @NotBlank @Size(max = 50) String serialNo,
      @NotBlank String startNumber,
      @NotBlank String endNumber,
      @NullableInSchema String bankCode,
      @NullableInSchema String branchCode) {}

  /** Yaprak iptali (12.3 §3.6); gerekçe isteğe bağlı. */
  public record CheckLeafVoidRequest(@NullableInSchema @Size(max = 500) String reason) {}

  /** Sayımlı çek koçanı (12.3 §4.3). */
  public record CheckBookResponse(
      UUID id,
      UUID companyId,
      UUID branchId,
      String branchName,
      UUID fundAccountId,
      String fundName,
      @NullableInSchema String fundBankName,
      String serialNo,
      @NullableInSchema String bankCode,
      @NullableInSchema String branchCode,
      String startNumber,
      String endNumber,
      int leafCount,
      int unusedCount,
      int usedCount,
      int voidCount,
      Instant createdAt) {}

  /** Koçan oluşturma sonucu; {@code skippedNumbers} fonda zaten kayıtlı olduğu için atlananlar. */
  public record CheckBookCreatedResponse(
      CheckBookResponse book, int createdCount, List<String> skippedNumbers) {}

  /**
   * Koçan yaprağı (12.3 §4.3). {@code fundIban} düz (OK-12.2-18); {@code instrument*} yaprağı
   * gösteren etkin ya da en son çek.
   */
  public record CheckLeafResponse(
      UUID id,
      UUID checkBookId,
      String checkBookSerial,
      int leafNo,
      String number,
      @NullableInSchema String micrCode,
      CheckLeafStatus status,
      @NullableInSchema LocalDate usedDate,
      @NullableInSchema String voidReason,
      UUID fundAccountId,
      String fundName,
      @NullableInSchema String fundBankName,
      @NullableInSchema String fundBankBranchName,
      @NullableInSchema String fundIban,
      UUID branchId,
      String branchName,
      UUID companyId,
      @NullableInSchema UUID instrumentId,
      @NullableInSchema InstrumentStatus instrumentStatus) {}

  /**
   * {@code movementType = TRANSFERRED}: cari taşıma (12.1 §3.11); durum değişmez, bağlı cari {@code
   * fromAccountId → toAccountId} olur.
   */
  public record InstrumentMovementResponse(
      UUID id,
      InstrumentStatus fromStatus,
      InstrumentStatus toStatus,
      LocalDate movementDate,
      String note,
      String createdBy,
      InstrumentMovementType movementType,
      UUID fromAccountId,
      UUID toAccountId,
      UUID accountTransferId,
      @NullableInSchema UUID fundAccountId,
      @NullableInSchema String fundName) {}

  /**
   * Ödeme/tahsilat. {@code confirmWarnings} yalnız kullanıcı kayıt uçlarında anlamlıdır: şirket
   * dağılımı uyarısı (12.2 §3.6) onaylandıysa {@code true}.
   */
  public record SettlementRequest(
      @NotNull SettlementMethod method,
      UUID accountId,
      @NotNull UUID branchId,
      UUID fundAccountId,
      UUID expenseItemId,
      UUID instrumentId,
      @Valid NewInstrument instrument,
      @NotNull @Valid Money money,
      @NotNull LocalDate date,
      @Size(max = 500) String description,
      @Positive BigDecimal exchangeRate,
      Boolean confirmWarnings,
      @NullableInSchema @Size(max = 50) String documentNo,
      @NullableInSchema SettlementChannel channel,
      @NullableInSchema UUID counterpartyBankAccountId,
      @NullableInSchema @Size(max = 50) List<@NotNull @Valid AllocationRequest> allocations) {

    /** Türetilmiş akışlar (plan ödemesi, araç gideri, sürücü avansı, virman): onay alanı yok. */
    @SuppressWarnings("java:S107")
    public SettlementRequest(
        SettlementMethod method,
        UUID accountId,
        UUID branchId,
        UUID fundAccountId,
        UUID expenseItemId,
        UUID instrumentId,
        NewInstrument instrument,
        Money money,
        LocalDate date,
        String description,
        BigDecimal exchangeRate) {
      this(
          method,
          accountId,
          branchId,
          fundAccountId,
          expenseItemId,
          instrumentId,
          instrument,
          money,
          date,
          description,
          exchangeRate,
          null,
          null,
          null,
          null,
          null);
    }
  }

  /**
   * Bilgi amaçlı fatura eşleştirme satırı (12.2a §3.3). {@code amount} JSON'da ondalık metindir
   * ({@code "250.00"}); para birimi kaydın para birimidir.
   */
  public record AllocationRequest(
      @NotNull AllocationTargetType targetType,
      @NotNull UUID targetId,
      @NotNull
          @Positive
          @Digits(integer = 15, fraction = 4)
          @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "250.00")
          BigDecimal amount) {}

  /**
   * Düzeltme ({@code POST /settlements/{id}/correct}): eski kayıt kendi tarihiyle ters kayıtla
   * iptal edilir, {@code replacement} yeni kayıt olarak yazılır (12.2a §3.6).
   */
  public record SettlementCorrectionRequest(
      @Size(max = 500) String reason, @NotNull @Valid SettlementRequest replacement) {}

  // --- 12.2 §4.5 ödeme/tahsilat uyarıları

  /** {@code POST /settlements/check} yanıtı (yazmaz). */
  public record SettlementCheckResponse(
      List<SettlementWarningResponse> warnings, List<AccountInvoiceGapResponse> invoiceGaps) {}

  /**
   * Şirket dağılımı uyarısı. Tutarlar kullanıcının kapsamındaki iş yerlerinden; kapsam dışı kısım
   * yalnız {@code partialScope}/{@code otherHiddenExists} bayraklarıyla bildirilir (SEC-12.2-02).
   */
  public record SettlementWarningResponse(
      SettlementWarningCode code,
      WarningSeverity severity,
      String currency,
      UUID companyId,
      BigDecimal companyOutstanding,
      BigDecimal amount,
      BigDecimal excess,
      List<CompanyOutstandingResponse> others,
      boolean partialScope,
      boolean otherHiddenExists) {}

  public record CompanyOutstandingResponse(UUID companyId, BigDecimal outstanding) {}

  public record SettlementResponse(
      UUID id,
      SettlementType type,
      SettlementMethod method,
      UUID accountId,
      UUID branchId,
      UUID companyId,
      UUID fundAccountId,
      UUID instrumentId,
      UUID expenseItemId,
      UUID planId,
      Money money,
      LocalDate settlementDate,
      String description,
      SettlementStatus status,
      @NullableInSchema String documentNo,
      @NullableInSchema SettlementChannel channel,
      @NullableInSchema UUID counterpartyBankAccountId,
      @NullableInSchema UUID correctsSettlementId,
      @NullableInSchema String reverseReason,
      @NullableInSchema LocalDate reversedOn) {}

  // --- 12.2a §4.3 okuma yolu (B3)

  /**
   * Ödeme/tahsilat liste satırı ({@link SettlementResponse}'un üst kümesi). İzinsiz kullanıcıda
   * personel carili satırın cari, açıklama ve karşı taraf banka alanları {@code null} ({@code
   * employeeMasked = true}; Rev 1 SEC-01). {@code fxUsed}/{@code fxRemaining} ondalık metin.
   */
  public record SettlementListItemResponse(
      UUID id,
      SettlementType type,
      SettlementMethod method,
      @NullableInSchema SettlementChannel channel,
      DocumentPaymentMethod displayMethod,
      @NullableInSchema UUID accountId,
      @NullableInSchema String accountCode,
      @NullableInSchema String accountName,
      @NullableInSchema AccountType accountType,
      @NullableInSchema String accountSubGroup,
      @NullableInSchema String accountGroupName,
      boolean employeeMasked,
      UUID branchId,
      String branchName,
      @NullableInSchema String branchGroupName,
      UUID companyId,
      @NullableInSchema UUID fundAccountId,
      @NullableInSchema String fundName,
      @NullableInSchema FundKind fundKind,
      @NullableInSchema String fundBankName,
      @NullableInSchema String fundBankBranchName,
      @NullableInSchema UUID instrumentId,
      @NullableInSchema InstrumentKind instrumentKind,
      @NullableInSchema String instrumentNumber,
      @NullableInSchema InstrumentStatus instrumentStatus,
      @NullableInSchema UUID expenseItemId,
      @NullableInSchema String expenseItemName,
      @NullableInSchema UUID planId,
      Money money,
      @NullableInSchema BigDecimal exchangeRate,
      @NullableInSchema BigDecimal tlAmount,
      LocalDate settlementDate,
      @NullableInSchema String documentNo,
      @NullableInSchema String description,
      SettlementStatus status,
      @NullableInSchema UUID counterpartyBankAccountId,
      @NullableInSchema String counterpartyIbanMasked,
      @NullableInSchema String counterpartyBankName,
      @NullableInSchema UUID correctsSettlementId,
      @NullableInSchema UUID correctedById,
      @NullableInSchema String reverseReason,
      @NullableInSchema LocalDate reversedOn,
      Instant createdAt,
      String createdBy,
      boolean intercompany,
      boolean credit,
      boolean transferred,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "0.00")
          BigDecimal fxUsed,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "0.00")
          BigDecimal fxRemaining,
      @NullableInSchema SettlementLockReason lockReason,
      boolean reversible,
      boolean correctable) {}

  /** {@code GET /settlements/{id}} (personel carisi izinsiz kullanıcıya 404). */
  public record SettlementDetailResponse(
      SettlementListItemResponse item,
      List<SettlementLineResponse> lines,
      @NullableInSchema InstrumentListItemResponse instrument,
      @NullableInSchema PlanResponse plan,
      List<SettlementAllocationResponse> allocations,
      @NullableInSchema String fundIbanMasked,
      boolean bankStatementMatched) {}

  /** Kaydın cari ({@code ACCOUNT}) ya da banka/kasa ({@code FUND}) defter satırı. */
  public record SettlementLineResponse(
      String ledger,
      UUID transactionId,
      String direction,
      Money money,
      BigDecimal exchangeRate,
      BigDecimal tlAmount,
      LocalDate transactionDate,
      boolean reversal) {}

  /**
   * Fatura eşleştirmesi. {@code outOfScope = true} iken hedef bilgileri ({@code targetId}, {@code
   * targetNumber}, {@code targetTypeName}, {@code invoiceDate}, {@code dueDate}) {@code null} (Rev
   * 1 SEC-07). {@code active}: kayıt POSTED ve hedef açık.
   */
  public record SettlementAllocationResponse(
      UUID id,
      AllocationTargetType targetType,
      @NullableInSchema UUID targetId,
      @NullableInSchema String targetNumber,
      @NullableInSchema String targetTypeName,
      @NullableInSchema LocalDate invoiceDate,
      @NullableInSchema LocalDate dueDate,
      Money money,
      boolean targetCancelled,
      boolean active,
      boolean outOfScope) {}

  /**
   * Eşleştirilebilir açık fatura kalemi ({@code GET /settlements/open-invoices}). {@code allocated}
   * = geçerli eşleşmeler + faturaya bağlı POSTED plan ödemeleri (Rev 1 F-3); tutarlar ondalık
   * metin.
   */
  public record OpenInvoiceResponse(
      AllocationTargetType targetType,
      UUID id,
      String number,
      String typeName,
      LocalDate invoiceDate,
      @NullableInSchema LocalDate dueDate,
      String currency,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "1500.00")
          BigDecimal total,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "500.00")
          BigDecimal allocated,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "1000.00")
          BigDecimal remaining,
      UUID branchId,
      UUID companyId) {}

  public record DailyTotal(UUID branchId, String currency, BigDecimal total, int count) {}

  /**
   * Günlük ödeme/tahsilat raporu (12.2a §3.8). {@code rows} o tarihteki durumdur: rapor gününde
   * geçerli olup sonradan iptal edilen kayıt satırda kalır ve {@code reversedOn} doludur (Rev 1
   * F-4); {@code totals} satırlardan iş yeri × para birimi. {@code fundBalances} satırlardaki ve
   * süzgeçte istenen fonların gün sonu ve güncel bakiyesi; {@code instrumentFundMovements} o gün
   * banka/kasaya yansıyan çek/senet hareketleri (tahsilatta giriş, ödemede çıkış).
   */
  public record DailyReportResponse(
      SettlementType type,
      LocalDate date,
      List<SettlementListItemResponse> rows,
      List<DailyTotal> totals,
      List<DailyFundBalanceResponse> fundBalances,
      List<DailyInstrumentMovementResponse> instrumentFundMovements) {}

  /**
   * Günlük rapor "Özet Bakiye Bilgisi" satırı: {@code balanceAtDate} rapor günü sonu, {@code
   * balanceNow} güncel bakiye (ileri tarihli hareketler dahil); ondalık metin.
   */
  public record DailyFundBalanceResponse(
      UUID fundAccountId,
      String name,
      FundKind kind,
      String currency,
      UUID branchId,
      String branchName,
      @NullableInSchema String bankName,
      @NullableInSchema String bankBranchName,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "1500.00")
          BigDecimal balanceAtDate,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "1500.00")
          BigDecimal balanceNow) {}

  /**
   * Günlük rapor "Banka Hareketine Yansıyan Çek Özeti" satırı: çekin iş yeri × fon × para birimi
   * başına adet ve toplam (ondalık metin).
   */
  public record DailyInstrumentMovementResponse(
      UUID branchId,
      String branchName,
      UUID fundAccountId,
      String fundName,
      FundKind fundKind,
      String currency,
      int count,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "1500.00")
          BigDecimal total) {}

  public record CreatePurchaseInvoiceRequest(
      @NotNull UUID accountId,
      @NotNull UUID branchId,
      @NotBlank @Size(max = 50) String number,
      @NotNull LocalDate invoiceDate,
      @NotNull LocalDate dueDate,
      @NotNull @Valid Money net,
      @NotNull @Valid Money vat,
      @Size(max = 500) String description,
      @Positive BigDecimal exchangeRate) {}

  public record PurchaseInvoiceResponse(
      UUID id,
      UUID accountId,
      UUID branchId,
      UUID companyId,
      String number,
      LocalDate invoiceDate,
      LocalDate dueDate,
      Money net,
      Money vat,
      Money total,
      InvoiceStatus status,
      String description) {}

  public record CreatePlanRequest(
      @NotNull UUID accountId,
      @NotNull UUID branchId,
      @NotNull @Valid Money money,
      @NotNull LocalDate dueDate,
      @Size(max = 500) String description) {}

  public record PlanResponse(
      UUID id,
      UUID accountId,
      UUID branchId,
      UUID companyId,
      Money money,
      LocalDate dueDate,
      PlanStatus status,
      UUID purchaseInvoiceId,
      String description,
      String rejectNote) {}

  public record PlanNoteRequest(@Size(max = 500) String note) {}

  public record PostponePlanRequest(@NotNull LocalDate dueDate, @Size(max = 500) String note) {}

  public record PayPlanRequest(
      @NotNull SettlementMethod method,
      @NotNull UUID fundAccountId,
      @NotNull LocalDate date,
      @Positive BigDecimal exchangeRate) {}

  public record PlanEventResponse(
      UUID id, String eventType, String note, String createdBy, Instant createdAt) {}

  public record SaveFinanceSettingsRequest(@NotNull Boolean allowSelfApproval) {}

  public record FinanceSettingsResponse(boolean allowSelfApproval) {}

  public record SaveThresholdRequest(
      @NotNull @PositiveOrZero BigDecimal low,
      @NotNull @PositiveOrZero BigDecimal medium,
      @NotNull @PositiveOrZero BigDecimal high) {}

  public record ThresholdResponse(
      String currency, BigDecimal low, BigDecimal medium, BigDecimal high) {}

  public record HeatmapCell(
      String period, String currency, BigDecimal total, int count, DensityLevel level) {}

  public record CurrencyTotal(String currency, BigDecimal total, int count) {}

  public record DashboardResponse(
      List<CurrencyTotal> overdue,
      List<CurrencyTotal> dueToday,
      List<CurrencyTotal> dueThisWeek,
      long pendingApproval,
      List<PlanResponse> upcoming) {}

  public record SaveExpenseTypeRequest(
      @NotBlank @Size(max = 50) String code, @NotBlank @Size(max = 100) String name) {}

  public record ExpenseTypeResponse(UUID id, String code, String name) {}

  /**
   * Masraf kalemi (12.7 §4.1). {@code code} boşsa {@code MK-00001} dizisinden üretilir; MUI kodu
   * yine gönderir.
   */
  public record SaveExpenseItemRequest(
      @NotNull UUID expenseTypeId,
      @NullableInSchema @Size(max = 50) String code,
      @NotBlank @Size(max = 100) String name,
      @NullableInSchema @Size(max = 500) String description,
      @NullableInSchema @Size(max = 30) String defaultUnit) {}

  /** ZTO "Sil": kalemi pasifleştirir ya da yeniden etkinleştirir. */
  public record ExpenseItemActiveRequest(@NotNull Boolean active) {}

  public record ExpenseItemResponse(
      UUID id,
      UUID expenseTypeId,
      @NullableInSchema String expenseTypeName,
      String code,
      String name,
      @NullableInSchema String description,
      @NullableInSchema String defaultUnit,
      boolean active,
      boolean system,
      Instant createdAt) {}

  /** Masraf satırı; boş iskonto oranı, tevkifat ve diğer vergi 0 sayılır (12.7 §4.1). */
  public record SaveExpenseLineRequest(
      @NullableInSchema @Size(max = 300) String description,
      @NotNull @Positive BigDecimal quantity,
      @NullableInSchema @Size(max = 20) String unit,
      @NotNull @PositiveOrZero BigDecimal unitPrice,
      @NullableInSchema @DecimalMin("0") @DecimalMax("100") BigDecimal discountRate,
      @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal vatRate,
      @NullableInSchema @PositiveOrZero BigDecimal withholdingAmount,
      @NullableInSchema @PositiveOrZero BigDecimal otherTaxAmount) {}

  /**
   * Genel masraf (12.7 §4.1). Şirket iş yerinden türetilir; bağlam kimliklerinden yalnız {@code
   * contextType}'a karşılık gelen dolu olur. Tutarlar satırlardan sunucuda hesaplanır.
   */
  public record SaveExpenseRequest(
      @NotNull UUID branchId,
      @NotNull UUID expenseItemId,
      @NotNull ExpenseContextType contextType,
      @NullableInSchema UUID vehicleId,
      @NullableInSchema UUID shipmentId,
      @NullableInSchema UUID warehouseId,
      @NullableInSchema UUID driverId,
      @NotNull ExpensePaymentMethod paymentMethod,
      @NullableInSchema UUID supplierAccountId,
      @NullableInSchema UUID fundAccountId,
      @NullableInSchema @Size(max = 50) String invoiceNumber,
      @NotNull LocalDate invoiceDate,
      @NullableInSchema LocalDate dueDate,
      @NotBlank @Size(max = 40) String documentType,
      @NotNull ExpenseDepartment department,
      @NullableInSchema @Size(max = 500) String description,
      @NotBlank @Pattern(regexp = "^[A-Z]{3}$") String currency,
      @NullableInSchema @Positive BigDecimal exchangeRate,
      @NotNull @Size(min = 1, max = 100) List<@NotNull @Valid SaveExpenseLineRequest> lines) {}

  /** Şema adı filo {@code ReverseExpenseRequest} (araç gideri) ile çakışmasın diye ayrıdır. */
  @Schema(name = "ExpenseReverseRequest")
  public record ReverseExpenseRequest(
      @NotNull LocalDate date, @NotBlank @Size(max = 500) String reason) {}

  /** Düzeltme: eski kayıt ters çevrilir, yeni kayıt yazılır (12.7 §3.2.2). */
  public record ReviseExpenseRequest(
      @NotNull @Valid SaveExpenseRequest expense,
      @NotBlank @Size(max = 500) String reason,
      boolean removeDocument) {}

  public record ExpenseLineResponse(
      UUID id,
      int lineNo,
      @NullableInSchema String description,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal quantity,
      @NullableInSchema String unit,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal unitPrice,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal subTotal,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal discountRate,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal discountAmount,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal netAmount,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal vatRate,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal vatAmount,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal withholdingAmount,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal otherTaxAmount,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal totalAmount) {}

  public record ExpenseDetailResponse(
      UUID id,
      UUID companyId,
      UUID branchId,
      String branchName,
      UUID expenseItemId,
      @NullableInSchema String expenseItemName,
      @NullableInSchema String expenseTypeName,
      ExpenseContextType contextType,
      @NullableInSchema UUID vehicleId,
      @NullableInSchema UUID shipmentId,
      @NullableInSchema UUID warehouseId,
      @NullableInSchema UUID driverId,
      @NullableInSchema String contextLabel,
      ExpensePaymentMethod paymentMethod,
      @NullableInSchema UUID supplierAccountId,
      @NullableInSchema String supplierName,
      @NullableInSchema UUID fundAccountId,
      @NullableInSchema String fundName,
      @NullableInSchema UUID settlementId,
      @NullableInSchema String invoiceNumber,
      LocalDate invoiceDate,
      @NullableInSchema LocalDate dueDate,
      String documentType,
      ExpenseDepartment department,
      @NullableInSchema String description,
      String currency,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal exchangeRate,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal subTotal,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal discountAmount,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal netAmount,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal vatAmount,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal withholdingAmount,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal otherTaxAmount,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal totalAmount,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal tlAmount,
      ExpenseStatus status,
      @NullableInSchema UUID replacesExpenseId,
      @NullableInSchema LocalDate reversedOn,
      @NullableInSchema String reverseReason,
      List<ExpenseLineResponse> lines,
      Instant createdAt,
      String createdBy) {}

  public record ExpenseListItemResponse(
      UUID id,
      @NullableInSchema String invoiceNumber,
      @NullableInSchema String description,
      UUID expenseItemId,
      @NullableInSchema String expenseItemName,
      @NullableInSchema String expenseTypeName,
      ExpenseDepartment department,
      UUID companyId,
      UUID branchId,
      String branchName,
      ExpenseContextType contextType,
      @NullableInSchema String contextLabel,
      ExpensePaymentMethod paymentMethod,
      @NullableInSchema String supplierName,
      String currency,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal totalAmount,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal tlAmount,
      LocalDate invoiceDate,
      @NullableInSchema LocalDate dueDate,
      String documentType,
      boolean hasDocument,
      Instant createdAt) {}

  /** Para birimi başına masraf sayısı ve toplamı (Rev 1 F3: CurrencyTotal kaydından ayrı). */
  public record ExpenseCurrencyTotalResponse(
      String currency,
      long count,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal totalAmount) {}

  /** Kalem özeti (ZTO IndexExpenses); son tedarikçinin VKN/TCKN'si yalnız maskeli. */
  public record ExpenseItemSummaryResponse(
      UUID expenseItemId,
      String expenseItemName,
      String expenseItemCode,
      @NullableInSchema String expenseTypeName,
      @NullableInSchema UUID lastSupplierAccountId,
      @NullableInSchema String lastSupplierName,
      @NullableInSchema String lastSupplierTaxNumberMasked,
      @NullableInSchema String lastSupplierPhone,
      @NullableInSchema String lastSupplierCity,
      List<String> branchNames,
      long invoiceCount,
      List<ExpenseCurrencyTotalResponse> totals,
      @NullableInSchema LocalDate lastInvoiceDate) {}

  public record ExpenseCalendarEntryResponse(
      UUID id,
      UUID expenseItemId,
      @NullableInSchema String expenseItemName,
      @NullableInSchema String expenseTypeName,
      @NullableInSchema String invoiceNumber,
      ExpenseContextType contextType,
      @NullableInSchema String contextLabel,
      @NullableInSchema String supplierName,
      ExpenseDepartment department,
      LocalDate invoiceDate,
      String currency,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal totalAmount) {}

  public record ExpenseCalendarDayResponse(
      LocalDate date, List<ExpenseCalendarEntryResponse> expenses) {}

  public record ExpenseAllTimeResponse(
      String currency,
      long count,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal netAmount,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal vatAmount,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal discountAmount,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal totalAmount) {}

  public record ExpenseCalendarResponse(
      int year,
      int month,
      List<ExpenseCalendarDayResponse> days,
      List<ExpenseAllTimeResponse> allTime) {}

  public record ExpenseMonthlyResponse(
      String month,
      @NullableInSchema UUID expenseTypeId,
      @NullableInSchema String expenseTypeName,
      @JsonFormat(shape = JsonFormat.Shape.STRING) @Schema(type = "string", format = "decimal")
          BigDecimal tlAmount) {}

  public record ExpenseContextOptionResponse(
      UUID id, String label, @NullableInSchema UUID branchId) {}

  public record CurrencyResponse(String code, String name) {}

  public record ExchangeRateResponse(
      String currency, LocalDate rateDate, BigDecimal rate, String source) {}
}
