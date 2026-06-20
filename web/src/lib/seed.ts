import type { Candle, Timeframe } from '@/store/replayStore';
import {
  putM1Chunk,
  putAggregate,
  putMeta,
  hasSymbol,
  SCHEMA_VERSION,
  type SymbolMeta
} from '@/lib/idb';

interface Manifest {
  symbol: string;
  pricePrecision: number;
  timeframes: Record<string, { chunks?: string[]; file?: string }>;
}

export interface SeedProgress {
  done: number;
  total: number;
  label: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url} (HTTP ${res.status})`);
  return res.json() as Promise<T>;
}

export function getManifest(symbol: string): Promise<Manifest> {
  return fetchJson<Manifest>(`/api/data/${symbol}/manifest.json`);
}

/**
 * Seed a symbol into IndexedDB if not already present: M1 stored as monthly
 * chunks (each written straight through — never holding the full series in
 * memory), aggregates stored whole, then a bounds/months meta record written
 * last (its presence = "seeded").
 */
export async function seedSymbol(
  symbol: string,
  onProgress?: (p: SeedProgress) => void
): Promise<void> {
  if (await hasSymbol(symbol)) return;

  const manifest = await getManifest(symbol);
  const m1Chunks = manifest.timeframes.m1.chunks ?? [];
  const aggTfs = (Object.keys(manifest.timeframes) as Timeframe[]).filter((tf) => tf !== 'm1');
  const total = m1Chunks.length + aggTfs.length;
  let done = 0;
  const tick = (label: string) => onProgress?.({ done: ++done, total, label });

  let minTs = Infinity;
  let maxTs = -Infinity;
  const months: string[] = [];

  for (const chunkPath of m1Chunks) {
    const part = await fetchJson<Candle[]>(`/api/data/${symbol}/${chunkPath}`);
    const month = chunkPath.replace('m1/', '').replace('.json', '');
    await putM1Chunk(symbol, month, part);
    months.push(month);
    if (part.length) {
      minTs = Math.min(minTs, part[0].timestamp);
      maxTs = Math.max(maxTs, part[part.length - 1].timestamp);
    }
    tick(`M1 ${month}`);
  }

  for (const tf of aggTfs) {
    const file = manifest.timeframes[tf]?.file;
    if (!file) continue;
    const arr = await fetchJson<Candle[]>(`/api/data/${symbol}/${file}`);
    await putAggregate(symbol, tf, arr);
    tick(tf.toUpperCase());
  }

  const meta: SymbolMeta = { symbol, minTs, maxTs, months, schemaVersion: SCHEMA_VERSION };
  await putMeta(meta);
}
