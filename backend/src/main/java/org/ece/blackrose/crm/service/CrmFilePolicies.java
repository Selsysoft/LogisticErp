package org.ece.blackrose.crm.service;

import java.util.UUID;
import java.util.function.Predicate;
import org.ece.blackrose.crm.repository.CrmRepositories.ContractRepository;
import org.ece.blackrose.crm.repository.CrmRepositories.OpportunityRepository;
import org.ece.blackrose.crm.repository.CrmRepositories.QuoteRepository;
import org.ece.blackrose.files.FileOwnerPolicy;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** CRM kayıtlarına eklenen dosyaların izin kuralları. */
@Configuration
public class CrmFilePolicies {

  private static final String VIEW = "CRM_VIEW";
  private static final String EDIT = "CRM_EDIT";

  private static FileOwnerPolicy policy(String type, Predicate<UUID> exists) {
    return new FileOwnerPolicy() {
      @Override
      public String ownerType() {
        return type;
      }

      @Override
      public String viewPermission() {
        return VIEW;
      }

      @Override
      public String editPermission() {
        return EDIT;
      }

      @Override
      public boolean exists(UUID ownerId) {
        return exists.test(ownerId);
      }
    };
  }

  @Bean
  FileOwnerPolicy accountFilePolicy(AccountRepository accounts) {
    return policy("ACCOUNT", accounts::existsById);
  }

  @Bean
  FileOwnerPolicy opportunityFilePolicy(OpportunityRepository opportunities) {
    return policy("OPPORTUNITY", opportunities::existsById);
  }

  @Bean
  FileOwnerPolicy quoteFilePolicy(QuoteRepository quotes) {
    return policy("QUOTE", quotes::existsById);
  }

  @Bean
  FileOwnerPolicy contractFilePolicy(ContractRepository contracts) {
    return policy("CONTRACT", contracts::existsById);
  }
}
