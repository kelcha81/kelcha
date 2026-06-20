import { useChartStore } from '@/store/chartStore';
import { useSettingsStore } from '@/store/settingsStore';

// Chart screenshots via KLineChart's getConvertPictureUrl — captures the rendered
// pane including overlays, drawings, and trade boxes, as a PNG data URL.

export function capturePane(paneId: string): string | null {
  const pc = useChartStore.getState().charts[paneId];
  if (!pc) return null;
  try {
    return pc.chart.getConvertPictureUrl(true, 'png', useSettingsStore.getState().theme.background);
  } catch {
    return null;
  }
}

/** Screenshot the currently focused chart pane, or null if none is mounted. */
export function captureActivePane(): string | null {
  const id = useChartStore.getState().activePaneId;
  return id ? capturePane(id) : null;
}
