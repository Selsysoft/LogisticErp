import { AppBar, Container, Toolbar, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { Route, Routes } from "react-router-dom";
import { EmptyState } from "./components/EmptyState";
import { HomePage } from "./pages/HomePage";

export function App() {
  const { t } = useTranslation();

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6">{t("appName")}</Typography>
        </Toolbar>
      </AppBar>
      <Container sx={{ py: 3 }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="*"
            element={
              <EmptyState title={t("notFound.title")} description={t("notFound.description")} />
            }
          />
        </Routes>
      </Container>
    </>
  );
}
