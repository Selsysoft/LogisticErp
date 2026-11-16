package org.ece.blackrose.finance.repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.finance.domain.CheckBook;
import org.ece.blackrose.finance.domain.Instrument;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Çek/senet ve koçan okuma sorguları (12.3_TASARIM §2.3; native SQL + arayüz projeksiyonu, {@link
 * SettlementQueryRepository} deseni). Koçan ve yaprak sorguları {@link CheckBookQueryRepository} iç
 * arayüzündedir (B3); çek/senet liste, tekil satır ve hareket sorguları {@link
 * InstrumentListQueryRepository} iç arayüzündedir (B4, §3.9).
 */
public final class InstrumentQueryRepository {

  private InstrumentQueryRepository() {}

  /**
   * Çek koçanları ve yaprakları (12.3 §3.6, §4.2). Süzgeçlerde {@code allX = true} ise ilgili
   * kimlik parametresi yok sayılır (null yerine {@code BranchFilter.NONE} gönderilir). Kapsam
   * koçanın iş yerine ({@code check_book.branch_id}) uygulanır.
   */
  public interface CheckBookQueryRepository extends Repository<CheckBook, UUID> {

    /** {@link CheckBookRow} kolonları ({@link #BOOK_FROM} gerekir). */
    String BOOK_COLUMNS =
        """
         cb.id as "id", cb.company_id as "companyId", cb.branch_id as "branchId",
         b.name as "branchName", cb.fund_account_id as "fundAccountId", f.name as "fundName",
         f.bank_name as "fundBankName", cb.serial_no as "serialNo", cb.bank_code as "bankCode",
         cb.branch_code as "branchCode", cb.start_number as "startNumber",
         cb.end_number as "endNumber", cb.leaf_count as "leafCount",
         count(l.id) filter (where l.status = 'UNUSED') as "unusedCount",
         count(l.id) filter (where l.status = 'USED') as "usedCount",
         count(l.id) filter (where l.status = 'VOID') as "voidCount",
         cb.created_at as "createdAt"
        """;

    String BOOK_FROM =
        """
         from check_book cb
         join branch b on b.id = cb.branch_id
         join fund_account f on f.id = cb.fund_account_id
         left join check_leaf l on l.check_book_id = cb.id and l.deleted = false
        """;

    String BOOK_GROUP = " group by cb.id, b.name, f.name, f.bank_name ";

    /** {@link CheckLeafRow} kolonları ({@link #LEAF_FROM} gerekir). */
    String LEAF_COLUMNS =
        """
         l.id as "id", l.check_book_id as "checkBookId", cb.serial_no as "checkBookSerial",
         l.leaf_no as "leafNo", l.number as "number", l.micr_code as "micrCode",
         l.status as "status", l.used_date as "usedDate", l.void_reason as "voidReason",
         l.fund_account_id as "fundAccountId", f.name as "fundName",
         f.bank_name as "fundBankName", f.bank_branch_name as "fundBankBranchName",
         f.iban as "fundIban", cb.branch_id as "branchId", b.name as "branchName",
         l.company_id as "companyId", ins.id as "instrumentId", ins.status as "instrumentStatus"
        """;

    /** Yaprağı gösteren etkin (iptal edilmemiş) çek, yoksa en son çek. */
    String LEAF_FROM =
        """
         from check_leaf l
         join check_book cb on cb.id = l.check_book_id
         join branch b on b.id = cb.branch_id
         join fund_account f on f.id = l.fund_account_id
         left join lateral (
           select i.id, i.status from instrument i
           where i.check_leaf_id = l.id and i.deleted = false
           order by (i.status <> 'CANCELLED') desc, i.created_at desc, i.id
           limit 1) ins on true
        """;

    String SCOPE =
        " and (:allCompanies = true or cb.company_id = :companyId)"
            + " and (:allBranches = true or cb.branch_id in (:branchIds))"
            + " and (:allFunds = true or cb.fund_account_id = :fundId) ";

