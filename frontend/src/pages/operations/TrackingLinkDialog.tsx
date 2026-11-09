import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiRequest } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { QueryState } from "../finance/common";
import { formatDateTime } from "./common";

interface LinkStatus {
  active: boolean;
  createdAt: string | null;
  createdBy: string | null;
  expiresAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
}

/**
 * Müşteriye verilen takip bağlantısı. Bağlantının tam hali yalnız oluşturulunca gösterilir;
 * sunucu yalnız özetini saklar. Yeni bağlantı eskisini geçersiz kılar.
 */
export function TrackingLinkDialog({
  shipmentId,
  canEdit,
  onClose,
}: {
  shipmentId: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const path = `/shipment/shipments/${shipmentId}/tracking-link`;
  const key = ["shipment", "tracking-link", shipmentId];

  const status = useQuery({ queryKey: key, queryFn: () => apiGet<LinkStatus>(path) });
  const create = useMutation({
    mutationFn: () => apiRequest<{ path: string; expiresAt: string }>("POST", path),
    onSuccess: (created) => {
      setUrl(`${window.location.origin}${created.path}`);
      setCopied(false);
      void client.invalidateQueries({ queryKey: key });
    },
  });
  const revoke = useMutation({
    mutationFn: () => apiRequest("DELETE", path),
    onSuccess: () => {
      setUrl(null);
      void client.invalidateQueries({ queryKey: key });
    },
  });
  const copy = async () => {
    if (url) {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    }
  };
  const link = status.data;

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={onClose}>
      <DialogTitle>{t("tracking.link.title")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t("tracking.link.intro")}
          </Typography>
          <QueryState isPending={status.isPending} error={status.error} />
          {create.isError && <ErrorState error={create.error} />}
          {revoke.isError && <ErrorState error={revoke.error} />}
          {url && (
            <Stack spacing={1}>
              <TextField
                label={t("tracking.link.url")}
                value={url}
                fullWidth
                slotProps={{ htmlInput: { readOnly: true } }}
                onFocus={(event) => event.target.select()}
              />
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Button variant="contained" onClick={() => void copy()}>
                  {t("tracking.link.copy")}
                </Button>
                {copied && <Typography variant="body2">{t("tracking.link.copied")}</Typography>}
              </Stack>
              <Alert severity="info">{t("tracking.link.onlyOnce")}</Alert>
            </Stack>
          )}
          {link && !url && (
            <Alert severity={link.active ? "success" : "info"}>
              {link.active && link.expiresAt
                ? t("tracking.link.active", {
                    expires: formatDateTime(link.expiresAt),
                    views: link.viewCount,
                  })
                : t("tracking.link.none")}
              {link.active &&
                link.lastViewedAt &&
                ` ${t("tracking.link.lastViewed", { at: formatDateTime(link.lastViewedAt) })}`}
            </Alert>
          )}
          {canEdit && link?.active && !url && (
            <Typography variant="body2" color="text.secondary">
              {t("tracking.link.replaceHint")}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {canEdit && link?.active && (
          <Button color="error" disabled={revoke.isPending} onClick={() => revoke.mutate()}>
            {t("tracking.link.revoke")}
          </Button>
        )}
        {canEdit && link && (
          <Button variant="outlined" disabled={create.isPending} onClick={() => create.mutate()}>
            {link.active ? t("tracking.link.replace") : t("tracking.link.create")}
          </Button>
        )}
        <Button onClick={onClose}>{t("tracking.link.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}
