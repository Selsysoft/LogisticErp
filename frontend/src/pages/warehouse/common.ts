import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../api/client";
import { Bin, StockItem, Warehouse, WarehouseOptions } from "./types";

export const CUSTOMS_COLORS = {
  NONE: "default",
  UNDER_BOND: "warning",
  CLEARED: "success",
} as const;

export const HANDLING_KINDS = ["UNLOADING", "LOADING", "LABELING", "PICKING", "OTHER"];
export const STORAGE_BASES = ["PALLET_DAY", "M2_DAY", "UNIT_DAY"];

/** Çıkış ve sevk için kullanılabilir mi: antrepo rejimindeki mal gümrük işlemini bekler. */
export function canIssue(status: string) {
  return status !== "UNDER_BOND";
}

export function useWarehouses() {
  return useQuery({
    queryKey: ["warehouse", "warehouses"],
    queryFn: () => apiGet<Warehouse[]>("/warehouse/warehouses"),
  });
}

export function useBins() {
  return useQuery({
    queryKey: ["warehouse", "bins"],
    queryFn: () => apiGet<Bin[]>("/warehouse/bins"),
  });
}

export function useStockItems() {
  return useQuery({
    queryKey: ["warehouse", "items"],
    queryFn: () => apiGet<StockItem[]>("/warehouse/items"),
  });
}

export function useWarehouseOptions() {
  return useQuery({
    queryKey: ["warehouse", "options"],
    queryFn: () => apiGet<WarehouseOptions>("/warehouse/options"),
  });
}
