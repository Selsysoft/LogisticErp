package org.ece.blackrose.identity.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.ece.blackrose.identity.security.SecurityProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;

/**
 * SMTP tanımlıysa gerçek e-posta gönderilir. Tanımlı değilse bağlantılar yalnız dev/test profilinde
 * log'a yazılır; stage/prod bu durumda açılmaz.
 */
@Configuration
public class MailConfig {

  private static final Logger log = LoggerFactory.getLogger(MailConfig.class);

  @Bean
  @ConditionalOnExpression("!'${spring.mail.host:}'.isBlank()")
  AccountMailer smtpAccountMailer(JavaMailSender sender, SecurityProperties properties) {
    return new AccountMailer() {
      @Override
      public void sendInvite(String email, String link) {
        send(email, "Hesabınızı etkinleştirin", "Şifrenizi belirlemek için: " + link);
      }

      @Override
      public void sendPasswordReset(String email, String link) {
        send(email, "Şifre sıfırlama", "Şifrenizi sıfırlamak için: " + link);
      }

      @Override
      public void sendNotice(String email, String subject, String text) {
        send(email, subject, text);
      }

      @Override
      public void sendNotice(String email, String subject, String text, String html) {
        try {
          MimeMessage message = sender.createMimeMessage();
          MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
          helper.setFrom(properties.mailFrom());
          helper.setTo(email);
          helper.setSubject(subject);
          helper.setText(text, html);
          sender.send(message);
        } catch (MessagingException | MailException ex) {
          log.error("E-posta gönderilemedi", ex);
        }
      }

      private void send(String email, String subject, String text) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(properties.mailFrom());
        message.setTo(email);
        message.setSubject(subject);
        message.setText(text);
        try {
          sender.send(message);
        } catch (MailException ex) {
          log.error("E-posta gönderilemedi", ex);
        }
      }
    };
  }

  @Bean
  @Profile({"dev", "test"})
  @ConditionalOnMissingBean(AccountMailer.class)
  AccountMailer loggingAccountMailer() {
    return new AccountMailer() {
      @Override
      public void sendInvite(String email, String link) {
        log.info("[DEV] Davet bağlantısı {}: {}", email, link);
      }

      @Override
      public void sendPasswordReset(String email, String link) {
        log.info("[DEV] Şifre sıfırlama bağlantısı {}: {}", email, link);
      }

      @Override
      public void sendNotice(String email, String subject, String text) {
        log.info("[DEV] Bildirim {}: {} - {}", email, subject, text);
      }
    };
  }
}
