import { DashboardLoader } from '@/components/DashboardLoader';
import { Dashboard } from '@/components/Dashboard';
import { AuthGate } from '@/components/AuthGate';
import { AccountBar } from '@/components/AccountBar';
import { SettingsSync } from '@/components/SettingsSync';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0b0f14] text-slate-100">
      <AuthGate>
        <AccountBar />
        <SettingsSync />
        <DashboardLoader>
          <Dashboard />
        </DashboardLoader>
      </AuthGate>
    </main>
  );
}
