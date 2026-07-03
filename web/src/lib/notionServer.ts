import { adminDb } from '@/lib/firebaseAdmin';

// Server-side Notion integration (approach A: per-user internal-integration
// token). Notion's API blocks browser CORS, so all calls go through the web
// server. The token is stored per-user in Firestore via the Admin SDK and never
// returned to the client.

const NOTION_VERSION = '2022-06-28';

// Shared route auth lives in lib/apiAuth; re-exported for the /api/notion routes.
export { requireUid } from '@/lib/apiAuth';

export interface NotionConfig {
  token?: string;
  workspaceName?: string;
  journalDbId?: string;
  forecastDbId?: string;
}

const ref = (uid: string) => adminDb().doc(`users/${uid}/private/notion`);

export async function getNotionConfig(uid: string): Promise<NotionConfig> {
  const snap = await ref(uid).get();
  return (snap.exists ? snap.data() : {}) as NotionConfig;
}
export async function setNotionConfig(uid: string, patch: Partial<NotionConfig>): Promise<void> {
  await ref(uid).set(patch, { merge: true });
}

async function notion(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Notion API error ${res.status}`);
  return data;
}

/** Validate a token; returns the workspace/bot name. */
export async function notionMe(token: string): Promise<string> {
  const me = await notion(token, 'users/me');
  return me?.bot?.workspace_name || me?.name || 'Notion';
}

export interface NotionContent {
  databases: { id: string; title: string }[];
  /** Non-database objects (pages) the integration can see — diagnostic: an
   *  internal integration only "sees" content explicitly shared with it. */
  pages: number;
}

export async function notionContent(token: string): Promise<NotionContent> {
  // Unfiltered search, partitioned server-side: distinguishes "nothing is
  // shared with the integration" from "pages are shared but no database is".
  const data = await notion(token, 'search', {
    method: 'POST',
    body: JSON.stringify({ page_size: 100 })
  });
  const results = (data.results || []) as Array<{ object: string; id: string; title?: { plain_text?: string }[] }>;
  return {
    databases: results
      .filter((r) => r.object === 'database')
      .map((d) => ({ id: d.id, title: (d.title || []).map((t) => t.plain_text || '').join('') || '(untitled)' })),
    pages: results.filter((r) => r.object !== 'database').length
  };
}

async function titleProperty(token: string, dbId: string): Promise<string> {
  const db = await notion(token, `databases/${dbId}`);
  for (const [name, p] of Object.entries(db.properties || {})) {
    if ((p as { type?: string }).type === 'title') return name;
  }
  return 'Name';
}

/** Minimal markdown → Notion blocks (headings, bullets, paragraphs; images skipped). */
function toBlocks(markdown: string) {
  const rt = (s: string) => [{ type: 'text', text: { content: s.slice(0, 1900) } }];
  const blocks: unknown[] = [];
  for (const raw of markdown.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || /^!\[/.test(line.trim())) continue; // skip blanks + image embeds
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^###\s+(.*)/))) blocks.push({ object: 'block', type: 'heading_3', heading_3: { rich_text: rt(m[1]) } });
    else if ((m = line.match(/^##\s+(.*)/))) blocks.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: rt(m[1]) } });
    else if ((m = line.match(/^#\s+(.*)/))) blocks.push({ object: 'block', type: 'heading_1', heading_1: { rich_text: rt(m[1]) } });
    else if ((m = line.match(/^[-*]\s+(.*)/))) blocks.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: rt(m[1]) } });
    else blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: rt(line) } });
    if (blocks.length >= 95) break; // Notion caps children at 100 per create
  }
  return blocks;
}

export async function notionCreatePage(token: string, dbId: string, title: string, markdown: string): Promise<string> {
  const titleName = await titleProperty(token, dbId);
  const page = await notion(token, 'pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: { [titleName]: { title: [{ text: { content: title.slice(0, 1900) } }] } },
      children: toBlocks(markdown)
    })
  });
  return page.id;
}
