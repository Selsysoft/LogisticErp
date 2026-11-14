import {
  createContext,
  forwardRef,
  ReactNode,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useState,
  type HTMLAttributes,
  type Ref,
} from "react";
import Modal from "react-bootstrap/Modal";
import { useTranslation } from "react-i18next";
import { useZtoPortalContainer, ZtoOverlayContainerContext } from "../ZtoPortalContext";
import { ztoModalManager } from "./ztoModalManager";

export type ZtoModalSize = "sm" | "lg" | "xl";

export type ZtoModalProps = {
  show: boolean;
  onHide: () => void;
  /** h5.modal-title içeriği; ZTO başlıkları çoğunlukla "<i class='fas …'></i> Metin". */
  title?: ReactNode;
  /**
   * Başlığın üstündeki öğe; verilirse başlık `div > {titlePrefix} + h5.modal-title` olarak sarılır
   * (ZTO _DefinitionDetailsModal.cshtml:31-34 "KAYIT DETAYI" üst etiketi).
   */
  titlePrefix?: ReactNode;
  size?: ZtoModalSize;
  centered?: boolean;
  scrollable?: boolean;
  /** "static": dışarı tıklamak kapatmaz (Bootstrap data-backdrop="static"). */
  backdrop?: boolean | "static";
  /** false: ESC kapatmaz (backdrop ne olursa olsun; Bootstrap 4 jQuery davranışı). */
  keyboard?: boolean;
  footer?: ReactNode;
  /** ZTO'da sık: "bg-primary text-white", "bg-danger text-white", "bg-warning text-dark". */
  headerClassName?: string;
  /** Kapat düğmesine ek sınıf (koyu başlıkta ZTO "text-white" kullanır). */
  closeButtonClassName?: string;
  /** false: başlıkta × düğmesi çizilmez. */
  closeButton?: boolean;
  /** Kapat düğmesini geçici olarak kilitler (ör. kayıt sürerken). */
  closeDisabled?: boolean;
  titleAs?: "h4" | "h5" | "h6";
  dialogClassName?: string;
  contentClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  /** .modal öğesine ek sınıf. */
  className?: string;
  /**
   * Başlığın id'si `${id}Label` olur (ZTO adlandırması). react-bootstrap 1.6 ek nitelikleri .modal'a
   * değil .modal-dialog'a geçirdiği için id de oradadır.
   */
  id?: string;
  /**
   * `.modal` kök öğesinin id'si (ZTO seçicileri `#cariTasimaModal .modal-dialog`,
   * `#quickCariActionModal` köke bakar). `id`'den bağımsızdır; `id` `.modal-dialog`'da kalır.
   */
  rootId?: string;
  /**
   * Çıplak kip: başlık/gövde/altbilgi sarmalayıcıları yazılmaz, çocuklar doğrudan `.modal-content`
   * içine çizilir (ZTO Hızlı Cari `.modal-content.qca-content > .qca-header + .qca-body`).
   */
  bare?: boolean;
  /** `.modal`'ın aria-labelledby'ı; verilmezse başlığın id'si (çıplak kipte verilmeli). */
  ariaLabelledBy?: string;
  animation?: boolean;
  autoFocus?: boolean;
  enforceFocus?: boolean;
  restoreFocus?: boolean;
  onShow?: () => void;
  onEntered?: () => void;
  onExited?: () => void;
  children?: ReactNode;
};

// Bootstrap 4'te ".modal-open .modal" kuralı body'deki sınıfa bakar; kapsamlı CSS'te sınıf kökte
// olduğu için (".zto-finans .modal-open .modal" eşleşmez) uzun modalın kaydırması satır içi verilir.
const MODAL_STYLE = { overflowX: "hidden", overflowY: "auto" } as const;

const preventEscape = (event: KeyboardEvent) => event.preventDefault();

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Çıplak kipte `.modal-content` ref'i (react-bootstrap dialogAs bileşenine ref geçirmez). */
const BareContentRefContext = createContext<Ref<HTMLDivElement> | null>(null);

type BareDialogProps = HTMLAttributes<HTMLDivElement> & {
  contentClassName?: string;
  centered?: boolean;
  size?: ZtoModalSize;
  scrollable?: boolean;
};

/**
 * react-bootstrap 1.6 ModalDialog ile aynı işaretleme (Modal bsPrefix'i dialogAs'a geçirmez) (div.modal-dialog[.modal-lg …] >
 * div.modal-content); tek fark `.modal-content`'e ref bağlanması.
 */
const ZtoBareDialog = forwardRef<HTMLDivElement, BareDialogProps>(function ZtoBareDialog(
  { className, contentClassName, centered, size, scrollable, children, ...rest },
  ref,
) {
  const contentRef = useContext(BareContentRefContext);
  return (
    <div
      {...rest}
      ref={ref}
      className={cx(
        "modal-dialog",
        className,
        size && `modal-${size}`,
        centered && "modal-dialog-centered",
        scrollable && "modal-dialog-scrollable",
      )}
    >
      <div className={cx("modal-content", contentClassName)} ref={contentRef}>
        {children}
      </div>
    </div>
  );
});

