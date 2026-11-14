package org.ece.blackrose.finance.repository;

import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.finance.domain.AccountBankAccount;
import org.ece.blackrose.finance.domain.AccountCompanyLimit;
import org.ece.blackrose.finance.domain.AccountDocument;
import org.ece.blackrose.finance.domain.AccountDocumentTax;
import org.ece.blackrose.finance.domain.AccountDocumentType;
import org.ece.blackrose.finance.domain.AccountGroup;
import org.ece.blackrose.finance.domain.AccountRollover;
import org.ece.blackrose.finance.domain.AccountTransfer;
import org.ece.blackrose.finance.domain.AccountTransferInstrument;
import org.ece.blackrose.finance.domain.AccountTransferLine;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentSide;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.organization.BranchFilter;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Faz 12.1 cari tabloları (V27–V30). {@link FinanceRepositories} büyüdüğü için ayrı dosyadadır
 * (docs/zto-finans/uygulama/12.1_TASARIM.md §2.5).
 */
public final class AccountRepositories {

  /** Süzgeçte "tarih yok" yerine kullanılan uçlar; NULL tarih bağlamanın tip sorununu önler. */
  static final LocalDate MIN_DATE = LocalDate.of(1900, 1, 1);

  static final LocalDate MAX_DATE = LocalDate.of(9999, 12, 31);

  private AccountRepositories() {}

  public interface AccountGroupRepository extends JpaRepository<AccountGroup, String> {

    List<AccountGroup> findAllByOrderBySortOrder();

    /** Kod üretimi sayacı için satır kilidi. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select g from AccountGroup g where g.code = :code")
    Optional<AccountGroup> findForUpdate(@Param("code") String code);

    Optional<AccountGroup> findByAccountTypeAndTypeDefaultTrue(AccountType type);
  }

  public interface AccountCompanyLimitRepository extends JpaRepository<AccountCompanyLimit, UUID> {

    List<AccountCompanyLimit> findAllByAccountId(UUID accountId);

    Optional<AccountCompanyLimit> findByAccountIdAndCompanyId(UUID accountId, UUID companyId);
  }

  public interface AccountBankAccountRepository extends JpaRepository<AccountBankAccount, UUID> {

    List<AccountBankAccount> findAllByAccountIdOrderByCreatedAt(UUID accountId);

    boolean existsByIbanHashAndActiveTrue(String ibanHash);

    boolean existsByIbanHashAndActiveTrueAndIdNot(String ibanHash, UUID id);

    /**
     * Çapraz banka hesabı listesi. {@code employeeVisible = false} personel carilerinin hesaplarını
     * gizler; {@code q} banka adı, hesap sahibi ya da cari adında (küçük harf) arar, boş = tümü.
     */
    @Query(
        """
        select b from AccountBankAccount b, Account a
        where a.id = b.accountId
          and (:accountId is null or b.accountId = :accountId)
          and (:currency = '' or b.currency = :currency)
          and (:active is null or b.active = :active)
          and (:employeeVisible = true
               or a.type <> org.ece.blackrose.finance.domain.FinanceTypes.AccountType.EMPLOYEE)
          and (:q = '' or lower(b.bankName) like concat('%', :q, '%')
               or lower(coalesce(b.holderName, '')) like concat('%', :q, '%')
               or lower(a.name) like concat('%', :q, '%'))
        """)
    Page<AccountBankAccount> search(
        @Param("accountId") UUID accountId,
        @Param("currency") String currency,
        @Param("active") Boolean active,
        @Param("employeeVisible") boolean employeeVisible,
        @Param("q") String q,
        Pageable pageable);
  }

  public interface AccountDocumentTypeRepository
      extends JpaRepository<AccountDocumentType, AccountDocumentType.Key> {

    List<AccountDocumentType> findAllByActiveTrueOrderBySideAscSortOrderAsc();
  }

  public interface AccountDocumentRepository extends JpaRepository<AccountDocument, UUID> {

    Optional<AccountDocument> findByIdempotencyKey(String key);

    /** Bu belgenin revizesi (bir belge en çok bir kez revize edilir). */
    Optional<AccountDocument> findFirstByRevisedFromId(UUID revisedFromId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from AccountDocument d where d.id = :id")
    Optional<AccountDocument> findForUpdate(@Param("id") UUID id);

    @Query(
        """
        select d from AccountDocument d
        where d.accountId = :accountId
          and (:side is null or d.side = :side)
          and (:documentType = '' or d.documentType = :documentType)
          and (:anyReflected = true or d.reflectToLedger = :reflected)
          and (:status is null or d.status = :status)
          and d.documentDate between :from and :to
          and (:companyId is null or d.companyId = :companyId)
          and (:allBranches = true or d.branchId in :branchIds)
        """)
    Page<AccountDocument> search(
        @Param("accountId") UUID accountId,
        @Param("side") AccountDocumentSide side,
        @Param("documentType") String documentType,
        @Param("anyReflected") boolean anyReflected,
        @Param("reflected") boolean reflected,
        @Param("status") AccountDocumentStatus status,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        Pageable pageable);

    /** Boş süzgeç değerleri "tümü" demektir; şirket boşsa konsolide. */
    default Page<AccountDocument> search(
        UUID accountId,
        AccountDocumentSide side,
        String documentType,
        Boolean reflected,
        AccountDocumentStatus status,
        LocalDate from,
        LocalDate to,
        BranchFilter filter,
        Pageable pageable) {
      return search(
          accountId,
          side,
          documentType == null ? "" : documentType,
          reflected == null,
          Boolean.TRUE.equals(reflected),
          status,
          from == null ? MIN_DATE : from,
          to == null ? MAX_DATE : to,
          filter.companyId(),
          filter.allBranches(),
          filter.branchIds(),
          pageable);
    }
  }

