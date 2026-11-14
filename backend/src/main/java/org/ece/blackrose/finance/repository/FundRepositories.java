package org.ece.blackrose.finance.repository;

import jakarta.persistence.LockModeType;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinIncomeExpense;
import org.ece.blackrose.finance.domain.FinanceTypes.FundOpeningStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.IncomeExpenseCategory;
import org.ece.blackrose.finance.domain.FundOpening;
import org.ece.blackrose.finance.domain.FundTransaction;
import org.ece.blackrose.finance.domain.FundTransfer;
import org.ece.blackrose.finance.domain.FundTransferCost;
import org.ece.blackrose.finance.domain.FundTransferSource;
import org.ece.blackrose.finance.domain.IntercompanyTransfer;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Faz 12.2 banka/kasa tabloları (V31–V33): açılış, transfer merkezi, şirketler arası virman,
 * gelir/gider. {@link FinanceRepositories} büyüdüğü için ayrı dosyadadır; {@code
 * FundAccountRepository} ve {@code FundTransactionRepository} orada kalır (12.2_TASARIM §2.3).
 */
public final class FundRepositories {

  private FundRepositories() {}

  public interface FundOpeningRepository extends JpaRepository<FundOpening, UUID> {

    Optional<FundOpening> findFirstByFundAccountIdAndStatus(
        UUID fundAccountId, FundOpeningStatus status);

    /** Hesabın geçerli açılışı, açılış düzeltmesi yarışmasın diye satır kilidiyle. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query(
        """
        select o from FundOpening o
        where o.fundAccountId = :fundId
          and o.status = org.ece.blackrose.finance.domain.FinanceTypes.FundOpeningStatus.POSTED
        """)
    Optional<FundOpening> findActiveForUpdate(@Param("fundId") UUID fundId);
  }

  public interface FundTransferRepository extends JpaRepository<FundTransfer, UUID> {

    Optional<FundTransfer> findByIdempotencyKey(String idempotencyKey);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from FundTransfer t where t.id = :id")
    Optional<FundTransfer> findForUpdate(@Param("id") UUID id);

    boolean existsByReplacesTransferId(UUID replacesTransferId);

    /** Bu transferin yerine yazılan (düzenleme) transfer. */
    Optional<FundTransfer> findFirstByReplacesTransferId(UUID replacesTransferId);

    /** Döviz bozum raporu: aralıktaki bozumlar (iptal edilenler dahil), şirket süzgeçli. */
    @Query(
        """
        select t from FundTransfer t
        where t.transferType = org.ece.blackrose.finance.domain.FinanceTypes.FundTransferType.FX_EXCHANGE
          and t.transferDate between :from and :to
          and (:companyId is null or t.companyId = :companyId)
        order by t.transferDate, t.code
        """)
    List<FundTransfer> fxInRange(
        @Param("companyId") UUID companyId,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to);
  }

  public interface FundTransferCostRepository extends JpaRepository<FundTransferCost, UUID> {

    List<FundTransferCost> findByTransferId(UUID transferId);
  }

  public interface FundTransferSourceRepository extends JpaRepository<FundTransferSource, UUID> {

    List<FundTransferSource> findByTransferId(UUID transferId);

    List<FundTransferSource> findByTransferIdIn(Collection<UUID> transferIds);

    /** Tahsilatın geçerli (POSTED) bozumlarda kullanılan toplamı. */
    @Query(
        value =
            """
            select coalesce(sum(s.used_amount), 0) from fund_transfer_source s
            join fund_transfer t on t.id = s.transfer_id and t.deleted = false
                                and t.status = 'POSTED'
            where s.settlement_id = :id and s.deleted = false
            """,
        nativeQuery = true)
    BigDecimal usedOfSettlement(@Param("id") UUID settlementId);

    /** Önceki bozumun geçerli (POSTED) bozumlarda kullanılan toplamı. */
    @Query(
        value =
            """
            select coalesce(sum(s.used_amount), 0) from fund_transfer_source s
            join fund_transfer t on t.id = s.transfer_id and t.deleted = false
                                and t.status = 'POSTED'
            where s.source_transfer_id = :id and s.deleted = false
            """,
        nativeQuery = true)
    BigDecimal usedOfTransfer(@Param("id") UUID transferId);

    /** Tahsilat geçerli (POSTED) bir döviz bozumunun kaynağı mı (iptali engeller). */
    @Query(
        """
        select count(s) > 0 from FundTransferSource s, FundTransfer t
        where t.id = s.transferId and s.settlementId = :settlementId
          and t.status = org.ece.blackrose.finance.domain.FinanceTypes.TransferStatus.POSTED
        """)
    boolean existsActiveBySettlementId(@Param("settlementId") UUID settlementId);
  }

