package org.ece.blackrose.finance.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.AccountTransaction;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountDocumentRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountTransferLineRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.finance.service.ExchangeRateService.Conversion;
import org.ece.blackrose.organization.CompanyResolver;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Cari hareketlerin tek yazım noktası. Aynı kaynak belge ikinci kez kayıt üretmez. */
@Service
public class LedgerService {

  public static final String SOURCE_MANUAL = "MANUAL";
  public static final String SOURCE_REVERSAL = "REVERSAL";

  /** Borç/Alacak Ekle belgesi (12.1 §3.4). */
  public static final String SOURCE_ACCOUNT_DOCUMENT = "ACCOUNT_DOCUMENT";

  /** Cari taşıma virman çifti (12.1 §3.11); {@code source_id} = taşıma satırı. */
  public static final String SOURCE_TRANSFER_OUT = "ACCOUNT_TRANSFER_OUT";

  public static final String SOURCE_TRANSFER_IN = "ACCOUNT_TRANSFER_IN";

  public record Posting(
      UUID accountId,
      UUID branchId,
      Direction direction,
      Money money,
      LocalDate date,
      String description,
      String sourceType,
      UUID sourceId,
      BigDecimal manualRate) {}

  private final AccountTransactionRepository transactions;
  private final AccountRepository accounts;
  private final AccountTransferLineRepository transferLines;
  private final ExchangeRateService rates;
  private final CompanyResolver companies;
  private final AccountDocumentRepository fxDocuments;

  public LedgerService(
      AccountTransactionRepository transactions,
      AccountRepository accounts,
      AccountTransferLineRepository transferLines,
      ExchangeRateService rates,
      CompanyResolver companies,
      AccountDocumentRepository fxDocuments) {
    this.transactions = transactions;
    this.accounts = accounts;
    this.transferLines = transferLines;
    this.rates = rates;
    this.companies = companies;
    this.fxDocuments = fxDocuments;
  }

  @Transactional
  public AccountTransaction post(Posting posting) {
    return transactions
        .findBySourceTypeAndSourceId(posting.sourceType(), posting.sourceId())
        .orElseGet(() -> insert(posting));
  }

