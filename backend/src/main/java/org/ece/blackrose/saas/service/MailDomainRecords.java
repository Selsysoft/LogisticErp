package org.ece.blackrose.saas.service;

import java.util.ArrayList;
import java.util.Hashtable;
import java.util.List;
import java.util.Locale;
import javax.naming.Context;
import javax.naming.NameNotFoundException;
import javax.naming.NamingEnumeration;
import javax.naming.NamingException;
import javax.naming.directory.Attribute;
import javax.naming.directory.Attributes;
import javax.naming.directory.DirContext;
import javax.naming.directory.InitialDirContext;

/**
 * Gönderen alan adının e-posta doğrulama kayıtları. Sağlayıcı seçilmeden de SPF ve DMARC'ın tanımlı
 * olup olmadığı görülür; DKIM seçicisi sağlayıcıya özgü olduğundan yalnız verilirse bakılır. Eksik
 * kayıt gönderimi durdurmaz ama e-postalar istenmeyen postaya düşebilir.
 */
public class MailDomainRecords {

  /** TXT kayıtlarını döner; kayıt yoksa boş liste. Testte sahtesi verilir. */
  @FunctionalInterface
  public interface TxtLookup {
    List<String> txt(String name) throws NamingException;
  }

  public record Report(String domain, boolean spf, boolean dmarc, Boolean dkim) {

    public List<String> missing() {
      List<String> missing = new ArrayList<>();
      if (!spf) {
        missing.add("SPF");
      }
      if (!dmarc) {
        missing.add("DMARC");
      }
      if (Boolean.FALSE.equals(dkim)) {
        missing.add("DKIM");
      }
      return missing;
    }
  }

  private final TxtLookup lookup;

  public MailDomainRecords(TxtLookup lookup) {
    this.lookup = lookup;
  }

  /** "Ad <adres@alan>" veya "adres@alan" biçimindeki gönderenden alan adını çıkarır. */
  static String domainOf(String from) {
    if (from == null) {
      return null;
    }
    String address = from.strip();
    int open = address.lastIndexOf('<');
    if (open >= 0 && address.endsWith(">")) {
      address = address.substring(open + 1, address.length() - 1);
    }
    int at = address.lastIndexOf('@');
    if (at < 0 || at == address.length() - 1) {
      return null;
    }
    return address.substring(at + 1).toLowerCase(Locale.ROOT);
  }

  public Report check(String domain, String dkimSelector) throws NamingException {
    boolean spf = any(domain, "v=spf1");
    boolean dmarc = any("_dmarc." + domain, "v=DMARC1");
    Boolean dkim =
        dkimSelector == null || dkimSelector.isBlank()
            ? null
            : lookup.txt(dkimSelector.strip() + "._domainkey." + domain).stream()
                .anyMatch(record -> record.contains("p="));
    return new Report(domain, spf, dmarc, dkim);
  }

  private boolean any(String name, String prefix) throws NamingException {
    return lookup.txt(name).stream()
        .anyMatch(
            record ->
                record
                    .strip()
                    .toLowerCase(Locale.ROOT)
                    .startsWith(prefix.toLowerCase(Locale.ROOT)));
  }

  /** JDK'nın DNS istemcisi; sistemin çözücüsünü kullanır, kısa zaman aşımlıdır. */
  public static TxtLookup dns() {
    return name -> {
      Hashtable<String, String> env = new Hashtable<>();
      env.put(Context.INITIAL_CONTEXT_FACTORY, "com.sun.jndi.dns.DnsContextFactory");
      env.put("com.sun.jndi.dns.timeout.initial", "2000");
      env.put("com.sun.jndi.dns.timeout.retries", "1");
      DirContext context = new InitialDirContext(env);
      try {
        Attributes attributes = context.getAttributes(name, new String[] {"TXT"});
        Attribute txt = attributes.get("TXT");
        List<String> records = new ArrayList<>();
        if (txt != null) {
          NamingEnumeration<?> values = txt.getAll();
          while (values.hasMore()) {
            // Uzun kayıt tırnaklı parçalar halinde gelir: "v=spf1 ..." "... ~all"
            records.add(String.valueOf(values.next()).replaceAll("\"\\s*\"", "").replace("\"", ""));
          }
        }
        return records;
      } catch (NameNotFoundException ex) {
        return List.of();
      } finally {
        context.close();
      }
    };
  }
}
