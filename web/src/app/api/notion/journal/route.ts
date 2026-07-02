import { NextResponse } from 'next/server';
import { requireUid, getNotionConfig, notionCreatePage } from '@/lib/notionServer';

// Create a Notion page (journal ASR or forecast) in the user's chosen database.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { kind, title, markdown } = await req.json().catch(() => ({}));
  if (!title || typeof markdown !== 'string') {
    return NextResponse.json({ error: 'title and markdown required' }, { status: 400 });
  }
  const c = await getNotionConfig(uid);
  if (!c.token) return NextResponse.json({ error: 'Notion is not connected' }, { status: 400 });
  const dbId = kind === 'forecast' ? c.forecastDbId : c.journalDbId;
  if (!dbId) {
    return NextResponse.json(
      { error: `Pick a Notion database for ${kind === 'forecast' ? 'forecasts' : 'journal entries'} in Settings` },
      { status: 400 }
    );
  }
  try {
    const pageId = await notionCreatePage(c.token, dbId, title, markdown);
    return NextResponse.json({ ok: true, pageId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'notion error' }, { status: 400 });
  }
}
