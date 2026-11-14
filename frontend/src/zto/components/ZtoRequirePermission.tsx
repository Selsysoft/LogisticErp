import { ReactNode } from "react";
import { hasPermission, useAuthStore } from "../../auth/authStore";
import { ZtoAccessDenied } from "./ZtoAccessDenied";

export type ZtoRequirePermissionProps = {
  permission: string;
  children: ReactNode;
};

/** ZTO kökü içindeki rota koruması: izin yoksa ZtoAccessDenied (MUI EmptyState değil). */
export function ZtoRequirePermission({ permission, children }: ZtoRequirePermissionProps) {
  const me = useAuthStore((state) => state.me);
  return hasPermission(me, permission) ? <>{children}</> : <ZtoAccessDenied />;
}
