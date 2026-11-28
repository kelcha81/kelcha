import { getIdToken } from '@/lib/firebase';

export interface TwinHealth {
  ok: boolean;
  service: string;
  review_model: string;
  forecast_model: string;
  query_model: string;
  playbook_version: string;
  playbook_updated_at?: string;
  cases_loaded: number;
  kelvin_asrs: number;
  mentor_cases: number;
  quarantined_anti_patterns: number;
  embeddings_loaded: number;
  copilot_watchlist: number;
}

export interface PromotedRule {
  id: string;
  level: number;
  title: string;
  dimension: string;
  pr: string;
  proof: string;
}

export interface LearningSummary {
  total_cases: number;
  by_source: Record<string, number>;
  quarantined: number;
  levels: Record<'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5', number>;
  promoted_rules: PromotedRule[];
  playbook_version: string;
  playbook_updated_at?: string;
}

export interface TwinCase {
  case_id: string;
  source: string;
  author: string;
  date: string;
  pair: string;
  direction: string;
  title?: string;
  category?: string;
  learning_level?: number;
  uploaded_via?: string;
  setup_model?: string;
  setup_grade?: string;
  outcome?: string;
  pnl_r?: number | null;
  process_bucket?: string;
  do_not_imitate?: boolean;
  memory_weight?: number;
  image_count?: number;
  htf_narrative?: string;
  swept_liquidity?: string;
  entry_trigger?: string;
  dol_target?: string;
  candle_intention?: string;
  key_rule_takeaway?: string;
  tags?: string[];
  layer_b_audit?: { skeptic_verdict?: string; audited_playbook_version?: string };
}

export interface RetrievedKnowledgeChip {
  case_id: string;
  author?: string;
  title?: string;
  learning_level?: number;
  similarity?: number;
  takeaway?: string;
}

export interface AskAnswer {
  updated_stance?: string;
  direct_answer?: string;
  live_pa_update?: string;
  updated_action_plan?: string;
  key_risks_or_precedents?: string[];
  retrieved_knowledge?: RetrievedKnowledgeChip[];
  retrieved_anti_patterns?: { case_id: string; pair?: string; bucket?: string; similarity?: number }[];
  _meta?: { review_model?: string; playbook_version?: string };
}

export interface ReviewResult {
  verdict?: string;
  grade?: string;
  recommended_risk_pct?: number;
  recommended_entry_model?: string;
  setup_classification?: string;
  entry_sentence?: string;
  mechanical_vs_narrative?: string;
  actionable_plan?: string;
  red_flags?: string[];
  matched_precedents?: string[];
  price_action_4_questions?: Record<string, string>;
  visual_rubric?: Record<string, number>;
  visual_sizing?: {
    raw_visual_sum?: number;
    core_3dim_sum?: number;
    tier?: string;
    account_mode?: string;
    hard_blocked?: boolean;
    hard_block_reasons?: string[];
  };
  _meta?: { review_model?: string; playbook_version?: string; retrieved_case_ids?: string[] };
}

export interface HypothesisDoc {
  hypothesis_id: string;
  title: string;
  source_case_id?: string;
  target_level: number;
  test_plan: string;
  notes?: string;
  status: string;
  created_at: string;
}

export interface ProposalDoc {
  proposal_id: string;
  date?: string;
  timeframe?: string;
  research_model?: string;
  promoted_count?: number;
  tested_count?: number;
  diagnosis?: string;
  markdown?: string;
}

export interface LiveSignalDoc {
  signal_id: string;
  trade_id?: string;
  date?: string;
  created_at?: string;
  symbol: string;
  tf: string;
  direction: string;
  kz?: string;
  setup_tier?: string;
  verdict: string;
  grade?: string;
  notified?: boolean;
  user_action?: string;
  telemetry?: { entry?: number; sl?: number; tp?: number; rr?: number };
  review?: ReviewResult;
}

export interface ForecastDoc {
  forecast_id: string;
  trade_id?: string;
  session?: string;
  created_at?: string;
  playbook_version?: string;
  review_model?: string;
  forecast?: {
    macro_summary?: string;
    watchlist_ideas?: Array<{
      pair: string;
      bias: string;
      setup_type?: string;
      pa_premium_discount?: string;
      pa_htf_wick_expansion?: string;
      pa_reaction_zone?: string;
      pa_where_to_fill?: string;
      narrative?: string;
      trigger_to_watch?: string;
    }>;
    avoid_today?: string[];
  };
}

export interface DeskSnapshot {
  ok: boolean;
  account_mode: string;
  stream_b_shadow: boolean;
  playbook_version: string;
  dual_equity: Record<string, unknown>;
  signals: LiveSignalDoc[];
  forecasts: ForecastDoc[];
  armed_orders: Array<Record<string, unknown>>;
}

async function twinFetch<T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<T> {
  const token = await getIdToken();
  const res = await fetch(`/api/copilot/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Co-Pilot HTTP ${res.status}`);
  }
  return data as T;
}

export const copilotApi = {
  health: () => twinFetch<TwinHealth>('health'),
  cases: (params?: { source?: string; q?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.source) qs.set('source', params.source);
    if (params?.q) qs.set('q', params.q);
    qs.set('limit', String(params?.limit ?? 250));
    return twinFetch<{ ok: boolean; count: number; summary: LearningSummary; cases: TwinCase[] }>(
      `cases?${qs.toString()}`
    );
  },
  ask: (payload: {
    question: string;
    trade_id?: string;
    context?: Record<string, unknown>;
    prior_turns?: Array<{ role: string; content: string }>;
    image_base64?: string;
    image_mime?: string;
  }) => twinFetch<{ ok: boolean; answer: AskAnswer; elapsed_ms?: number }>('ask', 'POST', payload),
  review: (payload: {
    user_note: string;
    telemetry?: Record<string, unknown>;
    image_base64?: string;
    image_mime?: string;
  }) => twinFetch<{ ok: boolean; review: ReviewResult }>('review', 'POST', payload),
  uploadLesson: (payload: {
    title: string;
    category: string;
    notes?: string;
    pair?: string;
    files?: Array<{ filename: string; base64: string; mime: string }>;
  }) =>
    twinFetch<{ ok: boolean; case_id: string; learning_level: number; gcs_media: string[]; card: TwinCase; elapsed_ms?: number }>(
      'upload-lesson',
      'POST',
      payload
    ),
  signals: () => twinFetch<DeskSnapshot>('signals'),
  signalAction: (signal_id: string, action: 'took' | 'skip' | 'win' | 'loss') =>
    twinFetch<{ ok: boolean; signal_id: string; user_action: string; draft_id?: string }>(
      'signal-action',
      'POST',
      { signal_id, action }
    ),
  proposals: () => twinFetch<{ ok: boolean; count: number; proposals: ProposalDoc[] }>('proposals'),
  playbook: () =>
    twinFetch<{
      ok: boolean;
      playbook_version: string;
      updated_at?: string;
      source_file?: string;
      full_text: string;
      kb_topics: string[];
      asr_audit_buckets: Record<string, number>;
    }>('playbook'),
  listHypotheses: () => twinFetch<{ ok: boolean; count: number; hypotheses: HypothesisDoc[] }>('hypotheses'),
  createHypothesis: (payload: {
    title: string;
    source_case_id?: string;
    target_level: number;
    test_plan?: string;
    notes?: string;
  }) => twinFetch<{ ok: boolean; hypothesis: HypothesisDoc }>('hypotheses', 'POST', payload),
};
