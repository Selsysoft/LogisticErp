package org.ece.blackrose.finance.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.finance.domain.CheckBook;
import org.ece.blackrose.finance.domain.CheckLeaf;
import org.ece.blackrose.finance.domain.FinanceTypes.CheckLeafStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;
import org.ece.blackrose.finance.domain.FundAccount;
import org.ece.blackrose.finance.repository.FinanceRepositories.CheckBookRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.CheckLeafRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundAccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.InstrumentRepository;
import org.ece.blackrose.finance.repository.InstrumentQueryRepository.CheckBookQueryRepository;
import org.ece.blackrose.finance.repository.InstrumentQueryRepository.CheckBookRow;
import org.ece.blackrose.finance.repository.InstrumentQueryRepository.CheckLeafRow;
import org.ece.blackrose.finance.web.FinanceDtos.CheckBookCreatedResponse;
import org.ece.blackrose.finance.web.FinanceDtos.CheckBookRequest;
import org.ece.blackrose.finance.web.FinanceDtos.CheckBookResponse;
import org.ece.blackrose.finance.web.FinanceDtos.CheckLeafResponse;
import org.ece.blackrose.finance.web.FinanceDtos.CheckLeafVoidRequest;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.organization.BranchScopeService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Çek koçanları (12.3_TASARIM §3.6): koçan oluşturma (aralıktaki yapraklar, MICR, fonda kayıtlı
 * numaraların atlanması), yaprak iptali ve silme, okumalar. Para hareketi yazmaz; yaprak çeke
 * yalnız {@link InstrumentService} üzerinden bağlanır.
 */
@Service
public class CheckBookService {

  /** Bir koçandaki en çok yaprak (V38 {@code check_book_leaf_count_ck}). */
  static final int MAX_LEAVES = 1000;

  static final int MAX_LEAF_PAGE = 1000;

  private static final Pattern NUMBER = Pattern.compile("^\\d{7}$");
  private static final Pattern CODE = Pattern.compile("^\\d{4}$");
  private static final Pattern PREFIX = Pattern.compile("^\\d{1,7}$");
  private static final UUID NONE = BranchFilter.NONE;

  private final CheckBookRepository books;
  private final CheckLeafRepository leaves;
  private final CheckBookQueryRepository queries;
  private final FundAccountRepository fundAccounts;
  private final InstrumentRepository instruments;
  private final FundService funds;
  private final BranchScopeService scope;
  private final AuditService audit;

  @SuppressWarnings("java:S107")
  public CheckBookService(
      CheckBookRepository books,
      CheckLeafRepository leaves,
      CheckBookQueryRepository queries,
      FundAccountRepository fundAccounts,
      InstrumentRepository instruments,
      FundService funds,
      BranchScopeService scope,
      AuditService audit) {
    this.books = books;
    this.leaves = leaves;
    this.queries = queries;
    this.fundAccounts = fundAccounts;
    this.instruments = instruments;
    this.funds = funds;
    this.scope = scope;
    this.audit = audit;
  }

  /** Oluşacak yaprak (koçandaki sıra, 7 haneli numara, MICR ya da null). */
  record PlannedLeaf(int leafNo, String number, String micrCode) {}

  /** Aralığın yaprak planı: oluşacaklar ve fonda zaten kayıtlı olduğu için atlananlar. */
  record Numbering(List<PlannedLeaf> leaves, List<String> skipped) {}

  // --- yazım

