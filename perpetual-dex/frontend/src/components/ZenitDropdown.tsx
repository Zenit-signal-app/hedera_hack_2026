import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type ZenitDropdownOption = {
  value: string;
  label: string;
  /** Optional leading icon (e.g. token logo) */
  icon?: ReactNode;
};

type ZenitDropdownProps = {
  value: string;
  onChange: (value: string) => void;
  options: readonly ZenitDropdownOption[];
  className?: string;
  buttonClassName?: string;
  /** Accessible name when no visible label */
  ariaLabel?: string;
  /** Stretch trigger to container width (e.g. venue row) */
  fullWidth?: boolean;
};

/**
 * Custom listbox — avoids native `<select>` option styling (white OS menus, unreadable text on Windows).
 * Matches Zenit app shell: #0d0f18, indigo borders, slate text.
 */
export function ZenitDropdown({
  value,
  onChange,
  options,
  className = "",
  buttonClassName = "",
  ariaLabel,
  fullWidth = false,
}: ZenitDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value) ?? options[0];

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        className={`zenit-dropdown-trigger flex w-full min-w-[128px] items-center justify-between gap-2 rounded-lg border border-indigo-500/30 bg-[#0d0f18] px-2.5 py-2 text-left text-sm font-semibold text-slate-100 shadow-sm transition hover:border-indigo-400/45 hover:bg-[#121520] focus:outline-none focus:ring-2 focus:ring-indigo-500/35 ${fullWidth ? "max-w-none" : "max-w-[200px]"} ${buttonClassName}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {selected?.icon}
          <span className="truncate">{selected?.label ?? value}</span>
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="zenit-dropdown-menu absolute left-0 right-0 z-[200] mt-1 max-h-72 overflow-auto rounded-xl border border-indigo-500/25 bg-[#0d0f18] py-1 shadow-2xl"
          style={{
            boxShadow:
              "0 20px 50px rgba(0,0,0,0.75), 0 0 0 1px rgba(99,102,241,0.12), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors ${
                    active
                      ? "bg-indigo-500/25 text-white"
                      : "text-slate-200 hover:bg-indigo-500/10 hover:text-white"
                  }`}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  {opt.icon != null ? <span className="shrink-0">{opt.icon}</span> : null}
                  <span className="font-medium">{opt.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
