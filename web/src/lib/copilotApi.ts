import { getIdToken } from '@/lib/firebase';

export interface IgShadowHealth {
  status: 'ONLINE' | 'STALE' | 'DISCONNECTED' | 'OFFLINE';
  connected: boolean;
  verified_epics: number;
  total_epics: number;
  closed_m1_total: number;
  symbols_active: number;
  last_flush_at: string;
  age_seconds: number | null;
  account_type?: string;
}

export interface LiveCandleBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface LiveCandlesResponse {
  ok: boolean;
  symbol: string;
  tf: string;
  source: string;
  count: number;
  candles: LiveCandleBar[];
  ig_avg_spread_pips?: number;
  ig_m1_count?: number;
  ig_updated_at?: string;
}

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
  ig_shadow?: IgShadowHealth;
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
  telemetry?: { entry?: number; sl?: number; tp?: number; rr?: number; sweep_level?: number };
  review?: ReviewResult;
}

export interface ForecastChartLevels {
  poi_top?: number | null;
  poi_bottom?: number | null;
  draw_price?: number | null;
  invalidation_price?: number | null;
  sweep_level?: number | null;
  tf?: string;
}

export interface ForecastWatchlistIdea {
  pair: string;
  bias: string;
  setup_type?: string;
  pa_premium_discount?: string;
  pa_htf_wick_expansion?: string;
  pa_reaction_zone?: string;
  pa_where_to_fill?: string;
  narrative?: string;
  trigger_to_watch?: string;
  chart_levels?: ForecastChartLevels;
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
    watchlist_ideas?: ForecastWatchlistIdea[];
    avoid_today?: string[];
  };
}

export interface BacktestRunSymbolSummary {
  symbol: string;
  trades: number;
  wins: number;
  win_rate: number;
  net_r_08: number;
  net_r_12: number;
}

export interface BacktestRunSummary {
  run_id: string;
  name: string;
  description?: string;
  timeframe: string;
  created_at: string;
  total_trades: number;
  win_rate: number;
  net_r_08: number;
  net_r_12: number;
  symbols: BacktestRunSymbolSummary[];
}

export interface VisualBacktestTrade {
  trade_id: string;
  entry_time: number;
  exit_time: number;
  direction: 'BULL' | 'BEAR';
  entry: number;
  sl: number;
  tp: number;
  exit_price: number;
  gross_r?: number;
  r_08: number;
  r_12: number;
  outcome: 'WIN' | 'LOSS';
  vetoed?: boolean;
  veto_reason?: string;
  zones?: Array<{ type: string; direction: string; top: number; bottom: number; t_start: number; t_end: number }>;
  levels?: Array<{ type: string; price: number; time: number; label: string }>;
}

export interface BacktestRunSymbolArtifact {
  ok: boolean;
  run_id: string;
  symbol: string;
  timeframe: string;
  generated_at?: string;
  stats: { trades: number; wins: number; win_rate: number; net_r_08: number; net_r_12: number };
  trades: VisualBacktestTrade[];
}

export interface CompactModelTrade {
  trade_id: string;
  symbol: string;
  entry_time: number;
  exit_time: number;
  date: string;
  year: number;
  month: number;
  ym: string;
  direction: 'BULL' | 'BEAR';
  entry?: number;
  sl?: number;
  tp?: number;
  r_08: number;
  r_12: number;
  outcome: 'WIN' | 'LOSS';
  vetoed?: boolean;
}

export interface PersonalAsrRecord {
  case_id: string;
  symbol: string;
  date: string;
  year: number;
  month: number;
  ym: string;
  direction: string;
  outcome: 'WIN' | 'LOSS' | 'BE' | 'UNKNOWN';
  pnl_r: number | null;
  process_bucket: string;
  setup_grade?: string;
  do_not_imitate?: boolean;
  key_rule_takeaway?: string;
}

export interface BacktestRunAllTradesResponse {
  ok: boolean;
  run_id: string;
  run: BacktestRunSummary;
  trade_count: number;
  asr_count: number;
  trades: CompactModelTrade[];
  personal_asrs: PersonalAsrRecord[];
}

export interface DataStudioSchema {
  ok: boolean;
  engine: string;
  runs: BacktestRunSummary[];
  counts: { model_trades: number; personal_asrs: number; live_signals: number };
  tables: Record<string, string[]>;
}

export interface DataStudioQueryResponse {
  ok: boolean;
  engine: string;
  sql: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  row_count: number;
  truncated: boolean;
  elapsed_ms: number;
  explanation?: string;
  chart_hint?: string;
  model_used?: string;
}

export interface DeskSnapshot {
  ok: boolean;
  account_mode: string;
  stream_b_shadow: boolean;
  playbook_version: string;
  ig_shadow?: IgShadowHealth;
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
  liveCandles: (symbol: string, tf: 'm5' | 'm15' | 'h1' | 'h4' | 'd1' = 'm15', count = 240) =>
    twinFetch<LiveCandlesResponse>(
      `live-candles?symbol=${encodeURIComponent(symbol.toLowerCase())}&tf=${encodeURIComponent(tf)}&count=${count}`
    ),
  backtestRuns: () => twinFetch<{ ok: boolean; count: number; runs: BacktestRunSummary[] }>('backtest-runs'),
  backtestRunSymbol: (runId: string, symbol: string) =>
    twinFetch<BacktestRunSymbolArtifact>(
      `backtest-runs?run_id=${encodeURIComponent(runId)}&symbol=${encodeURIComponent(symbol.toLowerCase())}`
    ),
  backtestRunAllTrades: (runId: string) =>
    twinFetch<BacktestRunAllTradesResponse>(
      `backtest-runs?run_id=${encodeURIComponent(runId)}&all_trades=1`
    ),
  dataSchema: (refresh = false) =>
    twinFetch<DataStudioSchema>(`data/schema${refresh ? '?refresh=1' : ''}`),
  dataQuery: (payload: { sql?: string; question?: string; run_id?: string; max_rows?: number; refresh?: boolean }) =>
    twinFetch<DataStudioQueryResponse>('data/query', 'POST', payload),
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
