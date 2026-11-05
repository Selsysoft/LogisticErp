import { Button, Stack, Typography } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet, apiRequest } from "../../api/client";
import { FormDialog, useCan } from "../finance/common";

/** Sürücü kaydını giriş yapacağı hesaba bağlar; sürücü uygulaması bu bağla çalışır. */
export function DriverUserSection({ driverId }: { driverId: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("FLEET_EDIT");
  const [editing, setEditing] = useState(false);
  const key = ["fleet", "driver-user", driverId];
  const link = useQuery({
    queryKey: key,
    queryFn: () => apiGet<{ email: string | null }>(`/fleet/drivers/${driverId}/user`),
  });

  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
      <Typography>
        {t("driver.link.label")}: {link.data?.email ?? t("driver.link.none")}
      </Typography>
      {canEdit && (
        <Button size="small" onClick={() => setEditing(true)}>
          {t("common.edit")}
        </Button>
      )}
      {editing && (
        <FormDialog
          title={t("driver.link.label")}
          fields={[
            {
              name: "email",
              label: t("driver.link.email"),
              helperText: t("driver.link.help"),
              defaultValue: link.data?.email ?? "",
            },
          ]}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void client.invalidateQueries({ queryKey: key });
          }}
          onSubmit={(values) =>
            apiRequest("PUT", `/fleet/drivers/${driverId}/user`, { email: values.email || null })
          }
        />
      )}
    </Stack>
  );
}
