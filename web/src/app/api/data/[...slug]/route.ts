import { promises as fs } from 'node:fs';
import path from 'node:path';

// Serve packaged candle files from public/data — which in the cloud is a GCS
// bucket mounted at /app/public/data. Next's standalone server only serves
// public/ files that existed at build time, so runtime-mounted files 404 if
// fetched as static /data/*. The client fetches candle JSON through here instead.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASE = path.join(process.cwd(), 'public', 'data');

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await ctx.params;
  const target = path.normalize(path.join(BASE, ...(slug ?? [])));
  // Reject path traversal outside public/data.
  if (target !== BASE && !target.startsWith(BASE + path.sep)) {
    return new Response('Bad path', { status: 400 });
  }
  try {
    const buf = await fs.readFile(target);
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
      }
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