  public interface IntercompanyTransferRepository
      extends JpaRepository<IntercompanyTransfer, UUID> {

    Optional<IntercompanyTransfer> findByIdempotencyKey(String idempotencyKey);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from IntercompanyTransfer i where i.id = :id")
    Optional<IntercompanyTransfer> findForUpdate(@Param("id") UUID id);

    /** Settlement bir şirketler arası virmanın ödeme ya da tahsilat bacağı mı. */
    @Query(
        """
        select count(i) > 0 from IntercompanyTransfer i
        where i.paymentSettlementId = :settlementId or i.collectionSettlementId = :settlementId
        """)
    boolean existsBySettlement(@Param("settlementId") UUID settlementId);

    @Query(
        """
        select i from IntercompanyTransfer i
        where i.paymentSettlementId = :settlementId or i.collectionSettlementId = :settlementId
        """)
    Optional<IntercompanyTransfer> findBySettlement(@Param("settlementId") UUID settlementId);

    /**
     * Şirketler arası virman listesi: şirket süzgeci iki tarafa, kapsam kaynak ya da hedef fonun iş
     * yerine uygulanır (iki taraftan biri görünürse satır görünür).
     */
    @Query(
        value =
            """
            select i from IntercompanyTransfer i, FundAccount ff, FundAccount tf
            where ff.id = i.fromFundId and tf.id = i.toFundId
              and (:companyId is null or i.fromCompanyId = :companyId
                   or i.toCompanyId = :companyId)
              and (:allBranches = true or ff.branchId in :branchIds or tf.branchId in :branchIds)
              and i.transferDate between :from and :to
            order by i.transferDate desc, i.createdAt desc, i.id desc
            """,
        countQuery =
            """
            select count(i) from IntercompanyTransfer i, FundAccount ff, FundAccount tf
            where ff.id = i.fromFundId and tf.id = i.toFundId
              and (:companyId is null or i.fromCompanyId = :companyId
                   or i.toCompanyId = :companyId)
              and (:allBranches = true or ff.branchId in :branchIds or tf.branchId in :branchIds)
              and i.transferDate between :from and :to
            """)
    Page<IntercompanyTransfer> search(
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        Pageable pageable);
  }

  public interface FinIncomeExpenseRepository extends JpaRepository<FinIncomeExpense, UUID> {

    List<FinIncomeExpense> findBySourceTypeAndSourceId(String sourceType, UUID sourceId);

    Optional<FinIncomeExpense> findFirstBySourceTypeAndSourceIdAndCategory(
        String sourceType, UUID sourceId, IncomeExpenseCategory category);

    boolean existsBySourceTypeAndSourceIdAndCategory(
        String sourceType, UUID sourceId, IncomeExpenseCategory category);
  }

  // --- 12.2_TASARIM §3.2 salt okuma sorguları (B2)

  /** Hareket aramasında hesap kümesi, dönem başı ve yürüyen bakiye (süzgeçlerden önce). */
  static final String TX_BASE =
      """
      with f as (
        select fa.id, fa.code, fa.name, fa.bank_name, fa.kind, fa.account_type, fa.branch_id
        from fund_account fa
        where fa.deleted = false
          and (:allCompanies = true or fa.company_id = :companyId)
          and (:allBranches = true or fa.branch_id in (:branchIds))
          and (:kind = '' or fa.kind = :kind)
          and (:allFunds = true or fa.id in (:fundIds))
          and (:accountType = '' or fa.account_type = :accountType)
          and (:currency = '' or fa.currency = :currency)
      ),
      op as (
        select t.fund_account_id,
               sum(case when t.direction = 'IN' then t.amount else -t.amount end) as opening
        from fund_transaction t
        join f on f.id = t.fund_account_id
        where t.deleted = false and t.transaction_date < :from
        group by t.fund_account_id
      ),
      w as (
        select t.id, t.fund_account_id, t.company_id, t.direction, t.amount, t.currency,
               t.exchange_rate, t.tl_amount, t.transaction_date, t.description, t.source_type,
               t.source_id, t.category, t.created_by, t.created_at,
               coalesce(op.opening, 0)
                 + sum(case when t.direction = 'IN' then t.amount else -t.amount end)
                     over (partition by t.fund_account_id
                           order by t.transaction_date, t.created_at, t.id) as running_balance
        from fund_transaction t
        join f on f.id = t.fund_account_id
        left join op on op.fund_account_id = t.fund_account_id
        where t.deleted = false and t.transaction_date between :from and :to
      ),
      r as (
        select w.*, f.code as fund_code, f.name as fund_name, f.bank_name, f.kind,
               f.account_type, f.branch_id, b.base_type, b.base_id,
               case
                 when b.base_type = 'SETTLEMENT' and ic.id is not null then 'INTERCOMPANY'
                 when b.base_type = 'SETTLEMENT' and s.type = 'PAYMENT'
                      and s.account_id is not null then 'ACCOUNT_PAYMENT'
                 when b.base_type = 'SETTLEMENT' and s.type = 'COLLECTION'
                   then 'ACCOUNT_COLLECTION'
                 when b.base_type = 'SETTLEMENT' then 'EXPENSE'
                 when b.base_type = 'FUND_TRANSFER' then ft.transfer_type
                 when b.base_type = 'FUND_TRANSFER_COST' then 'TRANSFER_COST'
                 when b.base_type = 'TRANSFER' then 'LEGACY_TRANSFER'
                 when b.base_type = 'INSTRUMENT' then
                   case when i.kind = 'NOTE'
                        then case when b.base_direction = 'IN' then 'NOTE_COLLECTION'
                                  else 'NOTE_PAYMENT' end
                        else case when b.base_direction = 'IN' then 'CHECK_COLLECTION'
                                  else 'CHECK_PAYMENT' end
                   end
                 when b.base_type = 'FUND_OPENING' then 'OPENING'
                 when b.base_type = 'MANUAL' then coalesce(b.base_category, 'OTHER')
                 else 'OTHER'
               end as accounting_type,
               coalesce(ft.code, ct.code, ic.code) as transfer_code,
               case when b.base_type = 'SETTLEMENT' and ic.id is not null then ic.id
                    when b.base_type = 'SETTLEMENT' then s.id
                    when b.base_type = 'FUND_TRANSFER' then ft.id
                    when b.base_type = 'FUND_TRANSFER_COST' then ct.id
                    when b.base_type = 'INSTRUMENT' then i.id
                    else b.base_id end as source_ref_id,
               case when b.base_type = 'SETTLEMENT' then ic.code
                    when b.base_type = 'FUND_TRANSFER' then ft.code
                    when b.base_type = 'FUND_TRANSFER_COST' then ct.code
                    when b.base_type = 'INSTRUMENT' then i.number end as source_ref_code,
               coalesce(ft.transfer_date, ct.transfer_date, ic.transfer_date) as source_ref_date,
               case when :employeeVisible = true or a.type <> 'EMPLOYEE' then a.id end
                 as account_id,
               case when :employeeVisible = true or a.type <> 'EMPLOYEE' then a.code end
                 as account_code,
               case when :employeeVisible = true or a.type <> 'EMPLOYEE' then a.name end
                 as account_name,
               (w.source_type = 'REVERSAL') as reversal,
               exists (select 1 from fund_transaction x
                       where x.source_type = 'REVERSAL' and x.source_id = w.id
                         and x.fund_account_id = w.fund_account_id and x.deleted = false)
                 as reversed
        from w
        join f on f.id = w.fund_account_id
        left join fund_transaction rv on w.source_type = 'REVERSAL' and rv.id = w.source_id
        cross join lateral (
          select coalesce(rv.source_type, w.source_type) as base_type,
                 coalesce(rv.source_id, w.source_id) as base_id,
                 coalesce(rv.category, w.category) as base_category,
                 coalesce(rv.direction, w.direction) as base_direction) b
        left join settlement s on b.base_type = 'SETTLEMENT' and s.id = b.base_id
        left join intercompany_transfer ic on ic.deleted = false
             and (ic.payment_settlement_id = s.id or ic.collection_settlement_id = s.id)
        left join fund_transfer ft on b.base_type = 'FUND_TRANSFER' and ft.id = b.base_id
        left join fund_transfer_cost fc on b.base_type = 'FUND_TRANSFER_COST' and fc.id = b.base_id
        left join fund_transfer ct on ct.id = fc.transfer_id
        left join instrument_movement im on b.base_type = 'INSTRUMENT' and im.id = b.base_id
        left join instrument i on i.id = im.instrument_id
        left join account a on a.id = coalesce(s.account_id, i.account_id)
      )
      """;

