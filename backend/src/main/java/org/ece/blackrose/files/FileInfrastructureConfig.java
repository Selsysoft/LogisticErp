package org.ece.blackrose.files;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Saklama ve tarama sağlayıcısı ortam ayarıyla seçilir. stage/prod'da tarama varsayılan açıktır.
 */
@Configuration
public class FileInfrastructureConfig {

  @Bean
  @ConditionalOnProperty(name = "app.files.storage", havingValue = "local", matchIfMissing = true)
  FileStorage localFileStorage(@Value("${app.files.root}") String root) {
    return new LocalFileStorage(root);
  }

  @Bean
  @ConditionalOnProperty(name = "app.files.storage", havingValue = "s3")
  FileStorage s3FileStorage(
      @Value("${app.files.s3.bucket}") String bucket,
      @Value("${app.files.s3.region}") String region,
      @Value("${app.files.s3.endpoint:}") String endpoint,
      @Value("${app.files.s3.access-key:}") String accessKey,
      @Value("${app.files.s3.secret-key:}") String secretKey) {
    return new S3FileStorage(
        new S3FileStorage.Settings(bucket, region, endpoint, accessKey, secretKey));
  }

  @Bean
  @ConditionalOnProperty(name = "app.files.scan.mode", havingValue = "clamav")
  FileScanner clamAvScanner(
      @Value("${app.files.scan.host}") String host, @Value("${app.files.scan.port}") int port) {
    return new ClamAvScanner(host, port);
  }

  @Bean
  @ConditionalOnProperty(name = "app.files.scan.mode", havingValue = "none", matchIfMissing = true)
  FileScanner noFileScanner() {
    return content -> null;
  }
}
