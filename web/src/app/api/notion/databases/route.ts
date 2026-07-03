import { NextResponse } from 'next/server';
import { requireUid, getNotionConfig, notionContent } from '@/lib/notionServer';

// List content the user's Notion integration can access: databases (for the
// DB pickers) + a page count (diagnostic — "connected but nothing shared").
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const c = await getNotionConfig(uid);
  if (!c.token) return NextResponse.json({ databases: [], pages: 0 });
  try {
    return NextResponse.json(await notionContent(c.token));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'notion error' }, { status: 400 });
  }
}
