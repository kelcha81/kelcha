import type { UserPlugin } from '@/store/userPluginsStore';
import type { ChartPlugin, PluginContext } from './types';

/**
 * Compile a user plugin's source into a ChartPlugin. The code is the body of an
 * `attach(ctx)` function and should return a cleanup function. It runs with app
 * privileges (acceptable for a personal, single-user tool — the user authors it
 * themselves); a worker/iframe sandbox is a future hardening. Errors are caught
 * so a broken plugin can never crash the app.
 */
export function compileUserPlugin(up: UserPlugin): ChartPlugin {
  return {
    meta: { id: up.id, name: up.name, type: 'custom', description: 'User plugin' },
    rev: up.rev,
    attach: (ctx: PluginContext) => {
      try {
        const fn = new Function('ctx', up.code) as (ctx: PluginContext) => unknown;
        const cleanup = fn(ctx);
        return typeof cleanup === 'function' ? (cleanup as () => void) : () => {};
      } catch (err) {
        console.error(`Plugin "${up.name}" failed to attach:`, err);
        return () => {};
      }
    }
  };
}
