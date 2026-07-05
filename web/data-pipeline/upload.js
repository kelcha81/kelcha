import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { Storage } from '@google-cloud/storage';

// Durable publish of a packaged symbol to the candles bucket via the GCS SDK
// (not gcsfuse). Each object upload is atomic — the object appears only once it
// fully lands — and manifest.json is uploaded LAST, after every chunk is
// confirmed up. So a mid-publish failure leaves the previous manifest (and thus
// the previous consistent view) in place: the charts keep serving the old data
// instead of a manifest that points at half-written files.

const storage = new Storage();

/** List every file under `dir` as bucket-relative POSIX paths. */
async function listFiles(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath ?? e.path, e.name)).split(sep).join('/'));
}

async function withRetry(label, fn, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts) throw new Error(`${label} failed after ${attempts} attempts: ${err?.message ?? err}`);
      await new Promise((r) => setTimeout(r, 500 * i));
    }
  }
}

/** Bounded-concurrency map. */
async function mapLimit(items, limit, fn) {
  const results = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Upload a symbol's locally-packaged directory to gs://<bucket>/<symbol>/.
 * Chunks/aggregates go up first (parallel, retried); manifest.json goes last.
 * Returns the number of files uploaded.
 */
export async function uploadSymbol(symbol, localDir, bucketName) {
  const bucket = storage.bucket(bucketName);
  const all = await listFiles(localDir);
  const manifest = all.filter((f) => f === 'manifest.json');
  const data = all.filter((f) => f !== 'manifest.json');
  if (!manifest.length) throw new Error(`${symbol}: no manifest.json in ${localDir}`);

  const put = (rel) =>
    withRetry(`upload ${symbol}/${rel}`, () =>
      bucket.upload(join(localDir, rel), {
        destination: `${symbol}/${rel}`,
        resumable: false,
        contentType: 'application/json'
      })
    );

  await mapLimit(data, 8, put); // all chunks + whole files first
  await put('manifest.json'); // publish last — the atomic swap of the view
  return all.length;
}
