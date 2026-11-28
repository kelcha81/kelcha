'use client';

import { CopilotNavShell } from '@/components/CopilotNavShell';
import { CopilotChatBody } from '@/components/CopilotChatDrawer';

export default function ChatPage() {
  return (
    <CopilotNavShell
      title="Co-Pilot Interactive Chat"
      subtitle="Multimodal Trading Twin backed by Vertex AI (co-pilot-516023), Living Constitution v2.2, and all 216+ indexed lessons & ASRs."
    >
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60 shadow-lg">
        <CopilotChatBody fullPage />
      </div>
    </CopilotNavShell>
  );
}
