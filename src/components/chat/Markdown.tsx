"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface MarkdownProps {
  children: string;
  className?: string;
}

export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={cn("prose-chat", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: ({ children: preChildren, ...props }) => (
            <CodeBlock {...props}>{preChildren}</CodeBlock>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

interface CodeBlockProps extends React.HTMLAttributes<HTMLPreElement> {
  children?: React.ReactNode;
}

function CodeBlock({ children, className, ...rest }: CodeBlockProps) {
  // Extraemos el lenguaje del className que aplica rehype-highlight
  const langMatch = /language-(\w+)/.exec(className ?? "");
  const language = langMatch?.[1] ?? "";
  const codeText = extractText(children);

  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignoramos
    }
  };

  return (
    <div className="relative group my-2 rounded-lg border border-border bg-[#0d1117] overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-bg-elevated px-3 py-1.5 text-xs">
        <span className="font-mono text-fg-muted">{language || "text"}</span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 text-fg-muted hover:text-fg transition-colors"
          aria-label="Copiar código"
        >
          {copied ? (
            <>
              <Check size={14} /> Copiado
            </>
          ) : (
            <>
              <Copy size={14} /> Copiar
            </>
          )}
        </button>
      </div>
      <pre className="!my-0 !rounded-none !border-0" {...rest}>
        {children}
      </pre>
    </div>
  );
}

function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return extractText(
      (node as { props: { children?: React.ReactNode } }).props.children
    );
  }
  return "";
}
