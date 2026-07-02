import { NextResponse } from 'next/server';
import { requireUid, getNotionConfig, setNotionConfig, notionMe } from '@/lib/notionServer';

// Notion connection status + connect/config/disconnect. Token is validated then
// stored server-side (never returned to the client).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const c = await getNotionConfig(uid);
  return NextResponse.json({
    connected: !!c.token,
    workspaceName: c.workspaceName ?? null,
    journalDbId: c.journalDbId ?? null,
    forecastDbId: c.forecastDbId ?? null
  });
}

export async function POST(req: Request) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === 'connect') {
      const token = String(body.token || '').trim();
      if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });
      const workspaceName = await notionMe(token); // validates the token
      await setNotionConfig(uid, { token, workspaceName });
      return NextResponse.json({ connected: true, workspaceName });
    }
    if (body.action === 'config') {
      await setNotionConfig(uid, { journalDbId: body.journalDbId ?? '', forecastDbId: body.forecastDbId ?? '' });
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'disconnect') {
      await setNotionConfig(uid, { token: '', workspaceName: '', journalDbId: '', forecastDbId: '' });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'notion error' }, { status: 400 });
  }
}
