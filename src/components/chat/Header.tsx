"use client";

import { Menu, ChevronDown, Brain, Server, Wifi, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AVAILABLE_MODELS } from "@/lib/types";
import { cn } from "@/lib/utils";

interface HeaderProps {
  model: string;
  onModelChange: (model: string) => void;
  showReasoning: boolean;
  onToggleReasoning: () => void;
  onOpenSidebar: () => void;
  status: { minimaxOk: boolean | null; mcpCount: number; mcpOk: number };
}

export function Header({
  model,
  onModelChange,
  showReasoning,
  onToggleReasoning,
  onOpenSidebar,
  status,
}: HeaderProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const current = AVAILABLE_MODELS.find((m) => m.id === model) ?? AVAILABLE_MODELS[0];

  return (
    <header className="border-b border-border bg-bg/80 backdrop-blur sticky top-0 z-20">
      <div className="flex items-center gap-2 px-3 sm:px-4 h-12 sm:h-14">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="md:hidden shrink-0 w-9 h-9 rounded-lg flex items-center justify-center hover:bg-bg-elevated"
          aria-label="Abrir menú"
        >
          <Menu size={18} />
        </button>

        <div ref={ref} className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-border bg-bg-elevated hover:bg-bg-subtle text-sm font-medium transition-colors"
          >
            <span className="truncate max-w-[140px] sm:max-w-none">
              {current.label}
            </span>
            <ChevronDown
              size={14}
              className={cn(
                "transition-transform shrink-0",
                open && "rotate-180"
              )}
            />
          </button>

          {open && (
            <div className="absolute left-0 top-full mt-1.5 w-72 rounded-lg border border-border bg-bg-elevated shadow-xl z-30 overflow-hidden">
              {AVAILABLE_MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onModelChange(m.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 hover:bg-bg-subtle transition-colors border-b border-border last:border-b-0",
                    m.id === model && "bg-bg-subtle"
                  )}
                >
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="text-xs text-fg-subtle">{m.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onToggleReasoning}
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center border transition-colors",
              showReasoning
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border text-fg-muted hover:text-fg"
            )}
            aria-label="Mostrar razonamiento"
            title={showReasoning ? "Ocultar razonamiento" : "Mostrar razonamiento"}
          >
            <Brain size={16} />
          </button>

          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-bg-elevated text-xs"
            title={`MCPs: ${status.mcpOk}/${status.mcpCount} conectados`}
          >
            {status.mcpOk > 0 ? (
              <Wifi size={12} className="text-success" />
            ) : (
              <WifiOff size={12} className="text-fg-subtle" />
            )}
            <span className="tabular-nums text-fg-muted">
              {status.mcpOk}/{status.mcpCount}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
