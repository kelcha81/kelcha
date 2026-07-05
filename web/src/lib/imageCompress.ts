// Compress a data URL (typically a chart PNG screenshot) into a smaller JPEG
// data URL for ephemeral draft storage — Firestore docs cap at ~1MB, and a full
// chart PNG can approach that. Downscales to `maxWidth` and re-encodes as JPEG.
// Runs in the browser (uses <canvas>); returns the original on any failure.
export async function compressDataUrl(dataUrl: string, maxWidth = 1280, quality = 0.7): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, maxWidth / (img.width || maxWidth));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.fillStyle = '#000'; // flatten transparency (JPEG has no alpha)
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return dataUrl;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
