import {
  Alert,
  Button,
  DialogActions,
  DialogContent,
  FormControlLabel,
  Radio,
  RadioGroup,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiRequest } from "../../api/client";
import { useAuthStore } from "../../auth/authStore";
import { ErrorState } from "../../components/ErrorState";
import {
  BranchScopeDraft,
  toScopeBody,
  validateScope,
  withScope,
  withSelection,
} from "./branchScope";
import type { BranchScopeValue, UserBranchScope } from "./types";

// ZTO bileşenleri ve CSS'i yalnız sekme açılınca yüklenir (12.1a §6.13).
const UserBranchScopePicker = lazy(() => import("./UserBranchScopePicker"));

export type UserBranchScopeTabProps = {
  userId: string;
  onClose: () => void;
};

/**
 * Kullanıcı diyaloğunun "İş Yeri Yetkisi" sekmesi (12.1a §6.13). Kendi kökü bir <div>'dir, <form>
 * değil: iş yeri arama kutusunda Enter kullanıcı PUT'unu göndermez; kendi Kaydet düğmesi kapsam
 * ucuna yazar. Her açılışta kapsam sunucudan okunur.
 */
export function UserBranchScopeTab({ userId, onClose }: UserBranchScopeTabProps) {
  const { t } = useTranslation();
  const scope = useQuery({
    queryKey: ["users", userId, "branch-scope"],
    queryFn: () => apiGet<UserBranchScope>(`/identity/users/${userId}/branch-scope`),
  });

  return (
    <div>
      {scope.isSuccess ? (
        <ScopeForm userId={userId} initial={scope.data} onClose={onClose} />
      ) : (
        <>
          <DialogContent>
            {scope.isError ? (
              <ErrorState error={scope.error} />
            ) : (
              <Typography>{t("common.loading")}</Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button type="button" onClick={onClose}>
              {t("common.cancel")}
            </Button>
          </DialogActions>
        </>
      )}
    </div>
  );
}

function ScopeForm({
  userId,
  initial,
  onClose,
}: {
  userId: string;
  initial: UserBranchScope;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [draft, setDraft] = useState<BranchScopeDraft>(initial);
  const [clientError, setClientError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (body: ReturnType<typeof toScopeBody>) =>
      apiRequest<UserBranchScope>("PUT", `/identity/users/${userId}/branch-scope`, body),
    onSuccess: async () => {
      setSaved(true);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["users"] }),
        client.invalidateQueries({ queryKey: ["branch-tree"] }),
      ]);
      const auth = useAuthStore.getState();
      if (auth.me?.id === userId) {
        // Kendi kapsamını değiştiren kullanıcının /auth/me alanları (izinli iş yerleri) yenilenir.
        await auth.reloadMe();
      }
    },
  });

  const submit = () => {
    const problem = validateScope(draft);
    setClientError(problem ? t(`users.${problem}`) : null);
    if (!problem) {
      save.mutate(toScopeBody(draft));
    }
  };

  return (
    <>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {save.isError && <ErrorState error={save.error} />}
          {clientError && <Alert severity="error">{clientError}</Alert>}
          <RadioGroup
            row
            aria-label={t("users.tabBranchScope")}
            value={draft.scope}
            onChange={(event) => {
              setClientError(null);
              setDraft(withScope(draft, event.target.value as BranchScopeValue));
            }}
          >
            <FormControlLabel value="ALL" control={<Radio />} label={t("users.scopeAll")} />
            <FormControlLabel value="LIMITED" control={<Radio />} label={t("users.scopeLimited")} />
          </RadioGroup>
          <Suspense fallback={<Typography>{t("common.loading")}</Typography>}>
            <UserBranchScopePicker
              scope={draft.scope}
              branchIds={draft.branchIds}
              defaultBranchId={draft.defaultBranchId}
              onBranchIdsChange={(ids) => {
                setClientError(null);
                setDraft((current) => withSelection(current, ids));
              }}
              onDefaultBranchChange={(id) =>
                setDraft((current) => ({ ...current, defaultBranchId: id }))
              }
            />
          </Suspense>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button type="button" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button type="button" variant="contained" disabled={save.isPending} onClick={submit}>
          {t("common.save")}
        </Button>
      </DialogActions>
      <Snackbar
        open={saved}
        autoHideDuration={4000}
        onClose={() => setSaved(false)}
        message={t("users.scopeSaved")}
      />
    </>
  );
}
