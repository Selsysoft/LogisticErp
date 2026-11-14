import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { useActiveCompanyId } from "../../auth/companyStore";
import {
  branchIdsOfCompany,
  branchIdsOfGroup,
  filterTreeByCompany,
  isMultiCompany,
  useBranchTree,
  type BranchScope,
  type BranchTree,
} from "../branch/branchTree";
import {
  allBranchIds,
  checkState,
  companyKey,
  dropdownLabel,
  expandMatched,
  groupKey,
  isAllSelected,
  normalizeSelection,
  sameSelection,
  searchTree,
  selectionFromValue,
  setMany,
  toggleAll,
  toggleKey,
  toggleOne,
  type BranchMultiSelectVariant,
  type CheckState,
} from "./branchMultiSelectLogic";

/*
 * Şube gruplu iş yeri çoklu seçimi (MX5 §1.7, §5.2).
 * variant="list": Varyant B — Payments.cshtml:466-523 (markup), :1956-2047 (JS); tahsilatta "dcr"
 * önekiyle Collections.cshtml:493-545, :700-760.
 * variant="dropdown": Varyant C — CustomerAccounts/Index.cshtml:4256-4290 (markup), :5757-5760,
 * :6175-6220 (JS). Stiller styles/pages/branch-multiselect.css.
 */

export type ZtoBranchMultiSelectProps = {
  /** Seçili şube (iş yeri) kimlikleri; emptyMeansAll iken [] = tüm iş yerleri. */
  value: string[];
  onChange: (value: string[]) => void;
  variant: BranchMultiSelectVariant;
  scope?: BranchScope;
  includeInactive?: boolean;
  /** Hiçbiri ya da hepsi seçiliyse [] gönderilir (CustomerAccounts/Index.cshtml:5999-6001). */
  emptyMeansAll?: boolean;
  /** Başlık; null ise gösterilmez. Liste: "İş Yeri", açılır liste: "İŞ YERİ (Borç/Alacak)". */
  label?: string | null;
  /** ZTO sınıf öneki: "dpr" (ödeme raporu), "dcr" (tahsilat raporu). Yalnız list varyantı. */
  classPrefix?: "dpr" | "dcr";
  /** Liste altındaki açıklama; null ise gösterilmez. */
  helpText?: string | null;
  /** Açılır listedeki "Tabloyu Yenile" (applyWorkPlaceFilter, :6203-6207); liste kapanır. */
  onApply?: (value: string[]) => void;
  /**
   * Ağacın şirket süzgeci (12.1a §6.5): "active" (varsayılan) = AppBar'daki aktif şirket
   * (useActiveCompanyId; konsolidede tümü), null = tüm şirketler, kimlik = yalnız o şirket.
   */
  companyId?: string | null | "active";
  /** Verilirse useBranchTree yerine kullanılır (test, vitrin). */
  tree?: BranchTree;
};

type TreeStatus = "loading" | "error" | "ready";

const EMPTY_TREE: BranchTree = [];

export function ZtoBranchMultiSelect(props: ZtoBranchMultiSelectProps) {
  if (props.tree) {
    return <BranchMultiSelectView {...props} tree={props.tree} status="ready" />;
  }
  return <FetchedBranchMultiSelect {...props} />;
}

function FetchedBranchMultiSelect(props: ZtoBranchMultiSelectProps) {
  const query = useBranchTree(props.scope ?? "mine", props.includeInactive ?? false);
  const status: TreeStatus = query.isError ? "error" : query.isPending ? "loading" : "ready";
  return <BranchMultiSelectView {...props} tree={query.data ?? EMPTY_TREE} status={status} />;
}

interface ViewProps extends ZtoBranchMultiSelectProps {
  tree: BranchTree;
  status: TreeStatus;
}

