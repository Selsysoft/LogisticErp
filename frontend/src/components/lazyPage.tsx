import { Alert, AlertTitle, Box, Button, LinearProgress } from "@mui/material";
import { Component, ComponentType, lazy, ReactNode, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "react-router-dom";

/**
 * Sayfayı ayrı dosya olarak, ilk açıldığında yükler. Sayfalar adlı dışa aktarım kullandığı için
 * modülden adıyla alınır.
 */
export function lazyPage<M extends Record<K, ComponentType>, K extends keyof M & string>(
  load: () => Promise<M>,
  name: K,
) {
  return lazy(async () => ({ default: (await load())[name] }));
}

export function PageLoading() {
  return (
    <Box sx={{ py: 1 }} role="progressbar" aria-busy="true">
      <LinearProgress />
    </Box>
  );
}

function PageLoadError() {
  const { t } = useTranslation();
  return (
    <Alert
      severity="error"
      action={
        <Button color="inherit" size="small" onClick={() => window.location.reload()}>
          {t("error.reload")}
        </Button>
      }
    >
      <AlertTitle>{t("error.title")}</AlertTitle>
      {t("error.pageLoad")}
    </Alert>
  );
}

/**
 * Sayfa dosyası yüklenemezse (bağlantı koptu, yeni sürüm yayımlandı) boş ekran yerine uyarı
 * gösterir. Başka sayfaya geçilince sıfırlanır.
 */
class PageErrorBoundary extends Component<
  { resetKey: string; children: ReactNode },
  { failed: boolean; resetKey: string }
> {
  state = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: { resetKey: string },
    state: { failed: boolean; resetKey: string },
  ) {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey };
  }

  render() {
    return this.state.failed ? <PageLoadError /> : this.props.children;
  }
}

/** Sayfa yüklenirken yalnız sayfa alanı bekler; menü ve sekmeler yerinde kalır. */
export function SuspenseOutlet() {
  const { pathname } = useLocation();
  return (
    <PageErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageLoading />}>
        <Outlet />
      </Suspense>
    </PageErrorBoundary>
  );
}
