import { AppRoot } from '@/components/AppRoot';
import { AuthGate } from '@/components/AuthGate';
import { AccountBar } from '@/components/AccountBar';
import { SettingsSync } from '@/components/SettingsSync';
import { WorkspaceSync } from '@/components/WorkspaceSync';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0b0f14] text-slate-100">
      <AuthGate>
        <AccountBar />
        <SettingsSync />
        <WorkspaceSync />
        <AppRoot />
      </AuthGate>
    </main>
  );
}