function BranchMultiSelectView({ tree: fullTree, ...rest }: ViewProps) {
  const activeCompanyId = useActiveCompanyId();
  // null açıkça "tüm şirketler" demektir; yalnız verilmemişse aktif şirket kullanılır.
  const companyId = rest.companyId === undefined ? "active" : rest.companyId;
  const companyFilter = companyId === "active" ? activeCompanyId : companyId;
  const tree = useMemo(
    () => filterTreeByCompany(fullTree, companyFilter),
    [fullTree, companyFilter],
  );
  const props: ViewProps = { ...rest, tree };
  const { value, onChange, variant, emptyMeansAll = true } = props;
  const allIds = useMemo(() => allBranchIds(tree), [tree]);
  // Ekrandaki kutular: "hepsi seçili" ile "hiçbiri" aynı değeri ([]) gönderdiğinden yerel tutulur;
  // üst bileşen başka bir değer verirse ondan türetilir.
  const [local, setLocal] = useState<{ selected: Set<string>; emitted: string[] } | null>(null);
  const selected =
    local && sameSelection(local.emitted, value)
      ? local.selected
      : selectionFromValue(value, allIds, variant, emptyMeansAll);

  const update = (next: Set<string>) => {
    const emitted = normalizeSelection(next, allIds, emptyMeansAll);
    setLocal({ selected: next, emitted });
    onChange(emitted);
  };
  const emitted = () => normalizeSelection(selected, allIds, emptyMeansAll);

  return variant === "dropdown" ? (
    <DropdownVariant {...props} selected={selected} update={update} emitted={emitted} />
  ) : (
    <ListVariant {...props} selected={selected} update={update} />
  );
}

interface VariantProps extends ViewProps {
  selected: Set<string>;
  update: (next: Set<string>) => void;
}

