import { DashboardLoader } from '@/components/DashboardLoader';
import { Dashboard } from '@/components/Dashboard';
import { AuthProvider } from '@/lib/auth';
import { AuthGate } from '@/components/AuthGate';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0b0f14] text-slate-100">
      <AuthProvider>
        <AuthGate>
          <DashboardLoader>
            <Dashboard />
          </DashboardLoader>
        </AuthGate>
      </AuthProvider>
    </main>
  );
}
