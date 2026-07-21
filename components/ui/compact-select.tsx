import { useState, useRef, useEffect } from "react";

export function CompactSelect({ 
  value, 
  onChange, 
  options,
  placeholder,
  direction = "down",
  pulseButton = false
}: { 
  value: string; 
  onChange: (v: string) => void; 
  options: { label: string; value: string }[];
  placeholder?: string;
  direction?: "up" | "down";
  pulseButton?: boolean;
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
        className={`flex h-8 max-w-[46vw] items-center gap-1.5 rounded-full border border-transparent bg-bg-tertiary px-3 py-1 text-[12px] font-medium text-text-primary outline-none transition hover:bg-bg-tertiary/80 focus-visible:ring-2 focus-visible:ring-white/35 sm:h-7 sm:max-w-[220px] ${
          pulseButton && !isOpen ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-bg-secondary shadow-[0_0_15px_rgba(59,130,246,0.5)] animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]" : ""
        }`}
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
          className={`absolute left-0 z-50 max-h-[45dvh] w-max min-w-full max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-black/10 bg-white dark:bg-[#1E1E1E] p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100 dark:border-white/10 ${
            direction === "up" 
              ? "bottom-full mb-1.5 origin-bottom-left" 
              : "top-full mt-1.5 origin-top-left"
          }`}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onPointerDown={(e) => { 
                e.preventDefault();
                onChange(opt.value); 
                setIsOpen(false); 
              }}
              className={`w-full rounded-md px-3 py-2 text-left text-[13px] transition sm:py-1.5 ${
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
