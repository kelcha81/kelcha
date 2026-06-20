import { DashboardLoader } from '@/components/DashboardLoader';
import { Dashboard } from '@/components/Dashboard';

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0b0f14] text-slate-100">
      <DashboardLoader>
        <Dashboard />
      </DashboardLoader>
    </main>
  );
}
