import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SYMBOL_LIST } from '@/lib/symbols';

// Report which registry symbols are packaged on disk (public/data/<sym>/manifest.json).
// Node runtime + dynamic: this touches the filesystem per-request.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const base = path.join(process.cwd(), 'public', 'data');
  const symbols: Record<string, { packaged: boolean }> = {};
  await Promise.all(
    SYMBOL_LIST.map(async (s) => {
      try {
        await fs.access(path.join(base, s.symbol, 'manifest.json'));
        symbols[s.symbol] = { packaged: true };
      } catch {
        symbols[s.symbol] = { packaged: false };
      }
    })
  );
  return NextResponse.json({ symbols });
}
