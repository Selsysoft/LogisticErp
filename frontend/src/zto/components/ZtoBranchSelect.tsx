import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../auth/authStore";
import { useActiveCompanyId } from "../../auth/companyStore";
import {
  BranchScope,
  BranchTree,
  filterTreeByCompany,
  findBranch,
  useBranchTree,
} from "../branch/branchTree";
import { branchTreeToSelectItems, readDefaultBranchId } from "./selectLogic";
import { ZtoSelect } from "./ZtoSelect";

export type ZtoBranchSelectProps = {
  /** Seçili şube (iş yeri) kimliği; "" = seçim yok ya da allowAll'da "Tüm İş Yerleri". */
  value: string;
  onChange: (branchId: string) => void;
  /** İlk seçenek "Tüm İş Yerleri" (boş değer); filtre kutuları için (Payments.cshtml:329). */
  allowAll?: boolean;
  required?: boolean;
  /** Değer boşsa kullanıcının varsayılan şubesi bir kez seçilir (oturumda alan yoksa yok sayılır). */
  defaultToUserBranch?: boolean;
  scope?: BranchScope;
  includeInactive?: boolean;
  disabled?: boolean;
  id?: string;
  name?: string;
  /** Gizli select sınıfları (varsayılan "form-control"); "no-select2" yerel select çizer. */
  className?: string;
  /** allowAll yokken yer tutucu; varsayılan "İş Yeri Seçiniz". */
  placeholder?: string;
  /** allowAll yokken × ile temizleme; varsayılan zorunlu değilse açık. */
  allowClear?: boolean;
  minimumResultsForSearch?: number;
  /**
   * Ağacın şirket süzgeci (12.1a §6.5): "active" (varsayılan) = AppBar'daki aktif şirket
   * (useActiveCompanyId; konsolidede tümü), null = tüm şirketler, kimlik = yalnız o şirket.
   */
  companyId?: string | null | "active";
  /** Verilirse useBranchTree yerine kullanılır (test, vitrin). */
  tree?: BranchTree;
  /** Hata bağlantısı; ZtoSelect odaklanan öğeye yazar (MWG accessible-error-announcement). */
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

/**
 * Şube gruplu tekli iş yeri seçimi (MX5 §1.7 Varyant A, §5.2): optgroup = şube grubu, ≥2 şirkette
 * "Şirket › Grup". ZTO #filterWorkPlace (Views/CustomerAccountPayment/Payments.cshtml:325-355); etiket
 * ve form-group sarması kullanan ekrandadır, bileşen yalnız select'tir.
 */
export function ZtoBranchSelect(props: ZtoBranchSelectProps) {
  return props.tree ? (
    <BranchSelectView {...props} tree={props.tree} loading={false} error={false} />
  ) : (
    <LiveBranchSelect {...props} />
  );
}

function LiveBranchSelect(props: ZtoBranchSelectProps) {
  const { data, isPending, isError } = useBranchTree(
    props.scope ?? "mine",
    props.includeInactive ?? false,
  );
  return <BranchSelectView {...props} tree={data} loading={isPending} error={isError} />;
}

function BranchSelectView({
  value,
  onChange,
  allowAll = false,
  required = false,
  defaultToUserBranch = false,
  disabled = false,
  id,
  name,
  className,
  placeholder,
  allowClear,
  minimumResultsForSearch,
  companyId = "active",
  tree: fullTree,
  loading,
  error,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: Omit<ZtoBranchSelectProps, "tree"> & {
  tree: BranchTree | undefined;
  loading: boolean;
  /** Yükleme hatası: kutu kilitlenir, ZtoBranchMultiSelect gibi role=alert ile bildirilir. */
  error: boolean;
}) {
  const { t } = useTranslation("ztoFinans");
  const defaultBranchId = useAuthStore((state) => readDefaultBranchId(state.me));
  const activeCompanyId = useActiveCompanyId();
  const companyFilter = companyId === "active" ? activeCompanyId : companyId;
  const tree = useMemo(
    () => (fullTree ? filterTreeByCompany(fullTree, companyFilter) : undefined),
    [fullTree, companyFilter],
  );

  const allLabel = allowAll ? t("select.allWorkPlaces") : undefined;
  const inactiveSuffix = t("select.inactiveSuffix");
  const items = useMemo(
    () => branchTreeToSelectItems(tree ?? [], { allLabel, inactiveSuffix }),
    [tree, allLabel, inactiveSuffix],
  );

  // Varsayılan şube yalnız bir kez ve değer boşken uygulanır; kullanıcı sonra temizleyebilir.
  const defaultApplied = useRef(false);
  useEffect(() => {
    if (!defaultToUserBranch || defaultApplied.current || !tree || !defaultBranchId) {
      return;
    }
    defaultApplied.current = true;
    if (value === "" && findBranch(tree, defaultBranchId)?.active) {
      onChange(defaultBranchId);
    }
  }, [defaultToUserBranch, tree, defaultBranchId, value, onChange]);

  return (
    <>
      <ZtoSelect
        value={value}
        onChange={onChange}
        options={items}
        // allowAll: "Tüm İş Yerleri" kendi metniyle kalır (ZTO global "Seçiniz..." yer tutucusu yok).
        placeholder={allowAll ? null : (placeholder ?? t("select.workPlacePlaceholder"))}
        allowClear={allowAll ? false : (allowClear ?? !required)}
        // "Tüm İş Yerleri" boş değerdir; allowAll ile zorunluluk anlamsız olur.
        required={required && !allowAll}
        disabled={disabled || loading || error}
        title={error ? t("branch.loadFailed") : undefined}
        id={id}
        name={name}
        className={className}
        minimumResultsForSearch={minimumResultsForSearch}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
      />
      {error && (
        <div className="small text-danger" role="alert">
          {t("branch.loadFailed")}
        </div>
      )}
    </>
  );
}