  /**
   * Yürüyen bakiyeden SONRA uygulanan süzgeçler. Cari kodu/adı yalnız görünür cari için doludur, bu
   * yüzden personel adıyla arama izinsiz kullanıcıda eşleşmez (SEC-12.2-06); {@code :q} kaçışlanmış
   * {@code %metin%} desenidir.
   */
  static final String TX_SELECTION =
      """
       from r
      where (:direction = '' or r.direction = :direction)
        and (:allTypes = true or r.accounting_type in (:types))
        and (:allRows = true or r.id = :rowId)
        and (:q = ''
             or r.description ilike :q escape '\\'
             or r.fund_code ilike :q escape '\\'
             or r.fund_name ilike :q escape '\\'
             or r.transfer_code ilike :q escape '\\'
             or r.account_code ilike :q escape '\\'
             or r.account_name ilike :q escape '\\')
      """;

  /** Hareket merkezi satırı (§4.2 {@code FundTransactionRowResponse} + kaynak çözümü). */
  public interface FundTxRow {
    UUID getId();

    UUID getFundAccountId();

    String getFundCode();

    String getFundName();

    String getBankName();

    String getKind();

    String getAccountType();

    UUID getCompanyId();

    UUID getBranchId();

    String getCurrency();

    LocalDate getTransactionDate();

    String getDirection();

    BigDecimal getAmount();

    BigDecimal getExchangeRate();

    BigDecimal getTlAmount();

    BigDecimal getRunningBalance();

    String getDescription();

    String getSourceType();

    UUID getSourceId();

    String getAccountingType();

    String getTransferCode();

    String getCategory();

    UUID getAccountId();

    String getAccountCode();

    String getAccountName();

    Boolean getReversal();

    Boolean getReversed();

    String getCreatedBy();

    Object getCreatedAt();

    String getBaseType();

    UUID getSourceRefId();

    String getSourceRefCode();

    /** Transfer / şirketler arası virman tarihi (derin bağlantı aralığı); diğer kaynaklarda boş. */
    LocalDate getSourceRefDate();
  }

  public interface FundTxTotalRow {
    String getCurrency();

    BigDecimal getTotalIn();

    BigDecimal getTotalOut();

    Long getCount();
  }

  /** Hesap başına bakiyeler: tüm tarihler, {@code asOf} dahil ve sonrası. */
  public interface FundBalanceAsOfRow {
    UUID getFundAccountId();

    BigDecimal getBalance();

    BigDecimal getCurrentBalance();

    Long getFutureCount();

    BigDecimal getFutureNet();

    Long getTransactionCount();

    LocalDate getLastTransactionDate();
  }

  public interface FundOpeningRow {
    UUID getFundAccountId();

    BigDecimal getSignedAmount();

    LocalDate getOpeningDate();
  }

  public interface FundSummaryRow {
    UUID getCompanyId();

    String getKind();

    String getAccountType();

    String getCurrency();

    Long getCount();

    Long getInactiveCount();

    BigDecimal getCurrentBalance();

    BigDecimal getBalance();

    BigDecimal getFutureNet();

    BigDecimal getOpeningTotal();
  }

  public interface FundSparkRow {
    UUID getFundAccountId();

    BigDecimal getAmount();
  }

  /** Silmeyi engelleyen kayıt sayıları (§3.2.5); açılış hareketi ve tersi sayılmaz. */
  public interface FundDeleteCountsRow {
    Long getFundTransaction();

