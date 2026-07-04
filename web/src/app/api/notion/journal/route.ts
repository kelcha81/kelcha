import { NextResponse } from 'next/server';
import { requireUid, getNotionConfig, notionCreatePage, type NotionImage } from '@/lib/notionServer';

// Create a Notion page (journal ASR or forecast) in the user's chosen database,
// uploading chart captures via Notion's File Upload API.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMAGES = 12;
const MAX_DATA_URL = 6 * 1024 * 1024; // ~4.5MB decoded per capture — plenty for chart PNGs

function sanitizeImages(raw: unknown): NotionImage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_IMAGES)
    .filter(
      (i): i is NotionImage =>
        !!i &&
        typeof i.name === 'string' &&
        typeof i.dataUrl === 'string' &&
        i.dataUrl.length <= MAX_DATA_URL &&
        /^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(i.dataUrl)
    )
    .map((i) => ({ name: i.name.slice(0, 100), dataUrl: i.dataUrl, caption: typeof i.caption === 'string' ? i.caption.slice(0, 500) : undefined }));
}

export async function POST(req: Request) {
  const uid = await requireUid(req);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { kind, title, markdown, images } = await req.json().catch(() => ({}));
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
    const pageId = await notionCreatePage(c.token, dbId, title, markdown, sanitizeImages(images));
    return NextResponse.json({ ok: true, pageId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'notion error' }, { status: 400 });
  }
}
