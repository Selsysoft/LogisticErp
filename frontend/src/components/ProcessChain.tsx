import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import EventNoteIcon from "@mui/icons-material/EventNote";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import RequestQuoteIcon from "@mui/icons-material/RequestQuote";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { Box, ButtonBase, Stack, Tooltip, Typography } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BRAND } from "../theme";

const STEPS = [
  { key: "quote", Icon: RequestQuoteIcon },
  { key: "plan", Icon: EventNoteIcon },
  { key: "load", Icon: Inventory2Icon },
  { key: "transit", Icon: LocalShippingIcon },
  { key: "delivery", Icon: AssignmentTurnedInIcon },
  { key: "invoice", Icon: ReceiptLongIcon },
  { key: "collection", Icon: AccountBalanceWalletIcon },
  { key: "profit", Icon: TrendingUpIcon },
];

/** Taşıma sürecinin adımları. Adıma basınca kısa açıklaması görünür. */
export function ProcessChain() {
  const { t } = useTranslation();
  const [active, setActive] = useState<string | null>(null);

  return (
    <Box sx={{ mb: 2.5 }}>
      <Stack
        direction="row"
        sx={{ justifyContent: "center", gap: { xs: 0.5, sm: 1 }, mb: 1.5, flexWrap: "wrap" }}
      >
        {STEPS.map(({ key, Icon }, index) => {
          const selected = active === key;
          return (
            <Tooltip key={key} title={t(`login.chain.${key}.title`)}>
              <ButtonBase
                aria-label={t(`login.chain.${key}.title`)}
                aria-pressed={selected}
                onClick={() => setActive(selected ? null : key)}
                sx={{
                  width: { xs: 32, sm: 36 },
                  height: { xs: 32, sm: 36 },
                  borderRadius: "10px",
                  color: selected ? "#fff" : BRAND.main,
                  background: selected
                    ? BRAND.gradient
                    : `linear-gradient(145deg, #fff, ${BRAND.soft})`,
                  border: `1px solid ${BRAND.softBorder}`,
                  boxShadow: "0 4px 10px rgba(58,110,209,.12)",
                  "@keyframes chainSway": {
                    "0%, 100%": { transform: "translateY(0)" },
                    "50%": { transform: "translateY(-3px)" },
                  },
                  animation: selected ? "none" : "chainSway 3.4s ease-in-out infinite",
                  animationDelay: `${index * 0.12}s`,
                  "&:hover": { background: BRAND.gradient, color: "#fff" },
                  "@media (prefers-reduced-motion: reduce)": { animation: "none" },
                }}
              >
                <Icon sx={{ fontSize: 18 }} />
              </ButtonBase>
            </Tooltip>
          );
        })}
      </Stack>
      <Box
        aria-live="polite"
        sx={{
          px: 1.75,
          py: 1.25,
          borderRadius: "12px",
          textAlign: "center",
          color: BRAND.main,
          background: `linear-gradient(135deg, ${BRAND.soft}, #e0ecff)`,
          border: "1px solid #cfe0ff",
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {active ? t(`login.chain.${active}.title`) : t("login.chainIntro")}
        </Typography>
        {active && (
          <Typography variant="caption" component="p">
            {t(`login.chain.${active}.description`)}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
