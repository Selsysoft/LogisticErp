import { Box, Typography } from "@mui/material";

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <Box sx={{ py: 6, textAlign: "center" }}>
      <Typography variant="h6">{title}</Typography>
      {description && <Typography color="text.secondary">{description}</Typography>}
    </Box>
  );
}
