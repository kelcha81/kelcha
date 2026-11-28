'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Brain,
  CheckCircle2,
  FileText,
  FlaskConical,
  Loader2,
  MessageSquare,
  Search,
  ShieldAlert,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { CopilotNavShell } from '@/components/CopilotNavShell';
import { copilotApi, type LearningSummary, type TwinCase } from '@/lib/copilotApi';
import { useCopilotStore } from '@/store/copilotStore';

type TabView = 'lessons' | 'promoted' | 'constitution';
type SourceFilter = 'all' | 'knowledge_lesson' | 'mentor_tradefloor' | 'kelvin_asr' | 'quarantined';

const LEVEL_META: Array<{ key: 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5'; name: string; desc: string; color: string }> = [
  { key: 'L0', name: 'L0 Intake', desc: 'Narrative & Chat only (0% veto)', color: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300' },
  { key: 'L1', name: 'L1 Visual', desc: 'Option-1 8-Dim Rubric', color: 'border-sky-500/40 bg-sky-500/10 text-sky-300' },
  { key: 'L2', name: 'L2 Throttle', desc: 'Deterministic Soft Risk Trim', color: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' },
  { key: 'L3', name: 'L3 Hard Veto', desc: '0% PASS Guardrails', color: 'border-amber-500/40 bg-amber-500/10 text-amber-300' },
  { key: 'L4', name: 'L4 V5 Engine', desc: 'Mechanical Python + Pine', color: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' },
  { key: 'L5', name: 'L5 Core Plan', desc: 'Living Constitution', color: 'border-purple-500/40 bg-purple-500/10 text-purple-300' },
];

export default function KnowledgePage() {
  const openDrawer = useCopilotStore((s) => s.openDrawer);
  const [tab, setTab] = useState<TabView>('lessons');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('knowledge_lesson');
  const [query, setQuery] = useState('');
  const [cases, setCases] = useState<TwinCase[]>([]);
  const [summary, setSummary] = useState<LearningSummary | null>(null);
  const [playbook, setPlaybook] = useState<{ playbook_version: string; full_text: string; source_file?: string } | null>(null);
  const [selected, setSelected] = useState<TwinCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Upload state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [upTitle, setUpTitle] = useState('');
  const [upCategory, setUpCategory] = useState('LC Insight');
  const [upPair, setUpPair] = useState('MULTI');
  const [upNotes, setUpNotes] = useState('');
  const [upFiles, setUpFiles] = useState<Array<{ filename: string; base64: string; mime: string; size: number }>>([]);
  const [upStep, setUpStep] = useState<'idle' | 'uploading' | 'done'>('idle');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Hypothesis queue modal
  const [queueBusy, setQueueBusy] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [cRes, pbRes] = await Promise.all([copilotApi.cases({ limit: 300 }), copilotApi.playbook()]);
      setCases(cRes.cases);
      setSummary(cRes.summary);
      setPlaybook(pbRes);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load Knowledge Library');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cRes, pbRes] = await Promise.all([copilotApi.cases({ limit: 300 }), copilotApi.playbook()]);
        if (!cancelled) {
          setCases(cRes.cases);
          setSummary(cRes.summary);
          setPlaybook(pbRes);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : 'Failed to load Knowledge Library');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cases.filter((c) => {
      if (sourceFilter === 'knowledge_lesson' && c.source !== 'knowledge_lesson' && c.source !== 'forecasting_note') return false;
      if (sourceFilter === 'mentor_tradefloor' && c.source !== 'mentor_tradefloor') return false;
      if (sourceFilter === 'kelvin_asr' && (c.source !== 'kelvin_asr' || c.do_not_imitate)) return false;
      if (sourceFilter === 'quarantined' && !c.do_not_imitate) return false;
      if (!q) return true;
      return (
        (c.case_id || '').toLowerCase().includes(q) ||
        (c.title || '').toLowerCase().includes(q) ||
        (c.author || '').toLowerCase().includes(q) ||
        (c.pair || '').toLowerCase().includes(q) ||
        (c.key_rule_takeaway || '').toLowerCase().includes(q) ||
        (c.htf_narrative || '').toLowerCase().includes(q)
      );
    });
  }, [cases, sourceFilter, query]);

  async function onFilesPicked(e: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files || []).slice(0, 6);
    const out: Array<{ filename: string; base64: string; mime: string; size: number }> = [];
    for (const f of list) {
      if (f.size > 15 * 1024 * 1024) {
        toast.error(`${f.name} is over 15 MB.`);
        continue;
      }
      const b64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const s = String(reader.result || '');
          const idx = s.indexOf(',');
          resolve(idx >= 0 ? s.slice(idx + 1) : s);
        };
        reader.readAsDataURL(f);
      });
      out.push({ filename: f.name, base64: b64, mime: f.type || 'application/octet-stream', size: f.size });
    }
    setUpFiles((prev) => [...prev, ...out].slice(0, 6));
    if (!upTitle && out[0]) {
      setUpTitle(out[0].filename.replace(/\.[^.]+$/, ''));
    }
  }

  async function onUploadSubmit(e: FormEvent) {
    e.preventDefault();
    if (!upTitle.trim() && upFiles.length === 0) return;
    setUpStep('uploading');
    try {
      const res = await copilotApi.uploadLesson({
        title: upTitle.trim(),
        category: upCategory,
        pair: upPair.trim().toUpperCase() || 'MULTI',
        notes: upNotes.trim(),
        files: upFiles.map(({ filename, base64, mime }) => ({ filename, base64, mime })),
      });
      setUpStep('done');
      toast.success(`Extracted & indexed "${res.card.title || res.case_id}" at Level 0!`);
      setSelected(res.card);
      setUpTitle('');
      setUpNotes('');
      setUpFiles([]);
      setUploadOpen(false);
      setUpStep('idle');
      setSourceFilter('knowledge_lesson');
      await loadData();
    } catch (ex) {
      setUpStep('idle');
      toast.error(ex instanceof Error ? ex.message : 'Upload failed');
    }
  }

  async function queuePromotionTest(c: TwinCase, targetLevel: number) {
    setQueueBusy(true);
    try {
      await copilotApi.createHypothesis({
        title: `Evaluate "${c.title || c.case_id}" for Level ${targetLevel}`,
        source_case_id: c.case_id,
        target_level: targetLevel,
        notes: c.key_rule_takeaway || c.htf_narrative || '',
      });
      toast.success(`Queued "${c.title || c.case_id}" in Quant Lab for Level ${targetLevel} PR testing.`);
    } catch (ex) {
      toast.error(ex instanceof Error ? ex.message : 'Failed to queue hypothesis');
    } finally {
      setQueueBusy(false);
    }
  }

  return (
    <CopilotNavShell
      title="Knowledge Library & L0 → L5 Promotion Pipeline"
      subtitle="Upload PDFs, annotated charts, or notes. Every new lesson starts safely at Level 0 until empirically promoted via Quant Lab + PR."
      actions={
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="flex items-center gap-1.5 rounded-md bg-sky-600 px-3.5 py-2 text-xs font-medium text-white shadow hover:bg-sky-500"
        >
          <Upload className="h-3.5 w-3.5" />
          Upload PDF / Chart Lesson
        </button>
      }
    >
      {/* L0 -> L5 Governance Funnel Strip */}
      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {LEVEL_META.map((lvl) => {
          const val = summary?.levels[lvl.key] ?? 0;
          return (
            <button
              key={lvl.key}
              type="button"
              onClick={() => {
                if (lvl.key === 'L0') {
                  setTab('lessons');
                  setSourceFilter('knowledge_lesson');
                } else if (lvl.key === 'L5') {
                  setTab('constitution');
                } else {
                  setTab('promoted');
                }
              }}
              className={`rounded-lg border p-3 text-left transition hover:brightness-110 ${lvl.color}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">{lvl.name}</span>
                <span className="font-mono text-lg font-bold tabular-nums">{val}</span>
              </div>
              <div className="mt-1 text-[11px] opacity-80">{lvl.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Sub-navigation Tabs */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/70 p-1 text-xs">
          {[
            { id: 'lessons' as const, label: `Case & Lesson Memory (${cases.length})`, Icon: Brain },
            { id: 'promoted' as const, label: `Active Promoted Rules (${summary?.promoted_rules.length ?? 0})`, Icon: CheckCircle2 },
            { id: 'constitution' as const, label: `Living Constitution (${playbook?.playbook_version || 'v2.2'})`, Icon: BookOpen },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                tab === id ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {tab === 'lessons' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search lessons, pairs, takeaways…"
                className="w-56 rounded-md border border-slate-800 bg-slate-900 py-1.5 pl-8 pr-3 text-xs text-slate-100 outline-none focus:border-sky-500"
              />
            </div>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
              className="rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200"
            >
              <option value="knowledge_lesson">L0 Knowledge & PDFs</option>
              <option value="mentor_tradefloor">Mentor Hannah</option>
              <option value="kelvin_asr">Valid Kelvin ASRs</option>
              <option value="quarantined">Quarantined Traps ({summary?.quarantined ?? 0})</option>
              <option value="all">All Memory ({cases.length})</option>
            </select>
          </div>
        )}
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-200">
          {err}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 py-12 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin text-sky-400" /> Loading Co-Pilot Brain…
        </div>
      )}

      {/* TAB 1: Lessons & Case Memory Grid + Inspector */}
      {!loading && tab === 'lessons' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="space-y-2.5 lg:col-span-7">
            {filtered.length === 0 && (
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
                No lessons match this filter.
              </div>
            )}
            {filtered.map((c) => {
              const isKb = c.source === 'knowledge_lesson' || c.source === 'forecasting_note';
              const isSelected = selected?.case_id === c.case_id;
              return (
                <button
                  key={c.case_id}
                  type="button"
                  onClick={() => setSelected(c)}
                  className={`w-full rounded-lg border p-3.5 text-left transition ${
                    isSelected
                      ? 'border-sky-500/70 bg-slate-900 shadow-lg'
                      : 'border-slate-800/90 bg-slate-900/45 hover:border-slate-700 hover:bg-slate-900/80'
                  }`}
                >
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {isKb ? (
                        <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-indigo-300 ring-1 ring-indigo-500/40">
                          L{c.learning_level ?? 0}
                        </span>
                      ) : c.do_not_imitate ? (
                        <span className="inline-flex items-center gap-1 rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">
                          <ShieldAlert className="h-3 w-3" /> QUARANTINED
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                          {c.source === 'mentor_tradefloor' ? 'MENTOR' : 'VALID ASR'}
                        </span>
                      )}
                      <span className="font-medium text-slate-100">{c.title || c.case_id}</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400">
                      {c.pair} · {c.date}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs leading-relaxed text-slate-300">
                    {c.key_rule_takeaway || c.htf_narrative || 'No summary available.'}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                    <span>{c.author}</span>
                    {c.setup_model && <span>• {c.setup_model}</span>}
                    {typeof c.image_count === 'number' && c.image_count > 0 && <span>• {c.image_count} media read</span>}
                    {c.uploaded_via === 'web_ui' && (
                      <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-sky-300">Web Upload</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right-hand Lesson Inspector */}
          <div className="lg:col-span-5">
            <div className="sticky top-20 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              {!selected ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  <Brain className="mx-auto mb-2 h-6 w-6 text-slate-600" />
                  Select any lesson or case to inspect what Co-Pilot extracted, chat about it, or queue a Level 1–4 Quant Lab promotion test.
                </div>
              ) : (
                <div className="space-y-3.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-100">{selected.title || selected.case_id}</div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        {selected.author} · {selected.pair} · {selected.date}
                      </div>
                    </div>
                    <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-indigo-300">
                      {selected.source === 'knowledge_lesson' || selected.source === 'forecasting_note'
                        ? `Level ${selected.learning_level ?? 0}`
                        : selected.process_bucket || selected.source}
                    </span>
                  </div>

                  {selected.key_rule_takeaway && (
                    <div className="rounded-lg border border-sky-500/25 bg-sky-950/25 p-3">
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                        Extracted Key Rule Takeaway
                      </div>
                      <p className="leading-relaxed text-slate-100">{selected.key_rule_takeaway}</p>
                    </div>
                  )}

                  {selected.htf_narrative && (
                    <div>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        HTF Narrative & Structure
                      </div>
                      <p className="leading-relaxed text-slate-300">{selected.htf_narrative}</p>
                    </div>
                  )}

                  {selected.entry_trigger && (
                    <div>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Trigger / Invalidation Criteria
                      </div>
                      <p className="leading-relaxed text-slate-300">{selected.entry_trigger}</p>
                    </div>
                  )}

                  {selected.dol_target && (
                    <div>
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Draw on Liquidity / Opposing Zones
                      </div>
                      <p className="leading-relaxed text-slate-300">{selected.dol_target}</p>
                    </div>
                  )}

                  {/* Governance Action Bar */}
                  <div className="space-y-2 border-t border-slate-800 pt-3">
                    <button
                      type="button"
                      onClick={() =>
                        openDrawer({
                          context: {
                            kind: 'knowledge_lesson',
                            label: selected.title || selected.case_id,
                            caseId: selected.case_id,
                            symbol: selected.pair !== 'MULTI' ? selected.pair : undefined,
                            summary: selected.key_rule_takeaway,
                          },
                          prefill: `How should we test "${selected.title || selected.case_id}" without causing solar-eclipse over-filtering?`,
                        })
                      }
                      className="flex w-full items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 font-medium text-white hover:bg-indigo-500"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Discuss With Co-Pilot
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={queueBusy}
                        onClick={() => void queuePromotionTest(selected, 1)}
                        className="flex items-center justify-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/10 px-2.5 py-1.5 text-[11px] font-medium text-sky-200 hover:bg-sky-500/20 disabled:opacity-50"
                      >
                        <FlaskConical className="h-3.5 w-3.5" />
                        Queue L1 Test
                      </button>
                      <button
                        type="button"
                        disabled={queueBusy}
                        onClick={() => void queuePromotionTest(selected, 2)}
                        className="flex items-center justify-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
                      >
                        <FlaskConical className="h-3.5 w-3.5" />
                        Queue L2 Test
                      </button>
                    </div>

                    <p className="flex items-start gap-1.5 text-[10px] text-slate-500">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                      Governance lock: Promotion above Level 0 is strictly gated behind a separate PR with 5-yr IS/OOS, 0.8p/1.2p spread, Challenge/Funded & 18-Pair Jackknife proof.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Active Promoted Rules */}
      {!loading && tab === 'promoted' && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {(summary?.promoted_rules || []).map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-mono text-xs font-semibold text-emerald-300">
                  Level {r.level} · {r.pr}
                </span>
                <span className="font-mono text-[11px] text-slate-500">{r.dimension}</span>
              </div>
              <h3 className="text-sm font-semibold text-slate-100">{r.title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">{r.proof}</p>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: Living Constitution */}
      {!loading && tab === 'constitution' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Active Living Constitution ({playbook?.playbook_version || 'v2.2'})
              </h3>
              <p className="text-xs text-slate-400">Source: {playbook?.source_file || 'TP V2.md'}</p>
            </div>
            <span className="rounded bg-purple-500/20 px-2 py-1 font-mono text-xs text-purple-200">Level 5 Core</span>
          </div>
          <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-200">
            {playbook?.full_text || 'Loading…'}
          </pre>
        </div>
      )}

      {/* Upload Lesson Modal */}
      {uploadOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <form
            onSubmit={onUploadSubmit}
            className="w-full max-w-lg rounded-xl border border-slate-700 bg-[#0f1623] p-5 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-sky-400" />
                <h2 className="text-sm font-semibold text-slate-100">Upload New Learning Material (Level 0)</h2>
              </div>
              <button type="button" onClick={() => setUploadOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="mb-1 block text-slate-400">Lesson Title</label>
                <input
                  type="text"
                  required
                  value={upTitle}
                  onChange={(e) => setUpTitle(e.target.value)}
                  placeholder="e.g., Liquidity Sweep vs Inducement PDF"
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-slate-400">Category</label>
                  <select
                    value={upCategory}
                    onChange={(e) => setUpCategory(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
                  >
                    <option value="LC Insight">LC Insight</option>
                    <option value="ICT Core">ICT Core</option>
                    <option value="Tradefloor Example">Tradefloor Example</option>
                    <option value="Forecasting Note">Forecasting Note</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-slate-400">Pair (or MULTI)</label>
                  <input
                    type="text"
                    value={upPair}
                    onChange={(e) => setUpPair(e.target.value)}
                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-slate-400">Attach PDFs, Annotated PNG/JPG Charts, or Markdown</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.md,.txt"
                  onChange={onFilesPicked}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-700 bg-slate-950/70 py-5 text-slate-300 hover:border-sky-500 hover:text-white"
                >
                  <Upload className="h-5 w-5 text-sky-400" />
                  <span>Click to select PDFs, screenshots, or `.md` notes (up to 15 MB each)</span>
                </button>
                {upFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {upFiles.map((f, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded bg-slate-900 px-2.5 py-1 text-[11px]">
                        <span className="flex items-center gap-1.5 truncate text-slate-200">
                          <FileText className="h-3.5 w-3.5 text-sky-400" />
                          {f.filename} ({(f.size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                        <button
                          type="button"
                          onClick={() => setUpFiles((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-slate-400 hover:text-rose-300"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-slate-400">Notes / Context (optional if PDF/chart attached)</label>
                <textarea
                  rows={3}
                  value={upNotes}
                  onChange={(e) => setUpNotes(e.target.value)}
                  placeholder="Key takeaways or specific rules you want Co-Pilot to notice…"
                  className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-sky-500"
                />
              </div>

              <div className="rounded border border-indigo-500/30 bg-indigo-950/30 p-2.5 text-[11px] text-indigo-200">
                Gemini Vision will read every attached chart/PDF page, embed the lesson into Co-Pilot&apos;s vector memory, and store it safely at <strong>Level 0</strong> (available immediately in Chat & Morning Forecasts with zero risk of overriding V5 rules).
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUploadOpen(false)}
                  className="rounded border border-slate-700 px-3 py-2 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={upStep === 'uploading'}
                  className="flex items-center gap-1.5 rounded bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                >
                  {upStep === 'uploading' ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Extracting via Gemini Vision…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      Extract & Index at Level 0
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </CopilotNavShell>
  );
}
