import { getIdToken } from '@/lib/firebase';

// Client → web-server calls for Notion (the server holds the token and talks to
// the Notion API, which browsers can't call directly).

async function authed(path: string, init?: RequestInit) {
  const token = await getIdToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

export interface NotionStatus {
  connected: boolean;
  workspaceName: string | null;
  journalDbId: string | null;
  forecastDbId: string | null;
}

export const notionStatus = () => authed('/api/notion') as Promise<NotionStatus>;
export const notionConnect = (token: string) =>
  authed('/api/notion', { method: 'POST', body: JSON.stringify({ action: 'connect', token }) });
export const notionDisconnect = () =>
  authed('/api/notion', { method: 'POST', body: JSON.stringify({ action: 'disconnect' }) });
export const notionSaveConfig = (journalDbId: string, forecastDbId: string) =>
  authed('/api/notion', { method: 'POST', body: JSON.stringify({ action: 'config', journalDbId, forecastDbId }) });
export interface NotionContent {
  databases: { id: string; title: string }[];
  pages: number; // non-database objects visible to the integration (diagnostic)
}

export const notionListContent = () =>
  authed('/api/notion/databases').then((d) => ({ databases: d.databases ?? [], pages: d.pages ?? 0 }) as NotionContent);
export const notionJournal = (kind: 'journal' | 'forecast', title: string, markdown: string) =>
  authed('/api/notion/journal', { method: 'POST', body: JSON.stringify({ kind, title, markdown }) });
