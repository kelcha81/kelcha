'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { useDrawingSettingsStore } from '@/store/drawingSettingsStore';
import { useDrawingDefaultsStore } from '@/store/drawingDefaultsStore';
import { drawingActions } from '@/lib/drawingActions';
import { Modal } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { TEXT_NOTE } from '@/lib/overlays/textNote';
import { CALLOUT } from '@/lib/overlays/callout';
import { FIB_TOOL, DEFAULT_FIB_RATIOS, fibRatios } from '@/lib/overlays/fibTool';
import { FIB_EXTENSION, DEFAULT_EXT_RATIOS } from '@/lib/overlays/fibExtension';
import { TF_UNITS, defaultTfVisibility, type TfVisibility } from '@/lib/tfVisibility';

const COLORS = ['#3b82f6', '#22c55e', '#ef4444', '#eab308', '#a855f7', '#f97316', '#ffffff', '#64748b'];
const WIDTHS = [1, 2, 3, 4];
const field = 'rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100';
const fmtTime = (ts?: number) => (ts ? new Date(ts).toISOString().slice(0, 16).replace('T', ' ') : '—');

type Tab = 'style' | 'coordinates' | 'visibility';

/** Per-drawing settings dialog: Style / Coordinates / Visibility + templates. */
export function DrawingSettingsModal() {
  const target = useDrawingSettingsStore((s) => s.target);
  const close = useDrawingSettingsStore((s) => s.closeSettings);
  const templatesByTool = useDrawingDefaultsStore((s) => s.templates);
  // Tab selection is keyed to the overlay it was made for — a different overlay
  // derives back to 'style' without an effect reset.
  const [tabFor, setTabFor] = useState<{ overlayId: string | null; tab: Tab }>({ overlayId: null, tab: 'style' });
  const tab: Tab = tabFor.overlayId === (target?.overlayId ?? null) ? tabFor.tab : 'style';
  const setTab = (t: Tab) => setTabFor({ overlayId: target?.overlayId ?? null, tab: t });
  const [, setRev] = useState(0); // setRev forces a re-render so inputs reflect the live overlay

  const overlay = target ? target.chart.getOverlayById(target.overlayId) : null;

  if (!target || !overlay) return null;
  const a = drawingActions(target);
  const bump = () => setRev((r) => r + 1);
  const run = (fn: () => void) => {
    fn();
    bump();
  };

  const styles = (overlay.styles ?? {}) as { line?: { color?: string; size?: number; style?: string } };
  const color = styles.line?.color ?? COLORS[0];
  const width = styles.line?.size ?? 1;
  const dashed = styles.line?.style === 'dashed';
  const ext = (overlay.extendData ?? {}) as { text?: string };
  const isText = overlay.name === TEXT_NOTE || overlay.name === CALLOUT;
  const isFib = overlay.name === FIB_TOOL || overlay.name === FIB_EXTENSION;
  const templates = templatesByTool[overlay.name] ?? {};

  const TABS: { id: Tab; label: string }[] = [
    { id: 'style', label: 'Style' },
    { id: 'coordinates', label: 'Coordinates' },
    { id: 'visibility', label: 'Visibility' }
  ];

  return (
    <Modal onClose={close} ariaLabel="Drawing settings" className="w-[420px]">
      <div className="flex items-center justify-between border-b border-slate-800 p-3">
        <div className="text-sm font-semibold capitalize">{overlay.name.replace(/^fx-/, '')} settings</div>
        <button type="button" aria-label="Close" onClick={close} className="text-slate-400 hover:text-white">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex gap-1 border-b border-slate-800 px-3 pt-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-t px-3 py-1.5 text-xs ${tab === t.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {tab === 'style' && (
          <>
            <div>
              <div className="mb-1 text-[10px] uppercase text-slate-500">Colour</div>
              <div className="flex flex-wrap items-center gap-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => run(() => a.setColor(c))}
                    style={{ background: c }}
                    className={`h-5 w-5 rounded-full border ${c === color ? 'ring-2 ring-blue-500' : 'border-slate-600'}`}
                  />
                ))}
                <input type="color" value={color} onChange={(e) => run(() => a.setColor(e.target.value))} className="h-5 w-6 cursor-pointer rounded border border-slate-700 bg-transparent" />
              </div>
            </div>

            <div>
              <div className="mb-1 text-[10px] uppercase text-slate-500">Line</div>
              <div className="flex gap-1">
                {WIDTHS.map((w) => (
                  <button key={w} type="button" onClick={() => run(() => a.setWidth(w))} className={`flex-1 rounded py-1 text-xs ${w === width ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                    {w}px
                  </button>
                ))}
                <button type="button" onClick={() => run(() => a.setLineStyle(dashed ? 'solid' : 'dashed'))} className={`flex-1 rounded py-1 text-xs ${dashed ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                  {dashed ? 'Dashed' : 'Solid'}
                </button>
              </div>
            </div>

            {isText && (
              <label className="block text-xs text-slate-400">
                Text
                <input value={ext.text ?? ''} onChange={(e) => run(() => a.setText(e.target.value))} className={`mt-0.5 w-full ${field}`} />
              </label>
            )}

            {isFib && (
              <label className="block text-xs text-slate-400">
                Levels (comma-separated ratios)
                <input
                  defaultValue={(fibRatios(overlay.extendData) ?? (overlay.name === FIB_EXTENSION ? DEFAULT_EXT_RATIOS : DEFAULT_FIB_RATIOS)).join(', ')}
                  onChange={(e) => {
                    const levels = e.target.value.split(/[,\s]+/).filter(Boolean).map(Number);
                    if (levels.length && levels.every((n) => Number.isFinite(n))) run(() => a.setLevels(levels));
                  }}
                  className={`mt-0.5 w-full ${field}`}
                />
              </label>
            )}

            <div className="border-t border-slate-800 pt-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] uppercase text-slate-500">Templates</span>
                <button
                  type="button"
                  onClick={() => {
                    const n = window.prompt('Template name');
                    if (n?.trim()) useDrawingDefaultsStore.getState().saveTemplate(overlay.name, n.trim(), a.snapshotDefaults());
                  }}
                  className="text-[11px] text-blue-400 hover:underline"
                >
                  Save current as…
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                <button type="button" onClick={() => useDrawingDefaultsStore.getState().setDefault(overlay.name, a.snapshotDefaults())} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-700">
                  Set as default
                </button>
                {Object.entries(templates).map(([tname, def]) => (
                  <span key={tname} className="flex items-center rounded border border-slate-700 bg-slate-800 text-[11px]">
                    <button type="button" onClick={() => run(() => a.applyDefaults(def))} className="px-2 py-1 text-slate-200 hover:text-white">
                      {tname}
                    </button>
                    <button type="button" aria-label={`Delete ${tname}`} onClick={() => useDrawingDefaultsStore.getState().deleteTemplate(overlay.name, tname)} className="px-1 text-slate-500 hover:text-red-400">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'coordinates' && (
          <div className="space-y-2">
            {overlay.points.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-14 text-[11px] text-slate-500">Point {i + 1}</span>
                <label className="flex flex-1 items-center gap-1 text-[11px] text-slate-400">
                  Price
                  <input
                    type="number"
                    step="any"
                    defaultValue={p.value ?? 0}
                    onChange={(e) => run(() => a.setPoint(i, Number(e.target.value)))}
                    className={`w-full ${field}`}
                  />
                </label>
                <span className="w-28 shrink-0 font-mono text-[10px] text-slate-500">{fmtTime(p.timestamp)}</span>
              </div>
            ))}
            <div className="text-[10px] text-slate-500">Time is set by dragging the point on the chart.</div>
          </div>
        )}

        {tab === 'visibility' && (() => {
          const cfg: TfVisibility = { ...defaultTfVisibility(), ...(a.getTfVisibility() ?? {}) };
          const patchUnit = (unit: keyof TfVisibility, patch: Partial<{ on: boolean; from: number; to: number }>) => {
            const cur = cfg[unit] ?? { on: true, from: 1, to: 60 };
            run(() => a.setTfVisibility({ ...cfg, [unit]: { ...cur, ...patch } }));
          };
          return (
            <div className="space-y-3">
              <label className="flex items-center justify-between text-sm text-slate-300">
                Locked (ignores mouse edits)
                <input type="checkbox" checked={!!overlay.lock} onChange={() => run(a.toggleLock)} className="h-4 w-4 accent-blue-600" />
              </label>
              <label className="flex items-center justify-between text-sm text-slate-300">
                Hidden (all timeframes)
                <input type="checkbox" checked={a.isHidden()} onChange={() => run(a.toggleHidden)} className="h-4 w-4 accent-blue-600" />
              </label>

              <div className="border-t border-slate-800 pt-2">
                <div className="mb-1 text-[10px] uppercase text-slate-500">Visible on timeframes</div>
                <div className="space-y-1.5">
                  {TF_UNITS.map(({ unit, label }) => {
                    const g = cfg[unit] ?? { on: true, from: 1, to: 60 };
                    return (
                      <div key={unit} className="flex items-center gap-2 text-xs">
                        <label className="flex w-24 items-center gap-1.5 text-slate-300">
                          <input type="checkbox" checked={g.on} onChange={(e) => patchUnit(unit, { on: e.target.checked })} className="h-3.5 w-3.5 accent-blue-600" />
                          {label}
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={g.from}
                          disabled={!g.on}
                          onChange={(e) => patchUnit(unit, { from: Number(e.target.value) })}
                          className={`w-16 ${field} disabled:opacity-40`}
                        />
                        <span className="text-slate-500">to</span>
                        <input
                          type="number"
                          min={1}
                          value={g.to}
                          disabled={!g.on}
                          onChange={(e) => patchUnit(unit, { to: Number(e.target.value) })}
                          className={`w-16 ${field} disabled:opacity-40`}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1 text-[10px] text-slate-500">
                  e.g. Minutes 15–20 + Hours 1–2 shows this drawing only on the 15m and 1h charts.
                </div>
              </div>

              <div className="flex gap-2 border-t border-slate-800 pt-2">
                <Button size="xs" onClick={() => run(a.bringToFront)}>Bring to front</Button>
                <Button size="xs" onClick={() => run(a.sendToBack)}>Send to back</Button>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="flex justify-end border-t border-slate-800 p-3">
        <Button size="sm" variant="primary" onClick={close}>Done</Button>
      </div>
    </Modal>
  );
}
