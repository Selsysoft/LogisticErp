import { ZtoFinansRoot } from "../ZtoFinansRoot";
import { ZtoFinanceSidebar } from "./ZtoFinanceSidebar";
import { ZtoSuspenseOutlet } from "./ZtoSuspenseOutlet";

/**
 * /zto-finans/* kabuğu: Blackrose AppShell (AppBar + Drawer) içinde ZTO kökü; solda ZTO'nun finans yan
 * menüsü (zt-sidebar, kökün kenarına yapışık), sağda sayfa. Yerleşim stilleri zt-sidebar.css'teki
 * "Blackrose eki".
 */
export function ZtoFinansLayout() {
  return (
    <ZtoFinansRoot>
      <div className="zto-finans-layout">
        <ZtoFinanceSidebar />
        <div className="zto-finans-content">
          <ZtoSuspenseOutlet />
        </div>
      </div>
    </ZtoFinansRoot>
  );
}
