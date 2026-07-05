'use client';

import { X } from 'lucide-react';
import { useActiveTab } from '@/store/workspaceStore';
import { getSymbolInfo } from '@/lib/symbols';
import { useJournalDock } from '@/store/journalDockStore';
import { JournalModal } from '@/components/JournalModal';
import { ForecastModal } from '@/components/ForecastModal';

/**
 * Persistent Journal / Forecast dock for the right rail. Because it stays
 * mounted, captures survive switching the chart timeframe — capture Daily,
 * switch to H1, capture again, all into the same note without reopening.
 * Renders the Journal/Forecast forms in `docked` mode (no overlay).
 */
export function JournalDock() {
  const tab = useJournalDock((s) => s.tab);
  const show = useJournalDock((s) => s.show);
  const hide = useJournalDock((s) => s.hide);
  const active = useActiveTab();
  const symbol = active?.symbol;
  if (!symbol) return null;
  const { pricePrecision } = getSymbolInfo(symbol);

  return (
    <div className="flex h-full w-full flex-col border-l border-t border-slate-800 bg-slate-950/60">
      <div className="flex items-center gap-1 border-b border-slate-800 px-2 py-1">
        {(['journal', 'forecast'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => show(t)}
            className={`rounded px-2 py-1 text-xs font-medium ${
              tab === t ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t === 'journal' ? 'Journal' : 'Forecast'}
          </button>
        ))}
        <button type="button" aria-label="Close dock" onClick={hide} className="ml-auto text-slate-400 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'journal' ? (
          <JournalModal docked symbol={symbol} pricePrecision={pricePrecision} onClose={hide} />
        ) : (
          <ForecastModal docked symbol={symbol} onClose={hide} />
        )}
      </div>
    </div>
  );
}
