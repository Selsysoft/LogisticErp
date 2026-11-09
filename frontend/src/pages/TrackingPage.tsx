import {
  Alert,
  Chip,
  CircularProgress,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { CenteredCard } from "../components/CenteredCard";
import { formatDateTime, STATUS_COLORS } from "./operations/common";
import { ShipmentStatus } from "./operations/types";

interface PublicTracking {
  company: string | null;
  number: string;
  status: ShipmentStatus;
  origin: string;
  destination: string;
  plannedPickup: string;
  plannedDelivery: string;
  steps: { status: ShipmentStatus; at: string }[];
  deliveredAt: string | null;
  recipientInitials: string | null;
}

/** Müşterinin gördüğü yol: faturalama ve kapanış onu ilgilendirmez, teslimde tamamlanır. */
const PATH: ShipmentStatus[] = ["PLANNED", "LOADED", "IN_TRANSIT", "DELIVERED"];
const DONE: ShipmentStatus[] = ["DELIVERED", "INVOICED", "CLOSED"];

class TrackingNotFound extends Error {}

/** Oturum gerektirmez; uygulamanın kimlik bilgisi kullanan istemcisi bilerek kullanılmaz. */
async function fetchTracking(tenant: string, token: string) {
  const response = await fetch(
    `/api/v1/public/tracking/${encodeURIComponent(tenant)}/${encodeURIComponent(token)}`,
    { credentials: "omit" },
  );
  if (response.status === 404) {
    throw new TrackingNotFound();
  }
  if (!response.ok) {
    throw new Error(String(response.status));
  }
  return (await response.json()) as PublicTracking;
}

export function TrackingPage() {
  const { t } = useTranslation();
  const { tenant = "", token = "" } = useParams();
  const tracking = useQuery({
    queryKey: ["public-tracking", tenant, token],
    queryFn: () => fetchTracking(tenant, token),
    retry: (count, error) => !(error instanceof TrackingNotFound) && count < 2,
  });
  const data = tracking.data;

  return (
    <CenteredCard title={t("tracking.title")} intro={data?.company ?? undefined}>
      {tracking.isPending && (
        <Stack sx={{ alignItems: "center", py: 3 }}>
          <CircularProgress aria-label={t("tracking.loading")} />
        </Stack>
      )}
      {tracking.error && (
        <Alert severity={tracking.error instanceof TrackingNotFound ? "warning" : "error"}>
          {tracking.error instanceof TrackingNotFound
            ? t("tracking.notFound")
            : t("tracking.unavailable")}
        </Alert>
      )}
      {data && <TrackingDetails data={data} />}
    </CenteredCard>
  );
}

function TrackingDetails({ data }: { data: PublicTracking }) {
  const { t } = useTranslation();
  const reachedAt = (status: ShipmentStatus) =>
    [...data.steps].reverse().find((step) => step.status === status)?.at;
  const delivered = DONE.includes(data.status);
  const active = delivered ? PATH.length : PATH.indexOf(data.status) + 1;

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Typography variant="h6" component="h2">
          {data.number}
        </Typography>
        <Chip
          size="small"
          color={STATUS_COLORS[data.status]}
          label={
            delivered ? t("operations.status.DELIVERED") : t(`operations.status.${data.status}`)
          }
        />
      </Stack>
      <Typography>
        {data.origin} → {data.destination}
      </Typography>
      {data.status === "CANCELLED" ? (
        <Alert severity="warning">{t("tracking.cancelled")}</Alert>
      ) : (
        <Stepper activeStep={active} orientation="vertical">
          {PATH.map((status) => {
            const at = reachedAt(status);
            return (
              <Step key={status} completed={PATH.indexOf(status) < active}>
                <StepLabel optional={at ? formatDateTime(at) : undefined}>
                  {t(`operations.status.${status}`)}
                </StepLabel>
              </Step>
            );
          })}
        </Stepper>
      )}
      <Stack spacing={0.5}>
        <Typography variant="body2" color="text.secondary">
          {t("tracking.plannedPickup")}: {formatDateTime(data.plannedPickup)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("tracking.plannedDelivery")}: {formatDateTime(data.plannedDelivery)}
        </Typography>
      </Stack>
      {data.deliveredAt && (
        <Alert severity="success">
          {t("tracking.delivered", { at: formatDateTime(data.deliveredAt) })}
          {data.recipientInitials &&
            ` ${t("tracking.recipient", { name: data.recipientInitials })}`}
        </Alert>
      )}
    </Stack>
  );
}
