import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Run the existing forex-backtest pipeline server-side and stream progress as SSE.
// Spawns the standalone scripts (keeps forex-backtest decoupled, no bundling of
// dukascopy-node into the app). Node runtime + dynamic for child_process + streaming.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let busy = false; // one packaging job at a time

export async function POST(request: Request) {
  if (busy) {
    return Response.json({ error: 'A packaging job is already running' }, { status: 409 });
  }
  const { symbol, instrumentCode, pricePrecision, from, to } = await request.json();
  if (!symbol) {
    return Response.json({ error: 'symbol is required' }, { status: 400 });
  }
  // basic shape guard for the optional date range passed to download.js
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const fromArg = typeof from === 'string' && dateRe.test(from) ? from : '2022-01-01';
  const toArg = typeof to === 'string' && dateRe.test(to) ? to : '2025-12-31';

  const cwd = path.join(process.cwd(), 'data-pipeline');
  const encoder = new TextEncoder();
  busy = true;

  // Persist the run so it can be reviewed after the SSE stream is gone.
  const logFile = path.join(process.cwd(), 'logs', 'packaging.log');
  const append = (line: string) =>
    fs
      .mkdir(path.dirname(logFile), { recursive: true })
      .then(() => fs.appendFile(logFile, `${new Date().toISOString()} [${symbol}] ${line}\n`))
      .catch(() => {});

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        const d = data as { label?: string; line?: string; error?: string };
        if (event === 'stage') append(`-- ${d.label} --`);
        else if (event === 'log') append(d.line ?? '');
        else if (event === 'error') append(`ERROR ${d.error}`);
        else if (event === 'done') append('done');
      };

      const step = (label: string, args: string[]) =>
        new Promise<void>((resolve, reject) => {
          send('stage', { label });
          const child = spawn('node', args, { cwd });
          const onData = (buf: Buffer) => {
            for (const line of buf.toString().split('\n')) {
              const t = line.trim();
              if (t) send('log', { line: t });
            }
          };
          child.stdout.on('data', onData);
          child.stderr.on('data', onData);
          child.on('error', reject);
          child.on('close', (code) =>
            code === 0 ? resolve() : reject(new Error(`${label} failed (exit ${code})`))
          );
        });

      try {
        await step('Downloading', ['download.js', symbol, instrumentCode || symbol, fromArg, toArg]);
        await step('Packaging', ['package-data.js', symbol, String(pricePrecision ?? 5)]);
        send('done', { ok: true });
      } catch (e) {
        send('error', { error: e instanceof Error ? e.message : String(e) });
      } finally {
        busy = false;
        controller.close();
      }
    },
    cancel() {
      busy = false;
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    }
  });
}
