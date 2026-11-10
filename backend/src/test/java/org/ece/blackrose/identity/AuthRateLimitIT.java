package org.ece.blackrose.identity;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.ece.blackrose.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.ResultActions;

@TestPropertySource(
    properties = {
      "app.security.rate-limit.login-per-minute=3",
      "app.security.rate-limit.tracking-per-minute=3",
      "app.security.rate-limit.webhook-per-minute=3",
      "app.http.max-body-size=1KB"
    })
class AuthRateLimitIT extends AbstractIntegrationTest {

  private ResultActions adminLogin(String ip) throws Exception {
    return mvc.perform(
        post("/api/v1/admin/auth/login")
            .with(
                request -> {
                  request.setRemoteAddr(ip);
                  return request;
                })
            .contentType(MediaType.APPLICATION_JSON)
            .content(loginJson("yok@blackrose.test", "Yanlis-Sifre-123", null)));
  }

  @Test
  void ayniIpSinirdanSonra429AlirBaskaIpEtkilenmez() throws Exception {
    for (int i = 0; i < 3; i++) {
      adminLogin("10.0.0.1").andExpect(status().isUnauthorized());
    }

    adminLogin("10.0.0.1")
        .andExpect(status().isTooManyRequests())
        .andExpect(header().exists("Retry-After"))
        .andExpect(jsonPath("$.code").value("TOO_MANY_REQUESTS"));

    adminLogin("10.0.0.2").andExpect(status().isUnauthorized());
  }

  @Test
  void firmaBulunamasaDaDenemeSayilir() throws Exception {
    for (int i = 0; i < 3; i++) {
      tenantLogin("10.0.0.3").andExpect(status().is4xxClientError());
    }

    tenantLogin("10.0.0.3").andExpect(status().isTooManyRequests());
  }

  @Test
  void takipAnahtariTaramasiDaSinirlanir() throws Exception {
    for (int i = 0; i < 3; i++) {
      tracking("10.0.0.4").andExpect(status().is4xxClientError());
    }

    tracking("10.0.0.4")
        .andExpect(status().isTooManyRequests())
        .andExpect(header().exists("Retry-After"));
    tracking("10.0.0.5").andExpect(status().is4xxClientError());
  }

  @Test
  void webhookImzaDenetlenmedenOnceSinirlanir() throws Exception {
    for (int i = 0; i < 3; i++) {
      webhook("10.0.0.6", "{}").andExpect(status().isUnauthorized());
    }

    webhook("10.0.0.6", "{}")
        .andExpect(status().isTooManyRequests())
        .andExpect(header().exists("Retry-After"));
  }

  @Test
  void buyukGovdeOkunmadanReddedilirDosyaYuklemesiEtkilenmez() throws Exception {
    String big = "{\"email\":\"" + "a".repeat(2048) + "\"}";

    webhook("10.0.0.7", big)
        .andExpect(status().isPayloadTooLarge())
        .andExpect(jsonPath("$.code").value("PAYLOAD_TOO_LARGE"));
    mvc.perform(
            post("/api/v1/auth/login")
                .with(tenant("olmayan-firma"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(big))
        .andExpect(status().isPayloadTooLarge());

    // Dosya yüklemesi kendi sınırıyla denetlenir; bu filtre onu durdurmaz (firma yok: 400, 413
    // değil).
    mvc.perform(
            org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart(
                    "/api/v1/finance/opening-balances/preview")
                .file(
                    new org.springframework.mock.web.MockMultipartFile(
                        "file", "acilis.csv", "text/csv", new byte[4096])))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value(org.hamcrest.Matchers.not("PAYLOAD_TOO_LARGE")));
  }

  private ResultActions webhook(String ip, String body) throws Exception {
    return mvc.perform(
        post("/api/v1/webhooks/bulkmail")
            .with(
                request -> {
                  request.setRemoteAddr(ip);
                  return request;
                })
            .contentType(MediaType.APPLICATION_JSON)
            .content(body));
  }

  private ResultActions tracking(String ip) throws Exception {
    return mvc.perform(
        get("/api/v1/public/tracking/olmayan-firma/" + ip.replace('.', '-'))
            .with(
                request -> {
                  request.setRemoteAddr(ip);
                  return request;
                }));
  }

  private ResultActions tenantLogin(String ip) throws Exception {
    return mvc.perform(
        post("/api/v1/auth/login")
            .with(tenant("olmayan-firma"))
            .with(
                request -> {
                  request.setRemoteAddr(ip);
                  return request;
                })
            .contentType(MediaType.APPLICATION_JSON)
            .content(loginJson("yok@blackrose.test", "Yanlis-Sifre-123", null)));
  }
}
