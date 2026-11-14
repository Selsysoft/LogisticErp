package org.ece.blackrose.organization;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** İş yerleri ({@code branch}) ve iş yeri ağacı (12.1a §5.1). */
public final class BranchDtos {

  private BranchDtos() {}

  /**
   * POST ve PUT gövdesi; {@code {code, name}} tek başına geçerlidir (geriye uyum). POST: {@code
   * code} null → {@code IY-0001…} (boş metin 400); grup verilirse şirket gruptan, yalnız şirket →
   * grup yok, hiçbiri → varsayılan şirket. PUT: {@code code} null → değişmez; {@code branchGroupId}
   * null → grup kaldırılır ("Diğer"); {@code companyId} null → şirket değişmez.
   */
  public record SaveBranchRequest(
      @Size(max = 50) @Pattern(regexp = "(?s).*\\S.*", message = "boş olamaz") String code,
      @NotBlank @Size(max = 200) String name,
      UUID companyId,
      UUID branchGroupId,
      @Pattern(regexp = "^$|^[0-9]{1,11}$") String phone,
      @Size(max = 500) String address,
      @Size(max = 100) String city,
      @Size(max = 100) String district,
      @DecimalMin("-90") @DecimalMax("90") @Digits(integer = 3, fraction = 6) BigDecimal latitude,
      @DecimalMin("-180") @DecimalMax("180") @Digits(integer = 3, fraction = 6)
          BigDecimal longitude,
      @Size(max = 26) String sgkWorkplaceNo) {}

  public record BranchResponse(
      UUID id,
      String code,
      String name,
      UUID companyId,
      String companyName,
      UUID branchGroupId,
      String branchGroupName,
      String phone,
      String address,
      String city,
      String district,
      BigDecimal latitude,
      BigDecimal longitude,
      String sgkWorkplaceNo,
      boolean active,
      String createdBy,
      Instant createdAt,
      String updatedBy,
      Instant updatedAt,
      int updateCount) {}

  /** Ağaç: şirket → şube grubu ({@code groupId} null = "Diğer") → iş yeri. */
  public record BranchTreeCompanyResponse(
      UUID companyId,
      String companyName,
      boolean companyActive,
      List<BranchTreeGroupResponse> groups) {}

  public record BranchTreeGroupResponse(
      UUID groupId,
      String groupName,
      boolean groupActive,
      List<BranchTreeBranchResponse> branches) {}

  public record BranchTreeBranchResponse(UUID id, String code, String name, boolean active) {}
}
