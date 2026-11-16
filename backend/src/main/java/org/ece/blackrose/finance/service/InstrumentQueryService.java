package org.ece.blackrose.finance.service;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentMovementType;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.NoteType;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementStatus;
import org.ece.blackrose.finance.domain.Instrument;
import org.ece.blackrose.finance.repository.FinanceRepositories.InstrumentRepository;
import org.ece.blackrose.finance.repository.InstrumentQueryRepository.InstrumentItemRow;
import org.ece.blackrose.finance.repository.InstrumentQueryRepository.InstrumentListQueryRepository;
import org.ece.blackrose.finance.repository.InstrumentQueryRepository.InstrumentListQueryRepository.Criteria;
import org.ece.blackrose.finance.repository.InstrumentQueryRepository.InstrumentMovementRow;
import org.ece.blackrose.finance.web.FinanceDtos.InstrumentDetailResponse;
import org.ece.blackrose.finance.web.FinanceDtos.InstrumentListItemResponse;
import org.ece.blackrose.finance.web.FinanceDtos.InstrumentMovementResponse;
import org.ece.blackrose.finance.web.FinanceDtos.InstrumentNumberCheckResponse;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.organization.BranchScopeService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Çek/senet okuma yolu (12.3_TASARIM §3.9): süzgeçli sunucu sayfalı liste, detay (hareketlerle),
 * hareket geçmişi ve çek numarası ön denetimi. Personel carili çek izinsiz kullanıcıda listede
 * maskeli, tekil uçlarda 404 {@code INSTRUMENT_NOT_FOUND} (OK-12.3-18); kapsam dışı iş yeri 403.
 */
@Service
@Transactional(readOnly = true)
public class InstrumentQueryService {

  static final int MAX_PAGE_SIZE = 500;
  static final int MAX_QUERY_LENGTH = 100;

  private static final LocalDate MIN_DATE = LocalDate.of(1900, 1, 1);
  private static final LocalDate MAX_DATE = LocalDate.of(9999, 12, 31);
  private static final UUID NONE = BranchFilter.NONE;
  private static final Pattern CHECK_NUMBER = Pattern.compile("^\\d{7}$");

  private final InstrumentListQueryRepository queries;
  private final InstrumentRepository instruments;
  private final BranchScopeService scope;
  private final AccountAccess access;

  public InstrumentQueryService(
      InstrumentListQueryRepository queries,
      InstrumentRepository instruments,
      BranchScopeService scope,
      AccountAccess access) {
    this.queries = queries;
    this.instruments = instruments;
    this.scope = scope;
    this.access = access;
  }

  /**
   * Liste süzgeçleri (§3.9). {@code null}/boş alanlar süzmez; {@code endorsable = true} yalnız
   * {@code PORTFOLIO + RECEIVED + CHECK}.
   */
  public record InstrumentSearch(
      InstrumentKind kind,
      InstrumentDirection direction,
      List<InstrumentStatus> statuses,
      UUID accountId,
      LocalDate dueFrom,
      LocalDate dueTo,
      UUID checkBookId,
      NoteType noteType,
      Boolean endorsable,
      String q,
      UUID companyId,
      List<UUID> branchIds) {}

