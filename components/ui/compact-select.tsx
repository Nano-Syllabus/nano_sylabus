import { useState, useRef, useEffect, type ReactNode } from "react";

export function CompactSelect({ 
  value, 
  onChange, 
  options,
  placeholder,
  direction = "down",
  pulseButton = false,
  compact = false,
  compactIcon,
}: { 
  value: string; 
  onChange: (v: string) => void; 
  options: { label: string; value: string }[];
  placeholder?: string;
  direction?: "up" | "down";
  pulseButton?: boolean;
  compact?: boolean;
  compactIcon?: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabel = options.find((option) => option.value === value)?.label || placeholder || options[0]?.label || value;

  return (
    <div
      className="relative inline-block min-w-0"
      ref={ref}
      onKeyDown={(event) => {
        if (event.key === "Escape") setIsOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={!options.length}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={selectedLabel}
        title={compact ? selectedLabel : undefined}
        className={`flex max-w-[46vw] items-center justify-center rounded-full border border-transparent bg-bg-tertiary text-[12px] font-medium text-text-primary outline-none transition-colors duration-100 hover:bg-bg-tertiary/80 focus-visible:ring-2 focus-visible:ring-border-strong disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none sm:max-w-[220px] ${
          compact ? "h-10 w-10 shrink-0 px-0" : "h-10 gap-1.5 px-3 sm:h-9"
        } ${
          pulseButton && options.length > 0 && !isOpen ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-bg-secondary shadow-[0_0_15px_rgba(59,130,246,0.5)] animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]" : ""
        }`}
      >
        {compact ? (
          <>
            <span className="sr-only">{selectedLabel}</span>
            <span aria-hidden="true">{compactIcon}</span>
          </>
        ) : (
          <>
            <span className="truncate">{selectedLabel}</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`shrink-0 transition-transform duration-200 motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </>
        )}
      </button>
      
      {isOpen && (
        <div 
          role="listbox"
          className={`absolute left-0 z-50 max-h-[45dvh] w-56 min-w-full max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-black/10 bg-white dark:bg-[#1E1E1E] p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100 dark:border-white/10 ${
            direction === "up" 
              ? "bottom-full mb-1.5 origin-bottom-left" 
              : "top-full mt-1.5 origin-top-left"
          }`}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={value === opt.value}
              onClick={() => {
                onChange(opt.value); 
                setIsOpen(false); 
              }}
              className={`min-h-10 w-full rounded-md px-3 py-2 text-left text-[13px] outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-border-strong motion-reduce:transition-none ${
                value === opt.value 
                  ? "bg-black/5 dark:bg-white/10 font-medium text-black dark:text-white" 
                  : "text-gray-700 dark:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 hover:text-black dark:hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
