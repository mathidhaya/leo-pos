import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Every open dialog, the last one is on top. Only the top one reacts to Escape and Tab.
const openDialogs: string[] = [];

// The page behind the dialogs cannot scroll while any is open
let scrollLocks = 0;
let savedOverflow = "";

function lockScroll() {
  if (scrollLocks === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLocks += 1;
}

function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.style.overflow = savedOverflow;
}

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
}

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean; // while saving, the dialog cannot be closed by accident
  wide?: boolean;
}

export default function Modal({ title, onClose, children, busy = false, wide = false }: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ onClose, busy });

  useEffect(() => {
    latest.current = { onClose, busy };
  });

  useEffect(() => {
    const id = titleId;
    openDialogs.push(id);
    lockScroll();

    // Remember what had the focus, to give it back when this dialog closes
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Move the focus inside, unless a field has already taken it (autoFocus)
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      const target = (bodyRef.current ? focusableIn(bodyRef.current)[0] : undefined) ?? panel;
      target.focus();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (openDialogs[openDialogs.length - 1] !== id) return;

      if (event.key === "Escape") {
        if (!latest.current.busy) {
          event.stopPropagation();
          latest.current.onClose();
        }
        return;
      }

      if (event.key === "Tab" && panelRef.current) {
        const items = focusableIn(panelRef.current);
        if (items.length === 0) {
          event.preventDefault();
          panelRef.current.focus();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        const outside = !panelRef.current.contains(active);

        if (event.shiftKey && (active === first || outside)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || outside)) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const at = openDialogs.lastIndexOf(id);
      if (at >= 0) openDialogs.splice(at, 1);
      unlockScroll();
      if (opener && opener.isConnected) opener.focus();
    };
  }, [titleId]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={() => !busy && onClose()} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={[
          "relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl focus:outline-none sm:rounded-2xl",
          wide ? "sm:max-w-2xl" : "sm:max-w-md",
        ].join(" ")}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div ref={bodyRef} className="overflow-y-auto px-5 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}
