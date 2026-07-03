'use client';

import { useState } from 'react';
import { Square, Columns2, LayoutGrid, Boxes, FlaskConical, Database, CalendarRange, BookOpen, type LucideIcon } from 'lucide-react';
import { useActiveTab, useWorkspaceStore } from '@/store/workspaceStore';
import { useAuth } from '@/lib/auth';
import { type LayoutCount } from '@/lib/layout';
import { getSymbolInfo } from '@/lib/symbols';
import { IndicatorsMenu } from '@/components/IndicatorsMenu';
import { ThemeMenu } from '@/components/ThemeMenu';
import { PluginManager } from '@/components/PluginManager';
import { StrategiesPanel } from '@/components/StrategiesPanel';
import { DataManager } from '@/components/DataManager';
import { ForecastModal } from '@/components/ForecastModal';
import { JournalModal } from '@/components/JournalModal';
import { EngineStatus } from '@/components/EngineStatus';
import { SyncStatus } from '@/components/SyncStatus';

const LAYOUTS: { count: LayoutCount; name: string; Icon: LucideIcon }[] = [
  { count: 1, name: 'Single', Icon: Square },
  { count: 2, name: 'Split (2)', Icon: Columns2 },
  { count: 4, name: 'Grid (4)', Icon: LayoutGrid }
];

export function TopToolbar() {
  const activeTab = useActiveTab();
  const count = activeTab.layout.count;
  const setCount = useWorkspaceStore((s) => s.setActiveCount);
  // ICT Training module gates the Strategies feature (backtest + Studio + Tune).
  const { claims } = useAuth();
  const hasTraining = Boolean((claims.modules as Record<string, unknown> | undefined)?.ictTraining);
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [strategiesOpen, setStrategiesOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [forecastOpen, setForecastOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);

  return (
    <div className="flex items-center gap-3 border-b border-slate-800 bg-slate-900/60 px-3 py-2">
      <div className="flex items-center gap-1">
        {LAYOUTS.map(({ count: c, name, Icon }) => (
          <button
            key={c}
            type="button"
            title={name}
            onClick={() => setCount(c)}
            aria-pressed={count === c}
            className={`flex h-7 w-7 items-center justify-center rounded transition ${
              count === c ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>

      <div className="h-5 w-px bg-slate-700" />

      <IndicatorsMenu />
      <ThemeMenu />

      <button
        type="button"
        onClick={() => setPluginsOpen(true)}
        className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
      >
        <Boxes className="h-3.5 w-3.5" /> Plugins
      </button>

      {hasTraining && (
        <button
          type="button"
          onClick={() => setStrategiesOpen(true)}
          className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
        >
          <FlaskConical className="h-3.5 w-3.5" /> Strategies
        </button>
      )}

      <button
        type="button"
        onClick={() => setDataOpen(true)}
        className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
      >
        <Database className="h-3.5 w-3.5" /> Data
      </button>

      <button
        type="button"
        onClick={() => setForecastOpen(true)}
        title="Create a Forecast (pre-trade plan) in Obsidian"
        className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
      >
        <CalendarRange className="h-3.5 w-3.5" /> Forecast
      </button>

      <button
        type="button"
        onClick={() => setJournalOpen(true)}
        title="Open or update a Backtest ASR in Obsidian"
        className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
      >
        <BookOpen className="h-3.5 w-3.5" /> Journal
      </button>

      <div className="ml-auto flex items-center gap-2">
        <SyncStatus />
        <EngineStatus />
      </div>

      {pluginsOpen && <PluginManager onClose={() => setPluginsOpen(false)} />}
      {hasTraining && strategiesOpen && <StrategiesPanel onClose={() => setStrategiesOpen(false)} />}
      {dataOpen && <DataManager onClose={() => setDataOpen(false)} />}
      {forecastOpen && <ForecastModal symbol={activeTab.symbol} onClose={() => setForecastOpen(false)} />}
      {journalOpen && (
        <JournalModal
          symbol={activeTab.symbol}
          pricePrecision={getSymbolInfo(activeTab.symbol).pricePrecision}
          onClose={() => setJournalOpen(false)}
        />
      )}
    </div>
  );
}
