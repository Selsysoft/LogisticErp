package org.ece.blackrose.integration.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.FinanceTypes.FundDirection;
import org.ece.blackrose.finance.domain.FundTransaction;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundAccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundTransactionRepository;
import org.ece.blackrose.integration.domain.BankStatementLine;
import org.ece.blackrose.integration.domain.IntegrationTypes.StatementLineStatus;
import org.ece.blackrose.integration.repository.IntegrationRepositories.BankStatementLineRepository;
import org.ece.blackrose.integration.web.IntegrationDtos.ReconciliationResponse;
import org.ece.blackrose.integration.web.IntegrationDtos.StatementImportResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Banka ekstresi mutabakatı. Ekstre yalnız karşılaştırılır, finans kaydı üretmez; bankada görünüp
 * sistemde olmayan hareket kullanıcıya gösterilir ve ayrıca girilir.
 */
@Service
public class BankStatementService {

  private static final int MATCH_WINDOW_DAYS = 3;

  private final BankStatementLineRepository lines;
  private final FundAccountRepository funds;
  private final FundTransactionRepository transactions;

  public BankStatementService(
      BankStatementLineRepository lines,
      FundAccountRepository funds,
      FundTransactionRepository transactions) {
    this.lines = lines;
    this.funds = funds;
    this.transactions = transactions;
  }

  /** tarih;tutar;aciklama;referans. Çıkan tutarlar eksi yazılır. */
  @Transactional
  public StatementImportResponse upload(UUID fundId, byte[] content) {
    funds
        .findForUpdate(fundId)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "FUND_NOT_FOUND", "Banka hesabı bulunamadı."));
    int imported = 0;
    int duplicates = 0;
    int matched = 0;
    List<String> errors = new ArrayList<>();
    for (CsvRows.Line row : CsvRows.parse(content)) {
      try {
        LocalDate date = CsvRows.date(row.required(0, "Tarih"));
        BigDecimal amount = CsvRows.amount(row.required(1, "Tutar"), "Tutar");
        if (amount.signum() == 0) {
          throw new CsvRows.RowException("Tutar sıfır olamaz.");
        }
        String key = CsvRows.key(row.text(3), row.raw());
        if (lines.existsByFundAccountIdAndExternalKey(fundId, key)) {
          duplicates++;
          continue;
        }
        BankStatementLine line =
            lines.saveAndFlush(
                new BankStatementLine(fundId, date, amount, row.text(2), row.text(3), key));
        imported++;
        if (autoMatch(line)) {
          matched++;
        }
      } catch (CsvRows.RowException ex) {
        errors.add("Satır " + row.number() + ": " + ex.getMessage());
      }
    }
    return new StatementImportResponse(imported, duplicates, matched, errors);
  }

  /**
   * Yön ve tutar aynı, tarihi en yakın hareketle eşler. En yakın iki aday eşitse tahmin etmez,
   * kullanıcıya bırakır.
   */
  private boolean autoMatch(BankStatementLine line) {
    List<FundTransaction> candidates =
        lines
            .openTransactions(
                line.getFundAccountId(),
                line.getLineDate().minusDays(MATCH_WINDOW_DAYS),
                line.getLineDate().plusDays(MATCH_WINDOW_DAYS))
            .stream()
            .filter(transaction -> sameAmount(line, transaction))
            .sorted(Comparator.comparingLong(t -> dayGap(line, t)))
            .toList();
    if (candidates.isEmpty()) {
      return false;
    }
    if (candidates.size() > 1
        && dayGap(line, candidates.get(0)) == dayGap(line, candidates.get(1))) {
      return false;
    }
    line.match(candidates.get(0).getId());
    lines.saveAndFlush(line);
    return true;
  }

  @Transactional
  public BankStatementLine match(UUID lineId, UUID transactionId) {
    BankStatementLine line = find(lineId);
    FundTransaction transaction =
        transactions
            .findById(transactionId)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "TRANSACTION_NOT_FOUND", "Hareket bulunamadı."));
    if (!transaction.getFundAccountId().equals(line.getFundAccountId())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "TRANSACTION_OTHER_FUND", "Hareket bu hesaba ait değil.");
    }
    if (!sameAmount(line, transaction)) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "AMOUNT_MISMATCH", "Tutar veya yön ekstre satırıyla uyuşmuyor.");
    }
    if (lines
        .openTransactions(
            line.getFundAccountId(),
            transaction.getTransactionDate(),
            transaction.getTransactionDate())
        .stream()
        .noneMatch(open -> open.getId().equals(transactionId))) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "TRANSACTION_ALREADY_MATCHED", "Hareket başka satıra bağlı.");
    }
    line.match(transactionId);
    return line;
  }

  @Transactional
  public BankStatementLine unmatch(UUID lineId) {
    BankStatementLine line = find(lineId);
    line.unmatch();
    return line;
  }

  @Transactional
  public BankStatementLine ignore(UUID lineId) {
    BankStatementLine line = find(lineId);
    line.ignore();
    return line;
  }

  @Transactional(readOnly = true)
  public ReconciliationResponse summary(UUID fundId) {
    List<BankStatementLine> all = lines.findByFundAccountIdOrderByLineDateDesc(fundId);
    return new ReconciliationResponse(
        count(all, StatementLineStatus.MATCHED),
        count(all, StatementLineStatus.UNMATCHED),
        count(all, StatementLineStatus.IGNORED),
        all.stream()
            .filter(line -> line.getStatus() == StatementLineStatus.UNMATCHED)
            .map(BankStatementLine::getAmount)
            .reduce(BigDecimal.ZERO, BigDecimal::add));
  }

  private static int count(List<BankStatementLine> all, StatementLineStatus status) {
    return (int) all.stream().filter(line -> line.getStatus() == status).count();
  }

  private static boolean sameAmount(BankStatementLine line, FundTransaction transaction) {
    FundDirection expected = line.getAmount().signum() > 0 ? FundDirection.IN : FundDirection.OUT;
    return transaction.getDirection() == expected
        && transaction.getMoney().amount().compareTo(line.getAmount().abs()) == 0;
  }

  private static long dayGap(BankStatementLine line, FundTransaction transaction) {
    return Math.abs(ChronoUnit.DAYS.between(line.getLineDate(), transaction.getTransactionDate()));
  }

  private BankStatementLine find(UUID id) {
    return lines
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "LINE_NOT_FOUND", "Ekstre satırı bulunamadı."));
  }
}
