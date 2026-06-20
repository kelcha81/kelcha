'use client';

import { useEffect, useState } from 'react';
import { getCapabilities } from '@/lib/strategyApi';

// Small toolbar indicator: is the ICT engine (localhost:8000) reachable, and is
// AI authoring enabled. Polls lightly so the user knows whether to start it.
export function EngineStatus() {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [ai, setAi] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ping = () =>
      getCapabilities()
        .then((c) => {
          if (!cancelled) {
            setStatus('online');
            setAi(c.ai);
          }
        })
        .catch(() => {
          if (!cancelled) setStatus('offline');
        });
    ping();
    const id = setInterval(ping, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const color = status === 'online' ? 'bg-green-500' : status === 'offline' ? 'bg-red-500' : 'bg-slate-500';
  const title =
    status === 'online'
      ? `ICT engine online · AI ${ai ? 'on' : 'off'}`
      : status === 'offline'
        ? 'ICT engine offline — start it: python engine/server.py'
        : 'Checking engine…';

  return (
    <span title={title} className="flex items-center gap-1 text-[11px] text-slate-400">
      <span className={`h-2 w-2 rounded-full ${color}`} /> engine
    </span>
  );
}
