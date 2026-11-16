package org.ece.blackrose.finance.repository;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.finance.domain.Expense;
import org.ece.blackrose.finance.domain.ExpenseLine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Tek masraf modeli depoları (12.7_TASARIM §2.3, §3.2.6). */
public final class ExpenseRepositories {

  private ExpenseRepositories() {}

  public interface ExpenseRepository extends JpaRepository<Expense, UUID> {

    /** Idempotency anahtarına göre masraf; ters çevrilmiş (silinmiş) dahil. */
    @Query(value = "select * from expense where idempotency_key = :key", nativeQuery = true)
    Optional<Expense> findByIdempotencyKey(@Param("key") String key);

    /** Silinmiş/ters çevrilmiş dahil. */
    @Query(value = "select * from expense where id = :id", nativeQuery = true)
    Optional<Expense> findAnyById(@Param("id") UUID id);

    /** Satırı kilitler; silinmiş/ters çevrilmiş dahil (kilit sırası §3.2.5). */
    @Query(value = "select * from expense where id = :id for update", nativeQuery = true)
    Optional<Expense> lockById(@Param("id") UUID id);

    /**
     * Sefer bağlamlı kayıtlı masrafların KDV hariç net TL tutarı (12.8 OK-12.8-12; sefer
     * kârlılığı). Çağıran boş listede çağırmaz. Satır: [shipment_id, tutar].
     */
    @Query(
        value =
            """
            select e.shipment_id, sum(round(e.net_amount * e.exchange_rate, 2)) from expense e
            where e.shipment_id in (:ids) and e.status = 'POSTED' and e.deleted = false
            group by e.shipment_id
            """,
        nativeQuery = true)
    List<Object[]> netTlByShipment(@Param("ids") Collection<UUID> shipmentIds);

    /**
     * Araç bağlamlı kayıtlı masrafların dönemdeki KDV hariç net TL tutarı (12.8 OK-12.8-12; araç
     * maliyeti). {@code allBranches} false ise yalnız verilen iş yerleri. Satır: [vehicle_id,
     * tutar].
     */
    @Query(
        value =
            """
            select e.vehicle_id, sum(round(e.net_amount * e.exchange_rate, 2)) from expense e
            where e.vehicle_id is not null and e.status = 'POSTED' and e.deleted = false
              and e.invoice_date between :from and :to
              and (:allBranches = true or e.branch_id in (:branchIds))
            group by e.vehicle_id
            """,
        nativeQuery = true)
    List<Object[]> netTlByVehicle(
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds);
  }

  public interface ExpenseLineRepository extends JpaRepository<ExpenseLine, UUID> {

    /**
     * Masrafın satırları. Satırlar başlıkla birlikte silinmez (başlık REVERSED + deleted olur), bu
     * yüzden ters çevrilmiş masrafın satırları da döner.
     */
    List<ExpenseLine> findByExpenseIdOrderByLineNo(UUID expenseId);
  }

  /**
   * Masraf okuma sorguları (12.7 §3.2.6; native). Hepsi silinmemiş ({@code e.deleted = false})
   * kayıtlarla, şirket ve iş yeri süzgeciyle çalışır. Tarih süzgeci verilmezse çağıran geniş bir
   * aralık geçirir (null tarih tür çıkarımı sorununa girmemek için).
   */
  public interface ExpenseQueryRepository extends Repository<Expense, UUID> {

    /** Ad, tür, iş yeri, tedarikçi ve bağlam etiketi birleşimleri. */
    String FROM =
        """
         from expense e
         left join expense_item i on i.id = e.expense_item_id
         left join expense_type ty on ty.id = i.expense_type_id
         join branch b on b.id = e.branch_id
         left join account sa on sa.id = e.supplier_account_id
         left join vehicle v on v.id = e.vehicle_id
         left join shipment sh on sh.id = e.shipment_id
         left join warehouse w on w.id = e.warehouse_id
         left join driver d on d.id = e.driver_id
        """;

    String CONTEXT_LABEL = " coalesce(v.plate, sh.number, w.name, d.full_name) ";

