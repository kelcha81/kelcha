import { AppRoot } from '@/components/AppRoot';
import { AuthGate } from '@/components/AuthGate';
import { WorkspaceSync } from '@/components/WorkspaceSync';
import { DrawingsSync } from '@/components/DrawingsSync';

export default function Home() {
  return (
    <main className="flex min-h-0 flex-1 flex-col bg-[#0b0f14] text-slate-100">
      <AuthGate>
        <WorkspaceSync />
        <DrawingsSync />
        <AppRoot />
      </AuthGate>
    </main>
  );
}
