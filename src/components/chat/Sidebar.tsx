"use client";

import { Plus, Trash2, MessageSquare, Server, Settings, LogOut, User as UserIcon } from "lucide-react";
import { cn, formatRelativeTime, truncate } from "@/lib/utils";
import type { Conversation, MCPServerStatus } from "@/lib/types";

interface SidebarUser {
  email: string | null;
  displayName: string | null;
  onSignOut: () => void;
}

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  mcpStatus: MCPServerStatus[];
  onOpenSettings: () => void;
  open: boolean;
  onClose: () => void;
  user?: SidebarUser;
}

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  mcpStatus,
  onOpenSettings,
  open,
  onClose,
  user,
}: SidebarProps) {
  return (
    <>
      {/* Overlay para móvil */}
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-30"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed md:static z-40 md:z-auto",
          "w-72 md:w-72 lg:w-80 h-full",
          "bg-bg md:bg-bg-elevated border-r border-border",
          "flex flex-col",
          "transition-transform duration-200 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="p-3 border-b border-border space-y-2">
          <button
            type="button"
            onClick={() => {
              onNew();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-bg hover:bg-bg-subtle text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Nueva conversación
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {conversations.length === 0 ? (
            <p className="text-xs text-fg-subtle text-center py-6 px-2">
              No hay conversaciones todavía.
            </p>
          ) : (
            conversations.map((c) => (
              <ConversationItem
                key={c.id}
                conv={c}
                active={c.id === activeId}
                onClick={() => {
                  onSelect(c.id);
                  onClose();
                }}
                onDelete={() => onDelete(c.id)}
              />
            ))
          )}
        </div>

        <div className="border-t border-border p-3 space-y-2">
          <MCPSummary servers={mcpStatus} />
          {user ? <UserSummary user={user} /> : null}
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-fg-muted hover:text-fg hover:bg-bg-subtle transition-colors"
          >
            <Settings size={14} />
            Ajustes
          </button>
        </div>
      </aside>
    </>
  );
}

function ConversationItem({
  conv,
  active,
  onClick,
  onDelete,
}: {
  conv: Conversation;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer text-sm transition-colors",
        active
          ? "bg-bg-subtle text-fg"
          : "text-fg-muted hover:text-fg hover:bg-bg-subtle"
      )}
      onClick={onClick}
    >
      <MessageSquare size={14} className="shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="truncate">{truncate(conv.title, 40)}</div>
        <div className="text-[10px] text-fg-subtle">
          {formatRelativeTime(conv.updatedAt)} · {conv.messages.length} msg
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="opacity-0 group-hover:opacity-100 shrink-0 p-1 rounded hover:bg-bg text-fg-subtle hover:text-danger transition-all"
        aria-label="Borrar conversación"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function MCPSummary({ servers }: { servers: MCPServerStatus[] }) {
  const connected = servers.filter((s) => s.connected).length;
  const total = servers.length;
  return (
    <div className="rounded-lg border border-border bg-bg p-2.5 text-xs">
      <div className="flex items-center gap-1.5 font-medium text-fg-muted">
        <Server size={12} />
        MCPs:{" "}
        <span className={cn(connected > 0 ? "text-success" : "text-fg-subtle")}>
          {connected}/{total}
        </span>{" "}
        conectados
      </div>
      {servers.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {servers.map((s) => (
            <div
              key={s.name}
              className="flex items-center gap-1.5 text-fg-subtle"
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  s.connected ? "bg-success" : "bg-danger"
                )}
              />
              <span className="truncate">{s.name}</span>
              {s.connected && (
                <span className="ml-auto tabular-nums">{s.toolCount}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UserSummary({ user }: { user: SidebarUser }) {
  const label = user.displayName || user.email || "Sesión iniciada";
  return (
    <div className="rounded-lg border border-border bg-bg p-2.5 text-xs flex items-center gap-2">
      <UserIcon size={14} className="shrink-0 text-fg-muted" />
      <div className="flex-1 min-w-0">
        <div className="truncate text-fg">{label}</div>
        {user.email && user.displayName ? (
          <div className="truncate text-fg-subtle text-[10px]">{user.email}</div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={user.onSignOut}
        className="shrink-0 p-1 rounded hover:bg-bg-subtle text-fg-muted hover:text-danger transition-colors"
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
      >
        <LogOut size={14} />
      </button>
    </div>
  );
}
