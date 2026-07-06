import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SYMBOL_LIST } from '@/lib/symbols';

// Report which registry symbols are packaged (public/data/<sym>/manifest.json)
// and whether the packaged specs still match the registry (drift = the manifest
// predates the registry or was packaged with different precision/contract size,
// so backtests would price with stale specs until re-packaged).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface SymbolApiStatus {
  packaged: boolean;
  /** Only present when packaged: manifest instrument block matches the registry. */
  specsCurrent?: boolean;
}

export async function GET() {
  const base = path.join(process.cwd(), 'public', 'data');
  const symbols: Record<string, SymbolApiStatus> = {};
  await Promise.all(
    SYMBOL_LIST.map(async (s) => {
      try {
        const raw = await fs.readFile(path.join(base, s.symbol, 'manifest.json'), 'utf8');
        const m = JSON.parse(raw) as {
          pricePrecision?: number;
          instrument?: { contractSize?: number; pricePrecision?: number };
        };
        const specsCurrent =
          !!m.instrument &&
          m.instrument.contractSize === s.contractSize &&
          m.pricePrecision === s.pricePrecision;
        symbols[s.symbol] = { packaged: true, specsCurrent };
      } catch {
        symbols[s.symbol] = { packaged: false };
      }
    })
  );
  return NextResponse.json({ symbols });
}
