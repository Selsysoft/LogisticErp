package org.ece.blackrose.finance.service;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.ece.blackrose.identity.security.PersonalDataProtector;
import org.ece.blackrose.identity.security.PersonalDataProtector.TaxIdentity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Göç öncesi düz yazılmış 11 haneli cari vergi numaralarını (TCKN) şifreli + hash + maskeli
 * kolonlara taşır ({@code account.tax_number} boşalır). Anahtar uygulamada olduğu için SQL göçünde
 * yapılamaz; Flyway'den sonra her kiracı için çalışır. İdempotenttir; grup carisi (K-3) ve silinmiş
 * kartlar dahil tüm satırlar (12.1_TASARIM §2.4, S-23).
 */
@Component
public class AccountTaxNumberBackfill {

  private static final Logger log = LoggerFactory.getLogger(AccountTaxNumberBackfill.class);
  private static final Pattern SCHEMA = Pattern.compile("^[a-z][a-z0-9_]{0,62}$");
  static final int BATCH = 500;

  private final JdbcTemplate jdbc;
  private final PersonalDataProtector protector;

  public AccountTaxNumberBackfill(JdbcTemplate jdbc, PersonalDataProtector protector) {
    this.jdbc = jdbc;
    this.protector = protector;
  }

  /**
   * Hata kiracıyı kapatmaz: loglanır, sonraki açılışta yeniden denenir.
   *
   * @return taşınan satır sayısı; hata olursa -1
   */
  public int backfillQuietly(String schema) {
    try {
      return backfill(schema);
    } catch (RuntimeException ex) {
      log.error("Cari TCKN geri doldurma başarısız: {}", schema, ex);
      return -1;
    }
  }

  /** 500'lük partilerle taşır; taşınan satır sayısını döner. */
  public int backfill(String schema) {
    if (schema == null || !SCHEMA.matcher(schema).matches()) {
      throw new IllegalArgumentException("Geçersiz şema adı: " + schema);
    }
    String select =
        ("select id, tax_number from \"%s\".account where type <> 'INTERCOMPANY'"
                + " and tax_number ~ '^[0-9]{11}$' and tax_number_enc is null order by id limit "
                + BATCH)
            .formatted(schema);
    String update =
        ("update \"%s\".account set tax_number = null, tax_number_enc = ?, tax_number_hash = ?,"
                + " tax_number_masked = ? where id = ? and tax_number_enc is null")
            .formatted(schema);
    int total = 0;
    while (true) {
      List<Map<String, Object>> rows = jdbc.queryForList(select);
      if (rows.isEmpty()) {
        break;
      }
      List<Object[]> args =
          rows.stream()
              .map(
                  row -> {
                    TaxIdentity identity = protector.taxIdentity((String) row.get("tax_number"));
                    return new Object[] {
                      identity.enc(), identity.hash(), identity.masked(), (UUID) row.get("id")
                    };
                  })
              .toList();
      int changed = 0;
      for (int count : jdbc.batchUpdate(update, args)) {
        changed += Math.max(count, 0);
      }
      total += changed;
      if (changed == 0) {
        // Eşzamanlı bir çalıştırma aynı satırları aldı; döngüye girmemek için durulur.
        break;
      }
    }
    if (total > 0) {
      log.info("Cari TCKN geri doldurma: {} satır ({})", total, schema);
    }
    return total;
  }
}