    /** Şirket, iş yeri ve tarih süzgeci. */
    String SCOPE_WHERE =
        " where e.deleted = false"
            + " and (:allCompanies = true or e.company_id = :companyId)"
            + " and (:allBranches = true or e.branch_id in (:branchIds))"
            + " and e.invoice_date between :from and :to ";

    /** Liste süzgeci (kalem ve para birimi). */
    String LIST_WHERE =
        SCOPE_WHERE
            + " and (:allItems = true or e.expense_item_id = :itemId)"
            + " and (:currency = '' or e.currency = :currency) ";

    @Query(
        value =
            "select e.id as \"id\", e.invoice_number as \"invoiceNumber\","
                + " e.description as \"description\", e.expense_item_id as \"expenseItemId\","
                + " i.name as \"expenseItemName\", ty.name as \"expenseTypeName\","
                + " e.department as \"department\", e.company_id as \"companyId\","
                + " e.branch_id as \"branchId\", b.name as \"branchName\","
                + " e.context_type as \"contextType\","
                + CONTEXT_LABEL
                + " as \"contextLabel\", e.payment_method as \"paymentMethod\","
                + " sa.name as \"supplierName\", e.currency as \"currency\","
                + " e.total_amount as \"totalAmount\", e.tl_amount as \"tlAmount\","
                + " e.invoice_date as \"invoiceDate\", e.due_date as \"dueDate\","
                + " e.document_type as \"documentType\","
                + " exists(select 1 from stored_file f where f.owner_type = 'EXPENSE'"
                + " and f.owner_id = e.id and f.deleted = false) as \"hasDocument\","
                + " e.created_at as \"createdAt\""
                + FROM
                + LIST_WHERE
                + " order by e.invoice_date desc, e.created_at desc, e.id"
                + " limit :limit offset :offset",
        nativeQuery = true)
    @SuppressWarnings("java:S107")
    List<ExpenseListRow> rows(
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("allItems") boolean allItems,
        @Param("itemId") UUID itemId,
        @Param("currency") String currency,
        @Param("limit") int limit,
        @Param("offset") long offset);

    @Query(value = "select count(*) from expense e" + LIST_WHERE, nativeQuery = true)
    @SuppressWarnings("java:S107")
    long count(
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("allItems") boolean allItems,
        @Param("itemId") UUID itemId,
        @Param("currency") String currency);

    /** Kalem başına sayı, son tarih ve iş yeri adları ({@code chr(31)} ayraçlı). */
    @Query(
        value =
            "select e.expense_item_id as \"expenseItemId\", i.name as \"expenseItemName\","
                + " i.code as \"expenseItemCode\", ty.name as \"expenseTypeName\","
                + " count(*) as \"invoiceCount\", max(e.invoice_date) as \"lastInvoiceDate\","
                + " string_agg(distinct b.name, chr(31)) as \"branchNames\""
                + FROM
                + SCOPE_WHERE
                + " group by e.expense_item_id, i.name, i.code, ty.name"
                + " order by i.name, e.expense_item_id",
        nativeQuery = true)
    List<ExpenseItemSummaryRow> itemSummary(
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to);

    /** Kalem × para birimi sayı ve toplamı. */
    @Query(
        value =
            "select e.expense_item_id as \"expenseItemId\", e.currency as \"currency\","
                + " count(*) as \"count\", sum(e.total_amount) as \"totalAmount\""
                + " from expense e"
                + SCOPE_WHERE
                + " group by e.expense_item_id, e.currency order by e.currency",
        nativeQuery = true)
    List<ExpenseItemCurrencyRow> itemCurrencyTotals(
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to);

