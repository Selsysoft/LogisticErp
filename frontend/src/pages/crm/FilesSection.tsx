import { Box, Button } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { apiDownload, apiGet, apiRequest, apiUpload } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { DataTable, QueryState, SectionHeader, useCan } from "../finance/common";
import { StoredFile } from "./types";

const KILOBYTE = 1024;

export function FilesSection({ ownerType, ownerId }: { ownerType: string; ownerId: string }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const canEdit = useCan("CRM_EDIT");
  const key = ["crm", "files", ownerType, ownerId];

  const files = useQuery({
    queryKey: key,
    queryFn: () => apiGet<StoredFile[]>(`/files?ownerType=${ownerType}&ownerId=${ownerId}`),
  });
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiUpload(`/files?ownerType=${ownerType}&ownerId=${ownerId}`, form);
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/files/${id}`),
    onSuccess: refresh,
  });
  const download = useMutation({
    mutationFn: (file: StoredFile) => apiDownload(`/files/${file.id}/content`, file.fileName),
  });

  const onPick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      upload.mutate(file);
    }
  };

  return (
    <Box>
      <SectionHeader title={t("crm.sections.files")}>
        {canEdit && (
          <Button variant="outlined" component="label" disabled={upload.isPending}>
            {t("crm.action.upload")}
            <input
              hidden
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.txt"
              onChange={onPick}
            />
          </Button>
        )}
      </SectionHeader>
      {upload.isError && <ErrorState error={upload.error} />}
      {download.isError && <ErrorState error={download.error} />}
      {remove.isError && <ErrorState error={remove.error} />}
      <QueryState isPending={files.isPending} error={files.error} />
      {files.data && (
        <DataTable
          rows={files.data}
          rowKey={(file) => file.id}
          columns={[
            { header: t("crm.field.file"), render: (f) => f.fileName },
            {
              header: t("crm.field.size"),
              align: "right",
              render: (f) => `${Math.ceil(f.sizeBytes / KILOBYTE)} KB`,
            },
            {
              header: t("common.actions"),
              align: "right",
              render: (f) => (
                <>
                  <Button size="small" onClick={() => download.mutate(f)}>
                    {t("crm.action.download")}
                  </Button>
                  {canEdit && (
                    <Button size="small" color="error" onClick={() => remove.mutate(f.id)}>
                      {t("common.delete")}
                    </Button>
                  )}
                </>
              ),
            },
          ]}
        />
      )}
    </Box>
  );
}
