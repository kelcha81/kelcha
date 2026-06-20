'use client';

import { useEffect, useState } from 'react';
import { SYMBOL_LIST } from '@/lib/symbols';
import { hasSymbol } from '@/lib/idb';

export interface SymbolStatus {
  packaged: boolean; // data files exist on disk (public/data/<sym>)
  seeded: boolean;   // already loaded into IndexedDB
}

/** Per-symbol availability: packaged on disk (GET /api/symbols) + seeded in IDB. */
export function usePackagedSymbols(): {
  statuses: Record<string, SymbolStatus>;
  ready: boolean;
  refresh: () => void;
} {
  const [statuses, setStatuses] = useState<Record<string, SymbolStatus>>({});
  const [ready, setReady] = useState(false);

  const refresh = async () => {
    let packaged: Record<string, { packaged: boolean }> = {};
    try {
      packaged = (await (await fetch('/api/symbols')).json()).symbols ?? {};
    } catch {
      /* dev server restarting — treat as none packaged */
    }
    const next: Record<string, SymbolStatus> = {};
    for (const s of SYMBOL_LIST) {
      next[s.symbol] = { packaged: packaged[s.symbol]?.packaged ?? false, seeded: await hasSymbol(s.symbol) };
    }
    setStatuses(next);
    setReady(true);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { statuses, ready, refresh };
}
