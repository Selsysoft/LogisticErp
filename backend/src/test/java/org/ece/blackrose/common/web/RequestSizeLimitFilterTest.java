package org.ece.blackrose.common.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.DelegatingServletInputStream;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.util.unit.DataSize;

class RequestSizeLimitFilterTest {

  private final RequestSizeLimitFilter filter =
      new RequestSizeLimitFilter(DataSize.ofBytes(10), new ApiErrorWriter(new ObjectMapper()));

  @Test
  void uzunluguBildirilmeyenGovdeSinirdaKesilir() throws IOException {
    var stream =
        new RequestSizeLimitFilter.LimitedStream(
            new DelegatingServletInputStream(new ByteArrayInputStream(new byte[11])), 10);

    assertThat(stream.read(new byte[10], 0, 10)).isEqualTo(10);
    assertThatThrownBy(stream::read).isInstanceOf(IOException.class).hasMessageContaining("10");
  }

  @Test
  void sinirIcindekiGovdeAynenOkunur() throws IOException {
    var stream =
        new RequestSizeLimitFilter.LimitedStream(
            new DelegatingServletInputStream(new ByteArrayInputStream("{\"a\":1}".getBytes())), 10);

    assertThat(new String(stream.readAllBytes())).isEqualTo("{\"a\":1}");
  }

  @Test
  void bildirilenUzunlukAsiliyorsaZincireGitmeden413Doner() throws Exception {
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/auth/login");
    request.setContentType("application/json");
    request.setContent(new byte[11]);
    MockHttpServletResponse response = new MockHttpServletResponse();
    AtomicBoolean reached = new AtomicBoolean();

    filter.doFilter(request, response, (req, res) -> reached.set(true));

    assertThat(response.getStatus()).isEqualTo(413);
    assertThat(response.getContentAsString()).contains("PAYLOAD_TOO_LARGE");
    assertThat(reached).isFalse();
  }

  @Test
  void dosyaYuklemesiBuFiltredenGecmez() {
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/files");
    request.setContentType("multipart/form-data; boundary=x");

    assertThat(filter.shouldNotFilter(request)).isTrue();
  }
}
