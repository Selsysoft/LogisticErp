package org.ece.blackrose.files;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;

/** Sahte clamd ile protokol. Gerçek clamd denemesi docs/URETIM_KURULUM.md'de anlatılır. */
class ClamAvScannerTest {

  private static final byte[] CONTENT = "dosya içeriği".getBytes(StandardCharsets.UTF_8);

  private record Received(String command, byte[] content) {}

  private String scanWithReply(String reply, CompletableFuture<Received> received)
      throws IOException {
    try (ServerSocket server = new ServerSocket(0)) {
      CompletableFuture.runAsync(() -> serve(server, reply, received));
      return new ClamAvScanner("localhost", server.getLocalPort())
          .findThreat(new ByteArrayInputStream(CONTENT));
    }
  }

  private static void serve(
      ServerSocket server, String reply, CompletableFuture<Received> received) {
    try (Socket socket = server.accept()) {
      DataInputStream in = new DataInputStream(socket.getInputStream());
      byte[] command = in.readNBytes("zINSTREAM\0".length());
      ByteArrayOutputStream content = new ByteArrayOutputStream();
      int length;
      while ((length = in.readInt()) > 0) {
        content.write(in.readNBytes(length));
      }
      received.complete(
          new Received(new String(command, StandardCharsets.US_ASCII), content.toByteArray()));
      socket.getOutputStream().write((reply + "\0").getBytes(StandardCharsets.US_ASCII));
    } catch (IOException ex) {
      received.completeExceptionally(ex);
    }
  }

  @Test
  void temizDosyaIcerigiProtokoleUygunGonderir() throws Exception {
    CompletableFuture<Received> received = new CompletableFuture<>();

    assertThat(scanWithReply("stream: OK", received)).isNull();

    assertThat(received.get().command()).isEqualTo("zINSTREAM\0");
    assertThat(received.get().content()).isEqualTo(CONTENT);
  }

  @Test
  void zararliDosyadaImzaAdiniDoner() throws Exception {
    assertThat(scanWithReply("stream: Eicar-Test-Signature FOUND", new CompletableFuture<>()))
        .isEqualTo("Eicar-Test-Signature");
  }

  @Test
  void beklenmeyenYanitTemizSayilmaz() {
    assertThatThrownBy(
            () -> scanWithReply("INSTREAM size limit exceeded. ERROR", new CompletableFuture<>()))
        .isInstanceOf(IOException.class);
  }

  @Test
  void tarayiciyaUlasilamazsaHataVerir() throws Exception {
    int closedPort;
    try (ServerSocket server = new ServerSocket(0)) {
      closedPort = server.getLocalPort();
    }

    assertThatThrownBy(
            () ->
                new ClamAvScanner("localhost", closedPort)
                    .findThreat(new ByteArrayInputStream(CONTENT)))
        .isInstanceOf(IOException.class);
  }
}