    String LEAF_WHERE =
        " where l.deleted = false and cb.deleted = false"
            + SCOPE
            + " and (:allBooks = true or l.check_book_id = :bookId)"
            + " and (:status = '' or l.status = :status)"
            + " and (:serial = '' or cb.serial_no ilike :serial escape '\\') ";

    @Query(
        value =
            "select"
                + BOOK_COLUMNS
                + BOOK_FROM
                + " where cb.deleted = false"
                + SCOPE
                + BOOK_GROUP
                + " order by cb.created_at desc, cb.serial_no, cb.id",
        nativeQuery = true)
    List<CheckBookRow> books(
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("allFunds") boolean allFunds,
        @Param("fundId") UUID fundId);

    @Query(
        value =
            "select"
                + BOOK_COLUMNS
                + BOOK_FROM
                + " where cb.id = :id and cb.deleted = false"
                + BOOK_GROUP,
        nativeQuery = true)
    Optional<CheckBookRow> book(@Param("id") UUID id);

    @Query(
        value =
            "select"
                + LEAF_COLUMNS
                + LEAF_FROM
                + LEAF_WHERE
                + " order by cb.serial_no, l.leaf_no, l.id limit :limit offset :offset",
        nativeQuery = true)
    List<CheckLeafRow> leaves(
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("allFunds") boolean allFunds,
        @Param("fundId") UUID fundId,
        @Param("allBooks") boolean allBooks,
        @Param("bookId") UUID bookId,
        @Param("status") String status,
        @Param("serial") String serial,
        @Param("limit") int limit,
        @Param("offset") long offset);

    @Query(
        value =
            "select count(*) from check_leaf l join check_book cb on cb.id = l.check_book_id"
                + LEAF_WHERE,
        nativeQuery = true)
    long countLeaves(
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("allFunds") boolean allFunds,
        @Param("fundId") UUID fundId,
        @Param("allBooks") boolean allBooks,
        @Param("bookId") UUID bookId,
        @Param("status") String status,
        @Param("serial") String serial);

    /** Numara önekiyle en çok 5 yaprak (baştaki sıfırlar korunur; {@code :prefix} yalnız rakam). */
    @Query(
        value =
            "select"
                + LEAF_COLUMNS
                + LEAF_FROM
                + " where l.deleted = false and cb.deleted = false"
                + SCOPE
                + " and l.number like :prefix || '%'"
                + " order by l.number, cb.serial_no, l.id limit 5",
        nativeQuery = true)
    List<CheckLeafRow> lookup(
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("allFunds") boolean allFunds,
        @Param("fundId") UUID fundId,
        @Param("prefix") String prefix);

    @Query(value = "select" + LEAF_COLUMNS + LEAF_FROM + " where l.id = :id", nativeQuery = true)
    Optional<CheckLeafRow> leaf(@Param("id") UUID id);
  }

  /**
   * Çek/senet okuma (12.3 §3.9). Personel carisi izinsiz kullanıcıda cari, keşideci ve açıklama
   * alanları {@code null} ({@code employeeMasked = true}); ciro edilen personel carisinin alanları
   * da maskelenir. Boş süzgeçler bayrak ({@code allX}) ya da boş metinle kapatılır; {@code :q}
   * kaçışlanmış {@code %metin%} desenidir ve maskeli alanlarla eşleşmez.
   */
  public interface InstrumentListQueryRepository extends Repository<Instrument, UUID> {

    /** Bağlı cari bu kullanıcıya görünür mü (carisiz satır her zaman görünür). */
    String VISIBLE = " (:employeeVisible = true or a.type is null or a.type <> 'EMPLOYEE') ";

    /** Ciro edilen cari bu kullanıcıya görünür mü. */
    String ENDORSED_VISIBLE =
        " (:employeeVisible = true or ea.type is null or ea.type <> 'EMPLOYEE') ";

