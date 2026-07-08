import React, { useEffect, useRef } from "react";

export function ThinkingSteps({ steps }: { steps: string[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [steps]);

  if (!steps || steps.length === 0) return null;

  return (
    <div 
      className="flex flex-col gap-2.5 py-3 px-4 bg-black/5 dark:bg-white/5 rounded-2xl w-full max-w-[1020px] mb-2 font-mono text-[13px] text-text-muted transition-all duration-300"
    >
      <div 
        ref={scrollRef}
        className="flex flex-col gap-2.5 max-h-[120px] overflow-y-auto scrollbar-hide"
      >
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          
          return (
            <div 
              key={`${index}-${step}`} 
              className={`flex items-center gap-3 transition-opacity duration-300 ${isLast ? "opacity-100" : "opacity-60"}`}
            >
              <div className="flex-shrink-0 flex items-center justify-center w-4 h-4">
                {isLast ? (
                  <svg className="animate-spin w-3.5 h-3.5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className={`tracking-tight ${isLast ? "text-text-primary animate-pulse" : "text-text-muted"}`}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
