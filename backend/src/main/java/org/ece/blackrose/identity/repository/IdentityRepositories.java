package org.ece.blackrose.identity.repository;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.identity.domain.AuditLog;
import org.ece.blackrose.identity.domain.RefreshToken;
import org.ece.blackrose.identity.domain.RevokedAccessToken;
import org.ece.blackrose.identity.domain.Role;
import org.ece.blackrose.identity.domain.SaasAdmin;
import org.ece.blackrose.identity.domain.SaasRevokedToken;
import org.ece.blackrose.identity.domain.UserAccount;
import org.ece.blackrose.identity.domain.UserStatus;
import org.ece.blackrose.identity.domain.UserToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public final class IdentityRepositories {

  private IdentityRepositories() {}

  public interface UserAccountRepository extends JpaRepository<UserAccount, UUID> {

    Optional<UserAccount> findByEmail(String email);

    List<UserAccount> findByStatus(UserStatus status);

    @Query(
        """
        select count(distinct u) from UserAccount u join u.roles r
        where r.code = 'PATRON'
          and u.status = org.ece.blackrose.identity.domain.UserStatus.ACTIVE
        """)
    long countActiveOwners();

    @Query("select count(u) from UserAccount u join u.roles r where r.id = :roleId")
    long countByRole(@Param("roleId") UUID roleId);
  }

  public interface RoleRepository extends JpaRepository<Role, UUID> {

    Optional<Role> findByCode(String code);
  }

  public interface SaasAdminRepository extends JpaRepository<SaasAdmin, UUID> {

    Optional<SaasAdmin> findByEmail(String email);
  }

  public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<RefreshToken> findByTokenHash(String tokenHash);

    @Modifying
    @Transactional
    @Query(
        "update RefreshToken t set t.revokedAt = :now"
            + " where t.familyId = :familyId and t.revokedAt is null")
    void revokeFamily(@Param("familyId") UUID familyId, @Param("now") Instant now);

    @Modifying
    @Transactional
    @Query(
        "update RefreshToken t set t.revokedAt = :now"
            + " where t.userId = :userId and t.revokedAt is null")
    void revokeAllForUser(@Param("userId") UUID userId, @Param("now") Instant now);

    @Modifying
    @Transactional
    @Query("delete from RefreshToken t where t.expiresAt < :now")
    void deleteExpired(@Param("now") Instant now);
  }

  public interface RevokedAccessTokenRepository extends JpaRepository<RevokedAccessToken, UUID> {

    @Modifying
    @Transactional
    @Query("delete from RevokedAccessToken t where t.expiresAt < :now")
    void deleteExpired(@Param("now") Instant now);
  }

  public interface SaasRevokedTokenRepository extends JpaRepository<SaasRevokedToken, UUID> {

    @Modifying
    @Transactional
    @Query("delete from SaasRevokedToken t where t.expiresAt < :now")
    void deleteExpired(@Param("now") Instant now);
  }

  public interface UserTokenRepository extends JpaRepository<UserToken, UUID> {

    Optional<UserToken> findByTokenHash(String tokenHash);

    @Modifying
    @Transactional
    @Query("update UserToken t set t.usedAt = :now where t.userId = :userId and t.usedAt is null")
    void invalidateForUser(@Param("userId") UUID userId, @Param("now") Instant now);

    @Modifying
    @Transactional
    @Query("delete from UserToken t where t.expiresAt < :now")
    void deleteExpired(@Param("now") Instant now);
  }

  public interface AuditLogRepository extends JpaRepository<AuditLog, UUID> {}
}