  /**
   * Yeni koçan. Fon BANK, aktif ve kapsamda olmalı; aynı fonda eşzamanlı iki koçan fon satır
   * kilidiyle sıraya girer, ikincisi ilkinin yapraklarını atlar.
   */
  @Transactional
  public CheckBookCreatedResponse create(CheckBookRequest r) {
    FundAccount fund = funds.findVisible(r.fundAccountId());
    FundService.requireActive(fund);
    if (fund.getKind() != FundKind.BANK) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "FUND_KIND_MISMATCH", "Lütfen banka hesabı seçiniz!");
    }
    String serialNo = r.serialNo() == null ? "" : r.serialNo().trim();
    if (serialNo.isEmpty() || serialNo.length() > 50) {
      throw invalid("serialNo", "Lütfen defter seri no giriniz!");
    }
    String start = trim(r.startNumber());
    if (start == null || !NUMBER.matcher(start).matches()) {
      throw invalid("startNumber", "Başlangıç çek numarası hatalı!");
    }
    String end = trim(r.endNumber());
    if (end == null || !NUMBER.matcher(end).matches()) {
      throw invalid("endNumber", "Bitiş çek numarası hatalı!");
    }
    String bankCode = trim(r.bankCode());
    String branchCode = trim(r.branchCode());
    if (bankCode != null || branchCode != null) {
      if (bankCode == null || !CODE.matcher(bankCode).matches()) {
        throw invalid("bankCode", "Banka kodu hatalı!");
      }
      if (branchCode == null || !CODE.matcher(branchCode).matches()) {
        throw invalid("branchCode", "Şube kodu hatalı!");
      }
    }
    int from = Integer.parseInt(start);
    int to = Integer.parseInt(end);
    if (from > to) {
      throw rangeInvalid("Bitiş çek numarası, başlangıç numarasından küçük olamaz.");
    }
    if (to - from + 1 > MAX_LEAVES) {
      throw rangeInvalid("Bir koçanda en çok 1000 yaprak olabilir.");
    }

    fundAccounts.findForUpdate(fund.getId());
    if (books.existsByFundAccountIdAndSerialNoAndDeletedFalse(fund.getId(), serialNo)) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "CHECK_BOOK_SERIAL_TAKEN",
          "Bu banka hesabında aynı seri numaralı koçan zaten kayıtlı.");
    }
    Numbering plan =
        plan(from, to, bankCode, branchCode, leaves.findNumbersByFundAccountId(fund.getId()));
    if (plan.leaves().isEmpty()) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "CHECK_BOOK_EMPTY",
          "Girilen aralıktaki tüm çek numaraları zaten kayıtlı.");
    }
    CheckBook book =
        books.saveAndFlush(
            new CheckBook(
                fund.getCompanyId(),
                fund.getBranchId(),
                fund.getId(),
                serialNo,
                bankCode,
                branchCode,
                start,
                end,
                plan.leaves().size()));
    leaves.saveAllAndFlush(
        plan.leaves().stream()
            .map(
                p ->
                    new CheckLeaf(
                        fund.getCompanyId(),
                        book.getId(),
                        fund.getId(),
                        p.leafNo(),
                        p.number(),
                        p.micrCode()))
            .toList());
    audit.record(
        AuditEvent.CHECK_BOOK_CREATED,
        "CHECK_BOOK:" + book.getId(),
        "leaves=" + plan.leaves().size() + ",skipped=" + plan.skipped().size());
    return new CheckBookCreatedResponse(
        toBook(queries.book(book.getId()).orElseThrow()), plan.leaves().size(), plan.skipped());
  }

  /**
   * Yaprak iptali. {@code VOID} yaprakta idempotent; etkin (iptal edilmemiş) bir çeke bağlı yaprak
   * iptal edilemez (409 {@code CHECK_LEAF_IN_USE}). Çek kilitlenmez ({@code CANCELLED} son durum).
   */
  @Transactional
  public CheckLeafResponse voidLeaf(UUID leafId, CheckLeafVoidRequest r) {
    CheckLeaf leaf = lockLeaf(leafId);
    if (leaf.getStatus() != CheckLeafStatus.VOID) {
      if (leaf.getStatus() == CheckLeafStatus.USED
          && instruments.findByCheckLeafIdAndDeletedFalse(leafId).stream()
              .anyMatch(i -> i.getStatus() != InstrumentStatus.CANCELLED)) {
        throw new BusinessException(
            HttpStatus.CONFLICT,
            "CHECK_LEAF_IN_USE",
            "Bu yaprak etkin bir çekte kullanılıyor; önce ödemeyi iptal edin.");
      }
      leaf.voidLeaf(r == null ? null : trim(r.reason()));
      leaves.flush();
      audit.record(
          AuditEvent.CHECK_LEAF_VOIDED, "CHECK_LEAF:" + leafId, "number=" + leaf.getNumber());
    }
    return toLeaf(queries.leaf(leafId).orElseThrow(InstrumentService::leafNotFound));
  }

  /** Yalnız kullanılmamış yaprak silinir; koçanın {@code leafCount}'u değişmez (tarihsel). */
  @Transactional
  public void deleteLeaf(UUID leafId) {
    CheckLeaf leaf = lockLeaf(leafId);
    if (leaf.getStatus() != CheckLeafStatus.UNUSED) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "CHECK_LEAF_NOT_DELETABLE",
          "Yalnız kullanılmamış yaprak silinebilir.");
    }
    leaf.softDelete();
    audit.record(
        AuditEvent.CHECK_LEAF_DELETED, "CHECK_LEAF:" + leafId, "number=" + leaf.getNumber());
  }

  // --- okuma

  @Transactional(readOnly = true)
  public List<CheckBookResponse> books(UUID fundAccountId, UUID companyId, List<UUID> branchIds) {
    BranchFilter filter = scope.filter(companyId, branchIds);
    return queries
        .books(
            filter.companyId() == null,
            orNone(filter.companyId()),
            filter.allBranches(),
            filter.branchIds(),
            fundAccountId == null,
            orNone(fundAccountId))
        .stream()
        .map(CheckBookService::toBook)
        .toList();
  }

  @Transactional(readOnly = true)
  public PageResponse<CheckLeafResponse> leaves(
      UUID fundAccountId,
      UUID checkBookId,
      CheckLeafStatus status,
      String serial,
      UUID companyId,
      int page,
      int size) {
    if (page < 0 || size < 1 || size > MAX_LEAF_PAGE) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "PAGE_SIZE_INVALID",
          "Sayfa boyutu 1–1000, sayfa 0 ya da büyük olmalıdır.");
    }
    BranchFilter filter = scope.filter(companyId, null);
    String statusText = status == null ? "" : status.name();
    String pattern = FundQueryService.likePattern(serial);
    long total =
        queries.countLeaves(
            filter.companyId() == null,
            orNone(filter.companyId()),
            filter.allBranches(),
            filter.branchIds(),
            fundAccountId == null,
            orNone(fundAccountId),
            checkBookId == null,
            orNone(checkBookId),
            statusText,
            pattern);
    List<CheckLeafResponse> content =
        queries
            .leaves(
                filter.companyId() == null,
                orNone(filter.companyId()),
                filter.allBranches(),
                filter.branchIds(),
                fundAccountId == null,
                orNone(fundAccountId),
                checkBookId == null,
                orNone(checkBookId),
                statusText,
                pattern,
                size,
                (long) page * size)
            .stream()
            .map(CheckBookService::toLeaf)
            .toList();
    return new PageResponse<>(content, page, size, total, (int) ((total + size - 1) / size));
  }

  /**
   * Numara önekiyle en çok 5 yaprak (1–7 rakam, baştaki sıfırlar korunur; değilse 400 {@code
   * CHECK_NUMBER_INVALID}).
   */
  @Transactional(readOnly = true)
  public List<CheckLeafResponse> lookup(String number, UUID fundAccountId, UUID companyId) {
    String prefix = number == null ? "" : number.trim();
    if (!PREFIX.matcher(prefix).matches()) {
      throw InstrumentService.checkNumberInvalid();
    }
    BranchFilter filter = scope.filter(companyId, null);
    return queries
        .lookup(
            filter.companyId() == null,
            orNone(filter.companyId()),
            filter.allBranches(),
            filter.branchIds(),
            fundAccountId == null,
            orNone(fundAccountId),
            prefix)
        .stream()
        .map(CheckBookService::toLeaf)
        .toList();
  }

  // --- yardımcılar

  /**
   * Aralığın yaprak planı. Numara {@code %07d} (ZTO hatası (k): baştaki sıfır korunur); MICR {@code
   * "c" + bankCode + branchCode + %08d} (kod yoksa null); {@code existing}'teki numaralar atlanır,
   * {@code leafNo} aralıktaki konumdur.
   */
  static Numbering plan(
      int from, int to, String bankCode, String branchCode, Set<String> existing) {
    List<PlannedLeaf> planned = new ArrayList<>();
    List<String> skipped = new ArrayList<>();
    for (int n = from; n <= to; n++) {
      String number = String.format("%07d", n);
      if (existing.contains(number)) {
        skipped.add(number);
        continue;
      }
      String micr =
          bankCode == null ? null : "c" + bankCode + branchCode + String.format("%08d", n);
      planned.add(new PlannedLeaf(n - from + 1, number, micr));
    }
    return new Numbering(List.copyOf(planned), List.copyOf(skipped));
  }

  private CheckLeaf lockLeaf(UUID leafId) {
    CheckLeaf leaf = leaves.findForUpdate(leafId).orElseThrow(InstrumentService::leafNotFound);
    CheckBook book =
        books.findById(leaf.getCheckBookId()).orElseThrow(InstrumentService::leafNotFound);
    scope.requireVisible(book.getBranchId());
    return leaf;
  }

  static CheckBookResponse toBook(CheckBookRow row) {
    return new CheckBookResponse(
        row.getId(),
        row.getCompanyId(),
        row.getBranchId(),
        row.getBranchName(),
        row.getFundAccountId(),
        row.getFundName(),
        row.getFundBankName(),
        row.getSerialNo(),
        row.getBankCode(),
        row.getBranchCode(),
        row.getStartNumber(),
        row.getEndNumber(),
        row.getLeafCount(),
        count(row.getUnusedCount()),
        count(row.getUsedCount()),
        count(row.getVoidCount()),
        AccountTransactionQueryService.instant(row.getCreatedAt()));
  }

  static CheckLeafResponse toLeaf(CheckLeafRow row) {
    return new CheckLeafResponse(
        row.getId(),
        row.getCheckBookId(),
        row.getCheckBookSerial(),
        row.getLeafNo(),
        row.getNumber(),
        row.getMicrCode(),
        CheckLeafStatus.valueOf(row.getStatus()),
        row.getUsedDate(),
        row.getVoidReason(),
        row.getFundAccountId(),
        row.getFundName(),
        row.getFundBankName(),
        row.getFundBankBranchName(),
        row.getFundIban(),
        row.getBranchId(),
        row.getBranchName(),
        row.getCompanyId(),
        row.getInstrumentId(),
        row.getInstrumentStatus() == null
            ? null
            : InstrumentStatus.valueOf(row.getInstrumentStatus()));
  }

  private static int count(Long value) {
    return value == null ? 0 : value.intValue();
  }

  private static UUID orNone(UUID id) {
    return id == null ? NONE : id;
  }

  private static String trim(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private static BusinessException invalid(String field, String message) {
    return new BusinessException(
        HttpStatus.BAD_REQUEST, "CHECK_BOOK_INVALID", message, List.of("field=" + field));
  }

  private static BusinessException rangeInvalid(String message) {
    return new BusinessException(HttpStatus.BAD_REQUEST, "CHECK_BOOK_RANGE_INVALID", message);
  }
}
