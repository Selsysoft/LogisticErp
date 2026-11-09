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
      "app.security.rate-limit.tracking-per-minute=3"
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
