package org.ece.blackrose.identity.service;

import java.util.UUID;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.domain.AuditLog;
import org.ece.blackrose.identity.repository.IdentityRepositories.AuditLogRepository;
import org.ece.blackrose.identity.security.AuthenticatedUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** Ana işlem geri alınsa da denetim kaydı kalır; denetim hatası ana işlemi bozmaz. */
@Service
public class AuditService {

  private static final Logger log = LoggerFactory.getLogger(AuditService.class);

  private final AuditLogRepository logs;
  private final TransactionTemplate newTransaction;

  public AuditService(AuditLogRepository logs, PlatformTransactionManager transactionManager) {
    this.logs = logs;
    this.newTransaction = new TransactionTemplate(transactionManager);
    this.newTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
  }

  public void record(AuditEvent event, String target, String details) {
    AuthenticatedUser actor = AuthenticatedUser.current().orElse(null);
    record(
        event,
        actor != null ? actor.id() : null,
        actor != null ? actor.email() : null,
        target,
        details);
  }

  public void record(
      AuditEvent event, UUID actorId, String actorEmail, String target, String details) {
    AuditLog entry =
        new AuditLog(
            event.name(), actorId, actorEmail, target, details, clientIp(), MDC.get("traceId"));
    try {
      newTransaction.executeWithoutResult(status -> logs.save(entry));
    } catch (RuntimeException ex) {
      log.error("Denetim kaydı yazılamadı: {}", event, ex);
    }
  }

  private static String clientIp() {
    return RequestContextHolder.getRequestAttributes()
            instanceof ServletRequestAttributes attributes
        ? attributes.getRequest().getRemoteAddr()
        : null;
  }
}
