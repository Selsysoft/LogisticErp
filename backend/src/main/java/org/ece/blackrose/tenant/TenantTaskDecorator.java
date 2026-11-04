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
    String schema = TenantContext.currentSchema().orElse(null);
    Map<String, String> mdc = MDC.getCopyOfContextMap();
    return () -> {
      try {
        if (schema != null) {
          TenantContext.setSchema(schema);
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
