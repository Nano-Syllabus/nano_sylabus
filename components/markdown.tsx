import { renderMarkdown } from "@/lib/markdown";

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div
      className={
        "text-sm leading-relaxed text-text-primary [&_strong]:font-semibold [&_em]:italic [&_code]:font-mono-ui [&_code]:rounded [&_code]:bg-bg-tertiary [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-bg-tertiary [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_.math-inline]:rounded [&_.math-inline]:bg-bg-tertiary [&_.math-inline]:px-1.5 [&_.math-inline]:py-0.5 [&_.math-inline]:font-mono-ui [&_.math-block]:rounded-lg [&_.math-block]:border [&_.math-block]:border-border [&_.math-block]:bg-bg-tertiary [&_.math-block]:p-3 [&_.math-block]:font-mono-ui [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc [&_li]:mt-1 [&_p]:mt-2 first:[&_p]:mt-0 " +
        className
      }
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
    />
  );
}
