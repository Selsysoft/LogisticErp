package org.ece.blackrose.finance.service;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.AccountTransfer;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.domain.FinanceTypes.TransactionKind;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountTransferRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.CrossLedgerRow;
import org.ece.blackrose.finance.repository.FinanceRepositories.LedgerDetailRow;
import org.ece.blackrose.finance.repository.FundRepositories.IntercompanyTransferRepository;
import org.ece.blackrose.finance.web.AccountDtos.AccountDocumentResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountTransactionDetailResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountTransactionFacetsResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountTransactionPageResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountTransactionRowResponse;
import org.ece.blackrose.finance.web.AccountDtos.BranchFacetResponse;
import org.ece.blackrose.finance.web.AccountDtos.GroupFacetResponse;
import org.ece.blackrose.finance.web.AccountDtos.KindFacetResponse;
import org.ece.blackrose.finance.web.AccountDtos.TransactionSourceResponse;
import org.ece.blackrose.finance.web.AccountDtos.TransactionTransferResponse;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.organization.BranchScopeService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Çapraz cari hareket listesi (Günlük Tüm Cari İşlemleri, Cari Hareketler), tek hareket detayı ve
 * kaynak çözücü (12.1 §3.7). Hareket türü (kind) §3.5 SQL'inden gelir. Personel carisinin hareketi
 * izinsiz kullanıcıya hiç yokmuş gibi davranır.
 */
@Service
public class AccountTransactionQueryService {

  /** Çapraz liste (cari seçili değilken) en çok bu kadar günlük aralık (≈1 yıl). */
  static final int MAX_RANGE_DAYS = 366;

  public static final int MAX_PAGE_SIZE = 500;

  private static final LocalDate MIN_DATE = LocalDate.of(1, 1, 1);
  private static final LocalDate MAX_DATE = LocalDate.of(9999, 12, 31);
  private static final List<String> PLACEHOLDER = List.of("");

  /** Liste süzgeçleri; boş liste "hepsi". */
  public record AccountTransactionQuery(
      LocalDate from,
      LocalDate to,
      UUID accountId,
      String currency,
      UUID companyId,
      List<UUID> branchIds,
      List<AccountType> accountTypes,
      List<String> subGroups,
      List<TransactionKind> kinds,
      boolean facets) {}

  private final AccountTransactionRepository transactions;
  private final AccountTransferRepository transfers;
  private final AccountDocumentService documents;
  private final AccountAccess access;
  private final BranchScopeService scope;
  private final IntercompanyTransferRepository intercompanyTransfers;

  public AccountTransactionQueryService(
      AccountTransactionRepository transactions,
      AccountTransferRepository transfers,
      AccountDocumentService documents,
      AccountAccess access,
      BranchScopeService scope,
      IntercompanyTransferRepository intercompanyTransfers) {
    this.intercompanyTransfers = intercompanyTransfers;
    this.transactions = transactions;
    this.transfers = transfers;
    this.documents = documents;
    this.access = access;
    this.scope = scope;
  }

  /**
   * Cari seçili değilken {@code from}/{@code to} zorunlu ve aralık ≤ 366 gün (400 {@code
   * DATE_RANGE_TOO_LARGE}); cari seçiliyken sınırsız ve isteğe bağlı. Facet'ler iş yeri/grup/tür
   * seçimlerini uygulamaz ama kullanıcının kapsamına daralır.
   */
  @Transactional(readOnly = true)
  public AccountTransactionPageResponse search(AccountTransactionQuery q, int page, int size) {
    LocalDate from = q.from();
    LocalDate to = q.to();
    if (q.accountId() == null) {
      if (from == null
          || to == null
          || to.isBefore(from)
          || daysBetween(from, to) > MAX_RANGE_DAYS) {
        throw new BusinessException(
            HttpStatus.BAD_REQUEST, "DATE_RANGE_TOO_LARGE", "Tarih aralığı en çok 1 yıl olabilir.");
      }
    } else {
      access.readable(q.accountId());
      from = from == null ? MIN_DATE : from;
      to = to == null ? MAX_DATE : to;
    }
    int pageSize = Math.max(1, Math.min(size, MAX_PAGE_SIZE));
    int pageNumber = Math.max(0, page);
    boolean allAccounts = q.accountId() == null;
    UUID accountId = allAccounts ? BranchFilter.NONE : q.accountId();
    String currency = q.currency() == null ? "" : q.currency().trim();
    boolean employees = access.employeeVisible();
    BranchFilter filter = scope.filter(q.companyId(), q.branchIds());
    boolean allTypes = isEmpty(q.accountTypes());
    boolean allGroups = isEmpty(q.subGroups());
    boolean allKinds = isEmpty(q.kinds());
    List<String> types =
        allTypes ? PLACEHOLDER : q.accountTypes().stream().map(Enum::name).toList();
    List<String> groups = allGroups ? PLACEHOLDER : q.subGroups();
    List<String> kinds = allKinds ? PLACEHOLDER : q.kinds().stream().map(Enum::name).toList();

    List<CrossLedgerRow> rows =
        transactions.crossRows(
            from,
            to,
            allAccounts,
            accountId,
            currency,
            filter.companyId() == null,
            companyOrNone(filter),
            filter.allBranches(),
            filter.branchIds(),
            employees,
            allTypes,
            types,
            allGroups,
            groups,
            allKinds,
            kinds,
            pageSize,
            (long) pageNumber * pageSize);
    long total =
        transactions.crossCount(
            from,
            to,
            allAccounts,
            accountId,
            currency,
            filter.companyId() == null,
            companyOrNone(filter),
            filter.allBranches(),
            filter.branchIds(),
            employees,
            allTypes,
            types,
            allGroups,
            groups,
            allKinds,
            kinds);
    AccountTransactionFacetsResponse facets = null;
    if (q.facets()) {
      // Kullanıcının iş yeri seçimi düşer, LIMITED kapsamı kalır (kapsam dışı iş yeri dönmez).
      BranchFilter scoped = scope.filter(q.companyId(), null);
      facets = facets(from, to, allAccounts, accountId, currency, scoped, employees);
    }
    return new AccountTransactionPageResponse(
        rows.stream().map(AccountTransactionQueryService::toRow).toList(),
        pageNumber,
        pageSize,
        total,
        (int) ((total + pageSize - 1) / pageSize),
        facets);
  }

