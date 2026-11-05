import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../api/client";
import { EDocumentCandidate, IntegrationOptions } from "./types";

/** Kaynağa göre seçilebilen e-belge türleri. Müşterinin mükellefiyeti kullanıcı tarafından seçilir. */
export function kindsFor(sourceType: EDocumentCandidate["sourceType"]) {
  return sourceType === "WAYBILL" ? ["EIRSALIYE"] : ["EFATURA", "EARSIV"];
}

export function useIntegrationOptions() {
  return useQuery({
    queryKey: ["integration", "options"],
    queryFn: () => apiGet<IntegrationOptions>("/integration/options"),
  });
}
