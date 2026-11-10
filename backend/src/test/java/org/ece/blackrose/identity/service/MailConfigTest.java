package org.ece.blackrose.identity.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.ece.blackrose.identity.security.SecurityProperties;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

class MailConfigTest {

  @Configuration
  @EnableConfigurationProperties(SecurityProperties.class)
  static class Smtp {
    @Bean
    JavaMailSender javaMailSender() {
      return new JavaMailSenderImpl();
    }
  }

  private final ApplicationContextRunner runner =
      new ApplicationContextRunner()
          .withUserConfiguration(Smtp.class, MailConfig.class)
          .withPropertyValues(
              "app.security.jwt-secret=0123456789abcdef0123456789abcdef",
              "app.security.totp-key=0123456789abcdef0123456789abcdef",
              "app.security.mail-from=Firma <noreply@firma.example>");

  @Test
  void bulkMailAnahtariVarsaSmtpTanimliOlsaBileBulkMailKullanilir() {
    runner
        .withPropertyValues(
            "spring.mail.host=smtp.firma.example", "app.mail.bulkmail.api-key=sk_live_x")
        .run(
            context -> {
              assertThat(context).hasSingleBean(AccountMailer.class);
              assertThat(context).hasSingleBean(BulkMailClient.class);
              assertThat(context).hasBean("bulkMailAccountMailer");
              assertThat(context.getBean(BulkMailClient.class).from())
                  .isEqualTo("Firma <noreply@firma.example>");
            });
  }

  @Test
  void anahtarYoksaSmtpKullanilir() {
    runner
        .withPropertyValues("spring.mail.host=smtp.firma.example")
        .run(
            context -> {
              assertThat(context).hasSingleBean(AccountMailer.class);
              assertThat(context).hasBean("smtpAccountMailer");
              assertThat(context).doesNotHaveBean(BulkMailClient.class);
            });
  }

  @Test
  void ikisiDeYoksaUretimdeGondericiYoktur() {
    runner.run(context -> assertThat(context).doesNotHaveBean(AccountMailer.class));
  }
}
