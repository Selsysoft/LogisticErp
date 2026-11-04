package org.ece.blackrose.common.audit;

import java.util.Optional;
import org.ece.blackrose.identity.security.AuthenticatedUser;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.domain.AuditorAware;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

@Configuration
@EnableJpaAuditing
public class AuditConfig {

  @Bean
  AuditorAware<String> auditorAware() {
    return () ->
        Optional.of(AuthenticatedUser.current().map(AuthenticatedUser::email).orElse("system"));
  }
}
