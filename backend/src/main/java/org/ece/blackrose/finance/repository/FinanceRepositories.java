package org.ece.blackrose.finance.repository;

import jakarta.persistence.LockModeType;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.AccountTransaction;
import org.ece.blackrose.finance.domain.DensityThreshold;
import org.ece.blackrose.finance.domain.ExchangeRate;
import org.ece.blackrose.finance.domain.ExpenseItem;
import org.ece.blackrose.finance.domain.ExpenseType;
import org.ece.blackrose.finance.domain.FinanceCurrency;
import org.ece.blackrose.finance.domain.FinanceSettings;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.PlanStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.domain.FundAccount;
import org.ece.blackrose.finance.domain.FundTransaction;
import org.ece.blackrose.finance.domain.Instrument;
import org.ece.blackrose.finance.domain.InstrumentMovement;
import org.ece.blackrose.finance.domain.OpeningInvoice;
import org.ece.blackrose.finance.domain.PaymentPlan;
import org.ece.blackrose.finance.domain.PaymentPlanEvent;
import org.ece.blackrose.finance.domain.PurchaseInvoice;
import org.ece.blackrose.finance.domain.Settlement;
import org.ece.blackrose.organization.BranchFilter;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public final class FinanceRepositories {

  private FinanceRepositories() {}

  public interface CurrencyRepository extends JpaRepository<FinanceCurrency, String> {}

  public interface ExchangeRateRepository extends JpaRepository<ExchangeRate, UUID> {

    Optional<ExchangeRate> findFirstByCurrencyAndRateDateLessThanEqualOrderByRateDateDesc(
        String currency, LocalDate date);

    boolean existsByCurrencyAndRateDate(String currency, LocalDate date);

    @Query(
        value =
            """
            select distinct on (currency) * from admin.exchange_rate
            where rate_date <= :date
            order by currency, rate_date desc
            """,
        nativeQuery = true)
    List<ExchangeRate> findLatestOnOrBefore(@Param("date") LocalDate date);
  }

  public interface AccountRepository extends JpaRepository<Account, UUID> {

    Optional<Account> findByCode(String code);

    @Query(
        """
        select a from Account a
        where (:search = '' or lower(a.name) like concat('%', :search, '%')
               or lower(a.code) like concat('%', :search, '%'))
        """)
    Page<Account> search(@Param("search") String search, Pageable pageable);
  }

  /** Para birimi bazında cari bakiye satırı. */
  public interface BalanceRow {
    UUID getAccountId();

    String getCurrency();

    BigDecimal getDebit();

    BigDecimal getCredit();

    BigDecimal getTlBalance();
  }

  /** Ekstre satırı; bakiye dönem başı hariç yürüyen toplamdır. */
  public interface AccountStatementRow {
    UUID getId();

    LocalDate getTransactionDate();

    String getDirection();

    BigDecimal getAmount();

    BigDecimal getExchangeRate();

    BigDecimal getTlAmount();

    String getDescription();

    String getSourceType();

    BigDecimal getRunningBalance();
  }

  public interface AgingRow {
    UUID getAccountId();

    String getAccountName();

    String getCurrency();

    BigDecimal getCurrent();

    BigDecimal getDays31To60();

    BigDecimal getDays61To90();

    BigDecimal getOver90();
  }

  public interface OpeningInvoiceRepository extends JpaRepository<OpeningInvoice, UUID> {

    /** Numara tekilliği şirket + cari bazındadır (devir şirket bazında). */
    boolean existsByAccountIdAndCompanyIdAndNumberAndStatus(
        UUID accountId, UUID companyId, String number, OpeningInvoice.Status status);

    /**
     * Açık faturası olan cariye aynı şirkette ayrıca açılış bakiyesi yüklenmez (bakiye iki kez
     * sayılır).
     */
    boolean existsByAccountIdAndCompanyIdAndCurrencyAndStatus(
        UUID accountId, UUID companyId, String currency, OpeningInvoice.Status status);
  }

  /**
   * Hareket tablolarında @SQLRestriction yok: idempotency araması (source_type, source_id tekil
   * kısıtı) silinmiş satırı da görmelidir. Bu yüzden bakiye ve ekstre sorguları deleted = false
   * koşulunu kendileri uygular.
   */
  public interface AccountTransactionRepository extends JpaRepository<AccountTransaction, UUID> {

    Optional<AccountTransaction> findBySourceTypeAndSourceId(String sourceType, UUID sourceId);

    /**
     * Ters çevrilmemiş açılış hareketi; aynı cari, şirket ve para biriminde ikinci açılışı önler.
     * Açılış şirket bazındadır: A şirketinde açılmış cari B'de de açılabilir.
     */
    @Query(
        "select count(t) > 0 from AccountTransaction t where t.accountId = :accountId"
            + " and t.companyId = :companyId"
            + " and t.currency = :currency and t.sourceType = 'OPENING' and t.deleted = false"
            + " and not exists (select r from AccountTransaction r"
            + " where r.sourceType = 'REVERSAL' and r.sourceId = t.id and r.deleted = false)")
    boolean hasActiveOpening(
        @Param("accountId") UUID accountId,
        @Param("companyId") UUID companyId,
        @Param("currency") String currency);

    boolean existsByAccountId(UUID accountId);

    @Query(
        value =
            """
            select account_id as "accountId", currency as "currency",
                   coalesce(sum(case when direction = 'DEBIT' then amount else 0 end), 0) as "debit",
                   coalesce(sum(case when direction = 'CREDIT' then amount else 0 end), 0) as "credit",
                   coalesce(sum(case when direction = 'DEBIT' then tl_amount else -tl_amount end), 0)
                     as "tlBalance"
            from account_transaction
            where account_id in (:accountIds) and deleted = false
              and (:allCompanies = true or company_id = :companyId)
              and (:allBranches = true or branch_id in (:branchIds))
            group by account_id, currency
            order by currency
            """,
        nativeQuery = true)
    List<BalanceRow> balances(
        @Param("accountIds") Collection<UUID> accountIds,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds);

    /** Cari başına bakiye; süzgeçteki şirket boşsa konsolide (tüm şirketlerin toplamı). */
    default List<BalanceRow> balances(Collection<UUID> accountIds, BranchFilter filter) {
      return balances(
          accountIds,
          filter.companyId() == null,
          companyOrNone(filter),
          filter.allBranches(),
          filter.branchIds());
    }

    @Query(
        value =
            """
            select coalesce(sum(case when direction = 'DEBIT' then amount else -amount end), 0)
            from account_transaction
            where account_id = :accountId and currency = :currency and transaction_date < :before
              and deleted = false
              and (:allCompanies = true or company_id = :companyId)
              and (:allBranches = true or branch_id in (:branchIds))
            """,
        nativeQuery = true)
    BigDecimal balanceBefore(
        @Param("accountId") UUID accountId,
        @Param("currency") String currency,
        @Param("before") LocalDate before,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds);

    default BigDecimal balanceBefore(
        UUID accountId, String currency, LocalDate before, BranchFilter filter) {
      return balanceBefore(
          accountId,
          currency,
          before,
          filter.companyId() == null,
          companyOrNone(filter),
          filter.allBranches(),
          filter.branchIds());
    }

    @Query(
        value =
            """
            select id as "id", transaction_date as "transactionDate", direction as "direction",
                   amount as "amount", exchange_rate as "exchangeRate", tl_amount as "tlAmount",
                   description as "description", source_type as "sourceType",
                   sum(case when direction = 'DEBIT' then amount else -amount end)
                     over (order by transaction_date, created_at, id) as "runningBalance"
            from account_transaction
            where account_id = :accountId and currency = :currency
              and transaction_date between :from and :to and deleted = false
              and (:allCompanies = true or company_id = :companyId)
              and (:allBranches = true or branch_id in (:branchIds))
            order by transaction_date, created_at, id
            """,
        countQuery =
            """
            select count(*) from account_transaction
            where account_id = :accountId and currency = :currency
              and transaction_date between :from and :to and deleted = false
              and (:allCompanies = true or company_id = :companyId)
              and (:allBranches = true or branch_id in (:branchIds))
            """,
        nativeQuery = true)
    Page<AccountStatementRow> statement(
        @Param("accountId") UUID accountId,
        @Param("currency") String currency,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        Pageable pageable);

    default Page<AccountStatementRow> statement(
        UUID accountId,
        String currency,
        LocalDate from,
        LocalDate to,
        BranchFilter filter,
        Pageable pageable) {
      return statement(
          accountId,
          currency,
          from,
          to,
          filter.companyId() == null,
          companyOrNone(filter),
          filter.allBranches(),
          filter.branchIds(),
          pageable);
    }

    /**
     * Vadesiz eskitme. Karşı yöndeki hareketler en eski kalemleri kapattığı için kapanan tutar,
     * tarih sırasındaki kalemlerin başından düşülür; açık kalan her zaman en yeni kalemlerdir.
     * Eşleştirme şirket kırılımlıdır (yasal kişi bazında), konsolidede de: A'daki borç B'deki
     * ödemeyle kapanmaz; konsolide satır şirket satırlarının toplamıdır.
     */
    @Query(
        value =
            """
            with moves as (
              select t.account_id, t.company_id, t.currency, t.transaction_date, t.direction,
                     t.amount,
                     sum(case when t.direction = :open then t.amount else 0 end) over (
                       partition by t.account_id, t.company_id, t.currency
                       order by t.transaction_date, t.created_at, t.id) as opened,
                     sum(case when t.direction <> :open then t.amount else 0 end) over (
                       partition by t.account_id, t.company_id, t.currency) as closed
              from account_transaction t
              join account a on a.id = t.account_id
              where t.transaction_date <= :asOf and t.deleted = false
                and a.deleted = false and a.type in (:types)
                and (:allCompanies = true or t.company_id = :companyId)
                and (:allBranches = true or t.branch_id in (:branchIds))
                and (:excludeIntercompany = false or a.represents_company_id is null)
            ),
            open_items as (
              select account_id, currency, cast(:asOf as date) - transaction_date as age,
                     least(amount, opened - closed) as remaining
              from moves where direction = :open and opened > closed
            )
            select i.account_id as "accountId", a.name as "accountName", i.currency as "currency",
                   coalesce(sum(i.remaining) filter (where i.age <= 30), 0) as "current",
                   coalesce(sum(i.remaining) filter (where i.age > 30 and i.age <= 60), 0) as "days31To60",
                   coalesce(sum(i.remaining) filter (where i.age > 60 and i.age <= 90), 0) as "days61To90",
                   coalesce(sum(i.remaining) filter (where i.age > 90), 0) as "over90"
            from open_items i join account a on a.id = i.account_id
            group by i.account_id, a.name, i.currency
            order by a.name, i.account_id, i.currency
            """,
        nativeQuery = true)
    List<AgingRow> agingRows(
        @Param("asOf") LocalDate asOf,
        @Param("open") String openDirection,
        @Param("types") Collection<String> types,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("excludeIntercompany") boolean excludeIntercompany);

    default List<AgingRow> agingRows(
        LocalDate asOf,
        String openDirection,
        Collection<String> types,
        BranchFilter filter,
        boolean excludeIntercompany) {
      return agingRows(
          asOf,
          openDirection,
          types,
          filter.companyId() == null,
          companyOrNone(filter),
          filter.allBranches(),
          filter.branchIds(),
          excludeIntercompany);
    }
  }

  /**
   * Native sorgularda NULL UUID bağlamak tip çıkarımı sorunu doğurur; konsolidede şirket yerine
   * nöbetçi verilir ve ayrı bayrak ({@code allCompanies}) koşulu atlatır.
   */
  private static UUID companyOrNone(BranchFilter filter) {
    return filter.companyId() == null ? BranchFilter.NONE : filter.companyId();
  }

  public interface FundBalanceRow {
    UUID getFundAccountId();

    BigDecimal getBalance();
  }

  public interface FundStatementRow {
    UUID getId();

    LocalDate getTransactionDate();

    String getDirection();

    BigDecimal getAmount();

    String getDescription();

    String getSourceType();

    BigDecimal getRunningBalance();
  }

  public interface FundAccountRepository extends JpaRepository<FundAccount, UUID> {

    Optional<FundAccount> findByCode(String code);

    /**
     * Bakiye kontrolü ile hareket yazımı aynı anda iki istekte yarışmasın diye satır kilitlenir.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select f from FundAccount f where f.id = :id")
    Optional<FundAccount> findForUpdate(@Param("id") UUID id);

    @Query(
        """
        select f from FundAccount f
        where (:companyId is null or f.companyId = :companyId)
          and (:allBranches = true or f.branchId in :branchIds)
        """)
    List<FundAccount> search(
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds);

    default List<FundAccount> search(BranchFilter filter) {
      return search(filter.companyId(), filter.allBranches(), filter.branchIds());
    }

    /**
     * Hesap "kullanılmış" mı: hareketi, çeke atanmışlığı (hareket oluşmadan da), ödeme/tahsilatı,
     * araç gideri, banka ekstresi satırı ya da bir şirketin varsayılan hesabı olması. Silinmişler
     * dahildir; kullanılmış hesabın şirketi değiştirilemez.
     */
    @Query(
        value =
            """
            select exists (select 1 from fund_transaction where fund_account_id = :id)
                or exists (select 1 from instrument where fund_account_id = :id)
                or exists (select 1 from settlement where fund_account_id = :id)
                or exists (select 1 from vehicle_expense where fund_account_id = :id)
                or exists (select 1 from bank_statement_line where fund_account_id = :id)
                or exists (select 1 from company where default_fund_account_id = :id)
            """,
        nativeQuery = true)
    boolean isUsed(@Param("id") UUID id);

    /** Hesap, silinmemiş bir şirketin varsayılan banka hesabı mı (silmeyi engeller). */
    @Query(
        value =
            "select exists (select 1 from company where default_fund_account_id = :id"
                + " and deleted = false)",
        nativeQuery = true)
    boolean isCompanyDefault(@Param("id") UUID id);
  }

  public interface FundTransactionRepository extends JpaRepository<FundTransaction, UUID> {

    Optional<FundTransaction> findBySourceTypeAndSourceIdAndFundAccountId(
        String sourceType, UUID sourceId, UUID fundAccountId);

    List<FundTransaction> findBySourceTypeAndSourceId(String sourceType, UUID sourceId);

    boolean existsByFundAccountId(UUID fundAccountId);

    @Query(
        value =
            """
            select fund_account_id as "fundAccountId",
                   coalesce(sum(case when direction = 'IN' then amount else -amount end), 0)
                     as "balance"
            from fund_transaction
            where fund_account_id in (:ids) and deleted = false
            group by fund_account_id
            """,
        nativeQuery = true)
    List<FundBalanceRow> balances(@Param("ids") Collection<UUID> ids);

    @Query(
        value =
            """
            select coalesce(sum(case when direction = 'IN' then amount else -amount end), 0)
            from fund_transaction
            where fund_account_id = :id and transaction_date < :before and deleted = false
            """,
        nativeQuery = true)
    BigDecimal balanceBefore(@Param("id") UUID id, @Param("before") LocalDate before);

    @Query(
        value =
            """
            select id as "id", transaction_date as "transactionDate", direction as "direction",
                   amount as "amount", description as "description", source_type as "sourceType",
                   sum(case when direction = 'IN' then amount else -amount end)
                     over (order by transaction_date, created_at, id) as "runningBalance"
            from fund_transaction
            where fund_account_id = :id and transaction_date between :from and :to
              and deleted = false
            order by transaction_date, created_at, id
            """,
        countQuery =
            """
            select count(*) from fund_transaction
            where fund_account_id = :id and transaction_date between :from and :to
              and deleted = false
            """,
        nativeQuery = true)
    Page<FundStatementRow> statement(
        @Param("id") UUID id,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        Pageable pageable);
  }

  public interface ExpenseTypeRepository extends JpaRepository<ExpenseType, UUID> {}

  public interface ExpenseItemRepository extends JpaRepository<ExpenseItem, UUID> {

    Optional<ExpenseItem> findByCode(String code);
  }

  public interface InstrumentRepository extends JpaRepository<Instrument, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from Instrument i where i.id = :id")
    Optional<Instrument> findForUpdate(@Param("id") UUID id);

    @Query(
        """
        select i from Instrument i
        where (:status is null or i.status = :status)
          and (:companyId is null or i.companyId = :companyId)
          and (:allBranches = true or i.branchId in :branchIds)
        """)
    Page<Instrument> search(
        @Param("status") InstrumentStatus status,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        Pageable pageable);

    default Page<Instrument> search(
        InstrumentStatus status, BranchFilter filter, Pageable pageable) {
      return search(status, filter.companyId(), filter.allBranches(), filter.branchIds(), pageable);
    }
  }

  public interface InstrumentMovementRepository extends JpaRepository<InstrumentMovement, UUID> {

    List<InstrumentMovement> findByInstrumentIdAndDeletedFalseOrderByCreatedAt(UUID instrumentId);
  }

  public interface SettlementRepository extends JpaRepository<Settlement, UUID> {

    Optional<Settlement> findByIdempotencyKey(String idempotencyKey);

    @Query(
        """
        select s from Settlement s
        where s.type = :type
          and (:companyId is null or s.companyId = :companyId)
          and (:allBranches = true or s.branchId in :branchIds)
        """)
    Page<Settlement> search(
        @Param("type") SettlementType type,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        Pageable pageable);

    default Page<Settlement> search(SettlementType type, BranchFilter filter, Pageable pageable) {
      return search(type, filter.companyId(), filter.allBranches(), filter.branchIds(), pageable);
    }

    @Query(
        """
        select s from Settlement s
        where s.type = :type and s.settlementDate = :date
          and s.status = org.ece.blackrose.finance.domain.FinanceTypes.SettlementStatus.POSTED
          and (:companyId is null or s.companyId = :companyId)
          and (:allBranches = true or s.branchId in :branchIds)
        order by s.createdAt
        """)
    List<Settlement> daily(
        @Param("type") SettlementType type,
        @Param("date") LocalDate date,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds);

    default List<Settlement> daily(SettlementType type, LocalDate date, BranchFilter filter) {
      return daily(type, date, filter.companyId(), filter.allBranches(), filter.branchIds());
    }
  }

  public interface PurchaseInvoiceRepository extends JpaRepository<PurchaseInvoice, UUID> {

    Optional<PurchaseInvoice> findByAccountIdAndNumber(UUID accountId, String number);

    @Query(
        """
        select i from PurchaseInvoice i
        where 1 = 1
          and (:companyId is null or i.companyId = :companyId)
          and (:allBranches = true or i.branchId in :branchIds)
        """)
    Page<PurchaseInvoice> search(
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        Pageable pageable);

    default Page<PurchaseInvoice> search(BranchFilter filter, Pageable pageable) {
      return search(filter.companyId(), filter.allBranches(), filter.branchIds(), pageable);
    }
  }

  public interface PaymentPlanRepository extends JpaRepository<PaymentPlan, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from PaymentPlan p where p.id = :id")
    Optional<PaymentPlan> findForUpdate(@Param("id") UUID id);

    @Query(
        """
        select p from PaymentPlan p
        where (:status is null or p.status = :status)
          and (:companyId is null or p.companyId = :companyId)
          and (:allBranches = true or p.branchId in :branchIds)
        """)
    Page<PaymentPlan> search(
        @Param("status") PlanStatus status,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        Pageable pageable);

    default Page<PaymentPlan> search(PlanStatus status, BranchFilter filter, Pageable pageable) {
      return search(status, filter.companyId(), filter.allBranches(), filter.branchIds(), pageable);
    }

    /** Kiracı geneli (günlük özet). */
    default Page<PaymentPlan> search(PlanStatus status, Pageable pageable) {
      return search(status, BranchFilter.all(null), pageable);
    }

    List<PaymentPlan> findByPurchaseInvoiceId(UUID purchaseInvoiceId);

    @Query(
        """
        select p from PaymentPlan p
        where p.status in :statuses and p.dueDate between :from and :to
          and (:companyId is null or p.companyId = :companyId)
          and (:allBranches = true or p.branchId in :branchIds)
        """)
    List<PaymentPlan> dueBetween(
        @Param("statuses") Collection<PlanStatus> statuses,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds);

    default List<PaymentPlan> dueBetween(
        Collection<PlanStatus> statuses, LocalDate from, LocalDate to, BranchFilter filter) {
      return dueBetween(
          statuses, from, to, filter.companyId(), filter.allBranches(), filter.branchIds());
    }

    @Query(
        """
        select p from PaymentPlan p
        where p.status in :statuses and p.dueDate < :before
          and (:companyId is null or p.companyId = :companyId)
          and (:allBranches = true or p.branchId in :branchIds)
        """)
    List<PaymentPlan> dueBefore(
        @Param("statuses") Collection<PlanStatus> statuses,
        @Param("before") LocalDate before,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds);

    default List<PaymentPlan> dueBefore(
        Collection<PlanStatus> statuses, LocalDate before, BranchFilter filter) {
      return dueBefore(
          statuses, before, filter.companyId(), filter.allBranches(), filter.branchIds());
    }

    /** Kiracı geneli (günlük özet). */
    List<PaymentPlan> findByStatusInAndDueDateBefore(
        Collection<PlanStatus> statuses, LocalDate before);

    @Query(
        """
        select count(p) from PaymentPlan p
        where p.status = :status
          and (:companyId is null or p.companyId = :companyId)
          and (:allBranches = true or p.branchId in :branchIds)
        """)
    long countByStatus(
        @Param("status") PlanStatus status,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds);

    default long countByStatus(PlanStatus status, BranchFilter filter) {
      return countByStatus(status, filter.companyId(), filter.allBranches(), filter.branchIds());
    }
  }

  public interface PaymentPlanEventRepository extends JpaRepository<PaymentPlanEvent, UUID> {

    List<PaymentPlanEvent> findByPlanIdOrderByCreatedAt(UUID planId);
  }

  public interface DensityThresholdRepository extends JpaRepository<DensityThreshold, String> {}

  public interface FinanceSettingsRepository extends JpaRepository<FinanceSettings, Integer> {}
}
