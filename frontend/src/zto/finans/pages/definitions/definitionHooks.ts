import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { apiRequest } from "../../../../api/client";
import { hasPermission, useAuthStore } from "../../../../auth/authStore";
import { invalidateOrganization } from "../../../../pages/organization/api";
import { errorMessage, flashFromState } from "../../../components/definitionLogic";

export type DefinitionNotice = { variant: "success" | "danger"; message: string };

/**
 * Liste sayfasının bildirimi: kayıt sonrası `navigate(liste, { state: { flash } })` ile gelen mesaj
 * ilk çizimde okunur ve tarayıcı geçmişinden silinir (yenilemede yeniden görünmez, 12.1a §6.8).
 */
export function useDefinitionNotice() {
  const location = useLocation();
  const [notice, setNotice] = useState<DefinitionNotice | null>(() => {
    const flash = flashFromState(location.state);
    if (flash === null) return null;
    try {
      const state = (window.history.state ?? {}) as Record<string, unknown>;
      window.history.replaceState({ ...state, usr: undefined }, "");
    } catch {
      // Geçmiş yazılamazsa bildirim yine gösterilir.
    }
    return { variant: "success", message: flash };
  });
  return [notice, setNotice] as const;
}

export function useCan(permission: string): boolean {
  const me = useAuthStore((state) => state.me);
  return hasPermission(me, permission);
}

/**
 * Sil (pasifleştir) / Aktifleştir: POST {base}/{id}/deactivate|activate; başarıda organization
 * sorguları geçersizlenir. Hata ApiError.message ile bildirilir (409'lar için `conflictMessage`).
 */
export function useToggleActive(options: {
  base: string;
  messages: { deactivated: string; activated: string };
  onNotice: (notice: DefinitionNotice) => void;
  reloadMe?: boolean;
  conflictMessage?: (code: string | undefined) => string | undefined;
}) {
  const { t } = useTranslation("ztoFinans");
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, activate }: { id: string; activate: boolean }) =>
      apiRequest<unknown>("POST", `${options.base}/${id}/${activate ? "activate" : "deactivate"}`),
    onSuccess: async (_data, { activate }) => {
      options.onNotice({
        variant: "success",
        message: activate ? options.messages.activated : options.messages.deactivated,
      });
      await invalidateOrganization(client, { reloadMe: options.reloadMe });
    },
    onError: (error) => {
      const code = (error as { body?: { code?: string } }).body?.code;
      options.onNotice({
        variant: "danger",
        message: options.conflictMessage?.(code) ?? errorMessage(error, t("definitions.error")),
      });
    },
  });
}
