import { useTranslation } from "react-i18next";

/**
 * İzinsiz kullanıcı iskeleti: ZTO WorkPlace/Index.cshtml:73-83 (`div.row > div.col-xl-12.text-center >
 * p`). ZTO'daki factory2.jpg ve "Admin kullanıcısı olmadığınız için…" metni alınmadı (Blackrose'da
 * Admin rolü yok; 12.1a §6.6).
 */
export function ZtoAccessDenied() {
  const { t } = useTranslation("ztoFinans");
  return (
    <div className="row">
      <div className="col-xl-12 text-center">
        <p>{t("definitions.accessDenied")}</p>
      </div>
    </div>
  );
}
