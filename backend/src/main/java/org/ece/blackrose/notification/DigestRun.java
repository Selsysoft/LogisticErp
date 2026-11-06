package org.ece.blackrose.notification;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;

/** Özetin gönderildiği gün; yalnız üstlenme sorgusu için eşlenir. */
@Entity
@Table(name = "notification_digest_run")
public class DigestRun {

  @Id private LocalDate day;

  protected DigestRun() {}

  public LocalDate getDay() {
    return day;
  }
}
