import { useCallback, useState } from "react";
import { ZtoFinansRoot } from "../ZtoFinansRoot";
import { addRootClass, removeRootClass, rootClassName } from "./rootClass";
import { ZtoFinanceSidebar } from "./ZtoFinanceSidebar";
import { ZtoRootClassContext } from "./ZtoRootClassContext";
import { ZtoSuspenseOutlet } from "./ZtoSuspenseOutlet";

/**
 * /zto-finans/* kabuğu: Blackrose AppShell (AppBar + Drawer) içinde ZTO kökü; solda ZTO'nun finans yan
 * menüsü (zt-sidebar, kökün kenarına yapışık), sağda sayfa. Yerleşim stilleri zt-sidebar.css'teki
 * "Blackrose eki". Sayfalar useZtoRootClass ile sınıf ekler (ZTO body sınıflarının karşılığı): sınıf hem
 * köke (derlenmiş `body.definition-list-page x` → `.zto-finans.definition-list-page x`) hem iç yerleşim
 * öğesine yazılır (derlenmiş `.definition-list-page x` → `.zto-finans .definition-list-page x`; ZTO'da
 * body ata öğedir, kapsamlı CSS'te kökün altında bir ata gerekir).
 */
export function ZtoFinansLayout() {
  const [classes, setClasses] = useState<string[]>([]);
  const register = useCallback((className: string) => {
    setClasses((list) => addRootClass(list, className));
    return () => setClasses((list) => removeRootClass(list, className));
  }, []);
  const pageClass = rootClassName(classes);
  return (
    <ZtoRootClassContext.Provider value={register}>
      <ZtoFinansRoot className={pageClass}>
        <div className={pageClass ? `zto-finans-layout ${pageClass}` : "zto-finans-layout"}>
          <ZtoFinanceSidebar />
          <div className="zto-finans-content">
            <ZtoSuspenseOutlet />
          </div>
        </div>
      </ZtoFinansRoot>
    </ZtoRootClassContext.Provider>
  );
}
