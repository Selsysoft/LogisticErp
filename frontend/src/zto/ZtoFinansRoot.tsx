// ZTO'nun Google Fonts Open Sans'ı (layout.css: body.sb-nav-fixed) paketle gelir; CSP dış sunucuya izin vermez.
// ZTO gibi yalnız 400/600 (_ExpertLayout.cshtml:38); kalın (700/800) istekleri 600 yüzüne düşer.
import "@fontsource/open-sans/400.css";
import "@fontsource/open-sans/600.css";
import "./styles/zto-finans.css";
import { ReactNode, useState } from "react";
import { ZtoPortalContext } from "./ZtoPortalContext";

interface ZtoFinansRootProps {
  children: ReactNode;
  className?: string;
}

/**
 * ZTO görünümlü ekranların kapsam kökü. Kapsamlı CSS yalnız bu öğenin altında geçerlidir; içinde MUI
 * bileşeni kullanılmaz. sb-nav-fixed: ZTO'nun body sınıfı (Open Sans, 14px) kökte karşılanır.
 * Çocuklar kök DOM'a bağlandıktan sonra çizilir; portal kapsayıcısı onlar için hiç null olmaz.
 */
export function ZtoFinansRoot({ children, className }: ZtoFinansRootProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  return (
    <div
      className={className ? `zto-finans sb-nav-fixed ${className}` : "zto-finans sb-nav-fixed"}
      ref={setContainer}
    >
      {container && (
        <ZtoPortalContext.Provider value={container}>{children}</ZtoPortalContext.Provider>
      )}
    </div>
  );
}
