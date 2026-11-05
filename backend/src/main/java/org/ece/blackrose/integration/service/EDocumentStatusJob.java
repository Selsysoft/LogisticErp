package org.ece.blackrose.integration.service;

import org.ece.blackrose.tenant.TenantJobs;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Gönderilen belgelerin sonucunu düzenli olarak sorar. */
@Component
public class EDocumentStatusJob {

  private final TenantJobs tenantJobs;
  private final EDocumentService documents;

  public EDocumentStatusJob(TenantJobs tenantJobs, EDocumentService documents) {
    this.tenantJobs = tenantJobs;
    this.documents = documents;
  }

  @Scheduled(fixedDelayString = "PT15M", initialDelayString = "PT15M")
  public void refresh() {
    tenantJobs.forEachActiveTenant(documents::refreshPending);
  }
}
