package org.ece.blackrose.tenant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.ece.blackrose.AbstractIntegrationTest;
import org.ece.blackrose.tenant.domain.TenantStatus;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.ece.blackrose.tenant.service.TenantMigrator;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

class TenantProvisioningIT extends AbstractIntegrationTest {

  @MockitoSpyBean TenantMigrator migrator;
  @Autowired TenantRepository tenants;

  @AfterEach
  void restoreMigrator() {
    doCallRealMethod().when(migrator).migrate(anyString());
  }

  @Test
  void createsSchemaAppliesMigrationsAndInvitesOwner() throws Exception {
    createTenant("gamma-lojistik");

    assertThat(tenants.findByCode("gamma-lojistik").orElseThrow().getStatus())
        .isEqualTo(TenantStatus.ACTIVE);
    mvc.perform(get("/api/v1/organization/branches").with(asOwner("gamma-lojistik")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.totalElements").value(0));
  }

  @Test
  void rejectsDuplicateAndReservedCodes() throws Exception {
    createTenant("delta");

    postTenant("delta").andExpect(status().isConflict());
    postTenant("admin")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("TENANT_CODE_RESERVED"));
  }

  @Test
  void failedMigrationBlocksTenantUntilRetrySucceeds() throws Exception {
    doThrow(new IllegalStateException("migration hatası")).when(migrator).migrate(anyString());

    postTenant("omega")
        .andExpect(status().isInternalServerError())
        .andExpect(jsonPath("$.code").value("TENANT_PROVISIONING_FAILED"));

    assertThat(tenants.findByCode("omega").orElseThrow().getStatus())
        .isEqualTo(TenantStatus.FAILED);
    mvc.perform(
            post("/api/v1/auth/login")
                .with(tenant("omega"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(loginJson(ownerEmail("omega"), PASSWORD, null)))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("TENANT_NOT_ACTIVE"));

    doCallRealMethod().when(migrator).migrate(anyString());
    createTenant("omega");
    mvc.perform(get("/api/v1/organization/branches").with(asOwner("omega")))
        .andExpect(status().isOk());
  }

  @Test
  void adminEndpointRequiresSaasAdmin() throws Exception {
    createTenant("zeta");

    mvc.perform(
            post("/api/v1/admin/tenants")
                .contentType(MediaType.APPLICATION_JSON)
                .content(tenantJson("sigma")))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
    mvc.perform(
            post("/api/v1/admin/tenants")
                .with(asOwner("zeta"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(tenantJson("sigma")))
        .andExpect(status().isUnauthorized());
    assertThat(tenants.findByCode("sigma")).isEmpty();
  }
}
