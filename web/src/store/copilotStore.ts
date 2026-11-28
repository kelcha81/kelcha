import { create } from 'zustand';
import type { AskAnswer, ReviewResult } from '@/lib/copilotApi';

export interface ChatContextChip {
  kind: string;
  label: string;
  symbol?: string;
  timeframe?: string;
  caseId?: string;
  tradeId?: string;
  summary?: string;
}

export interface CopilotChatMsg {
  id: string;
  role: 'user' | 'assistant';
  mode: 'ask' | 'review';
  text: string;
  imagePreview?: string;
  contextChip?: ChatContextChip | null;
  askAnswer?: AskAnswer;
  reviewResult?: ReviewResult;
  elapsedMs?: number;
  createdAt: number;
}

interface CopilotStoreState {
  drawerOpen: boolean;
  mode: 'ask' | 'review';
  contextChip: ChatContextChip | null;
  messages: CopilotChatMsg[];
  openDrawer: (opts?: { context?: ChatContextChip | null; mode?: 'ask' | 'review'; prefill?: string }) => void;
  closeDrawer: () => void;
  setMode: (mode: 'ask' | 'review') => void;
  setContextChip: (chip: ChatContextChip | null) => void;
  draftInput: string;
  setDraftInput: (text: string) => void;
  addMessage: (msg: CopilotChatMsg) => void;
  clearMessages: () => void;
}

export const useCopilotStore = create<CopilotStoreState>((set) => ({
  drawerOpen: false,
  mode: 'ask',
  contextChip: null,
  draftInput: '',
  messages: [],
  openDrawer: (opts) =>
    set((s) => ({
      drawerOpen: true,
      contextChip: opts?.context !== undefined ? opts.context : s.contextChip,
      mode: opts?.mode ?? s.mode,
      draftInput: opts?.prefill !== undefined ? opts.prefill : s.draftInput,
    })),
  closeDrawer: () => set({ drawerOpen: false }),
  setMode: (mode) => set({ mode }),
  setContextChip: (contextChip) => set({ contextChip }),
  setDraftInput: (draftInput) => set({ draftInput }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages.slice(-40), msg] })),
  clearMessages: () => set({ messages: [] }),
}));
