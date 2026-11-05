package org.ece.blackrose.integration.service;

import org.ece.blackrose.common.error.BusinessException;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;

/** Entegratör tanımlı değilse gönderim açık bir hatayla reddedilir. */
@Configuration
public class UnconfiguredEDocumentProvider {

  @Bean
  @ConditionalOnMissingBean(EDocumentProvider.class)
  EDocumentProvider noEDocumentProvider() {
    return new EDocumentProvider() {
      @Override
      public String name() {
        return "NONE";
      }

      @Override
      public boolean isTest() {
        return false;
      }

      @Override
      public Result send(Outgoing document) {
        throw notConfigured();
      }

      @Override
      public Result status(String reference) {
        throw notConfigured();
      }

      @Override
      public Result cancel(String reference) {
        throw notConfigured();
      }

      private BusinessException notConfigured() {
        return new BusinessException(
            HttpStatus.CONFLICT, "EDOCUMENT_NOT_CONFIGURED", "e-Belge entegratörü tanımlı değil.");
      }
    };
  }
}
