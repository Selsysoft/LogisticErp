package org.ece.blackrose.organization;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public final class BranchDtos {

  private BranchDtos() {}

  public record CreateBranchRequest(
      @NotBlank @Size(max = 50) String code, @NotBlank @Size(max = 200) String name) {}

  public record BranchResponse(UUID id, String code, String name) {}
}