  /** Tek hareket: satır, belge (taban kaynak belge ise), ters kaydı ve taşıması. */
  @Transactional(readOnly = true)
  public AccountTransactionDetailResponse get(UUID id) {
    LedgerDetailRow row = visibleRow(id);
    AccountDocumentResponse document =
        AccountDocumentService.SOURCE.equals(row.getBaseSourceType())
            ? documents.find(row.getBaseSourceId()).orElse(null)
            : null;
    return new AccountTransactionDetailResponse(
        toRow(row), document, row.getReversedById(), transferOf(row));
  }

  /** Taban kaynak ve (varsa) uygulamadaki sayfası; var olmayan rota üretilmez. */
  @Transactional(readOnly = true)
  public TransactionSourceResponse source(UUID id) {
    LedgerDetailRow row = visibleRow(id);
    if ("SETTLEMENT".equals(row.getBaseSourceType())) {
      // Şirketler arası virmanın bacağı: etiket virman koduyla, rota transfer merkezi (12.2 §3.9).
      var link = intercompanyTransfers.findBySettlement(row.getBaseSourceId());
      if (link.isPresent()) {
        String code = link.get().getCode();
        return new TransactionSourceResponse(
            "SETTLEMENT",
            row.getBaseSourceId(),
            "Şirketler arası virman " + code,
            FundTransferService.route(code, link.get().getTransferDate()));
      }
    }
    return sourceOf(row);
  }

  /** Detay ve kaynak için hareket: yoksa, silinmişse ya da cari okunamıyorsa 404. */
  LedgerDetailRow visibleRow(UUID id) {
    LedgerDetailRow row =
        transactions.detailRow(id).orElseThrow(AccountTransactionQueryService::notFound);
    if (AccountType.EMPLOYEE.name().equals(row.getAccountType()) && !access.employeeVisible()) {
      throw notFound();
    }
    scope.requireVisible(row.getBranchId());
    return row;
  }

  static TransactionSourceResponse sourceOf(LedgerDetailRow row) {
    String type = row.getBaseSourceType();
    String number = row.getDocumentNo();
    UUID ref = row.getRefId();
    String route =
        switch (type) {
          case "SETTLEMENT" ->
              SettlementQueryService.route(
                  "COLLECTION".equals(row.getKind())
                      ? SettlementType.COLLECTION
                      : SettlementType.PAYMENT,
                  row.getBaseSourceId());
          case "PURCHASE_INVOICE" -> "/finance/invoices";
          case "FREIGHT_INVOICE", "TRIP_COST" ->
              ref == null ? null : "/operations/shipments/" + ref;
          case "WAREHOUSE_INVOICE" -> ref == null ? null : "/warehouse/billing/" + ref;
          case "VEHICLE_EXPENSE" -> ref == null ? null : "/fleet/vehicles/" + ref;
          case "INSTRUMENT", "INSTRUMENT_ENDORSEE_BOUNCE" -> "/finance/instruments";
          default -> null;
        };
    return new TransactionSourceResponse(
        type, row.getBaseSourceId(), label(type, number, row.getDocumentType()), route);
  }

