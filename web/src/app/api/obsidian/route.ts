import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Local Obsidian vault writer. Runs server-side (Node) so it can read the user's
// Backtesting ASR template and write notes + screenshots straight into the vault
// folder. The obsidian-ai-agents plugin's parser then picks the note up as a
// closed Backtest trade — no MCP required for this path.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Resolve `parts` under `base`, rejecting any path that escapes the vault. */
function safeJoin(base: string, ...parts: string[]): string {
  const baseResolved = path.resolve(base);
  const p = path.resolve(baseResolved, ...parts);
  if (p !== baseResolved && !p.startsWith(baseResolved + path.sep)) {
    throw new Error('Path escapes the vault');
  }
  return p;
}

// GET supports three reads, distinguished by query params:
//  • ?vault=&folder=&list=1            → { notes: string[] } markdown files in folder
//  • ?vault=&folder=&note=<file>       → { content } of one note (for md → form editing)
//  • ?vault=&templates=&file=          → { template } (defaults to the Backtest ASR template)
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const vault = url.searchParams.get('vault') ?? '';
  if (!vault) return NextResponse.json({ error: 'vault required' }, { status: 400 });

  const folder = url.searchParams.get('folder');
  const note = url.searchParams.get('note');
  const list = url.searchParams.get('list');

  if (list && folder != null) {
    try {
      const dir = safeJoin(vault, folder);
      const entries = await fs.readdir(dir);
      return NextResponse.json({ notes: entries.filter((f) => f.toLowerCase().endsWith('.md')).sort() });
    } catch {
      return NextResponse.json({ notes: [] });
    }
  }

  if (note && folder != null) {
    try {
      const content = await fs.readFile(safeJoin(vault, folder, note), 'utf8');
      return NextResponse.json({ content });
    } catch {
      return NextResponse.json({ content: null });
    }
  }

  const templatesFolder = url.searchParams.get('templates') || 'Templates';
  const fileName = url.searchParams.get('file') || 'Backtesting ASR Template.md';
  try {
    const file = safeJoin(vault, templatesFolder, fileName);
    const template = await fs.readFile(file, 'utf8');
    return NextResponse.json({ template });
  } catch {
    return NextResponse.json({ template: null });
  }
}

// POST writes the note + decodes each base64 PNG under the attachments folder.
export async function POST(request: Request): Promise<Response> {
  let body: {
    vaultPath?: string;
    folder?: string; // target folder (ASR or Forecast); falls back to backtestFolder
    backtestFolder?: string;
    attachmentsSubfolder?: string;
    filename?: string;
    markdown?: string;
    images?: { name: string; dataUrl: string }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const { vaultPath, attachmentsSubfolder = 'attachments', filename, markdown, images } = body;
  const folder = body.folder ?? body.backtestFolder ?? '';
  if (!vaultPath || !filename || typeof markdown !== 'string') {
    return NextResponse.json({ error: 'vaultPath, filename and markdown are required' }, { status: 400 });
  }

  try {
    const folderAbs = safeJoin(vaultPath, folder);
    await fs.mkdir(folderAbs, { recursive: true });
    const noteAbs = safeJoin(folderAbs, filename);
    await fs.writeFile(noteAbs, markdown, 'utf8');

    if (Array.isArray(images) && images.length) {
      const attDir = safeJoin(folderAbs, attachmentsSubfolder);
      await fs.mkdir(attDir, { recursive: true });
      for (const img of images) {
        if (!img?.name || typeof img.dataUrl !== 'string') continue;
        const b64 = img.dataUrl.replace(/^data:image\/\w+;base64,/, '');
        await fs.writeFile(safeJoin(attDir, img.name), Buffer.from(b64, 'base64'));
      }
    }

    return NextResponse.json({ ok: true, path: path.join(folder, filename) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
