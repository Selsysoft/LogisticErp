import { Box, Card, CardContent, Typography } from "@mui/material";
import { ReactNode } from "react";

export function CenteredCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", px: 2, py: { xs: 4, md: 8 } }}>
      <Card sx={{ width: "100%", maxWidth: 420 }}>
        <CardContent>
          <Typography variant="h5" component="h1" gutterBottom>
            {title}
          </Typography>
          {children}
        </CardContent>
      </Card>
    </Box>
  );
}
