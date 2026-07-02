import { NextResponse } from 'next/server';
import { requireUid, getNotionConfig, notionDatabases } from '@/lib/notionServer';

// List databases the user's Notion integration can access (for the DB pickers).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const c = await getNotionConfig(uid);
  if (!c.token) return NextResponse.json({ databases: [] });
  try {
    return NextResponse.json({ databases: await notionDatabases(c.token) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'notion error' }, { status: 400 });
  }
}