/**
 * ZTO/Bootstrap 4 modalı: div.modal.fade.show > div.modal-dialog > div.modal-content >
 * div.modal-header (h5.modal-title + button.close) + div.modal-body + div.modal-footer.
 * .zto-finans köküne portal'lanır; kök dışında (kapsayıcı yokken) hiçbir şey çizmez.
 * Odak tuzağı, ESC ve üst üste açılma react-bootstrap ile ztoModalManager'dadır. Modalın içindeki
 * açılır liste/tooltip/popover .modal öğesine portal'lanır (ZTO select2 dropdownParent: $('.modal')):
 * aksi halde odak tuzağı arama kutusunun odağını geri alır, liste üst üste modalda arkada kalır.
 * İç içe ZtoModal yine köke portal'lanır (useZtoPortalContainer).
 */
export function ZtoModal({
  show,
  onHide,
  title,
  titlePrefix,
  size,
  centered,
  scrollable,
  backdrop = true,
  keyboard = true,
  footer,
  headerClassName,
  closeButtonClassName,
  closeButton = true,
  closeDisabled = false,
  titleAs: TitleTag = "h5",
  dialogClassName,
  contentClassName,
  bodyClassName,
  footerClassName,
  className,
  id,
  rootId,
  bare = false,
  ariaLabelledBy,
  animation = true,
  autoFocus,
  enforceFocus,
  restoreFocus,
  onShow,
  onEntered,
  onExited,
  children,
}: ZtoModalProps) {
  const { t } = useTranslation("ztoFinans");
  const generatedId = useId();
  const container = useZtoPortalContainer();
  const [modalElement, setModalElement] = useState<HTMLElement | null>(null);
  // .modal öğesine react-bootstrap 1.6 ref vermez; gövdeden yukarı çıkılarak bulunur.
  const bodyRef = useCallback((node: HTMLDivElement | null) => {
    setModalElement(node?.closest<HTMLElement>(".modal") ?? null);
  }, []);
  // rootId: react-bootstrap ek nitelikleri .modal-dialog'a geçirdiği için .modal'a elle yazılır;
  // role/aria-* niteliklerine dokunulmaz. Öğe kapanışta zaten kalkar; prop değişirse eski id silinir.
  useLayoutEffect(() => {
    if (!modalElement || !rootId) return;
    modalElement.id = rootId;
    return () => {
      if (modalElement.id === rootId) modalElement.removeAttribute("id");
    };
  }, [modalElement, rootId]);
  if (!container) {
    return null;
  }
  const titleId = `${id ?? generatedId}Label`;
  const hasHeader = !bare && (title !== undefined || closeButton);
  const labelledBy = ariaLabelledBy ?? (title !== undefined && !bare ? titleId : undefined);
  // react-bootstrap keyboard=false'u yalnız backdrop="static" iken uygular; diğer durumda ESC
  // onEscapeKeyDown'da engellenir (RB bu geri çağrıyı yalnız keyboard=true iken çağırır).
  const blockEscape = !keyboard && backdrop !== "static";
  const modal = (
    <Modal
      show={show}
      onHide={onHide}
      container={container}
      manager={ztoModalManager}
      size={size}
      centered={centered}
      scrollable={scrollable}
      backdrop={backdrop}
      keyboard={blockEscape ? true : keyboard}
      onEscapeKeyDown={blockEscape ? preventEscape : undefined}
      animation={animation}
      autoFocus={autoFocus}
      enforceFocus={enforceFocus}
      restoreFocus={restoreFocus}
      onShow={onShow}
      onEntered={onEntered}
      onExited={onExited}
      id={id}
      className={className}
      style={MODAL_STYLE}
      dialogClassName={dialogClassName}
      contentClassName={contentClassName}
      aria-labelledby={labelledBy}
      role="document"
      dialogAs={bare ? ZtoBareDialog : undefined}
    >
      <ZtoOverlayContainerContext.Provider value={modalElement}>
        {bare ? (
          children
        ) : (
          <>
            {hasHeader && (
              <div className={headerClassName ? `modal-header ${headerClassName}` : "modal-header"}>
                {title !== undefined &&
                  (titlePrefix !== undefined ? (
                    <div>
                      {titlePrefix}
                      <TitleTag className="modal-title" id={titleId}>
                        {title}
                      </TitleTag>
                    </div>
                  ) : (
                    <TitleTag className="modal-title" id={titleId}>
                      {title}
                    </TitleTag>
                  ))}
                {closeButton && (
                  <button
                    type="button"
                    className={closeButtonClassName ? `close ${closeButtonClassName}` : "close"}
                    data-dismiss="modal"
                    aria-label={t("modal.close")}
                    onClick={onHide}
                    disabled={closeDisabled}
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                )}
              </div>
            )}
            <div
              ref={bodyRef}
              className={bodyClassName ? `modal-body ${bodyClassName}` : "modal-body"}
            >
              {children}
            </div>
            {footer !== undefined && footer !== null && (
              <div className={footerClassName ? `modal-footer ${footerClassName}` : "modal-footer"}>
                {footer}
              </div>
            )}
          </>
        )}
      </ZtoOverlayContainerContext.Provider>
    </Modal>
  );
  return bare ? (
    <BareContentRefContext.Provider value={bodyRef}>{modal}</BareContentRefContext.Provider>
  ) : (
    modal
  );
}
