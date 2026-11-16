package org.ece.blackrose.finance.repository;

import jakarta.persistence.LockModeType;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.AccountTransaction;
import org.ece.blackrose.finance.domain.CheckBook;
import org.ece.blackrose.finance.domain.CheckLeaf;
import org.ece.blackrose.finance.domain.DensityThreshold;
import org.ece.blackrose.finance.domain.ExchangeRate;
import org.ece.blackrose.finance.domain.ExpenseItem;
import org.ece.blackrose.finance.domain.ExpenseType;
import org.ece.blackrose.finance.domain.FinanceCurrency;
import org.ece.blackrose.finance.domain.FinanceSettings;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.FundAccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InvoiceSide;
import org.ece.blackrose.finance.domain.FinanceTypes.PlanStatus;
import org.ece.blackrose.finance.domain.FundAccount;
import org.ece.blackrose.finance.domain.FundTransaction;
import org.ece.blackrose.finance.domain.Instrument;
import org.ece.blackrose.finance.domain.InstrumentMovement;
import org.ece.blackrose.finance.domain.OpeningInvoice;
import org.ece.blackrose.finance.domain.PaymentPlan;
import org.ece.blackrose.finance.domain.PaymentPlanEvent;
import org.ece.blackrose.finance.domain.PurchaseInvoice;
import org.ece.blackrose.finance.domain.Settlement;
import org.ece.blackrose.finance.domain.SettlementAllocation;
import org.ece.blackrose.organization.BranchFilter;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public final class FinanceRepositories {

  private FinanceRepositories() {}

  // --- 12.1 §3.5 hareket türü (kind) türetimi: cari listeleri, bakiyeler ve ekstre aynı metni
  // kullanır. Taban satır: taşımanın orijinali (og), yoksa ters çevrilen satır (rv), yoksa
  // kendisi (t). Ters kayıt ve taşıma çıkışı kendi türünde eksi (sign = -1) sayılır.

  static final String KIND_JOINS =
      """
       left join account_transaction rv
              on t.source_type = 'REVERSAL' and rv.id = t.source_id
       left join account_transfer_line ln
              on coalesce(rv.source_type, t.source_type)
                   in ('ACCOUNT_TRANSFER_OUT', 'ACCOUNT_TRANSFER_IN')
             and ln.id = coalesce(rv.source_id, t.source_id)
       left join account_transaction og on og.id = ln.account_transaction_id
      """;

  static final String BASE_TYPE = " coalesce(og.source_type, rv.source_type, t.source_type) ";

  static final String BASE_ID = " coalesce(og.source_id, rv.source_id, t.source_id) ";

  static final String BASE_DIRECTION = " coalesce(og.direction, rv.direction, t.direction) ";

  static final String KIND =
      " (case when"
          + BASE_TYPE
          + "= 'SETTLEMENT' then (case"
          + BASE_DIRECTION
          + "when 'DEBIT' then 'PAYMENT' else 'COLLECTION' end) else (case"
          + BASE_DIRECTION
          + "when 'DEBIT' then 'RECEIVABLE' else 'DEBT' end) end) ";

  static final String SIGN = " (case when t.direction =" + BASE_DIRECTION + "then 1 else -1 end) ";

  /** Taban kaynağın belge bilgisi (belge no, tür, tarih, vade, ödeme şekli). */
  static final String DOCUMENT_JOINS =
      " left join account_document d on"
          + BASE_TYPE
          + "= 'ACCOUNT_DOCUMENT' and d.id ="
          + BASE_ID
          + "and d.deleted = false"
          + " left join purchase_invoice pi on"
          + BASE_TYPE
          + "= 'PURCHASE_INVOICE' and pi.id ="
          + BASE_ID
          + "and pi.deleted = false"
          + " left join freight_invoice fi on"
          + BASE_TYPE
          + "= 'FREIGHT_INVOICE' and fi.id ="
          + BASE_ID
          + "and fi.deleted = false"
          + " left join warehouse_invoice wi on"
          + BASE_TYPE
          + "= 'WAREHOUSE_INVOICE' and wi.id ="
          + BASE_ID
          + "and wi.deleted = false"
          + " left join opening_invoice oi on"
          + BASE_TYPE
          + "= 'OPENING_INVOICE' and oi.id ="
          + BASE_ID
          + "and oi.deleted = false"
          + " left join settlement s on"
          + BASE_TYPE
          + "= 'SETTLEMENT' and s.id ="
          + BASE_ID
          + "and s.deleted = false"
          + " left join instrument sin on sin.id = s.instrument_id and sin.deleted = false ";

  private static final String DOCUMENT_DATE =
      " coalesce(d.document_date, pi.invoice_date, fi.invoice_date, wi.invoice_date,"
          + " oi.invoice_date) ";

  /** {@link LedgerRow} kolonları ({@code KIND_JOINS} + {@code DOCUMENT_JOINS} gerekir). */
  private static final String ROW_COLUMNS =
      """
       t.id as "id", t.transaction_date as "transactionDate", t.created_at as "createdAt",
       t.created_by as "createdBy", t.account_id as "accountId", t.branch_id as "branchId",
       t.company_id as "companyId", t.direction as "direction", t.amount as "amount",
       t.currency as "currency", t.exchange_rate as "exchangeRate", t.tl_amount as "tlAmount",
       t.description as "description", t.source_type as "sourceType", t.source_id as "sourceId",
       t.source_type = 'REVERSAL' as "reversal",
       exists (select 1 from account_transaction r where r.source_type = 'REVERSAL'
                 and r.source_id = t.id and r.deleted = false) as "reversed",
       case coalesce(rv.source_type, t.source_type) when 'ACCOUNT_TRANSFER_OUT' then 'OUT'
            when 'ACCOUNT_TRANSFER_IN' then 'IN' end as "transferRole",
       exists (select 1 from account_transfer_line l where l.account_transaction_id = t.id
                 and l.active and l.deleted = false) as "transferredOut",
       coalesce(d.document_no, pi.number, fi.number, wi.number, oi.number, s.document_no)
         as "documentNo",
       coalesce(d.due_date, pi.due_date, fi.due_date, wi.due_date, oi.due_date) as "dueDate",
       coalesce(d.payment_method,
                case when s.method = 'CHECK' then coalesce(sin.kind, 'CHECK')
                     when s.channel = 'CREDIT_CARD' then 'CREDIT_CARD'
                     else s.method end) as "paymentMethod",
      """
          + KIND
          + " as \"kind\", "
          + SIGN
          + " as \"sign\", "
          + BASE_TYPE
          + " as \"baseSourceType\", "
          + BASE_ID
          + " as \"baseSourceId\", coalesce(d.document_type,"
          + BASE_TYPE
          + ") as \"documentType\", "
          + DOCUMENT_DATE
          + " as \"documentDate\" ";

  /** {@link CrossLedgerRow} ek kolonları. */
  private static final String CROSS_COLUMNS =
      """
      , a.code as "accountCode", a.name as "accountName", a.type as "accountType",
       a.sub_group as "subGroup", g.name as "subGroupName", b.name as "branchName"
      """;

  /** Çapraz liste ve facet'lerin ortak gövdesi (iş yeri/grup/tür seçimi hariç süzgeçler). */
  private static final String CROSS_FROM =
      " from account_transaction t "
          + KIND_JOINS
          + DOCUMENT_JOINS
          + """
           join account a on a.id = t.account_id
           join account_group g on g.code = a.sub_group
           join branch b on b.id = t.branch_id
          where t.deleted = false and a.deleted = false
            and t.transaction_date between :from and :to
            and (:allAccounts = true or t.account_id = :accountId)
            and (:currency = '' or t.currency = :currency)
            and (:allCompanies = true or t.company_id = :companyId)
            and (:allBranches = true or t.branch_id in (:branchIds))
            and (:employeeVisible = true or a.type <> 'EMPLOYEE')
          """;

  /** Çapraz listede kullanıcının grup/tür/hareket türü seçimleri. */
  private static final String CROSS_SELECTION =
      " and (:allTypes = true or a.type in (:types))"
          + " and (:allGroups = true or a.sub_group in (:subGroups))"
          + " and (:allKinds = true or"
          + KIND
          + "in (:kinds)) ";

  /** Ekstrenin etkin tarihi: belge tarihi tabanında belge tarihi, yoksa işlem tarihi. */
  private static final String STATEMENT_DATE =
      " (case when :documentBasis = true then coalesce("
          + DOCUMENT_DATE
          + ", t.transaction_date) else t.transaction_date end) ";

  private static final String STATEMENT_FROM =
      " from account_transaction t "
          + KIND_JOINS
          + DOCUMENT_JOINS
          + """
          where t.account_id = :accountId and t.deleted = false
            and (:currency = '' or t.currency = :currency)
            and (:allCompanies = true or t.company_id = :companyId)
            and (:allBranches = true or t.branch_id in (:branchIds))
          """;

  // --- 12.1 §3.11 cari taşıma

  /** Taban kaynağı ödeme/tahsilat ya da çek hareketi olan satırın bağlı çek/senedi. */
  private static final String INSTRUMENT_OF =
      """
       (case when t.source_type = 'SETTLEMENT' then s.instrument_id
             when t.source_type in ('INSTRUMENT', 'INSTRUMENT_ENDORSEE_BOUNCE')
               then (select m.instrument_id from instrument_movement m where m.id = t.source_id)
        end)
      """;

  /**
   * Açık (DRAFT/PENDING/APPROVED/REJECTED) ödeme planına bağlı hareket (OK-36; TRIP_COST tutucu).
   * REJECTED plan yeniden onaya gönderilip ödenebildiği için açık sayılır (önce iptal edilir).
   */
  private static final String OPEN_PLAN =
      """
       (case t.source_type
          when 'PURCHASE_INVOICE' then exists (
            select 1 from payment_plan p where p.purchase_invoice_id = t.source_id
              and p.deleted = false and p.status in ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED'))
          when 'OPENING_INVOICE' then exists (
            select 1 from opening_invoice o join payment_plan p on p.id = o.payment_plan_id
             where o.id = t.source_id and p.deleted = false
               and p.status in ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED'))
          when 'TRIP_COST' then exists (
            select 1 from payment_plan p where p.account_id = t.account_id
              and p.branch_id = t.branch_id and p.amount = t.amount and p.currency = t.currency
              and p.description is not distinct from t.description
              and p.purchase_invoice_id is null and p.deleted = false
              and p.status in ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED'))
          else false end)
      """;

  /**
   * Kaynağına açık kur farkı belgesi kesilmiş hareket (12.8 §2.2): belge iptal edilmeden taşınamaz
   * ({@code FX_DOCUMENT_OPEN}).
   */
  private static final String OPEN_FX =
      """
       exists (select 1 from account_document fx where fx.fx_source_transaction_id = t.id
                 and fx.status = 'OPEN' and fx.deleted = false)
      """;

  /**
   * Açık kur farkı belgesinin kendi cari satırı (12.8 Rev 1 F5): taşınamaz ({@code FX_DOCUMENT}).
   */
  private static final String FX_DOC =
      """
       (t.source_type = 'ACCOUNT_DOCUMENT' and exists (
          select 1 from account_document k where k.id = t.source_id
            and k.document_type = 'KUR_FARKI' and k.status = 'OPEN' and k.deleted = false))
      """;

  /**
   * Taşınabilir hareket: ters kayıt ya da taşıma satırı değil, ters çevrilmemiş, etkin bir taşımada
   * değil.
   */
  private static final String TRANSFERABLE =
      """
       t.source_type not in ('REVERSAL', 'ACCOUNT_TRANSFER_OUT', 'ACCOUNT_TRANSFER_IN')
       and not exists (select 1 from account_transaction r where r.source_type = 'REVERSAL'
                         and r.source_id = t.id and r.deleted = false)
       and not exists (select 1 from account_transfer_line l where l.account_transaction_id = t.id
                         and l.active and l.deleted = false)
      """;

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

    /** Kart satır kilidi (profil, aktiflik, taşıma; 12.1 §3.15). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Account a where a.id = :id")
    Optional<Account> findForUpdate(@Param("id") UUID id);

    /**
     * Cari taşıma kilidi (12.1 §3.15): kartlar kimlik sırasıyla {@code FOR NO KEY UPDATE} ile
     * kilitlenir. Bu kilit, carinin hareket satırlarını ekleyen işlemlerin yabancı anahtar {@code
     * KEY SHARE} kilidiyle çakışmaz; taşıma ile çek geçişi / belge iptali birbirini beklerken
     * kilitlenme döngüsü oluşmaz, taşımalar ise kendi aralarında sıraya girer.
     */
    @Query(
        value = "select a.id from account a where a.id in (:ids) order by a.id for no key update",
        nativeQuery = true)
    List<UUID> lockForTransfer(@Param("ids") Collection<UUID> ids);

    @Query(
        """
        select a from Account a
        where (:search = '' or lower(a.name) like concat('%', :search, '%')
               or lower(a.code) like concat('%', :search, '%'))
        """)
    Page<Account> search(@Param("search") String search, Pageable pageable);

    /**
     * Kart listesi süzgeçleri (12.1 §3.2). Boş tür/grup listesi yerine {@code allTypes}/{@code
     * allGroups} bayrağı ve tek elemanlı yer tutucu liste verilir; {@code employeeVisible = false}
     * personel carilerini gizler.
     */
    @Query(
        """
        select a from Account a
        where (:term = '' or lower(a.name) like concat('%', :term, '%')
               or lower(a.code) like concat('%', :term, '%'))
          and (:allTypes = true or a.type in :types)
          and (:allGroups = true or a.subGroup in :subGroups)
          and (:active is null or a.active = :active)
          and (:employeeVisible = true
               or a.type <> org.ece.blackrose.finance.domain.FinanceTypes.AccountType.EMPLOYEE)
        """)
    Page<Account> searchFiltered(
        @Param("term") String term,
        @Param("allTypes") boolean allTypes,
        @Param("types") Collection<AccountType> types,
        @Param("allGroups") boolean allGroups,
        @Param("subGroups") Collection<String> subGroups,
        @Param("active") Boolean active,
        @Param("employeeVisible") boolean employeeVisible,
        Pageable pageable);

    /** Boş liste "hepsi" demektir; {@code term} küçük harfe çevrilmiş olmalı. */
    default Page<Account> searchFiltered(
        String term,
        Collection<AccountType> types,
        Collection<String> subGroups,
        Boolean active,
        boolean employeeVisible,
        Pageable pageable) {
      boolean allTypes = types == null || types.isEmpty();
      boolean allGroups = subGroups == null || subGroups.isEmpty();
      return searchFiltered(
          term == null ? "" : term,
          allTypes,
          allTypes ? List.of(AccountType.CUSTOMER) : types,
          allGroups,
          allGroups ? List.of("") : subGroups,
          active,
          employeeVisible,
          pageable);
    }

    /**
     * Carinin verilen şirket dışında açık ya da kalıcı kaydı var mı (12.1 §3.2 madde 4): hareket,
     * cari belgesi, iptal edilmemiş alış faturası, açık plan, ödeme/tahsilat, terminal olmayan
     * çek/senet (keşideci ya da lehtar), postlanmamış sefer maliyeti, kapanmamış sefer.
     */
    @Query(
        value =
            """
            select exists (select 1 from account_transaction
                           where account_id = :accountId and deleted = false
                             and company_id <> :companyId)
                or exists (select 1 from account_document
                           where account_id = :accountId and deleted = false
                             and company_id <> :companyId)
                or exists (select 1 from purchase_invoice
                           where account_id = :accountId and deleted = false
                             and status <> 'CANCELLED' and company_id <> :companyId)
                or exists (select 1 from payment_plan
                           where account_id = :accountId and deleted = false
                             and status in ('DRAFT', 'PENDING', 'APPROVED')
                             and company_id <> :companyId)
                or exists (select 1 from settlement
                           where account_id = :accountId and deleted = false
                             and company_id <> :companyId)
                or exists (select 1 from instrument
                           where (account_id = :accountId or endorsed_account_id = :accountId)
                             and deleted = false
                             and status in ('PORTFOLIO', 'AT_BANK', 'ENDORSED', 'ISSUED', 'COLLATERAL')
                             and company_id <> :companyId)
                or exists (select 1 from trip_cost c
                           join shipment s on s.id = c.shipment_id
                           join branch b on b.id = s.branch_id
                           where c.account_id = :accountId and c.deleted = false
                             and s.deleted = false and c.posted_at is null
                             and b.company_id <> :companyId)
                or exists (select 1 from shipment s
                           join branch b on b.id = s.branch_id
                           where s.account_id = :accountId and s.deleted = false
                             and s.status not in ('CLOSED', 'CANCELLED')
                             and b.company_id <> :companyId)
            """,
        nativeQuery = true)
    boolean hasOtherCompanyRecords(
        @Param("accountId") UUID accountId, @Param("companyId") UUID companyId);
  }

  /**
   * Tür kırılımlı cari bakiye satırı (12.1 §3.6). {@code companyId}/{@code branchId} yalnız ilgili
   * kırılımda dolu; {@code segment} ALL ya da sezon devrinde BEFORE/AFTER.
   */
  public interface KindBalanceRow {
    UUID getAccountId();

    String getCurrency();

    UUID getCompanyId();

    UUID getBranchId();

    String getSegment();

    BigDecimal getDebit();

    BigDecimal getCredit();

    BigDecimal getDebt();

    BigDecimal getPayment();

    BigDecimal getReceivable();

    BigDecimal getCollection();

    BigDecimal getTlBalance();
  }

  /** Cari ve para birimi başına açık ödeme planı özeti (12.1 §3.2 {@code includePlanSummary}). */
  public interface PlanSummaryRow {
    UUID getAccountId();

    String getCurrency();

    LocalDate getNextDueDate();

    long getOverdueCount();

    long getDueTodayCount();

    long getDraftCount();

    long getPendingCount();

    long getApprovedCount();

    BigDecimal getPlanned();
  }

  /** Para birimi bazında cari bakiye satırı. */
  public interface BalanceRow {
    UUID getAccountId();

    String getCurrency();

    BigDecimal getDebit();

    BigDecimal getCredit();

    BigDecimal getTlBalance();
  }

  /**
   * Türü türetilmiş cari hareket satırı (12.1 §3.5). {@code createdAt} sürücünün döndürdüğü zaman
   * tipindedir (Instant/OffsetDateTime/Timestamp); servis çevirir.
   */
  public interface LedgerRow {
    UUID getId();

    LocalDate getTransactionDate();

    Object getCreatedAt();

    String getCreatedBy();

    UUID getAccountId();

    UUID getBranchId();

    UUID getCompanyId();

    String getDirection();

    BigDecimal getAmount();

    String getCurrency();

    BigDecimal getExchangeRate();

    BigDecimal getTlAmount();

    String getDescription();

    String getSourceType();

    UUID getSourceId();

    String getKind();

    Integer getSign();

    String getBaseSourceType();

    UUID getBaseSourceId();

    Boolean getReversal();

    Boolean getReversed();

    String getTransferRole();

    Boolean getTransferredOut();

    String getDocumentNo();

    String getDocumentType();

    LocalDate getDocumentDate();

    LocalDate getDueDate();

    String getPaymentMethod();
  }

  /** Çapraz liste satırı: cari, hesap grubu ve iş yeri adlarıyla. */
  public interface CrossLedgerRow extends LedgerRow {
    String getAccountCode();

    String getAccountName();

    String getAccountType();

    String getSubGroup();

    String getSubGroupName();

    String getBranchName();
  }

  /**
   * Tek hareket detayı: ters kaydı, taşıması ve kaynak rotası için kaynak belgenin bağlı kaydı
   * (sefer, depo sözleşmesi, araç).
   */
  public interface LedgerDetailRow extends CrossLedgerRow {
    UUID getReversedById();

    UUID getTransferId();

    UUID getRefId();
  }

  /** Ekstre v2 satırı; bakiye para birimi başına, dönem başı hariç yürüyen toplamdır. */
  public interface StatementRow extends LedgerRow {
    BigDecimal getRunningBalance();
  }

  public interface CurrencyAmountRow {
    String getCurrency();

    BigDecimal getAmount();
  }

  /** Eksik fatura satırı (12.2 §3.7); {@code companyId} şirketler toplandığında null. */
  public interface InvoiceCoverageRow {
    UUID getAccountId();

    UUID getCompanyId();

    String getCurrency();

    String getSide();

    BigDecimal getLedgerTotal();

    BigDecimal getInvoiceTotal();
  }

  public interface BranchFacetRow {
    UUID getId();

    String getName();

    long getCount();
  }

  public interface GroupFacetRow {
    String getCode();

    String getName();

    long getCount();
  }

  public interface KindFacetRow {
    String getKind();

    long getCount();
  }

  /** Cari fatura listesi satırı (alış ∪ satış; 12.1 §3.9). */
  public interface AccountInvoiceRow {
    String getKind();

    UUID getId();

    String getNumber();

    String getDocumentType();

    String getDocumentTypeName();

    LocalDate getInvoiceDate();

    LocalDate getDueDate();

    BigDecimal getNetAmount();

    BigDecimal getVatAmount();

    BigDecimal getWithholdingAmount();

    BigDecimal getTotalAmount();

    String getCurrency();

    Boolean getReflected();

    String getStatus();

    UUID getCompanyId();

    UUID getBranchId();
  }

  /** Taşınabilir hareket satırı (12.1 §4.7): bağlı çek ve açık plan engeliyle. */
  public interface TransferableRow extends LedgerRow {
    String getBranchName();

    UUID getInstrumentId();

    String getBlockedReason();
  }

  /** Geçmiş taşımalar satırı (taşınan hareket başına; ZTO geçmiş modalı). */
  public interface TransferHistoryRow {
    UUID getTransferId();

    UUID getLineId();

    LocalDate getTransferDate();

    String getStatus();

    UUID getFromAccountId();

    String getFromAccountCode();

    String getFromAccountName();

    UUID getToAccountId();

    String getToAccountCode();

    String getToAccountName();

    String getKind();

    BigDecimal getAmount();

    String getCurrency();

    String getInstrumentNumber();

    String getCreatedBy();
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

    /** Ters kayıt ve cari taşıma için hareket satırı kilidi (12.1 §3.11). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from AccountTransaction t where t.id = :id")
    Optional<AccountTransaction> findForUpdate(@Param("id") UUID id);

    /** Birden çok hareketi kimlik sırasıyla kilitler; sabit sıra kilitlenme döngüsünü önler. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from AccountTransaction t where t.id in :ids order by t.id")
    List<AccountTransaction> findAllForUpdate(@Param("ids") Collection<UUID> ids);

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

    /** Silinmemiş hareket (tür değişim kilidi, 12.1 §3.1). */
    boolean existsByAccountIdAndDeletedFalse(UUID accountId);

    /**
     * Hareket türü ({@code kind}) türetimi ve tür kırılımlı bakiye (12.1 §3.5–§3.6). Taban satır:
     * taşımanın orijinali, yoksa ters çevrilen satır, yoksa kendisi; ters kayıt ve taşıma çıkışı
     * kendi türünde eksi sayılır.
     */
    @Query(
        value =
            """
            select k.account_id as "accountId", k.currency as "currency",
                   case when :groupBy = 'COMPANY' then k.company_id end as "companyId",
                   case when :groupBy = 'BRANCH' then k.branch_id end as "branchId",
                   case when cast(:splitDate as date) is null then 'ALL'
                        when k.transaction_date < cast(:splitDate as date) then 'BEFORE'
                        else 'AFTER' end as "segment",
                   coalesce(sum(case when k.direction = 'DEBIT' then k.amount else 0 end), 0)
                     as "debit",
                   coalesce(sum(case when k.direction = 'CREDIT' then k.amount else 0 end), 0)
                     as "credit",
                   coalesce(sum(case when k.kind = 'DEBT' then k.sign * k.amount else 0 end), 0)
                     as "debt",
                   coalesce(sum(case when k.kind = 'PAYMENT' then k.sign * k.amount else 0 end), 0)
                     as "payment",
                   coalesce(sum(case when k.kind = 'RECEIVABLE' then k.sign * k.amount else 0 end),
                     0) as "receivable",
                   coalesce(sum(case when k.kind = 'COLLECTION' then k.sign * k.amount else 0 end),
                     0) as "collection",
                   coalesce(sum(case when k.direction = 'DEBIT' then k.tl_amount
                                     else -k.tl_amount end), 0) as "tlBalance"
            from (
              select t.account_id, t.currency, t.company_id, t.branch_id, t.transaction_date,
                     t.direction, t.amount, t.tl_amount,
            """
                + KIND
                + " as kind, "
                + SIGN
                + " as sign from account_transaction t "
                + KIND_JOINS
                + """
              where t.account_id in (:accountIds) and t.deleted = false
                and (cast(:asOf as date) is null or t.transaction_date <= cast(:asOf as date))
                and (:allCompanies = true or t.company_id = :companyId)
                and (:allBranches = true or t.branch_id in (:branchIds))
            ) k
            group by 1, 2, 3, 4, 5
            order by 2
            """,
        nativeQuery = true)
    List<KindBalanceRow> kindBalances(
        @Param("accountIds") Collection<UUID> accountIds,
        @Param("groupBy") String groupBy,
        @Param("splitDate") LocalDate splitDate,
        @Param("asOf") LocalDate asOf,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds);

    default List<KindBalanceRow> kindBalances(
        Collection<UUID> accountIds,
        String groupBy,
        LocalDate splitDate,
        LocalDate asOf,
        BranchFilter filter) {
      return kindBalances(
          accountIds,
          groupBy,
          splitDate,
          asOf,
          filter.companyId() == null,
          companyOrNone(filter),
          filter.allBranches(),
          filter.branchIds());
    }

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

    /**
     * Eksik fatura (12.2 §3.7): cari × (şirket) × para birimi × taraf için defter toplamı ve fatura
     * toplamı. Defter satırları taban kaynağa bağlanır (ters kayıt ve taşıma çıkışı eksi); PAYABLE
     * = {@code DEBT} türü, RECEIVABLE = {@code RECEIVABLE} türü, açılış bakiyesi hariç. Fatura
     * sayılan taban: {@code counts_as_invoice} cari belgesi, alış faturası ve açılış faturası
     * (PAYABLE); navlun, depo ve açılış faturası (RECEIVABLE). Yansıtılmayan fatura belgeleri net
     * ödenecek tutarlarıyla eklenir. {@code side = ''} iki taraf.
     */
    @Query(
        value =
            """
            select x.account_id as "accountId",
                   case when :byCompany = true then x.company_id end as "companyId",
                   x.currency as "currency", x.side as "side",
                   coalesce(sum(x.ledger), 0) as "ledgerTotal",
                   coalesce(sum(x.invoice), 0) as "invoiceTotal"
            from (
              select k.account_id, k.company_id, k.currency,
                     case k.kind when 'DEBT' then 'PAYABLE' else 'RECEIVABLE' end as side,
                     k.sign * k.amount as ledger,
                     case when (k.base_type in ('ACCOUNT_DOCUMENT', 'TRIP_COST', 'EXPENSE')
                                and k.document_invoice)
                            or (k.kind = 'DEBT'
                                and k.base_type in ('PURCHASE_INVOICE', 'OPENING_INVOICE'))
                            or (k.kind = 'RECEIVABLE'
                                and k.base_type in ('FREIGHT_INVOICE', 'WAREHOUSE_INVOICE',
                                                    'OPENING_INVOICE'))
                          then k.sign * k.amount else 0 end as invoice
              from (
                select t.account_id, t.company_id, t.currency, t.amount,
            """
                + KIND
                + " as kind, "
                + SIGN
                + " as sign, "
                + BASE_TYPE
                + """
                 as base_type,
                       coalesce(ty.counts_as_invoice, cty.counts_as_invoice, ety.counts_as_invoice,
                                false) as document_invoice
                from account_transaction t
            """
                + KIND_JOINS
                + " left join account_document d on"
                + BASE_TYPE
                + "= 'ACCOUNT_DOCUMENT' and d.id ="
                + BASE_ID
                + "and d.deleted = false"
                + """
                 left join account_document_type ty on ty.side = d.side and ty.code = d.document_type
            """
                + " left join trip_cost tc on"
                + BASE_TYPE
                + "= 'TRIP_COST' and tc.id ="
                + BASE_ID
                + " left join account_document_type cty on cty.side = 'PAYABLE'"
                + " and cty.code = tc.document_type"
                + " left join expense ex on"
                + BASE_TYPE
                + "= 'EXPENSE' and ex.id ="
                + BASE_ID
                + " left join account_document_type ety on ety.side = 'PAYABLE'"
                + " and ety.code = ex.document_type"
                + """
                 join account a on a.id = t.account_id
                where t.deleted = false and a.deleted = false
                  and (:allAccounts = true or t.account_id in (:accountIds))
                  and (:employeeVisible = true or a.type <> 'EMPLOYEE')
                  and (cast(:asOf as date) is null or t.transaction_date <= cast(:asOf as date))
                  and (:allCompanies = true or t.company_id = :companyId)
                  and (:allBranches = true or t.branch_id in (:branchIds))
              ) k
              where k.kind in ('DEBT', 'RECEIVABLE') and k.base_type <> 'OPENING'
              union all
              select d.account_id, d.company_id, d.currency, d.side, 0,
                     coalesce(tx.net_payable, d.amount)
              from account_document d
              join account_document_type ty on ty.side = d.side and ty.code = d.document_type
              left join account_document_tax tx on tx.document_id = d.id and tx.deleted = false
              join account a on a.id = d.account_id
              where d.deleted = false and d.reflect_to_ledger = false and d.status = 'OPEN'
                and ty.counts_as_invoice and a.deleted = false
                and (:allAccounts = true or d.account_id in (:accountIds))
                and (:employeeVisible = true or a.type <> 'EMPLOYEE')
                and (cast(:asOf as date) is null or d.document_date <= cast(:asOf as date))
                and (:allCompanies = true or d.company_id = :companyId)
                and (:allBranches = true or d.branch_id in (:branchIds))
            ) x
            where (:side = '' or x.side = :side)
            group by 1, 2, 3, 4
            having (:onlyMissing = false
                    or coalesce(sum(x.ledger), 0) - coalesce(sum(x.invoice), 0) > 1)
            order by 1, 2 nulls first, 3, 4
            limit :limit
            """,
        nativeQuery = true)
    List<InvoiceCoverageRow> invoiceCoverage(
        @Param("allAccounts") boolean allAccounts,
        @Param("accountIds") Collection<UUID> accountIds,
        @Param("byCompany") boolean byCompany,
        @Param("side") String side,
        @Param("onlyMissing") boolean onlyMissing,
        @Param("asOf") LocalDate asOf,
        @Param("employeeVisible") boolean employeeVisible,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("limit") int limit);

    /**
     * {@code accountIds} null ise görünür tüm cariler; {@code byCompany} false ise şirketler
     * toplanır ({@code companyId = null}); {@code side} null ise iki taraf.
     */
    @SuppressWarnings("java:S107")
    default List<InvoiceCoverageRow> invoiceCoverage(
        Collection<UUID> accountIds,
        BranchFilter filter,
        boolean byCompany,
        InvoiceSide side,
        boolean onlyMissing,
        LocalDate asOf,
        boolean employeeVisible,
        int limit) {
      return invoiceCoverage(
          accountIds == null,
          accountIds == null || accountIds.isEmpty() ? List.of(BranchFilter.NONE) : accountIds,
          byCompany,
          side == null ? "" : side.name(),
          onlyMissing,
          asOf,
          employeeVisible,
          filter.companyId() == null,
          companyOrNone(filter),
          filter.allBranches(),
          filter.branchIds(),
          limit);
    }

    /**
     * Ekstre v2 (12.1 §3.6): çok para birimli, belge ya da işlem tarihi tabanlı; yürüyen bakiye
     * para birimi başına. {@code currency = ''} tüm para birimleri.
     */
    @Query(
        value =
            "select "
                + ROW_COLUMNS
                + ", sum(case when t.direction = 'DEBIT' then t.amount else -t.amount end)"
                + " over (partition by t.currency order by"
                + STATEMENT_DATE
                + ", t.created_at, t.id) as \"runningBalance\""
                + STATEMENT_FROM
                + " and"
                + STATEMENT_DATE
                + "between :from and :to order by"
                + STATEMENT_DATE
                + ", t.created_at, t.id limit :limit offset :offset",
        nativeQuery = true)
    List<StatementRow> statementRows(
        @Param("accountId") UUID accountId,
        @Param("currency") String currency,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("documentBasis") boolean documentBasis,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("limit") int limit,
        @Param("offset") long offset);

    @Query(
        value =
            "select count(*)" + STATEMENT_FROM + " and" + STATEMENT_DATE + "between :from and :to",
        nativeQuery = true)
    long statementCount(
        @Param("accountId") UUID accountId,
        @Param("currency") String currency,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("documentBasis") boolean documentBasis,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds);

    /** Para birimi başına dönem başı bakiyesi (etkin tarih {@code from}'dan önce). */
    @Query(
        value =
            "select t.currency as \"currency\","
                + " coalesce(sum(case when t.direction = 'DEBIT' then t.amount"
                + " else -t.amount end), 0) as \"amount\""
                + STATEMENT_FROM
                + " and"
                + STATEMENT_DATE
                + "< :from group by t.currency order by t.currency",
        nativeQuery = true)
    List<CurrencyAmountRow> statementOpenings(
        @Param("accountId") UUID accountId,
        @Param("currency") String currency,
        @Param("from") LocalDate from,
        @Param("documentBasis") boolean documentBasis,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds);

    /**
     * Çapraz cari hareket listesi (12.1 §3.7); sıra tarih, oluşturma, kimlik azalan. {@code
     * allAccounts}/{@code allTypes}/{@code allGroups}/{@code allKinds} bayrakları boş süzgeç yerine
     * geçer (yer tutucu liste tek elemanlıdır).
     */
    @Query(
        value =
            "select "
                + ROW_COLUMNS
                + CROSS_COLUMNS
                + CROSS_FROM
                + CROSS_SELECTION
                + " order by t.transaction_date desc, t.created_at desc, t.id desc"
                + " limit :limit offset :offset",
        nativeQuery = true)
    List<CrossLedgerRow> crossRows(
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("allAccounts") boolean allAccounts,
        @Param("accountId") UUID accountId,
        @Param("currency") String currency,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("employeeVisible") boolean employeeVisible,
        @Param("allTypes") boolean allTypes,
        @Param("types") Collection<String> types,
        @Param("allGroups") boolean allGroups,
        @Param("subGroups") Collection<String> subGroups,
        @Param("allKinds") boolean allKinds,
        @Param("kinds") Collection<String> kinds,
        @Param("limit") int limit,
        @Param("offset") long offset);

    @Query(value = "select count(*)" + CROSS_FROM + CROSS_SELECTION, nativeQuery = true)
    long crossCount(
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("allAccounts") boolean allAccounts,
        @Param("accountId") UUID accountId,
        @Param("currency") String currency,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("employeeVisible") boolean employeeVisible,
        @Param("allTypes") boolean allTypes,
        @Param("types") Collection<String> types,
        @Param("allGroups") boolean allGroups,
        @Param("subGroups") Collection<String> subGroups,
        @Param("allKinds") boolean allKinds,
        @Param("kinds") Collection<String> kinds);

    /** İş yeri facet'i: iş yeri/grup/tür seçimleri uygulanmaz (ZTO kart süzgeçleri). */
    @Query(
        value =
            "select b.id as \"id\", b.name as \"name\", count(*) as \"count\""
                + CROSS_FROM
                + " group by b.id, b.name order by b.name",
        nativeQuery = true)
    List<BranchFacetRow> branchFacets(
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("allAccounts") boolean allAccounts,
        @Param("accountId") UUID accountId,
        @Param("currency") String currency,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("employeeVisible") boolean employeeVisible);

    @Query(
        value =
            "select g.code as \"code\", g.name as \"name\", count(*) as \"count\""
                + CROSS_FROM
                + " group by g.code, g.name, g.sort_order order by g.sort_order",
        nativeQuery = true)
    List<GroupFacetRow> groupFacets(
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("allAccounts") boolean allAccounts,
        @Param("accountId") UUID accountId,
        @Param("currency") String currency,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("employeeVisible") boolean employeeVisible);

    @Query(
        value =
            "select"
                + KIND
                + "as \"kind\", count(*) as \"count\""
                + CROSS_FROM
                + " group by 1 order by 1",
        nativeQuery = true)
    List<KindFacetRow> kindFacets(
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("allAccounts") boolean allAccounts,
        @Param("accountId") UUID accountId,
        @Param("currency") String currency,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("employeeVisible") boolean employeeVisible);

    /**
     * Tek hareket (silinmemiş): satır, ters kaydı, taşıması (taşıma satırı ya da taşınmış orijinal)
     * ve kaynak belgenin bağlı kaydı (sefer, depo sözleşmesi, araç).
     */
    @Query(
        value =
            "select "
                + ROW_COLUMNS
                + CROSS_COLUMNS
                + """
                , (select r.id from account_transaction r where r.source_type = 'REVERSAL'
                     and r.source_id = t.id and r.deleted = false limit 1) as "reversedById",
                  coalesce(ln.account_transfer_id,
                    (select l.account_transfer_id from account_transfer_line l
                      where l.account_transaction_id = t.id and l.active and l.deleted = false
                      limit 1)) as "transferId",
                  case
                """
                + BASE_TYPE
                + " when 'FREIGHT_INVOICE' then fi.shipment_id"
                + " when 'WAREHOUSE_INVOICE' then wi.contract_id"
                + " when 'TRIP_COST' then (select c.shipment_id from trip_cost c where c.id ="
                + BASE_ID
                + ") when 'VEHICLE_EXPENSE' then (select v.vehicle_id from vehicle_expense v"
                + " where v.id ="
                + BASE_ID
                + ") when 'EXPENSE' then (select e.expense_item_id from expense e where e.id ="
                + BASE_ID
                + ") end as \"refId\" from account_transaction t "
                + KIND_JOINS
                + DOCUMENT_JOINS
                + """
                 join account a on a.id = t.account_id
                 join account_group g on g.code = a.sub_group
                 join branch b on b.id = t.branch_id
                where t.id = :id and t.deleted = false
                """,
        nativeQuery = true)
    Optional<LedgerDetailRow> detailRow(@Param("id") UUID id);

    /**
     * Cari fatura listesi (12.1 §3.9): alışta alış faturası ∪ Borç Ekle fatura türü belgeler,
     * satışta navlun ∪ depo faturası ∪ Alacak Ekle fatura türü belgeler. Navlun/depo faturasının
     * ISSUED durumu OPEN olarak döner. Sınır denetimi için en çok {@code limit} satır.
     */
    @Query(
        value =
            """
            select * from (
              select 'PURCHASE_INVOICE' as "kind", p.id as "id", p.number as "number",
                     'ALIS_FATURASI' as "documentType", 'Alış Faturası' as "documentTypeName",
                     p.invoice_date as "invoiceDate", p.due_date as "dueDate",
                     p.net_amount as "netAmount", p.vat_amount as "vatAmount",
                     cast(0 as numeric) as "withholdingAmount", p.total_amount as "totalAmount",
                     p.currency as "currency", true as "reflected", p.status as "status",
                     p.company_id as "companyId", p.branch_id as "branchId"
              from purchase_invoice p
              where :purchase = true and p.account_id = :accountId and p.deleted = false
                and (:allCompanies = true or p.company_id = :companyId)
                and (:allBranches = true or p.branch_id in (:branchIds))
              union all
              select 'FREIGHT_INVOICE', f.id, f.number, 'SATIS_FATURASI', 'Navlun Faturası',
                     f.invoice_date, f.due_date, f.net_amount, f.vat_amount, f.withholding_amount,
                     f.total_amount, f.currency, true,
                     case f.status when 'ISSUED' then 'OPEN' else f.status end,
                     f.company_id, f.branch_id
              from freight_invoice f
              where :purchase = false and f.account_id = :accountId and f.deleted = false
                and (:allCompanies = true or f.company_id = :companyId)
                and (:allBranches = true or f.branch_id in (:branchIds))
              union all
              select 'WAREHOUSE_INVOICE', w.id, w.number, 'SATIS_FATURASI', 'Depo Faturası',
                     w.invoice_date, w.due_date, w.net_amount, w.vat_amount, w.withholding_amount,
                     w.total_amount, w.currency, true,
                     case w.status when 'ISSUED' then 'OPEN' else w.status end,
                     w.company_id, w.branch_id
              from warehouse_invoice w
              where :purchase = false and w.account_id = :accountId and w.deleted = false
                and (:allCompanies = true or w.company_id = :companyId)
                and (:allBranches = true or w.branch_id in (:branchIds))
              union all
              select 'ACCOUNT_DOCUMENT', d.id, d.document_no, d.document_type, ty.name,
                     d.document_date, d.due_date, coalesce(x.net_excl_vat, d.amount),
                     coalesce(x.vat_amount, 0), coalesce(x.withholding_amount, 0),
                     coalesce(x.total_incl_vat, d.amount), d.currency, d.reflect_to_ledger,
                     d.status, d.company_id, d.branch_id
              from account_document d
              join account_document_type ty on ty.side = d.side and ty.code = d.document_type
              left join account_document_tax x on x.document_id = d.id and x.deleted = false
              where d.account_id = :accountId and d.deleted = false and ty.invoice_section
                and d.side = (case when :purchase = true then 'PAYABLE' else 'RECEIVABLE' end)
                and (:allCompanies = true or d.company_id = :companyId)
                and (:allBranches = true or d.branch_id in (:branchIds))
            ) u
            where (:documentType = '' or u."documentType" = :documentType)
              and (:anyReflected = true or u."reflected" = :reflected)
              and u."invoiceDate" between :from and :to
            order by u."invoiceDate" desc, u."number" desc
            limit :limit
            """,
        nativeQuery = true)
    List<AccountInvoiceRow> invoiceRows(
        @Param("accountId") UUID accountId,
        @Param("purchase") boolean purchase,
        @Param("documentType") String documentType,
        @Param("anyReflected") boolean anyReflected,
        @Param("reflected") boolean reflected,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("limit") int limit);

    /**
     * Carinin taşınabilir hareketleri (12.1 §3.11), bağlı çek/senet ve açık plan engeliyle. {@code
     * allIds = false} yalnız {@code ids}'i, {@code allInstruments = false} yalnız {@code
     * instrumentIds}'e bağlı satırları döner (çek satırı bütünlüğü). Tarih sırası.
     */
    @Query(
        value =
            "select "
                + ROW_COLUMNS
                + ", b.name as \"branchName\", "
                + INSTRUMENT_OF
                + " as \"instrumentId\", case when "
                + OPEN_PLAN
                + " then 'OPEN_PLAN' when "
                + OPEN_FX
                + " then 'FX_DOCUMENT_OPEN' when "
                + FX_DOC
                + " then 'FX_DOCUMENT' end as \"blockedReason\""
                + " from account_transaction t "
                + KIND_JOINS
                + DOCUMENT_JOINS
                + " join branch b on b.id = t.branch_id"
                + " where t.account_id = :accountId and t.deleted = false and "
                + TRANSFERABLE
                + """
                  and (:allIds = true or t.id in (:ids))
                  and (:allInstruments = true or
                """
                + INSTRUMENT_OF
                + """
                  in (:instrumentIds))
                  and (:allCompanies = true or t.company_id = :companyId)
                  and (:allBranches = true or t.branch_id in (:branchIds))
                order by t.transaction_date, t.created_at, t.id
                """,
        nativeQuery = true)
    List<TransferableRow> transferableRows(
        @Param("accountId") UUID accountId,
        @Param("allIds") boolean allIds,
        @Param("ids") Collection<UUID> ids,
        @Param("allInstruments") boolean allInstruments,
        @Param("instrumentIds") Collection<UUID> instrumentIds,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds);

    /** Liste: kullanıcının kapsamındaki tüm taşınabilir satırlar. */
    default List<TransferableRow> transferableRows(UUID accountId, BranchFilter filter) {
      return transferableRows(
          accountId,
          true,
          List.of(BranchFilter.NONE),
          true,
          List.of(BranchFilter.NONE),
          filter.companyId() == null,
          companyOrNone(filter),
          filter.allBranches(),
          filter.branchIds());
    }

    /** Taşıma kaydı: seçilen satırlardan kilit altında hâlâ taşınabilir olanlar (kapsamsız). */
    default List<TransferableRow> transferableRowsByIds(UUID accountId, Collection<UUID> ids) {
      return transferableRows(
          accountId,
          false,
          ids.isEmpty() ? List.of(BranchFilter.NONE) : ids,
          true,
          List.of(BranchFilter.NONE),
          true,
          BranchFilter.NONE,
          true,
          List.of(BranchFilter.NONE));
    }

    /** Çek satırı bütünlüğü: verilen çeklere bağlı tüm taşınabilir satırlar (kapsamsız). */
    default List<TransferableRow> transferableRowsByInstruments(
        UUID accountId, Collection<UUID> instrumentIds) {
      return transferableRows(
          accountId,
          true,
          List.of(BranchFilter.NONE),
          false,
          instrumentIds.isEmpty() ? List.of(BranchFilter.NONE) : instrumentIds,
          true,
          BranchFilter.NONE,
          true,
          List.of(BranchFilter.NONE));
    }

    /** Geçmiş taşımaların ortak gövdesi (taşınan hareket başına satır). */
    String TRANSFER_HISTORY_FROM =
        """
         from account_transfer_line l
         join account_transfer tr on tr.id = l.account_transfer_id
         join account fa on fa.id = tr.from_account_id
         join account ta on ta.id = tr.to_account_id
         join account_transaction t on t.id = l.account_transaction_id
         left join settlement s on t.source_type = 'SETTLEMENT' and s.id = t.source_id
        where l.deleted = false and tr.deleted = false
          and tr.transfer_date between :from and :to
          and (:allAccounts = true or tr.from_account_id = :accountId
               or tr.to_account_id = :accountId)
          and (:employeeVisible = true or (fa.type <> 'EMPLOYEE' and ta.type <> 'EMPLOYEE'))
          and (:allCompanies = true or l.company_id = :companyId)
          and (:allBranches = true or l.branch_id in (:branchIds))
        """;

    @Query(
        value =
            """
            select tr.id as "transferId", l.id as "lineId", tr.transfer_date as "transferDate",
                   tr.status as "status", fa.id as "fromAccountId", fa.code as "fromAccountCode",
                   fa.name as "fromAccountName", ta.id as "toAccountId",
                   ta.code as "toAccountCode", ta.name as "toAccountName",
                   case when t.source_type = 'SETTLEMENT'
                        then (case t.direction when 'DEBIT' then 'PAYMENT' else 'COLLECTION' end)
                        else (case t.direction when 'DEBIT' then 'RECEIVABLE' else 'DEBT' end)
                   end as "kind",
                   l.amount as "amount", l.currency as "currency",
                   (select i.number from instrument i
                     join account_transfer_instrument x on x.instrument_id = i.id
                      and x.account_transfer_id = tr.id and x.deleted = false
                    where i.deleted = false and i.id =
            """
                + INSTRUMENT_OF
                + """
                   ) as "instrumentNumber", tr.created_by as "createdBy"
                """
                + TRANSFER_HISTORY_FROM
                + """
                order by tr.transfer_date desc, tr.created_at desc, tr.id, l.id
                limit :limit offset :offset
                """,
        nativeQuery = true)
    List<TransferHistoryRow> transferHistoryRows(
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("allAccounts") boolean allAccounts,
        @Param("accountId") UUID accountId,
        @Param("employeeVisible") boolean employeeVisible,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("limit") int limit,
        @Param("offset") long offset);

    @Query(value = "select count(*)" + TRANSFER_HISTORY_FROM, nativeQuery = true)
    long transferHistoryCount(
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("allAccounts") boolean allAccounts,
        @Param("accountId") UUID accountId,
        @Param("employeeVisible") boolean employeeVisible,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds);
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

    String getCurrency();

    BigDecimal getExchangeRate();

    BigDecimal getTlAmount();

    UUID getCompanyId();

    UUID getSourceId();

    String getCreatedBy();

    Object getCreatedAt();

    Boolean getReversal();

    Boolean getReversed();

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
     * Süzgeçli fon listesi (12.2_TASARIM §2.3); boş süzgeç atlanır. Sıra ZTO BankIntroduction: tür,
     * hesap türü, banka adı, ad.
     */
    @Query(
        """
        select f from FundAccount f
        where (:companyId is null or f.companyId = :companyId)
          and (:allBranches = true or f.branchId in :branchIds)
          and (:kind is null or f.kind = :kind)
          and (:accountType is null or f.accountType = :accountType)
          and (:active is null or f.active = :active)
          and (:currency is null or f.currency = :currency)
        order by f.kind, f.accountType, f.bankName, f.name
        """)
    List<FundAccount> searchFiltered(
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("kind") FundKind kind,
        @Param("accountType") FundAccountType accountType,
        @Param("active") Boolean active,
        @Param("currency") String currency);

    default List<FundAccount> searchFiltered(
        BranchFilter filter,
        FundKind kind,
        FundAccountType accountType,
        Boolean active,
        String currency) {
      return searchFiltered(
          filter.companyId(),
          filter.allBranches(),
          filter.branchIds(),
          kind,
          accountType,
          active,
          currency);
    }

    /**
     * Hesap "kullanılmış" mı: hareketi, çeke atanmışlığı (hareket oluşmadan da), ödeme/tahsilatı,
     * araç gideri, banka ekstresi satırı, bir şirketin varsayılan hesabı olması, transfer (kaynak,
     * hedef ya da masraf fonu), şirketler arası virman ya da açılış belgesi. Silinmişler dahildir;
     * kullanılmış hesabın şirketi değiştirilemez.
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
                or exists (select 1 from fund_transfer
                           where source_fund_id = :id or target_fund_id = :id)
                or exists (select 1 from fund_transfer_cost where fund_account_id = :id)
                or exists (select 1 from intercompany_transfer
                           where from_fund_id = :id or to_fund_id = :id)
                or exists (select 1 from fund_opening where fund_account_id = :id)
            """,
        nativeQuery = true)
    boolean isUsed(@Param("id") UUID id);

    /**
     * Birden çok fonu kimlik sırasıyla kilitler (transfer ve virmanda karşılıklı iki istek
     * kilitlenmesin diye sıra sabittir; 12.2_TASARIM §3.10). Kilitlenen kimlikleri döner.
     */
    @Query(
        value = "select id from fund_account where id in (:ids) order by id for update",
        nativeQuery = true)
    List<UUID> lockAll(@Param("ids") Collection<UUID> ids);

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
            select t.id as "id", t.transaction_date as "transactionDate",
                   t.direction as "direction", t.amount as "amount",
                   t.description as "description", t.source_type as "sourceType",
                   t.currency as "currency", t.exchange_rate as "exchangeRate",
                   t.tl_amount as "tlAmount", t.company_id as "companyId",
                   t.source_id as "sourceId", t.created_by as "createdBy",
                   t.created_at as "createdAt",
                   (t.source_type = 'REVERSAL') as "reversal",
                   exists (select 1 from fund_transaction x
                           where x.source_type = 'REVERSAL' and x.source_id = t.id
                             and x.fund_account_id = t.fund_account_id and x.deleted = false)
                     as "reversed",
                   sum(case when t.direction = 'IN' then t.amount else -t.amount end)
                     over (order by t.transaction_date, t.created_at, t.id) as "runningBalance"
            from fund_transaction t
            where t.fund_account_id = :id and t.transaction_date between :from and :to
              and t.deleted = false
            order by t.transaction_date, t.created_at, t.id
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

    boolean existsByCode(String code);

    boolean existsByNameIgnoreCase(String name);

    boolean existsByNameIgnoreCaseAndIdNot(String name, UUID id);

    /** Kod girilmeyen yeni kalem için sıradaki numara ({@code MK-00001}; 12.7 §3.1). */
    @Query(value = "select nextval('expense_item_code_seq')", nativeQuery = true)
    long nextCode();

    /** Kalem bir ödeme, fon transfer masrafı ya da masrafta kullanılmış mı (12.7 §2.3). */
    @Query(
        value =
            """
            select exists(select 1 from settlement where expense_item_id = :id)
                or exists(select 1 from fund_transfer_cost where expense_item_id = :id)
                or exists(select 1 from expense where expense_item_id = :id)
            """,
        nativeQuery = true)
    boolean isInUse(@Param("id") UUID id);

    /**
     * Sistem dışı kalemin kodunu değiştirir (entity'de kod alanı değişmez; 12.7 §3.1). Bekleyen
     * değişiklikler önce yazılır, sonra bağlam temizlenir; çağıran kalemi yeniden okur.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(
        value = "update expense_item set code = :code where id = :id and is_system = false",
        nativeQuery = true)
    int updateCode(@Param("id") UUID id, @Param("code") String code);
  }

  public interface InstrumentRepository extends JpaRepository<Instrument, UUID> {

    /**
     * Aynı şirkette etkin (iptal/iade edilmemiş) aynı numaralı çek/senet var mı; {@code excludeId}
     * ({@code null} olabilir) düzenlenen ya da düzeltilen çektir (12.3 §3.3 #2).
     */
    @Query(value = "select exists(select 1" + ACTIVE_NUMBER_WHERE + ")", nativeQuery = true)
    boolean existsActiveNumber(
        @Param("companyId") UUID companyId,
        @Param("kind") String kind,
        @Param("direction") String direction,
        @Param("number") String number,
        @Param("bankName") String bankName,
        @Param("excludeId") UUID excludeId);

    /** {@link #existsActiveNumber} ile aynı koşulda çakışan çek (durumunu iletmek için). */
    @Query(value = "select i.*" + ACTIVE_NUMBER_WHERE + " limit 1", nativeQuery = true)
    Optional<Instrument> findActiveByNumber(
        @Param("companyId") UUID companyId,
        @Param("kind") String kind,
        @Param("direction") String direction,
        @Param("number") String number,
        @Param("bankName") String bankName,
        @Param("excludeId") UUID excludeId);

    /** Tür/yön enum'larıyla {@link #existsActiveNumber}. */
    default boolean existsActiveNumber(
        UUID companyId,
        InstrumentKind kind,
        InstrumentDirection direction,
        String number,
        String bankName,
        UUID excludeId) {
      return existsActiveNumber(
          companyId, kind.name(), direction.name(), number, bankName, excludeId);
    }

    /** Tür/yön enum'larıyla {@link #findActiveByNumber}. */
    default Optional<Instrument> findActiveByNumber(
        UUID companyId,
        InstrumentKind kind,
        InstrumentDirection direction,
        String number,
        String bankName,
        UUID excludeId) {
      return findActiveByNumber(
          companyId, kind.name(), direction.name(), number, bankName, excludeId);
    }

    /** Yaprağa bağlı çekler (iptal edilmişler dahil; etkin olan en çok bir tane). */
    List<Instrument> findByCheckLeafIdAndDeletedFalse(UUID checkLeafId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from Instrument i where i.id = :id")
    Optional<Instrument> findForUpdate(@Param("id") UUID id);
  }

  /** Çek/senet numara tekilliği koşulu (V37 {@code instrument_number_uq} ile aynı). */
  private static final String ACTIVE_NUMBER_WHERE =
      """
       from instrument i
      where i.company_id = :companyId and i.kind = :kind and i.direction = :direction
        and i.number = :number and coalesce(i.bank_name, '') = coalesce(:bankName, '')
        and i.deleted = false and i.status not in ('CANCELLED', 'RETURNED')
        and (cast(:excludeId as uuid) is null or i.id <> cast(:excludeId as uuid))
      """;

  public interface InstrumentMovementRepository extends JpaRepository<InstrumentMovement, UUID> {

    List<InstrumentMovement> findByInstrumentIdAndDeletedFalseOrderByCreatedAt(UUID instrumentId);
  }

  public interface SettlementRepository extends JpaRepository<Settlement, UUID> {

    Optional<Settlement> findByIdempotencyKey(String idempotencyKey);

    /** İptal ile döviz bozumu kaynağı kullanımı yarışmasın diye satır kilidi (§3.10). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from Settlement s where s.id = :id")
    Optional<Settlement> findForUpdate(@Param("id") UUID id);

    /** Bu kaydı düzelten yeni kayıt (bir kayıt en çok bir kez düzeltilir; V35). */
    Optional<Settlement> findByCorrectsSettlementId(UUID correctsSettlementId);

    /**
     * Çeki doğuran köken kayıt: alınan çekte tahsilat, verilen çekte ödeme (iptal edilmişler dahil,
     * en eski; 12.3 §0.1). Ciro kayıtları ({@code PAYMENT + RECEIVED}) dönmez.
     */
    @Query(
        value =
            """
            select s.* from settlement s join instrument i on i.id = s.instrument_id
            where s.instrument_id = :id and s.deleted = false
              and ((s.type = 'COLLECTION' and i.direction = 'RECEIVED')
                or (s.type = 'PAYMENT' and i.direction = 'ISSUED'))
            order by s.created_at limit 1
            """,
        nativeQuery = true)
    Optional<Settlement> findOriginByInstrumentId(@Param("id") UUID instrumentId);

    /** Settlement silinmemiş bir araç giderine bağlı mı (kullanıcı iptalini engeller; §3.5). */
    @Query(
        value =
            """
            select exists(select 1 from vehicle_expense v
                          where v.settlement_id = :id and v.deleted = false)
            """,
        nativeQuery = true)
    boolean existsVehicleExpenseLink(@Param("id") UUID id);

    /** Settlement silinmemiş bir genel masrafa bağlı mı (kullanıcı iptalini engeller; 12.7 F1). */
    @Query(
        value =
            """
            select exists(select 1 from expense e
                          where e.settlement_id = :id and e.deleted = false)
            """,
        nativeQuery = true)
    boolean existsExpenseLink(@Param("id") UUID id);

    /**
     * Settlement'ın cari satırı cari taşımayla başka cariye taşınmış mı (aktif taşıma satırı; iptal
     * ve düzeltme erken 409 {@code TRANSACTION_TRANSFERRED}, 12.2a Rev 1 F-2).
     */
    @Query(
        value =
            """
            select exists(select 1 from account_transaction t
                          join account_transfer_line l on l.account_transaction_id = t.id
                                                      and l.active and l.deleted = false
                          where t.source_type = 'SETTLEMENT' and t.source_id = :id)
            """,
        nativeQuery = true)
    boolean isTransferred(@Param("id") UUID id);
  }

  /**
   * Bilgi amaçlı fatura eşleştirmeleri (V36). Satırlar değişmez; sorgular {@code deleted = false}
   * süzgecini açıkça yazar (entity'de {@code @SQLRestriction} yok).
   */
  public interface SettlementAllocationRepository
      extends JpaRepository<SettlementAllocation, UUID> {

    List<SettlementAllocation> findBySettlementIdAndDeletedFalse(UUID settlementId);

    /**
     * Eşleştirme hedefinin işlem sonuna kadar süren danışma kilidi (12.2a §3.3 adım 4; anahtar şema
     * adını içerir). Çağıran hedefleri kimlik sırasıyla kilitler.
     */
    @Query(
        value =
            "select count(*) from (select pg_advisory_xact_lock("
                + "hashtext(current_schema() || ':alloc:' || :key))) x",
        nativeQuery = true)
    long lockTarget(@Param("key") String key);

    /**
     * Eşleştirme hedefleri (beş belge türü, silinmemiş): taraf, açıklık ve toplam formülünün ham
     * alanları. Alış/navlun/depo/açılış faturasında {@code reflected = true}, {@code ledgerAmount}
     * = fatura toplamı; cari belgesinde {@code counts_as_invoice} türü değilse {@code invoiceType =
     * false}.
     */
    @Query(
        value =
            """
            select 'PURCHASE_INVOICE' as "targetType", p.id as "id", p.account_id as "accountId",
                   p.company_id as "companyId", p.branch_id as "branchId", p.currency as "currency",
                   'PAYABLE' as "side", (p.status = 'OPEN') as "open", true as "invoiceType",
                   true as "reflected", p.total_amount as "ledgerAmount",
                   cast(null as numeric) as "netPayable", p.total_amount as "amount"
            from purchase_invoice p
            where p.id in (:ids) and p.deleted = false
            union all
            select 'FREIGHT_INVOICE', f.id, f.account_id, f.company_id, f.branch_id, f.currency,
                   'RECEIVABLE', (f.status = 'ISSUED'), true, true, f.total_amount,
                   cast(null as numeric), f.total_amount
            from freight_invoice f
            where f.id in (:ids) and f.deleted = false
            union all
            select 'WAREHOUSE_INVOICE', w.id, w.account_id, w.company_id, w.branch_id, w.currency,
                   'RECEIVABLE', (w.status = 'ISSUED'), true, true, w.total_amount,
                   cast(null as numeric), w.total_amount
            from warehouse_invoice w
            where w.id in (:ids) and w.deleted = false
            union all
            select 'OPENING_INVOICE', o.id, o.account_id, o.company_id, o.branch_id, o.currency,
                   o.kind, (o.status = 'OPEN'), true, true, o.total_amount,
                   cast(null as numeric), o.total_amount
            from opening_invoice o
            where o.id in (:ids) and o.deleted = false
            union all
            select 'ACCOUNT_DOCUMENT', d.id, d.account_id, d.company_id, d.branch_id, d.currency,
                   d.side, (d.status = 'OPEN'), ty.counts_as_invoice, d.reflect_to_ledger,
                   d.ledger_amount, x.net_payable, d.amount
            from account_document d
            join account_document_type ty on ty.side = d.side and ty.code = d.document_type
            left join account_document_tax x on x.document_id = d.id and x.deleted = false
            where d.id in (:ids) and d.deleted = false
            """,
        nativeQuery = true)
    List<AllocationTargetRow> targets(@Param("ids") Collection<UUID> ids);

    /**
     * Hedef başına "eşleşen" toplam (12.2a §3.3, Rev 1 F-3): geçerli eşleşmeler (satır silinmemiş,
     * settlement POSTED; {@code excludedSettlementId} hariç) + faturaya plan üzerinden bağlı POSTED
     * plan ödemeleri (alış faturasında {@code payment_plan.purchase_invoice_id}, açılış faturasında
     * {@code opening_invoice.payment_plan_id}). Toplamı olmayan hedef dönmez.
     */
    @Query(
        value =
            """
            select u.target_id as "targetId", sum(u.amount) as "allocated"
            from (
              select coalesce(a.purchase_invoice_id, a.freight_invoice_id, a.warehouse_invoice_id,
                              a.opening_invoice_id, a.account_document_id) as target_id,
                     a.amount as amount
              from settlement_allocation a
              join settlement s on s.id = a.settlement_id
              where a.deleted = false and s.deleted = false and s.status = 'POSTED'
                and s.id <> :excludedSettlementId
                and coalesce(a.purchase_invoice_id, a.freight_invoice_id, a.warehouse_invoice_id,
                             a.opening_invoice_id, a.account_document_id) in (:ids)
              union all
              select pp.purchase_invoice_id, s.amount
              from settlement s
              join payment_plan pp on pp.id = s.plan_id
              where s.deleted = false and s.status = 'POSTED' and pp.purchase_invoice_id in (:ids)
              union all
              select o.id, s.amount
              from settlement s
              join opening_invoice o on o.payment_plan_id = s.plan_id
              where s.deleted = false and s.status = 'POSTED' and o.id in (:ids)
            ) u
            group by u.target_id
            """,
        nativeQuery = true)
    List<AllocatedTotalRow> allocatedTotals(
        @Param("ids") Collection<UUID> ids,
        @Param("excludedSettlementId") UUID excludedSettlementId);
  }

  /** {@link SettlementAllocationRepository#targets} satırı. */
  public interface AllocationTargetRow {
    String getTargetType();

    UUID getId();

    UUID getAccountId();

    UUID getCompanyId();

    UUID getBranchId();

    String getCurrency();

    String getSide();

    Boolean getOpen();

    Boolean getInvoiceType();

    Boolean getReflected();

    BigDecimal getLedgerAmount();

    BigDecimal getNetPayable();

    BigDecimal getAmount();
  }

  /** {@link SettlementAllocationRepository#allocatedTotals} satırı. */
  public interface AllocatedTotalRow {
    UUID getTargetId();

    BigDecimal getAllocated();
  }

  /** Çek koçanları (V38). Okuma sorguları {@code InstrumentQueryRepository}'de (B3). */
  public interface CheckBookRepository extends JpaRepository<CheckBook, UUID> {

    boolean existsByFundAccountIdAndSerialNoAndDeletedFalse(UUID fundAccountId, String serialNo);
  }

  /** Çek koçanı yaprakları (V38). */
  public interface CheckLeafRepository extends JpaRepository<CheckLeaf, UUID> {

    /** Yaprak kullanımı/serbest bırakması ile iptal yarışmasın diye satır kilidi. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select l from CheckLeaf l where l.id = :id")
    Optional<CheckLeaf> findForUpdate(@Param("id") UUID id);

    Optional<CheckLeaf> findByFundAccountIdAndNumberAndDeletedFalse(
        UUID fundAccountId, String number);

    /** Fonun silinmemiş yaprak numaraları (koçan oluştururken atlananlar). */
    @Query("select l.number from CheckLeaf l where l.fundAccountId = :fundId and l.deleted = false")
    Set<String> findNumbersByFundAccountId(@Param("fundId") UUID fundAccountId);
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

    /**
     * Plan listesi (12.2a §3.9): {@code allStatuses = false} iken yalnız {@code statuses}; {@code
     * accountId} {@code null} ise tüm cariler.
     */
    @Query(
        """
        select p from PaymentPlan p
        where (:allStatuses = true or p.status in :statuses)
          and (:accountId is null or p.accountId = :accountId)
          and (:companyId is null or p.companyId = :companyId)
          and (:allBranches = true or p.branchId in :branchIds)
        """)
    Page<PaymentPlan> search(
        @Param("allStatuses") boolean allStatuses,
        @Param("statuses") Collection<PlanStatus> statuses,
        @Param("accountId") UUID accountId,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        Pageable pageable);

    /** Durum kümesi (boş = hepsi) ve cariyle. */
    default Page<PaymentPlan> search(
        Collection<PlanStatus> statuses, UUID accountId, BranchFilter filter, Pageable pageable) {
      boolean all = statuses == null || statuses.isEmpty();
      return search(
          all,
          all ? List.of(PlanStatus.DRAFT) : statuses,
          accountId,
          filter.companyId(),
          filter.allBranches(),
          filter.branchIds(),
          pageable);
    }

    default Page<PaymentPlan> search(PlanStatus status, BranchFilter filter, Pageable pageable) {
      return search(status == null ? List.of() : List.of(status), null, filter, pageable);
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

    /** Kartlar için açık plan özeti; sayfa başına tek sorgu (cari × para birimi satırları). */
    @Query(
        value =
            """
            select p.account_id as "accountId", p.currency as "currency",
                   min(p.due_date) as "nextDueDate",
                   count(*) filter (where p.due_date < :today) as "overdueCount",
                   count(*) filter (where p.due_date = :today) as "dueTodayCount",
                   count(*) filter (where p.status = 'DRAFT') as "draftCount",
                   count(*) filter (where p.status = 'PENDING') as "pendingCount",
                   count(*) filter (where p.status = 'APPROVED') as "approvedCount",
                   coalesce(sum(p.amount), 0) as "planned"
            from payment_plan p
            where p.account_id in (:accountIds) and p.deleted = false
              and p.status in ('DRAFT', 'PENDING', 'APPROVED')
              and (:allCompanies = true or p.company_id = :companyId)
              and (:allBranches = true or p.branch_id in (:branchIds))
            group by p.account_id, p.currency
            order by p.currency
            """,
        nativeQuery = true)
    List<PlanSummaryRow> planSummaries(
        @Param("accountIds") Collection<UUID> accountIds,
        @Param("today") LocalDate today,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds);

    default List<PlanSummaryRow> planSummaries(
        Collection<UUID> accountIds, LocalDate today, BranchFilter filter) {
      return planSummaries(
          accountIds,
          today,
          filter.companyId() == null,
          companyOrNone(filter),
          filter.allBranches(),
          filter.branchIds());
    }
  }

  public interface PaymentPlanEventRepository extends JpaRepository<PaymentPlanEvent, UUID> {

    List<PaymentPlanEvent> findByPlanIdOrderByCreatedAt(UUID planId);
  }

  public interface DensityThresholdRepository extends JpaRepository<DensityThreshold, String> {}

  public interface FinanceSettingsRepository extends JpaRepository<FinanceSettings, Integer> {}
}
