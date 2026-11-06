package org.ece.blackrose.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.ece.blackrose.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

class AuthorizationIT extends AbstractIntegrationTest {

  @Test
  void saasLogoutRevokesAccessTokenImmediately() throws Exception {
    String token = saasToken();
    mvc.perform(get("/api/v1/admin/plans").with(bearer(token))).andExpect(status().isOk());

    mvc.perform(post("/api/v1/admin/auth/logout").with(bearer(token)))
        .andExpect(status().isNoContent());

    mvc.perform(get("/api/v1/admin/plans").with(bearer(token)))
        .andExpect(status().isUnauthorized());
    mvc.perform(post("/api/v1/admin/auth/logout")).andExpect(status().isUnauthorized());
  }

  @Test
  void roleLandingPathMustStayInsideApp() throws Exception {
    createTenant("rbac-lp");
    for (String path : List.of("//evil.example", "https://evil.example", "/ok//x")) {
      String body =
          json.writeValueAsString(
              Map.of(
                  "code",
                  "LP_ROLE",
                  "name",
                  "LP",
                  "priority",
                  5,
                  "landingPath",
                  path,
                  "permissions",
                  List.of()));
      ResultActions result =
          mvc.perform(
              post("/api/v1/identity/roles")
                  .with(asOwner("rbac-lp"))
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(body));
      if (path.startsWith("/ok")) {
        result.andExpect(status().isCreated());
      } else {
        result.andExpect(status().isBadRequest());
      }
    }
  }