    Long getSettlement();

    Long getInstrument();

    Long getFundTransfer();

    Long getIntercompanyTransfer();

    Long getVehicleExpense();

    Long getBankStatementLine();
  }

  /**
   * Banka/kasa salt okuma sorguları (12.2_TASARIM §3.2): çok hesaplı hareket araması (yürüyen
   * bakiye sunucuda, süzgeçler pencereden sonra), bakiyeler, özet, sparkline, silme denetimi.
   */
  public interface FundQueryRepository extends Repository<FundTransaction, UUID> {

    @Query(
        value =
            TX_BASE
                + "select r.id as \"id\", r.fund_account_id as \"fundAccountId\","
                + " r.fund_code as \"fundCode\", r.fund_name as \"fundName\","
                + " r.bank_name as \"bankName\", r.kind as \"kind\","
                + " r.account_type as \"accountType\", r.company_id as \"companyId\","
                + " r.branch_id as \"branchId\", r.currency as \"currency\","
                + " r.transaction_date as \"transactionDate\", r.direction as \"direction\","
                + " r.amount as \"amount\", r.exchange_rate as \"exchangeRate\","
                + " r.tl_amount as \"tlAmount\", r.running_balance as \"runningBalance\","
                + " r.description as \"description\", r.source_type as \"sourceType\","
                + " r.source_id as \"sourceId\", r.accounting_type as \"accountingType\","
                + " r.transfer_code as \"transferCode\", r.category as \"category\","
                + " r.account_id as \"accountId\", r.account_code as \"accountCode\","
                + " r.account_name as \"accountName\", r.reversal as \"reversal\","
                + " r.reversed as \"reversed\", r.created_by as \"createdBy\","
                + " r.created_at as \"createdAt\", r.base_type as \"baseType\","
                + " r.source_ref_id as \"sourceRefId\", r.source_ref_code as \"sourceRefCode\","
                + " r.source_ref_date as \"sourceRefDate\""
                + TX_SELECTION
                + " order by (case when :ascending = true then r.transaction_date end) asc,"
                + " (case when :ascending = true then r.created_at end) asc,"
                + " (case when :ascending = true then r.id end) asc,"
                + " r.transaction_date desc, r.created_at desc, r.id desc"
                + " limit :limit offset :offset",
        nativeQuery = true)
    List<FundTxRow> rows(
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("kind") String kind,
        @Param("allFunds") boolean allFunds,
        @Param("fundIds") Collection<UUID> fundIds,
        @Param("accountType") String accountType,
        @Param("currency") String currency,
        @Param("employeeVisible") boolean employeeVisible,
        @Param("direction") String direction,
        @Param("allTypes") boolean allTypes,
        @Param("types") Collection<String> types,
        @Param("allRows") boolean allRows,
        @Param("rowId") UUID rowId,
        @Param("q") String q,
        @Param("ascending") boolean ascending,
        @Param("limit") int limit,
        @Param("offset") long offset);

    @Query(value = TX_BASE + "select count(*)" + TX_SELECTION, nativeQuery = true)
    long count(
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("kind") String kind,
        @Param("allFunds") boolean allFunds,
        @Param("fundIds") Collection<UUID> fundIds,
        @Param("accountType") String accountType,
        @Param("currency") String currency,
        @Param("employeeVisible") boolean employeeVisible,
        @Param("direction") String direction,
        @Param("allTypes") boolean allTypes,
        @Param("types") Collection<String> types,
        @Param("allRows") boolean allRows,
        @Param("rowId") UUID rowId,
        @Param("q") String q);

    @Query(
        value =
            TX_BASE
                + "select r.currency as \"currency\","
                + " coalesce(sum(case when r.direction = 'IN' then r.amount end), 0)"
                + " as \"totalIn\","
                + " coalesce(sum(case when r.direction = 'OUT' then r.amount end), 0)"
                + " as \"totalOut\", count(*) as \"count\""
                + TX_SELECTION
                + " group by r.currency order by r.currency",
        nativeQuery = true)
    List<FundTxTotalRow> totals(
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("kind") String kind,
        @Param("allFunds") boolean allFunds,
        @Param("fundIds") Collection<UUID> fundIds,
        @Param("accountType") String accountType,
        @Param("currency") String currency,
        @Param("employeeVisible") boolean employeeVisible,
        @Param("direction") String direction,
        @Param("allTypes") boolean allTypes,
        @Param("types") Collection<String> types,
        @Param("allRows") boolean allRows,
        @Param("rowId") UUID rowId,
        @Param("q") String q);

    @Query(
        value =
            """
            select t.fund_account_id as "fundAccountId",
                   coalesce(sum(case when t.direction = 'IN' then t.amount else -t.amount end), 0)
                     as "balance",
                   coalesce(sum(case when t.transaction_date <= :asOf then
                     (case when t.direction = 'IN' then t.amount else -t.amount end)
                     else 0 end), 0) as "currentBalance",
                   count(*) filter (where t.transaction_date > :asOf) as "futureCount",
                   coalesce(sum(case when t.transaction_date > :asOf then
                     (case when t.direction = 'IN' then t.amount else -t.amount end)
                     else 0 end), 0) as "futureNet",
                   count(*) as "transactionCount",
                   max(t.transaction_date) as "lastTransactionDate"
            from fund_transaction t
            where t.fund_account_id in (:ids) and t.deleted = false
            group by t.fund_account_id
            """,
        nativeQuery = true)
    List<FundBalanceAsOfRow> balancesAsOf(
        @Param("ids") Collection<UUID> ids, @Param("asOf") LocalDate asOf);

