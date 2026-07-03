'use client';

import { create } from 'zustand';
import { Modal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// Promise-based confirmation dialog. Usage anywhere (components, stores):
//   if (!(await confirm({ title: 'Delete session?', danger: true }))) return;
// ConfirmHost renders the dialog; mount it once in Providers.

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState {
  req: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
  open: (req: ConfirmOptions & { resolve: (ok: boolean) => void }) => void;
  settle: (ok: boolean) => void;
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  req: null,
  open: (req) => {
    // A second confirm while one is open cancels the first (shouldn't happen in practice).
    get().req?.resolve(false);
    set({ req });
  },
  settle: (ok) => {
    get().req?.resolve(ok);
    set({ req: null });
  }
}));

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    useConfirmStore.getState().open({ ...opts, resolve });
  });
}

export function ConfirmHost() {
  const req = useConfirmStore((s) => s.req);
  const settle = useConfirmStore((s) => s.settle);
  if (!req) return null;
  return (
    <Modal onClose={() => settle(false)} ariaLabel={req.title} className="w-[380px]">
      <div className="p-4">
        <div className="text-sm font-semibold text-slate-100">{req.title}</div>
        {req.body && <p className="mt-2 text-sm text-slate-400">{req.body}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" onClick={() => settle(false)} autoFocus>
            {req.cancelLabel ?? 'Cancel'}
          </Button>
          <Button size="sm" variant={req.danger ? 'danger' : 'primary'} onClick={() => settle(true)}>
            {req.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
