package org.ece.blackrose.finance.service;

import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.Account;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Cari–şirket kimlik kuralı (MX5 D6, 12.1 §3.1): şirket kendi grup carisine hareket yazamaz; bir
 * şirkete bağlı kart başka şirketin belgesinde kullanılamaz. Yalnız kullanıcı girişli yollarda
 * çağrılır (elle hareket, ödeme/tahsilat, alış faturası, elle plan, cari belgesi, taşıma hedefi);
 * türetilmiş akışlar (sefer kapanışı, fatura, plan ödemesi) {@code LedgerService} üzerinden bu
 * kurala takılmadan çalışır (§9 OK-28).
 */
@Component
public class CompanyIdentityRule {

  public void require(Account account, UUID companyId) {
    if (companyId == null) {
      return;
    }
    if (companyId.equals(account.getRepresentsCompanyId())) {
      throw mismatch("Şirket kendi grup carisine hareket yazamaz.");
    }
    if (account.getCompanyId() != null && !account.getCompanyId().equals(companyId)) {
      throw mismatch("Cari bu şirkete ait değil.");
    }
  }

  private static BusinessException mismatch(String message) {
    return new BusinessException(HttpStatus.UNPROCESSABLE_ENTITY, "COMPANY_MISMATCH", message);
  }
}