    /**
     * Kalem başına son Cari masrafın tedarikçisi ({@code invoice_date desc, created_at desc}).
     * VKN/TCKN yalnız maskeli döner.
     */
    @Query(
        value =
            "select distinct on (e.expense_item_id) e.expense_item_id as \"expenseItemId\","
                + " a.id as \"accountId\", a.name as \"name\","
                + " a.tax_number_masked as \"taxNumberMasked\", a.phone as \"phone\","
                + " a.city as \"city\""
                + " from expense e join account a on a.id = e.supplier_account_id"
                + SCOPE_WHERE
                + " and e.payment_method = 'ACCOUNT'"
                + " order by e.expense_item_id, e.invoice_date desc, e.created_at desc",
        nativeQuery = true)
    List<ExpenseSupplierRow> lastSuppliers(
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to);

    /** Para birimi başına sayı ve net/KDV/iskonto/toplam (tüm zamanlar için geniş aralıkla). */
    @Query(
        value =
            "select e.currency as \"currency\", count(*) as \"count\","
                + " sum(e.net_amount) as \"netAmount\", sum(e.vat_amount) as \"vatAmount\","
                + " sum(e.discount_amount) as \"discountAmount\","
                + " sum(e.total_amount) as \"totalAmount\""
                + " from expense e"
                + SCOPE_WHERE
                + " group by e.currency order by e.currency",
        nativeQuery = true)
    List<ExpenseCurrencySumRow> currencyTotals(
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to);

    /** Ay × masraf türü TL toplamı. */
    @Query(
        value =
            "select to_char(e.invoice_date, 'YYYY-MM') as \"month\","
                + " ty.id as \"expenseTypeId\", ty.name as \"expenseTypeName\","
                + " sum(e.tl_amount) as \"tlAmount\""
                + FROM
                + SCOPE_WHERE
                + " group by 1, ty.id, ty.name order by 1, ty.name",
        nativeQuery = true)
    List<ExpenseMonthlyRow> monthly(
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to);

    /** Detay adları (silinmiş/ters çevrilmiş dahil). */
    @Query(
        value =
            "select b.name as \"branchName\", i.name as \"expenseItemName\","
                + " ty.name as \"expenseTypeName\","
                + CONTEXT_LABEL
                + " as \"contextLabel\", sa.name as \"supplierName\""
                + FROM
                + " where e.id = :id",
        nativeQuery = true)
    Optional<ExpenseHeaderRow> header(@Param("id") UUID id);

    /** Bağlam seçenekleri: araç (plaka); şirket süzgeci şubesiz kayıtları da kapsar. */
    @Query(
        value =
            "select v.id as \"id\", v.plate as \"label\", v.branch_id as \"branchId\""
                + " from vehicle v left join branch b on b.id = v.branch_id"
                + " where v.deleted = false and (:q = '' or v.plate ilike :q escape '\\')"
                + " and (:allCompanies = true or v.branch_id is null or b.company_id = :companyId)"
                + " order by v.plate limit 20",
        nativeQuery = true)
    List<ExpenseOptionRow> vehicleOptions(
        @Param("q") String q,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId);

    /** Bağlam seçenekleri: sefer (numara; son 365 gün, iptal hariç). */
    @Query(
        value =
            "select s.id as \"id\", s.number as \"label\", s.branch_id as \"branchId\""
                + " from shipment s left join branch b on b.id = s.branch_id"
                + " where s.deleted = false and s.status <> 'CANCELLED'"
                + " and s.created_at >= :since"
                + " and (:q = '' or s.number ilike :q escape '\\')"
                + " and (:allCompanies = true or s.branch_id is null or b.company_id = :companyId)"
                + " order by s.created_at desc limit 20",
        nativeQuery = true)
    List<ExpenseOptionRow> shipmentOptions(
        @Param("q") String q,
        @Param("since") Instant since,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId);

    /** Bağlam seçenekleri: depo (ad). */
    @Query(
        value =
            "select w.id as \"id\", w.name as \"label\", w.branch_id as \"branchId\""
                + " from warehouse w left join branch b on b.id = w.branch_id"
                + " where w.deleted = false and (:q = '' or w.name ilike :q escape '\\')"
                + " and (:allCompanies = true or w.branch_id is null or b.company_id = :companyId)"
                + " order by w.name limit 20",
        nativeQuery = true)
    List<ExpenseOptionRow> warehouseOptions(
        @Param("q") String q,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId);

