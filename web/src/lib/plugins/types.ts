import type { Chart } from 'klinecharts';
import type { PluginMeta } from '@/store/pluginStore';

export interface PluginContext {
  chart: Chart;
  container: HTMLElement;
  symbol: string;
}

/** Configurable numeric parameters (e.g. indicator calc periods). */
export interface PluginParamsSchema {
  defaults: number[];
  labels: string[];
}

/**
 * A chart plugin is a TypeScript module that attaches a real effect to the
 * KLineChart instance (an indicator, an overlay, or DOM). `attach` returns a
 * detach function that fully removes the effect. If `params` is defined, the
 * current values are passed to `attach` (e.g. as KLineChart `calcParams`).
 */
export interface ChartPlugin {
  meta: PluginMeta;
  defaultEnabled?: boolean;
  params?: PluginParamsSchema;
  /** Revision — bumped when a user plugin's code changes, to force re-attach. */
  rev?: number;
  attach: (ctx: PluginContext, params?: number[]) => () => void;
}
