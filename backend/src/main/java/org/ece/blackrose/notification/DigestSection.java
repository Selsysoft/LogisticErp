package org.ece.blackrose.notification;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/** Günlük özete bölüm katan modül. Geçerli firma bağlamında çağrılır. */
public interface DigestSection {

  NotificationTopic topic();

  /** Gösterilecek bir şey yoksa boş döner. */
  Optional<Content> build(LocalDate today);

  /**
   * @param title e-posta konusunda ve bölüm başlığında kullanılır
   * @param lines madde satırları
   * @param path ayrıntı ekranının yolu (ör. /fleet)
   */
  record Content(String title, List<String> lines, String path) {}
}
