package org.ece.blackrose.files;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * clamd'ye INSTREAM protokolüyle bağlanır. Beklenmeyen her yanıt hata sayılır; böylece taranamayan
 * dosya temiz kabul edilmez.
 */
public class ClamAvScanner implements FileScanner {

  private static final byte[] COMMAND = "zINSTREAM\0".getBytes(StandardCharsets.US_ASCII);
  private static final byte[] PING = "zPING\0".getBytes(StandardCharsets.US_ASCII);
  private static final int CHUNK_BYTES = 64 * 1024;
  private static final int CONNECT_TIMEOUT_MILLIS = 3_000;
  private static final int READ_TIMEOUT_MILLIS = 60_000;
  private static final int MAX_REPLY_BYTES = 1_024;
  private static final String CLEAN_REPLY = "stream: OK";
  private static final String THREAT_PREFIX = "stream: ";
  private static final String THREAT_SUFFIX = " FOUND";

  private final String host;
  private final int port;

  public ClamAvScanner(String host, int port) {
    this.host = host;
    this.port = port;
  }

  @Override
  public String findThreat(InputStream content) throws IOException {
    try (Socket socket = new Socket()) {
      socket.connect(new InetSocketAddress(host, port), CONNECT_TIMEOUT_MILLIS);
      socket.setSoTimeout(READ_TIMEOUT_MILLIS);
      DataOutputStream out = new DataOutputStream(socket.getOutputStream());
      out.write(COMMAND);
      byte[] chunk = new byte[CHUNK_BYTES];
      int read;
      while ((read = content.read(chunk)) > 0) {
        out.writeInt(read);
        out.write(chunk, 0, read);
      }
      out.writeInt(0);
      out.flush();
      return parse(readReply(socket.getInputStream()));
    }
  }

  /** clamd'nin PING komutuna PONG dönmesini bekler. */
  @Override
  public void check() throws IOException {
    try (Socket socket = new Socket()) {
      socket.connect(new InetSocketAddress(host, port), CONNECT_TIMEOUT_MILLIS);
      socket.setSoTimeout(CONNECT_TIMEOUT_MILLIS);
      socket.getOutputStream().write(PING);
      socket.getOutputStream().flush();
      String reply = readReply(socket.getInputStream());
      if (!"PONG".equals(reply)) {
        throw new IOException("Beklenmeyen tarayıcı yanıtı: " + reply);
      }
    }
  }

  private static String readReply(InputStream in) throws IOException {
    ByteArrayOutputStream reply = new ByteArrayOutputStream();
    int value;
    while ((value = in.read()) > 0 && reply.size() < MAX_REPLY_BYTES) {
      reply.write(value);
    }
    return reply.toString(StandardCharsets.US_ASCII).trim();
  }

  private static String parse(String reply) throws IOException {
    if (CLEAN_REPLY.equals(reply)) {
      return null;
    }
    if (reply.startsWith(THREAT_PREFIX) && reply.endsWith(THREAT_SUFFIX)) {
      return reply.substring(THREAT_PREFIX.length(), reply.length() - THREAT_SUFFIX.length());
    }
    throw new IOException("Beklenmeyen tarayıcı yanıtı: " + reply);
  }
}
