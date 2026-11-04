package org.ece.blackrose.tenant.hibernate;

import java.sql.Connection;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.hibernate.engine.jdbc.connections.spi.MultiTenantConnectionProvider;
import org.springframework.stereotype.Component;

/** Bağlantıyı istenen şemaya alır; havuza dönerken admin şemasına geri çeker. */
@Component
public class SchemaConnectionProvider implements MultiTenantConnectionProvider<String> {

  private final transient DataSource dataSource;

  public SchemaConnectionProvider(DataSource dataSource) {
    this.dataSource = dataSource;
  }

  @Override
  public Connection getAnyConnection() throws SQLException {
    return dataSource.getConnection();
  }

  @Override
  public void releaseAnyConnection(Connection connection) throws SQLException {
    connection.close();
  }

  @Override
  public Connection getConnection(String schema) throws SQLException {
    Connection connection = dataSource.getConnection();
    try {
      connection.setSchema(schema);
      return connection;
    } catch (SQLException ex) {
      connection.close();
      throw ex;
    }
  }

  @Override
  public void releaseConnection(String schema, Connection connection) throws SQLException {
    try {
      connection.setSchema(TenantIdentifierResolver.ADMIN_SCHEMA);
    } finally {
      connection.close();
    }
  }

  @Override
  public boolean supportsAggressiveRelease() {
    return false;
  }

  @Override
  public boolean isUnwrappableAs(Class<?> unwrapType) {
    return unwrapType.isInstance(this);
  }

  @Override
  public <T> T unwrap(Class<T> unwrapType) {
    return unwrapType.cast(this);
  }
}
