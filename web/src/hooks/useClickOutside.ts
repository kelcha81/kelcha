import { useEffect, useRef, type RefObject } from 'react';

/**
 * Calls `onClose` when a mousedown occurs outside `ref` (while `enabled`).
 * The callback is read from a ref so the listener isn't re-subscribed each render.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  onClose: () => void
): void {
  const cb = useRef(onClose);
  cb.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb.current();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [enabled, ref]);
}
