// Client for the ICT engine backend (ict-engine/server.py), a drop-in
// replacement for the old strategy-backend on the same port/contract. The
// response is extended with ICT `annotations`; the request may add `htf`
// context and an `account`.

// Engine base URL. Local dev defaults to the sidecar on :8000; in the cloud
// set NEXT_PUBLIC_ENGINE_URL to the engine's Cloud Run URL at build time.
const BASE = process.env.NEXT_PUBLIC_ENGINE_URL?.replace(/\/$/, '') || 'http://localhost:8000';

export interface StrategyInfo {
  label: string;
  params: Record<string, number>;
  description: string;
}

export interface BacktestStats {
  trades: number;
  totalPnl: number;
  winRate: number;
  avgPnl: number;
  maxDrawdown: number;
  // richer metrics the ICT engine also returns (optional for back-compat)
  profitFactor?: number;
  expectancy?: number;
  avgR?: number;
  sharpe?: number;
}

export interface BacktestTrade {
  id?: string;
  side: string;
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  pnl: number;
  reason?: string;
  size?: number;
  contractSize?: number;
  risk?: number;
  sl?: number;
  tp?: number;
}

/** A detected ICT structure for the chart (camelCase mirror of models.ICTEvent). */
export interface IctAnnotation {
  type: string; // 'fvg' | 'order_block' | 'liquidity' | 'liquidity_sweep' | 'bos' | 'mss' | ...
  direction?: 'bull' | 'bear' | string | null;
  tStart: number;
  tEnd?: number | null;
  top?: number | null;
  bottom?: number | null;
  price?: number | null;
  strength?: number | null;
  confirmTs?: number | null;
  mitigatedAt?: number | null;
  meta?: Record<string, unknown>;
}

export interface BacktestResult {
  stats: BacktestStats;
  trades: BacktestTrade[];
  equity: { timestamp: number; equity: number }[];
  annotations?: IctAnnotation[];
}

export interface BacktestRequest {
  symbol: string;
  timeframe: string;
  strategy: string;
  params: Record<string, number>;
  htf?: string[];
  from?: number;
  to?: number;
  warmup?: number;
  account?: { balance?: number; spread?: number; commission?: number };
}

export async function getStrategies(): Promise<Record<string, StrategyInfo>> {
  const res = await fetch(`${BASE}/strategies`);
  if (!res.ok) throw new Error(`Backend error ${res.status}`);
  return res.json();
}

export async function runBacktest(req: BacktestRequest): Promise<BacktestResult> {
  const res = await fetch(`${BASE}/backtest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Backtest failed (${res.status})`);
  return data as BacktestResult;
}

// --- AI strategy authoring ---------------------------------------------------

export interface ModelInfo {
  id: string;
  display_name: string;
}

export interface StrategyCode {
  code: string;
  builtin: boolean;
}

export interface ValidateResult {
  ok: boolean;
  errors?: string[];
  stats?: BacktestStats;
}

export interface GenerateRequest {
  description: string;
  base_code?: string;
  model?: string;
  name?: string;
}

/** Whether the backend has AI authoring enabled (SDK installed + API key set). */
export async function getCapabilities(): Promise<{ ai: boolean }> {
  const res = await fetch(`${BASE}/capabilities`);
  if (!res.ok) throw new Error(`Backend error ${res.status}`);
  return res.json();
}

/** Live Claude model catalogue for the model picker. */
export async function listModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${BASE}/models`);
  if (!res.ok) throw new Error(`Backend error ${res.status}`);
  return (await res.json()).models as ModelInfo[];
}

export async function getStrategyCode(name: string): Promise<StrategyCode> {
  const res = await fetch(`${BASE}/strategy/${encodeURIComponent(name)}/code`);
  if (!res.ok) throw new Error(`Could not load ${name} (${res.status})`);
  return res.json();
}

export async function validateStrategy(code: string): Promise<ValidateResult> {
  const res = await fetch(`${BASE}/strategy/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
  return res.json();
}

export async function saveStrategy(name: string, code: string): Promise<{ ok: boolean; name?: string; errors?: string[] }> {
  const res = await fetch(`${BASE}/strategy/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, code })
  });
  return res.json();
}

// --- research: optimize + calibrate -----------------------------------------

export interface OptimizeRequest {
  symbol: string;
  timeframe: string;
  strategy: string;
  metric?: string;
  trials?: number;
  from?: number;
  to?: number;
  min_trades?: number;
}

export interface OptimizeResult {
  backend: string; // 'optuna' | 'random'
  metric: string;
  value: number;
  params: Record<string, number>;
  trials: number;
}

export async function optimizeStrategy(req: OptimizeRequest): Promise<OptimizeResult> {
  const res = await fetch(`${BASE}/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Optimize failed (${res.status})`);
  return data as OptimizeResult;
}

export interface CalibrateResult {
  ok: boolean;
  error?: string;
  best?: Record<string, number>;
  rows?: { params: Record<string, number>; coverage: number; density: number; events: number; score: number }[];
  labels?: number;
}

export async function calibrateDetectors(req: {
  symbol: string;
  timeframe: string;
  from?: number;
  to?: number;
}): Promise<CalibrateResult> {
  const res = await fetch(`${BASE}/calibrate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Calibrate failed (${res.status})`);
  return data as CalibrateResult;
}

/**
 * Stream a generated strategy. Calls `onText` with each chunk as it arrives;
 * resolves when the stream ends, rejects on an error event or transport failure.
 */
export async function generateStrategy(
  req: GenerateRequest,
  onText: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${BASE}/strategy/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal
  });
  if (!res.ok || !res.body) throw new Error(`Generation failed (${res.status})`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let error: string | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split('\n\n');
    buf = frames.pop() ?? ''; // keep the trailing partial frame
    for (const frame of frames) {
      let event = 'message';
      let data = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (event === 'error') error = JSON.parse(data || '{}').error || 'generation error';
      else if (event !== 'done' && data) {
        const t = JSON.parse(data).text;
        if (t) onText(t);
      }
    }
  }
  if (error) throw new Error(error);
}
