import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  Chip,
  FormControlLabel,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { SuspenseOutlet } from "../../components/lazyPage";
import { apiGet, apiRequest } from "../../api/client";
import { useAuthStore } from "../../auth/authStore";
import { ErrorState } from "../../components/ErrorState";
import { BRAND } from "../../theme";
import { formatAmount, formatDate, QueryState } from "../finance/common";
import { formatDateTime } from "../operations/common";
import {
  currentPosition,
  locationEnabled,
  setLocationEnabled,
  useDriverQueue,
} from "./driverQueue";
import { effectiveStatus, isRetryable } from "./offlineQueue";
import { MyExpense, Trip } from "./types";

const REFRESH_MILLIS = 60_000;
const POSITION_MILLIS = 5 * 60_000;
const ACTIVE_TOUCH = { minHeight: 48 };

export function useTrips() {
  const owner = useDriverQueue((state) => state.owner);
  const store = useDriverQueue((state) => state.store);
  return useQuery({
    queryKey: ["driver", "trips"],
    enabled: !!owner,
    networkMode: "always",
    refetchInterval: REFRESH_MILLIS,
    retry: false,
    queryFn: async () => {
      try {
        const trips = await apiGet<Trip[]>("/driver/trips");
        await store.saveCache(owner!, trips);
        return { trips, stale: false };
      } catch (error) {
        const cached = isRetryable(error) ? ((await store.readCache(owner!)) as Trip[]) : undefined;
        if (cached) {
          return { trips: cached, stale: true };
        }
        throw error;
      }
    },
  });
}

