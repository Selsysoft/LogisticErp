import {
  Alert,
  Box,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { PointerEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useParams } from "react-router-dom";
import { QueryState, today } from "../finance/common";
import { formatDateTime } from "../operations/common";
import { useTrips } from "./DriverApp";
import { currentPosition, shrinkImage, useDriverQueue } from "./driverQueue";
import { effectiveStatus, nextActions } from "./offlineQueue";
import { EventKind, ExpenseKind } from "./types";

const TOUCH = { minHeight: 56 };
const EXPENSE_KINDS: ExpenseKind[] = ["FUEL", "TOLL", "PER_DIEM", "OTHER"];
const CURRENCIES = ["TRY", "EUR", "USD"];
const AMOUNT = /^\d+([.,]\d{1,2})?$/;

function PhotoInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <Button component="label" variant="outlined" sx={TOUCH}>
      {value ? `${label}: ${value.name}` : label}
      <input
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </Button>
  );
}

function SignaturePad({ onChange }: { onChange: (signed: HTMLCanvasElement | null) => void }) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const element = canvas.current;
    if (element) {
      element.width = element.offsetWidth;
      element.height = element.offsetHeight;
    }
  }, []);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top] as const;
  };
  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const context = event.currentTarget.getContext("2d");
    const [x, y] = point(event);
    context?.beginPath();
    context?.moveTo(x, y);
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) {
      return;
    }
    const context = event.currentTarget.getContext("2d");
    if (context) {
      const [x, y] = point(event);
      context.lineWidth = 2;
      context.lineCap = "round";
      context.lineTo(x, y);
      context.stroke();
      onChange(event.currentTarget);
    }
  };
  const clear = () => {
    const element = canvas.current;
    element?.getContext("2d")?.clearRect(0, 0, element.width, element.height);
    onChange(null);
  };

  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 0.5 }}>
        {t("driver.pod.signature")}
      </Typography>
      <Box
        component="canvas"
        ref={canvas}
        aria-label={t("driver.pod.signature")}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={() => {
          drawing.current = false;
        }}
        sx={{
          width: "100%",
          height: 180,
          display: "block",
          border: 1,
          borderColor: "divider",
          borderRadius: 2,
          bgcolor: "#fff",
          touchAction: "none",
        }}
      />
      <Button size="small" onClick={clear}>
        {t("driver.pod.clearSignature")}
      </Button>
    </Box>
  );
}