    /** Hesapların geçerli açılışları (işaretli tutar). */
    @Query(
        value =
            """
            select o.fund_account_id as "fundAccountId",
                   case when o.direction = 'IN' then o.amount else -o.amount end
                     as "signedAmount",
                   o.opening_date as "openingDate"
            from fund_opening o
            where o.fund_account_id in (:ids) and o.status = 'POSTED' and o.deleted = false
            """,
        nativeQuery = true)
    List<FundOpeningRow> openings(@Param("ids") Collection<UUID> ids);

    @Query(
        value =
            """
            with f as (
              select fa.id, fa.company_id, fa.kind, fa.account_type, fa.currency, fa.active
              from fund_account fa
              where fa.deleted = false
                and (:allCompanies = true or fa.company_id = :companyId)
                and (:allBranches = true or fa.branch_id in (:branchIds))
                and (:kind = '' or fa.kind = :kind)
            ),
            b as (
              select t.fund_account_id,
                     sum(case when t.direction = 'IN' then t.amount else -t.amount end)
                       as balance,
                     sum(case when t.transaction_date <= :asOf then
                       (case when t.direction = 'IN' then t.amount else -t.amount end)
                       else 0 end) as current_balance,
                     sum(case when t.transaction_date > :asOf then
                       (case when t.direction = 'IN' then t.amount else -t.amount end)
                       else 0 end) as future_net
              from fund_transaction t
              join f on f.id = t.fund_account_id
              where t.deleted = false
              group by t.fund_account_id
            ),
            o as (
              select o.fund_account_id,
                     sum(case when o.direction = 'IN' then o.amount else -o.amount end) as opening
              from fund_opening o
              join f on f.id = o.fund_account_id
              where o.status = 'POSTED' and o.deleted = false
              group by o.fund_account_id
            )
            select f.company_id as "companyId", f.kind as "kind",
                   f.account_type as "accountType", f.currency as "currency",
                   count(*) as "count", count(*) filter (where not f.active) as "inactiveCount",
                   coalesce(sum(b.current_balance), 0) as "currentBalance",
                   coalesce(sum(b.balance), 0) as "balance",
                   coalesce(sum(b.future_net), 0) as "futureNet",
                   coalesce(sum(o.opening), 0) as "openingTotal"
            from f
            left join b on b.fund_account_id = f.id
            left join o on o.fund_account_id = f.id
            group by f.company_id, f.kind, f.account_type, f.currency
            order by f.company_id, f.kind, f.account_type, f.currency
            """,
        nativeQuery = true)
    List<FundSummaryRow> summary(
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("kind") String kind,
        @Param("asOf") LocalDate asOf);

    /** Hesap başına {@code today} dahil son 20 hareket, eskiden yeniye. */
    @Query(
        value =
            """
            select x.fund_account_id as "fundAccountId", x.signed as "amount"
            from (
              select t.fund_account_id, t.transaction_date, t.created_at, t.id,
                     case when t.direction = 'IN' then t.amount else -t.amount end as signed,
                     row_number() over (partition by t.fund_account_id
                       order by t.transaction_date desc, t.created_at desc, t.id desc) as rn
              from fund_transaction t
              where t.fund_account_id in (:ids) and t.deleted = false
                and t.transaction_date <= :today
            ) x
            where x.rn <= 20
            order by x.fund_account_id, x.transaction_date, x.created_at, x.id
            """,
        nativeQuery = true)
    List<FundSparkRow> sparklines(
        @Param("ids") Collection<UUID> ids, @Param("today") LocalDate today);

    @Query(
        value =
            """
            select
              (select count(*) from fund_transaction t
               where t.fund_account_id = :id and t.deleted = false
                 and t.source_type <> 'FUND_OPENING'
                 and not (t.source_type = 'REVERSAL' and exists (
                   select 1 from fund_transaction o
                   where o.id = t.source_id and o.source_type = 'FUND_OPENING')))
                as "fundTransaction",
              (select count(*) from settlement s
               where s.fund_account_id = :id and s.deleted = false) as "settlement",
              (select count(*) from instrument i
               where i.fund_account_id = :id and i.deleted = false) as "instrument",
              (select count(*) from fund_transfer ft
               where ft.deleted = false
                 and (ft.source_fund_id = :id or ft.target_fund_id = :id
                      or exists (select 1 from fund_transfer_cost c
                                 where c.transfer_id = ft.id and c.fund_account_id = :id
                                   and c.deleted = false))) as "fundTransfer",
              (select count(*) from intercompany_transfer ic
               where ic.deleted = false and (ic.from_fund_id = :id or ic.to_fund_id = :id))
                as "intercompanyTransfer",
              (select count(*) from vehicle_expense v
               where v.fund_account_id = :id and v.deleted = false) as "vehicleExpense",
              (select count(*) from bank_statement_line l
               where l.fund_account_id = :id and l.deleted = false) as "bankStatementLine"
            """,
        nativeQuery = true)
    FundDeleteCountsRow deleteCounts(@Param("id") UUID id);
  }

  // --- 12.2_TASARIM §3.3 transfer merkezi salt okuma sorguları (B3)

