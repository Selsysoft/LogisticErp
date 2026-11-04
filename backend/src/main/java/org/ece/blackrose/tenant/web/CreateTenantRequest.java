package org.ece.blackrose.tenant.web;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateTenantRequest(
    @NotBlank @Pattern(regexp = "^[a-z][a-z0-9-]{1,30}[a-z0-9]$") String code,
    @NotBlank @Size(max = 200) String name,
    @NotBlank @Pattern(regexp = "^[A-Z]{3}$") String defaultCurrency,
    @NotBlank @Size(max = 64) String timeZone,
    @NotBlank @Email String ownerEmail,
    @NotBlank @Size(max = 200) String ownerFullName) {}
