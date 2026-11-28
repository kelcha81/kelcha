'use client';

import { useEffect } from 'react';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { DashboardLoader } from '@/components/DashboardLoader';
import { Dashboard } from '@/components/Dashboard';
import { HomeDashboard } from '@/components/HomeDashboard';
import { SymbolPalette } from '@/components/SymbolPalette';

/**
 * App entry: shows the Home dashboard (Co-Pilot Live Boards + manual sessions)
 * by default, and the manual replay shell only once a manual session is opened.
 */
export function AppRoot() {
  const view = useWorkspaceStore((s) => s.view);
  const hasTabs = useWorkspaceStore((s) => s.tabs.length > 0);
  const goHome = useWorkspaceStore((s) => s.goHome);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const qs = new URLSearchParams(window.location.search);
    if (qs.has('radar') || qs.has('pair')) {
      goHome();
    }
  }, [goHome]);
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
