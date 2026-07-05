import { registerIndicator, type IndicatorDrawParams } from 'klinecharts';
import { useIctStore } from '@/store/ictStore';
import { minuteOfDay } from '@/lib/timezone';
import { getCanvasFont } from '@/lib/fonts';

// ICT Killzones & Pivots — a custom main-pane indicator (port of the original
// forex-replay-app plugin / TradingView [TFO] indicator). The draw callback (the
// KLineChart equivalent of Pine's box.new/line.new) renders session boxes and
// high/low pivot lines (extend-until-mitigated) from the candle data + a
// timezone config. Replay-aware: draw recomputes from the head-cut data.

let registered = false;
const ICT_NAME = 'ICT';

interface Instance {
  startIdx: number;
  endIdx: number;
  high: number;
  low: number;
}

function parseSession(s: string): { start: number; end: number; overnight: boolean } | null {
  const m = /^(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const start = +m[1] * 60 + +m[2];
  let end = +m[3] * 60 + +m[4];
  if (end === 0) end = 1440; // midnight = end of day
  return { start, end, overnight: end <= start };
}

function inSession(min: number, s: { start: number; end: number; overnight: boolean }): boolean {
  return s.overnight ? min >= s.start || min < s.end : min >= s.start && min < s.end;
}

function hexAlpha(hex: string, a: number): string {
  if (!hex.startsWith('#')) return hex;
  const h = hex.slice(1);
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function draw({ ctx, kLineDataList, xAxis, yAxis }: IndicatorDrawParams): boolean {
  const data = kLineDataList;
  const cfg = useIctStore.getState();
  if (data.length === 0) return true;
  const last = data.length - 1;

  ctx.save();
  ctx.font = `11px ${getCanvasFont()}`;
  ctx.textBaseline = 'middle';

  for (const kz of cfg.killzones) {
    if (!kz.enabled) continue;
    const sess = parseSession(kz.session);
    if (!sess) continue;

    // Group consecutive in-session bars into session instances.
    const instances: Instance[] = [];
    let cur: Instance | null = null;
    for (let i = 0; i < data.length; i++) {
      const c = data[i];
      if (inSession(minuteOfDay(c.timestamp, cfg.timezone), sess)) {
        if (!cur) cur = { startIdx: i, endIdx: i, high: c.high, low: c.low };
        else {
          cur.endIdx = i;
          cur.high = Math.max(cur.high, c.high);
          cur.low = Math.min(cur.low, c.low);
        }
      } else if (cur) {
        instances.push(cur);
        cur = null;
      }
    }
    if (cur) instances.push(cur);

    for (const inst of instances.slice(-cfg.maxSessions)) {
      const x1 = xAxis.convertToPixel(inst.startIdx);
      const x2 = xAxis.convertToPixel(inst.endIdx);
      const yTop = yAxis.convertToPixel(inst.high);
      const yBot = yAxis.convertToPixel(inst.low);

      if (cfg.showBoxes) {
        ctx.fillStyle = hexAlpha(kz.color, 0.12);
        ctx.fillRect(x1, yTop, Math.max(1, x2 - x1), yBot - yTop);
        ctx.strokeStyle = hexAlpha(kz.color, 0.6);
        ctx.lineWidth = 1;
        ctx.strokeRect(x1, yTop, Math.max(1, x2 - x1), yBot - yTop);
        if (cfg.showText) {
          ctx.fillStyle = kz.color;
          ctx.textAlign = 'center';
          ctx.fillText(kz.label, (x1 + x2) / 2, yTop - 8);
        }
      }

      if (cfg.showPivots) {
        // Mitigation: first bar after the session that trades through the level.
        let hiEnd = last;
        let loEnd = last;
        for (let i = inst.endIdx + 1; i <= last; i++) {
          if (hiEnd === last && data[i].high > inst.high) hiEnd = i;
          if (loEnd === last && data[i].low < inst.low) loEnd = i;
          if (hiEnd < last && loEnd < last) break;
        }
        ctx.strokeStyle = kz.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1, yTop);
        ctx.lineTo(xAxis.convertToPixel(hiEnd), yTop);
        ctx.moveTo(x1, yBot);
        ctx.lineTo(xAxis.convertToPixel(loEnd), yBot);
        ctx.stroke();
        if (cfg.showLabels) {
          ctx.fillStyle = kz.color;
          ctx.textAlign = 'left';
          ctx.fillText(`${kz.label}.H`, xAxis.convertToPixel(hiEnd) + 3, yTop);
          ctx.fillText(`${kz.label}.L`, xAxis.convertToPixel(loEnd) + 3, yBot);
        }
      }
    }
  }

  ctx.restore();
  return true;
}

export function registerICT(): void {
  if (registered) return;
  registered = true;
  registerIndicator({
    name: ICT_NAME,
    shortName: 'ICT Killzones',
    figures: [],
    calc: (dataList) => dataList.map(() => ({})),
    draw
  });
}

export { ICT_NAME };