    /** {@link InstrumentItemRow} kolonları ({@link #ITEM_FROM} gerekir). */
    String ITEM_COLUMNS =
        """
         i.id as "id", i.kind as "kind", i.direction as "direction", i.number as "number",
         i.bank_name as "bankName", i.bank_branch as "bankBranch", i.issue_date as "issueDate",
         i.due_date as "dueDate", i.amount as "amount", i.currency as "currency",
         i.status as "status",
        """
            + " case when"
            + VISIBLE
            + "then a.id end as \"accountId\", case when"
            + VISIBLE
            + "then a.code end as \"accountCode\", case when"
            + VISIBLE
            + "then a.name end as \"accountName\", a.type as \"accountType\","
            + " coalesce(a.type = 'EMPLOYEE' and :employeeVisible = false, false)"
            + " as \"employeeMasked\", case when"
            + ENDORSED_VISIBLE
            + "then i.endorsed_account_id end as \"endorsedAccountId\", case when"
            + ENDORSED_VISIBLE
            + "then ea.name end as \"endorsedAccountName\", case when"
            + VISIBLE
            + "then i.drawer_name end as \"drawerName\", case when"
            + VISIBLE
            + "then i.description end as \"description\","
            + """
             i.branch_id as "branchId", b.name as "branchName", i.company_id as "companyId",
             c.short_name as "companyName", i.fund_account_id as "fundAccountId",
             f.name as "fundName", f.kind as "fundKind", f.bank_name as "fundBankName",
             i.custody_fund_id as "custodyFundId", cf.name as "custodyFundName",
             i.check_leaf_id as "checkLeafId", cl.check_book_id as "checkBookId",
             cb.serial_no as "checkBookSerial", cl.leaf_no as "leafNo",
             i.note_type as "noteType", i.is_collateral as "collateral",
             i.settled_date as "settledDate", os.id as "originSettlementId",
             os.status as "originSettlementStatus", mv.cnt as "movementCount",
             mv.last_date as "lastMovementDate"
            """;

    /** Süzgeçlerin gerektirdiği birleşimler (sayım sorgusu da kullanır). */
    String FILTER_FROM =
        """
         from instrument i
         left join account a on a.id = i.account_id
        """;

    String ITEM_FROM =
        FILTER_FROM
            + """
             left join account ea on ea.id = i.endorsed_account_id
             join branch b on b.id = i.branch_id
             join company c on c.id = i.company_id
             left join fund_account f on f.id = i.fund_account_id
             left join fund_account cf on cf.id = i.custody_fund_id
             left join check_leaf cl on cl.id = i.check_leaf_id
             left join check_book cb on cb.id = cl.check_book_id
             left join lateral (
               select s.id, s.status from settlement s
               where s.instrument_id = i.id and s.deleted = false
                 and ((s.type = 'COLLECTION' and i.direction = 'RECEIVED')
                      or (s.type = 'PAYMENT' and i.direction = 'ISSUED'))
               order by s.created_at, s.id limit 1) os on true
             left join lateral (
               select count(*) as cnt, max(m.movement_date) as last_date
               from instrument_movement m
               where m.instrument_id = i.id and m.deleted = false) mv on true
            """;

    String LIST_WHERE =
        " where i.deleted = false"
            + " and (:allCompanies = true or i.company_id = :companyId)"
            + " and (:allBranches = true or i.branch_id in (:branchIds))"
            + " and (:kind = '' or i.kind = :kind)"
            + " and (:direction = '' or i.direction = :direction)"
            + " and (:allStatuses = true or i.status in (:statuses))"
            + " and (:allAccounts = true or i.account_id = :accountId)"
            + " and i.due_date between :dueFrom and :dueTo"
            + " and (:allBooks = true or i.check_leaf_id in"
            + "      (select x.id from check_leaf x where x.check_book_id = :bookId))"
            + " and (:noteType = '' or i.note_type = :noteType)"
            + " and (:endorsable = false or (i.status = 'PORTFOLIO'"
            + "      and i.direction = 'RECEIVED' and i.kind = 'CHECK'))"
            + " and (:q = ''"
            + "      or i.number ilike :q escape '\\'"
            + "      or i.bank_name ilike :q escape '\\'"
            + "      or ("
            + VISIBLE
            + "          and (a.name ilike :q escape '\\'"
            + "               or i.drawer_name ilike :q escape '\\'"
            + "               or i.description ilike :q escape '\\'))) ";

