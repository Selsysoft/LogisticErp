package org.ece.blackrose.crm.service;

import java.util.UUID;
import java.util.function.Consumer;
import java.util.function.Predicate;
import org.ece.blackrose.crm.repository.CrmRepositories.ContractRepository;
import org.ece.blackrose.crm.repository.CrmRepositories.OpportunityRepository;
import org.ece.blackrose.crm.repository.CrmRepositories.QuoteRepository;
import org.ece.blackrose.files.FileOwnerPolicy;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.service.AccountAccess;
import org.ece.blackrose.organization.BranchScopeService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * CRM kayıtlarına eklenen dosyaların izin kuralları. Cari dosyaları personel carisi kuralına
 * (izinsiz kullanıcıya 404), teklif ve sözleşme dosyaları belgenin şirketine (LIMITED kullanıcıda
 * 403 {@code COMPANY_OUT_OF_SCOPE}) bağlıdır; cari kartı ortak olduğundan iş yeri süzgeci yoktur.
 */
@Configuration
public class CrmFilePolicies {

  private static final String VIEW = "CRM_VIEW";
  private static final String EDIT = "CRM_EDIT";

  private static FileOwnerPolicy policy(String type, Predicate<UUID> exists) {
    return policy(type, exists, ownerId -> {});
  }

  private static FileOwnerPolicy policy(
      String type, Predicate<UUID> exists, Consumer<UUID> access) {
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

      @Override
      public void requireAccess(UUID ownerId) {
        access.accept(ownerId);
      }
    };
  }

  @Bean
  FileOwnerPolicy accountFilePolicy(AccountRepository accounts, AccountAccess access) {
    return policy(
        "ACCOUNT",
        accounts::existsById,
        ownerId -> accounts.findById(ownerId).ifPresent(access::requireReadable));
  }

  @Bean
  FileOwnerPolicy opportunityFilePolicy(OpportunityRepository opportunities) {
    return policy("OPPORTUNITY", opportunities::existsById);
  }

  @Bean
  FileOwnerPolicy quoteFilePolicy(QuoteRepository quotes, BranchScopeService scope) {
    return policy(
        "QUOTE",
        quotes::existsById,
        ownerId ->
            quotes
                .findById(ownerId)
                .ifPresent(quote -> requireCompany(scope, quote.getCompanyId())));
  }

  @Bean
  FileOwnerPolicy contractFilePolicy(ContractRepository contracts, BranchScopeService scope) {
    return policy(
        "CONTRACT",
        contracts::existsById,
        ownerId ->
            contracts
                .findById(ownerId)
                .ifPresent(contract -> requireCompany(scope, contract.getCompanyId())));
  }

  private static void requireCompany(BranchScopeService scope, UUID companyId) {
    if (companyId != null) {
      scope.requireCompanyVisible(companyId);
    }
  }
}
