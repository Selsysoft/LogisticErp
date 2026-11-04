package org.ece.blackrose.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.ece.blackrose.AbstractIntegrationTest;
import org.ece.blackrose.common.web.TraceIdFilter;
import org.ece.blackrose.tenant.TenantContext;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.core.task.TaskExecutor;
import org.springframework.http.MediaType;

@ExtendWith(OutputCaptureExtension.class)
class PlatformBehaviorIT extends AbstractIntegrationTest {

  @Autowired
  @Qualifier("applicationTaskExecutor")
  TaskExecutor executor;

  @Test
  void invalidRequestReturnsStandardErrorBody() throws Exception {
    createTenant("errors");

    mvc.perform(
            post("/api/v1/organization/branches")
                .with(tenant("errors"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"\",\"name\":\"Merkez\"}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
        .andExpect(jsonPath("$.message").isNotEmpty())
        .andExpect(jsonPath("$.details[0]").value(org.hamcrest.Matchers.startsWith("code:")))
        .andExpect(jsonPath("$.traceId").isNotEmpty());
  }

  @Test
  void unknownOrMissingTenantReturnsStandardErrorBody() throws Exception {
    mvc.perform(get("/api/v1/organization/branches").with(tenant("yok")))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("TENANT_NOT_FOUND"))
        .andExpect(jsonPath("$.traceId").isNotEmpty());
    mvc.perform(get("/api/v1/organization/branches"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("TENANT_REQUIRED"));
  }

  @Test
  void healthIsUpAndLogsCarryResponseTraceId(CapturedOutput output) throws Exception {
    String traceId =
        mvc.perform(get("/actuator/health"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("UP"))
            .andReturn()
            .getResponse()
            .getHeader(TraceIdFilter.HEADER);

    assertThat(traceId).isNotBlank();
    assertThat(output.getOut()).contains("\"traceId\":\"" + traceId + "\"");
  }

  @Test
  void pingAndOpenApiAreAvailableWithoutTenant() throws Exception {
    mvc.perform(get("/api/v1/ping"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("ok"));
    mvc.perform(get("/v3/api-docs")).andExpect(status().isOk());
  }

  @Test
  void defaultAsyncExecutorCarriesTenantContext() throws Exception {
    CompletableFuture<String> seen = new CompletableFuture<>();
    TenantContext.setSchema("tenant_async");
    try {
      executor.execute(() -> seen.complete(TenantContext.currentSchema().orElse("yok")));
    } finally {
      TenantContext.clear();
    }

    assertThat(seen.get(5, TimeUnit.SECONDS)).isEqualTo("tenant_async");
  }
}
