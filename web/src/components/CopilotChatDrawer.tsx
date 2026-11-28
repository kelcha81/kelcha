'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import {
  Brain,
  ImagePlus,
  Loader2,
  Maximize2,
  Send,
  Sparkles,
  Trash2,
  X,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { copilotApi, type ReviewResult } from '@/lib/copilotApi';
import { useCopilotStore, type CopilotChatMsg } from '@/store/copilotStore';

function RubricBars({ review }: { review: ReviewResult }) {
  const rub = review.visual_rubric;
  if (!rub) return null;
  const entries = Object.entries(rub);
  const sum = review.visual_sizing?.raw_visual_sum ?? entries.reduce((a, [, v]) => a + Number(v || 0), 0);

  return (
    <div className="mt-2.5 rounded-md border border-slate-800 bg-slate-950/70 p-2.5">
      <div className="mb-2 flex items-center justify-between text-[11px]">
        <span className="font-medium text-slate-300">Option-1 Visual Rubric (8-Dim)</span>
        <span className="font-mono text-sky-300">
          Sum {sum >= 0 ? `+${sum}` : sum} · {review.visual_sizing?.tier || review.grade || 'Graded'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
        {entries.map(([k, val]) => {
          const n = Number(val || 0);
          const color = n > 0 ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' : n < 0 ? 'text-rose-400 bg-rose-500/15 border-rose-500/30' : 'text-slate-400 bg-slate-800/70 border-slate-700';
          return (
            <div key={k} className={`flex items-center justify-between rounded border px-2 py-1 ${color}`}>
              <span className="truncate pr-1 capitalize">{k.replace(/_/g, ' ')}</span>
              <span className="font-mono font-semibold">{n > 0 ? `+${n}` : n}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MessageCard({ msg }: { msg: CopilotChatMsg }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-xl rounded-br-sm bg-sky-600/25 px-3.5 py-2.5 text-sm text-slate-100 ring-1 ring-sky-500/40">
          {msg.contextChip && (
            <div className="mb-1.5 inline-flex items-center gap-1 rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] text-sky-200">
              <Brain className="h-3 w-3" /> {msg.contextChip.label}
            </div>
          )}
          {msg.imagePreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={msg.imagePreview} alt="Chart attachment" className="mb-2 max-h-40 rounded border border-slate-700 object-contain" />
          )}
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{msg.text}</p>
        </div>
      </div>
    );
  }

  const ans = msg.askAnswer;
  const rev = msg.reviewResult;
  const badgeText = rev
    ? `${rev.verdict || 'REVIEW'} · Grade ${rev.grade || '?'} · ${rev.recommended_risk_pct ?? 0}%`
    : ans?.updated_stance || 'CO-PILOT';
  const isPass = badgeText.includes('PASS') || badgeText.includes('INVALIDATED');
  const isTake = badgeText.includes('TAKE');

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[96%] rounded-xl rounded-bl-sm border border-slate-800 bg-slate-900/90 p-3.5 text-[13px] text-slate-200 shadow">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              isPass
                ? 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40'
                : isTake
                  ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                  : 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40'
            }`}
          >
            {isPass ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
            {badgeText}
          </span>
          <span className="text-[10px] text-slate-500">
            {rev?._meta?.review_model || ans?._meta?.review_model || 'Vertex AI'}
            {msg.elapsedMs ? ` · ${(msg.elapsedMs / 1000).toFixed(1)}s` : ''}
          </span>
        </div>

        {ans && (
          <div className="space-y-2.5">
            {ans.direct_answer && <p className="whitespace-pre-wrap leading-relaxed text-slate-100">{ans.direct_answer}</p>}
            {ans.live_pa_update && (
              <div className="rounded bg-slate-950/60 px-2.5 py-2 text-xs text-slate-300">
                <span className="font-semibold text-sky-300">PA Read: </span>
                {ans.live_pa_update}
              </div>
            )}
            {ans.updated_action_plan && (
              <div className="rounded border border-emerald-500/20 bg-emerald-950/20 px-2.5 py-2 text-xs text-emerald-200">
                <span className="font-semibold">Action Plan: </span>
                {ans.updated_action_plan}
              </div>
            )}
            {ans.retrieved_knowledge && ans.retrieved_knowledge.length > 0 && (
              <div className="pt-1">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">
                  Retrieved Knowledge Lessons
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ans.retrieved_knowledge.map((k) => (
                    <Link
                      key={k.case_id}
                      href={`/knowledge?q=${encodeURIComponent(k.case_id)}`}
                      className="inline-flex items-center gap-1 rounded border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-200 hover:bg-indigo-500/20"
                      title={k.takeaway}
                    >
                      <span className="font-mono text-[10px] text-indigo-400">L{k.learning_level ?? 0}</span>
                      <span className="max-w-[180px] truncate">{k.title || k.case_id}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {rev && (
          <div className="space-y-2.5">
            {rev.entry_sentence && <p className="font-medium text-slate-100">{rev.entry_sentence}</p>}
            {rev.mechanical_vs_narrative && (
              <p className="text-xs leading-relaxed text-slate-300">{rev.mechanical_vs_narrative}</p>
            )}
            <RubricBars review={rev} />
            {rev.actionable_plan && (
              <div className="rounded border border-emerald-500/20 bg-emerald-950/20 px-2.5 py-2 text-xs text-emerald-200">
                <span className="font-semibold">Plan: </span>
                {rev.actionable_plan}
              </div>
            )}
            {rev.red_flags && rev.red_flags.length > 0 && (
              <ul className="space-y-1 text-xs text-amber-300">
                {rev.red_flags.slice(0, 4).map((f, i) => (
                  <li key={i}>• {f}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!ans && !rev && <p className="whitespace-pre-wrap text-slate-200">{msg.text}</p>}
      </div>
    </div>
  );
}

export function CopilotChatBody({ fullPage = false }: { fullPage?: boolean }) {
  const {
    mode,
    setMode,
    contextChip,
    setContextChip,
    messages,
    addMessage,
    clearMessages,
    prefillPrompt,
    setPrefillPrompt,
    closeDrawer,
  } = useCopilotStore();

  const [input, setInput] = useState('');
  const [imageB64, setImageB64] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>('image/png');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (prefillPrompt) {
      setInput(prefillPrompt);
      setPrefillPrompt('');
    }
  }, [prefillPrompt, setPrefillPrompt]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, busy]);

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setImagePreview(dataUrl);
      setImageMime(file.type || 'image/png');
      const idx = dataUrl.indexOf(',');
      setImageB64(idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl);
    };
    reader.readAsDataURL(file);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q && !imageB64) return;
    setBusy(true);
    setError(null);

    const userMsg: CopilotChatMsg = {
      id: `u_${Date.now()}`,
      role: 'user',
      mode,
      text: q || '(Attached chart screenshot for review)',
      imagePreview: imagePreview || undefined,
      contextChip,
      createdAt: Date.now(),
    };
    addMessage(userMsg);
    setInput('');
    const sentB64 = imageB64;
    const sentMime = imageMime;
    setImageB64(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = '';

    try {
      if (mode === 'review') {
        const res = await copilotApi.review({
          user_note: q,
          telemetry: contextChip
            ? { pair: contextChip.symbol, tf: contextChip.timeframe, context: contextChip.summary }
            : {},
          image_base64: sentB64 || undefined,
          image_mime: sentMime,
        });
        addMessage({
          id: `a_${Date.now()}`,
          role: 'assistant',
          mode: 'review',
          text: res.review.actionable_plan || res.review.entry_sentence || 'Review complete.',
          reviewResult: res.review,
          createdAt: Date.now(),
        });
      } else {
        const prior = messages.slice(-6).map((m) => ({
          role: m.role,
          content: m.role === 'user' ? m.text : m.askAnswer?.direct_answer || m.text,
        }));
        const res = await copilotApi.ask({
          question: q || 'Analyze this chart against my Living Constitution and Knowledge Base.',
          trade_id: contextChip?.tradeId || contextChip?.caseId || contextChip?.symbol || '',
          context: contextChip ? { ...contextChip } : {},
          prior_turns: prior,
          image_base64: sentB64 || undefined,
          image_mime: sentMime,
        });
        addMessage({
          id: `a_${Date.now()}`,
          role: 'assistant',
          mode: 'ask',
          text: res.answer.direct_answer || 'Done.',
          askAnswer: res.answer,
          elapsedMs: res.elapsed_ms,
          createdAt: Date.now(),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Co-Pilot request failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`flex flex-col ${fullPage ? 'h-[calc(100vh-11rem)]' : 'h-full'}`}>
      {/* Mode Switcher + Context Pill */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2.5">
        <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950 p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setMode('ask')}
            className={`rounded px-2.5 py-1 font-medium ${mode === 'ask' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Quick Ask
          </button>
          <button
            type="button"
            onClick={() => setMode('review')}
            className={`rounded px-2.5 py-1 font-medium ${mode === 'review' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Option-1 Chart Grade
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearMessages}
              title="Clear thread"
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {!fullPage && (
            <Link
              href="/chat"
              onClick={closeDrawer}
              title="Expand full page"
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>

      {contextChip && (
        <div className="flex items-center justify-between border-b border-slate-800/80 bg-indigo-950/30 px-4 py-1.5 text-xs text-indigo-200">
          <span className="flex items-center gap-1.5 truncate">
            <Brain className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
            Context: <strong className="truncate">{contextChip.label}</strong>
          </span>
          <button type="button" onClick={() => setContextChip(null)} className="text-indigo-300 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="rounded-lg border border-slate-800/90 bg-slate-900/40 p-4 text-xs text-slate-400">
            <div className="mb-2 flex items-center gap-2 font-medium text-slate-200">
              <Sparkles className="h-4 w-4 text-sky-400" />
              Co-Pilot Vertex AI Brain (Living Constitution + 216 Cases)
            </div>
            <p className="mb-3 leading-relaxed">
              Ask about any setup, drop a chart screenshot for an Option-1 8-dimension visual grade, or interrogate any uploaded PDF/KB lesson. Powered directly by Vertex AI inside <code className="text-sky-300">co-pilot-516023</code> (no separate key needed).
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                'When does OB Invalidation say to stand aside?',
                'Explain why median 50% bounces score well under Option 1',
                'How does Trapzone interact with Double-Break CT?',
              ].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setInput(s)}
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-left text-[11px] text-slate-300 hover:border-sky-500/50 hover:text-white"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <MessageCard key={m.id} msg={m} />
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />
            Co-Pilot is retrieving KB lessons & evaluating via Vertex AI…
          </div>
        )}
        {error && (
          <div className="rounded border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <form onSubmit={onSubmit} className="border-t border-slate-800 bg-slate-950/80 p-3">
        {imagePreview && (
          <div className="mb-2 flex items-center gap-2 rounded border border-slate-800 bg-slate-900 p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview} alt="Preview" className="h-12 w-16 rounded object-cover" />
            <span className="flex-1 text-xs text-slate-300">Chart attached</span>
            <button
              type="button"
              onClick={() => {
                setImagePreview(null);
                setImageB64(null);
              }}
              className="rounded p-1 text-slate-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onFileChange} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Attach chart screenshot"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void onSubmit(e as unknown as FormEvent);
              }
            }}
            placeholder={
              mode === 'review'
                ? 'Attach a chart screenshot + notes for full Option-1 visual grading…'
                : 'Ask Co-Pilot about price action, rules, or uploaded PDFs…'
            }
            className="max-h-32 flex-1 resize-none rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-sky-500"
          />
          <button
            type="submit"
            disabled={busy || (!input.trim() && !imageB64)}
            className="flex h-9 shrink-0 items-center gap-1 rounded-md bg-sky-600 px-3 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}

export function CopilotChatDrawer() {
  const { drawerOpen, closeDrawer } = useCopilotStore();
  if (!drawerOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-[430px] flex-col border-l border-slate-800 bg-[#0b0f14] shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-sky-400" />
          <span className="text-sm font-semibold text-slate-100">Co-Pilot Chat</span>
        </div>
        <button
          type="button"
          onClick={closeDrawer}
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          aria-label="Close Co-Pilot Chat"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <CopilotChatBody />
      </div>
    </div>
  );
}