  /**
   * Sunucu sayfalı liste; sıra vade, numara, kimlik. {@code size} 1–{@value #MAX_PAGE_SIZE} (400
   * {@code PAGE_SIZE_INVALID}); {@code q} en çok {@value #MAX_QUERY_LENGTH} karakter.
   */
  public Page<InstrumentListItemResponse> list(InstrumentSearch search, int page, int size) {
    if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
      throw bad("PAGE_SIZE_INVALID", "Sayfa boyutu 1–500, sayfa 0 ya da büyük olmalıdır.");
    }
    Criteria criteria = criteria(search);
    List<InstrumentListItemResponse> content =
        queries.items(criteria, size, (long) page * size).stream()
            .map(InstrumentQueryService::toItem)
            .toList();
    return new PageImpl<>(content, PageRequest.of(page, size), queries.countItems(criteria));
  }

  private Criteria criteria(InstrumentSearch s) {
    if (s.dueFrom() != null && s.dueTo() != null && s.dueFrom().isAfter(s.dueTo())) {
      throw bad("DATE_RANGE_INVALID", "Başlangıç tarihi bitiş tarihinden sonra olamaz.");
    }
    String q = s.q() == null ? "" : s.q().trim();
    if (q.length() > MAX_QUERY_LENGTH) {
      throw bad("QUERY_TOO_LONG", "Arama metni en çok 100 karakter olabilir.");
    }
    if (s.accountId() != null) {
      access.readable(s.accountId());
    }
    BranchFilter filter = scope.filter(s.companyId(), s.branchIds());
    List<String> statuses =
        s.statuses() == null
            ? List.of()
            : s.statuses().stream().map(Enum::name).distinct().toList();
    return new Criteria(
        access.employeeVisible(),
        filter.companyId() == null,
        filter.companyId() == null ? NONE : filter.companyId(),
        filter.allBranches(),
        filter.branchIds(),
        s.kind() == null ? "" : s.kind().name(),
        s.direction() == null ? "" : s.direction().name(),
        statuses.isEmpty(),
        statuses.isEmpty() ? List.of("") : statuses,
        s.accountId() == null,
        s.accountId() == null ? NONE : s.accountId(),
        s.dueFrom() == null ? MIN_DATE : s.dueFrom(),
        s.dueTo() == null ? MAX_DATE : s.dueTo(),
        s.checkBookId() == null,
        s.checkBookId() == null ? NONE : s.checkBookId(),
        s.noteType() == null ? "" : s.noteType().name(),
        Boolean.TRUE.equals(s.endorsable()),
        FundQueryService.likePattern(q));
  }

  /**
   * Tek çek/senet ve hareketleri: yoksa (ya da izinsiz kullanıcıya personel carili ise) 404 {@code
   * INSTRUMENT_NOT_FOUND}, kapsam dışıysa 403.
   */
  public InstrumentDetailResponse detail(UUID id) {
    InstrumentListItemResponse item = readable(id);
    return new InstrumentDetailResponse(item, movementsOf(id));
  }

  /** Hareket geçmişi (fon adlarıyla); erişim kuralları {@link #detail} ile aynı. */
  public List<InstrumentMovementResponse> movements(UUID id) {
    readable(id);
    return movementsOf(id);
  }

  /**
   * Yazım ucunun yanıtı: erişim yazım yolunda denetlendiği için yalnız satırı okur (ciro edilen
   * personel carisi yine maskelenir).
   */
  public InstrumentListItemResponse view(UUID id) {
    return queries
        .item(id, access.employeeVisible())
        .map(InstrumentQueryService::toItem)
        .orElseThrow(InstrumentQueryService::notFound);
  }

  /** Ödeme/tahsilat detayındaki çek satırı (kayıt erişimi çağıranda denetlenmiştir). */
  public InstrumentListItemResponse viewOrNull(UUID id) {
    return queries
        .item(id, access.employeeVisible())
        .map(InstrumentQueryService::toItem)
        .orElse(null);
  }

  /**
   * Numara ön denetimi (§3.9). {@code companyId} zorunlu (400 {@code COMPANY_REQUIRED}) ve kapsam
   * denetiminden geçer; geçersiz biçimde arama yapılmaz.
   */
  public InstrumentNumberCheckResponse checkNumber(
      UUID companyId,
      InstrumentKind kind,
      InstrumentDirection direction,
      String number,
      String bankName,
      UUID excludeId) {
    if (companyId == null) {
      throw bad("COMPANY_REQUIRED", "Şirket seçin.");
    }
    scope.filter(companyId, null);
    String trimmed = number == null ? "" : number.trim();
    boolean valid =
        kind == InstrumentKind.CHECK ? CHECK_NUMBER.matcher(trimmed).matches() : !trimmed.isEmpty();
    if (!valid) {
      return new InstrumentNumberCheckResponse(false, false, null, null, null);
    }
    String bank = bankName == null || bankName.isBlank() ? null : bankName.trim();
    return instruments
        .findActiveByNumber(companyId, kind, direction, trimmed, bank, excludeId)
        .map(this::conflict)
        .orElseGet(() -> new InstrumentNumberCheckResponse(true, true, null, null, null));
  }

  private InstrumentNumberCheckResponse conflict(Instrument other) {
    Set<UUID> allowed = scope.allowedOrNull();
    String name = null;
    if (allowed == null || allowed.contains(other.getBranchId())) {
      name =
          queries
              .item(other.getId(), access.employeeVisible())
              .map(InstrumentItemRow::getAccountName)
              .orElse(null);
    }
    return new InstrumentNumberCheckResponse(true, false, other.getId(), other.getStatus(), name);
  }

  private InstrumentListItemResponse readable(UUID id) {
    InstrumentItemRow row =
        queries.item(id, access.employeeVisible()).orElseThrow(InstrumentQueryService::notFound);
    scope.requireVisible(row.getBranchId());
    if (Boolean.TRUE.equals(row.getEmployeeMasked())) {
      throw notFound();
    }
    return toItem(row);
  }

  private List<InstrumentMovementResponse> movementsOf(UUID id) {
    return queries.movements(id).stream().map(InstrumentQueryService::toMovement).toList();
  }

  // --- satır türetmeleri

  static InstrumentListItemResponse toItem(InstrumentItemRow row) {
    InstrumentKind kind = InstrumentKind.valueOf(row.getKind());
    InstrumentDirection direction = InstrumentDirection.valueOf(row.getDirection());
    InstrumentStatus status = InstrumentStatus.valueOf(row.getStatus());
    boolean masked = Boolean.TRUE.equals(row.getEmployeeMasked());
    List<InstrumentStatus> transitions =
        masked ? List.of() : List.copyOf(InstrumentRules.allowedTargets(kind, direction, status));
    return new InstrumentListItemResponse(
        row.getId(),
        kind,
        direction,
        row.getNumber(),
        row.getBankName(),
        row.getBankBranch(),
        row.getIssueDate(),
        row.getDueDate(),
        new Money(row.getAmount(), row.getCurrency()),
        status,
        row.getAccountId(),
        row.getAccountCode(),
        row.getAccountName(),
        row.getAccountType() == null ? null : AccountType.valueOf(row.getAccountType()),
        masked,
        row.getEndorsedAccountId(),
        row.getEndorsedAccountName(),
        row.getDrawerName(),
        row.getBranchId(),
        row.getBranchName(),
        row.getCompanyId(),
        row.getCompanyName(),
        row.getFundAccountId(),
        row.getFundName(),
        row.getFundKind() == null ? null : FundKind.valueOf(row.getFundKind()),
        row.getFundBankName(),
        row.getCustodyFundId(),
        row.getCustodyFundName(),
        row.getCheckLeafId(),
        row.getCheckBookId(),
        row.getCheckBookSerial(),
        row.getLeafNo(),
        row.getDescription(),
        row.getNoteType() == null ? null : NoteType.valueOf(row.getNoteType()),
        Boolean.TRUE.equals(row.getCollateral()),
        row.getSettledDate(),
        row.getOriginSettlementId(),
        row.getOriginSettlementStatus() == null
            ? null
            : SettlementStatus.valueOf(row.getOriginSettlementStatus()),
        row.getMovementCount() == null ? 0 : row.getMovementCount().intValue(),
        row.getLastMovementDate(),
        transitions);
  }

  static InstrumentMovementResponse toMovement(InstrumentMovementRow row) {
    return new InstrumentMovementResponse(
        row.getId(),
        row.getFromStatus() == null ? null : InstrumentStatus.valueOf(row.getFromStatus()),
        InstrumentStatus.valueOf(row.getToStatus()),
        row.getMovementDate(),
        row.getNote(),
        row.getCreatedBy(),
        InstrumentMovementType.valueOf(row.getMovementType()),
        row.getFromAccountId(),
        row.getToAccountId(),
        row.getAccountTransferId(),
        row.getFundAccountId(),
        row.getFundName());
  }

  private static BusinessException notFound() {
    return new BusinessException(
        HttpStatus.NOT_FOUND, "INSTRUMENT_NOT_FOUND", "Çek/senet bulunamadı.");
  }

  private static BusinessException bad(String code, String message) {
    return new BusinessException(HttpStatus.BAD_REQUEST, code, message);
  }
}
