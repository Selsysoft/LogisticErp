package org.ece.blackrose.identity.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

/** LIMITED kapsamlı kullanıcının izinli iş yeri. Denetim alanı yoktur (kapsam olayı denetlenir). */
@Entity
@Table(name = "user_branch")
@IdClass(UserBranch.Key.class)
public class UserBranch {

  @Id private UUID userId;
  @Id private UUID branchId;

  protected UserBranch() {}

  public UserBranch(UUID userId, UUID branchId) {
    this.userId = userId;
    this.branchId = branchId;
  }

  public UUID getUserId() {
    return userId;
  }

  public UUID getBranchId() {
    return branchId;
  }

  /** Bileşik birincil anahtar. */
  public static class Key implements Serializable {

    private UUID userId;
    private UUID branchId;

    public Key() {}

    public Key(UUID userId, UUID branchId) {
      this.userId = userId;
      this.branchId = branchId;
    }

    @Override
    public boolean equals(Object other) {
      return other instanceof Key key
          && Objects.equals(userId, key.userId)
          && Objects.equals(branchId, key.branchId);
    }

    @Override
    public int hashCode() {
      return Objects.hash(userId, branchId);
    }
  }
}
