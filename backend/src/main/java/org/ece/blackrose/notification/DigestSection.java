package org.ece.blackrose.notification;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.ece.blackrose.organization.BranchFilter;

/**
 * Günlük özete bölüm katan modül. Geçerli firma bağlamında, oturumsuz çağrılır; alıcının iş yeri
 * kapsamı {@code filter} ile verilir (ALL alıcıda {@link BranchFilter#all}).
 */
public interface DigestSection {

  NotificationTopic topic();

  /** Gösterilecek bir şey yoksa boş döner. İçerik {@code filter} kapsamıyla sınırlıdır. */
  Optional<Content> build(LocalDate today, BranchFilter filter);

  /**
   * Alıcının personel carilerini görme izni ({@code FINANCE_EMPLOYEE_VIEW}) içeriği etkiliyorsa
   * bölüm bunu ezer; izinsiz alıcıya personel carisinin adı yazılmaz (12.1 §3.1, SEC-12.1-03).
   * Varsayılan izinden bağımsızdır.
   */
  default Optional<Content> build(LocalDate today, BranchFilter filter, boolean employeeVisible) {
    return build(today, filter);
  }

  /**
   * @param title e-posta konusunda ve bölüm başlığında kullanılır
   * @param lines madde satırları
   * @param path ayrıntı ekranının yolu (ör. /fleet)
   */
  record Content(String title, List<String> lines, String path) {}
}
