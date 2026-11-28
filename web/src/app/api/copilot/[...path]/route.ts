import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/apiAuth';

export const runtime = 'nodejs';
export const maxDuration = 180;

const TWIN_BASE = (
  process.env.TWIN_API_URL || 'https://ict-trading-twin-gape75dzxq-nw.a.run.app'
).replace(/\/+$/, '');

const ALLOWED_GET = new Set(['health', 'cases', 'signals', 'proposals', 'playbook', 'hypotheses', 'metrics', 'live-candles', 'backtest-runs']);
const ALLOWED_POST = new Set(['ask', 'review', 'upload-lesson', 'hypotheses', 'signal-action', 'reload']);

async function forward(req: Request, pathSegs: string[], method: 'GET' | 'POST') {
  const admin = await requireAdmin(req);
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Unauthorized — allowlisted Co-Pilot account required.' }, { status: 401 });
  }

  const route = pathSegs.join('/');
  const allowed = method === 'GET' ? ALLOWED_GET : ALLOWED_POST;
  if (!allowed.has(route)) {
    return NextResponse.json({ ok: false, error: `Unsupported Co-Pilot route: ${route}` }, { status: 404 });
  }

  const secret = (process.env.TWIN_SECRET || '').trim();
  const inUrl = new URL(req.url);
  const targetUrl = `${TWIN_BASE}/${route}${inUrl.search}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'copilot-web-proxy/1.0',
  };
  if (secret) headers['X-Twin-Token'] = secret;

  try {
    const body = method === 'POST' ? await req.text() : undefined;
    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
      cache: 'no-store',
    });
    const text = await upstream.text();
    try {
      const json = JSON.parse(text);
      return NextResponse.json(json, { status: upstream.status });
    } catch {
      return NextResponse.json(
        { ok: false, error: text.slice(0, 400) || `Upstream HTTP ${upstream.status}` },
        { status: upstream.status }
      );
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to reach Trading Twin service.' },
      { status: 502 }
    );
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, path, 'GET');
}

export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return forward(req, path, 'POST');
}