  public interface AccountDocumentTaxRepository extends JpaRepository<AccountDocumentTax, UUID> {}

  public interface AccountRolloverRepository extends JpaRepository<AccountRollover, UUID> {

    /** {@code deleted = true} silinenler listesidir (ZTO "Silinenler"). */
    @Query(
        "select r from AccountRollover r where r.accountId = :a and r.deleted = :deleted"
            + " order by r.rolloverDate")
    List<AccountRollover> findAllByAccount(
        @Param("a") UUID accountId, @Param("deleted") boolean deleted);

    @Query(
        "select r from AccountRollover r where r.accountId = :a and r.active = true"
            + " and r.deleted = false")
    Optional<AccountRollover> findActive(@Param("a") UUID accountId);

    /** Yeni kayıtta {@code exclude} = {@link BranchFilter#NONE}. */
    @Query(
        "select count(r) > 0 from AccountRollover r where r.accountId = :a"
            + " and r.rolloverDate = :d and r.deleted = false and r.id <> :exclude")
    boolean dateTaken(
        @Param("a") UUID accountId, @Param("d") LocalDate date, @Param("exclude") UUID exclude);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(
        value =
            """
            update account_rollover
               set active = false, update_count = update_count + 1,
                   updated_by = :actor, updated_at = now()
             where account_id = :accountId and active and deleted = false and id <> :targetId
            """,
        nativeQuery = true)
    int deactivateOthers(
        @Param("accountId") UUID accountId,
        @Param("targetId") UUID targetId,
        @Param("actor") String actor);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(
        value =
            """
            update account_rollover
               set active = true, update_count = update_count + 1,
                   updated_by = :actor, updated_at = now()
             where account_id = :accountId and id = :targetId and not active and deleted = false
            """,
        nativeQuery = true)
    int activateOnly(
        @Param("accountId") UUID accountId,
        @Param("targetId") UUID targetId,
        @Param("actor") String actor);

    /**
     * Carinin tek aktif sezonunu {@code targetId} yapar (§3.10 F6). Önce diğerleri pasifleşir,
     * sonra hedef aktifleşir: tek {@code UPDATE … SET active = (id = :target)} satır sırasına göre
     * kısmi tekil indeksi ({@code account_rollover_active_uq}) ara durumda ihlal edebilir. Değişen
     * satır sayısını döner; hedef silinmiş ya da başka carinin ise hedef aktifleşmez. {@code
     * targetId} null ise carinin tüm sezonları pasifleşir (NULL'un {@code id <> :targetId}
     * karşılaştırmasını boşa çıkarmaması için nöbetçi kimlik kullanılır).
     */
    default int setActiveOnly(UUID accountId, UUID targetId, String actor) {
      if (targetId == null) {
        return deactivateOthers(accountId, BranchFilter.NONE, actor);
      }
      return deactivateOthers(accountId, targetId, actor)
          + activateOnly(accountId, targetId, actor);
    }
  }

  public interface AccountTransferRepository extends JpaRepository<AccountTransfer, UUID> {

    Optional<AccountTransfer> findByIdempotencyKey(String key);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from AccountTransfer t where t.id = :id")
    Optional<AccountTransfer> findForUpdate(@Param("id") UUID id);

    /**
     * Taşınan çeklerden taşımadan sonra işlem görenler (12.1 §3.11 F3a): taşımadan sonra durum
     * hareketi (STATUS) ya da hedef caride çeke bağlı (karşılıksız) defter satırı.
     */
    @Query(
        value =
            """
            select distinct x.instrument_id
            from account_transfer_instrument x
            join account_transfer tr on tr.id = x.account_transfer_id
            where x.account_transfer_id = :transferId and x.deleted = false and not x.reverted
              and (exists (select 1 from instrument_movement m
                           where m.instrument_id = x.instrument_id and m.deleted = false
                             and m.movement_type = 'STATUS' and m.created_at > tr.created_at)
                   or exists (select 1 from account_transaction t
                              join instrument_movement m on m.id = t.source_id
                              where t.account_id = tr.to_account_id and t.deleted = false
                                and t.source_type in ('INSTRUMENT', 'INSTRUMENT_ENDORSEE_BOUNCE')
                                and m.instrument_id = x.instrument_id
                                and t.created_at > tr.created_at))
            """,
        nativeQuery = true)
    List<UUID> movedInstruments(@Param("transferId") UUID transferId);
  }

  public interface AccountTransferLineRepository extends JpaRepository<AccountTransferLine, UUID> {

    List<AccountTransferLine> findAllByAccountTransferId(UUID transferId);

    boolean existsByAccountTransactionIdAndActiveTrue(UUID transactionId);
  }

  public interface AccountTransferInstrumentRepository
      extends JpaRepository<AccountTransferInstrument, UUID> {

    List<AccountTransferInstrument> findAllByAccountTransferId(UUID transferId);
  }
}
