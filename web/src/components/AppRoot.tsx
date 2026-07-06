'use client';

import { useWorkspaceStore } from '@/store/workspaceStore';
import { DashboardLoader } from '@/components/DashboardLoader';
import { Dashboard } from '@/components/Dashboard';
import { HomeDashboard } from '@/components/HomeDashboard';
import { SymbolPalette } from '@/components/SymbolPalette';

/**
 * App entry: shows the Home dashboard (session manager) by default, and the
 * trading session only once one is opened. Guards against rendering the trading
 * shell with no active tab (which would crash useActiveTab). The Ctrl+K symbol
 * palette mounts here so it works on Home and in sessions alike.
 */
export function AppRoot() {
  const view = useWorkspaceStore((s) => s.view);
  const hasTabs = useWorkspaceStore((s) => s.tabs.length > 0);
  return (
    <>
      <SymbolPalette />
      {view === 'home' || !hasTabs ? (
        <HomeDashboard />
      ) : (
        <DashboardLoader>
          <Dashboard />
        </DashboardLoader>
      )}
    </>
  );
}
