import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from "@mui/material";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiGet } from "../../api/client";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { AuditEntry, Page } from "./types";

const dateFormat = new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "medium" });

export function AuditLogPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);

  const logs = useQuery({
    queryKey: ["audit", page, size],
    queryFn: () => apiGet<Page<AuditEntry>>(`/identity/audit-logs?page=${page}&size=${size}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <Typography variant="h5" component="h1" sx={{ mb: 2 }}>
        {t("audit.title")}
      </Typography>
      {logs.isError && <ErrorState error={logs.error} />}
      {logs.isPending && <Typography>{t("common.loading")}</Typography>}
      {logs.isSuccess && logs.data.totalElements === 0 && <EmptyState title={t("audit.empty")} />}
      {logs.isSuccess && logs.data.totalElements > 0 && (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("audit.time")}</TableCell>
                <TableCell>{t("audit.event")}</TableCell>
                <TableCell>{t("audit.actor")}</TableCell>
                <TableCell>{t("audit.target")}</TableCell>
                <TableCell>{t("audit.details")}</TableCell>
                <TableCell>{t("audit.ip")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.data.content.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>
                    {dateFormat.format(new Date(entry.createdAt))}
                  </TableCell>
                  <TableCell>{entry.eventType}</TableCell>
                  <TableCell>{entry.actorEmail}</TableCell>
                  <TableCell>{entry.target}</TableCell>
                  <TableCell>{entry.details}</TableCell>
                  <TableCell>{entry.ipAddress}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={logs.data.totalElements}
            page={page}
            rowsPerPage={size}
            rowsPerPageOptions={[50, 100, 200]}
            onPageChange={(_, next) => setPage(next)}
            onRowsPerPageChange={(event) => {
              setSize(Number(event.target.value));
              setPage(0);
            }}
          />
        </TableContainer>
      )}
    </>
  );
}
