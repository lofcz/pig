import {
  useState,
  useRef,
  useEffect,
  cloneElement,
  isValidElement,
  ReactElement,
  ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  computePosition,
  autoUpdate,
  offset,
  flip,
  shift,
  arrow,
  type Placement,
} from '@floating-ui/dom';

interface TooltipProps {
  content: ReactNode;
  /** A single element. Tooltip attaches its ref + hover/focus listeners to it directly. */
  children: ReactElement<{
    ref?: React.Ref<HTMLElement>;
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseLeave?: (e: React.MouseEvent) => void;
    onFocus?: (e: React.FocusEvent) => void;
    onBlur?: (e: React.FocusEvent) => void;
  }>;
  placement?: Placement;
  /** Delay in ms before showing on hover. Focus opens immediately. Default 500ms. */
  delay?: number;
}

const ARROW_SIZE = 8; // px (square; rendered as 45deg rotated diamond)
const CLOSE_ANIM_MS = 120; // keep in sync with .tooltip-portal[data-state="closing"] animation

export function Tooltip({ content, children, placement = 'top', delay = 500 }: TooltipProps) {
  // `mounted` controls whether the portal is in the DOM at all.
  // `closing` flips on a fade-out animation just before unmount.
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [coords, setCoords] = useState<{
    x: number;
    y: number;
    placement: Placement;
    arrowX: number | null;
    arrowY: number | null;
  } | null>(null);

  const anchorRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const cancelShow = () => {
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
  };
  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const open = () => {
    cancelClose();
    setMounted(true);
    setClosing(false);
  };

  const scheduleShow = () => {
    cancelShow();
    if (delay <= 0) {
      open();
      return;
    }
    showTimer.current = window.setTimeout(() => {
      open();
      showTimer.current = null;
    }, delay);
  };

  const close = () => {
    cancelShow();
    setMounted(prev => {
      if (!prev) return prev;
      setClosing(true);
      cancelClose();
      closeTimer.current = window.setTimeout(() => {
        setMounted(false);
        setClosing(false);
        closeTimer.current = null;
      }, CLOSE_ANIM_MS);
      return prev;
    });
  };

  useEffect(() => () => {
    cancelShow();
    cancelClose();
  }, []);

  // Position only when actually visible (not while closing — keeps last coords stable for fade-out).
  useEffect(() => {
    if (!mounted || closing || !anchorRef.current || !tooltipRef.current) return;
    const anchorEl = anchorRef.current;
    const tipEl = tooltipRef.current;
    const arrowEl = arrowRef.current;
    return autoUpdate(anchorEl, tipEl, () => {
      computePosition(anchorEl, tipEl, {
        placement,
        middleware: [
          offset(ARROW_SIZE),
          flip(),
          shift({ padding: 8 }),
          ...(arrowEl ? [arrow({ element: arrowEl, padding: 4 })] : []),
        ],
      }).then(({ x, y, placement: actualPlacement, middlewareData }) => {
        setCoords({
          x,
          y,
          placement: actualPlacement,
          arrowX: middlewareData.arrow?.x ?? null,
          arrowY: middlewareData.arrow?.y ?? null,
        });
      });
    });
  }, [mounted, closing, placement]);

  useEffect(() => {
    if (!mounted) setCoords(null);
  }, [mounted]);

  if (!isValidElement(children)) return <>{children}</>;

  const childProps = children.props;
  const enhanced = cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      anchorRef.current = node;
      const childRef = (children as unknown as { ref?: React.Ref<HTMLElement> }).ref;
      if (typeof childRef === 'function') childRef(node);
      else if (childRef && typeof childRef === 'object') {
        (childRef as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    onMouseEnter: (e: React.MouseEvent) => {
      childProps.onMouseEnter?.(e);
      scheduleShow();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      childProps.onMouseLeave?.(e);
      close();
    },
    onFocus: (e: React.FocusEvent) => {
      childProps.onFocus?.(e);
      cancelShow();
      open();
    },
    onBlur: (e: React.FocusEvent) => {
      childProps.onBlur?.(e);
      close();
    },
  });

  // Map the resolved placement to which side of the tooltip the arrow sits on.
  const arrowSide = coords
    ? ({ top: 'bottom', right: 'left', bottom: 'top', left: 'right' } as const)[
        coords.placement.split('-')[0] as 'top' | 'right' | 'bottom' | 'left'
      ]
    : 'bottom';

  return (
    <>
      {enhanced}
      {mounted && createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          className="tooltip-portal"
          data-placement={coords?.placement ?? placement}
          data-state={closing ? 'closing' : 'open'}
          style={{
            top: coords?.y ?? 0,
            left: coords?.x ?? 0,
            visibility: coords ? 'visible' : 'hidden',
          }}
        >
          {content}
          <div
            ref={arrowRef}
            className="tooltip-arrow"
            style={{
              left: coords?.arrowX != null ? `${coords.arrowX}px` : '',
              top: coords?.arrowY != null ? `${coords.arrowY}px` : '',
              [arrowSide]: `-${ARROW_SIZE / 2}px`,
            }}
          />
        </div>,
        document.body
      )}
    </>
  );
}
