package org.ece.blackrose.saas.service;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import javax.sql.DataSource;
import org.ece.blackrose.tenant.domain.Tenant;
import org.springframework.stereotype.Service;

/**
 * Firma verisini tablo başına bir CSV olarak ZIP'e yazar. Veriler tek bir tutarlı anlık görüntüden
 * okunur. Oturum tabloları ve parola, token, gizli anahtar sütunları hiçbir zaman dışarı çıkmaz.
 */
@Service
public class TenantDataExporter {

  static final Set<String> EXCLUDED_TABLES =
      Set.of("flyway_schema_history", "refresh_token", "revoked_access_token", "user_token");
  static final Pattern EXCLUDED_COLUMNS =
      Pattern.compile("password|secret|token|hash|totp|otp|credential");

  private static final int FETCH_SIZE = 500;

  private final DataSource dataSource;

  public TenantDataExporter(DataSource dataSource) {
    this.dataSource = dataSource;
  }

  public void write(Tenant tenant, OutputStream target) throws IOException, SQLException {
    try (Connection connection = dataSource.getConnection();
        ZipOutputStream zip = new ZipOutputStream(target, StandardCharsets.UTF_8)) {
      // Anlık görüntü için işlem açılır; sürücü de yalnız bu durumda satırları parça parça getirir.
      boolean autoCommit = connection.getAutoCommit();
      int isolation = connection.getTransactionIsolation();
      connection.setAutoCommit(false);
      connection.setTransactionIsolation(Connection.TRANSACTION_REPEATABLE_READ);
      try {
        BufferedWriter writer =
            new BufferedWriter(new OutputStreamWriter(zip, StandardCharsets.UTF_8));
        List<String> tables = tables(connection, tenant.getSchemaName());
        writeManifest(zip, writer, tenant, tables);
        for (String table : tables) {
          writeTable(connection, zip, writer, tenant.getSchemaName(), table);
        }
        zip.finish();
        connection.rollback();
      } finally {
        connection.setAutoCommit(autoCommit);
        connection.setTransactionIsolation(isolation);
      }
    }
  }

  private static void writeManifest(
      ZipOutputStream zip, BufferedWriter writer, Tenant tenant, List<String> tables)
      throws IOException {
    zip.putNextEntry(new ZipEntry("BENIOKU.txt"));
    writer.write("Firma: " + tenant.getCode() + " (" + tenant.getName() + ")\n");
    writer.write("Tablolar: " + tables.size() + "\n");
    writer.write("Parola, token ve gizli anahtar alanları dahil değildir.\n");
    writer.write("Yüklenen dosyaların içeriği dahil değildir; yalnız kayıt bilgileri vardır.\n");
    writer.flush();
    zip.closeEntry();
  }

  private static List<String> tables(Connection connection, String schema) throws SQLException {
    List<String> names = new ArrayList<>();
    try (PreparedStatement statement =
        connection.prepareStatement(
            """
            select table_name from information_schema.tables
            where table_schema = ? and table_type = 'BASE TABLE' order by table_name
            """)) {
      statement.setString(1, schema);
      try (ResultSet rows = statement.executeQuery()) {
        while (rows.next()) {
          if (!EXCLUDED_TABLES.contains(rows.getString(1))) {
            names.add(rows.getString(1));
          }
        }
      }
    }
    return names;
  }

  private static List<String> columns(Connection connection, String schema, String table)
      throws SQLException {
    List<String> names = new ArrayList<>();
    try (PreparedStatement statement =
        connection.prepareStatement(
            """
            select column_name from information_schema.columns
            where table_schema = ? and table_name = ? order by ordinal_position
            """)) {
      statement.setString(1, schema);
      statement.setString(2, table);
      try (ResultSet rows = statement.executeQuery()) {
        while (rows.next()) {
          if (!EXCLUDED_COLUMNS.matcher(rows.getString(1)).find()) {
            names.add(rows.getString(1));
          }
        }
      }
    }
    return names;
  }

  private static void writeTable(
      Connection connection,
      ZipOutputStream zip,
      BufferedWriter writer,
      String schema,
      String table)
      throws SQLException, IOException {
    List<String> columns = columns(connection, schema, table);
    if (columns.isEmpty()) {
      return;
    }
    String select =
        "select "
            + String.join(", ", columns.stream().map(TenantDataExporter::quote).toList())
            + " from "
            + quote(schema)
            + "."
            + quote(table);
    zip.putNextEntry(new ZipEntry(table + ".csv"));
    writer.write(String.join(",", columns));
    writer.write("\r\n");
    try (Statement statement = connection.createStatement()) {
      statement.setFetchSize(FETCH_SIZE);
      try (ResultSet rows = statement.executeQuery(select)) {
        while (rows.next()) {
          for (int i = 1; i <= columns.size(); i++) {
            if (i > 1) {
              writer.write(',');
            }
            writer.write(csv(rows.getString(i)));
          }
          writer.write("\r\n");
        }
      }
    }
    writer.flush();
    zip.closeEntry();
  }

  static String csv(String value) {
    if (value == null) {
      return "";
    }
    boolean needsQuote =
        value.indexOf(',') >= 0
            || value.indexOf('"') >= 0
            || value.indexOf('\n') >= 0
            || value.indexOf('\r') >= 0;
    return needsQuote ? '"' + value.replace("\"", "\"\"") + '"' : value;
  }

  private static String quote(String identifier) {
    return '"' + identifier.replace("\"", "\"\"") + '"';
  }
}