export function DriverLayout() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const navigate = useNavigate();
  const me = useAuthStore((state) => state.me);
  const logout = useAuthStore((state) => state.logout);
  const { ops, syncing, sentCount, init, sync, retry, discard, store, owner } = useDriverQueue();
  const trips = useTrips();
  const [sharing, setSharing] = useState(locationEnabled());
  const known = useRef<Set<string> | null>(null);
  const [newTrip, setNewTrip] = useState(false);

  useEffect(() => {
    if (me) {
      void init(`${me.tenant}|${me.id}`);
    }
  }, [me, init]);

  useEffect(() => {
    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(onOnline, REFRESH_MILLIS);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
  }, [sync]);

  useEffect(() => {
    if (sentCount > 0) {
      void client.invalidateQueries({ queryKey: ["driver"] });
    }
  }, [sentCount, client]);

  const list = trips.data?.trips;
  useEffect(() => {
    if (!list) {
      return;
    }
    const ids = new Set(list.map((trip) => trip.id));
    if (known.current && [...ids].some((id) => !known.current?.has(id))) {
      setNewTrip(true);
    }
    known.current = ids;
  }, [list]);

  const onRoad = (list ?? []).some(
    (trip) => trip.status === "LOADED" || trip.status === "IN_TRANSIT",
  );
  useEffect(() => {
    if (!sharing || !onRoad) {
      return;
    }
    const report = async () => {
      const position = await currentPosition();
      if (position) {
        // Konum kuyruğa girmez: geciken konumun takip için değeri yoktur.
        await apiRequest("POST", "/driver/positions", {
          ...position,
          recordedAt: new Date().toISOString(),
        }).catch(() => undefined);
      }
    };
    void report();
    const timer = window.setInterval(() => void report(), POSITION_MILLIS);
    return () => window.clearInterval(timer);
  }, [sharing, onRoad]);

  const pending = ops.filter((op) => !op.failure);
  const failed = ops.filter((op) => op.failure);

  const signOut = async () => {
    if (owner) {
      await store.clearCache(owner);
    }
    await logout().catch(() => undefined);
    navigate("/login");
  };

  return (
    <Box sx={{ minHeight: "100vh", pb: 4 }}>
      <Stack
        direction="row"
        sx={{
          px: 2,
          py: 1.5,
          color: "#fff",
          background: BRAND.gradient,
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Typography variant="h6" component="span">
          {me?.fullName}
        </Typography>
        <Button color="inherit" onClick={() => void signOut()}>
          {t("nav.logout")}
        </Button>
      </Stack>
      <Stack spacing={2} sx={{ p: 2, maxWidth: 640, mx: "auto" }}>
        <Stack direction="row" spacing={1}>
          <Button component={RouterLink} to="/driver" sx={ACTIVE_TOUCH}>
            {t("driver.nav.trips")}
          </Button>
          <Button component={RouterLink} to="/driver/expenses" sx={ACTIVE_TOUCH}>
            {t("driver.nav.expenses")}
          </Button>
        </Stack>
        {trips.data?.stale && <Alert severity="warning">{t("driver.offline")}</Alert>}
        {newTrip && (
          <Alert severity="info" onClose={() => setNewTrip(false)}>
            {t("driver.newTrip")}
          </Alert>
        )}
        {pending.length > 0 && (
          <Alert
            severity="info"
            action={
              <Button color="inherit" size="small" disabled={syncing} onClick={() => void sync()}>
                {t("driver.action.sendNow")}
              </Button>
            }
          >
            {t("driver.pending", { count: pending.length })}
          </Alert>
        )}
        {failed.map((op) => (
          <Alert
            key={op.clientId}
            severity="error"
            action={
              <Stack direction="row">
                <Button color="inherit" size="small" onClick={() => void retry(op.clientId)}>
                  {t("driver.action.retry")}
                </Button>
                <Button color="inherit" size="small" onClick={() => void discard(op.clientId)}>
                  {t("driver.action.discard")}
                </Button>
              </Stack>
            }
          >
            {op.label}: {op.failure}
          </Alert>
        ))}
        <SuspenseOutlet />
        <Card variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
          <FormControlLabel
            label={t("driver.location.toggle")}
            control={
              <Switch
                checked={sharing}
                onChange={(event) => {
                  setLocationEnabled(event.target.checked);
                  setSharing(event.target.checked);
                }}
              />
            }
          />
          <Typography variant="body2" color="text.secondary">
            {t("driver.location.note")}
          </Typography>
        </Card>
      </Stack>
    </Box>
  );
}

export function DriverTripsPage() {
  const { t } = useTranslation();
  const trips = useTrips();
  const ops = useDriverQueue((state) => state.ops);
  return (
    <Stack spacing={2}>
      <Typography variant="h5" component="h1">
        {t("driver.nav.trips")}
      </Typography>
      <QueryState isPending={trips.isPending} error={trips.error} />
      {trips.data?.trips.length === 0 && <Typography>{t("driver.noTrips")}</Typography>}
      {trips.data?.trips.map((trip) => (
        <Card key={trip.id} variant="outlined" sx={{ borderRadius: 3 }}>
          <CardActionArea component={RouterLink} to={`/driver/trips/${trip.id}`} sx={{ p: 2 }}>
            <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
              <Typography sx={{ fontWeight: 700 }}>{trip.number}</Typography>
              <Chip
                size="small"
                label={t(`operations.status.${effectiveStatus(trip.status, trip.id, ops)}`)}
              />
            </Stack>
            <Typography>
              {trip.origin} → {trip.destination}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatDateTime(trip.plannedPickup)}
            </Typography>
          </CardActionArea>
        </Card>
      ))}
    </Stack>
  );
}

export function DriverExpensesPage() {
  const { t } = useTranslation();
  const expenses = useQuery({
    queryKey: ["driver", "expenses"],
    queryFn: () => apiGet<MyExpense[]>("/driver/expenses"),
    networkMode: "always",
    retry: false,
  });
  return (
    <Stack spacing={2}>
      <Typography variant="h5" component="h1">
        {t("driver.nav.expenses")}
      </Typography>
      {expenses.isError && <ErrorState error={expenses.error} />}
      {expenses.data?.length === 0 && <Typography>{t("driver.noExpenses")}</Typography>}
      {expenses.data?.map((row) => (
        <Card key={row.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
            <Typography sx={{ fontWeight: 700 }}>
              {formatAmount(row.money.amount)} {row.money.currency}
            </Typography>
            <Chip size="small" label={t(`driver.expenseStatus.${row.status}`)} />
          </Stack>
          <Typography variant="body2">
            {t(`driver.expenseKind.${row.kind}`)} · {formatDate(row.date)}
          </Typography>
          {row.description && <Typography variant="body2">{row.description}</Typography>}
          {row.reviewNote && (
            <Typography variant="body2" color="error">
              {row.reviewNote}
            </Typography>
          )}
        </Card>
      ))}
    </Stack>
  );
}
