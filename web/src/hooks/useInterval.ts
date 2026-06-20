import { useEffect, useRef } from 'react';

/**
 * Declarative setInterval (Dan Abramov's pattern).
 *
 * - Pass `delay = null` to pause: no interval runs.
 * - The latest `callback` is kept in a ref, so changing the callback does NOT
 *   restart the timer; only changing `delay` re-creates it. That keeps the tick
 *   cadence stable while always calling the freshest action.
 *
 * @param callback fired on each tick
 * @param delay    ms between ticks, or null to pause
 */
export function useInterval(callback: () => void, delay: number | null): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}
