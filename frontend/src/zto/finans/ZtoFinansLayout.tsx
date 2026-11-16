import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ZtoSnackbarProvider } from "../components/ZtoSnackbar";
import { ZtoFinansRoot } from "../ZtoFinansRoot";
import { hasQuickCariParam, QuickCariContext, withoutQuickCariParam } from "./quickCariContext";
import { addRootClass, removeRootClass, rootClassName } from "./rootClass";
import { hasTreasuryParam, TreasuryContext, withoutTreasuryParam } from "./treasuryContext";
import { ZtoFinanceSidebar } from "./ZtoFinanceSidebar";
import { ZtoRootClassContext } from "./ZtoRootClassContext";
import { ZtoSuspenseOutlet } from "./ZtoSuspenseOutlet";

// Hızlı Cari modalı ilk açılışta yüklenir (cari arama ve kart ızgarası her sayfada gerekmez).
const QuickCariModal = lazy(() =>
  import("./QuickCariModal").then((module) => ({ default: module.QuickCariModal })),
);

// 12.8: Hızlı Bakiye Özeti modalı da ilk açılışta yüklenir (grafikler ve tablolar her sayfada gerekmez).
const TreasuryModal = lazy(() =>
  import("./TreasuryModal").then((module) => ({ default: module.TreasuryModal })),
);

/**
 * /zto-finans/* kabuğu: Blackrose AppShell (AppBar + Drawer) içinde ZTO kökü; solda ZTO'nun finans yan
 * menüsü (zt-sidebar, kökün kenarına yapışık), sağda sayfa. Yerleşim stilleri zt-sidebar.css'teki
 * "Blackrose eki". Sayfalar useZtoRootClass ile sınıf ekler (ZTO body sınıflarının karşılığı): sınıf hem
 * köke (derlenmiş `body.definition-list-page x` → `.zto-finans.definition-list-page x`) hem iç yerleşim
 * öğesine yazılır (derlenmiş `.definition-list-page x` → `.zto-finans .definition-list-page x`; ZTO'da
 * body ata öğedir, kapsamlı CSS'te kökün altında bir ata gerekir).
 * 12.1: ZTO `showSnackbar` sağlayıcısı (ZtoSnackbarProvider) ve her sayfadan açılan Hızlı Cari İşlemi
 * modalı (QuickCariContext; `?quickcari=1` ile de açılır, parametre geçmişten silinir).
 * 12.8: Hızlı Bakiye Özeti modalı (ZTO `#treasuryModal`; TreasuryContext, `?treasury=1`) aynı biçimde.
 */
export function ZtoFinansLayout() {
  const [classes, setClasses] = useState<string[]>([]);
  const register = useCallback((className: string) => {
    setClasses((list) => addRootClass(list, className));
    return () => setClasses((list) => removeRootClass(list, className));
  }, []);
  const pageClass = rootClassName(classes);

  const [quickCariShown, setQuickCariShown] = useState(false);
  const [quickCariLoaded, setQuickCariLoaded] = useState(false);
  const openQuickCari = useCallback(() => {
    setQuickCariLoaded(true);
    setQuickCariShown(true);
  }, []);
  const hideQuickCari = useCallback(() => setQuickCariShown(false), []);
  const quickCari = useMemo(() => ({ open: openQuickCari }), [openQuickCari]);

  const [treasuryShown, setTreasuryShown] = useState(false);
  const [treasuryLoaded, setTreasuryLoaded] = useState(false);
  const openTreasury = useCallback(() => {
    setTreasuryLoaded(true);
    setTreasuryShown(true);
  }, []);
  const hideTreasury = useCallback(() => setTreasuryShown(false), []);
  const treasury = useMemo(() => ({ open: openTreasury }), [openTreasury]);

  const location = useLocation();
  const navigate = useNavigate();
  // `?quickcari=1` / `?treasury=1` modalı açar; parametreler tek gezinmeyle geçmişten silinir.
  useEffect(() => {
    const quick = hasQuickCariParam(location.search);
    const treasuryParam = hasTreasuryParam(location.search);
    if (!quick && !treasuryParam) return;
    if (quick) openQuickCari();
    if (treasuryParam) openTreasury();
    navigate(
      {
        pathname: location.pathname,
        search: withoutTreasuryParam(withoutQuickCariParam(location.search)),
        hash: location.hash,
      },
      { replace: true, state: location.state },
    );
  }, [location, navigate, openQuickCari, openTreasury]);

  return (
    <ZtoRootClassContext.Provider value={register}>
      <QuickCariContext.Provider value={quickCari}>
        <TreasuryContext.Provider value={treasury}>
          <ZtoFinansRoot className={pageClass}>
            <ZtoSnackbarProvider>
              <div className={pageClass ? `zto-finans-layout ${pageClass}` : "zto-finans-layout"}>
                <ZtoFinanceSidebar />
                <div className="zto-finans-content">
                  <ZtoSuspenseOutlet />
                </div>
              </div>
              {quickCariLoaded && (
                <Suspense fallback={null}>
                  <QuickCariModal show={quickCariShown} onHide={hideQuickCari} />
                </Suspense>
              )}
              {treasuryLoaded && (
                <Suspense fallback={null}>
                  <TreasuryModal show={treasuryShown} onHide={hideTreasury} />
                </Suspense>
              )}
            </ZtoSnackbarProvider>
          </ZtoFinansRoot>
        </TreasuryContext.Provider>
      </QuickCariContext.Provider>
    </ZtoRootClassContext.Provider>
  );
}
