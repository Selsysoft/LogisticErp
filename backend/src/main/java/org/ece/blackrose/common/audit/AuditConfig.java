package org.ece.blackrose.common.audit;

import java.util.Optional;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.domain.AuditorAware;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

@Configuration
@EnableJpaAuditing
public class AuditConfig {

  /** Faz 1'de oturumdaki kullanıcıyla değiştirilecek. */
  @Bean
  AuditorAware<String> auditorAware() {
    return () -> Optional.of("system");
  }
}
