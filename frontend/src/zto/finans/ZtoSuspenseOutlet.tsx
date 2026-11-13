import { Component, ReactNode, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "react-router-dom";

/** Sayfa yüklenirken Bootstrap 4 spinner'ı; kök içinde MUI kullanılmaz. */
export function ZtoPageLoading() {
  const { t } = useTranslation("ztoFinans");
  return (
    <div className="d-flex justify-content-center py-4">
      <div className="spinner-border text-primary" role="progressbar" aria-busy="true">
        <span className="sr-only">{t("common.loading")}</span>
      </div>
    </div>
  );
}

function ZtoPageLoadError() {
  const { t } = useTranslation();
  return (
    <div
      className="alert alert-danger d-flex align-items-center justify-content-between"
      role="alert"
    >
      <div>
        <strong>{t("error.title")}</strong> {t("error.pageLoad")}
      </div>
      <button
        type="button"
        className="btn btn-sm btn-outline-danger"
        onClick={() => window.location.reload()}
      >
        {t("error.reload")}
      </button>
    </div>
  );
}

/** Sayfa dosyası yüklenemezse uyarı gösterir; başka sayfaya geçilince sıfırlanır. */
class ZtoPageErrorBoundary extends Component<
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
    return this.state.failed ? <ZtoPageLoadError /> : this.props.children;
  }
}

/** components/lazyPage SuspenseOutlet'in ZTO görünümlü karşılığı. */
export function ZtoSuspenseOutlet() {
  const { pathname } = useLocation();
  return (
    <ZtoPageErrorBoundary resetKey={pathname}>
      <Suspense fallback={<ZtoPageLoading />}>
        <Outlet />
      </Suspense>
    </ZtoPageErrorBoundary>
  );
}