    /** Bağlam seçenekleri: sürücü (yalnız ad; telefon yok). */
    @Query(
        value =
            "select d.id as \"id\", d.full_name as \"label\", d.branch_id as \"branchId\""
                + " from driver d left join branch b on b.id = d.branch_id"
                + " where d.deleted = false and (:q = '' or d.full_name ilike :q escape '\\')"
                + " and (:allCompanies = true or d.branch_id is null or b.company_id = :companyId)"
                + " order by d.full_name limit 20",
        nativeQuery = true)
    List<ExpenseOptionRow> driverOptions(
        @Param("q") String q,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId);

    /** Bağlam kaydı (silinmemiş araç) ve iş yeri; şirket uyumu denetimi için. */
    @Query(
        value =
            "select v.id as \"id\", v.plate as \"label\", v.branch_id as \"branchId\""
                + " from vehicle v where v.id = :id and v.deleted = false",
        nativeQuery = true)
    Optional<ExpenseOptionRow> vehicle(@Param("id") UUID id);

    @Query(
        value =
            "select s.id as \"id\", s.number as \"label\", s.branch_id as \"branchId\""
                + " from shipment s where s.id = :id and s.deleted = false",
        nativeQuery = true)
    Optional<ExpenseOptionRow> shipment(@Param("id") UUID id);

    @Query(
        value =
            "select w.id as \"id\", w.name as \"label\", w.branch_id as \"branchId\""
                + " from warehouse w where w.id = :id and w.deleted = false",
        nativeQuery = true)
    Optional<ExpenseOptionRow> warehouse(@Param("id") UUID id);

    @Query(
        value =
            "select d.id as \"id\", d.full_name as \"label\", d.branch_id as \"branchId\""
                + " from driver d where d.id = :id and d.deleted = false",
        nativeQuery = true)
    Optional<ExpenseOptionRow> driver(@Param("id") UUID id);
  }

  /** {@link ExpenseQueryRepository#rows} satırı. */
  public interface ExpenseListRow {
    UUID getId();

    String getInvoiceNumber();

    String getDescription();

    UUID getExpenseItemId();

    String getExpenseItemName();

    String getExpenseTypeName();

    String getDepartment();

    UUID getCompanyId();

    UUID getBranchId();

    String getBranchName();

    String getContextType();

    String getContextLabel();

    String getPaymentMethod();

    String getSupplierName();

    String getCurrency();

    BigDecimal getTotalAmount();

    BigDecimal getTlAmount();

    LocalDate getInvoiceDate();

    LocalDate getDueDate();

    String getDocumentType();

    Boolean getHasDocument();

    Instant getCreatedAt();
  }

  public interface ExpenseItemSummaryRow {
    UUID getExpenseItemId();

    String getExpenseItemName();

    String getExpenseItemCode();

    String getExpenseTypeName();

    long getInvoiceCount();

    LocalDate getLastInvoiceDate();

    String getBranchNames();
  }

  public interface ExpenseItemCurrencyRow {
    UUID getExpenseItemId();

    String getCurrency();

    long getCount();

    BigDecimal getTotalAmount();
  }

  public interface ExpenseSupplierRow {
    UUID getExpenseItemId();

    UUID getAccountId();

    String getName();

    String getTaxNumberMasked();

    String getPhone();

    String getCity();
  }

  public interface ExpenseCurrencySumRow {
    String getCurrency();

    long getCount();

    BigDecimal getNetAmount();

    BigDecimal getVatAmount();

    BigDecimal getDiscountAmount();

    BigDecimal getTotalAmount();
  }

  public interface ExpenseMonthlyRow {
    String getMonth();

    UUID getExpenseTypeId();

    String getExpenseTypeName();

    BigDecimal getTlAmount();
  }

  public interface ExpenseHeaderRow {
    String getBranchName();

    String getExpenseItemName();

    String getExpenseTypeName();

    String getContextLabel();

    String getSupplierName();
  }

  public interface ExpenseOptionRow {
    UUID getId();

    String getLabel();

    UUID getBranchId();
  }
}
