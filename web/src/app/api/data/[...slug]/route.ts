import { promises as fs } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

// Serve packaged candle files from public/data — which in the cloud is a GCS
// bucket mounted at /app/public/data. Next's standalone server only serves
// public/ files that existed at build time, so runtime-mounted files 404 if
// fetched as static /data/*. The client fetches candle JSON through here instead.
//
// Caching: monthly chunk files never change once their month is safely closed
// (the daily refresh Job finalizes a month's last bars just after it ends), so
// they get a year-long immutable cache. Everything that CAN change daily —
// manifest.json, the current month's chunk, whole <tf>.json aggregates — keeps
// a short TTL. A 72h grace window past month-end avoids ever pinning a
// truncated month in a browser cache.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASE = path.join(process.cwd(), 'public', 'data');
const MONTH_FILE = /(?:^|\/)(?:m1|m5|m15|h1)\/(\d{4})-(\d{2})\.json$/;
const GRACE_MS = 72 * 3_600_000;

function cacheControl(relPath: string): string {
  const m = MONTH_FILE.exec(relPath.replaceAll('\\', '/'));
  if (m) {
    const monthEnd = Date.UTC(Number(m[1]), Number(m[2]), 1); // first ms of the NEXT month
    if (Date.now() - monthEnd > GRACE_MS) return 'public, max-age=31536000, immutable';
  }
  return 'public, max-age=300';
}

export async function GET(req: Request, ctx: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await ctx.params;
  const rel = (slug ?? []).join('/');
  const target = path.normalize(path.join(BASE, ...(slug ?? [])));
  // Reject path traversal outside public/data.
  if (target !== BASE && !target.startsWith(BASE + path.sep)) {
    return new Response('Bad path', { status: 400 });
  }
  try {
    const buf = await fs.readFile(target);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': cacheControl(rel),
      Vary: 'Accept-Encoding'
    };
    // Candle JSON compresses ~6x; the standalone Next server doesn't compress
    // Response buffers itself. Skip tiny files (not worth the CPU).
    if (buf.length > 8192 && /\bgzip\b/.test(req.headers.get('accept-encoding') ?? '')) {
      headers['Content-Encoding'] = 'gzip';
      return new Response(new Uint8Array(gzipSync(buf)), { headers });
    }
    return new Response(new Uint8Array(buf), { headers });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
