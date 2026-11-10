package org.ece.blackrose.common.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.util.unit.DataSize;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Dosya yüklemesi olmayan isteklerin gövdesini sınırlar. JSON gövdesi belleğe okunur; oturum
 * gerektirmeyen uçlara (giriş, webhook) gönderilen büyük gövdeler, kimlik veya imza denetlenmeden
 * önce belleği doldurabilir. {@code Content-Length} sınırı aşıyorsa gövde hiç okunmadan 413 döner;
 * uzunluğu bildirilmeyen (parçalı) gövdede okuma sınırda kesilir ve istek reddedilir. Dosya
 * yüklemeleri (multipart) kendi sınırıyla ({@code spring.servlet.multipart}) denetlenir.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 5)
public class RequestSizeLimitFilter extends OncePerRequestFilter {

  private final long maxBytes;
  private final ApiErrorWriter errors;

  public RequestSizeLimitFilter(
      @Value("${app.http.max-body-size:2MB}") DataSize maxBody, ApiErrorWriter errors) {
    this.maxBytes = maxBody.toBytes();
    this.errors = errors;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    String type = request.getContentType();
    return type != null && type.toLowerCase().startsWith("multipart/");
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    if (request.getContentLengthLong() > maxBytes) {
      errors.write(
          response,
          HttpStatus.PAYLOAD_TOO_LARGE,
          "PAYLOAD_TOO_LARGE",
          "İstek gövdesi çok büyük (en çok " + maxBytes / 1024 + " KB).");
      return;
    }
    chain.doFilter(new Limited(request, maxBytes), response);
  }

  /** Okunan bayt sınırı aşınca okuma hata verir. */
  static final class Limited extends HttpServletRequestWrapper {

    private final long maxBytes;
    private ServletInputStream stream;

    Limited(HttpServletRequest request, long maxBytes) {
      super(request);
      this.maxBytes = maxBytes;
    }

    @Override
    public ServletInputStream getInputStream() throws IOException {
      if (stream == null) {
        stream = new LimitedStream(super.getInputStream(), maxBytes);
      }
      return stream;
    }
  }

  static final class LimitedStream extends ServletInputStream {

    private final ServletInputStream delegate;
    private final long maxBytes;
    private long read;

    LimitedStream(ServletInputStream delegate, long maxBytes) {
      this.delegate = delegate;
      this.maxBytes = maxBytes;
    }

    @Override
    public int read() throws IOException {
      int value = delegate.read();
      if (value >= 0) {
        count(1);
      }
      return value;
    }

    @Override
    public int read(byte[] buffer, int offset, int length) throws IOException {
      int count = delegate.read(buffer, offset, length);
      if (count > 0) {
        count(count);
      }
      return count;
    }

    private void count(int bytes) throws IOException {
      read += bytes;
      if (read > maxBytes) {
        throw new IOException("İstek gövdesi " + maxBytes + " baytı aşıyor.");
      }
    }

    @Override
    public boolean isFinished() {
      return delegate.isFinished();
    }

    @Override
    public boolean isReady() {
      return delegate.isReady();
    }

    @Override
    public void setReadListener(ReadListener listener) {
      delegate.setReadListener(listener);
    }
  }
}
