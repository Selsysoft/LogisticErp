import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../api/client";
import { ShipmentOptions, ShipmentStatus } from "./types";

export const STATUSES: ShipmentStatus[] = [
  "QUOTED",
  "PLANNED",
  "LOADED",
  "IN_TRANSIT",
  "DELIVERED",
  "INVOICED",
  "CLOSED",
  "CANCELLED",
];

export const STATUS_COLORS: Record<
  ShipmentStatus,
  "default" | "info" | "warning" | "success" | "error"
> = {
  QUOTED: "default",
  PLANNED: "info",
  LOADED: "info",
  IN_TRANSIT: "warning",
  DELIVERED: "success",
  INVOICED: "success",
  CLOSED: "default",
  CANCELLED: "error",
};

const NEXT: Partial<Record<ShipmentStatus, ShipmentStatus>> = {
  QUOTED: "PLANNED",
  PLANNED: "LOADED",
  LOADED: "IN_TRANSIT",
  IN_TRANSIT: "DELIVERED",
};

/** Operasyonun elle ilerletebileceği sonraki durum. Fatura ve kapanış kendi işlemleriyle olur. */
export function nextStatus(status: ShipmentStatus) {
  return NEXT[status] ?? null;
}

export function canCancel(status: ShipmentStatus) {
  return status === "QUOTED" || status === "PLANNED" || status === "LOADED";
}

export function canEditLegs(status: ShipmentStatus) {
  return status === "QUOTED" || status === "PLANNED";
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Form saatini (tarayıcı saat dilimi) API'nin beklediği UTC anına çevirir. */
export function toInstant(local: string) {
  return new Date(local).toISOString();
}

/** Şimdiden gün sayısı kadar sonrasının datetime-local biçimi. */
export function localDateTime(daysAhead = 0) {
  const date = new Date(Date.now() + daysAhead * 86400000);
  date.setSeconds(0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function useShipmentOptions() {
  return useQuery({
    queryKey: ["shipment", "options"],
    queryFn: () => apiGet<ShipmentOptions>("/shipment/options"),
  });
}
