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
import org.ece.blackrose.finance.domain.PaymentPlan;
import org.ece.blackrose.finance.domain.PaymentPlanEvent;
import org.ece.blackrose.finance.domain.PurchaseInvoice;
import org.ece.blackrose.finance.domain.Settlement;
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

    LocalDate getTransactionDate();

    String getDirection();

    BigDecimal getAmount();
  }

  public interface AccountTransactionRepository extends JpaRepository<AccountTransaction, UUID> {

    Optional<AccountTransaction> findBySourceTypeAndSourceId(String sourceType, UUID sourceId);

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
            where account_id in (:accountIds)
            group by account_id, currency
            order by currency
            """,
        nativeQuery = true)
    List<BalanceRow> balances(@Param("accountIds") Collection<UUID> accountIds);

    @Query(
        value =
            """
            select coalesce(sum(case when direction = 'DEBIT' then amount else -amount end), 0)
            from account_transaction
            where account_id = :accountId and currency = :currency and transaction_date < :before
            """,
        nativeQuery = true)
    BigDecimal balanceBefore(
        @Param("accountId") UUID accountId,
        @Param("currency") String currency,
        @Param("before") LocalDate before);

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
              and transaction_date between :from and :to
            order by transaction_date, created_at, id
            """,
        countQuery =
            """
            select count(*) from account_transaction
            where account_id = :accountId and currency = :currency
              and transaction_date between :from and :to
            """,
        nativeQuery = true)
    Page<AccountStatementRow> statement(
        @Param("accountId") UUID accountId,
        @Param("currency") String currency,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        Pageable pageable);

    @Query(
        value =
            """
            select t.account_id as "accountId", a.name as "accountName", t.currency as "currency",
                   t.transaction_date as "transactionDate", t.direction as "direction",
                   t.amount as "amount"
            from account_transaction t
            join account a on a.id = t.account_id
            where t.transaction_date <= :asOf and a.deleted = false and a.type in (:types)
            order by a.name, t.account_id, t.currency, t.transaction_date, t.created_at
            """,
        nativeQuery = true)
    List<AgingRow> agingRows(
        @Param("asOf") LocalDate asOf, @Param("types") Collection<String> types);
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
            where fund_account_id in (:ids)
            group by fund_account_id
            """,
        nativeQuery = true)
    List<FundBalanceRow> balances(@Param("ids") Collection<UUID> ids);

    @Query(
        value =
            """
            select coalesce(sum(case when direction = 'IN' then amount else -amount end), 0)
            from fund_transaction
            where fund_account_id = :id and transaction_date < :before
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
            order by transaction_date, created_at, id
            """,
        countQuery =
            """
            select count(*) from fund_transaction
            where fund_account_id = :id and transaction_date between :from and :to
            """,
        nativeQuery = true)
    Page<FundStatementRow> statement(
        @Param("id") UUID id,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        Pageable pageable);
  }

  public interface ExpenseTypeRepository extends JpaRepository<ExpenseType, UUID> {}

  public interface ExpenseItemRepository extends JpaRepository<ExpenseItem, UUID> {}

  public interface InstrumentRepository extends JpaRepository<Instrument, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from Instrument i where i.id = :id")
    Optional<Instrument> findForUpdate(@Param("id") UUID id);

    @Query("select i from Instrument i where (:status is null or i.status = :status)")
    Page<Instrument> search(@Param("status") InstrumentStatus status, Pageable pageable);
  }

  public interface InstrumentMovementRepository extends JpaRepository<InstrumentMovement, UUID> {

    List<InstrumentMovement> findByInstrumentIdOrderByCreatedAt(UUID instrumentId);
  }

  public interface SettlementRepository extends JpaRepository<Settlement, UUID> {

    Optional<Settlement> findByIdempotencyKey(String idempotencyKey);

    Page<Settlement> findByType(SettlementType type, Pageable pageable);

    @Query(
        """
        select s from Settlement s
        where s.type = :type and s.settlementDate = :date
          and s.status = org.ece.blackrose.finance.domain.FinanceTypes.SettlementStatus.POSTED
          and s.branchId in :branchIds
        order by s.createdAt
        """)
    List<Settlement> dailyForBranches(
        @Param("type") SettlementType type,
        @Param("date") LocalDate date,
        @Param("branchIds") Collection<UUID> branchIds);

    @Query(
        """
        select s from Settlement s
        where s.type = :type and s.settlementDate = :date
          and s.status = org.ece.blackrose.finance.domain.FinanceTypes.SettlementStatus.POSTED
        order by s.createdAt
        """)
    List<Settlement> daily(@Param("type") SettlementType type, @Param("date") LocalDate date);
  }

  public interface PurchaseInvoiceRepository extends JpaRepository<PurchaseInvoice, UUID> {

    Optional<PurchaseInvoice> findByAccountIdAndNumber(UUID accountId, String number);
  }

  public interface PaymentPlanRepository extends JpaRepository<PaymentPlan, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from PaymentPlan p where p.id = :id")
    Optional<PaymentPlan> findForUpdate(@Param("id") UUID id);

    @Query("select p from PaymentPlan p where (:status is null or p.status = :status)")
    Page<PaymentPlan> search(@Param("status") PlanStatus status, Pageable pageable);

    List<PaymentPlan> findByPurchaseInvoiceId(UUID purchaseInvoiceId);

    List<PaymentPlan> findByStatusInAndDueDateBetween(
        Collection<PlanStatus> statuses, LocalDate from, LocalDate to);

    List<PaymentPlan> findByStatusInAndDueDateBefore(
        Collection<PlanStatus> statuses, LocalDate before);

    long countByStatus(PlanStatus status);
  }

  public interface PaymentPlanEventRepository extends JpaRepository<PaymentPlanEvent, UUID> {

    List<PaymentPlanEvent> findByPlanIdOrderByCreatedAt(UUID planId);
  }

  public interface DensityThresholdRepository extends JpaRepository<DensityThreshold, String> {}

  public interface FinanceSettingsRepository extends JpaRepository<FinanceSettings, Integer> {}
}