    @Query(
        value =
            "select"
                + ITEM_COLUMNS
                + ITEM_FROM
                + LIST_WHERE
                + " order by i.due_date, i.number, i.id limit :limit offset :offset",
        nativeQuery = true)
    @SuppressWarnings("java:S107")
    List<InstrumentItemRow> items(
        @Param("employeeVisible") boolean employeeVisible,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("kind") String kind,
        @Param("direction") String direction,
        @Param("allStatuses") boolean allStatuses,
        @Param("statuses") Collection<String> statuses,
        @Param("allAccounts") boolean allAccounts,
        @Param("accountId") UUID accountId,
        @Param("dueFrom") LocalDate dueFrom,
        @Param("dueTo") LocalDate dueTo,
        @Param("allBooks") boolean allBooks,
        @Param("bookId") UUID bookId,
        @Param("noteType") String noteType,
        @Param("endorsable") boolean endorsable,
        @Param("q") String q,
        @Param("limit") int limit,
        @Param("offset") long offset);

    @Query(value = "select count(*)" + FILTER_FROM + LIST_WHERE, nativeQuery = true)
    @SuppressWarnings("java:S107")
    long countItems(
        @Param("employeeVisible") boolean employeeVisible,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("kind") String kind,
        @Param("direction") String direction,
        @Param("allStatuses") boolean allStatuses,
        @Param("statuses") Collection<String> statuses,
        @Param("allAccounts") boolean allAccounts,
        @Param("accountId") UUID accountId,
        @Param("dueFrom") LocalDate dueFrom,
        @Param("dueTo") LocalDate dueTo,
        @Param("allBooks") boolean allBooks,
        @Param("bookId") UUID bookId,
        @Param("noteType") String noteType,
        @Param("endorsable") boolean endorsable,
        @Param("q") String q);

    /** Liste ölçütleri ({@code InstrumentQueryService} kurar). */
    record Criteria(
        boolean employeeVisible,
        boolean allCompanies,
        UUID companyId,
        boolean allBranches,
        Collection<UUID> branchIds,
        String kind,
        String direction,
        boolean allStatuses,
        Collection<String> statuses,
        boolean allAccounts,
        UUID accountId,
        LocalDate dueFrom,
        LocalDate dueTo,
        boolean allBooks,
        UUID bookId,
        String noteType,
        boolean endorsable,
        String q) {}

    default List<InstrumentItemRow> items(Criteria c, int limit, long offset) {
      return items(
          c.employeeVisible(),
          c.allCompanies(),
          c.companyId(),
          c.allBranches(),
          c.branchIds(),
          c.kind(),
          c.direction(),
          c.allStatuses(),
          c.statuses(),
          c.allAccounts(),
          c.accountId(),
          c.dueFrom(),
          c.dueTo(),
          c.allBooks(),
          c.bookId(),
          c.noteType(),
          c.endorsable(),
          c.q(),
          limit,
          offset);
    }

    default long countItems(Criteria c) {
      return countItems(
          c.employeeVisible(),
          c.allCompanies(),
          c.companyId(),
          c.allBranches(),
          c.branchIds(),
          c.kind(),
          c.direction(),
          c.allStatuses(),
          c.statuses(),
          c.allAccounts(),
          c.accountId(),
          c.dueFrom(),
          c.dueTo(),
          c.allBooks(),
          c.bookId(),
          c.noteType(),
          c.endorsable(),
          c.q());
    }

