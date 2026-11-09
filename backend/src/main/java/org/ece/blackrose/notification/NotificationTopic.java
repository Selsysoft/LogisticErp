package org.ece.blackrose.notification;

import org.ece.blackrose.identity.domain.Permission;

/**
 * E-posta konuları. Konuyu yalnız ilgili yetkisi olan kullanıcı alır; Hesabım'dan kapatılabilir.
 * Onay bekleyen ödeme planı hem günlük özette hem onaya gönderilince anlık gelir; plan kararı
 * (onay/ret) yalnız anlık gelir.
 */
public enum NotificationTopic {
  FLEET_REMINDERS(Permission.FLEET_EDIT),
  DRIVER_EXPENSE_APPROVAL(Permission.SHIPMENT_DISPATCH),
  PAYMENT_APPROVAL(Permission.FINANCE_APPROVE),
  PAYMENT_DUE(Permission.FINANCE_PAYMENT_CREATE),
  PLAN_DECISION(Permission.FINANCE_PAYMENT_CREATE);

  private final Permission permission;

  NotificationTopic(Permission permission) {
    this.permission = permission;
  }

  public Permission getPermission() {
    return permission;
  }
}
