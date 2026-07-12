import { useState, useRef, useEffect } from "react";

export function CompactSelect({ 
  value, 
  onChange, 
  options,
  direction = "down"
}: { 
  value: string; 
  onChange: (v: string) => void; 
  options: { label: string; value: string }[];
  direction?: "up" | "down";
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

  const selectedLabel = options.find((option) => option.value === value)?.label || options[0]?.label || value;

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
        className="flex h-8 max-w-[46vw] items-center gap-1.5 rounded-full border border-transparent bg-bg-tertiary px-3 py-1 text-[12px] font-medium text-text-primary outline-none transition hover:bg-bg-tertiary/80 focus-visible:ring-2 focus-visible:ring-white/35 sm:h-7 sm:max-w-[220px]"
      >
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
          className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>
      
      {isOpen && (
        <div 
          className={`absolute left-0 z-50 max-h-[45dvh] w-max min-w-full max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-black/5 bg-bg-secondary p-1 shadow-[0_4px_20px_rgba(0,0,0,0.1)] animate-in fade-in zoom-in-95 duration-100 dark:border-white/5 ${
            direction === "up" 
              ? "bottom-full mb-1.5 origin-bottom-left" 
              : "top-full mt-1.5 origin-top-left"
          }`}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { 
                onChange(opt.value); 
                setIsOpen(false); 
              }}
              className={`w-full rounded-md px-3 py-2 text-left text-[12px] transition sm:py-1.5 ${
                value === opt.value 
                  ? "bg-bg-tertiary font-medium text-text-primary" 
                  : "text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary"
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
