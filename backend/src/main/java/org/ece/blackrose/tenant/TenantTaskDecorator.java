package org.ece.blackrose.tenant;

import java.util.Map;
import org.slf4j.MDC;
import org.springframework.core.task.TaskDecorator;
import org.springframework.stereotype.Component;

/** Spring Boot bu bean'i varsayılan asenkron çalıştırıcıya otomatik uygular. */
@Component
public class TenantTaskDecorator implements TaskDecorator {

  @Override
  public Runnable decorate(Runnable task) {
    TenantContext.Current tenant = TenantContext.current().orElse(null);
    Map<String, String> mdc = MDC.getCopyOfContextMap();
    return () -> {
      try {
        if (tenant != null) {
          TenantContext.restore(tenant);
        }
        if (mdc != null) {
          MDC.setContextMap(mdc);
        }
        task.run();
      } finally {
        TenantContext.clear();
        MDC.clear();
      }
    };
  }
}
