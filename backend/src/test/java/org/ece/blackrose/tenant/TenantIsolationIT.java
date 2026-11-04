package org.ece.blackrose.tenant;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.ece.blackrose.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;

class TenantIsolationIT extends AbstractIntegrationTest {

  @Test
  void tenantsNeverSeeEachOthersDataUnderConcurrentRequests() throws Exception {
    createTenant("alpha");
    createTenant("beta");
    createBranch("alpha", "ALPHA-ONLY");
    createBranch("beta", "BETA-ONLY");

    ExecutorService pool = Executors.newFixedThreadPool(8);
    try {
      List<Callable<Void>> calls = new ArrayList<>();
      for (int i = 0; i < 100; i++) {
        calls.add(() -> assertSeesOnly("alpha", "ALPHA-ONLY"));
        calls.add(() -> assertSeesOnly("beta", "BETA-ONLY"));
      }
      for (Future<Void> result : pool.invokeAll(calls)) {
        result.get();
      }
    } finally {
      pool.shutdownNow();
    }
  }

  private Void assertSeesOnly(String tenantCode, String branchCode) throws Exception {
    mvc.perform(get("/api/v1/organization/branches").with(asOwner(tenantCode)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.totalElements").value(1))
        .andExpect(jsonPath("$.content[0].code").value(branchCode));
    return null;
  }
}
