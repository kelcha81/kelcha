import { describe, it, expect } from 'vitest';
import { monthsInRange, monthOfUTC, resolveRequests, isRecordFresh, type ManifestTf } from '@/lib/candleSource';

const ts = (s: string) => Date.parse(s);

describe('monthsInRange', () => {
  it('covers every overlapping UTC month, including year boundaries', () => {
    expect(monthsInRange(ts('2023-11-15T00:00:00Z'), ts('2024-02-10T00:00:00Z'))).toEqual([
      '2023-11',
      '2023-12',
      '2024-01',
      '2024-02'
    ]);
  });

  it('single month when the range fits inside one', () => {
    expect(monthsInRange(ts('2024-03-05T00:00:00Z'), ts('2024-03-20T00:00:00Z'))).toEqual(['2024-03']);
  });
});

describe('resolveRequests', () => {
  const mtf: ManifestTf = {
    file: 'm5.json',
    chunks: ['m5/2024-01.json', 'm5/2024-02.json', 'm5/2024-04.json'] // 2024-03 missing (gap)
  };

  it('prefers chunks, returns only months that exist', () => {
    const reqs = resolveRequests(ts('2024-01-20T00:00:00Z'), ts('2024-04-05T00:00:00Z'), mtf);
    expect(reqs).toEqual([
      { kind: 'chunk', month: '2024-01', path: 'm5/2024-01.json' },
      { kind: 'chunk', month: '2024-02', path: 'm5/2024-02.json' },
      { kind: 'chunk', month: '2024-04', path: 'm5/2024-04.json' }
    ]);
  });

  it('falls back to the whole file when there are no chunks (old manifests)', () => {
    expect(resolveRequests(0, 1, { file: 'h4.json' })).toEqual([{ kind: 'whole', path: 'h4.json' }]);
  });

  it('returns nothing for an unpackaged timeframe', () => {
    expect(resolveRequests(0, 1, undefined)).toEqual([]);
  });

  it('handles a w1/mo1-style period spanning two UTC months (multi-chunk)', () => {
    // NY-calendar month periods can start in the prior UTC month (Sun 5pm NY).
    const reqs = resolveRequests(ts('2024-01-31T22:00:00Z'), ts('2024-02-02T00:00:00Z'), mtf);
    expect(reqs.map((r) => (r.kind === 'chunk' ? r.month : 'whole'))).toEqual(['2024-01', '2024-02']);
  });
});

describe('isRecordFresh (truncated-month rule)', () => {
  const juneMid = ts('2025-06-15T12:00:00Z');
  const julyMid = ts('2025-07-10T12:00:00Z');

  it('never fetched → stale', () => {
    expect(isRecordFresh('2025-06', undefined, juneMid)).toBe(false);
  });

  it('chunk fetched AFTER its month closed → final forever', () => {
    // May chunk fetched in June: data beyond May existed → complete.
    expect(isRecordFresh('2025-05', juneMid, julyMid)).toBe(true);
  });

  it('a "closed" month cached while it was still hot is NOT trusted', () => {
    // June chunk cached mid-June (truncated). In July the month is closed but
    // the cached copy is missing June's tail → must refetch.
    expect(isRecordFresh('2025-06', juneMid, julyMid)).toBe(false);
  });

  it('hot chunk fresh only while dataMax has not advanced', () => {
    expect(isRecordFresh('2025-06', juneMid, juneMid)).toBe(true);
    expect(isRecordFresh('2025-06', juneMid, juneMid + 86_400_000)).toBe(false);
  });

  it('whole files (month=null) are fresh only while dataMax has not advanced', () => {
    expect(isRecordFresh(null, julyMid, julyMid)).toBe(true);
    expect(isRecordFresh(null, juneMid, julyMid)).toBe(false);
  });
});

describe('monthOfUTC', () => {
  it('is UTC-based', () => {
    expect(monthOfUTC(ts('2024-01-31T23:59:00Z'))).toBe('2024-01');
    expect(monthOfUTC(ts('2024-02-01T00:00:00Z'))).toBe('2024-02');
  });
});