  @Test
  void userWithoutPermissionGets403AndWithPermissionGets200() throws Exception {
    createTenant("rbac-a");
    String finance = createUser("rbac-a", "finans@rbac-a.test", "FINANCE");

    mvc.perform(get("/api/v1/organization/branches").with(as("rbac-a", finance)))
        .andExpect(status().isOk());
    mvc.perform(
            post("/api/v1/organization/branches")
                .with(as("rbac-a", finance))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"X\",\"name\":\"X\"}"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCESS_DENIED"))
        .andExpect(jsonPath("$.traceId").isNotEmpty());
  }

  @Test
  void rolePermissionChangeAppliesToExistingTokenImmediately() throws Exception {
    createTenant("rbac-b");
    String finance = createUser("rbac-b", "finans@rbac-b.test", "FINANCE");
    mvc.perform(get("/api/v1/organization/branches").with(as("rbac-b", finance)))
        .andExpect(status().isOk());

    JsonNode role = role("rbac-b", "FINANCE");
    saveRole("rbac-b", role.get("id").asText(), role, List.of("FINANCE_VIEW"))
        .andExpect(status().isOk());

    mvc.perform(get("/api/v1/organization/branches").with(as("rbac-b", finance)))
        .andExpect(status().isForbidden());
  }

  @Test
  void landingFollowsHighestPriorityRole() throws Exception {
    createTenant("rbac-c");
    String finance = createUser("rbac-c", "finans@rbac-c.test", "FINANCE");
    String operations = createUser("rbac-c", "ops@rbac-c.test", "OPERATIONS");

    mvc.perform(get("/api/v1/auth/me").with(as("rbac-c", finance)))
        .andExpect(jsonPath("$.landingPath").value("/finance"));
    mvc.perform(get("/api/v1/auth/me").with(as("rbac-c", operations)))
        .andExpect(jsonPath("$.landingPath").value("/operations"));
    mvc.perform(get("/api/v1/auth/me").with(asOwner("rbac-c")))
        .andExpect(jsonPath("$.landingPath").value("/dashboard"));
  }

  @Test
  void loginAndDeniedEventsAreAudited() throws Exception {
    createTenant("rbac-d");
    String finance = createUser("rbac-d", "finans@rbac-d.test", "FINANCE");
    postLogin("rbac-d", "finans@rbac-d.test", "yanlis-sifre-1", null)
        .andExpect(status().isUnauthorized());
    mvc.perform(get("/api/v1/identity/users").with(as("rbac-d", finance)))
        .andExpect(status().isForbidden());

    JsonNode logs =
        body(
            mvc.perform(get("/api/v1/identity/audit-logs?size=50").with(asOwner("rbac-d")))
                .andExpect(status().isOk()));
    List<String> events = new ArrayList<>();
    logs.get("content").forEach(entry -> events.add(entry.get("eventType").asText()));

    assertThat(events).contains("LOGIN_SUCCESS", "LOGIN_FAILED", "ACCESS_DENIED", "USER_INVITED");
  }

  @Test
  void cannotGrantPermissionsActorDoesNotHold() throws Exception {
    createTenant("rbac-e");
    JsonNode limited =
        body(
            mvc.perform(
                    post("/api/v1/identity/roles")
                        .with(asOwner("rbac-e"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                            roleJson(
                                "USER_ADMIN", List.of("USER_VIEW", "USER_MANAGE", "ROLE_MANAGE"))))
                .andExpect(status().isCreated()));
    String admin = createUser("rbac-e", "ik@rbac-e.test", "USER_ADMIN");

    invite("rbac-e", as("rbac-e", admin), "yeni@rbac-e.test", role("rbac-e", "PATRON"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("PRIVILEGE_ESCALATION"));
    mvc.perform(
            put("/api/v1/identity/roles/" + limited.get("id").asText())
                .with(as("rbac-e", admin))
                .contentType(MediaType.APPLICATION_JSON)
                .content(roleJson("USER_ADMIN", List.of("USER_VIEW", "FINANCE_APPROVE"))))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("PRIVILEGE_ESCALATION"));
    String ownerId = userId("rbac-e", ownerEmail("rbac-e"));
    mvc.perform(delete("/api/v1/identity/users/" + ownerId).with(as("rbac-e", admin)))
        .andExpect(status().isForbidden());
  }

  @Test
  void lastOwnerCannotBeRemovedAndOwnerRoleIsLocked() throws Exception {
    createTenant("rbac-f");
    String ownerId = userId("rbac-f", ownerEmail("rbac-f"));
    JsonNode owner = role("rbac-f", "PATRON");

    mvc.perform(delete("/api/v1/identity/users/" + ownerId).with(asOwner("rbac-f")))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("LAST_OWNER"));
    saveRole("rbac-f", owner.get("id").asText(), owner, List.of("USER_VIEW"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("ROLE_LOCKED"));
    mvc.perform(
            delete("/api/v1/identity/roles/" + owner.get("id").asText()).with(asOwner("rbac-f")))
        .andExpect(status().isConflict());
  }

  @Test
  void disablingUserInvalidatesTokenImmediately() throws Exception {
    createTenant("rbac-g");
    String finance = createUser("rbac-g", "finans@rbac-g.test", "FINANCE");
    String id = userId("rbac-g", "finans@rbac-g.test");

    mvc.perform(
            put("/api/v1/identity/users/" + id)
                .with(asOwner("rbac-g"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(
                        Map.of(
                            "fullName",
                            "Finans",
                            "roleIds",
                            List.of(role("rbac-g", "FINANCE").get("id").asText()),
                            "enabled",
                            false))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("DISABLED"));

    mvc.perform(get("/api/v1/auth/me").with(as("rbac-g", finance)))
        .andExpect(status().isUnauthorized());
    postLogin("rbac-g", "finans@rbac-g.test", PASSWORD, null).andExpect(status().isUnauthorized());
  }

  @Test
  void roleInUseCannotBeDeletedAndPermissionListIsComplete() throws Exception {
    createTenant("rbac-h");
    createUser("rbac-h", "finans@rbac-h.test", "FINANCE");

    mvc.perform(
            delete("/api/v1/identity/roles/" + role("rbac-h", "FINANCE").get("id").asText())
                .with(asOwner("rbac-h")))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("ROLE_IN_USE"));
    mvc.perform(get("/api/v1/identity/permissions").with(asOwner("rbac-h")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].code").value("USER_VIEW"));
    assertThat(role("rbac-h", "PATRON").get("permissions").size())
        .isEqualTo(org.ece.blackrose.identity.domain.Permission.values().length);
  }

  private String createUser(String code, String email, String roleCode) throws Exception {
    invite(code, asOwner(code), email, role(code, roleCode)).andExpect(status().isCreated());
    return acceptInviteAndLogin(code, email);
  }

  private ResultActions invite(String code, RequestPostProcessor actor, String email, JsonNode role)
      throws Exception {
    return mvc.perform(
        post("/api/v1/identity/users")
            .with(actor)
            .contentType(MediaType.APPLICATION_JSON)
            .content(
                json.writeValueAsString(
                    Map.of(
                        "email",
                        email,
                        "fullName",
                        "Test Kullanıcı",
                        "roleIds",
                        List.of(role.get("id").asText())))));
  }

  private JsonNode role(String code, String roleCode) throws Exception {
    for (JsonNode role : body(mvc.perform(get("/api/v1/identity/roles").with(asOwner(code))))) {
      if (roleCode.equals(role.get("code").asText())) {
        return role;
      }
    }
    throw new AssertionError("Rol yok: " + roleCode);
  }

  private String userId(String code, String email) throws Exception {
    for (JsonNode user :
        body(mvc.perform(get("/api/v1/identity/users?size=50").with(asOwner(code))))
            .get("content")) {
      if (email.equals(user.get("email").asText())) {
        return user.get("id").asText();
      }
    }
    throw new AssertionError("Kullanıcı yok: " + email);
  }

  private ResultActions saveRole(String code, String id, JsonNode role, List<String> permissions)
      throws Exception {
    return mvc.perform(
        put("/api/v1/identity/roles/" + id)
            .with(asOwner(code))
            .contentType(MediaType.APPLICATION_JSON)
            .content(roleJson(role.get("code").asText(), permissions)));
  }

  private String roleJson(String code, List<String> permissions) throws Exception {
    return json.writeValueAsString(
        Map.of(
            "code", code,
            "name", code,
            "priority", 5,
            "landingPath", "/dashboard",
            "permissions", permissions));
  }

  private static RequestPostProcessor as(String code, String token) {
    return request -> {
      tenant(code).postProcessRequest(request);
      bearer(token).postProcessRequest(request);
      return request;
    };
  }
}