  /**
   * Kart–şirket kuralı burada uygulanmaz (12.1 §3.11, OK-28): türetilmiş akışlar (sefer kapanışı,
   * fatura, plan ödemesi) takılmaz; kullanıcı girişli yollar {@link CompanyIdentityRule}'u kendisi
   * çağırır. Yalnız grup carisi kuralı (§4.13 #14) kalır.
   */
  private AccountTransaction insert(Posting posting) {
    Account account = account(posting.accountId());
    if (posting.money().amount().signum() <= 0) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "AMOUNT_INVALID", "Tutar sıfırdan büyük olmalıdır.");
    }
    UUID companyId = companies.companyOf(posting.branchId());
    requireNotOwnGroupAccount(account, companyId);
    Conversion conversion = rates.convert(posting.money(), posting.date(), posting.manualRate());
    return transactions.save(
        new AccountTransaction(
            posting.accountId(),
            posting.branchId(),
            companyId,
            posting.direction(),
            posting.money(),
            conversion.rate(),
            conversion.rateDate(),
            conversion.tlAmount(),
            posting.date(),
            posting.description(),
            posting.sourceType(),
            posting.sourceId()));
  }

  /**
   * Cari taşıma virman satırı: orijinal hareketin tutarı, kuru, kur tarihi, TL karşılığı, iş yeri
   * ve şirketiyle verilen cariye verilen yönde yazılır; yeniden kur çevrimi yoktur. Aynı kaynakla
   * ikinci çağrı ilk satırı döner. Hedef carinin şirket kuralı çağıranda ({@code
   * AccountTransferService}) denetlenir.
   */
  @Transactional
  public AccountTransaction mirror(
      AccountTransaction original,
      UUID accountId,
      Direction direction,
      LocalDate date,
      String description,
      String sourceType,
      UUID sourceId) {
    return transactions
        .findBySourceTypeAndSourceId(sourceType, sourceId)
        .orElseGet(
            () -> {
              requireNotOwnGroupAccount(account(accountId), original.getCompanyId());
              return transactions.save(
                  new AccountTransaction(
                      accountId,
                      original.getBranchId(),
                      original.getCompanyId(),
                      direction,
                      original.getMoney(),
                      original.getExchangeRate(),
                      original.getRateDate(),
                      original.getTlAmount(),
                      date,
                      LedgerDescriptions.fit(description),
                      sourceType,
                      sourceId));
            });
  }

  /** Kaynak belgenin cari hareketini aynı kur ve TL karşılığıyla ters çevirir. */
  @Transactional
  public void reverseSource(String sourceType, UUID sourceId, LocalDate date, String description) {
    transactions
        .findBySourceTypeAndSourceId(sourceType, sourceId)
        .ifPresent(original -> reverse(original, date, description));
  }

  /**
   * Kaynak belgenin cari hareketini yalnız kilitler ({@code FOR UPDATE}); defter yazmaz, satır
   * yoksa bir şey yapmaz. Çekli ödeme/tahsilat iptali ve düzeltmesi hareketi çekten önce kilitler;
   * böylece cari taşımanın {@code account_transaction → instrument} sırası izlenir (12.3 §3.4 adım
   * 8, Rev 1 F2). Sonraki {@link #reverse} aynı işlemde kilide yeniden girer.
   */
  @Transactional
  public void lockSource(String sourceType, UUID sourceId) {
    transactions
        .findBySourceTypeAndSourceId(sourceType, sourceId)
        .ifPresent(original -> transactions.findForUpdate(original.getId()));
  }

  /**
   * Ters kayıt. Orijinal satır kilitlenir (12.1 §3.11 F1; cari taşıma aynı satırı kilitler) ve
   * kilit altında taşınmışlık ile ters çevrilmişlik yeniden okunur: taşınmış hareketin kaynağı
   * iptal edilemez (409 {@code TRANSACTION_TRANSFERRED}), mevcut ters kayıt yeniden döner. Belge
   * iptali, ödeme/tahsilat ters kaydı, fatura iptali ve açılış geri alma bu tek noktadan geçer.
   */
  @Transactional
  public AccountTransaction reverse(
      AccountTransaction original, LocalDate date, String description) {
    if (SOURCE_REVERSAL.equals(original.getSourceType())) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "ALREADY_REVERSAL", "Ters hareket yeniden ters çevrilemez.");
    }
    transactions.findForUpdate(original.getId());
    if (transferLines.existsByAccountTransactionIdAndActiveTrue(original.getId())) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "TRANSACTION_TRANSFERRED",
          "Bu hareket başka cariye taşınmış; önce cari taşımayı geri alın.");
    }
    // 12.8 §3.3.1: kilitten sonra okunur; kur farkı kesimi aynı satırı kilitler.
    if (fxDocuments.existsByFxSourceTransactionIdAndStatusAndDeletedFalse(
        original.getId(), AccountDocumentStatus.OPEN)) {
      throw fxDocumentOpen(original.getId());
    }
    return transactions
        .findBySourceTypeAndSourceId(SOURCE_REVERSAL, original.getId())
        .orElseGet(
            () ->
                transactions.save(
                    new AccountTransaction(
                        original.getAccountId(),
                        original.getBranchId(),
                        original.getCompanyId(),
                        original.getDirection().opposite(),
                        original.getMoney(),
                        original.getExchangeRate(),
                        original.getRateDate(),
                        original.getTlAmount(),
                        date,
                        LedgerDescriptions.fit(description),
                        SOURCE_REVERSAL,
                        original.getId())));
  }

  /**
   * Kaynağına açık kur farkı belgesi kesilmiş hareket ters çevrilemez ve taşınamaz (12.8 §3.3.1,
   * §3.3.2).
   */
  public static BusinessException fxDocumentOpen(UUID transactionId) {
    return new BusinessException(
        HttpStatus.CONFLICT,
        "FX_DOCUMENT_OPEN",
        "Bu harekete kesilmiş kur farkı belgesi var; önce kur farkı belgesini iptal edin.",
        List.of("transactionId=" + transactionId));
  }

  private Account account(UUID id) {
    return accounts
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "ACCOUNT_NOT_FOUND", "Cari bulunamadı."));
  }

  /** Kimlik kuralı (§4.13 #14): şirket kendi grup carisine hareket yazamaz. */
  private static void requireNotOwnGroupAccount(Account account, UUID companyId) {
    if (companyId.equals(account.getRepresentsCompanyId())) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "COMPANY_MISMATCH",
          "Şirket kendi grup carisine hareket yazamaz.");
    }
  }
}
