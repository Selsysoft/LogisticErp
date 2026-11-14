package org.ece.blackrose.finance.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.EnumMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.junit.jupiter.api.Test;

/** {@link AccountType#defaultSubGroup()} V27 tohumundaki {@code type_default} satırlarıyla aynı. */
class AccountGroupSeedTest {

  /** {@code ('MUSTERI', 'CUSTOMER', 'Müşteri', 'SALES', 'MUS', 10, TRUE, TRUE)}. */
  private static final Pattern ROW =
      Pattern.compile(
          "\\(\\s*'([A-Z_]+)',\\s*'([A-Z]+)',\\s*'[^']*',\\s*(?:'[A-Z]+'|NULL),\\s*'[A-Z]+',"
              + "\\s*\\d+,\\s*(TRUE|FALSE),\\s*(TRUE|FALSE)\\s*\\)");

  @Test
  void varsayilanAltGrupTohumlaAynidir() throws IOException {
    Map<AccountType, String> seeded = new EnumMap<>(AccountType.class);
    int rows = 0;
    Matcher matcher = ROW.matcher(v27());
    while (matcher.find()) {
      rows++;
      if (Boolean.parseBoolean(matcher.group(3).toLowerCase())) {
        String previous = seeded.put(AccountType.valueOf(matcher.group(2)), matcher.group(1));
        assertThat(previous).as("tür başına tek varsayılan grup").isNull();
      }
    }

    assertThat(rows).isEqualTo(14);
    assertThat(seeded).hasSize(AccountType.values().length);
    for (AccountType type : AccountType.values()) {
      assertThat(type.defaultSubGroup()).as(type.name()).isEqualTo(seeded.get(type));
    }
  }

  private static String v27() throws IOException {
    try (InputStream in =
        AccountGroupSeedTest.class.getResourceAsStream(
            "/db/migration/tenant/V27__account_profile.sql")) {
      assertThat(in).isNotNull();
      return new String(in.readAllBytes(), StandardCharsets.UTF_8);
    }
  }
}
