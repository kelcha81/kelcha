import type { ChartPlugin, PluginParamsSchema } from './types';
import { getCanvasFont } from '@/lib/fonts';

// Built-in plugins backed by real KLineChart APIs so toggling visibly changes
// the chart. Indicators accept configurable calc params.

/** Faint symbol watermark drawn over the chart container (DOM overlay). */
const watermark: ChartPlugin = {
  meta: {
    id: 'watermark',
    name: 'Symbol Watermark',
    type: 'overlay',
    description: 'Faint symbol label over the chart.'
  },
  defaultEnabled: true,
  attach: ({ container, symbol }) => {
    const el = document.createElement('div');
    el.textContent = symbol.toUpperCase();
    el.style.cssText = [
      'position:absolute',
      'inset:0',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'pointer-events:none',
      `font:800 84px ${getCanvasFont()}`,
      'letter-spacing:4px',
      'color:rgba(154,167,180,0.06)',
      'z-index:2',
      'user-select:none'
    ].join(';');
    container.appendChild(el);
    return () => el.remove();
  }
};

/**
 * Build a plugin backed by a KLineChart built-in indicator with configurable
 * calc params.
 * @param mainPane true => overlay on the candle pane; false => its own sub-pane.
 */
function indicatorPlugin(
  id: string,
  name: string,
  indicatorName: string,
  opts: { mainPane?: boolean; description?: string; params: PluginParamsSchema }
): ChartPlugin {
  const { mainPane = false, description, params } = opts;
  return {
    meta: { id, name, type: 'indicator', description },
    params,
    attach: ({ chart }, calcParams) => {
      const paneId = chart.createIndicator(
        { name: indicatorName, calcParams: calcParams ?? params.defaults },
        mainPane, // stack on the candle pane when it's a main-pane overlay
        mainPane ? { id: 'candle_pane' } : undefined
      );
      return () => {
        if (!paneId) return;
        if (mainPane) chart.removeIndicator(paneId, indicatorName);
        else chart.removeIndicator(paneId);
      };
    }
  };
}

export const BUILTIN_PLUGINS: ChartPlugin[] = [
  watermark,
  // Overlays on price
  indicatorPlugin('ma', 'MA', 'MA', {
    mainPane: true,
    description: 'Simple moving averages.',
    params: { defaults: [5, 10, 30, 60], labels: ['MA1', 'MA2', 'MA3', 'MA4'] }
  }),
  indicatorPlugin('ema', 'EMA', 'EMA', {
    mainPane: true,
    description: 'Exponential moving averages.',
    params: { defaults: [6, 12, 20], labels: ['EMA1', 'EMA2', 'EMA3'] }
  }),
  indicatorPlugin('boll', 'Bollinger', 'BOLL', {
    mainPane: true,
    description: 'Bollinger Bands.',
    params: { defaults: [20, 2], labels: ['Length', 'StdDev'] }
  }),
  // Sub-panes
  indicatorPlugin('vol', 'Volume', 'VOL', {
    description: 'Volume.',
    params: { defaults: [5, 10], labels: ['MA1', 'MA2'] }
  }),
  indicatorPlugin('macd', 'MACD', 'MACD', {
    description: 'MACD.',
    params: { defaults: [12, 26, 9], labels: ['Short', 'Long', 'Signal'] }
  }),
  indicatorPlugin('rsi', 'RSI', 'RSI', {
    description: 'Relative Strength Index.',
    params: { defaults: [6, 12, 24], labels: ['RSI1', 'RSI2', 'RSI3'] }
  }),
  indicatorPlugin('kdj', 'KDJ', 'KDJ', {
    description: 'Stochastic KDJ.',
    params: { defaults: [9, 3, 3], labels: ['K', 'D', 'J'] }
  })
];
