import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";

type Props = {
  /** The explanation itself. Kept short — this is a hint, not documentation. */
  text: string;
  /**
   * Which side of the icon the bubble opens toward. Default "top" is wrong for
   * anything near the top of a scroll container, where the bubble would be
   * clipped by the overflow.
   */
  side?: "top" | "bottom" | "left" | "right";
  /** Accessible name for the trigger. Defaults to a generic "More information". */
  label?: string;
  className?: string;
};

const SIDE_CLASSES: Record<NonNullable<Props["side"]>, string> = {
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
  left: "right-full top-1/2 mr-2 -translate-y-1/2",
  right: "left-full top-1/2 ml-2 -translate-y-1/2",
};

/**
 * The ⓘ that replaces a paragraph of helper text.
 *
 * Opens on hover *and* on click, because hover alone is unreachable on touch —
 * the same reason the audience overflow uses a modal rather than a CSS tooltip.
 * Click also latches it open, so the text can be read without keeping the
 * pointer perfectly still.
 *
 * Rendered as a `button` with `aria-describedby` rather than a bare `title`
 * attribute: `title` is invisible to most screen readers and cannot be styled or
 * opened by keyboard.
 */
export default function InfoTip({
  text,
  side = "top",
  label = "More information",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const bubbleId = useId();

  // A pinned bubble is dismissed by clicking anywhere else or pressing Escape,
  // matching how the pickers and the filter popover close.
  useEffect(() => {
    if (!pinned) return;

    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setPinned(false);
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPinned(false);
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  return (
    <span ref={wrapRef} className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open || pinned}
        aria-describedby={open || pinned ? bubbleId : undefined}
        onClick={() => {
          setPinned((prev) => !prev);
          setOpen((prev) => !prev || !pinned);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => !pinned && setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => !pinned && setOpen(false)}
        className="rounded-full text-gray-400 transition hover:text-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
      >
        <Info size={13} />
      </button>

      {(open || pinned) && (
        <span
          id={bubbleId}
          role="tooltip"
          className={`absolute z-50 w-56 rounded-lg bg-gray-900 px-2.5 py-2 text-xs font-normal leading-relaxed text-white shadow-lg ${SIDE_CLASSES[side]}`}
        >
          {text}
        </span>
      )}
    </span>
  );
}
