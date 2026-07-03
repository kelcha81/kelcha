'use client';

import { Cloud, CloudOff, Loader2 } from 'lucide-react';
import { useSyncStore } from '@/store/syncStore';
import { Tooltip } from '@/components/ui/tooltip';

/** Cloud-save health chip for the toolbar: saved / saving / error(retrying). */
export function SyncStatus() {
  const status = useSyncStore((s) => s.status);
  const failing = useSyncStore((s) => s.failing);

  if (status === 'error') {
    const kinds = Object.keys(failing).join(', ');
    return (
      <Tooltip label={`Cloud save failing (${kinds}) — retrying automatically`}>
        <span className="flex items-center gap-1 rounded border border-red-900/60 bg-red-950/40 px-1.5 py-0.5 text-[10px] text-red-300">
          <CloudOff className="h-3 w-3" /> retrying
        </span>
      </Tooltip>
    );
  }
  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-slate-500">
        <Loader2 className="h-3 w-3 animate-spin" /> saving
      </span>
    );
  }
  return (
    <Tooltip label="Workspace synced to your account">
      <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-slate-600">
        <Cloud className="h-3 w-3" />
      </span>
    </Tooltip>
  );
}