  private static String label(String type, String number, String documentType) {
    String name =
        switch (type) {
          case "ACCOUNT_DOCUMENT" -> "Cari belgesi";
          case "SETTLEMENT" -> "Ödeme/tahsilat";
          case "PURCHASE_INVOICE" -> "Alış faturası";
          case "FREIGHT_INVOICE" -> "Navlun faturası";
          case "WAREHOUSE_INVOICE" -> "Depo faturası";
          case "TRIP_COST" -> "Sefer maliyeti";
          case "VEHICLE_EXPENSE" -> "Araç gideri";
          case "INSTRUMENT", "INSTRUMENT_ENDORSEE_BOUNCE" -> "Çek/senet hareketi";
          case "OPENING" -> "Açılış bakiyesi";
          case "OPENING_INVOICE" -> "Açılış faturası";
          case "MANUAL" -> "Elle cari hareketi";
          default -> documentType == null ? type : documentType;
        };
    return number == null ? name : name + " " + number;
  }

  private TransactionTransferResponse transferOf(LedgerDetailRow row) {
    if (row.getTransferId() == null) {
      return null;
    }
    String role = row.getTransferRole() != null ? row.getTransferRole() : "MOVED";
    return transfers
        .findById(row.getTransferId())
        .map(
            (AccountTransfer transfer) ->
                new TransactionTransferResponse(
                    transfer.getId(), role, transfer.getFromAccountId(), transfer.getToAccountId()))
        .orElse(null);
  }

  private AccountTransactionFacetsResponse facets(
      LocalDate from,
      LocalDate to,
      boolean allAccounts,
      UUID accountId,
      String currency,
      BranchFilter filter,
      boolean employees) {
    boolean allCompanies = filter.companyId() == null;
    UUID companyId = companyOrNone(filter);
    return new AccountTransactionFacetsResponse(
        transactions
            .branchFacets(
                from,
                to,
                allAccounts,
                accountId,
                currency,
                allCompanies,
                companyId,
                filter.allBranches(),
                filter.branchIds(),
                employees)
            .stream()
            .map(f -> new BranchFacetResponse(f.getId(), f.getName(), f.getCount()))
            .toList(),
        transactions
            .groupFacets(
                from,
                to,
                allAccounts,
                accountId,
                currency,
                allCompanies,
                companyId,
                filter.allBranches(),
                filter.branchIds(),
                employees)
            .stream()
            .map(f -> new GroupFacetResponse(f.getCode(), f.getName(), f.getCount()))
            .toList(),
        transactions
            .kindFacets(
                from,
                to,
                allAccounts,
                accountId,
                currency,
                allCompanies,
                companyId,
                filter.allBranches(),
                filter.branchIds(),
                employees)
            .stream()
            .map(f -> new KindFacetResponse(f.getKind(), f.getCount()))
            .toList());
  }

  static AccountTransactionRowResponse toRow(CrossLedgerRow row) {
    return new AccountTransactionRowResponse(
        row.getId(),
        row.getTransactionDate(),
        instant(row.getCreatedAt()),
        row.getCreatedBy(),
        row.getAccountId(),
        row.getAccountCode(),
        row.getAccountName(),
        AccountType.valueOf(row.getAccountType()),
        row.getSubGroup(),
        row.getSubGroupName(),
        row.getBranchId(),
        row.getBranchName(),
        row.getCompanyId(),
        TransactionKind.valueOf(row.getKind()),
        row.getSign(),
        Direction.valueOf(row.getDirection()),
        row.getAmount(),
        row.getCurrency(),
        row.getExchangeRate(),
        row.getTlAmount(),
        row.getDescription(),
        row.getSourceType(),
        row.getSourceId(),
        row.getDocumentNo(),
        row.getDocumentType(),
        row.getDocumentDate(),
        row.getDueDate(),
        row.getPaymentMethod(),
        Boolean.TRUE.equals(row.getReversal()),
        Boolean.TRUE.equals(row.getReversed()),
        row.getTransferRole(),
        Boolean.TRUE.equals(row.getTransferredOut()));
  }

  /** Yerel sorgu zaman değeri (sürücüye göre Instant, OffsetDateTime ya da Timestamp). */
  public static Instant instant(Object value) {
    return switch (value) {
      case null -> null;
      case Instant instant -> instant;
      case OffsetDateTime offset -> offset.toInstant();
      case ZonedDateTime zoned -> zoned.toInstant();
      case Timestamp timestamp -> timestamp.toInstant();
      default -> throw new IllegalArgumentException("Zaman değeri değil: " + value.getClass());
    };
  }

  private static long daysBetween(LocalDate from, LocalDate to) {
    return ChronoUnit.DAYS.between(from, to);
  }

  private static boolean isEmpty(Collection<?> values) {
    return values == null || values.isEmpty();
  }

  private static UUID companyOrNone(BranchFilter filter) {
    return filter.companyId() == null ? BranchFilter.NONE : filter.companyId();
  }

  static BusinessException notFound() {
    return new BusinessException(
        HttpStatus.NOT_FOUND, "TRANSACTION_NOT_FOUND", "Hareket bulunamadı.");
  }
}