  /**
   * Transferler sekmesi: şirket içi transfer + şirketler arası virman birleşik. Kullanıcı kapsamı
   * ({@code :visibleIds}) kaynak ya da hedef fonun iş yerine uygulanır; {@code from_visible}/{@code
   * to_visible} görünmeyen tarafın adlarını gizlemek için döner. İş yeri süzgeci ({@code
   * :branchIds}) ayrıca iki taraftan birine uygulanır.
   */
  static final String TRANSFER_WITH =
      """
      with b as (
        select 'FUND_TRANSFER' as record_type, t.id, t.code, t.transfer_type,
               cast(null as varchar) as reason_type, t.transfer_date, t.company_id,
               cast(null as uuid) as to_company_id, t.source_fund_id as from_fund_id,
               t.target_fund_id as to_fund_id, t.source_amount, t.source_currency,
               t.target_amount, t.target_currency, t.rate, t.rate_operation, t.description,
               t.status, t.document_no, t.created_at
        from fund_transfer t
        where t.deleted = false
        union all
        select 'INTERCOMPANY', i.id, i.code, i.transfer_type, i.reason_type, i.transfer_date,
               i.from_company_id, i.to_company_id, i.from_fund_id, i.to_fund_id, i.amount,
               i.currency, i.amount, i.currency, null, null, i.description, i.status,
               i.document_no, i.created_at
        from intercompany_transfer i
        where i.deleted = false
      ),
      r as (
        select b.*, sf.code as from_fund_code, sf.name as from_fund_name, sf.kind as from_kind,
               sf.branch_id as from_branch_id, tf.code as to_fund_code, tf.name as to_fund_name,
               tf.kind as to_kind, tf.branch_id as to_branch_id,
               (:allVisible = true or sf.branch_id in (:visibleIds)) as from_visible,
               (:allVisible = true or tf.branch_id in (:visibleIds)) as to_visible
        from b
        join fund_account sf on sf.id = b.from_fund_id
        join fund_account tf on tf.id = b.to_fund_id
      )
      """;

  /** {@link #TRANSFER_WITH} süzgeçleri; {@code :status} boşsa tüm durumlar. */
  static final String TRANSFER_WHERE =
      """
      from r
      where (:allCompanies = true or r.company_id = :companyId or r.to_company_id = :companyId)
        and (r.from_visible or r.to_visible)
        and (:allBranches = true or r.from_branch_id in (:branchIds)
             or r.to_branch_id in (:branchIds))
        and r.transfer_date between :from and :to
        and (:type = ''
             or (:type = 'INTERCOMPANY' and r.record_type = 'INTERCOMPANY')
             or (r.record_type = 'FUND_TRANSFER' and r.transfer_type = :type))
        and (:status = '' or r.status = :status)
        and (:q = ''
             or r.code ilike :q escape '\\'
             or r.description ilike :q escape '\\'
             or r.document_no ilike :q escape '\\'
             or (r.from_visible and (r.from_fund_code ilike :q escape '\\'
                                     or r.from_fund_name ilike :q escape '\\'))
             or (r.to_visible and (r.to_fund_code ilike :q escape '\\'
                                   or r.to_fund_name ilike :q escape '\\')))
      """;

  static final String TRANSFER_COLUMNS =
      """
      r.record_type as "recordType", r.id as "id", r.code as "code",
      r.transfer_type as "transferType", r.reason_type as "reasonType",
      r.transfer_date as "transferDate", r.company_id as "companyId",
      r.to_company_id as "toCompanyId", r.from_fund_id as "fromFundId",
      r.from_fund_code as "fromFundCode", r.from_fund_name as "fromFundName",
      r.from_kind as "fromKind", r.from_branch_id as "fromBranchId",
      r.from_visible as "fromVisible", r.to_fund_id as "toFundId",
      r.to_fund_code as "toFundCode", r.to_fund_name as "toFundName", r.to_kind as "toKind",
      r.to_branch_id as "toBranchId", r.to_visible as "toVisible",
      r.source_amount as "sourceAmount", r.source_currency as "sourceCurrency",
      r.target_amount as "targetAmount", r.target_currency as "targetCurrency",
      r.rate as "rate", r.rate_operation as "rateOperation", r.description as "description",
      r.status as "status", r.document_no as "documentNo", r.created_at as "createdAt",
      coalesce((select sum(x.tl_amount) from fund_transfer_cost c
                join fund_transaction x on x.source_type = 'FUND_TRANSFER_COST'
                                       and x.source_id = c.id and x.deleted = false
                where c.transfer_id = r.id and c.deleted = false), 0) as "costTotalTl",
      (select string_agg(cf.name, ', ' order by cf.name) from fund_transfer_cost c
       join fund_account cf on cf.id = c.fund_account_id
       where c.transfer_id = r.id and c.deleted = false
         and (:allVisible = true or cf.branch_id in (:visibleIds))) as "costFundNames"
      """;

  /** Transferler sekmesi satırı (görünürlük bayraklarıyla). */
  public interface TransferListRow {
    String getRecordType();

    UUID getId();

    String getCode();

    String getTransferType();

    String getReasonType();

    LocalDate getTransferDate();

    UUID getCompanyId();

    UUID getToCompanyId();

    UUID getFromFundId();

    String getFromFundCode();

    String getFromFundName();

    String getFromKind();

    UUID getFromBranchId();

    Boolean getFromVisible();

    UUID getToFundId();

    String getToFundCode();

    String getToFundName();

    String getToKind();

    UUID getToBranchId();

    Boolean getToVisible();

    BigDecimal getSourceAmount();

    String getSourceCurrency();

    BigDecimal getTargetAmount();

    String getTargetCurrency();

    BigDecimal getRate();

    String getRateOperation();

    String getDescription();

    String getStatus();

    String getDocumentNo();

    BigDecimal getCostTotalTl();

    String getCostFundNames();
  }

  /** Özet satırı: grup × para birimi (yalnız POSTED). */
  public interface TransferSummaryRow {
    String getGrp();

