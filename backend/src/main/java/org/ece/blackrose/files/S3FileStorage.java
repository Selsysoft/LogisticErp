package org.ece.blackrose.files;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3ClientBuilder;

/**
 * S3 uyumlu nesne deposu (AWS, MinIO, Cloudflare R2...). Anahtar düzeni yerel diskle aynıdır, bu
 * yüzden mevcut dosyalar olduğu gibi kopyalanabilir. Bucket yoksa veya erişilemiyorsa uygulama
 * açılmaz.
 */
public class S3FileStorage implements FileStorage, AutoCloseable {

  public record Settings(
      String bucket, String region, String endpoint, String accessKey, String secretKey) {}

  private final S3Client client;
  private final String bucket;

  public S3FileStorage(Settings settings) {
    this.bucket = settings.bucket();
    S3ClientBuilder builder =
        S3Client.builder()
            .region(Region.of(settings.region()))
            .credentialsProvider(credentials(settings));
    if (hasText(settings.endpoint())) {
      // Uyumlu sağlayıcılarda sanal sunucu adresleri ve yeni sağlama toplamı başlıkları
      // çalışmayabilir.
      builder
          .endpointOverride(URI.create(settings.endpoint()))
          .forcePathStyle(true)
          .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
          .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED);
    }
    this.client = builder.build();
    this.client.headBucket(request -> request.bucket(bucket));
  }

  @Override
  public void write(String key, InputStream content, long size) throws IOException {
    try {
      client.putObject(
          request -> request.bucket(bucket).key(key), RequestBody.fromInputStream(content, size));
    } catch (SdkException ex) {
      throw new IOException("Dosya yazılamadı: " + key, ex);
    }
  }

  @Override
  public InputStream read(String key) throws IOException {
    try {
      return client.getObject(request -> request.bucket(bucket).key(key));
    } catch (SdkException ex) {
      throw new IOException("Dosya okunamadı: " + key, ex);
    }
  }

  @Override
  public void check() throws IOException {
    try {
      client.headBucket(request -> request.bucket(bucket));
    } catch (SdkException ex) {
      throw new IOException("Bucket'a erişilemiyor: " + bucket, ex);
    }
  }

  @Override
  public String describe() {
    return "S3 (" + bucket + ")";
  }

  @Override
  public void close() {
    client.close();
  }

  private static AwsCredentialsProvider credentials(Settings settings) {
    return hasText(settings.accessKey())
        ? StaticCredentialsProvider.create(
            AwsBasicCredentials.create(settings.accessKey(), settings.secretKey()))
        : DefaultCredentialsProvider.builder().build();
  }

  private static boolean hasText(String value) {
    return value != null && !value.isBlank();
  }
}
