'use client';

import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

/**
 * Shared modal shell (Radix Dialog): overlay, centering, Escape-to-close,
 * click-outside, focus trap and scroll lock for free. Visuals match the old
 * hand-rolled shells exactly — children keep rendering their own headers.
 *
 * Mount it conditionally (`{open && <Modal …>}`) just like the old shells.
 */
export function Modal({
  onClose,
  ariaLabel,
  className = 'w-[560px]',
  children
}: {
  onClose: () => void;
  /** Accessible dialog title (screen-reader only; visible header stays in children). */
  ariaLabel: string;
  /** Width/height classes for the panel (e.g. "w-[620px]", "h-[80vh] w-[860px]"). */
  className?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-black/60" />
        <Dialog.Content
          className={`fixed left-1/2 top-1/2 z-[var(--z-modal)] flex max-h-[85vh] max-w-[calc(100vw-3rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 text-slate-200 focus:outline-none ${className}`}
        >
          <Dialog.Title className="sr-only">{ariaLabel}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
