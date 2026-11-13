import { ReactElement, ReactNode, useId } from "react";
import OverlayTrigger, { OverlayDelay, OverlayTriggerType } from "react-bootstrap/OverlayTrigger";
import Popover from "react-bootstrap/Popover";
import Tooltip from "react-bootstrap/Tooltip";
import { useZtoOverlayContainer } from "../ZtoPortalContext";

/** Bootstrap 4 / Popper 2 yerleşimleri. */
export type ZtoPlacement =
  | "auto"
  | "auto-start"
  | "auto-end"
  | "top"
  | "top-start"
  | "top-end"
  | "bottom"
  | "bottom-start"
  | "bottom-end"
  | "right"
  | "right-start"
  | "right-end"
  | "left"
  | "left-start"
  | "left-end";

export interface ZtoTooltipProps {
  /** .tooltip-inner içeriği (ZTO data-toggle="tooltip" title="…"). */
  content: ReactNode;
  /** Ref alabilen tek öğe (button, span, a …); react-bootstrap olay ve aria-describedby ekler. */
  children: ReactElement;
  /** Bootstrap varsayılanı "top". */
  placement?: ZtoPlacement;
  /** Bootstrap varsayılanı hover + focus (dokunmatik/klavyede de açılır). */
  trigger?: OverlayTriggerType | OverlayTriggerType[];
  delay?: OverlayDelay;
  id?: string;
  className?: string;
  /** true: ipucu hiç gösterilmez, yalnız çocuk çizilir. */
  disabled?: boolean;
}

/**
 * Bootstrap 4 ipucu: div.tooltip.bs-tooltip-{yer}[role=tooltip] > div.arrow + div.tooltip-inner.
 * .zto-finans köküne portal'lanır (kapsamlı CSS ve z-index 1420); kök dışında yalnız çocuk çizilir.
 */
export function ZtoTooltip({
  content,
  children,
  placement = "top",
  trigger = ["hover", "focus"],
  delay,
  id,
  className,
  disabled,
}: ZtoTooltipProps) {
  const generatedId = useId();
  const container = useZtoOverlayContainer();
  if (!container || disabled || content === null || content === undefined || content === "") {
    return children;
  }
  return (
    <OverlayTrigger
      placement={placement}
      trigger={trigger}
      delay={delay}
      container={container}
      overlay={
        <Tooltip id={id ?? generatedId} className={className}>
          {content}
        </Tooltip>
      }
    >
      {children}
    </OverlayTrigger>
  );
}

export interface ZtoPopoverProps {
  /** h3.popover-header; verilmezse başlık çizilmez (ZTO invoice-popover şablonu gibi). */
  title?: ReactNode;
  /** div.popover-body içeriği. */
  content: ReactNode;
  children: ReactElement;
  /** Bootstrap popover varsayılanı "right". */
  placement?: ZtoPlacement;
  /** ZTO'da trigger: 'click'. */
  trigger?: OverlayTriggerType | OverlayTriggerType[];
  /** Dışarı tıklayınca ya da ESC ile kapanır (ZTO'daki document click işleyicisinin karşılığı). */
  rootClose?: boolean;
  /** Denetimli kullanım: show + onToggle birlikte. */
  show?: boolean;
  onToggle?: (show: boolean) => void;
  id?: string;
  /** Ek sınıf, ör. ZTO "invoice-popover". */
  className?: string;
  bodyClassName?: string;
}

/**
 * Bootstrap 4 popover: div.popover.bs-popover-{yer}[role=tooltip] > div.arrow + h3.popover-header +
 * div.popover-body. ZTO para birimi kutusu (Views/ProductionExpenses/IndexExpenses.cshtml
 * #currencyTooltipContainer) ve fatura popover'ı (Views/AccountTransaction/Transactions.cshtml) için
 * ortak bileşen; .zto-finans köküne portal'lanır.
 */
export function ZtoPopover({
  title,
  content,
  children,
  placement = "right",
  trigger = "click",
  rootClose = true,
  show,
  onToggle,
  id,
  className,
  bodyClassName,
}: ZtoPopoverProps) {
  const generatedId = useId();
  const container = useZtoOverlayContainer();
  if (!container) {
    return children;
  }
  return (
    <OverlayTrigger
      placement={placement}
      trigger={trigger}
      rootClose={rootClose}
      show={show}
      onToggle={onToggle}
      container={container}
      overlay={
        <Popover id={id ?? generatedId} className={className}>
          {title !== undefined && title !== null && <Popover.Title as="h3">{title}</Popover.Title>}
          <Popover.Content className={bodyClassName}>{content}</Popover.Content>
        </Popover>
      }
    >
      {children}
    </OverlayTrigger>
  );
}
