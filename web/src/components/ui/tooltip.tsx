'use client';

import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

/** App-wide tooltip provider (mount once, in Providers). */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <RadixTooltip.Provider delayDuration={350}>{children}</RadixTooltip.Provider>;
}

/** Wrap any trigger element: <Tooltip label="…"><button…/></Tooltip> */
export function Tooltip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          sideOffset={6}
          className="z-[var(--z-menu)] rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100 shadow-lg"
        >
          {label}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
