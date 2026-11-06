package org.ece.blackrose.notification;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.identity.domain.Permission;
import org.ece.blackrose.identity.repository.IdentityRepositories.UserAccountRepository;
import org.ece.blackrose.identity.security.AuthenticatedUser;
import org.ece.blackrose.notification.NotificationRepositories.NotificationPreferenceRepository;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Oturumdaki kullanıcının kendi e-posta tercihleri. Yalnız yetkisi olduğu konular listelenir. */
@RestController
@RequestMapping("/api/v1/notifications/preferences")
public class NotificationPreferenceController {

  public record PreferenceItem(@NotNull NotificationTopic topic, @NotNull Boolean email) {}

  public record SaveRequest(@NotNull List<@Valid PreferenceItem> items) {}

  private final NotificationPreferenceRepository preferences;
  private final UserAccountRepository users;

  public NotificationPreferenceController(
      NotificationPreferenceRepository preferences, UserAccountRepository users) {
    this.preferences = preferences;
    this.users = users;
  }

  @GetMapping
  @Transactional(readOnly = true)
  public List<PreferenceItem> list() {
    UUID userId = AuthenticatedUser.require().id();
    Map<NotificationTopic, Boolean> saved =
        preferences.findByUserId(userId).stream()
            .collect(
                Collectors.toMap(
                    NotificationPreference::getTopic, NotificationPreference::isEmail));
    Set<Permission> permissions = permissionsOf(userId);
    return Arrays.stream(NotificationTopic.values())
        .filter(topic -> permissions.contains(topic.getPermission()))
        .map(topic -> new PreferenceItem(topic, saved.getOrDefault(topic, true)))
        .toList();
  }

  @PutMapping
  @Transactional
  public List<PreferenceItem> save(@Valid @RequestBody SaveRequest request) {
    UUID userId = AuthenticatedUser.require().id();
    Set<Permission> permissions = permissionsOf(userId);
    for (PreferenceItem item : request.items()) {
      if (!permissions.contains(item.topic().getPermission())) {
        throw new BusinessException(
            HttpStatus.BAD_REQUEST, "TOPIC_NOT_ALLOWED", "Bu bildirim konusu için yetkiniz yok.");
      }
      preferences
          .findById(new NotificationPreference.Key(userId, item.topic()))
          .ifPresentOrElse(
              existing -> existing.setEmail(item.email()),
              () ->
                  preferences.save(new NotificationPreference(userId, item.topic(), item.email())));
    }
    return list();
  }

  private Set<Permission> permissionsOf(UUID userId) {
    return users.findById(userId).orElseThrow().getEffectivePermissions();
  }
}
