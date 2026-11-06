package org.ece.blackrose.files;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

class S3FileStorageIT {

  private static final String USER = "test-kullanici";
  private static final String SECRET = "test-gizli-anahtar";
  private static final String BUCKET = "blackrose-test";
  private static final String REGION = "eu-central-1";

  private static final GenericContainer<?> S3 =
      new GenericContainer<>("adobe/s3mock:4.7.0")
          .withExposedPorts(9090)
          .waitingFor(Wait.forListeningPort());

  static {
    S3.start();
  }

  private static String endpoint() {
    return "http://" + S3.getHost() + ":" + S3.getMappedPort(9090);
  }

  private static S3FileStorage storage(String bucket) {
    return new S3FileStorage(new S3FileStorage.Settings(bucket, REGION, endpoint(), USER, SECRET));
  }

  @BeforeAll
  static void createBucket() {
    try (S3Client client =
        S3Client.builder()
            .region(Region.of(REGION))
            .endpointOverride(URI.create(endpoint()))
            .forcePathStyle(true)
            .credentialsProvider(
                StaticCredentialsProvider.create(AwsBasicCredentials.create(USER, SECRET)))
            .build()) {
      client.createBucket(request -> request.bucket(BUCKET));
    }
  }

  @Test
  void yazilanIcerikAynenOkunur() throws Exception {
    byte[] content = "çalışan içerik".getBytes(StandardCharsets.UTF_8);
    try (S3FileStorage storage = storage(BUCKET)) {
      storage.write("tenant_a/dosya", new ByteArrayInputStream(content), content.length);

      try (InputStream read = storage.read("tenant_a/dosya")) {
        assertThat(read.readAllBytes()).isEqualTo(content);
      }
    }
  }

  @Test
  void olmayanDosyaIOExceptionVerir() {
    try (S3FileStorage storage = storage(BUCKET)) {
      assertThatThrownBy(() -> storage.read("tenant_a/olmayan")).isInstanceOf(IOException.class);
    }
  }

  @Test
  void bucketYoksaAcilmaz() {
    assertThatThrownBy(() -> storage("olmayan-bucket")).isInstanceOf(SdkException.class);
  }
}