    String getCurrency();

    Long getCount();

    BigDecimal getTotal();
  }

  /** Döviz bozumunun ilk tahsilat kaynağı ve kalanı (liste "Tahsilat / Cari" sütunu). */
  public interface TransferCollectionRow {
    UUID getTransferId();

    UUID getSettlementId();

    LocalDate getDate();

    BigDecimal getAmount();

    UUID getAccountId();

    String getAccountName();

    BigDecimal getRemaining();
  }

  public interface TransferDependentRow {
    UUID getTransferId();

    String getCode();

    LocalDate getDate();

    UUID getSourceFundId();

    UUID getTargetFundId();

    BigDecimal getUsedAmount();
  }

  public interface FxSourceRow {
    UUID getTransferId();

    String getCode();

    LocalDate getDate();

    UUID getSourceFundId();

    BigDecimal getDeposited();

    BigDecimal getUsed();
  }

  public interface FxCandidateAccountRow {
    UUID getAccountId();

    String getAccountCode();

    String getAccountName();

    Long getCollectionCount();

    BigDecimal getRemainingTotal();
  }

  public interface FxCandidateCollectionRow {
    UUID getSettlementId();

    LocalDate getDate();

    BigDecimal getAmount();

    BigDecimal getBroken();

    String getDescription();
  }

  /** Kaynak satırının görüntü bilgisi (döviz bozum raporu ve detay). */
  public interface FxSourceInfoRow {
    UUID getSourceRowId();

    UUID getTransferId();

    String getKind();

    UUID getRefId();

    String getCode();

    LocalDate getDate();

    String getAccountName();

    BigDecimal getAmount();

    BigDecimal getUsed();
  }

  public interface FxUnbrokenRow {
    UUID getSettlementId();

    LocalDate getDate();

    String getAccountName();

    BigDecimal getAmount();

    String getCurrency();
  }

  /** Bozumda kaynak olabilecek tahsilatların ortak koşulu (fon, para birimi, kalan, kapsam). */
  static final String FX_CANDIDATES =
      """
      with c as (
        select s.id, s.account_id, s.settlement_date, s.amount, s.description,
               coalesce((select sum(x.used_amount) from fund_transfer_source x
                         join fund_transfer d on d.id = x.transfer_id and d.deleted = false
                                              and d.status = 'POSTED'
                         where x.settlement_id = s.id and x.deleted = false), 0) as broken
        from settlement s
        join account a on a.id = s.account_id
        where s.deleted = false and s.type = 'COLLECTION' and s.status = 'POSTED'
          and s.fund_account_id = :fundId and s.currency = :currency
          and (:allBranches = true or s.branch_id in (:branchIds))
          and (:employeeVisible = true or a.type <> 'EMPLOYEE')
      )
      """;

  /** Transfer merkezi salt okuma sorguları (12.2_TASARIM §3.3.5–§3.3.9). */
  public interface FundTransferQueryRepository extends Repository<FundTransfer, UUID> {

    @Query(
        value =
            "select * from ("
                + TRANSFER_WITH
                + "select "
                + TRANSFER_COLUMNS
                + TRANSFER_WHERE
                + ") x order by x.\"transferDate\" desc, x.\"createdAt\" desc, x.\"id\" desc"
                + " limit :limit offset :offset",
        nativeQuery = true)
    List<TransferListRow> searchRaw(
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("allVisible") boolean allVisible,
        @Param("visibleIds") Collection<UUID> visibleIds,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("type") String type,
        @Param("status") String status,
        @Param("q") String q,
        @Param("limit") int limit,
        @Param("offset") long offset);

    @Query(
        value = "select count(*) from (" + TRANSFER_WITH + "select 1 " + TRANSFER_WHERE + ") x",
        nativeQuery = true)
    long countRaw(
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("allVisible") boolean allVisible,
        @Param("visibleIds") Collection<UUID> visibleIds,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("type") String type,
        @Param("status") String status,
        @Param("q") String q);

    @Query(
        value =
            "select x.grp as \"grp\", x.currency as \"currency\", count(*) as \"count\","
                + " sum(x.amount) as \"total\" from ("
                + TRANSFER_WITH
                + "select case when r.record_type = 'INTERCOMPANY' then 'INTERCOMPANY'"
                + " when r.transfer_type in ('VIREMENT', 'EFT', 'WIRE') then 'VIREMENT_EFT_WIRE'"
                + " else r.transfer_type end as grp, r.source_currency as currency,"
                + " r.source_amount as amount "
                + TRANSFER_WHERE
                + ") x group by x.grp, x.currency",
        nativeQuery = true)
    List<TransferSummaryRow> summaryRaw(
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("allVisible") boolean allVisible,
        @Param("visibleIds") Collection<UUID> visibleIds,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("type") String type,
        @Param("status") String status,
        @Param("q") String q);

    @Query(
        value =
            """
            select distinct on (s.transfer_id) s.transfer_id as "transferId",
                   st.id as "settlementId", st.settlement_date as "date", st.amount as "amount",
                   case when :employeeVisible = true or a.type <> 'EMPLOYEE' then a.id end
                     as "accountId",
                   case when :employeeVisible = true or a.type <> 'EMPLOYEE' then a.name end
                     as "accountName",
                   st.amount - coalesce((select sum(x.used_amount) from fund_transfer_source x
                                         join fund_transfer d on d.id = x.transfer_id
                                              and d.deleted = false and d.status = 'POSTED'
                                         where x.settlement_id = st.id and x.deleted = false), 0)
                     as "remaining"
            from fund_transfer_source s
            join settlement st on st.id = s.settlement_id
            left join account a on a.id = st.account_id
            where s.transfer_id in (:ids) and s.deleted = false and s.source_kind = 'SETTLEMENT'
            order by s.transfer_id, s.created_at, s.id
            """,
        nativeQuery = true)
    List<TransferCollectionRow> collections(
        @Param("ids") Collection<UUID> transferIds,
        @Param("employeeVisible") boolean employeeVisible);

