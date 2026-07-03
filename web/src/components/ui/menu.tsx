'use client';

import * as Popover from '@radix-ui/react-popover';
import type { ReactNode } from 'react';

/**
 * Form-heavy toolbar menu (Radix Popover): a trigger button + a floating panel
 * that can hold checkboxes/inputs without closing on interaction. Escape and
 * outside-click close it; positioning is collision-aware. Used by the
 * Indicators/Theme menus (replaces the useClickOutside hand-rolls).
 */
export function MenuPopover({
  trigger,
  triggerClassName = 'flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700',
  contentClassName = 'w-64',
  title,
  children,
  open,
  onOpenChange,
  side = 'bottom'
}: {
  trigger: ReactNode;
  triggerClassName?: string;
  contentClassName?: string;
  title?: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger className={triggerClassName}>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          side={side}
          sideOffset={6}
          className={`z-[var(--z-menu)] rounded border border-slate-700 bg-slate-900 p-2 text-slate-200 shadow-xl focus:outline-none ${contentClassName}`}
        >
          {title && <div className="mb-2 text-sm font-semibold text-slate-200">{title}</div>}
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
