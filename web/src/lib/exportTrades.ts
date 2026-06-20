import type { Trade } from '@/store/tradingStore';

function download(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const COLUMNS = [
  'id',
  'side',
  'size',
  'entryTime',
  'entryPrice',
  'exitTime',
  'exitPrice',
  'pnl',
  'risk',
  'reason',
  'note',
  'tags'
] as const;

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

export function exportTradesCSV(symbol: string, trades: Trade[]): void {
  const rows = trades.map((t) =>
    [
      t.id,
      t.side,
      t.size,
      new Date(t.entryTime).toISOString(),
      t.entryPrice,
      new Date(t.exitTime).toISOString(),
      t.exitPrice,
      t.pnl,
      t.risk ?? '',
      t.reason,
      q(t.note ?? ''),
      q(t.tags ?? '')
    ].join(',')
  );
  download(`${symbol}-trades.csv`, [COLUMNS.join(','), ...rows].join('\n'), 'text/csv');
}

export function exportTradesJSON(symbol: string, trades: Trade[]): void {
  download(`${symbol}-trades.json`, JSON.stringify(trades, null, 2), 'application/json');
}