function PodDialog({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const enqueue = useDriverQueue((state) => state.enqueue);
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const [signature, setSignature] = useState<HTMLCanvasElement | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!recipient.trim()) {
      setError(t("driver.pod.recipientRequired"));
      return;
    }
    if (!signature) {
      setError(t("driver.pod.signatureRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const signed = await new Promise<Blob | null>((resolve) =>
        signature.toBlob(resolve, "image/png"),
      );
      const files: Record<string, Blob> = { signature: signed! };
      if (photo) {
        files.photo = await shrinkImage(photo);
      }
      const position = await currentPosition();
      await enqueue({
        kind: "POD",
        tripId,
        label: t("driver.action.deliver"),
        fields: {
          recipientName: recipient.trim(),
          note: note.trim(),
          deliveredAt: new Date().toISOString(),
          latitude: position?.latitude ?? "",
          longitude: position?.longitude ?? "",
        },
        files,
      });
      onClose();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  };

  return (
    <Dialog open fullScreen onClose={onClose}>
      <DialogTitle>{t("driver.action.deliver")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            required
            label={t("driver.pod.recipient")}
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
          />
          <SignaturePad onChange={setSignature} />
          <PhotoInput label={t("driver.pod.photo")} value={photo} onChange={setPhoto} />
          <TextField
            multiline
            minRows={2}
            label={t("driver.pod.note")}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={TOUCH}>
          {t("common.cancel")}
        </Button>
        <Button variant="contained" disabled={saving} onClick={() => void save()} sx={TOUCH}>
          {t("driver.action.confirmDelivery")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ExpenseDialog({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const enqueue = useDriverQueue((state) => state.enqueue);
  const [kind, setKind] = useState<ExpenseKind>("FUEL");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("TRY");
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!AMOUNT.test(amount.trim())) {
      setError(t("driver.expense.amountInvalid"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await enqueue({
        kind: "EXPENSE",
        tripId,
        label: t("driver.action.addExpense"),
        fields: {
          kind,
          amount: amount.trim().replace(",", "."),
          currency,
          date,
          description: description.trim(),
        },
        files: receipt ? { receipt: await shrinkImage(receipt) } : {},
      });
      onClose();
    } catch (cause) {
      setError((cause as Error).message);
      setSaving(false);
    }
  };

  return (
    <Dialog open fullScreen onClose={onClose}>
      <DialogTitle>{t("driver.action.addExpense")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            select
            label={t("driver.expense.kind")}
            value={kind}
            onChange={(event) => setKind(event.target.value as ExpenseKind)}
          >
            {EXPENSE_KINDS.map((value) => (
              <MenuItem key={value} value={value}>
                {t(`driver.expenseKind.${value}`)}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" spacing={1}>
            <TextField
              required
              fullWidth
              label={t("driver.expense.amount")}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              slotProps={{ htmlInput: { inputMode: "decimal" } }}
            />
            <TextField
              select
              label={t("driver.expense.currency")}
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              sx={{ minWidth: 100 }}
            >
              {CURRENCIES.map((value) => (
                <MenuItem key={value} value={value}>
                  {value}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField
            type="date"
            label={t("driver.expense.date")}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <PhotoInput label={t("driver.expense.receipt")} value={receipt} onChange={setReceipt} />
          <TextField
            label={t("driver.expense.description")}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <Alert severity="info">{t("driver.expense.note")}</Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={TOUCH}>
          {t("common.cancel")}
        </Button>
        <Button variant="contained" disabled={saving} onClick={() => void save()} sx={TOUCH}>
          {t("common.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function DriverTripPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const trips = useTrips();
  const ops = useDriverQueue((state) => state.ops);
  const enqueue = useDriverQueue((state) => state.enqueue);
  const [dialog, setDialog] = useState<"pod" | "expense" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const trip = trips.data?.trips.find((item) => item.id === id);

  if (!trip) {
    return (
      <>
        <QueryState isPending={trips.isPending} error={trips.error} />
        {trips.data && <Typography>{t("driver.tripGone")}</Typography>}
      </>
    );
  }

  const status = effectiveStatus(trip.status, trip.id, ops);
  const can = nextActions(status);
  const report = async (kind: EventKind) => {
    setBusy(true);
    setError(null);
    try {
      const position = await currentPosition();
      await enqueue({
        kind: "EVENT",
        tripId: trip.id,
        label: t(`driver.event.${kind}`),
        fields: {
          kind,
          occurredAt: new Date().toISOString(),
          latitude: position?.latitude ?? "",
          longitude: position?.longitude ?? "",
        },
      });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Button component={RouterLink} to="/driver" sx={{ alignSelf: "flex-start" }}>
        {t("driver.nav.back")}
      </Button>
      <Typography variant="h5" component="h1">
        {trip.number}
      </Typography>
      <Card variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Typography sx={{ fontWeight: 700 }}>{t(`operations.status.${status}`)}</Typography>
        <Typography>
          {trip.origin} → {trip.destination}
        </Typography>
        <Typography variant="body2">
          {t("driver.trip.pickup")}: {formatDateTime(trip.plannedPickup)}
        </Typography>
        <Typography variant="body2">
          {t("driver.trip.delivery")}: {formatDateTime(trip.plannedDelivery)}
        </Typography>
        <Typography variant="body2">
          {t("driver.trip.shipper")}: {trip.shipperName}
        </Typography>
        <Typography variant="body2">
          {t("driver.trip.consignee")}: {trip.consigneeName}
        </Typography>
        {trip.legs.map((leg) => (
          <Typography key={leg.sequenceNo} variant="body2">
            {t("driver.trip.leg", { number: leg.sequenceNo })}: {leg.origin} → {leg.destination}
            {leg.plate && ` · ${leg.plate}`}
          </Typography>
        ))}
        {trip.cargo.map((item, index) => (
          <Typography key={index} variant="body2">
            {item.description}
            {item.weightKg && ` · ${item.weightKg} kg`}
          </Typography>
        ))}
      </Card>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack spacing={1}>
        {can.load && (
          <Button
            variant="contained"
            disabled={busy}
            sx={TOUCH}
            onClick={() => void report("LOADED")}
          >
            {t("driver.event.LOADED")}
          </Button>
        )}
        {can.depart && (
          <Button
            variant="contained"
            disabled={busy}
            sx={TOUCH}
            onClick={() => void report("IN_TRANSIT")}
          >
            {t("driver.event.IN_TRANSIT")}
          </Button>
        )}
        {can.deliver && (
          <Button variant="contained" sx={TOUCH} onClick={() => setDialog("pod")}>
            {t("driver.action.deliver")}
          </Button>
        )}
        {can.pause && (
          <Button
            variant="outlined"
            disabled={busy}
            sx={TOUCH}
            onClick={() => void report("BREAK")}
          >
            {t("driver.event.BREAK")}
          </Button>
        )}
        {can.unload && (
          <Button
            variant="outlined"
            disabled={busy}
            sx={TOUCH}
            onClick={() => void report("UNLOADED")}
          >
            {t("driver.event.UNLOADED")}
          </Button>
        )}
        {can.expense && (
          <Button variant="outlined" sx={TOUCH} onClick={() => setDialog("expense")}>
            {t("driver.action.addExpense")}
          </Button>
        )}
      </Stack>
      {dialog === "pod" && <PodDialog tripId={trip.id} onClose={() => setDialog(null)} />}
      {dialog === "expense" && <ExpenseDialog tripId={trip.id} onClose={() => setDialog(null)} />}
    </Stack>
  );
}
