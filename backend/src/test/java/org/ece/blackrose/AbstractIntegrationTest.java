package org.ece.blackrose;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.containers.PostgreSQLContainer;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class AbstractIntegrationTest {

  @ServiceConnection
  static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

  static {
    POSTGRES.start();
  }

  @Autowired protected MockMvc mvc;

  protected static RequestPostProcessor tenant(String code) {
    return request -> {
      request.setServerName(code + ".blackrose.test");
      return request;
    };
  }

  protected static String tenantJson(String code) {
    return """
        {"code":"%s","name":"%s Lojistik","defaultCurrency":"TRY","timeZone":"Europe/Istanbul"}
        """
        .formatted(code, code);
  }

  protected void createTenant(String code) throws Exception {
    mvc.perform(
            post("/api/v1/admin/tenants")
                .header("X-Admin-Key", "test-admin-key")
                .contentType(MediaType.APPLICATION_JSON)
                .content(tenantJson(code)))
        .andExpect(status().isCreated());
  }

  protected void createBranch(String tenantCode, String branchCode) throws Exception {
    mvc.perform(
            post("/api/v1/organization/branches")
                .with(tenant(tenantCode))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"%s\",\"name\":\"Merkez\"}".formatted(branchCode)))
        .andExpect(status().isCreated());
  }
}