    @Query(
        value =
            """
            select t.id as "transferId", t.code as "code", t.transfer_date as "date",
                   t.source_fund_id as "sourceFundId", t.target_fund_id as "targetFundId",
                   s.used_amount as "usedAmount"
            from fund_transfer_source s
            join fund_transfer t on t.id = s.transfer_id
            where s.source_transfer_id = :id and s.deleted = false and t.deleted = false
              and t.status = 'POSTED'
            order by t.transfer_date, t.code
            """,
        nativeQuery = true)
    List<TransferDependentRow> dependents(@Param("id") UUID transferId);

    @Query(
        value =
            """
            select x.* from (
              select t.id as "transferId", t.code as "code", t.transfer_date as "date",
                     t.source_fund_id as "sourceFundId", t.target_amount as "deposited",
                     coalesce((select sum(s.used_amount) from fund_transfer_source s
                               join fund_transfer d on d.id = s.transfer_id
                                    and d.deleted = false and d.status = 'POSTED'
                               where s.source_transfer_id = t.id and s.deleted = false), 0)
                       as "used"
              from fund_transfer t
              where t.deleted = false and t.status = 'POSTED'
                and t.transfer_type = 'FX_EXCHANGE' and t.target_fund_id = :fundId
                and t.target_currency = :currency
            ) x
            where x."deposited" - x."used" > 0
            order by x."date" desc, x."code" desc
            limit 200
            """,
        nativeQuery = true)
    List<FxSourceRow> fxSources(@Param("fundId") UUID fundId, @Param("currency") String currency);

    @Query(
        value =
            FX_CANDIDATES
                + """
                select a.id as "accountId", a.code as "accountCode", a.name as "accountName",
                       count(*) as "collectionCount",
                       sum(c.amount - c.broken) as "remainingTotal"
                from c
                join account a on a.id = c.account_id
                where c.amount - c.broken > 0
                group by a.id, a.code, a.name
                order by a.name, a.code
                """,
        nativeQuery = true)
    List<FxCandidateAccountRow> fxCandidateAccounts(
        @Param("fundId") UUID fundId,
        @Param("currency") String currency,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("employeeVisible") boolean employeeVisible);

    @Query(
        value =
            FX_CANDIDATES
                + """
                select c.id as "settlementId", c.settlement_date as "date", c.amount as "amount",
                       c.broken as "broken", c.description as "description"
                from c
                where c.account_id = :accountId and c.amount - c.broken > 0
                order by c.settlement_date desc, c.id
                """,
        nativeQuery = true)
    List<FxCandidateCollectionRow> fxCandidateCollections(
        @Param("fundId") UUID fundId,
        @Param("currency") String currency,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("employeeVisible") boolean employeeVisible,
        @Param("accountId") UUID accountId);

    /** Kaynak satırları: tahsilatta açıklama/cari, önceki bozumda kod; personel adı gizli. */
    @Query(
        value =
            """
            select s.id as "sourceRowId", s.transfer_id as "transferId", s.source_kind as "kind",
                   coalesce(s.settlement_id, s.source_transfer_id) as "refId",
                   coalesce(p.code, st.description) as "code",
                   coalesce(p.transfer_date, st.settlement_date) as "date",
                   case when :employeeVisible = true or a.type <> 'EMPLOYEE' then a.name end
                     as "accountName",
                   coalesce(p.target_amount, st.amount) as "amount", s.used_amount as "used"
            from fund_transfer_source s
            left join settlement st on st.id = s.settlement_id
            left join account a on a.id = st.account_id
            left join fund_transfer p on p.id = s.source_transfer_id
            where s.transfer_id in (:ids) and s.deleted = false
            order by s.transfer_id, s.created_at, s.id
            """,
        nativeQuery = true)
    List<FxSourceInfoRow> sourceInfo(
        @Param("ids") Collection<UUID> transferIds,
        @Param("employeeVisible") boolean employeeVisible);

    /** Aralıktaki, hiç bozulmamış dövizli tahsilatlar (kapsam settlement iş yerine). */
    @Query(
        value =
            """
            select s.id as "settlementId", s.settlement_date as "date",
                   case when :employeeVisible = true or a.type <> 'EMPLOYEE' then a.name end
                     as "accountName",
                   s.amount as "amount", s.currency as "currency"
            from settlement s
            left join account a on a.id = s.account_id
            join fund_account f on f.id = s.fund_account_id
            where s.deleted = false and s.type = 'COLLECTION' and s.status = 'POSTED'
              and s.currency <> 'TRY' and f.kind = 'BANK'
              and s.settlement_date between :from and :to
              and (:allCompanies = true or s.company_id = :companyId)
              and (:allBranches = true or s.branch_id in (:branchIds))
              and not exists (select 1 from fund_transfer_source x
                              join fund_transfer d on d.id = x.transfer_id
                                   and d.deleted = false and d.status = 'POSTED'
                              where x.settlement_id = s.id and x.deleted = false)
            order by s.settlement_date, s.id
            limit 5000
            """,
        nativeQuery = true)
    List<FxUnbrokenRow> unbrokenCollections(
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("employeeVisible") boolean employeeVisible);
  }
}
