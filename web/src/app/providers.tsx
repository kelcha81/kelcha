'use client';

import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/lib/auth';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ConfirmHost } from '@/components/ui/confirm';
import { ShortcutHelp } from '@/components/ShortcutHelp';
import { CopilotChatDrawer } from '@/components/CopilotChatDrawer';
import { GlobalNavBar } from '@/components/GlobalNavBar';
import { SettingsSync } from '@/components/SettingsSync';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <TooltipProvider>
        <div className="flex min-h-screen flex-col bg-[#0b0f14] text-slate-100">
          <GlobalNavBar />
          <SettingsSync />
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
        <CopilotChatDrawer />
        <ConfirmHost />
        <ShortcutHelp />
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{ style: { background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' } }}
          style={{ zIndex: 'var(--z-toast)' } as React.CSSProperties}
        />
      </TooltipProvider>
    </AuthProvider>
  );
}
