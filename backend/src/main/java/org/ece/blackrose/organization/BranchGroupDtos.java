package org.ece.blackrose.organization;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

/** Şube grupları (ZTO "Şube", 12.1a §5.1). */
public final class BranchGroupDtos {

  private BranchGroupDtos() {}

  /**
   * {@code companyId}: POST null → varsayılan şirket (LIMITED kullanıcıda varsayılan görünmüyorsa
   * görünür tek aktif şirket, birden çoksa 400 {@code COMPANY_REQUIRED}); PUT null → değişmez.
   */
  public record SaveBranchGroupRequest(
      UUID companyId,
      @NotBlank @Size(max = 50) String name,
      BranchGroupType groupType,
      @Pattern(regexp = "^$|^[0-9]{1,11}$") String phone,
      @Email @Size(max = 254) String email,
      @Size(max = 500) String address,
      @Size(max = 200) String managerName,
      @Pattern(regexp = "^$|^[0-9]{1,11}$") String taxNumber,
      @Size(max = 100) String taxOffice,
      Boolean active) {}

  public record BranchGroupResponse(
      UUID id,
      UUID companyId,
      String companyName,
      String name,
      BranchGroupType groupType,
      String phone,
      String email,
      String address,
      String managerName,
      String taxNumber,
      String taxOffice,
      boolean active,
      int branchCount,
      String createdBy,
      Instant createdAt,
      String updatedBy,
      Instant updatedAt,
      int updateCount) {}
}
