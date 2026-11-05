import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../api/client";
import { CustomsOptions, DeclarationStatus } from "./types";

const NEXT: Partial<Record<DeclarationStatus, DeclarationStatus[]>> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["CLEARED", "REJECTED"],
};

/** Beyanın geçebileceği durumlar. */
export function nextDeclarationStatuses(status: DeclarationStatus) {
  return NEXT[status] ?? [];
}

export function useCustomsOptions() {
  return useQuery({
    queryKey: ["customs", "options"],
    queryFn: () => apiGet<CustomsOptions>("/customs/options"),
  });
}
