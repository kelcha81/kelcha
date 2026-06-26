'use client';

// Browser-side Obsidian vault access via the File System Access API. Replaces the
// old server-fs /api/obsidian route, which can't run in the cloud. The granted
// directory handle is persisted in IndexedDB (handles are structured-cloneable;
// they cannot go in localStorage). Chromium desktop only — callers should check
// isFsaSupported() and fall back to the Firestore copy elsewhere.

import { useEffect, useState } from 'react';
import { openDB } from 'idb';

type Perm = 'granted' | 'denied' | 'prompt';
type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?(d: { mode: 'read' | 'readwrite' }): Promise<Perm>;
  requestPermission?(d: { mode: 'read' | 'readwrite' }): Promise<Perm>;
  entries?(): AsyncIterableIterator<[string, FileSystemHandle]>;
};

const DB = 'forex-vault';
const STORE = 'handles';
const KEY = 'vault';

export function isFsaSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

const store = () => openDB(DB, 1, { upgrade: (db) => db.createObjectStore(STORE) });

export async function getVaultHandle(): Promise<DirHandle | null> {
  if (!isFsaSupported()) return null;
  return ((await (await store()).get(STORE, KEY)) as DirHandle | undefined) ?? null;
}

export async function pickVault(): Promise<DirHandle> {
  const handle = (await (window as unknown as {
    showDirectoryPicker(o?: { mode?: 'read' | 'readwrite' }): Promise<DirHandle>;
  }).showDirectoryPicker({ mode: 'readwrite' }));
  await (await store()).put(STORE, handle, KEY);
  return handle;
}

export async function clearVault(): Promise<void> {
  await (await store()).delete(STORE, KEY);
}

async function permission(h: DirHandle, mode: 'read' | 'readwrite', prompt: boolean): Promise<boolean> {
  if (!h.queryPermission) return true; // older impl without the permission API
  if ((await h.queryPermission({ mode })) === 'granted') return true;
  if (!prompt || !h.requestPermission) return false;
  return (await h.requestPermission({ mode })) === 'granted';
}

/** Re-grant the stored handle (must be called from a user gesture). */
export async function reconnect(): Promise<boolean> {
  const h = await getVaultHandle();
  if (!h) return false;
  return permission(h, 'readwrite', true);
}

/** Walk/create a vault-relative folder path ("Trades/Backtesting"). */
async function getDir(root: DirHandle, rel: string, create: boolean): Promise<FileSystemDirectoryHandle> {
  let dir: FileSystemDirectoryHandle = root;
  for (const part of rel.split('/').filter(Boolean)) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return dir;
}

async function writeFile(dir: FileSystemDirectoryHandle, name: string, data: string | BufferSource): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

function dataUrlToBytes(dataUrl: string): Uint8Array<ArrayBuffer> {
  const b64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Write a note + its base64 PNG attachments into a vault folder (mirrors the old POST). */
export async function writeNote(
  folder: string,
  filename: string,
  markdown: string,
  images?: { name: string; dataUrl: string }[]
): Promise<void> {
  const root = await getVaultHandle();
  if (!root) throw new Error('No Obsidian vault connected.');
  if (!(await permission(root, 'readwrite', true))) throw new Error('Vault write permission was not granted.');
  const dir = await getDir(root, folder, true);
  await writeFile(dir, filename, markdown);
  if (images?.length) {
    const att = await dir.getDirectoryHandle('attachments', { create: true });
    for (const img of images) {
      if (img?.name && typeof img.dataUrl === 'string') await writeFile(att, img.name, dataUrlToBytes(img.dataUrl));
    }
  }
}

/** List `.md` files in a vault folder (read-only; never prompts). */
export async function listNotes(folder: string): Promise<string[]> {
  const root = await getVaultHandle();
  if (!root || !(await permission(root, 'read', false))) return [];
  try {
    const dir = (await getDir(root, folder, false)) as DirHandle;
    const out: string[] = [];
    if (dir.entries) {
      for await (const [name, h] of dir.entries()) {
        if (h.kind === 'file' && name.toLowerCase().endsWith('.md')) out.push(name);
      }
    }
    return out.sort();
  } catch {
    return [];
  }
}

async function readFileText(root: DirHandle, folder: string, name: string): Promise<string | null> {
  if (!(await permission(root, 'read', false))) return null;
  try {
    const dir = await getDir(root, folder, false);
    const fh = await dir.getFileHandle(name);
    return (await fh.getFile()).text();
  } catch {
    return null;
  }
}

export async function readNote(folder: string, name: string): Promise<string | null> {
  const root = await getVaultHandle();
  return root ? readFileText(root, folder, name) : null;
}

export async function readTemplate(templatesFolder: string, file: string): Promise<string | null> {
  const root = await getVaultHandle();
  return root ? readFileText(root, templatesFolder, file) : null;
}

/** React hook: tracks whether a vault is connected (handle present + permission granted). */
export function useVault() {
  const [handle, setHandle] = useState<DirHandle | null>(null);
  const [ready, setReady] = useState(false);
  const supported = isFsaSupported();

  useEffect(() => {
    let live = true;
    (async () => {
      const h = await getVaultHandle();
      const ok = h ? await permission(h, 'readwrite', false) : false;
      if (live) {
        setHandle(ok ? h : null);
        setReady(true);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  // Re-grant the saved handle if possible, else pick a new folder. Must be from a click.
  const connect = async () => {
    if (await reconnect()) {
      setHandle(await getVaultHandle());
      return;
    }
    setHandle(await pickVault());
  };
  const disconnect = async () => {
    await clearVault();
    setHandle(null);
  };

  return { connected: !!handle, name: handle?.name ?? null, supported, ready, connect, disconnect };
}
