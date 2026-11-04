package org.ece.blackrose.tenant;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class TenantTaskDecoratorTest {

  @AfterEach
  void clear() {
    TenantContext.clear();
  }

  @Test
  void carriesTenantToWorkerAndCleansUpAfterwards() throws Exception {
    ExecutorService pool = Executors.newSingleThreadExecutor();
    try {
      TenantContext.setSchema("tenant_alpha");
      Runnable decorated =
          new TenantTaskDecorator()
              .decorate(() -> assertThat(TenantContext.currentSchema()).contains("tenant_alpha"));

      pool.submit(decorated).get();

      assertThat(pool.submit(TenantContext::currentSchema).get()).isEmpty();
    } finally {
      pool.shutdownNow();
    }
  }
}