    /** Tek çek/senet (silinmemiş); personel maskesi listeyle aynı. */
    @Query(
        value = "select" + ITEM_COLUMNS + ITEM_FROM + " where i.id = :id and i.deleted = false",
        nativeQuery = true)
    Optional<InstrumentItemRow> item(
        @Param("id") UUID id, @Param("employeeVisible") boolean employeeVisible);

    /** Hareket geçmişi (fon adlarıyla), kayıt sırasıyla. */
    @Query(
        value =
            """
            select m.id as "id", m.from_status as "fromStatus", m.to_status as "toStatus",
                   m.movement_date as "movementDate", m.note as "note",
                   m.created_by as "createdBy", m.movement_type as "movementType",
                   m.from_account_id as "fromAccountId", m.to_account_id as "toAccountId",
                   m.account_transfer_id as "accountTransferId",
                   m.fund_account_id as "fundAccountId", f.name as "fundName"
              from instrument_movement m
              left join fund_account f on f.id = m.fund_account_id
             where m.instrument_id = :id and m.deleted = false
             order by m.created_at, m.id
            """,
        nativeQuery = true)
    List<InstrumentMovementRow> movements(@Param("id") UUID id);
  }

  /** Ad alanları ve türetme girdileriyle çek/senet satırı (12.3 §4.3). */
  public interface InstrumentItemRow {
    UUID getId();

    String getKind();

    String getDirection();

    String getNumber();

    String getBankName();

    String getBankBranch();

    LocalDate getIssueDate();

    LocalDate getDueDate();

    BigDecimal getAmount();

    String getCurrency();

    String getStatus();

    UUID getAccountId();

    String getAccountCode();

    String getAccountName();

    String getAccountType();

    Boolean getEmployeeMasked();

    UUID getEndorsedAccountId();

    String getEndorsedAccountName();

    String getDrawerName();

    String getDescription();

    UUID getBranchId();

    String getBranchName();

    UUID getCompanyId();

    String getCompanyName();

    UUID getFundAccountId();

    String getFundName();

    String getFundKind();

    String getFundBankName();

    UUID getCustodyFundId();

    String getCustodyFundName();

    UUID getCheckLeafId();

    UUID getCheckBookId();

    String getCheckBookSerial();

    Integer getLeafNo();

    String getNoteType();

    Boolean getCollateral();

    LocalDate getSettledDate();

    UUID getOriginSettlementId();

    String getOriginSettlementStatus();

    Long getMovementCount();

    LocalDate getLastMovementDate();
  }

  /** Fon adıyla hareket satırı. */
  public interface InstrumentMovementRow {
    UUID getId();

    String getFromStatus();

    String getToStatus();

    LocalDate getMovementDate();

    String getNote();

    String getCreatedBy();

    String getMovementType();

    UUID getFromAccountId();

    UUID getToAccountId();

    UUID getAccountTransferId();

    UUID getFundAccountId();

    String getFundName();
  }

  /** Sayımlı koçan satırı. */
  public interface CheckBookRow {
    UUID getId();

    UUID getCompanyId();

    UUID getBranchId();

    String getBranchName();

    UUID getFundAccountId();

    String getFundName();

    String getFundBankName();

    String getSerialNo();

    String getBankCode();

    String getBranchCode();

    String getStartNumber();

    String getEndNumber();

    Integer getLeafCount();

    Long getUnusedCount();

    Long getUsedCount();

    Long getVoidCount();

    Object getCreatedAt();
  }

  /** Fon ve son çek bilgileriyle yaprak satırı. */
  public interface CheckLeafRow {
    UUID getId();

    UUID getCheckBookId();

    String getCheckBookSerial();

    Integer getLeafNo();

    String getNumber();

    String getMicrCode();

    String getStatus();

    LocalDate getUsedDate();

    String getVoidReason();

    UUID getFundAccountId();

    String getFundName();

    String getFundBankName();

    String getFundBankBranchName();

    String getFundIban();

    UUID getBranchId();

    String getBranchName();

    UUID getCompanyId();

    UUID getInstrumentId();

    String getInstrumentStatus();
  }
}