/** indeterminate yalnız DOM özelliği olarak verilebilir (dprSyncBranch, Payments.cshtml:1975). */
function TriStateCheckbox({
  state,
  className,
  onChange,
}: {
  state: CheckState;
  className: string;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = state.indeterminate;
    }
  });
  return (
    <input
      ref={ref}
      type="checkbox"
      className={className}
      checked={state.checked}
      aria-checked={state.indeterminate ? "mixed" : state.checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}

function onActivateKey(action: () => void) {
  return (event: ReactKeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  };
}

function ListVariant({
  tree,
  status,
  selected,
  update,
  label,
  helpText,
  emptyMeansAll = true,
  classPrefix = "dpr",
}: VariantProps) {
  const { t } = useTranslation("ztoFinans");
  const p = classPrefix;
  const labelId = useId();
  const [term, setTerm] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const search = useMemo(() => searchTree(tree, term), [tree, term]);
  const allIds = allBranchIds(tree);
  const multiCompany = isMultiCompany(tree);
  const toggleText = isAllSelected(allIds, selected) ? t("branch.clear") : t("branch.selectAll");
  const help = helpText === undefined ? (emptyMeansAll ? t("branch.helpText") : null) : helpText;

  const onSearch = (text: string) => {
    setTerm(text);
    // Eşleşen şubeyi aç (Payments.cshtml:2021)
    setCollapsed((current) => expandMatched(current, searchTree(tree, text).expandKeys));
  };
  const toggleCollapsed = (key: string) => setCollapsed((current) => toggleKey(current, key));

  // Başlık satırı: şube (grup) ve ≥2 şirkette şirket için aynı yapı
  const head = (
    key: string,
    icon: string,
    name: string,
    ids: string[],
    extraCheckClass?: string,
  ) => {
    const state = checkState(ids, selected);
    const isCollapsed = collapsed.has(key);
    return (
      <div className={`${p}-branch-head`} onClick={() => toggleCollapsed(key)}>
        <label className={`${p}-branch-label`} onClick={(event) => event.stopPropagation()}>
          <TriStateCheckbox
            state={state}
            className={cx(`${p}-branch-check`, extraCheckClass)}
            onChange={(checked) => update(setMany(selected, ids, checked))}
          />
          <i className={`fas ${icon}`} aria-hidden="true" />
          <span className={`${p}-branch-name`}>{name}</span>
          <span className={`${p}-branch-count`}>
            {t("branch.branchCount", { checked: state.selected, total: state.total })}
          </span>
        </label>
        <i
          className={`fas fa-chevron-down ${p}-chev`}
          role="button"
          tabIndex={0}
          aria-label={`${name}: ${t("branch.toggleGroup")}`}
          aria-expanded={!isCollapsed}
          onKeyDown={onActivateKey(() => toggleCollapsed(key))}
        />
      </div>
    );
  };

  return (
    <div className="form-group mb-0">
      <div className="d-flex justify-content-between align-items-center mb-2">
        {label !== null && (
          <label className="font-weight-bold mb-0" id={labelId}>
            {label ?? t("branch.workPlace")}{" "}
            <span className="text-muted font-weight-normal">({t("branch.multiSelectHint")})</span>
          </label>
        )}
        <a
          href="#"
          role="button"
          className="small"
          onClick={(event) => {
            event.preventDefault();
            update(toggleAll(allIds, selected));
          }}
        >
          {toggleText}
        </a>
      </div>
      <div className={`${p}-wp-search`}>
        <i className="fas fa-search" aria-hidden="true" />
        <input
          type="text"
          className="form-control"
          placeholder={t("branch.searchPlaceholder")}
          aria-label={t("branch.searchPlaceholder")}
          autoComplete="off"
          value={term}
          onChange={(event) => onSearch(event.target.value)}
        />
      </div>
      <div
        className={`${p}-wp-list`}
        role="group"
        aria-labelledby={label !== null ? labelId : undefined}
        aria-busy={status === "loading"}
      >
        {status === "loading" && <div className="small text-muted p-1">{t("common.loading")}</div>}
        {status === "error" && (
          <div className="small text-danger p-1" role="alert">
            {t("branch.loadFailed")}
          </div>
        )}
        {tree.map((company) => {
          const cKey = companyKey(company);
          return (
            <Fragment key={cKey}>
              {multiCompany && (
                <div
                  className={cx(
                    `${p}-branch`,
                    `${p}-company`,
                    collapsed.has(cKey) && "collapsed",
                    !search.visibleCompanyKeys.has(cKey) && "hidden",
                  )}
                  data-company-name={company.companyName}
                >
                  {head(
                    cKey,
                    "fa-building",
                    company.companyName,
                    branchIdsOfCompany(company),
                    `${p}-company-check`,
                  )}
                </div>
              )}
              {!(multiCompany && collapsed.has(cKey)) &&
                company.groups.map((group) => {
                  const gKey = groupKey(company, group);
                  return (
                    <div
                      key={gKey}
                      className={cx(
                        `${p}-branch`,
                        collapsed.has(gKey) && "collapsed",
                        !search.visibleGroupKeys.has(gKey) && "hidden",
                      )}
                      data-branch-name={group.groupName}
                    >
                      {head(gKey, "fa-code-branch", group.groupName, branchIdsOfGroup(group))}
                      <div className={`${p}-branch-body`}>
                        {group.branches.map((branch) => (
                          <label
                            key={branch.id}
                            className={cx(
                              `${p}-wp-item`,
                              !search.visibleBranchIds.has(branch.id) && "hidden",
                            )}
                            data-wp-name={branch.name}
                          >
                            <input
                              className={`${p}-wp-check`}
                              type="checkbox"
                              value={branch.id}
                              checked={selected.has(branch.id)}
                              onChange={() => update(toggleOne(selected, branch.id))}
                            />
                            <span>{branch.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </Fragment>
          );
        })}
      </div>
      {help !== null && <small className="form-text text-muted">{help}</small>}
    </div>
  );
}

function DropdownVariant({
  tree,
  status,
  selected,
  update,
  label,
  onApply,
  emitted,
}: VariantProps & { emitted: () => string[] }) {
  const { t } = useTranslation("ztoFinans");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const allIds = allBranchIds(tree);
  const multiCompany = isMultiCompany(tree);

  // Dışarı tıklayınca kapan (CustomerAccounts/Index.cshtml:5756-5760)
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onDocumentClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, [open]);

  const text = (() => {
    const result = dropdownLabel(tree, selected);
    switch (result.kind) {
      case "all":
        return t("branch.allTotal");
      case "none":
        return t("branch.noneSelected");
      case "one":
        return result.name;
      default:
        return t("branch.selectedCount", { count: result.count });
    }
  })();

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <>
      {label !== null && (
        <label className="filter-label" id={labelId}>
          {label ?? t("branch.balanceFilterLabel")}
        </label>
      )}
      <div
        className="wp-multiselect-container"
        ref={containerRef}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.stopPropagation();
            close();
          }
        }}
      >
        <button
          ref={buttonRef}
          type="button"
          className="filter-field wp-multiselect-btn"
          aria-haspopup="true"
          aria-expanded={open}
          aria-labelledby={label !== null ? `${labelId} ${labelId}-value` : undefined}
          onClick={() => setOpen((current) => !current)}
        >
          <span id={`${labelId}-value`}>{text}</span>
          <i className="fas fa-chevron-down" style={{ fontSize: "10px" }} aria-hidden="true" />
        </button>
        {open && (
          <div className="wp-multiselect-dropdown">
            <div className="wp-multiselect-actions">
              <button
                type="button"
                style={{ background: "#10b981", color: "#fff" }}
                onClick={() => update(new Set(allIds))}
              >
                <i className="fas fa-check-double" style={{ marginRight: "3px" }} />
                {t("branch.selectAllButton")}
              </button>
              <button
                type="button"
                style={{ background: "#ef4444", color: "#fff" }}
                onClick={() => update(new Set())}
              >
                <i className="fas fa-times" style={{ marginRight: "3px" }} />
                {t("branch.removeAll")}
              </button>
            </div>
            <div role="group" aria-labelledby={label !== null ? labelId : undefined}>
              {status === "loading" && (
                <div className="wp-multiselect-item text-muted">{t("common.loading")}</div>
              )}
              {status === "error" && (
                <div className="wp-multiselect-item text-danger" role="alert">
                  {t("branch.loadFailed")}
                </div>
              )}
              {tree.map((company) => {
                const ids = branchIdsOfCompany(company);
                return (
                  <Fragment key={companyKey(company)}>
                    {multiCompany && (
                      <label className="wp-multiselect-item wp-multiselect-company">
                        <TriStateCheckbox
                          state={checkState(ids, selected)}
                          className="wp-company-checkbox"
                          onChange={(checked) => update(setMany(selected, ids, checked))}
                        />
                        <i className="fas fa-building" aria-hidden="true" />
                        <span>{company.companyName}</span>
                      </label>
                    )}
                    {company.groups.flatMap((group) =>
                      group.branches.map((branch) => (
                        <label key={branch.id} className="wp-multiselect-item">
                          <input
                            type="checkbox"
                            className="wp-checkbox"
                            value={branch.id}
                            data-wpid={branch.id}
                            checked={selected.has(branch.id)}
                            onChange={() => update(toggleOne(selected, branch.id))}
                          />
                          <span>{branch.name}</span>
                        </label>
                      )),
                    )}
                  </Fragment>
                );
              })}
            </div>
            <div
              style={{
                padding: "6px 8px",
                borderTop: "1px solid #e5e7eb",
                background: "#f8fafc",
              }}
            >
              <button
                type="button"
                style={{
                  width: "100%",
                  background: "#3b82f6",
                  color: "#fff",
                  border: "none",
                  padding: "6px 10px",
                  borderRadius: "5px",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                onClick={() => {
                  close();
                  onApply?.(emitted());
                }}
              >
                <i className="fas fa-filter mr-1" />
                {t("branch.refreshTable")}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
