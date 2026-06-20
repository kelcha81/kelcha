'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { SYMBOL_LIST, type AssetClass } from '@/lib/symbols';
import { usePackagedSymbols } from '@/hooks/usePackagedSymbols';

// Static data span for the date pickers (the session clamps to real bounds).
const DATA_START = '2022-01-01';
const DATA_END = '2025-12-31';
const tsOf = (date: string) => Date.parse(`${date}T00:00:00Z`);

export function NewSessionDialog({ onClose }: { onClose: () => void }) {
  const addTab = useWorkspaceStore((s) => s.addTab);
  const { statuses } = usePackagedSymbols();
  const isReady = (sym: string) => !!(statuses[sym]?.packaged || statuses[sym]?.seeded);

  const [assetClass, setAssetClass] = useState<AssetClass>('forex');
  const symbols = useMemo(() => SYMBOL_LIST.filter((s) => s.assetClass === assetClass), [assetClass]);

  const [symbol, setSymbol] = useState(symbols[0]?.symbol ?? 'eurusd');
  const [name, setName] = useState(symbols[0]?.label ?? '');
  const [nameEdited, setNameEdited] = useState(false);
  const [start, setStart] = useState(DATA_START);
  const [end, setEnd] = useState(DATA_END);

  const onClass = (c: AssetClass) => {
    setAssetClass(c);
    const list = SYMBOL_LIST.filter((s) => s.assetClass === c);
    const first = list.find((s) => isReady(s.symbol)) ?? list[0];
    if (first) {
      setSymbol(first.symbol);
      if (!nameEdited) setName(first.label);
    }
  };

  const onSymbol = (sym: string) => {
    setSymbol(sym);
    const info = SYMBOL_LIST.find((s) => s.symbol === sym);
    if (info && !nameEdited) setName(info.label);
  };

  const ready = isReady(symbol);

  const create = () => {
    const info = SYMBOL_LIST.find((s) => s.symbol === symbol);
    if (!info || !ready) return;
    const startTs = tsOf(start);
    const endTs = tsOf(end);
    if (endTs <= startTs) return;
    addTab({
      symbol: info.symbol,
      label: name.trim() || info.label,
      pricePrecision: info.pricePrecision,
      start: startTs,
      end: endTs
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onMouseDown={onClose}>
      <div
        className="w-[420px] max-w-full rounded-lg border border-slate-700 bg-slate-900 text-slate-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 p-3">
          <span className="text-sm font-semibold">New Session</span>
          <button type="button" aria-label="Close" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 p-3">
          {/* Asset class */}
          <div className="flex gap-1">
            {(['forex', 'index'] as AssetClass[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onClass(c)}
                className={`flex-1 rounded px-3 py-1.5 text-sm capitalize ${
                  assetClass === c ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {c === 'index' ? 'Indices' : 'Forex'}
              </button>
            ))}
          </div>

          {/* Symbol */}
          <label className="block text-xs text-slate-400">
            Instrument
            <select
              value={symbol}
              onChange={(e) => onSymbol(e.target.value)}
              className="mt-0.5 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
            >
              {symbols.map((s) => {
                const ok = isReady(s.symbol);
                return (
                  <option key={s.symbol} value={s.symbol} disabled={!ok}>
                    {s.label}
                    {ok ? '' : ' — not packaged'}
                  </option>
                );
              })}
            </select>
          </label>

          {/* Session name */}
          <label className="block text-xs text-slate-400">
            Session name
            <input
              type="text"
              value={name}
              placeholder="Name this session"
              onChange={(e) => {
                setName(e.target.value);
                setNameEdited(true);
              }}
              className="mt-0.5 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
            />
          </label>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-slate-400">
              Start date
              <input
                type="date"
                value={start}
                min={DATA_START}
                max={DATA_END}
                onChange={(e) => setStart(e.target.value)}
                className="mt-0.5 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 [color-scheme:dark]"
              />
            </label>
            <label className="block text-xs text-slate-400">
              End date
              <input
                type="date"
                value={end}
                min={DATA_START}
                max={DATA_END}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-0.5 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 [color-scheme:dark]"
              />
            </label>
          </div>
          {tsOf(end) <= tsOf(start) && (
            <div className="text-xs text-red-400">End date must be after start date.</div>
          )}

          <p className="text-[11px] text-slate-500">
            The replay starts at the start date and runs to the end date. History before the start
            is shown for context (and indicator warm-up).
          </p>

          {!ready && (
            <div className="text-xs text-amber-400">
              {symbol.toUpperCase()} isn’t packaged yet — open the <span className="font-semibold">Data</span> panel to download it.
            </div>
          )}

          <button
            type="button"
            onClick={create}
            disabled={!ready || tsOf(end) <= tsOf(start)}
            className="w-full rounded bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            Create session
          </button>
        </div>
      </div>
    </div>
  );
}
