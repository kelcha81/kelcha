'use client';

import * as RadixContextMenu from '@radix-ui/react-context-menu';
import type { ComponentType, ReactNode } from 'react';

// Styled Radix ContextMenu wrappers (right-click menus with collision-aware
// positioning, Escape, keyboard nav). Visual language matches the kit.

export const ContextMenu = RadixContextMenu.Root;
export const ContextMenuTrigger = RadixContextMenu.Trigger;

export function ContextMenuContent({ children }: { children: ReactNode }) {
  return (
    <RadixContextMenu.Portal>
      <RadixContextMenu.Content className="z-[var(--z-menu)] w-52 overflow-hidden rounded-md border border-slate-700 bg-slate-900 py-1 text-xs shadow-xl">
        {children}
      </RadixContextMenu.Content>
    </RadixContextMenu.Portal>
  );
}

export function ContextMenuItem({
  icon: Icon,
  label,
  shortcut,
  danger,
  onSelect
}: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  shortcut?: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}) {
  return (
    <RadixContextMenu.Item
      onSelect={onSelect}
      className={`flex w-full cursor-default items-center gap-2 px-3 py-1.5 outline-none data-[highlighted]:bg-slate-800 ${
        danger ? 'text-red-400' : 'text-slate-200'
      }`}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
      {shortcut && <span className="ml-auto text-slate-500">{shortcut}</span>}
    </RadixContextMenu.Item>
  );
}

export function ContextMenuSeparator() {
  return <RadixContextMenu.Separator className="my-1 h-px bg-slate-800" />;
}
